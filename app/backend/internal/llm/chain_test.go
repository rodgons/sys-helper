package llm_test

import (
	"context"
	"errors"
	"iter"
	"net/http"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"sys-helper/backend/internal/llm"
)

// scripted yields its events after an optional delay, then an optional error.
type scripted struct {
	delay  time.Duration
	events []string
	err    error
}

func (s scripted) Stream(ctx context.Context, _ llm.Request) iter.Seq2[llm.Event, error] {
	return func(yield func(llm.Event, error) bool) {
		select {
		case <-time.After(s.delay):
		case <-ctx.Done():
			yield(llm.Event{}, ctx.Err())
			return
		}
		for _, e := range s.events {
			if !yield(llm.Event{Text: e}, nil) {
				return
			}
		}
		if s.err != nil {
			yield(llm.Event{}, s.err)
		}
	}
}

// list is a fixed model list that records demotions.
type list struct {
	models  []string
	mu      sync.Mutex
	demoted []string
}

func (l *list) Models() []string { return slices.Clone(l.models) }

func (l *list) Demote(model string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.demoted = append(l.demoted, model)
}

// chain builds a Chain over the scripted models, in order, and records which ones it called.
func chain(models map[string]scripted, order ...string) (*llm.Chain, *list, *[]string) {
	var mu sync.Mutex
	var called []string
	l := &list{models: order}
	return &llm.Chain{
		Models: l,
		Client: func(model string) llm.ChatModel {
			mu.Lock()
			called = append(called, model)
			mu.Unlock()
			return models[model]
		},
		FirstEventTimeout: 50 * time.Millisecond,
	}, l, &called
}

// run streams req and returns the text, the model each event named, and the error.
func run(m llm.ChatModel, req llm.Request) (string, []string, error) {
	var b strings.Builder
	var models []string
	for ev, err := range m.Stream(context.Background(), req) {
		if err != nil {
			return b.String(), models, err
		}
		b.WriteString(ev.Text)
		models = append(models, ev.Model)
	}
	return b.String(), models, nil
}

func TestChain(t *testing.T) {
	t.Run("uses the first model when it answers in time, and names it on each event", func(t *testing.T) {
		c, l, called := chain(map[string]scripted{
			"a": {events: []string{"first ", "here"}},
			"b": {events: []string{"second"}},
		}, "a", "b")

		got, models, err := run(c, llm.Request{})
		if err != nil || got != "first here" || !slices.Equal(models, []string{"a", "a"}) {
			t.Fatalf("got %q from %v, %v", got, models, err)
		}
		if !slices.Equal(*called, []string{"a"}) || len(l.demoted) != 0 {
			t.Errorf("called %v, demoted %v", *called, l.demoted)
		}
	})

	t.Run("moves on, and demotes, when a model is slow to start", func(t *testing.T) {
		c, l, _ := chain(map[string]scripted{
			"a": {delay: time.Second, events: []string{"first"}},
			"b": {events: []string{"second"}},
		}, "a", "b")

		start := time.Now()
		got, models, err := run(c, llm.Request{})
		if err != nil || got != "second" || models[0] != "b" {
			t.Fatalf("got %q from %v, %v", got, models, err)
		}
		if time.Since(start) > 500*time.Millisecond {
			t.Errorf("waited %v for the slow model", time.Since(start))
		}
		if !slices.Equal(l.demoted, []string{"a"}) {
			t.Errorf("demoted %v", l.demoted)
		}
	})

	t.Run("moves on when a model fails or answers nothing before starting", func(t *testing.T) {
		c, l, called := chain(map[string]scripted{
			"a": {err: &llm.HTTPError{Model: "a", Status: http.StatusTooManyRequests}}, // a provider's limit
			"b": {},                                                                    // an empty reply
			"c": {err: errors.New("stream error 502")},                                 // an error chunk
			"d": {events: []string{"fourth"}},
		}, "a", "b", "c", "d")

		got, _, err := run(c, llm.Request{})
		if err != nil || got != "fourth" {
			t.Fatalf("got %q, %v", got, err)
		}
		if !slices.Equal(*called, []string{"a", "b", "c", "d"}) || !slices.Equal(l.demoted, []string{"a", "b", "c"}) {
			t.Errorf("called %v, demoted %v", *called, l.demoted)
		}
	})

	t.Run("never abandons a model that has started answering", func(t *testing.T) {
		c, _, called := chain(map[string]scripted{
			"a": {events: []string{"half"}, err: errors.New("connection reset")},
			"b": {events: []string{"second"}},
		}, "a", "b")

		got, _, err := run(c, llm.Request{})
		if err == nil || got != "half" || !slices.Equal(*called, []string{"a"}) {
			t.Fatalf("got %q, %v (called %v)", got, err, *called)
		}
	})

	t.Run("stops when the account's free quota is used up", func(t *testing.T) {
		c, l, called := chain(map[string]scripted{
			"a": {err: &llm.HTTPError{Model: "a", Status: http.StatusTooManyRequests, AccountLimited: true}},
			"b": {events: []string{"second"}},
		}, "a", "b")

		_, _, err := run(c, llm.Request{})
		if !errors.Is(err, llm.ErrExhausted) || !slices.Equal(*called, []string{"a"}) || len(l.demoted) != 0 {
			t.Fatalf("err = %v, called %v, demoted %v", err, *called, l.demoted)
		}
	})

	t.Run("stops on errors no other model would fix", func(t *testing.T) {
		for _, status := range []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusPaymentRequired} {
			c, _, called := chain(map[string]scripted{
				"a": {err: &llm.HTTPError{Model: "a", Status: status}},
				"b": {events: []string{"second"}},
			}, "a", "b")

			_, _, err := run(c, llm.Request{})
			var httpErr *llm.HTTPError
			if !errors.As(err, &httpErr) || errors.Is(err, llm.ErrExhausted) || len(*called) != 1 {
				t.Errorf("HTTP %d: err = %v, called %v", status, err, *called)
			}
		}
	})

	t.Run("reports exhaustion when every model fails, or there are none", func(t *testing.T) {
		c, _, _ := chain(map[string]scripted{"a": {err: errors.New("down")}, "b": {err: errors.New("down")}}, "a", "b")
		if _, _, err := run(c, llm.Request{}); !errors.Is(err, llm.ErrExhausted) {
			t.Errorf("all failing: err = %v", err)
		}

		empty, _, _ := chain(nil)
		if _, _, err := run(empty, llm.Request{}); !errors.Is(err, llm.ErrExhausted) {
			t.Errorf("no models: err = %v", err)
		}
	})

	t.Run("tries at most MaxAttempts models", func(t *testing.T) {
		c, _, called := chain(map[string]scripted{"a": {err: errors.New("down")}, "b": {err: errors.New("down")}, "c": {events: []string{"x"}}}, "a", "b", "c")
		c.MaxAttempts = 2

		if _, _, err := run(c, llm.Request{}); !errors.Is(err, llm.ErrExhausted) || len(*called) != 2 {
			t.Fatalf("err = %v, called %v", err, *called)
		}
	})

	t.Run("tries the models a request avoids last", func(t *testing.T) {
		c, _, called := chain(map[string]scripted{"a": {events: []string{"a"}}, "b": {events: []string{"b"}}}, "a", "b")

		got, _, err := run(c, llm.Request{Avoid: []string{"a"}})
		if err != nil || got != "b" || !slices.Equal(*called, []string{"b"}) {
			t.Fatalf("got %q, %v (called %v)", got, err, *called)
		}
	})

	t.Run("spends the budget before each attempt and stops when it runs out", func(t *testing.T) {
		c, _, called := chain(map[string]scripted{"a": {err: errors.New("down")}, "b": {events: []string{"b"}}}, "a", "b")
		limit := errors.New("budget spent")
		spent := 0
		c.Budget = func(context.Context) error {
			if spent == 1 {
				return limit
			}
			spent++
			return nil
		}

		if _, _, err := run(c, llm.Request{}); !errors.Is(err, limit) || !slices.Equal(*called, []string{"a"}) {
			t.Fatalf("err = %v, called %v", err, *called)
		}
	})
}

func TestFake(t *testing.T) {
	got, models, err := run(llm.Fake{}, llm.Request{})
	if err != nil || !strings.Contains(got, "fake") || models[0] != "fake" {
		t.Fatalf("got %q from %v, %v", got, models, err)
	}
}

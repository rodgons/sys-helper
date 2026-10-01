package llm_test

import (
	"context"
	"errors"
	"iter"
	"strings"
	"testing"
	"time"

	"sys-helper/backend/internal/llm"
)

// scripted yields its events after an optional delay, then an optional error.
type scripted struct {
	delay  time.Duration
	events []string
	err    error
	called *bool
}

func (s scripted) Stream(ctx context.Context, _ llm.Request) iter.Seq2[llm.Event, error] {
	return func(yield func(llm.Event, error) bool) {
		if s.called != nil {
			*s.called = true
		}
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

func text(t *testing.T, m llm.ChatModel) (string, error) {
	t.Helper()
	var b strings.Builder
	for ev, err := range m.Stream(context.Background(), llm.Request{}) {
		if err != nil {
			return b.String(), err
		}
		b.WriteString(ev.Text)
	}
	return b.String(), nil
}

func TestFallback(t *testing.T) {
	const timeout = 50 * time.Millisecond

	t.Run("uses the primary model when it answers in time", func(t *testing.T) {
		var secondaryCalled bool
		m := llm.Fallback{
			Primary:           scripted{events: []string{"primary ", "here"}},
			Secondary:         scripted{events: []string{"secondary"}, called: &secondaryCalled},
			FirstEventTimeout: timeout,
		}

		got, err := text(t, m)
		if err != nil || got != "primary here" || secondaryCalled {
			t.Fatalf("got %q, %v (secondary called: %v)", got, err, secondaryCalled)
		}
	})

	t.Run("switches to the secondary when the primary is slow to start", func(t *testing.T) {
		m := llm.Fallback{
			Primary:           scripted{delay: time.Second, events: []string{"primary"}},
			Secondary:         scripted{events: []string{"secondary"}},
			FirstEventTimeout: timeout,
		}

		start := time.Now()
		got, err := text(t, m)
		if err != nil || got != "secondary" {
			t.Fatalf("got %q, %v", got, err)
		}
		if time.Since(start) > 500*time.Millisecond {
			t.Errorf("waited %v for the slow primary", time.Since(start))
		}
	})

	t.Run("switches to the secondary when the primary fails before answering", func(t *testing.T) {
		m := llm.Fallback{
			Primary:           scripted{err: errors.New("HTTP 503")},
			Secondary:         scripted{events: []string{"secondary"}},
			FirstEventTimeout: timeout,
		}

		if got, err := text(t, m); err != nil || got != "secondary" {
			t.Fatalf("got %q, %v", got, err)
		}
	})

	t.Run("does not switch once the primary has started answering", func(t *testing.T) {
		var secondaryCalled bool
		m := llm.Fallback{
			Primary:           scripted{events: []string{"half"}, err: errors.New("connection reset")},
			Secondary:         scripted{events: []string{"secondary"}, called: &secondaryCalled},
			FirstEventTimeout: timeout,
		}

		got, err := text(t, m)
		if err == nil || got != "half" || secondaryCalled {
			t.Fatalf("got %q, %v (secondary called: %v)", got, err, secondaryCalled)
		}
	})
}

func TestFake(t *testing.T) {
	got, err := text(t, llm.Fake{})
	if err != nil || !strings.Contains(got, "fake") {
		t.Fatalf("got %q, %v", got, err)
	}
}

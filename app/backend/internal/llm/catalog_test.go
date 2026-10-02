package llm_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"sys-helper/backend/internal/llm"
)

// model renders one entry of OpenRouter's GET /models, a free tool-calling model unless changed.
type model struct {
	id                        string
	prompt, completion        string
	params                    string
	context, completionTokens int
	outputs                   string
	expires                   string
	created                   int64
	agentic, coding           string
}

func (m model) json() string {
	prompt, completion := or(m.prompt, "0"), or(m.completion, "0")
	expires := "null"
	if m.expires != "" {
		expires = `"` + m.expires + `"`
	}
	completionTokens := "null"
	if m.completionTokens > 0 {
		completionTokens = fmt.Sprint(m.completionTokens)
	}
	ctx := m.context
	if ctx == 0 {
		ctx = 131072
	}
	return fmt.Sprintf(`{"id":%q,"created":%d,"context_length":%d,
		"architecture":{"output_modalities":[%s]},
		"pricing":{"prompt":%q,"completion":%q},
		"top_provider":{"context_length":%d,"max_completion_tokens":%s},
		"supported_parameters":[%s],"expiration_date":%s,
		"benchmarks":{"artificial_analysis":{"agentic_index":%s,"coding_index":%s}}}`,
		m.id, m.created, ctx, or(m.outputs, `"text"`), prompt, completion, ctx, completionTokens,
		or(m.params, `"max_tokens","tools","tool_choice"`), expires, or(m.agentic, "null"), or(m.coding, "null"))
}

func or(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

// openRouter serves the given models on /models and counts the calls; fail makes it answer 500.
func openRouter(t *testing.T, fail *atomic.Bool, models ...model) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/models" || r.Header.Get("Authorization") != "Bearer key" {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		if fail != nil && fail.Load() {
			http.Error(w, "down", http.StatusInternalServerError)
			return
		}
		entries := make([]string, len(models))
		for i, m := range models {
			entries[i] = m.json()
		}
		fmt.Fprintf(w, `{"data":[%s],"links":{"next":null}}`, strings.Join(entries, ","))
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func TestCatalog(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)

	t.Run("keeps only free models that can call tools with enough context", func(t *testing.T) {
		srv, _ := openRouter(t, nil,
			model{id: "good/a:free"},
			model{id: "paid/b", prompt: "0.000001", completion: "0.000002"},
			model{id: "stealth/c"},                                     // zero-priced but not :free
			model{id: "priced/d:free", completion: "0.0001"},           // :free suffix but priced
			model{id: "notools/e:free", params: `"max_tokens"`},        // can't call propose_changes
			model{id: "small/f:free", context: 32768},                  // too little context
			model{id: "short/g:free", completionTokens: 2048},          // can't write a full reply
			model{id: "music/h:free", outputs: `"audio"`},              // no text out
			model{id: "gone/i:free", expires: "2026-10-01"},            // expired yesterday
			model{id: "leaving/j:free", expires: "2026-10-09"},         // still live
			model{id: "roomy/k:free", completionTokens: 65536},         // explicit room is fine
			model{id: "router/free", params: `"tools"`, context: 1000}, // the random router
		)
		c := &llm.Catalog{BaseURL: srv.URL, APIKey: "key", Now: func() time.Time { return now }}

		if err := c.Refresh(ctx); err != nil {
			t.Fatal(err)
		}
		got := c.Models()
		slices.Sort(got)
		want := []string{"good/a:free", "leaving/j:free", "roomy/k:free"}
		if !slices.Equal(got, want) {
			t.Errorf("models = %v, want %v", got, want)
		}
	})

	t.Run("ranks by agentic, then coding benchmark, then recency, then context", func(t *testing.T) {
		srv, _ := openRouter(t, nil,
			model{id: "old-unrated:free", created: 100},
			model{id: "new-unrated:free", created: 200},
			model{id: "new-unrated-big:free", created: 200, context: 262144},
			model{id: "agentic-40:free", agentic: "40", created: 1},
			model{id: "agentic-55:free", agentic: "55", created: 1},
			model{id: "agentic-55-coder:free", agentic: "55", coding: "60", created: 1},
		)
		c := &llm.Catalog{BaseURL: srv.URL, APIKey: "key"}

		if err := c.Refresh(ctx); err != nil {
			t.Fatal(err)
		}
		want := []string{"agentic-55-coder:free", "agentic-55:free", "agentic-40:free",
			"new-unrated-big:free", "new-unrated:free", "old-unrated:free"}
		if got := c.Models(); !slices.Equal(got, want) {
			t.Errorf("models = %v, want %v", got, want)
		}
	})

	t.Run("leaves out excluded models", func(t *testing.T) {
		srv, _ := openRouter(t, nil, model{id: "a:free"}, model{id: "b:free"})
		c := &llm.Catalog{BaseURL: srv.URL, APIKey: "key", Exclude: []string{"a:free"}}

		if err := c.Refresh(ctx); err != nil {
			t.Fatal(err)
		}
		if got := c.Models(); !slices.Equal(got, []string{"b:free"}) {
			t.Errorf("models = %v", got)
		}
	})

	t.Run("pinned models skip discovery and keep their order", func(t *testing.T) {
		srv, calls := openRouter(t, nil, model{id: "a:free"})
		c := &llm.Catalog{BaseURL: srv.URL, APIKey: "key", Pinned: []string{"z:free", "y:free"}}

		if err := c.Refresh(ctx); err != nil {
			t.Fatal(err)
		}
		if got := c.Models(); !slices.Equal(got, []string{"z:free", "y:free"}) || calls.Load() != 0 {
			t.Errorf("models = %v after %d calls to /models", got, calls.Load())
		}
	})

	t.Run("keeps the last good list when a refresh fails", func(t *testing.T) {
		var fail atomic.Bool
		srv, _ := openRouter(t, &fail, model{id: "a:free"})
		c := &llm.Catalog{BaseURL: srv.URL, APIKey: "key"}
		if err := c.Refresh(ctx); err != nil {
			t.Fatal(err)
		}

		fail.Store(true)
		if err := c.Refresh(ctx); err == nil {
			t.Fatal("expected the failed refresh to report an error")
		}
		if got := c.Models(); !slices.Equal(got, []string{"a:free"}) {
			t.Errorf("models = %v, want the last good list", got)
		}
	})

	t.Run("moves a demoted model to the back for a while", func(t *testing.T) {
		srv, _ := openRouter(t, nil, model{id: "a:free", created: 3}, model{id: "b:free", created: 2}, model{id: "c:free", created: 1})
		clock := now
		c := &llm.Catalog{BaseURL: srv.URL, APIKey: "key", Now: func() time.Time { return clock }}
		if err := c.Refresh(ctx); err != nil {
			t.Fatal(err)
		}

		c.Demote("a:free")
		if got := c.Models(); !slices.Equal(got, []string{"b:free", "c:free", "a:free"}) {
			t.Errorf("after demotion: %v", got)
		}
		clock = clock.Add(llm.DemotionPeriod + time.Second)
		if got := c.Models(); !slices.Equal(got, []string{"a:free", "b:free", "c:free"}) {
			t.Errorf("after the demotion period: %v", got)
		}
	})

	t.Run("refreshes periodically and retries sooner while it has no list", func(t *testing.T) {
		var fail atomic.Bool
		fail.Store(true)
		srv, calls := openRouter(t, &fail, model{id: "a:free"})
		c := &llm.Catalog{BaseURL: srv.URL, APIKey: "key", RetryInterval: 10 * time.Millisecond}
		ctx, cancel := context.WithCancel(ctx)
		defer cancel()

		go c.Run(ctx, time.Hour)
		waitFor(t, func() bool { return calls.Load() >= 2 }) // retried after the first failure
		fail.Store(false)
		waitFor(t, func() bool { return len(c.Models()) == 1 })
		settled := calls.Load()
		time.Sleep(50 * time.Millisecond)
		if calls.Load() != settled {
			t.Errorf("kept fetching (%d → %d calls) after a good list, before the refresh interval", settled, calls.Load())
		}
	})
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not met in time")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

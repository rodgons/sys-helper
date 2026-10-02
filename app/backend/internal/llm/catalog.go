package llm

import (
	"cmp"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"
)

const (
	// MinContext is the smallest context window a model needs: the system prompt carries the
	// canvas and up to 24k characters of knowledge, plus 30 Messages of history.
	MinContext = 64 << 10
	// MinCompletionTokens matches the assistant's MaxTokens, so a model can finish a reply.
	MinCompletionTokens = 4096
	// DemotionPeriod is how long a model that just failed waits at the back of the list.
	DemotionPeriod = 10 * time.Minute
)

// Catalog is the list of free OpenRouter models the assistant may use, best first. It discovers
// them from GET /models (Refresh, Run), unless Pinned names them. Models that fail are demoted
// to the back of the list for DemotionPeriod. Safe for concurrent use.
type Catalog struct {
	BaseURL string
	APIKey  string
	// Exclude lists model ids never to use. Pinned, when set, is the list itself, in order, and
	// discovery is skipped.
	Exclude []string
	Pinned  []string
	// RetryInterval is how soon Run fetches again while it has no list yet (default one minute).
	RetryInterval time.Duration
	// HTTP defaults to http.DefaultClient, and Now to time.Now.
	HTTP *http.Client
	Now  func() time.Time

	mu      sync.Mutex
	models  []string
	demoted map[string]time.Time // model → when its demotion ends
}

// Models returns the model ids to try, best first, with currently demoted ones moved to the back.
func (c *Catalog) Models() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	models := c.models
	if len(c.Pinned) > 0 {
		models = c.Pinned
	}
	now := c.now()
	var healthy, demoted []string
	for _, m := range models {
		if c.demoted[m].After(now) {
			demoted = append(demoted, m)
		} else {
			healthy = append(healthy, m)
		}
	}
	return append(healthy, demoted...)
}

// Demote moves model to the back of the list for DemotionPeriod.
func (c *Catalog) Demote(model string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.demoted == nil {
		c.demoted = map[string]time.Time{}
	}
	c.demoted[model] = c.now().Add(DemotionPeriod)
}

// Run refreshes the list now and then every interval until ctx ends. While it has no list it
// retries every RetryInterval instead. A failed refresh keeps the last good list.
func (c *Catalog) Run(ctx context.Context, interval time.Duration) {
	if len(c.Pinned) > 0 {
		return
	}
	retry := cmp.Or(c.RetryInterval, time.Minute)
	for {
		wait := interval
		if err := c.Refresh(ctx); err != nil {
			slog.WarnContext(ctx, "could not refresh the free model list", "error", err)
		}
		if len(c.Models()) == 0 {
			wait = retry
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

// openRouterModel is the part of a GET /models entry that eligibility and ranking read.
type openRouterModel struct {
	ID            string `json:"id"`
	Created       int64  `json:"created"`
	ContextLength int    `json:"context_length"`
	Architecture  struct {
		OutputModalities []string `json:"output_modalities"`
	} `json:"architecture"`
	Pricing struct {
		Prompt     string `json:"prompt"`
		Completion string `json:"completion"`
	} `json:"pricing"`
	TopProvider struct {
		MaxCompletionTokens *int `json:"max_completion_tokens"`
	} `json:"top_provider"`
	SupportedParameters []string `json:"supported_parameters"`
	ExpirationDate      *string  `json:"expiration_date"`
	Benchmarks          struct {
		ArtificialAnalysis struct {
			AgenticIndex *float64 `json:"agentic_index"`
			CodingIndex  *float64 `json:"coding_index"`
		} `json:"artificial_analysis"`
	} `json:"benchmarks"`
}

// Refresh fetches the model list and keeps the eligible free models, ranked. On failure the
// previous list stays.
func (c *Catalog) Refresh(ctx context.Context) error {
	if len(c.Pinned) > 0 {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.BaseURL, "/")+"/models", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	client := c.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("list models: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		detail, _ := io.ReadAll(io.LimitReader(res.Body, 2<<10))
		return fmt.Errorf("list models: HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(detail)))
	}
	var page struct {
		Data  []openRouterModel `json:"data"`
		Links struct {
			Next *string `json:"next"`
		} `json:"links"`
	}
	if err := json.NewDecoder(res.Body).Decode(&page); err != nil {
		return fmt.Errorf("list models: %w", err)
	}
	if page.Links.Next != nil && *page.Links.Next != "" {
		// Today one page holds every model; if that changes, later pages are left out.
		slog.WarnContext(ctx, "the model list has more pages; only the first is used", "next", *page.Links.Next)
	}

	var eligible []openRouterModel
	for _, m := range page.Data {
		if c.eligible(m) {
			eligible = append(eligible, m)
		}
	}
	slices.SortStableFunc(eligible, rank)
	models := make([]string, len(eligible))
	for i, m := range eligible {
		models[i] = m.ID
	}
	c.mu.Lock()
	c.models = models
	c.mu.Unlock()
	slog.InfoContext(ctx, "free models", "count", len(models), "models", models)
	return nil
}

// eligible says whether m is free and can serve the assistant: it must stream text, call
// propose_changes, hold the prompt and write a full reply.
func (c *Catalog) eligible(m openRouterModel) bool {
	switch {
	case !strings.HasSuffix(m.ID, ":free") || m.Pricing.Prompt != "0" || m.Pricing.Completion != "0":
		return false
	case !slices.Contains(m.Architecture.OutputModalities, "text"):
		return false
	case !slices.Contains(m.SupportedParameters, "tools"):
		return false
	case m.ContextLength < MinContext:
		return false
	case m.TopProvider.MaxCompletionTokens != nil && *m.TopProvider.MaxCompletionTokens < MinCompletionTokens:
		return false
	case m.ExpirationDate != nil && expired(*m.ExpirationDate, c.now()):
		return false
	case slices.Contains(c.Exclude, m.ID):
		return false
	}
	return true
}

// expired reads an expiration date (a day or a timestamp). An unreadable one counts as live.
func expired(date string, now time.Time) bool {
	for _, layout := range []string{time.DateOnly, time.RFC3339} {
		if t, err := time.Parse(layout, date); err == nil {
			return !t.After(now)
		}
	}
	return false
}

// rank orders models best first: by Artificial Analysis agentic index (tool use), then coding
// index, with unrated models after rated ones; then newest first; then largest context.
func rank(a, b openRouterModel) int {
	aa, ba := a.Benchmarks.ArtificialAnalysis, b.Benchmarks.ArtificialAnalysis
	return cmp.Or(
		descending(aa.AgenticIndex, ba.AgenticIndex),
		descending(aa.CodingIndex, ba.CodingIndex),
		cmp.Compare(b.Created, a.Created),
		cmp.Compare(b.ContextLength, a.ContextLength),
		cmp.Compare(a.ID, b.ID),
	)
}

// descending compares scores highest first, with missing scores last.
func descending(a, b *float64) int {
	switch {
	case a == nil && b == nil:
		return 0
	case a == nil:
		return 1
	case b == nil:
		return -1
	}
	return cmp.Compare(*b, *a)
}

func (c *Catalog) now() time.Time {
	if c.Now != nil {
		return c.Now()
	}
	return time.Now()
}

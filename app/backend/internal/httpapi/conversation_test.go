package httpapi_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"sys-helper/backend/internal/assistant"
	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/httpapi"
	"sys-helper/backend/internal/projects"
	"sys-helper/backend/internal/proposal"
)

// fakeConversations holds octocat's conversation for the suffix k3xa9q2m7p.
type fakeConversations struct {
	msgs []conversation.Message
	full bool // Append refuses with ErrLimit
}

func (f *fakeConversations) List(_ context.Context, userID, suffix string) ([]conversation.Message, error) {
	if userID != octocat.ID || suffix != "k3xa9q2m7p" {
		return nil, projects.ErrNotFound
	}
	return f.msgs, nil
}

func (f *fakeConversations) Append(_ context.Context, userID, suffix string, role conversation.Role, body string) (conversation.Message, error) {
	if userID != octocat.ID || suffix != "k3xa9q2m7p" {
		return conversation.Message{}, projects.ErrNotFound
	}
	if f.full {
		return conversation.Message{}, conversation.ErrLimit
	}
	m := conversation.Message{Role: role, Body: body, CreatedAt: time.Unix(60, 0).UTC()}
	f.msgs = append(f.msgs, m)
	return m, nil
}

type messageJSON struct {
	Role      string `json:"role"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

func TestConversation(t *testing.T) {
	const path = "/api/projects/shop-k3xa9q2m7p/messages"
	newDeps := func() (httpapi.Deps, *fakeConversations) {
		store := &fakeConversations{msgs: []conversation.Message{
			{Role: conversation.RoleAssistant, Body: conversation.WelcomeMessage, CreatedAt: time.Unix(0, 0).UTC()},
		}}
		return httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: everyone, Conversations: store}, store
	}

	t.Run("lists the messages", func(t *testing.T) {
		deps, _ := newDeps()

		msgs := decode[[]messageJSON](t, call(t, deps, http.MethodGet, path, ""))

		if len(msgs) != 1 || msgs[0].Role != "assistant" || msgs[0].Body != conversation.WelcomeMessage {
			t.Errorf("messages = %+v", msgs)
		}
	})

	t.Run("links the pattern of each decision a proposal records", func(t *testing.T) {
		deps, store := newDeps()
		store.msgs = append(store.msgs, conversation.Message{Role: conversation.RoleAssistant, Body: "Here",
			CreatedAt: time.Unix(1, 0).UTC(), Proposal: proposalWithDecisions()})

		msgs := decode[[]struct {
			Proposal struct {
				Changes []map[string]any `json:"changes"`
			} `json:"proposal"`
		}](t, call(t, deps, http.MethodGet, path, ""))

		checkPatternIDs(t, msgs[1].Proposal.Changes)
	})

	t.Run("adds the user's message", func(t *testing.T) {
		deps, store := newDeps()

		rec := call(t, deps, http.MethodPost, path, `{"body":"  A URL shortener  "}`)

		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
		if got := decode[messageJSON](t, rec); got.Role != "user" || got.Body != "A URL shortener" {
			t.Errorf("message = %+v", got)
		}
		if len(store.msgs) != 2 {
			t.Errorf("stored %d messages, want 2", len(store.msgs))
		}
	})

	t.Run("rejects empty, oversized and role-forging messages", func(t *testing.T) {
		deps, store := newDeps()
		for _, body := range []string{
			`{"body":"   "}`,
			`{"body":"` + strings.Repeat("x", conversation.MaxUserMessage+1) + `"}`,
			`{"body":"hi","role":"assistant"}`,
			`nope`,
		} {
			if rec := call(t, deps, http.MethodPost, path, body); rec.Code != http.StatusBadRequest {
				t.Errorf("POST %.40s: status = %d, want 400", body, rec.Code)
			}
		}
		if len(store.msgs) != 1 {
			t.Errorf("stored %d messages, want 1", len(store.msgs))
		}
	})

	t.Run("refuses a message once the conversation is full", func(t *testing.T) {
		deps, store := newDeps()
		store.full = true

		rec := call(t, deps, http.MethodPost, path, `{"body":"one more"}`)

		if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), `"limit_reached"`) {
			t.Errorf("status = %d, body = %s; want 409 limit_reached", rec.Code, rec.Body)
		}
	})

	t.Run("answers 404 for unknown projects", func(t *testing.T) {
		deps, _ := newDeps()
		for _, method := range []string{http.MethodGet, http.MethodPost} {
			rec := call(t, deps, method, "/api/projects/nope-zzzzzzzzzz/messages", `{"body":"hi"}`)
			if rec.Code != http.StatusNotFound {
				t.Errorf("%s: status = %d, want 404", method, rec.Code)
			}
		}
	})
}

// fakeStarter starts New Conversations in octocat's project k3xa9q2m7p.
type fakeStarter struct {
	busy    bool // a reply is in flight
	started bool
}

func (f *fakeStarter) NewConversation(_ context.Context, userID, suffix string) ([]conversation.Message, error) {
	if userID != octocat.ID || suffix != "k3xa9q2m7p" {
		return nil, projects.ErrNotFound
	}
	if f.busy {
		return nil, assistant.ErrBusy
	}
	f.started = true
	return []conversation.Message{{Role: conversation.RoleAssistant, Body: conversation.WelcomeMessage, CreatedAt: time.Unix(0, 0).UTC()}}, nil
}

func TestNewConversation(t *testing.T) {
	const path = "/api/projects/shop-k3xa9q2m7p/conversation"
	newDeps := func() (httpapi.Deps, *fakeStarter) {
		f := &fakeStarter{}
		return httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: everyone, NewConversations: f}, f
	}

	t.Run("starts a new conversation and returns its messages", func(t *testing.T) {
		deps, f := newDeps()

		rec := call(t, deps, http.MethodPost, path, "")

		if rec.Code != http.StatusOK || !f.started {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
		if msgs := decode[[]messageJSON](t, rec); len(msgs) != 1 || msgs[0].Role != "assistant" || msgs[0].Body != conversation.WelcomeMessage {
			t.Errorf("messages = %+v", msgs)
		}
	})

	t.Run("answers 404 for another user's or an unknown project", func(t *testing.T) {
		deps, f := newDeps()

		rec := call(t, deps, http.MethodPost, "/api/projects/nope-zzzzzzzzzz/conversation", "")

		if rec.Code != http.StatusNotFound || decode[map[string]string](t, rec)["error"] != "not_found" || f.started {
			t.Errorf("status = %d, body = %s", rec.Code, rec.Body)
		}
	})

	t.Run("refuses while a reply is being generated", func(t *testing.T) {
		deps, f := newDeps()
		f.busy = true

		rec := call(t, deps, http.MethodPost, path, "")

		if rec.Code != http.StatusConflict || decode[map[string]string](t, rec)["error"] != "busy" {
			t.Errorf("status = %d, body = %s", rec.Code, rec.Body)
		}
	})
}

// proposalWithDecisions records a decision on a catalog Pattern, one on free text, and adds a
// component.
func proposalWithDecisions() *conversation.Proposal {
	name := "Cache"
	return &conversation.Proposal{Seq: 1, Summary: "Add a cache", Status: conversation.ProposalPending, Changes: []proposal.Change{
		{Op: "add_component", Ref: "cache", Type: "cache", Name: &name},
		{Op: "add_decision", Title: "Cache reads", Rationale: "R1", Pattern: "cache aside", Targets: []string{"cache"}},
		{Op: "add_decision", Title: "Redis", Rationale: "R1", Pattern: "Redis cluster", Targets: []string{"cache"}},
	}}
}

// checkPatternIDs checks proposalWithDecisions' changes as JSON: only the decision on a catalog
// Pattern has a patternId, and every pattern is as the model wrote it.
func checkPatternIDs(t *testing.T, changes []map[string]any) {
	t.Helper()
	if len(changes) != 3 {
		t.Fatalf("changes = %v", changes)
	}
	if changes[1]["patternId"] != "cache-aside" || changes[1]["pattern"] != "cache aside" {
		t.Errorf("decision on a Pattern = %v, want patternId cache-aside", changes[1])
	}
	for _, i := range []int{0, 2} {
		if _, ok := changes[i]["patternId"]; ok {
			t.Errorf("change %d = %v, want no patternId", i, changes[i])
		}
	}
	if changes[2]["pattern"] != "Redis cluster" {
		t.Errorf("free-text decision = %v", changes[2])
	}
}

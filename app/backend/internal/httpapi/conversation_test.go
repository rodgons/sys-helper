package httpapi_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/httpapi"
	"sys-helper/backend/internal/projects"
)

// fakeConversations holds octocat's conversation for the suffix k3xa9q2m7p.
type fakeConversations struct{ msgs []conversation.Message }

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
	m := conversation.Message{Role: role, Body: body, CreatedAt: time.Unix(60, 0).UTC()}
	f.msgs = append(f.msgs, m)
	return m, nil
}

func (f *fakeConversations) CountUserMessagesToday(_ context.Context, userID string) (int, error) {
	n := 0
	for _, m := range f.msgs {
		if m.Role == conversation.RoleUser {
			n++
		}
	}
	return n, nil
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
		return httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Conversations: store}, store
	}

	t.Run("lists the messages", func(t *testing.T) {
		deps, _ := newDeps()

		msgs := decode[[]messageJSON](t, call(t, deps, http.MethodGet, path, ""))

		if len(msgs) != 1 || msgs[0].Role != "assistant" || msgs[0].Body != conversation.WelcomeMessage {
			t.Errorf("messages = %+v", msgs)
		}
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

	t.Run("enforces the daily message cap", func(t *testing.T) {
		deps, store := newDeps()
		deps.DailyMessageLimit = 2
		call(t, deps, http.MethodPost, path, `{"body":"one"}`)
		call(t, deps, http.MethodPost, path, `{"body":"two"}`)

		rec := call(t, deps, http.MethodPost, path, `{"body":"three"}`)

		if rec.Code != http.StatusTooManyRequests || decode[map[string]string](t, rec)["error"] != "daily_limit" {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
		if len(store.msgs) != 3 {
			t.Errorf("stored %d messages, want 3", len(store.msgs))
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

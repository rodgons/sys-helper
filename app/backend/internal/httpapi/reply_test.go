package httpapi_test

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"sys-helper/backend/internal/assistant"
	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/httpapi"
	"sys-helper/backend/internal/projects"
)

// fakeReplier streams words and then returns err (if any) for octocat's project k3xa9q2m7p.
type fakeReplier struct {
	words []string
	err   error
}

func (f fakeReplier) Reply(_ context.Context, userID, suffix string, onText func(string)) (conversation.Message, error) {
	if userID != octocat.ID || suffix != "k3xa9q2m7p" {
		return conversation.Message{}, projects.ErrNotFound
	}
	for _, w := range f.words {
		onText(w)
	}
	if f.err != nil {
		return conversation.Message{}, f.err
	}
	return conversation.Message{Role: conversation.RoleAssistant, Body: strings.Join(f.words, ""), CreatedAt: time.Unix(0, 0).UTC()}, nil
}

type sseEvent struct {
	name string
	data map[string]any
}

func readSSE(t *testing.T, body string) []sseEvent {
	t.Helper()
	var events []sseEvent
	var cur sseEvent
	sc := bufio.NewScanner(strings.NewReader(body))
	for sc.Scan() {
		line := sc.Text()
		switch {
		case strings.HasPrefix(line, "event: "):
			cur.name = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &cur.data); err != nil {
				t.Fatalf("bad data line %q: %v", line, err)
			}
		case line == "":
			if cur.name != "" {
				events = append(events, cur)
			}
			cur = sseEvent{}
		}
	}
	return events
}

func TestReply(t *testing.T) {
	const path = "/api/projects/shop-k3xa9q2m7p/reply"
	deps := func(r httpapi.Replier) httpapi.Deps {
		return httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Assistant: r}
	}

	t.Run("streams the reply as server-sent events", func(t *testing.T) {
		rec := call(t, deps(fakeReplier{words: []string{"How many ", "users?"}}), http.MethodPost, path, "")

		if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "text/event-stream" {
			t.Fatalf("status = %d, content type = %q", rec.Code, rec.Header().Get("Content-Type"))
		}
		events := readSSE(t, rec.Body.String())
		if len(events) != 3 || events[0].name != "delta" || events[0].data["text"] != "How many " || events[1].data["text"] != "users?" {
			t.Fatalf("events = %+v", events)
		}
		if events[2].name != "done" || events[2].data["body"] != "How many users?" || events[2].data["role"] != "assistant" {
			t.Errorf("done event = %+v", events[2])
		}
	})

	t.Run("ends the stream with an error event when the model fails midway", func(t *testing.T) {
		rec := call(t, deps(fakeReplier{words: []string{"partial"}, err: errors.New("reset")}), http.MethodPost, path, "")

		events := readSSE(t, rec.Body.String())
		if last := events[len(events)-1]; last.name != "error" || last.data["error"] != "ai_failed" {
			t.Fatalf("events = %+v", events)
		}
	})

	tests := []struct {
		name   string
		err    error
		path   string
		status int
		code   string
	}{
		{"model fails before answering", errors.New("HTTP 500"), path, http.StatusBadGateway, "ai_failed"},
		{"nothing to reply to", assistant.ErrNothingToReply, path, http.StatusConflict, "nothing_to_reply"},
		{"reply already running", assistant.ErrBusy, path, http.StatusConflict, "busy"},
		{"no model configured", assistant.ErrUnavailable, path, http.StatusServiceUnavailable, "ai_unavailable"},
		{"unknown project", nil, "/api/projects/nope-zzzzzzzzzz/reply", http.StatusNotFound, "not_found"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := call(t, deps(fakeReplier{err: tt.err}), http.MethodPost, tt.path, "")

			if rec.Code != tt.status || decode[map[string]string](t, rec)["error"] != tt.code {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
		})
	}
}

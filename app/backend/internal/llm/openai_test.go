package llm_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sys-helper/backend/internal/llm"
)

// sse writes OpenAI-style streaming chunks, then [DONE].
func sse(w http.ResponseWriter, chunks ...string) {
	w.Header().Set("Content-Type", "text/event-stream")
	for _, c := range chunks {
		fmt.Fprintf(w, "data: %s\n\n", c)
	}
	fmt.Fprint(w, "data: [DONE]\n\n")
}

func collect(t *testing.T, m llm.ChatModel, req llm.Request) ([]llm.Event, error) {
	t.Helper()
	var events []llm.Event
	for ev, err := range m.Stream(context.Background(), req) {
		if err != nil {
			return events, err
		}
		events = append(events, ev)
	}
	return events, nil
}

func TestOpenAIClient(t *testing.T) {
	t.Run("sends the request and streams text, reasoning and tool calls", func(t *testing.T) {
		var got map[string]any
		var auth string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/v1/chat/completions" {
				http.NotFound(w, r)
				return
			}
			auth = r.Header.Get("Authorization")
			_ = json.NewDecoder(r.Body).Decode(&got)
			sse(w,
				`{"choices":[{"delta":{"reasoning_content":"thinking"}}]}`,
				`{"choices":[{"delta":{"content":"Hello"}}]}`,
				`{"choices":[{"delta":{"content":" world"}}]}`,
				`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"propose","arguments":"{\"a\":"}}]}}]}`,
				`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}`,
				`{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}`,
			)
		}))
		defer srv.Close()
		client := llm.OpenAIClient{BaseURL: srv.URL + "/v1", APIKey: "key-1", Model: "z-ai/glm-5.3"}

		events, err := collect(t, client, llm.Request{
			Messages: []llm.Message{{Role: llm.RoleSystem, Content: "Be brief"}, {Role: llm.RoleUser, Content: "Hi"}},
			Tools:    []llm.Tool{{Name: "propose", Description: "Propose", Parameters: json.RawMessage(`{"type":"object"}`)}},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if auth != "Bearer key-1" || got["model"] != "z-ai/glm-5.3" || got["stream"] != true {
			t.Errorf("request: auth=%q body=%v", auth, got)
		}
		msgs := got["messages"].([]any)
		if len(msgs) != 2 || msgs[1].(map[string]any)["content"] != "Hi" {
			t.Errorf("messages = %v", msgs)
		}
		if tools := got["tools"].([]any); tools[0].(map[string]any)["function"].(map[string]any)["name"] != "propose" {
			t.Errorf("tools = %v", tools)
		}

		var text, reasoning strings.Builder
		var calls []llm.ToolCall
		for _, ev := range events {
			text.WriteString(ev.Text)
			reasoning.WriteString(ev.Reasoning)
			if ev.ToolCall != nil {
				calls = append(calls, *ev.ToolCall)
			}
		}
		if text.String() != "Hello world" || reasoning.String() != "thinking" {
			t.Errorf("text = %q, reasoning = %q", text.String(), reasoning.String())
		}
		if len(calls) != 1 || calls[0] != (llm.ToolCall{ID: "call_1", Name: "propose", Arguments: `{"a":1}`}) {
			t.Errorf("tool calls = %+v", calls)
		}
	})

	t.Run("keeps whole tool calls apart when they arrive without an index", func(t *testing.T) {
		// Some providers stream each call complete and may leave out "index".
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sse(w, `{"choices":[{"delta":{"tool_calls":[`+
				`{"id":"a","type":"function","function":{"name":"one","arguments":"{}"}},`+
				`{"id":"b","type":"function","function":{"name":"two","arguments":"{\"x\":1}"}}]}}]}`)
		}))
		defer srv.Close()

		events, err := collect(t, llm.OpenAIClient{BaseURL: srv.URL, Model: "m"}, llm.Request{})
		if err != nil {
			t.Fatal(err)
		}
		if len(events) != 2 || events[0].ToolCall.Arguments != "{}" || events[1].ToolCall.Name != "two" || events[1].ToolCall.Arguments != `{"x":1}` {
			t.Errorf("events = %+v", events)
		}
	})

	t.Run("omits tools when there are none", func(t *testing.T) {
		var got map[string]any
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewDecoder(r.Body).Decode(&got)
			sse(w, `{"choices":[{"delta":{"content":"ok"}}]}`)
		}))
		defer srv.Close()

		if _, err := collect(t, llm.OpenAIClient{BaseURL: srv.URL, Model: "m"}, llm.Request{Messages: []llm.Message{{Role: llm.RoleUser, Content: "x"}}}); err != nil {
			t.Fatal(err)
		}
		if _, ok := got["tools"]; ok {
			t.Errorf("tools sent: %v", got["tools"])
		}
	})

	t.Run("reports HTTP errors", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"error":"bad key"}`, http.StatusUnauthorized)
		}))
		defer srv.Close()

		_, err := collect(t, llm.OpenAIClient{BaseURL: srv.URL, Model: "m"}, llm.Request{})
		var httpErr *llm.HTTPError
		if !errors.As(err, &httpErr) || httpErr.Status != http.StatusUnauthorized || !strings.Contains(err.Error(), "401") {
			t.Fatalf("err = %v, want a 401 HTTPError", err)
		}
	})

	t.Run("tells the account's rate limit apart from a model's", func(t *testing.T) {
		// Only OpenRouter's own limits carry X-RateLimit-* headers; an upstream provider's 429 doesn't.
		for _, tc := range []struct {
			name    string
			headers bool
			want    bool
		}{{"account limit", true, true}, {"provider limit", false, false}} {
			t.Run(tc.name, func(t *testing.T) {
				srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if tc.headers {
						w.Header().Set("X-RateLimit-Limit", "50")
						w.Header().Set("X-RateLimit-Remaining", "0")
					}
					http.Error(w, `{"error":{"code":429,"message":"Rate limit exceeded"}}`, http.StatusTooManyRequests)
				}))
				defer srv.Close()

				_, err := collect(t, llm.OpenAIClient{BaseURL: srv.URL, Model: "m"}, llm.Request{})
				var httpErr *llm.HTTPError
				if !errors.As(err, &httpErr) || httpErr.Status != http.StatusTooManyRequests || httpErr.AccountLimited != tc.want {
					t.Fatalf("err = %#v, want a 429 with AccountLimited=%v", err, tc.want)
				}
			})
		}
	})

	t.Run("fails on an error chunk in the stream", func(t *testing.T) {
		// After a 200, OpenRouter reports errors as a chunk with a top-level error, sometimes as the
		// only event.
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/event-stream")
			fmt.Fprint(w, ": OPENROUTER PROCESSING\n\n")
			fmt.Fprint(w, `data: {"error":{"code":502,"message":"Provider returned error"},"choices":[{"delta":{"content":""},"finish_reason":"error"}]}`+"\n\n")
		}))
		defer srv.Close()

		events, err := collect(t, llm.OpenAIClient{BaseURL: srv.URL, Model: "m"}, llm.Request{})
		if err == nil || !strings.Contains(err.Error(), "Provider returned error") || len(events) != 0 {
			t.Fatalf("events = %+v, err = %v, want the provider's error", events, err)
		}
	})

	t.Run("fails when the stream ends without [DONE]", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"cut\"}}]}\n\n")
		}))
		defer srv.Close()

		_, err := collect(t, llm.OpenAIClient{BaseURL: srv.URL, Model: "m"}, llm.Request{})
		if err == nil {
			t.Fatal("expected an error for a truncated stream")
		}
	})
}

package assistant_test

import (
	"context"
	"errors"
	"iter"
	"strings"
	"sync"
	"testing"
	"time"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/assistant"
	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/llm"
	"sys-helper/backend/internal/projects"
)

type fakeConversations struct {
	mu   sync.Mutex
	msgs []conversation.Message
}

func (f *fakeConversations) List(_ context.Context, _, suffix string) ([]conversation.Message, error) {
	if suffix != "s" {
		return nil, projects.ErrNotFound
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]conversation.Message(nil), f.msgs...), nil
}

func (f *fakeConversations) Append(_ context.Context, _, _ string, role conversation.Role, body string) (conversation.Message, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	m := conversation.Message{Role: role, Body: body}
	f.msgs = append(f.msgs, m)
	return m, nil
}

type fakeArchitectures struct{}

func (fakeArchitectures) Get(context.Context, string, string) (architecture.Versioned, error) {
	doc := architecture.Empty()
	doc.Components = append(doc.Components, architecture.Component{ID: "db", Type: "database", Name: "Orders DB"})
	return architecture.Versioned{Version: 2, Document: doc}, nil
}

// model records the request and streams words, optionally failing at the end or blocking.
type model struct {
	words []string
	err   error
	block chan struct{}
	got   *llm.Request
}

func (m model) Stream(_ context.Context, req llm.Request) iter.Seq2[llm.Event, error] {
	return func(yield func(llm.Event, error) bool) {
		if m.got != nil {
			*m.got = req
		}
		if m.block != nil {
			<-m.block
		}
		if !yield(llm.Event{Reasoning: "hidden thoughts"}, nil) {
			return
		}
		for _, w := range m.words {
			if !yield(llm.Event{Text: w}, nil) {
				return
			}
		}
		if m.err != nil {
			yield(llm.Event{}, m.err)
		}
	}
}

func conv(msgs ...string) *fakeConversations {
	f := &fakeConversations{}
	for i, body := range msgs {
		role := conversation.RoleAssistant
		if i%2 == 1 {
			role = conversation.RoleUser
		}
		f.msgs = append(f.msgs, conversation.Message{Role: role, Body: body})
	}
	return f
}

func newAssistant(m llm.ChatModel, c *fakeConversations) *assistant.Assistant {
	return &assistant.Assistant{Model: m, Conversations: c, Architectures: fakeArchitectures{}, HistoryLimit: 4, Timeout: time.Second}
}

func TestReply(t *testing.T) {
	t.Run("streams the reply and saves it once complete", func(t *testing.T) {
		c := conv("Welcome", "A URL shortener")
		var streamed []string

		msg, err := newAssistant(model{words: []string{"How many ", "users?"}}, c).
			Reply(context.Background(), "u", "s", func(s string) { streamed = append(streamed, s) })

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if strings.Join(streamed, "") != "How many users?" || msg.Body != "How many users?" || msg.Role != conversation.RoleAssistant {
			t.Errorf("streamed %q, message %+v", streamed, msg)
		}
		if len(c.msgs) != 3 || c.msgs[2].Body != "How many users?" {
			t.Errorf("stored = %+v", c.msgs)
		}
	})

	t.Run("gives the model its role, the architecture and recent messages", func(t *testing.T) {
		var req llm.Request
		c := conv("Welcome", "one", "two", "three", "four", "five")

		if _, err := newAssistant(model{words: []string{"ok"}, got: &req}, c).Reply(context.Background(), "u", "s", func(string) {}); err != nil {
			t.Fatal(err)
		}

		if req.Messages[0].Role != llm.RoleSystem || !strings.Contains(req.Messages[0].Content, "architect") {
			t.Errorf("first message = %+v", req.Messages[0])
		}
		if !strings.Contains(req.Messages[0].Content, "Orders DB") {
			t.Errorf("system message lacks the architecture: %+v", req.Messages[0])
		}
		history := req.Messages[1:]
		if len(history) != 4 || history[0].Content != "two" || history[3].Content != "five" || history[3].Role != llm.RoleUser {
			t.Errorf("history = %+v", history)
		}
	})

	t.Run("saves nothing when the model fails midway", func(t *testing.T) {
		c := conv("Welcome", "Hi")

		_, err := newAssistant(model{words: []string{"partial"}, err: errors.New("reset")}, c).Reply(context.Background(), "u", "s", func(string) {})

		if err == nil || len(c.msgs) != 2 {
			t.Fatalf("err = %v, stored = %+v", err, c.msgs)
		}
	})

	t.Run("treats an empty reply as a failure", func(t *testing.T) {
		c := conv("Welcome", "Hi")

		if _, err := newAssistant(model{}, c).Reply(context.Background(), "u", "s", func(string) {}); err == nil || len(c.msgs) != 2 {
			t.Fatalf("err = %v, stored = %+v", err, c.msgs)
		}
	})

	t.Run("only replies to a user message", func(t *testing.T) {
		c := conv("Welcome")

		if _, err := newAssistant(model{words: []string{"x"}}, c).Reply(context.Background(), "u", "s", func(string) {}); !errors.Is(err, assistant.ErrNothingToReply) {
			t.Fatalf("err = %v, want ErrNothingToReply", err)
		}
	})

	t.Run("refuses a second reply to the same project while one is running", func(t *testing.T) {
		block := make(chan struct{})
		a := newAssistant(model{words: []string{"x"}, block: block}, conv("Welcome", "Hi"))
		done := make(chan error)
		go func() {
			_, err := a.Reply(context.Background(), "u", "s", func(string) {})
			done <- err
		}()
		time.Sleep(20 * time.Millisecond)

		_, err := a.Reply(context.Background(), "u", "s", func(string) {})
		close(block)

		if !errors.Is(err, assistant.ErrBusy) {
			t.Errorf("second reply: err = %v, want ErrBusy", err)
		}
		if err := <-done; err != nil {
			t.Errorf("first reply: %v", err)
		}
	})

	t.Run("reports when no model is configured", func(t *testing.T) {
		a := newAssistant(nil, conv("Welcome", "Hi"))
		a.Model = nil

		if _, err := a.Reply(context.Background(), "u", "s", func(string) {}); !errors.Is(err, assistant.ErrUnavailable) {
			t.Fatalf("err = %v, want ErrUnavailable", err)
		}
	})

	t.Run("passes not-found through", func(t *testing.T) {
		if _, err := newAssistant(model{}, conv()).Reply(context.Background(), "u", "other", func(string) {}); !errors.Is(err, projects.ErrNotFound) {
			t.Fatalf("err = %v, want ErrNotFound", err)
		}
	})
}

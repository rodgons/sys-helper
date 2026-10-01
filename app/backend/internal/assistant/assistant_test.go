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
	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/llm"
	"sys-helper/backend/internal/projects"
	"sys-helper/backend/internal/proposal"
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

func (f *fakeConversations) AppendReply(_ context.Context, _, _ string, body string, changes *proposal.Changes, base int) (conversation.Message, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	m := conversation.Message{Role: conversation.RoleAssistant, Body: body}
	if changes != nil {
		m.Proposal = &conversation.Proposal{Seq: 1, Summary: changes.Summary, Changes: changes.Changes, Status: conversation.ProposalPending, BaseVersion: base}
	}
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

// fakeKnowledge: a beginner with requirement R1, and decision D1 on "db" needing review.
type fakeKnowledge struct{}

func (fakeKnowledge) Get(context.Context, string, string) (knowledge.Knowledge, error) {
	return knowledge.Knowledge{
		ExperienceLevel: "beginner",
		Requirements:    []knowledge.Requirement{{Num: 1, Category: "scale", Statement: "10k orders per minute"}},
		Decisions: []knowledge.Decision{{Num: 1, Title: "Postgres for orders", Rationale: "ACID", Requirements: []int{1},
			Targets: []string{"db"}, Author: knowledge.AuthorAI, NeedsReview: true}},
	}, nil
}

func newAssistant(m llm.ChatModel, c *fakeConversations) *assistant.Assistant {
	return &assistant.Assistant{Model: m, Conversations: c, Architectures: fakeArchitectures{}, Knowledge: fakeKnowledge{},
		HistoryLimit: 4, Timeout: time.Second}
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
		system := req.Messages[0].Content
		for _, want := range []string{"Orders DB", "R1 [scale] 10k orders per minute", "D1 Postgres for orders", "NEEDS REVIEW", "beginner"} {
			if !strings.Contains(system, want) {
				t.Errorf("system message lacks %q:\n%s", want, system)
			}
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

// turns answers each model call with the next scripted turn: text, then an optional tool call.
type turns struct {
	mu    sync.Mutex
	turns []turn
	reqs  []llm.Request
}

type turn struct {
	text string
	args string // propose_changes arguments; empty for none
}

func (s *turns) Stream(_ context.Context, req llm.Request) iter.Seq2[llm.Event, error] {
	return func(yield func(llm.Event, error) bool) {
		s.mu.Lock()
		s.reqs = append(s.reqs, req)
		t := s.turns[0]
		s.turns = s.turns[1:]
		s.mu.Unlock()
		if t.text != "" && !yield(llm.Event{Text: t.text}, nil) {
			return
		}
		if t.args != "" {
			yield(llm.Event{ToolCall: &llm.ToolCall{ID: "call_1", Name: "propose_changes", Arguments: t.args}}, nil)
		}
	}
}

const validArgs = `{"summary": "Add a cache in front of the database", "changes": [
	{"op": "add_component", "ref": "cache", "type": "cache", "name": "Order Cache"},
	{"op": "add_connection", "source": "cache", "target": "db", "kind": "sync"}]}`

func TestProposals(t *testing.T) {
	t.Run("offers the propose_changes tool", func(t *testing.T) {
		m := &turns{turns: []turn{{text: "ok"}}}
		if _, err := newAssistant(m, conv("Welcome", "Hi")).Reply(context.Background(), "u", "s", func(string) {}); err != nil {
			t.Fatal(err)
		}
		if tools := m.reqs[0].Tools; len(tools) != 1 || tools[0].Name != "propose_changes" {
			t.Errorf("tools = %+v", tools)
		}
	})

	t.Run("saves a valid proposal with the reply, based on the current version", func(t *testing.T) {
		c := conv("Welcome", "Add a cache")

		msg, err := newAssistant(&turns{turns: []turn{{text: "A cache absorbs the reads.", args: validArgs}}}, c).
			Reply(context.Background(), "u", "s", func(string) {})

		if err != nil {
			t.Fatal(err)
		}
		if msg.Body != "A cache absorbs the reads." || msg.Proposal == nil || msg.Proposal.BaseVersion != 2 || len(msg.Proposal.Changes) != 2 {
			t.Fatalf("message = %+v", msg)
		}
	})

	t.Run("uses the summary when the model only calls the tool", func(t *testing.T) {
		msg, err := newAssistant(&turns{turns: []turn{{args: validArgs}}}, conv("Welcome", "Add a cache")).
			Reply(context.Background(), "u", "s", func(string) {})

		if err != nil || msg.Body != "Add a cache in front of the database" || msg.Proposal == nil {
			t.Fatalf("message = %+v, err = %v", msg, err)
		}
	})

	t.Run("lets the model fix an invalid proposal once", func(t *testing.T) {
		bad := `{"summary": "Add a cache", "changes": [{"op": "add_connection", "source": "ghost", "target": "db", "kind": "sync"}]}`
		m := &turns{turns: []turn{{text: "Adding a cache.", args: bad}, {args: validArgs}}}

		msg, err := newAssistant(m, conv("Welcome", "Add a cache")).Reply(context.Background(), "u", "s", func(string) {})

		if err != nil || msg.Proposal == nil || msg.Body != "Adding a cache." {
			t.Fatalf("message = %+v, err = %v", msg, err)
		}
		retry := m.reqs[1].Messages
		toolResult := retry[len(retry)-1]
		if toolResult.Role != llm.RoleTool || toolResult.ToolCallID != "call_1" || !strings.Contains(toolResult.Content, `"ghost"`) {
			t.Errorf("tool result = %+v", toolResult)
		}
		if call := retry[len(retry)-2]; call.Role != llm.RoleAssistant || len(call.ToolCalls) != 1 {
			t.Errorf("assistant tool call = %+v", call)
		}
	})

	t.Run("gives up on proposals that stay invalid, and says so", func(t *testing.T) {
		bad := `{"summary": "x", "changes": []}`
		msg, err := newAssistant(&turns{turns: []turn{{text: "Here goes.", args: bad}, {args: bad}}}, conv("Welcome", "Add a cache")).
			Reply(context.Background(), "u", "s", func(string) {})

		if err != nil || msg.Proposal != nil || !strings.Contains(msg.Body, "couldn't") {
			t.Fatalf("message = %+v, err = %v", msg, err)
		}
	})

	t.Run("tells the model what became of earlier proposals", func(t *testing.T) {
		c := conv("Welcome", "Add a cache")
		c.msgs = append(c.msgs,
			conversation.Message{Role: conversation.RoleAssistant, Body: "Here.", Proposal: &conversation.Proposal{Seq: 1, Summary: "Add a cache", Status: conversation.ProposalRejected}},
			conversation.Message{Role: conversation.RoleUser, Body: "Why?"})
		m := &turns{turns: []turn{{text: "Because."}}}

		if _, err := newAssistant(m, c).Reply(context.Background(), "u", "s", func(string) {}); err != nil {
			t.Fatal(err)
		}
		history := m.reqs[0].Messages
		if got := history[len(history)-2].Content; !strings.Contains(got, "Add a cache") || !strings.Contains(got, "rejected") {
			t.Errorf("assistant history = %q", got)
		}
	})

	t.Run("continues the conversation once the user reviews a proposal", func(t *testing.T) {
		for _, status := range []conversation.ProposalStatus{conversation.ProposalAccepted, conversation.ProposalRejected} {
			c := conv("Welcome", "Add a cache")
			c.msgs = append(c.msgs, conversation.Message{Role: conversation.RoleAssistant, Body: "Here.",
				Proposal: &conversation.Proposal{Seq: 3, Summary: "Add a cache", Status: status}})
			m := &turns{turns: []turn{{text: "Next, availability."}}}

			msg, err := newAssistant(m, c).Reply(context.Background(), "u", "s", func(string) {})

			if err != nil || msg.Body != "Next, availability." {
				t.Fatalf("%s: message = %+v, err = %v", status, msg, err)
			}
			history := m.reqs[0].Messages
			last := history[len(history)-1]
			if last.Role != llm.RoleUser || !strings.Contains(last.Content, "#3") || !strings.Contains(last.Content, string(status)) {
				t.Errorf("%s: last message = %+v", status, last)
			}
		}
	})

	t.Run("doesn't continue after a proposal that is pending or superseded", func(t *testing.T) {
		for _, status := range []conversation.ProposalStatus{conversation.ProposalPending, conversation.ProposalSuperseded} {
			c := conv("Welcome", "Add a cache")
			c.msgs = append(c.msgs, conversation.Message{Role: conversation.RoleAssistant, Body: "Here.",
				Proposal: &conversation.Proposal{Seq: 1, Status: status}})

			if _, err := newAssistant(&turns{turns: []turn{{text: "x"}}}, c).Reply(context.Background(), "u", "s", func(string) {}); !errors.Is(err, assistant.ErrNothingToReply) {
				t.Errorf("%s: err = %v, want ErrNothingToReply", status, err)
			}
		}
	})

	t.Run("after a rejection, only talks: no proposal tool", func(t *testing.T) {
		c := conv("Welcome", "Add a cache")
		c.msgs = append(c.msgs, conversation.Message{Role: conversation.RoleAssistant, Body: "Here.",
			Proposal: &conversation.Proposal{Seq: 1, Summary: "Add a cache", Status: conversation.ProposalRejected}})
		m := &turns{turns: []turn{{text: "What didn't fit?"}}}

		if _, err := newAssistant(m, c).Reply(context.Background(), "u", "s", func(string) {}); err != nil {
			t.Fatal(err)
		}
		if tools := m.reqs[0].Tools; len(tools) != 0 {
			t.Errorf("tools = %+v, want none after a rejection", tools)
		}
	})

	t.Run("after an acceptance, may propose the next step", func(t *testing.T) {
		c := conv("Welcome", "Add a cache")
		c.msgs = append(c.msgs, conversation.Message{Role: conversation.RoleAssistant, Body: "Here.",
			Proposal: &conversation.Proposal{Seq: 1, Summary: "Add a cache", Status: conversation.ProposalAccepted}})
		m := &turns{turns: []turn{{text: "Next."}}}

		if _, err := newAssistant(m, c).Reply(context.Background(), "u", "s", func(string) {}); err != nil {
			t.Fatal(err)
		}
		if tools := m.reqs[0].Tools; len(tools) != 1 {
			t.Errorf("tools = %+v, want propose_changes", tools)
		}
	})

	t.Run("checks in with the user after three proposals in a row", func(t *testing.T) {
		c := conv("Welcome", "Design it")
		for seq := 1; seq <= 3; seq++ {
			c.msgs = append(c.msgs, conversation.Message{Role: conversation.RoleAssistant, Body: "Step.",
				Proposal: &conversation.Proposal{Seq: seq, Summary: "Step", Status: conversation.ProposalAccepted}})
		}
		m := &turns{turns: []turn{{text: "Anything else?"}}}

		if _, err := newAssistant(m, c).Reply(context.Background(), "u", "s", func(string) {}); err != nil {
			t.Fatal(err)
		}
		if tools := m.reqs[0].Tools; len(tools) != 0 {
			t.Errorf("tools = %+v, want none after three proposals without a user message", tools)
		}
	})

	t.Run("validates decisions against the project's requirements", func(t *testing.T) {
		cites := `{"summary": "Explain the DB", "changes": [{"op": "add_decision", "title": "T", "rationale": "R", "targets": ["db"], "requirements": ["R1"]}]}`
		msg, err := newAssistant(&turns{turns: []turn{{text: "Recorded.", args: cites}}}, conv("Welcome", "Why Postgres?")).
			Reply(context.Background(), "u", "s", func(string) {})

		if err != nil || msg.Proposal == nil {
			t.Fatalf("message = %+v, err = %v", msg, err)
		}
	})
}

func TestProposalsTheModelGotWrongInProduction(t *testing.T) {
	// Logged on 2026-10-01: an unnamed component and a decision with its op in `type` (Gemini).
	args := `{"summary":"Add a relational database for storing URL mappings and expiration data.","changes":[
		{"op":"add_component","type":"database","ref":"urls","properties":{"replicas":2,"sharding":false,"engine":"PostgreSQL"}},
		{"kind":"sync","source":"urls","target":"db","op":"add_connection","label":"Read/Write mappings"},
		{"title":"Relational Database for URL Mappings","alternative":"NoSQL document store.","type":"add_decision","targets":["urls"],
		 "rationale":"Stores URL mappings (R1).","category":"scale","pattern":"Primary-Replica relational database"}]}`

	msg, err := newAssistant(&turns{turns: []turn{{text: "Adding a database.", args: args}}}, conv("Welcome", "Add storage")).
		Reply(context.Background(), "u", "s", func(string) {})

	if err != nil || msg.Proposal == nil || len(msg.Proposal.Changes) != 3 {
		t.Fatalf("message = %+v, err = %v", msg, err)
	}
}

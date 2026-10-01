package llm

import (
	"context"
	"iter"
	"strings"
)

// Fake answers without any network call, for E2E tests and offline development (AI_FAKE=1). It
// streams a fixed reply that quotes the last user message and, when that message asks for a
// proposal, also proposes adding an API service in front of a cache.
type Fake struct{}

// FakeProposal is the propose_changes arguments Fake sends.
const FakeProposal = `{"summary": "Add an API service backed by a cache", "changes": [
	{"op": "add_component", "ref": "api", "type": "service", "name": "Fake API", "properties": {"runtime": "Go"}},
	{"op": "add_component", "ref": "cache", "type": "cache", "name": "Fake Cache", "properties": {"engine": "Redis"}},
	{"op": "add_connection", "source": "api", "target": "cache", "kind": "sync", "label": "reads"}]}`

func (Fake) Stream(_ context.Context, req Request) iter.Seq2[Event, error] {
	return func(yield func(Event, error) bool) {
		last := ""
		for _, m := range req.Messages {
			if m.Role == RoleUser {
				last = m.Content
			}
		}
		reply := "This is a fake AI reply (AI_FAKE=1). You said: " + last
		for _, word := range strings.SplitAfter(reply, " ") {
			if !yield(Event{Text: word}, nil) {
				return
			}
		}
		if strings.Contains(strings.ToLower(last), "propose") && len(req.Tools) > 0 {
			yield(Event{ToolCall: &ToolCall{ID: "fake_call", Name: req.Tools[0].Name, Arguments: FakeProposal}}, nil)
		}
	}
}

package llm

import (
	"context"
	"iter"
	"strings"
)

// Fake answers without any network call, for E2E tests and offline development (AI_FAKE=1). It
// streams a fixed reply that quotes the last user message.
type Fake struct{}

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
	}
}

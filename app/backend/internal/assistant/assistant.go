// Package assistant runs one AI turn in a Project's Conversation: it builds the model's context,
// streams the reply, and saves it once it is complete.
package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/llm"
)

var (
	// ErrNothingToReply means the Conversation doesn't end with a User message.
	ErrNothingToReply = errors.New("the conversation has no user message to reply to")
	// ErrBusy means a reply for this Project is already being generated.
	ErrBusy = errors.New("a reply is already in progress")
	// ErrUnavailable means no model is configured.
	ErrUnavailable = errors.New("no AI model is configured")
)

type Assistant struct {
	Model         llm.ChatModel
	Conversations interface {
		List(ctx context.Context, userID, suffix string) ([]conversation.Message, error)
		Append(ctx context.Context, userID, suffix string, role conversation.Role, body string) (conversation.Message, error)
	}
	Architectures interface {
		Get(ctx context.Context, userID, suffix string) (architecture.Versioned, error)
	}
	// HistoryLimit is how many recent Messages the model sees. The Architecture (and later the
	// Requirements and Decisions) carry the long-term memory, so older chat matters less.
	HistoryLimit int
	// Timeout bounds a whole reply.
	Timeout time.Duration

	inFlight sync.Map // userID + suffix → struct{}
}

// Reply answers the Conversation's last User message. onText receives the reply as it streams;
// the reply is saved only if it completes, so a failed reply can simply be retried.
func (a *Assistant) Reply(ctx context.Context, userID, suffix string, onText func(string)) (conversation.Message, error) {
	if a.Model == nil {
		return conversation.Message{}, ErrUnavailable
	}
	key := userID + "/" + suffix
	if _, busy := a.inFlight.LoadOrStore(key, struct{}{}); busy {
		return conversation.Message{}, ErrBusy
	}
	defer a.inFlight.Delete(key)

	msgs, err := a.Conversations.List(ctx, userID, suffix)
	if err != nil {
		return conversation.Message{}, err
	}
	if len(msgs) == 0 || msgs[len(msgs)-1].Role != conversation.RoleUser {
		return conversation.Message{}, ErrNothingToReply
	}
	arch, err := a.Architectures.Get(ctx, userID, suffix)
	if err != nil {
		return conversation.Message{}, err
	}
	req, err := a.request(msgs, arch.Document)
	if err != nil {
		return conversation.Message{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, a.Timeout)
	defer cancel()
	var reply strings.Builder
	for ev, err := range a.Model.Stream(ctx, req) {
		if err != nil {
			return conversation.Message{}, fmt.Errorf("model reply: %w", err)
		}
		if ev.Text != "" {
			reply.WriteString(ev.Text)
			onText(ev.Text)
		}
	}
	body := strings.TrimSpace(reply.String())
	if body == "" {
		return conversation.Message{}, errors.New("model reply: empty")
	}
	// Save even if the client went away mid-stream: the reply is complete and paid for.
	return a.Conversations.Append(context.WithoutCancel(ctx), userID, suffix, conversation.RoleAssistant, body)
}

func (a *Assistant) request(msgs []conversation.Message, doc architecture.Document) (llm.Request, error) {
	canvas, err := json.Marshal(doc)
	if err != nil {
		return llm.Request{}, err
	}
	req := llm.Request{
		MaxTokens: 4096,
		// One system message: some chat templates (e.g. Gemma's) accept only one.
		Messages: []llm.Message{
			{Role: llm.RoleSystem, Content: systemPrompt + "\n\n" + architectureNote + string(canvas)},
		},
	}
	if len(msgs) > a.HistoryLimit {
		msgs = msgs[len(msgs)-a.HistoryLimit:]
	}
	for _, m := range msgs {
		role := llm.RoleAssistant
		if m.Role == conversation.RoleUser {
			role = llm.RoleUser
		}
		req.Messages = append(req.Messages, llm.Message{Role: role, Content: m.Body})
	}
	return req, nil
}

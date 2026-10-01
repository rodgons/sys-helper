// Package llm talks to chat models through one small interface, so the assistant doesn't care
// which provider (or fake) answers.
package llm

import (
	"context"
	"encoding/json"
	"iter"
)

type Role string

const (
	RoleSystem    Role = "system"
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleTool      Role = "tool"
)

type Message struct {
	Role    Role
	Content string
	// ToolCalls are the calls an assistant message made; ToolCallID links a tool result to one.
	ToolCalls  []ToolCall
	ToolCallID string
}

// Tool is a function the model may call. Parameters is a JSON Schema object.
type Tool struct {
	Name        string
	Description string
	Parameters  json.RawMessage
}

type ToolCall struct {
	ID        string
	Name      string
	Arguments string // JSON, as the model produced it
}

type Request struct {
	Messages  []Message
	Tools     []Tool
	MaxTokens int
}

// Event is one piece of a streamed reply: visible text, hidden reasoning, or a complete tool call
// (tool calls are only emitted once fully received).
type Event struct {
	Text      string
	Reasoning string
	ToolCall  *ToolCall
}

// ChatModel streams a reply. The sequence ends after the last event, or yields a non-nil error
// once and stops.
type ChatModel interface {
	Stream(ctx context.Context, req Request) iter.Seq2[Event, error]
}

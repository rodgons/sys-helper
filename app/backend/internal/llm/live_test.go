//go:build live

package llm_test

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/llm"
	"sys-helper/backend/internal/proposal"
)

// Calls the real NVIDIA API: `make test-ai-live` (needs NVIDIA_API_KEY and AI_MODEL). It checks each model
// streams text and makes a tool call, and logs how long the first token took.
func TestLiveModels(t *testing.T) {
	key := os.Getenv("NVIDIA_API_KEY")
	if key == "" {
		t.Fatal("NVIDIA_API_KEY is required")
	}
	// The models configured in .env, or AI_LIVE_MODELS=a,b to try others.
	var models []string
	for _, m := range strings.Split(os.Getenv("AI_LIVE_MODELS"), ",") {
		if m != "" {
			models = append(models, m)
		}
	}
	if len(models) == 0 {
		for _, m := range []string{os.Getenv("AI_MODEL"), os.Getenv("AI_FALLBACK_MODEL")} {
			if m != "" {
				models = append(models, m)
			}
		}
	}
	if len(models) == 0 {
		t.Fatal("set AI_MODEL in .env, or AI_LIVE_MODELS")
	}
	for _, model := range models {
		client := llm.OpenAIClient{BaseURL: "https://integrate.api.nvidia.com/v1", APIKey: key, Model: model}

		t.Run(model+"/streams text", func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			start := time.Now()
			var first time.Duration
			var text strings.Builder
			for ev, err := range client.Stream(ctx, llm.Request{MaxTokens: 512, Messages: []llm.Message{
				{Role: llm.RoleSystem, Content: "Answer in one short sentence."},
				{Role: llm.RoleUser, Content: "What is a load balancer for?"},
			}}) {
				if err != nil {
					t.Fatalf("stream: %v", err)
				}
				if first == 0 && (ev.Text != "" || ev.Reasoning != "") {
					first = time.Since(start)
				}
				text.WriteString(ev.Text)
			}
			t.Logf("first token after %v, total %v: %q", first, time.Since(start), text.String())
			if strings.TrimSpace(text.String()) == "" {
				t.Fatal("empty reply")
			}
		})

		t.Run(model+"/calls a tool", func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			tool := llm.Tool{
				Name:        "add_component",
				Description: "Add a component to the architecture canvas.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"type":{"type":"string","enum":["database","cache","service"]},"name":{"type":"string"}},"required":["type","name"]}`),
			}
			var calls []llm.ToolCall
			for ev, err := range client.Stream(ctx, llm.Request{MaxTokens: 1024, Tools: []llm.Tool{tool}, Messages: []llm.Message{
				{Role: llm.RoleUser, Content: "Add a Redis cache named Session Cache to the canvas."},
			}}) {
				if err != nil {
					t.Fatalf("stream: %v", err)
				}
				if ev.ToolCall != nil {
					calls = append(calls, *ev.ToolCall)
				}
			}
			if len(calls) == 0 || calls[0].Name != "add_component" {
				t.Fatalf("tool calls = %+v", calls)
			}
			var args map[string]string
			if err := json.Unmarshal([]byte(calls[0].Arguments), &args); err != nil || args["type"] != "cache" {
				t.Fatalf("arguments %q: %v", calls[0].Arguments, err)
			}
			t.Logf("tool call: %s(%s)", calls[0].Name, calls[0].Arguments)
		})

		t.Run(model+"/proposes valid changes", func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			doc := architecture.Empty()
			doc.Components = append(doc.Components,
				architecture.Component{ID: "c-api", Type: "service", Name: "Orders API"},
				architecture.Component{ID: "c-db", Type: "database", Name: "Orders DB", Properties: map[string]string{"engine": "PostgreSQL"}})
			doc.Connections = append(doc.Connections, architecture.Connection{ID: "k-1", Source: "c-api", Target: "c-db", Kind: "sync"})
			canvas, _ := json.Marshal(doc)
			var call *llm.ToolCall
			for ev, err := range client.Stream(ctx, llm.Request{MaxTokens: 8192, Tools: []llm.Tool{proposal.Tool}, Messages: []llm.Message{
				{Role: llm.RoleSystem, Content: "You are a software architect. Change the canvas only by calling propose_changes. Current canvas JSON: " + string(canvas)},
				{Role: llm.RoleUser, Content: "Reads are 100x writes and the database is overloaded. Propose adding a Redis cache between the API and the database. Record that read ratio as a requirement and record your decision, attached to the cache and citing that requirement."},
			}}) {
				if err != nil {
					t.Fatalf("stream: %v", err)
				}
				if ev.ToolCall != nil && call == nil {
					call = ev.ToolCall
				}
			}
			if call == nil || call.Name != proposal.Tool.Name {
				t.Fatalf("no propose_changes call: %+v", call)
			}
			var changes proposal.Changes
			if err := json.Unmarshal([]byte(call.Arguments), &changes); err != nil {
				t.Fatalf("arguments %q: %v", call.Arguments, err)
			}
			changes.Normalize() // as the assistant does
			if err := changes.Validate(doc, knowledge.Knowledge{}); err != nil {
				t.Fatalf("invalid proposal %s: %v", call.Arguments, err)
			}
			ops := map[string]bool{}
			for _, c := range changes.Changes {
				ops[c.Op] = true
			}
			if !ops["add_requirement"] || !ops["add_decision"] {
				t.Errorf("expected a requirement and a decision, got ops %v", ops)
			}
			t.Logf("proposal: %s", call.Arguments)
		})
	}
}

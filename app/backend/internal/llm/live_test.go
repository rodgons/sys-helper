//go:build live

package llm_test

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"sys-helper/backend/internal/llm"
)

// Calls the real NVIDIA API: `make test-ai-live` (needs NVIDIA_API_KEY). It checks each model
// streams text and makes a tool call, and logs how long the first token took.
func TestLiveModels(t *testing.T) {
	key := os.Getenv("NVIDIA_API_KEY")
	if key == "" {
		t.Fatal("NVIDIA_API_KEY is required")
	}
	models := []string{"moonshotai/kimi-k3", "google/gemma-4-31b-it"}
	if m := os.Getenv("AI_LIVE_MODELS"); m != "" {
		models = strings.Split(m, ",")
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
	}
}

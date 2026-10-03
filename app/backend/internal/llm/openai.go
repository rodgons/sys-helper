package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"iter"
	"net/http"
	"strings"
)

// OpenAIClient streams one model from an OpenAI-compatible /chat/completions endpoint (OpenRouter's,
// see config.AI).
type OpenAIClient struct {
	BaseURL string
	APIKey  string
	Model   string
	// HTTP defaults to http.DefaultClient. Leave its Timeout unset: replies stream for a while, so
	// the request context bounds them instead.
	HTTP *http.Client
}

type wireMessage struct {
	Role       Role           `json:"role"`
	Content    string         `json:"content"`
	ToolCalls  []wireToolCall `json:"tool_calls,omitempty"`
	ToolCallID string         `json:"tool_call_id,omitempty"`
}

type wireToolCall struct {
	Index    int    `json:"index"`
	ID       string `json:"id,omitempty"`
	Type     string `json:"type,omitempty"`
	Function struct {
		Name      string `json:"name,omitempty"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type wireTool struct {
	Type     string `json:"type"`
	Function struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Parameters  json.RawMessage `json:"parameters"`
	} `json:"function"`
}

type chunk struct {
	// Error is set when the request fails after the stream has started (HTTP 200).
	Error *struct {
		Code    any    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	Choices []struct {
		Delta struct {
			Content          string         `json:"content"`
			ReasoningContent string         `json:"reasoning_content"`
			Reasoning        string         `json:"reasoning"`
			ToolCalls        []wireToolCall `json:"tool_calls"`
		} `json:"delta"`
	} `json:"choices"`
}

func (c OpenAIClient) Stream(ctx context.Context, req Request) iter.Seq2[Event, error] {
	return func(yield func(Event, error) bool) {
		res, err := c.post(ctx, req)
		if err != nil {
			yield(Event{}, err)
			return
		}
		defer res.Body.Close()

		var calls []*ToolCall            // in order of arrival
		streaming := map[int]*ToolCall{} // index → the call its fragments extend
		scanner := bufio.NewScanner(res.Body)
		scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)
		for scanner.Scan() {
			data, ok := strings.CutPrefix(scanner.Text(), "data:")
			if !ok {
				continue // blank separators, comments and other SSE fields
			}
			data = strings.TrimSpace(data)
			if data == "[DONE]" {
				// Tool call arguments arrive in fragments; emit each call once it is complete.
				for _, call := range calls {
					if !yield(Event{ToolCall: call}, nil) {
						return
					}
				}
				return
			}
			var ch chunk
			if err := json.Unmarshal([]byte(data), &ch); err != nil {
				yield(Event{}, fmt.Errorf("decode stream chunk: %w", err))
				return
			}
			if ch.Error != nil {
				yield(Event{}, fmt.Errorf("%s: stream error %v: %s", c.Model, ch.Error.Code, ch.Error.Message))
				return
			}
			for _, choice := range ch.Choices {
				d := choice.Delta
				if len(d.ToolCalls) > 0 && len(calls) == 0 {
					// Say the model has started, so a long call isn't taken for a model that hasn't.
					if !yield(Event{Calling: true}, nil) {
						return
					}
				}
				for _, tc := range d.ToolCalls {
					// A new id at a known index is a new call: some providers send whole calls without an index.
					call := streaming[tc.Index]
					if call == nil || (tc.ID != "" && call.ID != "" && tc.ID != call.ID) {
						call = &ToolCall{}
						streaming[tc.Index] = call
						calls = append(calls, call)
					}
					if tc.ID != "" {
						call.ID = tc.ID
					}
					if tc.Function.Name != "" {
						call.Name = tc.Function.Name
					}
					call.Arguments += tc.Function.Arguments
				}
				ev := Event{Text: d.Content, Reasoning: d.ReasoningContent + d.Reasoning}
				if ev.Text != "" || ev.Reasoning != "" {
					if !yield(ev, nil) {
						return
					}
				}
			}
		}
		if err := scanner.Err(); err != nil {
			yield(Event{}, fmt.Errorf("read stream: %w", err))
			return
		}
		yield(Event{}, errors.New("stream ended without [DONE]"))
	}
}

func (c OpenAIClient) post(ctx context.Context, req Request) (*http.Response, error) {
	body := map[string]any{"model": c.Model, "messages": toWire(req.Messages), "stream": true}
	if req.MaxTokens > 0 {
		body["max_tokens"] = req.MaxTokens
	}
	if len(req.Tools) > 0 {
		tools := make([]wireTool, len(req.Tools))
		for i, t := range req.Tools {
			tools[i].Type = "function"
			tools[i].Function.Name = t.Name
			tools[i].Function.Description = t.Description
			tools[i].Function.Parameters = t.Parameters
		}
		body["tools"] = tools
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(c.BaseURL, "/")+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	if c.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	}
	client := c.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", c.Model, err)
	}
	if res.StatusCode != http.StatusOK {
		defer res.Body.Close()
		detail, _ := io.ReadAll(io.LimitReader(res.Body, 2<<10))
		return nil, &HTTPError{
			Model:          c.Model,
			Status:         res.StatusCode,
			AccountLimited: res.StatusCode == http.StatusTooManyRequests && res.Header.Get("X-RateLimit-Limit") != "",
			Body:           string(bytes.TrimSpace(detail)),
		}
	}
	return res, nil
}

func toWire(msgs []Message) []wireMessage {
	out := make([]wireMessage, len(msgs))
	for i, m := range msgs {
		out[i] = wireMessage{Role: m.Role, Content: m.Content, ToolCallID: m.ToolCallID}
		for j, tc := range m.ToolCalls {
			w := wireToolCall{Index: j, ID: tc.ID, Type: "function"}
			w.Function.Name = tc.Name
			w.Function.Arguments = tc.Arguments
			out[i].ToolCalls = append(out[i].ToolCalls, w)
		}
	}
	return out
}

// HTTPError is a non-200 answer to a chat request, before anything streamed.
type HTTPError struct {
	Model  string
	Status int
	// AccountLimited means OpenRouter's own rate limit for the whole account was hit (its 429s carry
	// X-RateLimit-* headers; a provider's don't), so no other free model will answer either.
	AccountLimited bool
	Body           string
}

// Gated says whether OpenRouter refused because the free model is reserved for other apps (as of
// 2026-10, some are "only available on agentic harnesses"). Such a model won't answer this app
// until OpenRouter changes that, unlike a moderation 403, which depends on the prompt.
func (e *HTTPError) Gated() bool {
	return e.Status == http.StatusForbidden && strings.Contains(strings.ToLower(e.Body), "agentic harness")
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("%s: HTTP %d: %s", e.Model, e.Status, e.Body)
}

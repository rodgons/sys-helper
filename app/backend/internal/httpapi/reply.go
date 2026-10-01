package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"sys-helper/backend/internal/assistant"
	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/projects"
)

// Replier generates the AI's reply to a Project's Conversation, streaming its text to onText.
type Replier interface {
	Reply(ctx context.Context, userID, suffix string, onText func(string)) (conversation.Message, error)
}

// handleReply streams the AI's reply as server-sent events: `delta` {text} while it is written,
// then `done` with the saved Message, or `error` if the model fails midway. Failures before the
// first delta are plain JSON errors. Nothing is saved unless the reply completes, so the client
// retries by calling this again.
func handleReply(replier Replier) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		rc := http.NewResponseController(w)
		// Replies can take longer than the server's WriteTimeout.
		_ = rc.SetWriteDeadline(time.Time{})

		streaming := false
		send := func(event string, data any) {
			if !streaming {
				h := w.Header()
				h.Set("Content-Type", "text/event-stream")
				h.Set("Cache-Control", "no-cache")
				h.Set("X-Accel-Buffering", "no")
				w.WriteHeader(http.StatusOK)
				streaming = true
			}
			payload, _ := json.Marshal(data)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload)
			_ = rc.Flush()
		}

		msg, err := replier.Reply(r.Context(), userFrom(r.Context()).ID, suffix, func(text string) {
			send("delta", map[string]string{"text": text})
		})
		switch {
		case err == nil:
			send("done", msg)
		case streaming:
			slog.ErrorContext(r.Context(), "reply failed midway", "error", err)
			send("error", map[string]string{"error": "ai_failed"})
		case errors.Is(err, projects.ErrNotFound):
			writeError(w, http.StatusNotFound, "not_found")
		case errors.Is(err, assistant.ErrNothingToReply):
			writeError(w, http.StatusConflict, "nothing_to_reply")
		case errors.Is(err, assistant.ErrBusy):
			writeError(w, http.StatusConflict, "busy")
		case errors.Is(err, assistant.ErrUnavailable):
			writeError(w, http.StatusServiceUnavailable, "ai_unavailable")
		default:
			slog.ErrorContext(r.Context(), "reply failed", "error", err)
			writeError(w, http.StatusBadGateway, "ai_failed")
		}
	})
}

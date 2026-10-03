package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/projects"
)

// ConversationStore keeps each Project's Messages.
type ConversationStore interface {
	List(ctx context.Context, userID, suffix string) ([]conversation.Message, error)
	Append(ctx context.Context, userID, suffix string, role conversation.Role, body string) (conversation.Message, error)
}

func handleListMessages(store ConversationStore) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		msgs, err := store.List(r.Context(), userFrom(r.Context()).ID, suffix)
		switch {
		case errors.Is(err, projects.ErrNotFound):
			writeError(w, http.StatusNotFound, "not_found")
		case err != nil:
			internalError(w, r, err)
		default:
			if msgs == nil {
				msgs = []conversation.Message{}
			}
			writeJSON(w, http.StatusOK, msgs)
		}
	})
}

// handleSendMessage adds a User message. The role is never taken from the request. Messages are
// free; the daily cap meters the model calls that answer them (see usage.Meter).
func handleSendMessage(store ConversationStore) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		var req struct {
			Body string `json:"body"`
		}
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_json")
			return
		}
		body, err := conversation.CleanUserMessage(req.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_message")
			return
		}
		m, err := store.Append(r.Context(), userFrom(r.Context()).ID, suffix, conversation.RoleUser, body)
		switch {
		case errors.Is(err, projects.ErrNotFound):
			writeError(w, http.StatusNotFound, "not_found")
		case errors.Is(err, conversation.ErrLimit):
			writeJSON(w, http.StatusConflict, map[string]string{"error": "limit_reached", "detail": err.Error()})
		case err != nil:
			internalError(w, r, err)
		default:
			writeJSON(w, http.StatusCreated, m)
		}
	})
}

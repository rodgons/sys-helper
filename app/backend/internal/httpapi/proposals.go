package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/projects"
)

// ProposalReviews accepts or rejects a Project's Proposals, addressed by their number (seq).
type ProposalReviews interface {
	// Accept saves doc (the Architecture with the Proposal applied) as the version after base and
	// marks the Proposal accepted, atomically.
	Accept(ctx context.Context, userID, suffix string, seq, base int, doc architecture.Document) (int, error)
	Reject(ctx context.Context, userID, suffix string, seq int) error
}

func handleAcceptProposal(reviews ProposalReviews) http.HandlerFunc {
	return withProposal(func(w http.ResponseWriter, r *http.Request, suffix string, seq int) {
		base, doc, ok := readVersionedDocument(w, r)
		if !ok {
			return
		}
		version, err := reviews.Accept(r.Context(), userFrom(r.Context()).ID, suffix, seq, base, doc)
		if err == nil {
			writeJSON(w, http.StatusOK, map[string]int{"version": version})
			return
		}
		writeReviewError(w, r, err)
	})
}

func handleRejectProposal(reviews ProposalReviews) http.HandlerFunc {
	return withProposal(func(w http.ResponseWriter, r *http.Request, suffix string, seq int) {
		err := reviews.Reject(r.Context(), userFrom(r.Context()).ID, suffix, seq)
		if err == nil {
			writeJSON(w, http.StatusOK, map[string]string{"status": string(conversation.ProposalRejected)})
			return
		}
		writeReviewError(w, r, err)
	})
}

func withProposal(next func(w http.ResponseWriter, r *http.Request, suffix string, seq int)) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		seq, err := strconv.Atoi(r.PathValue("seq"))
		if err != nil || seq < 1 {
			writeError(w, http.StatusNotFound, "not_found")
			return
		}
		next(w, r, suffix, seq)
	})
}

func writeReviewError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projects.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found")
	case errors.Is(err, conversation.ErrNotPending):
		writeError(w, http.StatusConflict, "not_pending")
	case errors.Is(err, architecture.ErrConflict):
		writeError(w, http.StatusConflict, "conflict")
	case errors.Is(err, knowledge.ErrLimit):
		writeJSON(w, http.StatusConflict, map[string]string{"error": "limit_reached", "detail": err.Error()})
	default:
		internalError(w, r, err)
	}
}

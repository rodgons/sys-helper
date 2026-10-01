package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/projects"
)

// ArchitectureStore keeps each Project's versioned Architecture document.
type ArchitectureStore interface {
	Get(ctx context.Context, userID, suffix string) (architecture.Versioned, error)
	Save(ctx context.Context, userID, suffix string, base int, doc architecture.Document) (int, error)
}

func handleGetArchitecture(store ArchitectureStore) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		v, err := store.Get(r.Context(), userFrom(r.Context()).ID, suffix)
		switch {
		case errors.Is(err, projects.ErrNotFound):
			writeError(w, http.StatusNotFound, "not_found")
		case err != nil:
			internalError(w, r, err)
		default:
			writeJSON(w, http.StatusOK, v)
		}
	})
}

// handleSaveArchitecture stores the document as the next version, if `version` is still current.
func handleSaveArchitecture(store ArchitectureStore) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		var body struct {
			Version  *int                   `json:"version"`
			Document *architecture.Document `json:"document"`
		}
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&body); err != nil || body.Version == nil || body.Document == nil {
			writeError(w, http.StatusBadRequest, "invalid_json")
			return
		}
		if err := body.Document.Validate(); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_architecture", "detail": err.Error()})
			return
		}
		version, err := store.Save(r.Context(), userFrom(r.Context()).ID, suffix, *body.Version, *body.Document)
		switch {
		case errors.Is(err, projects.ErrNotFound):
			writeError(w, http.StatusNotFound, "not_found")
		case errors.Is(err, architecture.ErrConflict):
			writeError(w, http.StatusConflict, "conflict")
		case err != nil:
			internalError(w, r, err)
		default:
			writeJSON(w, http.StatusOK, map[string]int{"version": version})
		}
	})
}

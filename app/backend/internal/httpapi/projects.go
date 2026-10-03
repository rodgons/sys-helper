package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"sys-helper/backend/internal/projects"
)

// ProjectStore keeps a User's Projects. Lookups are by slug suffix, scoped to the owner.
type ProjectStore interface {
	List(ctx context.Context, userID string) ([]projects.Project, error)
	Create(ctx context.Context, userID, name string) (projects.Project, error)
	Get(ctx context.Context, userID, suffix string) (projects.Project, error)
	Rename(ctx context.Context, userID, suffix, name string) (projects.Project, error)
	Delete(ctx context.Context, userID, suffix string) error
}

// projectJSON is the public shape of a Project: identified by its slug, never by its ID.
type projectJSON struct {
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func toJSON(p projects.Project) projectJSON {
	return projectJSON{Slug: p.Slug(), Name: p.Name, UpdatedAt: p.UpdatedAt.UTC()}
}

func handleListProjects(store ProjectStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		list, err := store.List(r.Context(), userFrom(r.Context()).ID)
		if err != nil {
			internalError(w, r, err)
			return
		}
		out := make([]projectJSON, 0, len(list))
		for _, p := range list {
			out = append(out, toJSON(p))
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func handleCreateProject(store ProjectStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name, ok := readName(w, r)
		if !ok {
			return
		}
		p, err := store.Create(r.Context(), userFrom(r.Context()).ID, name)
		if errors.Is(err, projects.ErrLimit) {
			writeError(w, http.StatusConflict, "limit_reached")
			return
		}
		if err != nil {
			internalError(w, r, err)
			return
		}
		writeJSON(w, http.StatusCreated, toJSON(p))
	}
}

func handleGetProject(store ProjectStore) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		p, err := store.Get(r.Context(), userFrom(r.Context()).ID, suffix)
		writeProject(w, r, p, err)
	})
}

func handleRenameProject(store ProjectStore) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		name, ok := readName(w, r)
		if !ok {
			return
		}
		p, err := store.Rename(r.Context(), userFrom(r.Context()).ID, suffix, name)
		writeProject(w, r, p, err)
	})
}

func handleDeleteProject(store ProjectStore) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		err := store.Delete(r.Context(), userFrom(r.Context()).ID, suffix)
		switch {
		case errors.Is(err, projects.ErrNotFound):
			writeError(w, http.StatusNotFound, "not_found")
		case err != nil:
			internalError(w, r, err)
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	})
}

// withSuffix resolves the {slug} path value to its suffix; malformed slugs are simply not found.
func withSuffix(next func(w http.ResponseWriter, r *http.Request, suffix string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		suffix, ok := projects.SuffixFromSlug(r.PathValue("slug"))
		if !ok {
			writeError(w, http.StatusNotFound, "not_found")
			return
		}
		next(w, r, suffix)
	}
}

// readName decodes {"name": "..."} and validates it, answering 400 itself when it is unusable.
func readName(w http.ResponseWriter, r *http.Request) (string, bool) {
	var body struct {
		Name string `json:"name"`
	}
	if !decodeStrict(w, r, &body) {
		return "", false
	}
	name, err := projects.CleanName(body.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_name")
		return "", false
	}
	return name, true
}

func writeProject(w http.ResponseWriter, r *http.Request, p projects.Project, err error) {
	switch {
	case errors.Is(err, projects.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found")
	case err != nil:
		internalError(w, r, err)
	default:
		writeJSON(w, http.StatusOK, toJSON(p))
	}
}

func internalError(w http.ResponseWriter, r *http.Request, err error) {
	// A request the client abandoned (e.g. on navigation) fails with its cancelled queries; that
	// isn't a server error, and nobody reads the answer.
	if r.Context().Err() == nil {
		slog.ErrorContext(r.Context(), "request failed", "method", r.Method, "path", r.URL.Path, "error", err)
	}
	writeError(w, http.StatusInternalServerError, "internal")
}

package httpapi_test

import (
	"context"
	"net/http"
	"testing"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/httpapi"
	"sys-helper/backend/internal/projects"
)

// fakeArchitectures stores one document per slug suffix for octocat; other suffixes are not found.
type fakeArchitectures struct {
	stored map[string]architecture.Versioned
}

func (f *fakeArchitectures) Get(_ context.Context, userID, suffix string) (architecture.Versioned, error) {
	v, ok := f.stored[suffix]
	if !ok || userID != octocat.ID {
		return architecture.Versioned{}, projects.ErrNotFound
	}
	return v, nil
}

func (f *fakeArchitectures) Save(_ context.Context, userID, suffix string, base int, doc architecture.Document) (int, error) {
	v, ok := f.stored[suffix]
	if !ok || userID != octocat.ID {
		return 0, projects.ErrNotFound
	}
	if v.Version != base {
		return 0, architecture.ErrConflict
	}
	f.stored[suffix] = architecture.Versioned{Version: base + 1, Document: doc}
	return base + 1, nil
}

func TestArchitecture(t *testing.T) {
	const path = "/api/projects/shop-k3xa9q2m7p/architecture"
	newDeps := func() (httpapi.Deps, *fakeArchitectures) {
		store := &fakeArchitectures{stored: map[string]architecture.Versioned{
			"k3xa9q2m7p": {Version: 0, Document: architecture.Empty()},
		}}
		return httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: everyone, Architectures: store}, store
	}
	const doc = `{"components":[{"id":"a","type":"service","name":"API","position":{"x":1,"y":2}}],"connections":[]}`

	t.Run("returns the empty architecture of a new project", func(t *testing.T) {
		deps, _ := newDeps()

		rec := call(t, deps, http.MethodGet, path, "")

		if rec.Code != http.StatusOK || rec.Body.String() != `{"version":0,"document":{"components":[],"connections":[]}}`+"\n" {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
	})

	t.Run("saves a new version", func(t *testing.T) {
		deps, store := newDeps()

		rec := call(t, deps, http.MethodPut, path, `{"version":0,"document":`+doc+`}`)

		if rec.Code != http.StatusOK || decode[map[string]int](t, rec)["version"] != 1 {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
		if got := store.stored["k3xa9q2m7p"]; got.Version != 1 || got.Document.Components[0].Name != "API" {
			t.Errorf("stored = %+v", got)
		}
	})

	t.Run("answers 409 to a save from an outdated version", func(t *testing.T) {
		deps, _ := newDeps()
		call(t, deps, http.MethodPut, path, `{"version":0,"document":`+doc+`}`)

		rec := call(t, deps, http.MethodPut, path, `{"version":0,"document":`+doc+`}`)

		if rec.Code != http.StatusConflict || decode[map[string]string](t, rec)["error"] != "conflict" {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
	})

	t.Run("rejects invalid documents", func(t *testing.T) {
		deps, _ := newDeps()
		for _, body := range []string{
			`{"version":0,"document":{"components":[{"id":"a","type":"mainframe","name":"A","position":{"x":0,"y":0}}],"connections":[]}}`,
			`{"version":0}`,
			`{"version":0,"document":` + doc + `,"extra":true}`,
			`nope`,
		} {
			rec := call(t, deps, http.MethodPut, path, body)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("PUT %s: status = %d, want 400", body, rec.Code)
			}
		}
	})

	t.Run("answers 404 for unknown projects", func(t *testing.T) {
		deps, _ := newDeps()
		for _, method := range []string{http.MethodGet, http.MethodPut} {
			rec := call(t, deps, method, "/api/projects/nope-zzzzzzzzzz/architecture", `{"version":0,"document":`+doc+`}`)
			if rec.Code != http.StatusNotFound {
				t.Errorf("%s: status = %d, want 404", method, rec.Code)
			}
		}
	})
}

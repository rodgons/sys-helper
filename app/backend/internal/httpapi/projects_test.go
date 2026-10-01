package httpapi_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"sys-helper/backend/internal/httpapi"
	"sys-helper/backend/internal/projects"
)

// fakeProjects is an in-memory ProjectStore keyed by owner and slug suffix.
type fakeProjects struct {
	byOwner map[string][]projects.Project
	next    int
}

func newFakeProjects() *fakeProjects { return &fakeProjects{byOwner: map[string][]projects.Project{}} }

func (f *fakeProjects) List(_ context.Context, userID string) ([]projects.Project, error) {
	return f.byOwner[userID], nil
}

func (f *fakeProjects) Create(_ context.Context, userID, name string) (projects.Project, error) {
	f.next++
	p := projects.Project{ID: "id", SlugSuffix: strings.Repeat(string(rune('a'+f.next)), 10), Name: name, UpdatedAt: time.Unix(0, 0).UTC()}
	f.byOwner[userID] = append([]projects.Project{p}, f.byOwner[userID]...)
	return p, nil
}

func (f *fakeProjects) Get(_ context.Context, userID, suffix string) (projects.Project, error) {
	for _, p := range f.byOwner[userID] {
		if p.SlugSuffix == suffix {
			return p, nil
		}
	}
	return projects.Project{}, projects.ErrNotFound
}

func (f *fakeProjects) Rename(ctx context.Context, userID, suffix, name string) (projects.Project, error) {
	for i, p := range f.byOwner[userID] {
		if p.SlugSuffix == suffix {
			f.byOwner[userID][i].Name = name
			return f.byOwner[userID][i], nil
		}
	}
	return projects.Project{}, projects.ErrNotFound
}

func (f *fakeProjects) Delete(_ context.Context, userID, suffix string) error {
	for i, p := range f.byOwner[userID] {
		if p.SlugSuffix == suffix {
			f.byOwner[userID] = append(f.byOwner[userID][:i], f.byOwner[userID][i+1:]...)
			return nil
		}
	}
	return projects.ErrNotFound
}

type projectJSON struct {
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	UpdatedAt string `json:"updatedAt"`
}

func call(t *testing.T, deps httpapi.Deps, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, r)
	req.Header.Set("Authorization", "Bearer good")
	return serve(t, deps, req)
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(rec.Body).Decode(&v); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return v
}

func TestProjects(t *testing.T) {
	newDeps := func() (httpapi.Deps, *fakeProjects) {
		store := newFakeProjects()
		return httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: everyone, Projects: store}, store
	}

	t.Run("requires a signed-in user", func(t *testing.T) {
		deps, _ := newDeps()
		req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)

		if rec := serve(t, deps, req); rec.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", rec.Code)
		}
	})

	t.Run("creates a project and lists it without exposing its ID", func(t *testing.T) {
		deps, _ := newDeps()

		rec := call(t, deps, http.MethodPost, "/api/projects", `{"name":"  URL Shortener "}`)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create status = %d, body %s", rec.Code, rec.Body)
		}
		if strings.Contains(rec.Body.String(), `"id"`) {
			t.Errorf("response leaks the ID: %s", rec.Body)
		}
		created := decode[projectJSON](t, rec)
		if created.Slug != "url-shortener-bbbbbbbbbb" || created.Name != "URL Shortener" || created.UpdatedAt != "1970-01-01T00:00:00Z" {
			t.Errorf("created = %+v", created)
		}

		list := decode[[]projectJSON](t, call(t, deps, http.MethodGet, "/api/projects", ""))
		if len(list) != 1 || list[0] != created {
			t.Errorf("list = %+v", list)
		}
	})

	t.Run("returns an empty list, not null", func(t *testing.T) {
		deps, _ := newDeps()

		rec := call(t, deps, http.MethodGet, "/api/projects", "")
		if strings.TrimSpace(rec.Body.String()) != "[]" {
			t.Errorf("body = %s, want []", rec.Body)
		}
	})

	t.Run("rejects invalid names", func(t *testing.T) {
		deps, _ := newDeps()
		for _, body := range []string{`{"name":"   "}`, `{"name":"` + strings.Repeat("x", 101) + `"}`, `not json`} {
			rec := call(t, deps, http.MethodPost, "/api/projects", body)
			if rec.Code != http.StatusBadRequest {
				t.Errorf("POST %s: status = %d, want 400", body, rec.Code)
			}
		}
	})

	t.Run("finds a project by any slug with its suffix and returns the canonical slug", func(t *testing.T) {
		deps, _ := newDeps()
		created := decode[projectJSON](t, call(t, deps, http.MethodPost, "/api/projects", `{"name":"Link Service"}`))

		for _, slug := range []string{created.Slug, "old-name-bbbbbbbbbb", "bbbbbbbbbb"} {
			rec := call(t, deps, http.MethodGet, "/api/projects/"+slug, "")
			if rec.Code != http.StatusOK {
				t.Fatalf("GET %s: status = %d", slug, rec.Code)
			}
			if got := decode[projectJSON](t, rec); got.Slug != "link-service-bbbbbbbbbb" {
				t.Errorf("GET %s: slug = %q", slug, got.Slug)
			}
		}
	})

	t.Run("renames a project and keeps its suffix", func(t *testing.T) {
		deps, _ := newDeps()
		created := decode[projectJSON](t, call(t, deps, http.MethodPost, "/api/projects", `{"name":"Old"}`))

		rec := call(t, deps, http.MethodPatch, "/api/projects/"+created.Slug, `{"name":"New name"}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
		}
		if got := decode[projectJSON](t, rec); got.Slug != "new-name-bbbbbbbbbb" || got.Name != "New name" {
			t.Errorf("renamed = %+v", got)
		}
	})

	t.Run("deletes a project", func(t *testing.T) {
		deps, _ := newDeps()
		created := decode[projectJSON](t, call(t, deps, http.MethodPost, "/api/projects", `{"name":"Doomed"}`))

		if rec := call(t, deps, http.MethodDelete, "/api/projects/"+created.Slug, ""); rec.Code != http.StatusNoContent {
			t.Fatalf("status = %d", rec.Code)
		}
		if rec := call(t, deps, http.MethodGet, "/api/projects/"+created.Slug, ""); rec.Code != http.StatusNotFound {
			t.Fatalf("GET after delete: status = %d, want 404", rec.Code)
		}
	})

	t.Run("answers 404 for unknown and malformed slugs", func(t *testing.T) {
		deps, _ := newDeps()
		for _, req := range []struct{ method, path, body string }{
			{http.MethodGet, "/api/projects/nope-zzzzzzzzzz", ""},
			{http.MethodGet, "/api/projects/not-a-slug", ""},
			{http.MethodPatch, "/api/projects/nope-zzzzzzzzzz", `{"name":"x"}`},
			{http.MethodDelete, "/api/projects/nope-zzzzzzzzzz", ""},
		} {
			rec := call(t, deps, req.method, req.path, req.body)
			if rec.Code != http.StatusNotFound {
				t.Errorf("%s %s: status = %d, want 404", req.method, req.path, rec.Code)
			}
			if body := decode[map[string]string](t, rec); body["error"] != "not_found" {
				t.Errorf("%s %s: body = %v", req.method, req.path, body)
			}
		}
	})
}

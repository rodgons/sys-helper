package httpapi_test

import (
	"context"
	"net/http"
	"testing"

	"sys-helper/backend/internal/httpapi"
	"sys-helper/backend/internal/knowledge"
)

// fakeSettings keeps each User's settings in memory.
type fakeSettings struct{ levels map[string]string }

func (f *fakeSettings) DefaultExperienceLevel(_ context.Context, userID string) (string, error) {
	return f.levels[userID], nil
}

func (f *fakeSettings) SetDefaultExperienceLevel(_ context.Context, userID, level string) error {
	if level != "" {
		if err := knowledge.CheckLevel(level); err != nil {
			return err
		}
	}
	f.levels[userID] = level
	return nil
}

func TestSettings(t *testing.T) {
	newDeps := func() (httpapi.Deps, *fakeSettings) {
		f := &fakeSettings{levels: map[string]string{}}
		return httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Settings: f}, f
	}

	t.Run("starts with no default experience level", func(t *testing.T) {
		deps, _ := newDeps()

		rec := call(t, deps, http.MethodGet, "/api/settings", "")

		if rec.Code != http.StatusOK || decode[map[string]string](t, rec)["experienceLevel"] != "" {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
	})

	t.Run("saves the default experience level", func(t *testing.T) {
		deps, f := newDeps()

		rec := call(t, deps, http.MethodPut, "/api/settings", `{"experienceLevel":"expert"}`)

		if rec.Code != http.StatusOK || decode[map[string]string](t, rec)["experienceLevel"] != "expert" {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
		if f.levels[octocat.ID] != "expert" {
			t.Errorf("stored = %q", f.levels[octocat.ID])
		}
	})

	t.Run("clears the default experience level", func(t *testing.T) {
		deps, f := newDeps()
		f.levels[octocat.ID] = "beginner"

		if rec := call(t, deps, http.MethodPut, "/api/settings", `{"experienceLevel":""}`); rec.Code != http.StatusOK || f.levels[octocat.ID] != "" {
			t.Fatalf("status = %d, stored = %q", rec.Code, f.levels[octocat.ID])
		}
	})

	t.Run("rejects an unknown level", func(t *testing.T) {
		deps, _ := newDeps()

		rec := call(t, deps, http.MethodPut, "/api/settings", `{"experienceLevel":"guru"}`)

		if rec.Code != http.StatusBadRequest || decode[map[string]string](t, rec)["error"] != "invalid" {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
	})
}

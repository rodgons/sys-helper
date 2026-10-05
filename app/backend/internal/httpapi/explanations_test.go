package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"sys-helper/backend/internal/explain"
	"sys-helper/backend/internal/httpapi"
)

// fakeExplanations is a catalog of one Pattern and one Component Type.
type fakeExplanations struct{}

func (fakeExplanations) Explanations() explain.Catalog {
	return explain.Catalog{
		Patterns: []explain.Pattern{{
			ID: "cache-aside", Name: "Cache-Aside", Aliases: []string{"lazy loading"}, Gist: "Cache first.",
			Reference:    "https://example.test/cache-aside",
			Explanations: explain.Levels{Beginner: "B", Intermediate: "I", Expert: "E"},
		}},
		ComponentTypes: []explain.ComponentType{{
			Type: "cache", Name: "Cache", Gist: "Fast memory.", Reference: "https://example.test/cache",
			Explanations: explain.Levels{Beginner: "b", Intermediate: "i", Expert: "e"},
		}},
	}
}

func TestExplanations(t *testing.T) {
	deps := httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: everyone, Explanations: fakeExplanations{}}

	t.Run("requires a signed-in user", func(t *testing.T) {
		rec := serve(t, deps, httptest.NewRequest(http.MethodGet, "/api/explanations", nil))

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", rec.Code)
		}
	})

	t.Run("returns the catalog, cacheable for an hour by the browser only", func(t *testing.T) {
		rec := call(t, deps, http.MethodGet, "/api/explanations", "")

		if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "private, max-age=3600" {
			t.Fatalf("status = %d, Cache-Control = %q", rec.Code, rec.Header().Get("Cache-Control"))
		}
		got := decode[map[string]any](t, rec)
		want := map[string]any{
			"patterns": []any{map[string]any{
				"id": "cache-aside", "name": "Cache-Aside", "aliases": []any{"lazy loading"}, "gist": "Cache first.",
				"reference":    "https://example.test/cache-aside",
				"explanations": map[string]any{"beginner": "B", "intermediate": "I", "expert": "E"},
			}},
			"componentTypes": []any{map[string]any{
				"type": "cache", "name": "Cache", "gist": "Fast memory.", "reference": "https://example.test/cache",
				"explanations": map[string]any{"beginner": "b", "intermediate": "i", "expert": "e"},
			}},
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("body = %v\nwant %v", got, want)
		}
	})
}

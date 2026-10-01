package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"sys-helper/backend/internal/auth"
	"sys-helper/backend/internal/httpapi"
)

// fakeAuth accepts the token "good" as octocat and "error" as an infrastructure failure.
type fakeAuth struct{ user auth.User }

func (f fakeAuth) Authenticate(_ context.Context, token string) (auth.User, error) {
	switch token {
	case "good":
		return f.user, nil
	case "no-github":
		return auth.User{}, auth.ErrNoGitHubIdentity
	case "error":
		return auth.User{}, errors.New("db down")
	default:
		return auth.User{}, auth.ErrInvalidToken
	}
}

var octocat = auth.User{ID: "0192f0c4-0000-7000-8000-000000000001", GitHubID: "583231", GitHubUsername: "octocat", AvatarURL: "https://avatars.test/octocat"}

// everyone admits every GitHub account, for tests that aren't about the allowlist.
var everyone = auth.Allowlist{Everyone: true}

func getMe(t *testing.T, deps httpapi.Deps, authorization string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}
	return serve(t, deps, req)
}

func TestMe(t *testing.T) {
	deps := httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: everyone}

	t.Run("returns the signed-in user", func(t *testing.T) {
		rec := getMe(t, deps, "Bearer good")

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		var body map[string]string
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["username"] != "octocat" || body["avatarUrl"] != "https://avatars.test/octocat" {
			t.Errorf("body = %v", body)
		}
		if _, ok := body["id"]; ok {
			t.Errorf("body leaks the internal user ID: %v", body)
		}
	})

	tests := []struct {
		name          string
		authorization string
		allowlist     auth.Allowlist
		wantStatus    int
		wantError     string
	}{
		{"missing token", "", everyone, http.StatusUnauthorized, "unauthenticated"},
		{"not a bearer token", "Basic good", everyone, http.StatusUnauthorized, "unauthenticated"},
		{"invalid token", "Bearer forged", everyone, http.StatusUnauthorized, "unauthenticated"},
		{"no GitHub identity", "Bearer no-github", everyone, http.StatusForbidden, "github_required"},
		{"not on the allowlist", "Bearer good", auth.Allowlist{GitHubIDs: []string{"9919"}}, http.StatusForbidden, "not_allowed"},
		{"on the allowlist", "Bearer good", auth.Allowlist{GitHubIDs: []string{"9919", "583231"}}, http.StatusOK, ""},
		{"listed by username, not id", "Bearer good", auth.Allowlist{GitHubIDs: []string{"octocat"}}, http.StatusForbidden, "not_allowed"},
		{"empty allowlist admits nobody", "Bearer good", auth.Allowlist{}, http.StatusForbidden, "not_allowed"},
		{"authenticator failure", "Bearer error", everyone, http.StatusInternalServerError, "internal"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			deps := httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: tt.allowlist}

			rec := getMe(t, deps, tt.authorization)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if tt.wantError == "" {
				return
			}
			var body map[string]string
			if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if body["error"] != tt.wantError {
				t.Errorf("error = %q, want %q", body["error"], tt.wantError)
			}
		})
	}
}

package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
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
	case "no-identity":
		return auth.User{}, auth.ErrNoIdentity
	case "error":
		return auth.User{}, errors.New("db down")
	default:
		return auth.User{}, auth.ErrInvalidToken
	}
}

var octocat = auth.User{ID: "0192f0c4-0000-7000-8000-000000000001", Identities: []auth.Identity{
	{Provider: auth.GitHub, ID: "583231", Name: "octocat", AvatarURL: "https://avatars.test/octocat"},
}}

// everyone admits every User, for tests that aren't about the allowlist.
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
		if body["displayName"] != "octocat" || body["avatarUrl"] != "https://avatars.test/octocat" {
			t.Errorf("body = %v", body)
		}
		if _, ok := body["id"]; ok {
			t.Errorf("body leaks the internal user ID: %v", body)
		}
	})

	t.Run("tells Users off the allowlist which identities to ask with", func(t *testing.T) {
		linked := auth.User{ID: "u", Identities: []auth.Identity{
			octocat.Identities[0],
			{Provider: auth.Google, ID: "108", Name: "Ada Lovelace", Email: "ada@example.com"},
		}}
		deps := httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{linked}, Allowlist: auth.Allowlist{}}

		rec := getMe(t, deps, "Bearer good")

		if rec.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403", rec.Code)
		}
		var body struct {
			Error      string              `json:"error"`
			Identities []map[string]string `json:"identities"`
		}
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		want := []map[string]string{
			{"provider": "github", "id": "583231", "name": "octocat"},
			{"provider": "google", "id": "108", "name": "Ada Lovelace"},
		}
		if body.Error != "not_allowed" || !reflect.DeepEqual(body.Identities, want) {
			t.Errorf("body = %+v, want identities %v", body, want)
		}
	})

	t.Run("shows a Google-only User by name, else email", func(t *testing.T) {
		google := auth.User{ID: "u", Identities: []auth.Identity{
			{Provider: auth.Google, ID: "108", Email: "ada@example.com", AvatarURL: "https://avatars.test/ada"},
		}}
		deps := httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{google}, Allowlist: auth.Allowlist{GoogleIDs: []string{"108"}}}

		rec := getMe(t, deps, "Bearer good")

		var body map[string]string
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if rec.Code != http.StatusOK || body["displayName"] != "ada@example.com" || body["avatarUrl"] != "https://avatars.test/ada" {
			t.Errorf("status = %d, body = %v", rec.Code, body)
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
		{"no supported identity", "Bearer no-identity", everyone, http.StatusForbidden, "identity_required"},
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
			var body struct{ Error string }
			if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if body.Error != tt.wantError {
				t.Errorf("error = %q, want %q", body.Error, tt.wantError)
			}
		})
	}
}

func TestInternalErrorsOfAbandonedRequests(t *testing.T) {
	// A browser aborts requests on navigation; their failed queries aren't server errors to log.
	var logs bytes.Buffer
	defer slog.SetDefault(slog.Default())
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	deps := httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: everyone}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequestWithContext(ctx, http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer error")
	serve(t, deps, req)
	if logs.Len() != 0 {
		t.Errorf("logged an abandoned request: %s", logs.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer error")
	serve(t, deps, req)
	if !strings.Contains(logs.String(), "db down") {
		t.Errorf("didn't log a live request's failure: %q", logs.String())
	}
}

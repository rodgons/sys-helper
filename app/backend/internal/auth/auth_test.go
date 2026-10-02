package auth_test

import (
	"context"
	"errors"
	"testing"

	"sys-helper/backend/internal/auth"
)

var (
	github = auth.Identity{Provider: auth.GitHub, ID: "583231", Name: "octocat", AvatarURL: "https://avatars.test/octocat"}
	google = auth.Identity{Provider: auth.Google, ID: "108", Name: "Ada Lovelace", Email: "ada@example.com", AvatarURL: "https://avatars.test/ada"}
)

func TestAllowlist(t *testing.T) {
	tests := []struct {
		name      string
		allowlist auth.Allowlist
		user      auth.User
		want      bool
	}{
		{"zero value admits nobody", auth.Allowlist{}, auth.User{Identities: []auth.Identity{github}}, false},
		{"everyone", auth.Allowlist{Everyone: true}, auth.User{Identities: []auth.Identity{github}}, true},
		{"listed GitHub id", auth.Allowlist{GitHubIDs: []string{"583231"}}, auth.User{Identities: []auth.Identity{github}}, true},
		{"unlisted GitHub id", auth.Allowlist{GitHubIDs: []string{"9919"}}, auth.User{Identities: []auth.Identity{github}}, false},
		{"GitHub id listed as a Google id", auth.Allowlist{GoogleIDs: []string{"583231"}}, auth.User{Identities: []auth.Identity{github}}, false},
		{"Google-only, listed", auth.Allowlist{GoogleIDs: []string{"108"}}, auth.User{Identities: []auth.Identity{google}}, true},
		{"Google-only, unlisted", auth.Allowlist{GoogleIDs: []string{"9"}}, auth.User{Identities: []auth.Identity{google}}, false},
		{"linked, only GitHub listed", auth.Allowlist{GitHubIDs: []string{"583231"}}, auth.User{Identities: []auth.Identity{github, google}}, true},
		{"linked, only Google listed", auth.Allowlist{GoogleIDs: []string{"108"}}, auth.User{Identities: []auth.Identity{github, google}}, true},
		{"linked, neither listed", auth.Allowlist{GitHubIDs: []string{"1"}, GoogleIDs: []string{"2"}}, auth.User{Identities: []auth.Identity{github, google}}, false},
		{"no identities", auth.Allowlist{GitHubIDs: []string{""}}, auth.User{}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.allowlist.Admits(tt.user); got != tt.want {
				t.Errorf("Admits = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestUserProfile(t *testing.T) {
	noName := google
	noName.Name = ""
	tests := []struct {
		name       string
		identities []auth.Identity
		wantName   string
		wantAvatar string
	}{
		{"GitHub", []auth.Identity{github}, "octocat", "https://avatars.test/octocat"},
		{"Google", []auth.Identity{google}, "Ada Lovelace", "https://avatars.test/ada"},
		{"Google without a name falls back to email", []auth.Identity{noName}, "ada@example.com", "https://avatars.test/ada"},
		{"linked prefers GitHub", []auth.Identity{google, github}, "octocat", "https://avatars.test/octocat"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u := auth.User{Identities: tt.identities}
			if got := u.DisplayName(); got != tt.wantName {
				t.Errorf("DisplayName = %q, want %q", got, tt.wantName)
			}
			if got := u.AvatarURL(); got != tt.wantAvatar {
				t.Errorf("AvatarURL = %q, want %q", got, tt.wantAvatar)
			}
		})
	}
}

type tokens map[string]string

func (t tokens) UserID(token string) (string, error) {
	if id, ok := t[token]; ok {
		return id, nil
	}
	return "", auth.ErrInvalidToken
}

type identities map[string][]auth.Identity

func (i identities) List(_ context.Context, userID string) ([]auth.Identity, error) {
	if ids, ok := i[userID]; ok {
		return ids, nil
	}
	return nil, auth.ErrNoIdentity
}

func TestAuthenticate(t *testing.T) {
	a := auth.Authenticator{
		Tokens:     tokens{"good": "u1", "bare": "u2"},
		Identities: identities{"u1": {github, google}},
	}

	t.Run("returns the User with their identities", func(t *testing.T) {
		u, err := a.Authenticate(context.Background(), "good")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.ID != "u1" || len(u.Identities) != 2 || u.Identities[0] != github || u.Identities[1] != google {
			t.Errorf("User = %+v", u)
		}
	})

	t.Run("rejects invalid tokens", func(t *testing.T) {
		if _, err := a.Authenticate(context.Background(), "forged"); !errors.Is(err, auth.ErrInvalidToken) {
			t.Errorf("err = %v, want ErrInvalidToken", err)
		}
	})

	t.Run("reports users without a supported identity", func(t *testing.T) {
		if _, err := a.Authenticate(context.Background(), "bare"); !errors.Is(err, auth.ErrNoIdentity) {
			t.Errorf("err = %v, want ErrNoIdentity", err)
		}
	})
}

//go:build integration

package auth_test

import (
	"context"
	"errors"
	"testing"

	"sys-helper/backend/internal/auth"
	"sys-helper/backend/internal/testdb"
)

func TestIdentities(t *testing.T) {
	pool := testdb.Pool(t)
	identities := auth.Identities{DB: pool}

	t.Run("reads the GitHub identity", func(t *testing.T) {
		id := testdb.User(t, pool, "octocat")

		gh, err := identities.GitHub(context.Background(), id)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if gh.Username != "octocat" || gh.AvatarURL != "https://avatars.test/octocat" {
			t.Errorf("GitHub = %+v", gh)
		}
	})

	t.Run("reports users without a GitHub identity", func(t *testing.T) {
		id := testdb.User(t, pool, "")

		if _, err := identities.GitHub(context.Background(), id); !errors.Is(err, auth.ErrNoGitHubIdentity) {
			t.Fatalf("err = %v, want ErrNoGitHubIdentity", err)
		}
	})
}

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

		got, err := identities.List(context.Background(), id)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var githubID string
		if err := pool.QueryRow(context.Background(),
			`SELECT provider_id FROM auth.identities WHERE user_id = $1`, id).Scan(&githubID); err != nil {
			t.Fatal(err)
		}
		want := auth.Identity{Provider: auth.GitHub, ID: githubID, Name: "octocat", AvatarURL: "https://avatars.test/octocat"}
		if len(got) != 1 || got[0] != want {
			t.Errorf("List = %+v, want [%+v]", got, want)
		}
	})

	t.Run("reports users without a supported identity", func(t *testing.T) {
		id := testdb.User(t, pool, "")

		if _, err := identities.List(context.Background(), id); !errors.Is(err, auth.ErrNoIdentity) {
			t.Fatalf("err = %v, want ErrNoIdentity", err)
		}
	})
}

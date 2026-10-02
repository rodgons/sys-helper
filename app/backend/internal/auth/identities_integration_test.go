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

	providerID := func(t *testing.T, userID string, provider auth.Provider) string {
		t.Helper()
		var id string
		if err := pool.QueryRow(context.Background(),
			`SELECT provider_id FROM auth.identities WHERE user_id = $1 AND provider = $2`, userID, provider).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}

	t.Run("reads the Google identity", func(t *testing.T) {
		id := testdb.User(t, pool, "", testdb.WithGoogle("Ada Lovelace"))

		got, err := identities.List(context.Background(), id)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := auth.Identity{
			Provider: auth.Google, ID: providerID(t, id, auth.Google), Name: "Ada Lovelace",
			Email: id + "@gmail.test", AvatarURL: "https://avatars.test/google/" + id,
		}
		if len(got) != 1 || got[0] != want {
			t.Errorf("List = %+v, want [%+v]", got, want)
		}
	})

	t.Run("reads both identities of a linked user, GitHub first", func(t *testing.T) {
		id := testdb.User(t, pool, "octocat", testdb.WithGoogle("Ada Lovelace"))

		got, err := identities.List(context.Background(), id)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(got) != 2 || got[0].Provider != auth.GitHub || got[1].Provider != auth.Google ||
			got[0].ID != providerID(t, id, auth.GitHub) || got[1].ID != providerID(t, id, auth.Google) {
			t.Errorf("List = %+v", got)
		}
	})

	t.Run("ignores unsupported providers", func(t *testing.T) {
		id := testdb.User(t, pool, "")
		if _, err := pool.Exec(context.Background(), `
			INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
			VALUES ($1::text, $1::uuid, '{}', 'email', now(), now())`, id); err != nil {
			t.Fatal(err)
		}

		if _, err := identities.List(context.Background(), id); !errors.Is(err, auth.ErrNoIdentity) {
			t.Fatalf("err = %v, want ErrNoIdentity", err)
		}
	})

	t.Run("reports users without a supported identity", func(t *testing.T) {
		id := testdb.User(t, pool, "")

		if _, err := identities.List(context.Background(), id); !errors.Is(err, auth.ErrNoIdentity) {
			t.Fatalf("err = %v, want ErrNoIdentity", err)
		}
	})
}

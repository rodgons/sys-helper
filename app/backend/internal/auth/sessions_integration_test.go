//go:build integration

package auth_test

import (
	"context"
	"errors"
	"testing"

	"sys-helper/backend/internal/auth"
	"sys-helper/backend/internal/testdb"
)

func TestSessions(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()
	sessions := auth.Sessions{DB: pool}

	t.Run("accepts the user's live session", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")
		session := testdb.Session(t, pool, user)

		if err := sessions.Check(ctx, user, session); err != nil {
			t.Errorf("Check = %v", err)
		}
	})

	invalid := func(t *testing.T, userID, sessionID string) {
		t.Helper()
		if err := sessions.Check(ctx, userID, sessionID); !errors.Is(err, auth.ErrInvalidToken) {
			t.Errorf("Check = %v, want ErrInvalidToken", err)
		}
	}

	t.Run("rejects a session that ended (signed out or revoked)", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")
		session := testdb.Session(t, pool, user)
		if _, err := pool.Exec(ctx, `DELETE FROM auth.sessions WHERE id = $1`, session); err != nil {
			t.Fatal(err)
		}

		invalid(t, user, session)
	})

	t.Run("rejects a session past its time limit", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")
		session := testdb.Session(t, pool, user)
		if _, err := pool.Exec(ctx, `UPDATE auth.sessions SET not_after = now() - interval '1 minute' WHERE id = $1`, session); err != nil {
			t.Fatal(err)
		}

		invalid(t, user, session)
	})

	t.Run("rejects another user's session", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")
		other := testdb.User(t, pool, "hubot")

		invalid(t, user, testdb.Session(t, pool, other))
	})

	t.Run("rejects a banned user", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")
		session := testdb.Session(t, pool, user)
		if _, err := pool.Exec(ctx, `UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = $1`, user); err != nil {
			t.Fatal(err)
		}

		invalid(t, user, session)
	})

	t.Run("rejects a malformed session id", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")

		invalid(t, user, "not-a-uuid")
	})
}

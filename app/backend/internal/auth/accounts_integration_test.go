//go:build integration

package auth_test

import (
	"context"
	"testing"

	"sys-helper/backend/internal/auth"
	"sys-helper/backend/internal/projects"
	"sys-helper/backend/internal/testdb"
)

func TestAccounts(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()

	t.Run("deletes the User with their identities, sessions and Projects, and nobody else's", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")
		other := testdb.User(t, pool, "hubot")
		testdb.Session(t, pool, user)
		for _, id := range []string{user, other} {
			if _, err := projects.NewStore(pool).Create(ctx, id, "Shop"); err != nil {
				t.Fatal(err)
			}
		}

		if err := (auth.Accounts{DB: pool}).Delete(ctx, user); err != nil {
			t.Fatalf("Delete: %v", err)
		}

		count := func(sql, id string) int {
			var n int
			if err := pool.QueryRow(ctx, sql, id).Scan(&n); err != nil {
				t.Fatal(err)
			}
			return n
		}
		for _, sql := range []string{
			`SELECT count(*) FROM auth.users WHERE id = $1`,
			`SELECT count(*) FROM auth.identities WHERE user_id = $1`,
			`SELECT count(*) FROM auth.sessions WHERE user_id = $1`,
			`SELECT count(*) FROM projects WHERE user_id = $1`,
		} {
			if n := count(sql, user); n != 0 {
				t.Errorf("%s: %d rows left", sql, n)
			}
		}
		if n := count(`SELECT count(*) FROM projects WHERE user_id = $1`, other); n != 1 {
			t.Errorf("the other User has %d projects, want 1", n)
		}
	})
}

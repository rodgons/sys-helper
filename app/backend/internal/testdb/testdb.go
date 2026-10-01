//go:build integration

// Package testdb gives integration tests a connection to the local Supabase Postgres and fixtures
// for rows owned by Supabase Auth.
package testdb

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"sys-helper/backend/internal/database"
)

// Pool connects to DATABASE_URL (exported by make from the root .env).
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Fatal("DATABASE_URL is required for integration tests")
	}
	pool, err := database.Connect(context.Background(), url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// User creates a Supabase user, linked to a GitHub identity (with a random numeric GitHub user id)
// when githubUsername is not empty, and
// deletes it (and everything that cascades from it) when the test ends. It returns the user ID.
func User(t *testing.T, pool *pgxpool.Pool, githubUsername string) string {
	t.Helper()
	ctx := context.Background()
	var id string
	err := pool.QueryRow(ctx, `
		INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
		VALUES (gen_random_uuid(), 'authenticated', 'authenticated', gen_random_uuid() || '@test.local', now(), now())
		RETURNING id`).Scan(&id)
	if err != nil {
		t.Fatalf("insert auth.users: %v", err)
	}
	t.Cleanup(func() {
		if _, err := pool.Exec(context.Background(), `DELETE FROM auth.users WHERE id = $1`, id); err != nil {
			t.Errorf("delete auth.users: %v", err)
		}
	})
	if githubUsername == "" {
		return id
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
		VALUES ((1e9 + floor(random() * 1e9))::bigint::text, $1, jsonb_build_object('user_name', $2::text, 'avatar_url', $3::text), 'github', now(), now())`,
		id, githubUsername, fmt.Sprintf("https://avatars.test/%s", githubUsername))
	if err != nil {
		t.Fatalf("insert auth.identities: %v", err)
	}
	return id
}

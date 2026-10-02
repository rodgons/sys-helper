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

// Option adds to the user User creates.
type Option func(*testing.T, *pgxpool.Pool, string)

// WithGoogle links a Google identity (with a random sub) named fullName, as Supabase Auth stores it
// after a Google sign-in.
func WithGoogle(fullName string) Option {
	return func(t *testing.T, pool *pgxpool.Pool, id string) {
		t.Helper()
		_, err := pool.Exec(context.Background(), `
			INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
			VALUES ((1e20 + floor(random() * 1e19))::numeric::text, $1,
				jsonb_build_object('full_name', $2::text, 'name', $2::text, 'email', $3::text,
					'email_verified', true, 'avatar_url', $4::text, 'picture', $4::text),
				'google', now(), now())`,
			id, fullName, fmt.Sprintf("%s@gmail.test", id), fmt.Sprintf("https://avatars.test/google/%s", id))
		if err != nil {
			t.Fatalf("insert Google identity: %v", err)
		}
	}
}

// User creates a Supabase user and deletes it (and everything that cascades from it) when the test
// ends. It links a GitHub identity (with a random numeric GitHub user id) when githubUsername is not
// empty, plus any identities opts add, so it can make GitHub-only, Google-only, linked and
// identity-less users. It returns the user ID.
func User(t *testing.T, pool *pgxpool.Pool, githubUsername string, opts ...Option) string {
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
	if githubUsername != "" {
		_, err = pool.Exec(ctx, `
			INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
			VALUES ((1e9 + floor(random() * 1e9))::bigint::text, $1, jsonb_build_object('user_name', $2::text, 'avatar_url', $3::text), 'github', now(), now())`,
			id, githubUsername, fmt.Sprintf("https://avatars.test/%s", githubUsername))
		if err != nil {
			t.Fatalf("insert auth.identities: %v", err)
		}
	}
	for _, opt := range opts {
		opt(t, pool, id)
	}
	return id
}

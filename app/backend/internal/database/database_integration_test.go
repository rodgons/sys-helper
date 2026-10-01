//go:build integration

package database_test

import (
	"context"
	"os"
	"testing"

	"sys-helper/backend/internal/database"
)

// Runs against the local Supabase Postgres: `make test-integration`.
func TestConnect(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Fatal("DATABASE_URL is required for integration tests")
	}

	pool, err := database.Connect(context.Background(), url)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(pool.Close)

	var one int
	if err := pool.QueryRow(context.Background(), "select 1").Scan(&one); err != nil || one != 1 {
		t.Fatalf("select 1 = %d, err = %v", one, err)
	}
}

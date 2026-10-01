package config_test

import (
	"slices"
	"testing"

	"sys-helper/backend/internal/config"
)

func env(vars map[string]string) func(string) string {
	return func(key string) string { return vars[key] }
}

// required holds the variables every valid config needs, plus any extras.
func required(extra map[string]string) map[string]string {
	vars := map[string]string{"DATABASE_URL": "postgres://x", "SUPABASE_URL": "http://supabase.test"}
	for k, v := range extra {
		vars[k] = v
	}
	return vars
}

func TestLoad(t *testing.T) {
	t.Run("applies defaults", func(t *testing.T) {
		cfg, err := config.Load(env(required(nil)))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.Port != "8080" {
			t.Errorf("Port = %q, want 8080", cfg.Port)
		}
		if len(cfg.AllowedOrigins) != 0 {
			t.Errorf("AllowedOrigins = %v, want empty", cfg.AllowedOrigins)
		}
		if len(cfg.AllowedGitHubUsers) != 0 {
			t.Errorf("AllowedGitHubUsers = %v, want empty", cfg.AllowedGitHubUsers)
		}
	})

	t.Run("parses allowed origins", func(t *testing.T) {
		cfg, err := config.Load(env(required(map[string]string{
			"CORS_ALLOWED_ORIGINS": "http://a.test, http://b.test,",
		})))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := []string{"http://a.test", "http://b.test"}
		if !slices.Equal(cfg.AllowedOrigins, want) {
			t.Errorf("AllowedOrigins = %v, want %v", cfg.AllowedOrigins, want)
		}
	})

	t.Run("parses the GitHub allowlist case-insensitively", func(t *testing.T) {
		cfg, err := config.Load(env(required(map[string]string{
			"ALLOWED_GITHUB_USERS": "Octocat, hubot,",
		})))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := []string{"octocat", "hubot"}
		if !slices.Equal(cfg.AllowedGitHubUsers, want) {
			t.Errorf("AllowedGitHubUsers = %v, want %v", cfg.AllowedGitHubUsers, want)
		}
	})

	t.Run("reads the Supabase URL", func(t *testing.T) {
		cfg, err := config.Load(env(required(nil)))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.SupabaseURL != "http://supabase.test" {
			t.Errorf("SupabaseURL = %q", cfg.SupabaseURL)
		}
	})

	for _, key := range []string{"DATABASE_URL", "SUPABASE_URL"} {
		t.Run("requires "+key, func(t *testing.T) {
			vars := required(nil)
			delete(vars, key)
			if _, err := config.Load(env(vars)); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	}
}

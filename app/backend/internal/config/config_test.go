package config_test

import (
	"slices"
	"testing"

	"sys-helper/backend/internal/config"
)

func env(vars map[string]string) func(string) string {
	return func(key string) string { return vars[key] }
}

func TestLoad(t *testing.T) {
	t.Run("applies defaults", func(t *testing.T) {
		cfg, err := config.Load(env(map[string]string{"DATABASE_URL": "postgres://x"}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.Port != "8080" {
			t.Errorf("Port = %q, want 8080", cfg.Port)
		}
		if len(cfg.AllowedOrigins) != 0 {
			t.Errorf("AllowedOrigins = %v, want empty", cfg.AllowedOrigins)
		}
	})

	t.Run("parses allowed origins", func(t *testing.T) {
		cfg, err := config.Load(env(map[string]string{
			"DATABASE_URL":         "postgres://x",
			"CORS_ALLOWED_ORIGINS": "http://a.test, http://b.test,",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := []string{"http://a.test", "http://b.test"}
		if !slices.Equal(cfg.AllowedOrigins, want) {
			t.Errorf("AllowedOrigins = %v, want %v", cfg.AllowedOrigins, want)
		}
	})

	t.Run("requires DATABASE_URL", func(t *testing.T) {
		if _, err := config.Load(env(nil)); err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

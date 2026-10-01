package config_test

import (
	"slices"
	"testing"
	"time"

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
		if len(cfg.AllowedGitHubIDs) != 0 || cfg.AllowAllGitHubUsers {
			t.Errorf("allowlist = %v (all: %v), want empty and closed", cfg.AllowedGitHubIDs, cfg.AllowAllGitHubUsers)
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

	t.Run("parses the GitHub allowlist of numeric ids", func(t *testing.T) {
		cfg, err := config.Load(env(required(map[string]string{
			"ALLOWED_GITHUB_IDS": "583231, 9919,",
		})))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := []string{"583231", "9919"}
		if !slices.Equal(cfg.AllowedGitHubIDs, want) {
			t.Errorf("AllowedGitHubIDs = %v, want %v", cfg.AllowedGitHubIDs, want)
		}
	})

	t.Run("opts in to every GitHub user explicitly", func(t *testing.T) {
		cfg, err := config.Load(env(required(map[string]string{"ALLOW_ALL_GITHUB_USERS": "1"})))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !cfg.AllowAllGitHubUsers {
			t.Error("AllowAllGitHubUsers = false, want true")
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

	t.Run("takes the models from the environment", func(t *testing.T) {
		cfg, err := config.Load(env(required(map[string]string{
			"NVIDIA_API_KEY":    "nvapi-x",
			"AI_MODEL":          "z-ai/glm-5.3",
			"AI_FALLBACK_MODEL": "openai/gpt-oss-20b",
		})))
		if err != nil {
			t.Fatal(err)
		}
		want := config.AI{
			Provider:          "nvidia",
			KeyVar:            "NVIDIA_API_KEY",
			BaseURL:           "https://integrate.api.nvidia.com/v1",
			APIKey:            "nvapi-x",
			Model:             "z-ai/glm-5.3",
			FallbackModel:     "openai/gpt-oss-20b",
			FirstTokenTimeout: 20 * time.Second,
			DailyMessageLimit: 100,
		}
		if cfg.AI != want {
			t.Errorf("AI = %+v, want %+v", cfg.AI, want)
		}
	})

	t.Run("uses Gemini when AI_PROVIDER is gemini", func(t *testing.T) {
		cfg, err := config.Load(env(required(map[string]string{
			"AI_PROVIDER":       "gemini",
			"GEMINI_API_KEY":    "gem-x",
			"NVIDIA_API_KEY":    "nvapi-x",
			"AI_MODEL":          "gemini-3.8-flash",
			"AI_FALLBACK_MODEL": "gemini-3.5-flash-lite",
		})))
		if err != nil {
			t.Fatal(err)
		}
		ai := cfg.AI
		if ai.Provider != "gemini" || ai.APIKey != "gem-x" || ai.KeyVar != "GEMINI_API_KEY" ||
			ai.BaseURL != "https://generativelanguage.googleapis.com/v1beta/openai" || ai.Model != "gemini-3.8-flash" {
			t.Errorf("AI = %+v", ai)
		}
	})

	t.Run("reads AI overrides", func(t *testing.T) {
		cfg, err := config.Load(env(required(map[string]string{
			"AI_BASE_URL":            "http://models.test/v1",
			"AI_FIRST_TOKEN_TIMEOUT": "5s",
			"AI_DAILY_MESSAGE_LIMIT": "0",
			"AI_FAKE":                "1",
		})))
		if err != nil {
			t.Fatal(err)
		}
		ai := cfg.AI
		if ai.BaseURL != "http://models.test/v1" || ai.FallbackModel != "" ||
			ai.FirstTokenTimeout != 5*time.Second || ai.DailyMessageLimit != 0 || !ai.Fake {
			t.Errorf("AI = %+v", ai)
		}
	})

	t.Run("runs without a model when there is no API key", func(t *testing.T) {
		cfg, err := config.Load(env(required(nil)))
		if err != nil || cfg.AI.Model != "" || cfg.AI.FallbackModel != "" {
			t.Fatalf("AI = %+v, err = %v", cfg.AI, err)
		}
	})

	for _, bad := range []map[string]string{
		{"AI_FIRST_TOKEN_TIMEOUT": "soon"},
		{"AI_DAILY_MESSAGE_LIMIT": "-1"},
		{"NVIDIA_API_KEY": "nvapi-x"}, // a key without AI_MODEL
		{"AI_PROVIDER": "gemini", "GEMINI_API_KEY": "gem-x"},
		{"AI_PROVIDER": "openai"},
	} {
		t.Run("rejects invalid AI settings", func(t *testing.T) {
			if _, err := config.Load(env(required(bad))); err == nil {
				t.Fatalf("Load(%v) succeeded", bad)
			}
		})
	}

	for _, bad := range []map[string]string{
		{"ALLOWED_GITHUB_IDS": "octocat"},   // usernames aren't ids
		{"ALLOWED_GITHUB_USERS": "octocat"}, // the old username allowlist must be migrated
	} {
		t.Run("rejects an allowlist of usernames", func(t *testing.T) {
			if _, err := config.Load(env(required(bad))); err == nil {
				t.Fatalf("Load(%v) succeeded", bad)
			}
		})
	}

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

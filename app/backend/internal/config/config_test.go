package config_test

import (
	"reflect"
	"slices"
	"strings"
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
		if len(cfg.AllowedGitHubIDs) != 0 || len(cfg.AllowedGoogleIDs) != 0 || cfg.AllowAllUsers {
			t.Errorf("allowlist = %v, %v (all: %v), want empty and closed", cfg.AllowedGitHubIDs, cfg.AllowedGoogleIDs, cfg.AllowAllUsers)
		}
	})

	t.Run("gives requests 10s to finish on shutdown unless told otherwise", func(t *testing.T) {
		cfg, err := config.Load(env(required(nil)))
		if err != nil || cfg.ShutdownTimeout != 10*time.Second {
			t.Fatalf("default ShutdownTimeout = %v, %v", cfg.ShutdownTimeout, err)
		}
		cfg, err = config.Load(env(required(map[string]string{"SHUTDOWN_TIMEOUT": "4m"})))
		if err != nil || cfg.ShutdownTimeout != 4*time.Minute {
			t.Errorf("SHUTDOWN_TIMEOUT=4m: %v, %v", cfg.ShutdownTimeout, err)
		}
		if _, err := config.Load(env(required(map[string]string{"SHUTDOWN_TIMEOUT": "soon"}))); err == nil {
			t.Error("SHUTDOWN_TIMEOUT=soon: expected an error")
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

	t.Run("parses the Google allowlist of subs", func(t *testing.T) {
		cfg, err := config.Load(env(required(map[string]string{
			"ALLOWED_GOOGLE_IDS": "108378921029384756123, 42,",
		})))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := []string{"108378921029384756123", "42"}
		if !slices.Equal(cfg.AllowedGoogleIDs, want) {
			t.Errorf("AllowedGoogleIDs = %v, want %v", cfg.AllowedGoogleIDs, want)
		}
	})

	t.Run("opts in to every user explicitly", func(t *testing.T) {
		cfg, err := config.Load(env(required(map[string]string{"ALLOW_ALL_USERS": "1"})))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !cfg.AllowAllUsers {
			t.Error("AllowAllUsers = false, want true")
		}
	})

	t.Run("names the replacement for ALLOW_ALL_GITHUB_USERS", func(t *testing.T) {
		_, err := config.Load(env(required(map[string]string{"ALLOW_ALL_GITHUB_USERS": "1"})))
		if err == nil || !strings.Contains(err.Error(), "ALLOW_ALL_USERS") {
			t.Fatalf("err = %v, want one naming ALLOW_ALL_USERS", err)
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

	t.Run("uses OpenRouter's free models by default", func(t *testing.T) {
		cfg, err := config.Load(env(required(map[string]string{"OPENROUTER_API_KEY": "sk-or-x"})))
		if err != nil {
			t.Fatal(err)
		}
		want := config.AI{
			BaseURL:           "https://openrouter.ai/api/v1",
			APIKey:            "sk-or-x",
			RefreshInterval:   time.Hour,
			FirstTokenTimeout: 20 * time.Second,
			DailyReplyLimit:   100,
			GlobalDailyLimit:  50,
		}
		if !reflect.DeepEqual(cfg.AI, want) {
			t.Errorf("AI = %+v, want %+v", cfg.AI, want)
		}
	})

	t.Run("reads AI overrides", func(t *testing.T) {
		cfg, err := config.Load(env(required(map[string]string{
			"AI_BASE_URL":            "http://models.test/v1",
			"AI_MODELS":              "a/one:free, b/two:free",
			"AI_EXCLUDE_MODELS":      "c/three:free",
			"AI_MODELS_REFRESH":      "30m",
			"AI_FIRST_TOKEN_TIMEOUT": "5s",
			"AI_DAILY_REPLY_LIMIT":   "0",
			"AI_GLOBAL_DAILY_LIMIT":  "1000",
			"AI_FAKE":                "1",
		})))
		if err != nil {
			t.Fatal(err)
		}
		want := config.AI{
			BaseURL:           "http://models.test/v1",
			Models:            []string{"a/one:free", "b/two:free"},
			ExcludeModels:     []string{"c/three:free"},
			RefreshInterval:   30 * time.Minute,
			FirstTokenTimeout: 5 * time.Second,
			DailyReplyLimit:   0,
			GlobalDailyLimit:  1000,
			Fake:              true,
		}
		if !reflect.DeepEqual(cfg.AI, want) {
			t.Errorf("AI = %+v, want %+v", cfg.AI, want)
		}
	})

	t.Run("runs without a model when there is no API key", func(t *testing.T) {
		cfg, err := config.Load(env(required(nil)))
		if err != nil || cfg.AI.APIKey != "" {
			t.Fatalf("AI = %+v, err = %v", cfg.AI, err)
		}
	})

	for _, bad := range []map[string]string{
		{"AI_FIRST_TOKEN_TIMEOUT": "soon"},
		{"AI_MODELS_REFRESH": "0s"},
		{"AI_DAILY_REPLY_LIMIT": "-1"},
		{"AI_GLOBAL_DAILY_LIMIT": "lots"},
		{"AI_DAILY_MESSAGE_LIMIT": "100"}, // replaced by AI_DAILY_REPLY_LIMIT
		{"AI_MODELS": "openai/gpt-9"},     // a paid model
	} {
		t.Run("rejects invalid AI settings", func(t *testing.T) {
			if _, err := config.Load(env(required(bad))); err == nil {
				t.Fatalf("Load(%v) succeeded", bad)
			}
		})
	}

	// Settings of the providers OpenRouter replaced: a deployment that still sets them must notice.
	for _, old := range []string{"AI_PROVIDER", "AI_MODEL", "AI_FALLBACK_MODEL", "NVIDIA_API_KEY", "GEMINI_API_KEY"} {
		t.Run("names the replacement for "+old, func(t *testing.T) {
			_, err := config.Load(env(required(map[string]string{old: "x"})))
			if err == nil || !strings.Contains(err.Error(), old) || !strings.Contains(err.Error(), "OPENROUTER_API_KEY") {
				t.Fatalf("err = %v, want one naming %s and OPENROUTER_API_KEY", err, old)
			}
		})
	}

	for _, bad := range []map[string]string{
		{"ALLOWED_GITHUB_IDS": "octocat"},       // usernames aren't ids
		{"ALLOWED_GITHUB_USERS": "octocat"},     // the old username allowlist must be migrated
		{"ALLOWED_GOOGLE_IDS": "ada@gmail.com"}, // emails aren't ids
		{"ALLOWED_GOOGLE_IDS": "108 109"},       // a missing comma
	} {
		t.Run("rejects an allowlist of usernames or emails", func(t *testing.T) {
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

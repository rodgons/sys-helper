// Package config loads runtime configuration from environment variables.
package config

import (
	"errors"
	"strings"
)

type Config struct {
	Port           string
	DatabaseURL    string
	AllowedOrigins []string
	// SupabaseURL is the Supabase API base URL; access tokens are verified against its Auth JWKS.
	SupabaseURL string
	// AllowedGitHubUsers is the lowercase beta allowlist. Empty lets every GitHub user in.
	AllowedGitHubUsers []string
}

// Load builds a Config from getenv (os.Getenv in production, a stub in tests).
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:               getenv("PORT"),
		DatabaseURL:        getenv("DATABASE_URL"),
		SupabaseURL:        getenv("SUPABASE_URL"),
		AllowedOrigins:     splitList(getenv("CORS_ALLOWED_ORIGINS")),
		AllowedGitHubUsers: splitList(strings.ToLower(getenv("ALLOWED_GITHUB_USERS"))),
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if cfg.SupabaseURL == "" {
		return Config{}, errors.New("SUPABASE_URL is required")
	}
	return cfg, nil
}

// splitList parses a comma-separated list, trimming spaces and dropping empty entries.
func splitList(s string) []string {
	var out []string
	for item := range strings.SplitSeq(s, ",") {
		if item = strings.TrimSpace(item); item != "" {
			out = append(out, item)
		}
	}
	return out
}

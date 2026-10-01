// Package config loads runtime configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port           string
	DatabaseURL    string
	AllowedOrigins []string
	// SupabaseURL is the Supabase API base URL; access tokens are verified against its Auth JWKS.
	SupabaseURL string
	// AllowedGitHubUsers is the lowercase beta allowlist. Empty lets every GitHub user in.
	AllowedGitHubUsers []string
	AI                 AI
}

// AI configures the chat model behind the assistant: an OpenAI-compatible endpoint (NVIDIA's API
// catalog by default), a primary model, and a fallback used when the primary is slow to start.
type AI struct {
	BaseURL       string
	APIKey        string
	Model         string // AI_MODEL, required with an API key
	FallbackModel string // AI_FALLBACK_MODEL; empty disables the fallback
	// FirstTokenTimeout is how long the primary model gets to start answering before the fallback
	// takes over.
	FirstTokenTimeout time.Duration
	DailyMessageLimit int // per User per UTC day; 0 means no cap
	// Fake replaces the model with a canned one (E2E tests, offline development).
	Fake bool
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
	ai, err := loadAI(getenv)
	if err != nil {
		return Config{}, err
	}
	cfg.AI = ai
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

func loadAI(getenv func(string) string) (AI, error) {
	ai := AI{
		BaseURL:           or(getenv("AI_BASE_URL"), "https://integrate.api.nvidia.com/v1"),
		APIKey:            getenv("NVIDIA_API_KEY"),
		Model:             getenv("AI_MODEL"),
		FallbackModel:     getenv("AI_FALLBACK_MODEL"),
		FirstTokenTimeout: 20 * time.Second,
		DailyMessageLimit: 100,
		Fake:              getenv("AI_FAKE") == "1",
	}
	if ai.APIKey != "" && !ai.Fake && ai.Model == "" {
		return AI{}, errors.New("AI_MODEL is required when NVIDIA_API_KEY is set (e.g. AI_MODEL=z-ai/glm-5.3)")
	}
	if v := getenv("AI_FIRST_TOKEN_TIMEOUT"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			return AI{}, fmt.Errorf("AI_FIRST_TOKEN_TIMEOUT must be a positive duration like 20s, got %q", v)
		}
		ai.FirstTokenTimeout = d
	}
	if v := getenv("AI_DAILY_MESSAGE_LIMIT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return AI{}, fmt.Errorf("AI_DAILY_MESSAGE_LIMIT must be 0 or more, got %q", v)
		}
		ai.DailyMessageLimit = n
	}
	return ai, nil
}

func or(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
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

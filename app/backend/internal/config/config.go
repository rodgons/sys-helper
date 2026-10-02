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
	// AllowedGitHubIDs and AllowedGoogleIDs are the beta allowlist: numeric GitHub user ids
	// (ALLOWED_GITHUB_IDS) and Google subs (ALLOWED_GOOGLE_IDS). Both empty admit nobody unless
	// AllowAllUsers (ALLOW_ALL_USERS=1) opts in to everyone.
	AllowedGitHubIDs []string
	AllowedGoogleIDs []string
	AllowAllUsers    bool
	AI               AI
}

// AI configures the chat model behind the assistant: a provider's OpenAI-compatible endpoint, a
// primary model, and a fallback used when the primary is slow to start.
type AI struct {
	Provider      string // AI_PROVIDER: "nvidia" (default) or "gemini"
	BaseURL       string // AI_BASE_URL, defaulting to the provider's endpoint
	APIKey        string // read from KeyVar
	KeyVar        string // the provider's key variable, e.g. GEMINI_API_KEY
	Model         string // AI_MODEL, required with an API key
	FallbackModel string // AI_FALLBACK_MODEL; empty disables the fallback
	// FirstTokenTimeout is how long the primary model gets to start answering before the fallback
	// takes over.
	FirstTokenTimeout time.Duration
	DailyReplyLimit   int // model calls per User per UTC day (AI_DAILY_REPLY_LIMIT); 0 means no cap
	// Fake replaces the model with a canned one (E2E tests, offline development).
	Fake bool
}

// Load builds a Config from getenv (os.Getenv in production, a stub in tests).
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:             getenv("PORT"),
		DatabaseURL:      getenv("DATABASE_URL"),
		SupabaseURL:      getenv("SUPABASE_URL"),
		AllowedOrigins:   splitList(getenv("CORS_ALLOWED_ORIGINS")),
		AllowedGitHubIDs: splitList(getenv("ALLOWED_GITHUB_IDS")),
		AllowedGoogleIDs: splitList(getenv("ALLOWED_GOOGLE_IDS")),
		AllowAllUsers:    getenv("ALLOW_ALL_USERS") == "1",
	}
	if getenv("ALLOW_ALL_GITHUB_USERS") != "" {
		return Config{}, errors.New("ALLOW_ALL_GITHUB_USERS was replaced by ALLOW_ALL_USERS, which admits everyone on any sign-in provider")
	}
	if getenv("ALLOWED_GITHUB_USERS") != "" {
		return Config{}, errors.New("ALLOWED_GITHUB_USERS was replaced by ALLOWED_GITHUB_IDS: list numeric GitHub user ids " +
			"(see https://api.github.com/users/<username>), because usernames can change hands")
	}
	for _, id := range cfg.AllowedGitHubIDs {
		if _, err := strconv.ParseUint(id, 10, 64); err != nil {
			return Config{}, fmt.Errorf("ALLOWED_GITHUB_IDS must list numeric GitHub user ids, got %q", id)
		}
	}
	for _, id := range cfg.AllowedGoogleIDs {
		if strings.ContainsAny(id, " \t@") {
			return Config{}, fmt.Errorf("ALLOWED_GOOGLE_IDS must list comma-separated Google account ids (not emails), got %q", id)
		}
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

// providers maps each AI_PROVIDER to its key variable and OpenAI-compatible endpoint.
var providers = map[string]struct{ keyVar, baseURL, exampleModel string }{
	"nvidia": {"NVIDIA_API_KEY", "https://integrate.api.nvidia.com/v1", "z-ai/glm-5.3"},
	"gemini": {"GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-3.8-flash"},
}

func loadAI(getenv func(string) string) (AI, error) {
	name := or(getenv("AI_PROVIDER"), "nvidia")
	p, ok := providers[name]
	if !ok {
		return AI{}, fmt.Errorf("AI_PROVIDER must be nvidia or gemini, got %q", name)
	}
	ai := AI{
		Provider:          name,
		BaseURL:           or(getenv("AI_BASE_URL"), p.baseURL),
		APIKey:            getenv(p.keyVar),
		KeyVar:            p.keyVar,
		Model:             getenv("AI_MODEL"),
		FallbackModel:     getenv("AI_FALLBACK_MODEL"),
		FirstTokenTimeout: 20 * time.Second,
		DailyReplyLimit:   100,
		Fake:              getenv("AI_FAKE") == "1",
	}
	if ai.APIKey != "" && !ai.Fake && ai.Model == "" {
		return AI{}, fmt.Errorf("AI_MODEL is required when %s is set (e.g. AI_MODEL=%s)", p.keyVar, p.exampleModel)
	}
	if v := getenv("AI_FIRST_TOKEN_TIMEOUT"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			return AI{}, fmt.Errorf("AI_FIRST_TOKEN_TIMEOUT must be a positive duration like 20s, got %q", v)
		}
		ai.FirstTokenTimeout = d
	}
	if getenv("AI_DAILY_MESSAGE_LIMIT") != "" {
		return AI{}, errors.New("AI_DAILY_MESSAGE_LIMIT was replaced by AI_DAILY_REPLY_LIMIT, which counts model calls (each reply, and each proposal retry) instead of messages")
	}
	if v := getenv("AI_DAILY_REPLY_LIMIT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return AI{}, fmt.Errorf("AI_DAILY_REPLY_LIMIT must be 0 or more, got %q", v)
		}
		ai.DailyReplyLimit = n
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

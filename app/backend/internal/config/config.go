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
	// ShutdownTimeout (SHUTDOWN_TIMEOUT) is how long a stopping server lets requests finish. AI
	// replies stream for minutes, so production should allow more than the 10s default (and the
	// platform's stop grace period must allow it too).
	ShutdownTimeout time.Duration
	AI              AI
}

// AI configures the assistant's models: OpenRouter's free models, discovered at runtime (or
// pinned), tried best first.
type AI struct {
	BaseURL string // AI_BASE_URL, defaulting to OpenRouter's API
	APIKey  string // OPENROUTER_API_KEY; empty disables AI replies
	// Models (AI_MODELS) pins the free models to try, in order, instead of discovering them.
	// ExcludeModels (AI_EXCLUDE_MODELS) are never used.
	Models        []string
	ExcludeModels []string
	// RefreshInterval is how often the free model list is fetched again (AI_MODELS_REFRESH).
	RefreshInterval time.Duration
	// FirstTokenTimeout is how long a model gets to start answering before the next one is tried.
	FirstTokenTimeout time.Duration
	DailyReplyLimit   int // model calls per User per UTC day (AI_DAILY_REPLY_LIMIT); 0 means no cap
	// GlobalDailyLimit caps requests to OpenRouter per UTC day across all Users, fallbacks included
	// (AI_GLOBAL_DAILY_LIMIT), to stay within the account's free quota; 0 means no cap.
	GlobalDailyLimit int
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
	cfg.ShutdownTimeout = 10 * time.Second
	if v := getenv("SHUTDOWN_TIMEOUT"); v != "" {
		parsed, err := time.ParseDuration(v)
		if err != nil || parsed <= 0 {
			return Config{}, fmt.Errorf("SHUTDOWN_TIMEOUT must be a positive duration like 10s or 4m, got %q", v)
		}
		cfg.ShutdownTimeout = parsed
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

// removedAI are the settings of the providers OpenRouter replaced.
var removedAI = []string{"AI_PROVIDER", "AI_MODEL", "AI_FALLBACK_MODEL", "NVIDIA_API_KEY", "GEMINI_API_KEY"}

func loadAI(getenv func(string) string) (AI, error) {
	for _, name := range removedAI {
		if getenv(name) != "" {
			return AI{}, fmt.Errorf("%s was removed: the assistant now uses OpenRouter's free models, found at runtime. "+
				"Set OPENROUTER_API_KEY instead (AI_MODELS pins free models if you need to)", name)
		}
	}
	if getenv("AI_DAILY_MESSAGE_LIMIT") != "" {
		return AI{}, errors.New("AI_DAILY_MESSAGE_LIMIT was replaced by AI_DAILY_REPLY_LIMIT, which counts model calls (each reply, and each proposal retry) instead of messages")
	}
	ai := AI{
		BaseURL:           or(getenv("AI_BASE_URL"), "https://openrouter.ai/api/v1"),
		APIKey:            getenv("OPENROUTER_API_KEY"),
		Models:            splitList(getenv("AI_MODELS")),
		ExcludeModels:     splitList(getenv("AI_EXCLUDE_MODELS")),
		RefreshInterval:   time.Hour,
		FirstTokenTimeout: 20 * time.Second,
		DailyReplyLimit:   100,
		GlobalDailyLimit:  50, // OpenRouter's free quota without purchased credits
		Fake:              getenv("AI_FAKE") == "1",
	}
	for _, m := range ai.Models {
		if !strings.HasSuffix(m, ":free") {
			return AI{}, fmt.Errorf("AI_MODELS must list free model ids (ending in :free), got %q", m)
		}
	}
	for _, d := range []struct {
		name string
		into *time.Duration
	}{{"AI_MODELS_REFRESH", &ai.RefreshInterval}, {"AI_FIRST_TOKEN_TIMEOUT", &ai.FirstTokenTimeout}} {
		if v := getenv(d.name); v != "" {
			parsed, err := time.ParseDuration(v)
			if err != nil || parsed <= 0 {
				return AI{}, fmt.Errorf("%s must be a positive duration like 20s or 1h, got %q", d.name, v)
			}
			*d.into = parsed
		}
	}
	for _, l := range []struct {
		name string
		into *int
	}{{"AI_DAILY_REPLY_LIMIT", &ai.DailyReplyLimit}, {"AI_GLOBAL_DAILY_LIMIT", &ai.GlobalDailyLimit}} {
		if v := getenv(l.name); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 0 {
				return AI{}, fmt.Errorf("%s must be 0 or more, got %q", l.name, v)
			}
			*l.into = n
		}
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

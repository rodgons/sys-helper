package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/assistant"
	"sys-helper/backend/internal/auth"
	"sys-helper/backend/internal/config"
	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/database"
	"sys-helper/backend/internal/explain"
	"sys-helper/backend/internal/httpapi"
	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/llm"
	"sys-helper/backend/internal/projects"
	"sys-helper/backend/internal/usage"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}

	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	tokens, err := auth.NewVerifier(ctx, cfg.SupabaseURL)
	if err != nil {
		return err
	}

	projectStore := projects.NewStore(db)
	projectStore.OnCreate = conversation.AddWelcome // every Conversation opens with the Welcome Message
	conversations := conversation.NewStore(db)
	architectures := architecture.NewStore(db)
	// Saves only hide Decisions whose items are gone (knowledge.Load), so an undo can bring them
	// back; they are deleted when the Project is next opened.
	architectures.OnOpen = knowledge.PruneDecisions
	knowledgeStore := knowledge.NewStore(db)
	go usage.RunPruner(ctx, db) // the daily caps only need recent rows
	ai := &assistant.Assistant{
		Model:         chatModel(ctx, cfg.AI, usage.NewBudget(db, cfg.AI.GlobalDailyLimit)),
		Conversations: conversations,
		Architectures: architectures,
		Knowledge:     knowledgeStore,
		Usage:         usage.NewMeter(db, cfg.AI.DailyReplyLimit),
		HistoryLimit:  30,
		Timeout:       3 * time.Minute,
	}

	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: httpapi.NewRouter(httpapi.Deps{
			DB:               db,
			Auth:             auth.Authenticator{Tokens: tokens, Sessions: auth.Sessions{DB: db}, Identities: auth.Identities{DB: db}},
			Projects:         projectStore,
			Architectures:    architectures,
			Conversations:    conversations,
			Assistant:        ai,
			NewConversations: ai, // a reset shares the reply-in-flight guard
			Reviews:          conversation.Reviews{Conversations: conversations, Architectures: architectures},
			Knowledge:        knowledgeStore,
			Settings:         knowledgeStore, // the default Experience Level lives with the per-Project one
			Accounts:         auth.Accounts{DB: db},
			Explanations:     explain.Embedded{},
			AllowedOrigins:   cfg.AllowedOrigins,
			Allowlist:        allowlist(cfg),
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	// Shutdown waits for in-flight requests, AI replies included, so they finish and save before
	// the database pool closes. Replies still running when the timeout ends are cut.
	slog.Info("shutting down", "timeout", cfg.ShutdownTimeout)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

// allowlist admits Users with a configured provider id, or everyone on explicit opt-in. Both risky setups are
// logged loudly: nobody can sign in, or anyone can spend AI credits.
func allowlist(cfg config.Config) auth.Allowlist {
	switch {
	case cfg.AllowAllUsers && !cfg.AI.Fake:
		slog.Warn("ALLOW_ALL_USERS=1: everyone with a GitHub or Google account can sign in and use the AI model")
	case !cfg.AllowAllUsers && len(cfg.AllowedGitHubIDs) == 0 && len(cfg.AllowedGoogleIDs) == 0:
		slog.Warn("ALLOWED_GITHUB_IDS and ALLOWED_GOOGLE_IDS are empty: nobody can sign in (set ALLOW_ALL_USERS=1 to admit everyone)")
	}
	return auth.Allowlist{GitHubIDs: cfg.AllowedGitHubIDs, GoogleIDs: cfg.AllowedGoogleIDs, Everyone: cfg.AllowAllUsers}
}

// maxModelAttempts caps the free models one model call tries before giving up (ai_unavailable).
// Each attempt spends the account's quota and up to AI_FIRST_TOKEN_TIMEOUT of the User's wait.
const maxModelAttempts = 3

// chatModel builds the assistant's model: the fake, or a Chain over OpenRouter's free models,
// whose list is refreshed in the background until ctx ends. It returns nil (replies answer "AI
// unavailable") when no API key is set.
func chatModel(ctx context.Context, cfg config.AI, budget *usage.Budget) llm.ChatModel {
	if cfg.Fake {
		slog.Warn("using the fake AI model (AI_FAKE=1)")
		return llm.Fake{}
	}
	if cfg.APIKey == "" {
		slog.Warn("OPENROUTER_API_KEY is not set; AI replies are disabled")
		return nil
	}
	catalog := &llm.Catalog{BaseURL: cfg.BaseURL, APIKey: cfg.APIKey, Exclude: cfg.ExcludeModels, Pinned: cfg.Models}
	if len(cfg.Models) > 0 {
		slog.Info("AI models pinned", "models", cfg.Models)
	}
	go catalog.Run(ctx, cfg.RefreshInterval)
	return &llm.Chain{
		Models: catalog,
		Client: func(model string) llm.ChatModel {
			return llm.OpenAIClient{BaseURL: cfg.BaseURL, APIKey: cfg.APIKey, Model: model}
		},
		FirstEventTimeout: cfg.FirstTokenTimeout,
		MaxAttempts:       maxModelAttempts,
		Budget:            budget.Spend,
	}
}

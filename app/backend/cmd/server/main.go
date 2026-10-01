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
	"sys-helper/backend/internal/httpapi"
	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/llm"
	"sys-helper/backend/internal/projects"
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
	architectures.AfterSave = knowledge.PruneDecisions // Decisions follow the items they explain
	knowledgeStore := knowledge.NewStore(db)

	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: httpapi.NewRouter(httpapi.Deps{
			DB:            db,
			Auth:          auth.Authenticator{Tokens: tokens, Identities: auth.Identities{DB: db}},
			Projects:      projectStore,
			Architectures: architectures,
			Conversations: conversations,
			Assistant: &assistant.Assistant{
				Model:         chatModel(cfg.AI),
				Conversations: conversations,
				Architectures: architectures,
				Knowledge:     knowledgeStore,
				HistoryLimit:  30,
				Timeout:       3 * time.Minute,
			},
			Reviews:            conversation.Reviews{Conversations: conversations, Architectures: architectures},
			Knowledge:          knowledgeStore,
			Settings:           knowledgeStore, // the default Experience Level lives with the per-Project one
			DailyMessageLimit:  cfg.AI.DailyMessageLimit,
			AllowedOrigins:     cfg.AllowedOrigins,
			AllowedGitHubUsers: cfg.AllowedGitHubUsers,
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

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

// chatModel builds the assistant's model: the fake, or the primary model with its fallback. It
// returns nil (replies answer "AI unavailable") when no API key is set.
func chatModel(cfg config.AI) llm.ChatModel {
	if cfg.Fake {
		slog.Warn("using the fake AI model (AI_FAKE=1)")
		return llm.Fake{}
	}
	if cfg.APIKey == "" {
		slog.Warn(cfg.KeyVar+" is not set; AI replies are disabled", "provider", cfg.Provider)
		return nil
	}
	slog.Info("AI model", "provider", cfg.Provider, "model", cfg.Model, "fallback", cfg.FallbackModel)
	primary := llm.OpenAIClient{BaseURL: cfg.BaseURL, APIKey: cfg.APIKey, Model: cfg.Model}
	if cfg.FallbackModel == "" {
		return primary
	}
	return llm.Fallback{
		Primary:           primary,
		Secondary:         llm.OpenAIClient{BaseURL: cfg.BaseURL, APIKey: cfg.APIKey, Model: cfg.FallbackModel},
		FirstEventTimeout: cfg.FirstTokenTimeout,
	}
}

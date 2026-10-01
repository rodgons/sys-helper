// Package httpapi wires HTTP routes using the standard library ServeMux.
package httpapi

import (
	"context"
	"net/http"
	"time"

	"sys-helper/backend/internal/auth"
)

// Pinger reports whether a dependency (e.g. the database) is reachable.
type Pinger interface {
	Ping(ctx context.Context) error
}

type Deps struct {
	DB             Pinger
	Auth           Authenticator
	Projects       ProjectStore
	Architectures  ArchitectureStore
	Conversations  ConversationStore
	Assistant      Replier
	Reviews        ProposalReviews
	Knowledge      KnowledgeStore
	Settings       SettingsStore
	AllowedOrigins []string
	// Allowlist admits GitHub accounts to the beta. Its zero value admits nobody.
	Allowlist auth.Allowlist
}

func NewRouter(deps Deps) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /ready", handleReady(deps.DB))

	user := func(h http.HandlerFunc) http.HandlerFunc { return requireUser(deps.Auth, deps.Allowlist, h) }
	mux.HandleFunc("GET /api/me", user(handleMe))
	mux.HandleFunc("GET /api/settings", user(handleGetSettings(deps.Settings)))
	mux.HandleFunc("PUT /api/settings", user(handleSaveSettings(deps.Settings)))
	mux.HandleFunc("GET /api/projects", user(handleListProjects(deps.Projects)))
	mux.HandleFunc("POST /api/projects", user(handleCreateProject(deps.Projects)))
	mux.HandleFunc("GET /api/projects/{slug}", user(handleGetProject(deps.Projects)))
	mux.HandleFunc("PATCH /api/projects/{slug}", user(handleRenameProject(deps.Projects)))
	mux.HandleFunc("DELETE /api/projects/{slug}", user(handleDeleteProject(deps.Projects)))
	mux.HandleFunc("GET /api/projects/{slug}/architecture", user(handleGetArchitecture(deps.Architectures)))
	mux.HandleFunc("PUT /api/projects/{slug}/architecture", user(handleSaveArchitecture(deps.Architectures)))
	mux.HandleFunc("GET /api/projects/{slug}/messages", user(handleListMessages(deps.Conversations)))
	mux.HandleFunc("POST /api/projects/{slug}/messages", user(handleSendMessage(deps.Conversations)))
	mux.HandleFunc("POST /api/projects/{slug}/reply", user(handleReply(deps.Assistant)))
	mux.HandleFunc("POST /api/projects/{slug}/proposals/{seq}/accept", user(handleAcceptProposal(deps.Reviews)))
	mux.HandleFunc("POST /api/projects/{slug}/proposals/{seq}/reject", user(handleRejectProposal(deps.Reviews)))
	mux.HandleFunc("GET /api/projects/{slug}/knowledge", user(handleGetKnowledge(deps.Knowledge)))
	mux.HandleFunc("POST /api/projects/{slug}/requirements", user(handleAddRequirement(deps.Knowledge)))
	mux.HandleFunc("PATCH /api/projects/{slug}/requirements/{id}", user(handleUpdateRequirement(deps.Knowledge)))
	mux.HandleFunc("DELETE /api/projects/{slug}/requirements/{id}", user(handleRemoveRequirement(deps.Knowledge)))
	mux.HandleFunc("POST /api/projects/{slug}/decisions", user(handleAddDecision(deps.Knowledge)))
	mux.HandleFunc("PATCH /api/projects/{slug}/decisions/{id}", user(handleUpdateDecision(deps.Knowledge)))
	mux.HandleFunc("DELETE /api/projects/{slug}/decisions/{id}", user(handleRemoveDecision(deps.Knowledge)))
	mux.HandleFunc("PUT /api/projects/{slug}/experience-level", user(handleSetExperienceLevel(deps.Knowledge)))
	return withSecurityHeaders(withCORS(deps.AllowedOrigins, mux))
}

// handleHealth is a liveness probe: the process is up.
func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleReady is a readiness probe: the process can reach its dependencies.
func handleReady(db Pinger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := db.Ping(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "database": "down"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "database": "up"})
	}
}

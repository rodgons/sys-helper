// Package httpapi wires HTTP routes using the standard library ServeMux.
package httpapi

import (
	"context"
	"net/http"
	"time"
)

// Pinger reports whether a dependency (e.g. the database) is reachable.
type Pinger interface {
	Ping(ctx context.Context) error
}

type Deps struct {
	DB             Pinger
	AllowedOrigins []string
}

func NewRouter(deps Deps) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /ready", handleReady(deps.DB))
	return withCORS(deps.AllowedOrigins, mux)
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

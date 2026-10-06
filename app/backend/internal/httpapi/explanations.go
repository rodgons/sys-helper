package httpapi

import (
	"net/http"

	"sys-helper/backend/internal/explain"
)

// ExplanationCatalog holds the explanations of Patterns and Component Types the app ships.
type ExplanationCatalog interface {
	Explanations() explain.Catalog
}

// handleGetExplanations serves the whole catalog. It is the same for every User and changes only
// with a deploy, so the browser may keep it for an hour.
func handleGetExplanations(catalog ExplanationCatalog) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "private, max-age=3600")
		writeJSON(w, http.StatusOK, catalog.Explanations())
	}
}

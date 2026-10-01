package httpapi

import (
	"context"
	"net/http"
)

// SettingsStore keeps a User's settings across their Projects: for now, the default Experience
// Level that Projects without their own use. An empty level means none.
type SettingsStore interface {
	DefaultExperienceLevel(ctx context.Context, userID string) (string, error)
	SetDefaultExperienceLevel(ctx context.Context, userID, level string) error
}

type settings struct {
	ExperienceLevel string `json:"experienceLevel"`
}

func handleGetSettings(store SettingsStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		level, err := store.DefaultExperienceLevel(r.Context(), userFrom(r.Context()).ID)
		respond(w, r, http.StatusOK, settings{ExperienceLevel: level}, err)
	}
}

func handleSaveSettings(store SettingsStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body settings
		if !decodeStrict(w, r, &body) {
			return
		}
		err := store.SetDefaultExperienceLevel(r.Context(), userFrom(r.Context()).ID, body.ExperienceLevel)
		respond(w, r, http.StatusOK, body, err)
	}
}

package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"sys-helper/backend/internal/auth"
)

// Authenticator turns a bearer token into the signed-in User.
type Authenticator interface {
	Authenticate(ctx context.Context, token string) (auth.User, error)
}

type userKey struct{}

// requireUser rejects requests without a valid session backed by a supported identity, or from
// Users the allowlist doesn't admit, and passes the User to next through the request context.
func requireUser(authn Authenticator, allowlist auth.Allowlist, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		user, err := authn.Authenticate(r.Context(), token)
		switch {
		case errors.Is(err, auth.ErrInvalidToken):
			writeError(w, http.StatusUnauthorized, "unauthenticated")
			return
		case errors.Is(err, auth.ErrNoIdentity):
			writeError(w, http.StatusForbidden, "identity_required")
			return
		case err != nil:
			internalError(w, r, err)
			return
		}
		if !allowlist.Admits(user) {
			writeNotAllowed(w, user)
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userKey{}, user)))
	}
}

// writeNotAllowed refuses a User the allowlist doesn't admit, listing their own identities so the
// page can tell them what to ask for access with (their GitHub username, or their Google id).
func writeNotAllowed(w http.ResponseWriter, user auth.User) {
	type identity struct {
		Provider auth.Provider `json:"provider"`
		ID       string        `json:"id"`
		Name     string        `json:"name"`
	}
	identities := make([]identity, len(user.Identities))
	for i, id := range user.Identities {
		identities[i] = identity{id.Provider, id.ID, id.Name}
	}
	writeJSON(w, http.StatusForbidden, map[string]any{"error": "not_allowed", "identities": identities})
}

// userFrom returns the User set by requireUser.
func userFrom(ctx context.Context) auth.User {
	return ctx.Value(userKey{}).(auth.User)
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	writeJSON(w, http.StatusOK, map[string]string{"displayName": user.DisplayName(), "avatarUrl": user.AvatarURL()})
}

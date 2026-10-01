package httpapi

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"

	"sys-helper/backend/internal/auth"
)

// Authenticator turns a bearer token into the signed-in User.
type Authenticator interface {
	Authenticate(ctx context.Context, token string) (auth.User, error)
}

type userKey struct{}

// requireUser rejects requests without a valid GitHub-backed session, or from GitHub users missing
// from a non-empty allowlist, and passes the User to next through the request context.
func requireUser(authn Authenticator, allowlist []string, next http.HandlerFunc) http.HandlerFunc {
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
		case errors.Is(err, auth.ErrNoGitHubIdentity):
			writeError(w, http.StatusForbidden, "github_required")
			return
		case err != nil:
			internalError(w, r, err)
			return
		}
		if len(allowlist) > 0 && !slices.Contains(allowlist, strings.ToLower(user.GitHubUsername)) {
			writeError(w, http.StatusForbidden, "not_allowed")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userKey{}, user)))
	}
}

// userFrom returns the User set by requireUser.
func userFrom(ctx context.Context) auth.User {
	return ctx.Value(userKey{}).(auth.User)
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	writeJSON(w, http.StatusOK, map[string]string{"username": user.GitHubUsername, "avatarUrl": user.AvatarURL})
}

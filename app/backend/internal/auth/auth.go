// Package auth identifies the User behind a request: it verifies Supabase access tokens and
// resolves the GitHub identity linked to the Supabase user.
package auth

import (
	"context"
	"errors"
)

var (
	// ErrInvalidToken means the access token is malformed, expired or not signed by Supabase.
	ErrInvalidToken = errors.New("invalid access token")
	// ErrNoGitHubIdentity means the Supabase user did not sign in with GitHub.
	ErrNoGitHubIdentity = errors.New("user has no GitHub identity")
)

// User is a signed-in User. ID is the Supabase user ID and never leaves the server.
type User struct {
	ID             string
	GitHubUsername string
	AvatarURL      string
}

type GitHubIdentity struct {
	Username  string
	AvatarURL string
}

// Authenticator turns an access token into a User.
type Authenticator struct {
	Tokens interface {
		UserID(token string) (string, error)
	}
	Identities interface {
		GitHub(ctx context.Context, userID string) (GitHubIdentity, error)
	}
}

func (a Authenticator) Authenticate(ctx context.Context, token string) (User, error) {
	id, err := a.Tokens.UserID(token)
	if err != nil {
		return User{}, err
	}
	gh, err := a.Identities.GitHub(ctx, id)
	if err != nil {
		return User{}, err
	}
	return User{ID: id, GitHubUsername: gh.Username, AvatarURL: gh.AvatarURL}, nil
}

// Package auth identifies the User behind a request: it verifies Supabase access tokens and
// resolves the identities (GitHub, Google) linked to the Supabase user.
package auth

import (
	"context"
	"errors"
	"slices"
)

var (
	// ErrInvalidToken means the access token is malformed, expired or not signed by Supabase.
	ErrInvalidToken = errors.New("invalid access token")
	// ErrNoIdentity means the Supabase user has no identity from a supported provider.
	ErrNoIdentity = errors.New("user has no supported identity")
)

// Provider is a sign-in provider whose identities can belong to a User.
type Provider string

const (
	GitHub Provider = "github"
	Google Provider = "google"
)

// Identity is one provider account linked to a User.
type Identity struct {
	Provider Provider
	// ID is the provider's immutable account id: the numeric GitHub user id, or the Google sub.
	// Usernames and emails can change hands, so the allowlist matches this and nothing else.
	ID string
	// Name is for display only: the GitHub username, or the Google full name.
	Name      string
	Email     string
	AvatarURL string
}

// User is a signed-in User. ID is the Supabase user ID and never leaves the server. Identities is
// never empty, and lists GitHub before Google.
type User struct {
	ID         string
	Identities []Identity
}

// Identity returns the User's identity from provider, if one is linked.
func (u User) Identity(provider Provider) (Identity, bool) {
	i := slices.IndexFunc(u.Identities, func(id Identity) bool { return id.Provider == provider })
	if i < 0 {
		return Identity{}, false
	}
	return u.Identities[i], true
}

// DisplayName is the GitHub username if one is linked, otherwise the Google full name, otherwise
// the Google email.
func (u User) DisplayName() string {
	if gh, ok := u.Identity(GitHub); ok {
		return gh.Name
	}
	if g, ok := u.Identity(Google); ok {
		if g.Name != "" {
			return g.Name
		}
		return g.Email
	}
	return ""
}

// AvatarURL is the avatar of the identity DisplayName comes from.
func (u User) AvatarURL() string {
	for _, p := range []Provider{GitHub, Google} {
		if id, ok := u.Identity(p); ok {
			return id.AvatarURL
		}
	}
	return ""
}

// Allowlist is the beta allowlist. It admits a User if any of their identities is listed under its
// provider. The zero value admits nobody.
type Allowlist struct {
	GitHubIDs []string
	GoogleIDs []string
	Everyone  bool // explicit opt-in to admit every User
}

func (a Allowlist) Admits(u User) bool {
	if a.Everyone {
		return true
	}
	ids := map[Provider][]string{GitHub: a.GitHubIDs, Google: a.GoogleIDs}
	return slices.ContainsFunc(u.Identities, func(id Identity) bool {
		return id.ID != "" && slices.Contains(ids[id.Provider], id.ID)
	})
}

// Authenticator turns an access token into a User.
type Authenticator struct {
	Tokens interface {
		Verify(token string) (Token, error)
	}
	// Sessions refuses tokens whose session has ended (sign-out, revocation) or whose User is
	// banned. Access tokens stay valid until they expire (an hour), so the signature alone can't.
	Sessions interface {
		Check(ctx context.Context, userID, sessionID string) error
	}
	Identities interface {
		List(ctx context.Context, userID string) ([]Identity, error)
	}
}

func (a Authenticator) Authenticate(ctx context.Context, token string) (User, error) {
	t, err := a.Tokens.Verify(token)
	if err != nil {
		return User{}, err
	}
	if err := a.Sessions.Check(ctx, t.UserID, t.SessionID); err != nil {
		return User{}, err
	}
	identities, err := a.Identities.List(ctx, t.UserID)
	if err != nil {
		return User{}, err
	}
	return User{ID: t.UserID, Identities: identities}, nil
}

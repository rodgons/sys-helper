package auth

import (
	"context"
	"fmt"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// Verifier checks Supabase access tokens against the project's published signing keys (JWKS).
type Verifier struct {
	keyfunc jwt.Keyfunc
	issuer  string
}

// NewVerifier fetches the JWKS of the Supabase project at supabaseURL and keeps it refreshed
// for as long as ctx lives.
func NewVerifier(ctx context.Context, supabaseURL string) (*Verifier, error) {
	issuer := strings.TrimRight(supabaseURL, "/") + "/auth/v1"
	k, err := keyfunc.NewDefaultCtx(ctx, []string{issuer + "/.well-known/jwks.json"})
	if err != nil {
		return nil, fmt.Errorf("load Supabase JWKS: %w", err)
	}
	return &Verifier{keyfunc: k.Keyfunc, issuer: issuer}, nil
}

// UserID returns the Supabase user ID (the subject) of a valid access token.
func (v *Verifier) UserID(token string) (string, error) {
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(token, &claims, v.keyfunc,
		jwt.WithValidMethods([]string{"ES256"}),
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience("authenticated"),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrInvalidToken, err)
	}
	if claims.Subject == "" {
		return "", fmt.Errorf("%w: no subject", ErrInvalidToken)
	}
	return claims.Subject, nil
}

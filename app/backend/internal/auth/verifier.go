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

// Token is what a valid access token says: whose it is, and which sign-in session issued it.
type Token struct {
	UserID    string
	SessionID string
}

// Verify checks an access token's signature, issuer, audience and expiry, and returns its Supabase
// user ID (the subject) and session. It can't tell whether the session has since ended: see Sessions.
func (v *Verifier) Verify(token string) (Token, error) {
	var claims struct {
		jwt.RegisteredClaims
		SessionID string `json:"session_id"`
	}
	_, err := jwt.ParseWithClaims(token, &claims, v.keyfunc,
		jwt.WithValidMethods([]string{"ES256"}),
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience("authenticated"),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return Token{}, fmt.Errorf("%w: %w", ErrInvalidToken, err)
	}
	if claims.Subject == "" || claims.SessionID == "" {
		return Token{}, fmt.Errorf("%w: no subject or session", ErrInvalidToken)
	}
	return Token{UserID: claims.Subject, SessionID: claims.SessionID}, nil
}

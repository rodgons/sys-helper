package auth

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Identities reads the identities Supabase Auth stored when the User signed in. It reads
// auth.identities rather than the token's user_metadata, because users can edit their own metadata.
// For GitHub, Supabase sets provider_id to the numeric GitHub user id.
type Identities struct {
	DB interface {
		Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	}
}

// List returns the User's identities from supported providers, GitHub first, or ErrNoIdentity if
// there are none.
func (s Identities) List(ctx context.Context, userID string) ([]Identity, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT provider, provider_id,
			coalesce(identity_data->>'user_name', ''),
			coalesce(identity_data->>'email', ''),
			coalesce(identity_data->>'avatar_url', '')
		FROM auth.identities
		WHERE user_id = $1 AND provider = 'github'
		ORDER BY provider`, userID)
	if err != nil {
		return nil, fmt.Errorf("read identities: %w", err)
	}
	var out []Identity
	var id Identity
	_, err = pgx.ForEachRow(rows, []any{&id.Provider, &id.ID, &id.Name, &id.Email, &id.AvatarURL}, func() error {
		// A GitHub identity always has a username; without one it isn't a usable sign-in.
		if id.Name != "" {
			out = append(out, id)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("read identities: %w", err)
	}
	if len(out) == 0 {
		return nil, ErrNoIdentity
	}
	return out, nil
}

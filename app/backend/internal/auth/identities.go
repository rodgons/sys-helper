package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Identities reads the GitHub identity Supabase Auth stored when the User signed in. It reads
// auth.identities rather than the token's user_metadata, because users can edit their own metadata.
// For GitHub, Supabase sets provider_id to the numeric GitHub user id.
type Identities struct {
	DB interface {
		QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	}
}

func (s Identities) GitHub(ctx context.Context, userID string) (GitHubIdentity, error) {
	var gh GitHubIdentity
	err := s.DB.QueryRow(ctx, `
		SELECT provider_id, coalesce(identity_data->>'user_name', ''), coalesce(identity_data->>'avatar_url', '')
		FROM auth.identities
		WHERE user_id = $1 AND provider = 'github'`, userID).Scan(&gh.ID, &gh.Username, &gh.AvatarURL)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && gh.Username == "") {
		return GitHubIdentity{}, ErrNoGitHubIdentity
	}
	if err != nil {
		return GitHubIdentity{}, fmt.Errorf("read GitHub identity: %w", err)
	}
	return gh, nil
}

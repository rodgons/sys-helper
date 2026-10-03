package auth

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Sessions checks access tokens against the sessions Supabase Auth keeps. Signing out, revoking a
// session or banning a User ends access right away, instead of when the token expires.
type Sessions struct {
	DB interface {
		QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	}
}

// Check returns ErrInvalidToken unless sessionID is a live session of userID, and the User exists
// and isn't banned.
func (s Sessions) Check(ctx context.Context, userID, sessionID string) error {
	user, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("%w: user id: %w", ErrInvalidToken, err)
	}
	session, err := uuid.Parse(sessionID)
	if err != nil {
		return fmt.Errorf("%w: session id: %w", ErrInvalidToken, err)
	}
	var live bool
	err = s.DB.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id
			WHERE s.id = $2 AND s.user_id = $1
			  AND (s.not_after IS NULL OR s.not_after > now())
			  AND (u.banned_until IS NULL OR u.banned_until <= now())
			  AND u.deleted_at IS NULL)`, user, session).Scan(&live)
	if err != nil {
		return fmt.Errorf("check session: %w", err)
	}
	if !live {
		return fmt.Errorf("%w: the session has ended", ErrInvalidToken)
	}
	return nil
}

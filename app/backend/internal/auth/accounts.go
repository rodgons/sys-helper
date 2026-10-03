package auth

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

// Accounts deletes Users. Deleting the auth.users row cascades to everything the User owns: their
// identities and sessions, Projects (and all that hangs off them), settings and usage.
type Accounts struct {
	DB interface {
		Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	}
}

// Delete removes the User and all their data. It can't be undone.
func (a Accounts) Delete(ctx context.Context, userID string) error {
	if _, err := a.DB.Exec(ctx, `DELETE FROM auth.users WHERE id = $1`, userID); err != nil {
		return fmt.Errorf("delete account: %w", err)
	}
	return nil
}

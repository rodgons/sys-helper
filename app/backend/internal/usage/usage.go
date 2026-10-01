// Package usage meters AI model calls per User and enforces the daily cap.
package usage

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrDailyLimit means the User has used up today's model calls (UTC day).
var ErrDailyLimit = errors.New("daily AI limit reached")

// Meter records model calls in ai_usage.
type Meter struct {
	db *pgxpool.Pool
	// DailyLimit caps a User's model calls per UTC day. 0 means no cap (calls are still recorded).
	DailyLimit int
}

func NewMeter(db *pgxpool.Pool, dailyLimit int) *Meter {
	return &Meter{db: db, DailyLimit: dailyLimit}
}

// Record counts one model call for the User, or returns ErrDailyLimit and records nothing if they
// have reached the cap. The check and the insert run under a per-User lock, so concurrent replies
// can't both take the last call.
func (m *Meter) Record(ctx context.Context, userID string) error {
	id, err := uuid.NewV7()
	if err != nil {
		return err
	}
	return pgx.BeginFunc(ctx, m.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('ai_usage:' || $1::text, 0))`, userID); err != nil {
			return fmt.Errorf("lock usage: %w", err)
		}
		if m.DailyLimit > 0 {
			var used int
			err := tx.QueryRow(ctx, `
				SELECT count(*) FROM ai_usage
				WHERE user_id = $1
				  AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`,
				userID).Scan(&used)
			if err != nil {
				return fmt.Errorf("count usage: %w", err)
			}
			if used >= m.DailyLimit {
				return ErrDailyLimit
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO ai_usage (id, user_id) VALUES ($1, $2)`, id, userID); err != nil {
			return fmt.Errorf("record usage: %w", err)
		}
		return nil
	})
}

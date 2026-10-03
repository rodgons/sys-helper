// Package usage meters AI model calls per User and requests across all Users, and enforces the
// daily caps on both.
package usage

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

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

// Record counts one model call for the User and returns its id (for Refund), or returns
// ErrDailyLimit and records nothing if they have reached the cap. The check and the insert run
// under a per-User lock, so concurrent replies can't both take the last call.
func (m *Meter) Record(ctx context.Context, userID string) (string, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return "", err
	}
	err = pgx.BeginFunc(ctx, m.db, func(tx pgx.Tx) error {
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
	if err != nil {
		return "", err
	}
	return id.String(), nil
}

// Refund uncounts a call Record counted that no model answered (every model was busy, or the global
// budget was spent), so the User isn't charged for it.
func (m *Meter) Refund(ctx context.Context, call string) error {
	if _, err := m.db.Exec(ctx, `DELETE FROM ai_usage WHERE id = $1`, call); err != nil {
		return fmt.Errorf("refund usage: %w", err)
	}
	return nil
}

// ErrGlobalLimit means today's requests for every User together are used up. It is a daily limit,
// so callers that handle ErrDailyLimit handle it too.
var ErrGlobalLimit = fmt.Errorf("%w for every user", ErrDailyLimit)

// Budget records requests to the model provider in ai_requests, fallbacks to another model
// included, and caps them per UTC day across all Users: the free quota belongs to the account.
type Budget struct {
	db *pgxpool.Pool
	// DailyLimit caps requests per UTC day. 0 means no cap (requests are still recorded).
	DailyLimit int
}

func NewBudget(db *pgxpool.Pool, dailyLimit int) *Budget {
	return &Budget{db: db, DailyLimit: dailyLimit}
}

// Spend counts one request, or returns ErrGlobalLimit and records nothing once today's are used
// up. The check and the insert run under one global lock, so concurrent requests can't overshoot.
func (b *Budget) Spend(ctx context.Context) error {
	id, err := uuid.NewV7()
	if err != nil {
		return err
	}
	return pgx.BeginFunc(ctx, b.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('ai_requests', 0))`); err != nil {
			return fmt.Errorf("lock requests: %w", err)
		}
		if b.DailyLimit > 0 {
			var used int
			err := tx.QueryRow(ctx, `
				SELECT count(*) FROM ai_requests
				WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`).Scan(&used)
			if err != nil {
				return fmt.Errorf("count requests: %w", err)
			}
			if used >= b.DailyLimit {
				return ErrGlobalLimit
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO ai_requests (id) VALUES ($1)`, id); err != nil {
			return fmt.Errorf("record request: %w", err)
		}
		return nil
	})
}

// Retention is how long ai_usage and ai_requests rows are kept. The caps only count today's, so a
// week leaves room to look back while debugging.
const Retention = 7 * 24 * time.Hour

// Prune deletes ai_usage and ai_requests rows older than keep.
func Prune(ctx context.Context, db *pgxpool.Pool, keep time.Duration) error {
	for _, table := range []string{"ai_usage", "ai_requests"} {
		if _, err := db.Exec(ctx, `DELETE FROM `+table+` WHERE created_at < now() - $1::interval`, keep); err != nil {
			return fmt.Errorf("prune %s: %w", table, err)
		}
	}
	return nil
}

// RunPruner prunes rows older than Retention now and then every hour, until ctx ends.
func RunPruner(ctx context.Context, db *pgxpool.Pool) {
	for {
		if err := Prune(ctx, db, Retention); err != nil && ctx.Err() == nil {
			slog.WarnContext(ctx, "could not prune AI usage", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Hour):
		}
	}
}

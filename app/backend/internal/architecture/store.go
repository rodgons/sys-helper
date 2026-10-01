package architecture

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sys-helper/backend/internal/projects"
)

// ErrConflict means the save was based on an older version than the stored one.
var ErrConflict = errors.New("architecture changed since this version")

// Versioned is an Architecture document and the version it was saved as (0 = never saved).
type Versioned struct {
	Version  int      `json:"version"`
	Document Document `json:"document"`
}

// Store keeps each Project's Architecture, scoped to the Project's owner like projects.Store.
type Store struct {
	db *pgxpool.Pool
	// AfterSave, if set, runs in every save's transaction once the new document is stored (main
	// uses it to keep Decisions attached to items that still exist).
	AfterSave func(ctx context.Context, tx pgx.Tx, projectID string, doc Document) error
}

func NewStore(db *pgxpool.Pool) *Store { return &Store{db: db} }

func (s *Store) Get(ctx context.Context, userID, suffix string) (Versioned, error) {
	var v Versioned
	var doc *Document
	err := s.db.QueryRow(ctx, `
		SELECT a.document, coalesce(a.version, 0)
		FROM projects p LEFT JOIN architectures a ON a.project_id = p.id
		WHERE p.user_id = $1 AND p.slug_suffix = $2`, userID, suffix).Scan(&doc, &v.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return Versioned{}, projects.ErrNotFound
	}
	if err != nil {
		return Versioned{}, fmt.Errorf("get architecture: %w", err)
	}
	v.Document = Empty()
	if doc != nil {
		v.Document = *doc
	}
	v.Document.normalize()
	return v, nil
}

// Save stores doc as the next version if base is still the current version, and returns the new
// version. The document must already be valid.
func (s *Store) Save(ctx context.Context, userID, suffix string, base int, doc Document) (int, error) {
	return s.SaveWith(ctx, userID, suffix, base, doc, nil)
}

// SaveWith is Save plus `also`, which runs in the same transaction after the version check (for
// example, marking the Proposal that produced doc as accepted). If it fails, nothing is saved.
func (s *Store) SaveWith(ctx context.Context, userID, suffix string, base int, doc Document,
	also func(ctx context.Context, tx pgx.Tx, projectID string) error) (int, error) {
	doc.normalize()
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		// Locking the project row serializes concurrent saves, including the very first one.
		var projectID string
		err := tx.QueryRow(ctx, `
			SELECT id FROM projects WHERE user_id = $1 AND slug_suffix = $2 FOR UPDATE`,
			userID, suffix).Scan(&projectID)
		if errors.Is(err, pgx.ErrNoRows) {
			return projects.ErrNotFound
		}
		if err != nil {
			return err
		}
		current := 0
		err = tx.QueryRow(ctx, `SELECT version FROM architectures WHERE project_id = $1`, projectID).Scan(&current)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if current != base {
			return ErrConflict
		}
		if also != nil {
			if err := also(ctx, tx, projectID); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO architectures (project_id, document, version) VALUES ($1, $2, $3)
			ON CONFLICT (project_id) DO UPDATE
			SET document = excluded.document, version = excluded.version, updated_at = now()`,
			projectID, doc, base+1); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE projects SET updated_at = now() WHERE id = $1`, projectID); err != nil {
			return err
		}
		if s.AfterSave != nil {
			return s.AfterSave(ctx, tx, projectID, doc)
		}
		return nil
	})
	if errors.Is(err, projects.ErrNotFound) || errors.Is(err, ErrConflict) {
		return 0, err
	}
	if err != nil && also != nil {
		return 0, err // the hook's own errors pass through unwrapped
	}
	if err != nil {
		return 0, fmt.Errorf("save architecture: %w", err)
	}
	return base + 1, nil
}

// normalize turns missing lists into empty ones so the JSON always has both arrays.
func (d *Document) normalize() {
	if d.Components == nil {
		d.Components = []Component{}
	}
	if d.Connections == nil {
		d.Connections = []Connection{}
	}
}

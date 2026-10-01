package projects

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store keeps Projects in Postgres. Every method is scoped to the owning user; another user's
// Project behaves exactly like a missing one (ErrNotFound).
type Store struct {
	db *pgxpool.Pool
	// NewSuffix generates slug suffixes; tests replace it to force collisions.
	NewSuffix func() string
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db, NewSuffix: NewSuffix}
}

const columns = `id, slug_suffix, name, updated_at`

func (s *Store) List(ctx context.Context, userID string) ([]Project, error) {
	rows, err := s.db.Query(ctx,
		`SELECT `+columns+` FROM projects WHERE user_id = $1 ORDER BY updated_at DESC, id DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	list, err := pgx.CollectRows(rows, scanProject)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	return list, nil
}

// Create inserts a Project with a new UUIDv7 and slug suffix, retrying if the suffix is taken.
func (s *Store) Create(ctx context.Context, userID, name string) (Project, error) {
	for range 3 {
		id, err := uuid.NewV7()
		if err != nil {
			return Project{}, fmt.Errorf("create project: %w", err)
		}
		p, err := one(s.db.Query(ctx, `
			INSERT INTO projects (id, user_id, slug_suffix, name) VALUES ($1, $2, $3, $4)
			RETURNING `+columns, id, userID, s.NewSuffix(), name))
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "projects_slug_suffix_key" {
			continue
		}
		if err != nil {
			return Project{}, fmt.Errorf("create project: %w", err)
		}
		return p, nil
	}
	return Project{}, errors.New("create project: no free slug suffix after 3 attempts")
}

func (s *Store) Get(ctx context.Context, userID, suffix string) (Project, error) {
	return one(s.db.Query(ctx,
		`SELECT `+columns+` FROM projects WHERE user_id = $1 AND slug_suffix = $2`, userID, suffix))
}

func (s *Store) Rename(ctx context.Context, userID, suffix, name string) (Project, error) {
	return one(s.db.Query(ctx, `
		UPDATE projects SET name = $3, updated_at = now()
		WHERE user_id = $1 AND slug_suffix = $2
		RETURNING `+columns, userID, suffix, name))
}

func (s *Store) Delete(ctx context.Context, userID, suffix string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM projects WHERE user_id = $1 AND slug_suffix = $2`, userID, suffix)
	if err != nil {
		return fmt.Errorf("delete project: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func scanProject(row pgx.CollectableRow) (Project, error) {
	var p Project
	err := row.Scan(&p.ID, &p.SlugSuffix, &p.Name, &p.UpdatedAt)
	return p, err
}

// one collects exactly one Project, mapping "no rows" to ErrNotFound.
func one(rows pgx.Rows, err error) (Project, error) {
	if err != nil {
		return Project{}, err
	}
	p, err := pgx.CollectExactlyOneRow(rows, scanProject)
	if errors.Is(err, pgx.ErrNoRows) {
		return Project{}, ErrNotFound
	}
	return p, err
}

package knowledge

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/projects"
)

// ErrNotFound means the Project has no Requirement or Decision with that number.
var ErrNotFound = errors.New("not found")

// DB is a pool or a transaction. The functions taking one assume the caller has locked the
// Project row (numbering and the review flags rely on it).
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// DecisionPatch edits a Decision; nil fields stay as they are. Any edit, including an empty one,
// clears Needs Review: the User has looked at the Decision.
type DecisionPatch struct {
	Title, Rationale, Pattern, Alternative *string
	Requirements                           *[]int
}

// Store gives Users access to their Projects' knowledge.
type Store struct{ db *pgxpool.Pool }

func NewStore(db *pgxpool.Pool) *Store { return &Store{db: db} }

func (s *Store) Get(ctx context.Context, userID, suffix string) (Knowledge, error) {
	var k Knowledge
	err := s.inProject(ctx, userID, suffix, func(tx pgx.Tx, projectID string) (err error) {
		k, err = Load(ctx, tx, projectID)
		return err
	})
	return k, err
}

func (s *Store) AddRequirement(ctx context.Context, userID, suffix, category, statement string) (Requirement, error) {
	var r Requirement
	err := s.inProject(ctx, userID, suffix, func(tx pgx.Tx, projectID string) (err error) {
		r, err = AddRequirement(ctx, tx, projectID, category, statement)
		return err
	})
	return r, err
}

func (s *Store) UpdateRequirement(ctx context.Context, userID, suffix string, num int, category, statement *string) (Requirement, error) {
	var r Requirement
	err := s.inProject(ctx, userID, suffix, func(tx pgx.Tx, projectID string) (err error) {
		r, err = UpdateRequirement(ctx, tx, projectID, num, category, statement)
		return err
	})
	return r, err
}

func (s *Store) RemoveRequirement(ctx context.Context, userID, suffix string, num int) error {
	return s.inProject(ctx, userID, suffix, func(tx pgx.Tx, projectID string) error {
		return RemoveRequirement(ctx, tx, projectID, num)
	})
}

// AddDecision records a Decision the User wrote. Its targets must be on the canvas and its
// Requirements must exist.
func (s *Store) AddDecision(ctx context.Context, userID, suffix string, d Decision) (Decision, error) {
	err := s.inProject(ctx, userID, suffix, func(tx pgx.Tx, projectID string) error {
		if err := checkReferences(ctx, tx, projectID, d.Targets, d.Requirements); err != nil {
			return err
		}
		d.Author = AuthorUser
		var err error
		d, err = AddDecision(ctx, tx, projectID, d)
		return err
	})
	return d, err
}

func (s *Store) UpdateDecision(ctx context.Context, userID, suffix string, num int, patch DecisionPatch) (Decision, error) {
	var d Decision
	err := s.inProject(ctx, userID, suffix, func(tx pgx.Tx, projectID string) error {
		if patch.Requirements != nil {
			if err := checkReferences(ctx, tx, projectID, nil, *patch.Requirements); err != nil {
				return err
			}
		}
		var err error
		d, err = updateDecision(ctx, tx, projectID, num, patch)
		return err
	})
	return d, err
}

func (s *Store) RemoveDecision(ctx context.Context, userID, suffix string, num int) error {
	return s.inProject(ctx, userID, suffix, func(tx pgx.Tx, projectID string) error {
		tag, err := tx.Exec(ctx, `DELETE FROM decisions WHERE project_id = $1 AND num = $2`, projectID, num)
		if err == nil && tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return err
	})
}

func (s *Store) SetExperienceLevel(ctx context.Context, userID, suffix, level string) error {
	return s.inProject(ctx, userID, suffix, func(tx pgx.Tx, projectID string) error {
		return SetExperienceLevel(ctx, tx, projectID, level)
	})
}

// DefaultExperienceLevel is the User's default Experience Level, or "" if they haven't set one.
func (s *Store) DefaultExperienceLevel(ctx context.Context, userID string) (string, error) {
	var level *string
	err := s.db.QueryRow(ctx, `SELECT experience_level FROM user_settings WHERE user_id = $1`, userID).Scan(&level)
	if errors.Is(err, pgx.ErrNoRows) || level == nil {
		return "", nil
	}
	return *level, err
}

// SetDefaultExperienceLevel sets the level every Project without its own uses; "" clears it.
func (s *Store) SetDefaultExperienceLevel(ctx context.Context, userID, level string) error {
	var stored *string
	if level != "" {
		if err := CheckLevel(level); err != nil {
			return err
		}
		stored = &level
	}
	_, err := s.db.Exec(ctx, `
		INSERT INTO user_settings (user_id, experience_level) VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET experience_level = excluded.experience_level, updated_at = now()`,
		userID, stored)
	return err
}

// inProject runs fn in a transaction holding the User's Project row lock.
func (s *Store) inProject(ctx context.Context, userID, suffix string, fn func(tx pgx.Tx, projectID string) error) error {
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var projectID string
		err := tx.QueryRow(ctx, `SELECT id FROM projects WHERE user_id = $1 AND slug_suffix = $2 FOR UPDATE`,
			userID, suffix).Scan(&projectID)
		if errors.Is(err, pgx.ErrNoRows) {
			return projects.ErrNotFound
		}
		if err != nil {
			return err
		}
		return fn(tx, projectID)
	})
}

// Load reads a Project's knowledge, Requirements and Decisions in number order. A Project that
// hasn't recorded an Experience Level gets its owner's default.
func Load(ctx context.Context, db DB, projectID string) (Knowledge, error) {
	k := Knowledge{Requirements: []Requirement{}, Decisions: []Decision{}}
	var level *string
	if err := db.QueryRow(ctx, `
		SELECT coalesce(p.experience_level, s.experience_level)
		FROM projects p LEFT JOIN user_settings s ON s.user_id = p.user_id
		WHERE p.id = $1`, projectID).Scan(&level); err != nil {
		return Knowledge{}, fmt.Errorf("load experience level: %w", err)
	}
	if level != nil {
		k.ExperienceLevel = *level
	}
	rows, err := db.Query(ctx, `SELECT num, category, statement FROM requirements WHERE project_id = $1 ORDER BY num`, projectID)
	if err != nil {
		return Knowledge{}, err
	}
	k.Requirements, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (Requirement, error) {
		var r Requirement
		return r, row.Scan(&r.Num, &r.Category, &r.Statement)
	})
	if err != nil {
		return Knowledge{}, fmt.Errorf("load requirements: %w", err)
	}
	rows, err = db.Query(ctx, `SELECT `+decisionColumns+` FROM decisions WHERE project_id = $1 ORDER BY num`, projectID)
	if err != nil {
		return Knowledge{}, err
	}
	k.Decisions, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (Decision, error) { return scanDecision(row) })
	if err != nil {
		return Knowledge{}, fmt.Errorf("load decisions: %w", err)
	}
	return k, nil
}

func AddRequirement(ctx context.Context, db DB, projectID, category, statement string) (Requirement, error) {
	statement = strings.TrimSpace(statement)
	if err := CheckRequirement(&category, &statement); err != nil {
		return Requirement{}, err
	}
	id, err := uuid.NewV7()
	if err != nil {
		return Requirement{}, err
	}
	r := Requirement{Category: category, Statement: statement}
	// Numbers come from a counter that only moves forward, so a deleted R3 is never reused.
	err = db.QueryRow(ctx, `
		WITH n AS (
			UPDATE projects SET next_requirement_num = next_requirement_num + 1
			WHERE id = $2 RETURNING next_requirement_num - 1 AS num)
		INSERT INTO requirements (id, project_id, num, category, statement)
		SELECT $1, $2, n.num, $3, $4 FROM n
		RETURNING num`, id, projectID, category, statement).Scan(&r.Num)
	if err != nil {
		return Requirement{}, fmt.Errorf("add requirement: %w", err)
	}
	return r, nil
}

// UpdateRequirement changes a Requirement and flags every Decision citing it for review.
func UpdateRequirement(ctx context.Context, db DB, projectID string, num int, category, statement *string) (Requirement, error) {
	if statement != nil {
		trimmed := strings.TrimSpace(*statement)
		statement = &trimmed
	}
	if err := CheckRequirement(category, statement); err != nil {
		return Requirement{}, err
	}
	r := Requirement{Num: num}
	err := db.QueryRow(ctx, `
		UPDATE requirements SET category = coalesce($3, category), statement = coalesce($4, statement), updated_at = now()
		WHERE project_id = $1 AND num = $2
		RETURNING category, statement`, projectID, num, category, statement).Scan(&r.Category, &r.Statement)
	if errors.Is(err, pgx.ErrNoRows) {
		return Requirement{}, ErrNotFound
	}
	if err != nil {
		return Requirement{}, fmt.Errorf("update requirement: %w", err)
	}
	_, err = db.Exec(ctx, `UPDATE decisions SET needs_review = true WHERE project_id = $1 AND $2 = ANY(requirement_nums)`, projectID, num)
	return r, err
}

// RemoveRequirement deletes a Requirement; Decisions citing it stop citing it and need review.
func RemoveRequirement(ctx context.Context, db DB, projectID string, num int) error {
	tag, err := db.Exec(ctx, `DELETE FROM requirements WHERE project_id = $1 AND num = $2`, projectID, num)
	if err != nil {
		return fmt.Errorf("remove requirement: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	_, err = db.Exec(ctx, `
		UPDATE decisions SET requirement_nums = array_remove(requirement_nums, $2), needs_review = true
		WHERE project_id = $1 AND $2 = ANY(requirement_nums)`, projectID, num)
	return err
}

// AddDecision stores a Decision as given (references are the caller's responsibility).
func AddDecision(ctx context.Context, db DB, projectID string, d Decision) (Decision, error) {
	d.Title, d.Rationale = strings.TrimSpace(d.Title), strings.TrimSpace(d.Rationale)
	d.Pattern, d.Alternative = strings.TrimSpace(d.Pattern), strings.TrimSpace(d.Alternative)
	if err := CheckDecisionText(d.Title, d.Rationale, d.Pattern, d.Alternative); err != nil {
		return Decision{}, err
	}
	if len(d.Targets) == 0 {
		return Decision{}, fmt.Errorf("%w: a decision needs at least one component or connection", ErrInvalid)
	}
	if d.Requirements == nil {
		d.Requirements = []int{}
	}
	id, err := uuid.NewV7()
	if err != nil {
		return Decision{}, err
	}
	// Like Requirements, numbered from a forward-only counter.
	err = db.QueryRow(ctx, `
		WITH n AS (
			UPDATE projects SET next_decision_num = next_decision_num + 1
			WHERE id = $2 RETURNING next_decision_num - 1 AS num)
		INSERT INTO decisions (id, project_id, num, title, rationale, pattern, alternative, requirement_nums, targets, author)
		SELECT $1, $2, n.num, $3, $4, $5, $6, $7, $8, $9 FROM n
		RETURNING num`, id, projectID, d.Title, d.Rationale, d.Pattern, d.Alternative, d.Requirements, d.Targets, d.Author).Scan(&d.Num)
	if err != nil {
		return Decision{}, fmt.Errorf("add decision: %w", err)
	}
	return d, nil
}

func updateDecision(ctx context.Context, db DB, projectID string, num int, p DecisionPatch) (Decision, error) {
	current, err := scanDecision(db.QueryRow(ctx, `SELECT `+decisionColumns+` FROM decisions WHERE project_id = $1 AND num = $2`, projectID, num))
	if errors.Is(err, pgx.ErrNoRows) {
		return Decision{}, ErrNotFound
	}
	if err != nil {
		return Decision{}, err
	}
	for field, value := range map[*string]*string{&current.Title: p.Title, &current.Rationale: p.Rationale, &current.Pattern: p.Pattern, &current.Alternative: p.Alternative} {
		if value != nil {
			*field = strings.TrimSpace(*value)
		}
	}
	if p.Requirements != nil {
		current.Requirements = *p.Requirements
	}
	if err := CheckDecisionText(current.Title, current.Rationale, current.Pattern, current.Alternative); err != nil {
		return Decision{}, err
	}
	current.NeedsReview = false
	_, err = db.Exec(ctx, `
		UPDATE decisions SET title = $3, rationale = $4, pattern = $5, alternative = $6, requirement_nums = $7,
		                     needs_review = false, updated_at = now()
		WHERE project_id = $1 AND num = $2`,
		projectID, num, current.Title, current.Rationale, current.Pattern, current.Alternative, current.Requirements)
	return current, err
}

func SetExperienceLevel(ctx context.Context, db DB, projectID, level string) error {
	if err := CheckLevel(level); err != nil {
		return err
	}
	_, err := db.Exec(ctx, `UPDATE projects SET experience_level = $2 WHERE id = $1`, projectID, level)
	return err
}

// PruneDecisions keeps Decisions in step with a just-saved Architecture: targets that are gone are
// dropped, and a Decision with none left is deleted. It is architecture.Store's AfterSave hook.
func PruneDecisions(ctx context.Context, tx pgx.Tx, projectID string, doc architecture.Document) error {
	ids := make([]string, 0, len(doc.Components)+len(doc.Connections))
	for _, c := range doc.Components {
		ids = append(ids, c.ID)
	}
	for _, c := range doc.Connections {
		ids = append(ids, c.ID)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM decisions WHERE project_id = $1 AND NOT targets && $2::text[]`, projectID, ids); err != nil {
		return fmt.Errorf("prune decisions: %w", err)
	}
	_, err := tx.Exec(ctx, `
		UPDATE decisions SET targets = ARRAY(SELECT t FROM unnest(targets) AS t WHERE t = ANY($2::text[]))
		WHERE project_id = $1 AND NOT targets <@ $2::text[]`, projectID, ids)
	if err != nil {
		return fmt.Errorf("prune decisions: %w", err)
	}
	return nil
}

// checkReferences verifies targets are on the Project's canvas and requirement numbers exist.
func checkReferences(ctx context.Context, db DB, projectID string, targets []string, requirements []int) error {
	if len(targets) > 0 {
		var doc *architecture.Document
		err := db.QueryRow(ctx, `SELECT document FROM architectures WHERE project_id = $1`, projectID).Scan(&doc)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		onCanvas := map[string]bool{}
		if doc != nil {
			for _, c := range doc.Components {
				onCanvas[c.ID] = true
			}
			for _, c := range doc.Connections {
				onCanvas[c.ID] = true
			}
		}
		for _, t := range targets {
			if !onCanvas[t] {
				return fmt.Errorf("%w: %q is not on the canvas", ErrInvalid, t)
			}
		}
	}
	if len(requirements) > 0 {
		k, err := Load(ctx, db, projectID)
		if err != nil {
			return err
		}
		for _, n := range requirements {
			if !slices.ContainsFunc(k.Requirements, func(r Requirement) bool { return r.Num == n }) {
				return fmt.Errorf("%w: there is no requirement %s", ErrInvalid, RequirementID(n))
			}
		}
	}
	return nil
}

const decisionColumns = `num, title, rationale, pattern, alternative, requirement_nums, targets, author, needs_review`

func scanDecision(row pgx.Row) (Decision, error) {
	var d Decision
	err := row.Scan(&d.Num, &d.Title, &d.Rationale, &d.Pattern, &d.Alternative, &d.Requirements, &d.Targets, &d.Author, &d.NeedsReview)
	return d, err
}

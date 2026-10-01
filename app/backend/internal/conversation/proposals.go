package conversation

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"sys-helper/backend/internal/projects"
	"sys-helper/backend/internal/proposal"
)

type ProposalStatus string

const (
	ProposalPending    ProposalStatus = "pending"
	ProposalAccepted   ProposalStatus = "accepted"
	ProposalRejected   ProposalStatus = "rejected"
	ProposalSuperseded ProposalStatus = "superseded"
)

// ErrNotPending means the Proposal was already accepted, rejected or superseded.
var ErrNotPending = errors.New("proposal is not pending")

// Proposal is a set of Architecture changes the AI suggested in a Message. Seq numbers Proposals
// within a Project; BaseVersion is the Architecture version the changes were written against.
type Proposal struct {
	Seq         int               `json:"seq"`
	Summary     string            `json:"summary"`
	Changes     []proposal.Change `json:"changes"`
	Status      ProposalStatus    `json:"status"`
	BaseVersion int               `json:"baseVersion"`
}

// AppendReply adds an AI Message and, if changes is set, the Proposal it carries, superseding any
// pending one. Both are saved together or not at all.
func (s *Store) AppendReply(ctx context.Context, userID, suffix, body string, changes *proposal.Changes, baseVersion int) (Message, error) {
	var m Message
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var projectID string
		// Locking the project serializes Proposals, so seq and "one pending" stay consistent.
		err := tx.QueryRow(ctx, `SELECT id FROM projects WHERE user_id = $1 AND slug_suffix = $2 FOR UPDATE`,
			userID, suffix).Scan(&projectID)
		if errors.Is(err, pgx.ErrNoRows) {
			return projects.ErrNotFound
		}
		if err != nil {
			return err
		}
		messageID, err := uuid.NewV7()
		if err != nil {
			return err
		}
		m = Message{Role: RoleAssistant, Body: body}
		if err := tx.QueryRow(ctx, `
			INSERT INTO messages (id, project_id, role, body) VALUES ($1, $2, 'assistant', $3)
			RETURNING created_at`, messageID, projectID, body).Scan(&m.CreatedAt); err != nil {
			return err
		}
		if changes == nil {
			return nil
		}
		if _, err := tx.Exec(ctx, `
			UPDATE proposals SET status = 'superseded', resolved_at = now()
			WHERE project_id = $1 AND status = 'pending'`, projectID); err != nil {
			return err
		}
		id, err := uuid.NewV7()
		if err != nil {
			return err
		}
		p := Proposal{Summary: changes.Summary, Changes: changes.Changes, Status: ProposalPending, BaseVersion: baseVersion}
		if err := tx.QueryRow(ctx, `
			INSERT INTO proposals (id, project_id, message_id, seq, base_version, summary, changes)
			VALUES ($1, $2, $3, (SELECT coalesce(max(seq), 0) + 1 FROM proposals WHERE project_id = $2), $4, $5, $6)
			RETURNING seq`, id, projectID, messageID, baseVersion, p.Summary, p.Changes).Scan(&p.Seq); err != nil {
			return err
		}
		m.Proposal = &p
		return nil
	})
	if errors.Is(err, projects.ErrNotFound) {
		return Message{}, err
	}
	if err != nil {
		return Message{}, fmt.Errorf("add reply: %w", err)
	}
	return m, nil
}

// Reject marks a pending Proposal as rejected.
func (s *Store) Reject(ctx context.Context, userID, suffix string, seq int) error {
	projectID, err := s.projectID(ctx, userID, suffix)
	if err != nil {
		return err
	}
	return resolve(ctx, s.db, projectID, seq, ProposalRejected)
}

// Accept returns an architecture.Store.SaveWith hook that marks Proposal seq as accepted in the
// same transaction that saves the Architecture it produced.
func Accept(seq int) func(ctx context.Context, tx pgx.Tx, projectID string) error {
	return func(ctx context.Context, tx pgx.Tx, projectID string) error {
		return resolve(ctx, tx, projectID, seq, ProposalAccepted)
	}
}

func resolve(ctx context.Context, db querier, projectID string, seq int, status ProposalStatus) error {
	var current ProposalStatus
	err := db.QueryRow(ctx, `
		UPDATE proposals p SET status = CASE WHEN p.status = 'pending' THEN $3 ELSE p.status END,
		                       resolved_at = CASE WHEN p.status = 'pending' THEN now() ELSE p.resolved_at END
		FROM proposals old
		WHERE p.project_id = $1 AND p.seq = $2 AND old.id = p.id
		RETURNING old.status`, projectID, seq, status).Scan(&current)
	if errors.Is(err, pgx.ErrNoRows) {
		return projects.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("resolve proposal: %w", err)
	}
	if current != ProposalPending {
		return ErrNotPending
	}
	return nil
}

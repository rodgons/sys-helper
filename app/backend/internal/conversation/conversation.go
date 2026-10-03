// Package conversation owns each Project's Conversation: the Messages between the User and the AI.
package conversation

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sys-helper/backend/internal/projects"
	"sys-helper/backend/internal/proposal"
)

type Role string

const (
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
)

// MaxUserMessage is the longest message a User can send, in characters.
const MaxUserMessage = 4000

// MaxReply is the longest AI reply that is stored, in characters (messages.body allows 20,000).
const MaxReply = 20000

const truncatedMarker = "\n\n…[reply truncated]"

// CapReply makes an AI reply storable: it drops NUL characters (Postgres can't store them) and
// cuts a reply that is too long, ending it with a visible marker.
func CapReply(body string) string {
	body = strings.ReplaceAll(body, "\x00", "")
	if utf8.RuneCountInString(body) <= MaxReply {
		return body
	}
	keep := []rune(body)[:MaxReply-utf8.RuneCountInString(truncatedMarker)]
	return strings.TrimRight(string(keep), " \n") + truncatedMarker
}

// WelcomeMessage opens every Conversation. It sets expectations and asks the first question, so
// the User knows the AI will interview them before designing anything.
const WelcomeMessage = "Hi! I'm your AI architect. Before we draw anything, I'll ask you some questions " +
	"about what you're building: who will use it, how much traffic you expect, and what matters most, " +
	"such as latency, consistency or cost. Your answers become the project's requirements, and every " +
	"design decision I propose will point back to them. You can also edit the canvas yourself at any time.\n\n" +
	"What are you building, and who is it for?"

var ErrInvalidMessage = fmt.Errorf("message must be 1 to %d characters", MaxUserMessage)

// MaxMessages caps a Conversation, so a Project's history (which the page loads whole) stays
// bounded. Only a User's message is refused at the cap; replies to it are still saved.
const MaxMessages = 500

// ErrLimit means the Conversation already has MaxMessages Messages.
var ErrLimit = fmt.Errorf("a conversation can have at most %d messages; start a new project to continue", MaxMessages)

type Message struct {
	Role      Role      `json:"role"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
	// Proposal is set on AI messages that proposed changes to the Architecture.
	Proposal *Proposal `json:"proposal,omitempty"`
}

// CleanUserMessage trims a User's message and checks its length.
func CleanUserMessage(body string) (string, error) {
	body = strings.TrimSpace(body)
	// Postgres can't store NUL.
	if body == "" || utf8.RuneCountInString(body) > MaxUserMessage || strings.ContainsRune(body, 0) {
		return "", ErrInvalidMessage
	}
	return body, nil
}

// AddWelcome adds the Welcome Message to a new Project's Conversation. It is projects.Store's
// OnCreate hook, so it runs in the transaction that creates the Project.
func AddWelcome(ctx context.Context, tx pgx.Tx, projectID string) error {
	_, err := insert(ctx, tx, projectID, RoleAssistant, WelcomeMessage)
	return err
}

// Store keeps Conversations, scoped to the Project's owner like projects.Store.
type Store struct{ db *pgxpool.Pool }

func NewStore(db *pgxpool.Pool) *Store { return &Store{db: db} }

// List returns the Project's Messages, oldest first.
func (s *Store) List(ctx context.Context, userID, suffix string) ([]Message, error) {
	projectID, err := s.projectID(ctx, userID, suffix)
	if err != nil {
		return nil, err
	}
	return s.query(ctx, `
		SELECT m.role, m.body, m.created_at,
		       p.seq, p.summary, p.changes, p.status, p.base_version
		FROM messages m LEFT JOIN proposals p ON p.message_id = m.id
		WHERE m.project_id = $1 ORDER BY m.id`, projectID)
}

// Recent returns the Project's last n Messages, oldest first.
func (s *Store) Recent(ctx context.Context, userID, suffix string, n int) ([]Message, error) {
	projectID, err := s.projectID(ctx, userID, suffix)
	if err != nil {
		return nil, err
	}
	return s.query(ctx, `
		SELECT * FROM (
			SELECT m.role, m.body, m.created_at,
			       p.seq, p.summary, p.changes, p.status, p.base_version, m.id
			FROM messages m LEFT JOIN proposals p ON p.message_id = m.id
			WHERE m.project_id = $1 ORDER BY m.id DESC LIMIT $2) recent
		ORDER BY id`, projectID, n)
}

// query reads Messages with their Proposals from rows of role, body, created_at and the Proposal's
// columns (any further columns are ignored).
func (s *Store) query(ctx context.Context, sql string, args ...any) ([]Message, error) {
	rows, err := s.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Message, error) {
		var m Message
		var seq, base *int
		var summary, status *string
		var changes []proposal.Change
		values := []any{&m.Role, &m.Body, &m.CreatedAt, &seq, &summary, &changes, &status, &base}
		for range len(row.FieldDescriptions()) - len(values) {
			values = append(values, new(any))
		}
		err := row.Scan(values...)
		if err == nil && seq != nil {
			m.Proposal = &Proposal{Seq: *seq, Summary: *summary, Changes: changes, Status: ProposalStatus(*status), BaseVersion: *base}
		}
		return m, err
	})
}

// Append adds a Message to the end of the Project's Conversation, or returns ErrLimit once it has
// MaxMessages.
func (s *Store) Append(ctx context.Context, userID, suffix string, role Role, body string) (Message, error) {
	var m Message
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		// The Project's row lock keeps concurrent sends from passing the cap together.
		var projectID string
		err := tx.QueryRow(ctx, `SELECT id FROM projects WHERE user_id = $1 AND slug_suffix = $2 FOR UPDATE`,
			userID, suffix).Scan(&projectID)
		if errors.Is(err, pgx.ErrNoRows) {
			return projects.ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("find project: %w", err)
		}
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM messages WHERE project_id = $1`, projectID).Scan(&n); err != nil {
			return fmt.Errorf("count messages: %w", err)
		}
		if n >= MaxMessages {
			return ErrLimit
		}
		m, err = insert(ctx, tx, projectID, role, body)
		return err
	})
	return m, err
}

func (s *Store) projectID(ctx context.Context, userID, suffix string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx,
		`SELECT id FROM projects WHERE user_id = $1 AND slug_suffix = $2`, userID, suffix).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", projects.ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("find project: %w", err)
	}
	return id, nil
}

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func insert(ctx context.Context, db querier, projectID string, role Role, body string) (Message, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return Message{}, err
	}
	m := Message{Role: role, Body: body}
	err = db.QueryRow(ctx, `
		INSERT INTO messages (id, project_id, role, body) VALUES ($1, $2, $3, $4)
		RETURNING created_at`, id, projectID, role, body).Scan(&m.CreatedAt)
	if err != nil {
		return Message{}, fmt.Errorf("add message: %w", err)
	}
	return m, nil
}

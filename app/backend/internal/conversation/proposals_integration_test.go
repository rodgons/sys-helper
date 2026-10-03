//go:build integration

package conversation_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/jackc/pgx/v5"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/projects"
	"sys-helper/backend/internal/proposal"
	"sys-helper/backend/internal/testdb"
)

func TestProposals(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()
	store := conversation.NewStore(pool)
	architectures := architecture.NewStore(pool)
	projectStore := projects.NewStore(pool)
	projectStore.OnCreate = conversation.AddWelcome
	newProject := func(t *testing.T) (user, suffix string) {
		user = testdb.User(t, pool, "octocat")
		p, err := projectStore.Create(ctx, user, "Shop")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := store.Append(ctx, user, p.SlugSuffix, conversation.RoleUser, "Add a cache"); err != nil {
			t.Fatal(err)
		}
		return user, p.SlugSuffix
	}
	name := "Session Cache"
	changes := proposal.Changes{Summary: "Add a cache", Changes: []proposal.Change{
		{Op: "add_component", Ref: "cache", Type: "cache", Name: &name},
	}}
	reply := func(t *testing.T, user, suffix string) conversation.Message {
		t.Helper()
		m, err := store.AppendReply(ctx, user, suffix, "Here is a cache.", "vendor/model:free", &changes, 0)
		if err != nil {
			t.Fatalf("AppendReply: %v", err)
		}
		return m
	}

	t.Run("stores a reply with its proposal and lists them together", func(t *testing.T) {
		user, suffix := newProject(t)

		m := reply(t, user, suffix)

		if m.Proposal == nil || m.Proposal.Seq != 1 || m.Proposal.Status != conversation.ProposalPending {
			t.Fatalf("reply = %+v", m)
		}
		msgs, _ := store.List(ctx, user, suffix)
		last := msgs[len(msgs)-1]
		if last.Proposal == nil || last.Proposal.Summary != "Add a cache" || *last.Proposal.Changes[0].Name != "Session Cache" {
			t.Errorf("listed = %+v", last)
		}
		if msgs[0].Proposal != nil {
			t.Errorf("welcome message has a proposal: %+v", msgs[0])
		}
	})

	t.Run("records which model wrote a reply", func(t *testing.T) {
		user, suffix := newProject(t)
		reply(t, user, suffix)
		if _, err := store.AppendReply(ctx, user, suffix, "No model known.", "", nil, 0); err != nil {
			t.Fatal(err)
		}

		rows, err := pool.Query(ctx, `
			SELECT coalesce(m.model, '') FROM messages m JOIN projects p ON p.id = m.project_id
			WHERE p.user_id = $1 AND p.slug_suffix = $2 ORDER BY m.id`, user, suffix)
		if err != nil {
			t.Fatal(err)
		}
		models, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			t.Fatal(err)
		}
		if got, want := models[len(models)-2:], []string{"vendor/model:free", ""}; !slices.Equal(got, want) || models[0] != "" {
			t.Errorf("models = %q, want the welcome without one and the replies ending %q", models, want)
		}
	})

	t.Run("a new proposal supersedes the pending one", func(t *testing.T) {
		user, suffix := newProject(t)
		reply(t, user, suffix)

		second := reply(t, user, suffix)

		msgs, _ := store.List(ctx, user, suffix)
		first := msgs[len(msgs)-2].Proposal
		if second.Proposal.Seq != 2 || first.Status != conversation.ProposalSuperseded {
			t.Errorf("first = %+v, second = %+v", first, second.Proposal)
		}
	})

	t.Run("accepting saves the architecture and resolves the proposal together", func(t *testing.T) {
		user, suffix := newProject(t)
		reply(t, user, suffix)
		doc := architecture.Empty()
		doc.Components = append(doc.Components, architecture.Component{ID: "c-1", Type: "cache", Name: "Session Cache"})

		v, err := architectures.SaveWith(ctx, user, suffix, 0, doc, conversation.Accept(1))
		if err != nil || v != 1 {
			t.Fatalf("SaveWith = %d, %v", v, err)
		}

		msgs, _ := store.List(ctx, user, suffix)
		if got := msgs[len(msgs)-1].Proposal.Status; got != conversation.ProposalAccepted {
			t.Errorf("status = %q", got)
		}
		if _, err := architectures.SaveWith(ctx, user, suffix, 1, doc, conversation.Accept(1)); !errors.Is(err, conversation.ErrNotPending) {
			t.Errorf("accepting twice: err = %v, want ErrNotPending", err)
		}
		if got, _ := architectures.Get(ctx, user, suffix); got.Version != 1 {
			t.Errorf("a failed accept still saved: version %d", got.Version)
		}
	})

	t.Run("an outdated canvas neither saves nor accepts", func(t *testing.T) {
		user, suffix := newProject(t)
		reply(t, user, suffix)
		if _, err := architectures.Save(ctx, user, suffix, 0, architecture.Empty()); err != nil {
			t.Fatal(err)
		}

		_, err := architectures.SaveWith(ctx, user, suffix, 0, architecture.Empty(), conversation.Accept(1))

		if !errors.Is(err, architecture.ErrConflict) {
			t.Fatalf("err = %v, want ErrConflict", err)
		}
		msgs, _ := store.List(ctx, user, suffix)
		if got := msgs[len(msgs)-1].Proposal.Status; got != conversation.ProposalPending {
			t.Errorf("status = %q, want still pending", got)
		}
	})

	t.Run("rejects a pending proposal once", func(t *testing.T) {
		user, suffix := newProject(t)
		reply(t, user, suffix)

		if err := store.Reject(ctx, user, suffix, 1); err != nil {
			t.Fatalf("Reject: %v", err)
		}
		if err := store.Reject(ctx, user, suffix, 1); !errors.Is(err, conversation.ErrNotPending) {
			t.Errorf("second Reject: err = %v, want ErrNotPending", err)
		}
	})

	t.Run("a number with no Proposal was discarded, so it is not pending", func(t *testing.T) {
		user, suffix := newProject(t)
		reply(t, user, suffix)

		if err := store.Reject(ctx, user, suffix, 99); !errors.Is(err, conversation.ErrNotPending) {
			t.Errorf("Reject: err = %v, want ErrNotPending", err)
		}
		if _, err := architectures.SaveWith(ctx, user, suffix, 0, architecture.Empty(), conversation.Accept(99)); !errors.Is(err, conversation.ErrNotPending) {
			t.Errorf("Accept: err = %v, want ErrNotPending", err)
		}
		if got, _ := architectures.Get(ctx, user, suffix); got.Version != 0 {
			t.Errorf("a failed accept still saved: version %d", got.Version)
		}
	})

	t.Run("numbers keep going up after Proposals are deleted", func(t *testing.T) {
		user, suffix := newProject(t)
		reply(t, user, suffix)
		reply(t, user, suffix)
		if _, err := pool.Exec(ctx, `
			DELETE FROM messages WHERE project_id = (SELECT id FROM projects WHERE user_id = $1 AND slug_suffix = $2)`,
			user, suffix); err != nil {
			t.Fatal(err)
		}

		if m := reply(t, user, suffix); m.Proposal.Seq != 3 {
			t.Errorf("seq = %d, want 3", m.Proposal.Seq)
		}
	})

	t.Run("a New Conversation deletes the Messages and Proposals and starts with the Welcome Message", func(t *testing.T) {
		user, suffix := newProject(t)
		reply(t, user, suffix)
		reply(t, user, suffix) // pending, superseding the first

		msgs, err := store.StartNew(ctx, user, suffix)
		if err != nil {
			t.Fatalf("StartNew: %v", err)
		}

		if len(msgs) != 1 || msgs[0].Role != conversation.RoleAssistant || msgs[0].Body != conversation.WelcomeMessage || msgs[0].Proposal != nil {
			t.Fatalf("returned = %+v", msgs)
		}
		if listed, _ := store.List(ctx, user, suffix); len(listed) != 1 || listed[0].Body != conversation.WelcomeMessage {
			t.Errorf("listed = %+v", listed)
		}
		var proposals int
		if err := pool.QueryRow(ctx, `
			SELECT count(*) FROM proposals WHERE project_id = (SELECT id FROM projects WHERE user_id = $1 AND slug_suffix = $2)`,
			user, suffix).Scan(&proposals); err != nil {
			t.Fatal(err)
		}
		if proposals != 0 {
			t.Errorf("%d proposals left, want 0", proposals)
		}
		if err := store.Reject(ctx, user, suffix, 2); !errors.Is(err, conversation.ErrNotPending) {
			t.Errorf("reviewing the discarded proposal: err = %v, want ErrNotPending", err)
		}
	})

	t.Run("Proposal numbers continue after a New Conversation", func(t *testing.T) {
		user, suffix := newProject(t)
		reply(t, user, suffix)
		if _, err := store.StartNew(ctx, user, suffix); err != nil {
			t.Fatal(err)
		}
		if _, err := store.Append(ctx, user, suffix, conversation.RoleUser, "Add another cache"); err != nil {
			t.Fatal(err)
		}

		if m := reply(t, user, suffix); m.Proposal.Seq != 2 {
			t.Errorf("seq = %d, want 2", m.Proposal.Seq)
		}
	})

	t.Run("another user can't start a New Conversation in the project", func(t *testing.T) {
		user, suffix := newProject(t)
		intruder := testdb.User(t, pool, "hubot")

		if _, err := store.StartNew(ctx, intruder, suffix); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("err = %v, want ErrNotFound", err)
		}
		if msgs, _ := store.List(ctx, user, suffix); len(msgs) != 2 {
			t.Errorf("messages = %+v, want them untouched", msgs)
		}
	})

	t.Run("the migration seeds the counter from existing Proposals", func(t *testing.T) {
		withProposals, s1 := newProject(t)
		reply(t, withProposals, s1)
		reply(t, withProposals, s1)
		without, s2 := newProject(t)
		files, err := filepath.Glob("../../../../supabase/migrations/*_add_next_proposal_seq.sql")
		if err != nil || len(files) != 1 {
			t.Fatalf("migration files = %v, %v", files, err)
		}
		migration, err := os.ReadFile(files[0])
		if err != nil {
			t.Fatal(err)
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = tx.Rollback(ctx) }() // DDL is transactional: the schema comes back as it was

		if _, err := tx.Exec(ctx, `ALTER TABLE projects DROP COLUMN next_proposal_seq`); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, string(migration)); err != nil {
			t.Fatalf("run migration: %v", err)
		}

		next := func(user, suffix string) int {
			var n int
			if err := tx.QueryRow(ctx, `SELECT next_proposal_seq FROM projects WHERE user_id = $1 AND slug_suffix = $2`,
				user, suffix).Scan(&n); err != nil {
				t.Fatal(err)
			}
			return n
		}
		if got := next(withProposals, s1); got != 3 {
			t.Errorf("with two Proposals: next = %d, want 3", got)
		}
		if got := next(without, s2); got != 1 {
			t.Errorf("without Proposals: next = %d, want 1", got)
		}
	})

	t.Run("hides other users' proposals", func(t *testing.T) {
		_, suffix := newProject(t)
		intruder := testdb.User(t, pool, "hubot")

		if err := store.Reject(ctx, intruder, suffix, 1); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Reject: err = %v, want ErrNotFound", err)
		}
		if _, err := store.AppendReply(ctx, intruder, suffix, "x", "m", &changes, 0); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("AppendReply: err = %v, want ErrNotFound", err)
		}
	})

	t.Run("accepting applies requirements, decisions and the experience level", func(t *testing.T) {
		user, suffix := newProject(t)
		cat, stmt := "performance", "p99 reads under 50 ms"
		cacheName := "Cache"
		changes := proposal.Changes{Summary: "Cache and record why", Changes: []proposal.Change{
			{Op: "set_experience_level", Level: "beginner"},
			{Op: "add_requirement", Ref: "reads", Category: &cat, Statement: &stmt},
			{Op: "add_component", Ref: "cache", Type: "cache", Name: &cacheName},
			{Op: "add_decision", Title: "Read-through cache", Rationale: "Reads dominate", Pattern: "Cache-aside",
				Requirements: []string{"reads"}, Targets: []string{"cache"}},
		}}
		m, err := store.AppendReply(ctx, user, suffix, "Here.", "m", &changes, 0)
		if err != nil {
			t.Fatal(err)
		}
		doc := architecture.Empty()
		doc.Components = append(doc.Components, architecture.Component{ID: proposal.ComponentID(m.Proposal.Seq, "cache"), Type: "cache", Name: "Cache"})
		architectures.AfterSave = knowledge.PruneDecisions
		defer func() { architectures.AfterSave = nil }()

		if _, err := architectures.SaveWith(ctx, user, suffix, 0, doc, conversation.Accept(m.Proposal.Seq)); err != nil {
			t.Fatalf("accept: %v", err)
		}

		k, err := knowledge.NewStore(pool).Get(ctx, user, suffix)
		if err != nil {
			t.Fatal(err)
		}
		if k.ExperienceLevel != "beginner" || len(k.Requirements) != 1 || k.Requirements[0].Statement != stmt {
			t.Fatalf("knowledge = %+v", k)
		}
		if len(k.Decisions) != 1 {
			t.Fatalf("decisions = %+v", k.Decisions)
		}
		d := k.Decisions[0]
		if d.Author != knowledge.AuthorAI || d.Targets[0] != "p1-cache" || len(d.Requirements) != 1 || d.Requirements[0] != k.Requirements[0].Num {
			t.Errorf("decision = %+v", d)
		}
	})
}

//go:build integration

package conversation_test

import (
	"context"
	"errors"
	"testing"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/conversation"
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
		m, err := store.AppendReply(ctx, user, suffix, "Here is a cache.", &changes, 0)
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
		if err := store.Reject(ctx, user, suffix, 99); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("unknown seq: err = %v, want ErrNotFound", err)
		}
	})

	t.Run("hides other users' proposals", func(t *testing.T) {
		_, suffix := newProject(t)
		intruder := testdb.User(t, pool, "hubot")

		if err := store.Reject(ctx, intruder, suffix, 1); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Reject: err = %v, want ErrNotFound", err)
		}
		if _, err := store.AppendReply(ctx, intruder, suffix, "x", &changes, 0); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("AppendReply: err = %v, want ErrNotFound", err)
		}
	})
}

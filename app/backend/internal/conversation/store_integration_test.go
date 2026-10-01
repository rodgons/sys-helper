//go:build integration

package conversation_test

import (
	"context"
	"errors"
	"testing"

	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/projects"
	"sys-helper/backend/internal/testdb"
)

func TestStore(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()
	store := conversation.NewStore(pool)
	projectStore := projects.NewStore(pool)
	projectStore.OnCreate = conversation.AddWelcome
	newProject := func(t *testing.T) (user, suffix string) {
		user = testdb.User(t, pool, "octocat")
		p, err := projectStore.Create(ctx, user, "Shop")
		if err != nil {
			t.Fatal(err)
		}
		return user, p.SlugSuffix
	}

	t.Run("a new project's conversation starts with the welcome message", func(t *testing.T) {
		user, suffix := newProject(t)

		msgs, err := store.List(ctx, user, suffix)
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		if len(msgs) != 1 || msgs[0].Role != conversation.RoleAssistant || msgs[0].Body != conversation.WelcomeMessage {
			t.Fatalf("List = %+v", msgs)
		}
	})

	t.Run("appends messages in order", func(t *testing.T) {
		user, suffix := newProject(t)

		for _, body := range []string{"A URL shortener", "For a marketing team"} {
			if _, err := store.Append(ctx, user, suffix, conversation.RoleUser, body); err != nil {
				t.Fatalf("Append: %v", err)
			}
		}

		msgs, _ := store.List(ctx, user, suffix)
		var bodies []string
		for _, m := range msgs[1:] {
			bodies = append(bodies, m.Body)
		}
		if len(bodies) != 2 || bodies[0] != "A URL shortener" || bodies[1] != "For a marketing team" {
			t.Errorf("bodies = %v", bodies)
		}
	})

	t.Run("hides other users' conversations", func(t *testing.T) {
		_, suffix := newProject(t)
		intruder := testdb.User(t, pool, "hubot")

		if _, err := store.List(ctx, intruder, suffix); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("List: err = %v, want ErrNotFound", err)
		}
		if _, err := store.Append(ctx, intruder, suffix, conversation.RoleUser, "hi"); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Append: err = %v, want ErrNotFound", err)
		}
	})
}

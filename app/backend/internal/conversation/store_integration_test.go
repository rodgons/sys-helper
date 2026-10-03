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

	t.Run("reads the most recent messages, oldest first", func(t *testing.T) {
		user, suffix := newProject(t)
		for _, body := range []string{"one", "two", "three"} {
			if _, err := store.Append(ctx, user, suffix, conversation.RoleUser, body); err != nil {
				t.Fatal(err)
			}
		}

		msgs, err := store.Recent(ctx, user, suffix, 2)
		if err != nil || len(msgs) != 2 || msgs[0].Body != "two" || msgs[1].Body != "three" {
			t.Errorf("Recent = %+v, %v", msgs, err)
		}
	})

	t.Run("refuses a user message once the conversation is full", func(t *testing.T) {
		user, suffix := newProject(t)
		// Fill it directly: the Welcome Message plus enough to reach the cap.
		if _, err := pool.Exec(ctx, `
			INSERT INTO messages (id, project_id, role, body)
			SELECT gen_random_uuid(), p.id, 'user', 'filler' FROM projects p, generate_series(2, $2)
			WHERE p.slug_suffix = $1`, suffix, conversation.MaxMessages); err != nil {
			t.Fatal(err)
		}

		if _, err := store.Append(ctx, user, suffix, conversation.RoleUser, "one more"); !errors.Is(err, conversation.ErrLimit) {
			t.Errorf("Append to a full conversation: err = %v, want ErrLimit", err)
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
		if _, err := store.Recent(ctx, intruder, suffix, 5); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Recent: err = %v, want ErrNotFound", err)
		}
	})
}

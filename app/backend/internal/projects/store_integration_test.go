//go:build integration

package projects_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"sys-helper/backend/internal/projects"
	"sys-helper/backend/internal/testdb"
)

func TestStore(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()
	store := projects.NewStore(pool)

	t.Run("creates a project with a UUIDv7 and a slug suffix", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")

		p, err := store.Create(ctx, user, "URL Shortener")
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		if id, err := uuid.Parse(p.ID); err != nil || id.Version() != 7 {
			t.Errorf("ID = %q, want a UUIDv7", p.ID)
		}
		if _, ok := projects.SuffixFromSlug(p.Slug()); !ok || p.Name != "URL Shortener" {
			t.Errorf("project = %+v", p)
		}
	})

	t.Run("lists only the user's projects, most recently updated first", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")
		other := testdb.User(t, pool, "hubot")
		first := must(store.Create(ctx, user, "First"))
		second := must(store.Create(ctx, user, "Second"))
		must(store.Create(ctx, other, "Not mine"))
		must(store.Rename(ctx, user, first.SlugSuffix, "First, renamed"))

		list, err := store.List(ctx, user)
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		if len(list) != 2 || list[0].SlugSuffix != first.SlugSuffix || list[1].SlugSuffix != second.SlugSuffix {
			t.Errorf("List = %+v", list)
		}
	})

	t.Run("gets, renames and deletes by suffix, keeping the suffix", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")
		p := must(store.Create(ctx, user, "Old name"))

		renamed, err := store.Rename(ctx, user, p.SlugSuffix, "New name")
		if err != nil {
			t.Fatalf("Rename: %v", err)
		}
		if renamed.SlugSuffix != p.SlugSuffix || renamed.Name != "New name" {
			t.Errorf("renamed = %+v", renamed)
		}
		got, err := store.Get(ctx, user, p.SlugSuffix)
		if err != nil || got.Name != "New name" {
			t.Fatalf("Get = %+v, %v", got, err)
		}
		if err := store.Delete(ctx, user, p.SlugSuffix); err != nil {
			t.Fatalf("Delete: %v", err)
		}
		if _, err := store.Get(ctx, user, p.SlugSuffix); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Get after Delete: err = %v, want ErrNotFound", err)
		}
	})

	t.Run("hides other users' projects", func(t *testing.T) {
		owner := testdb.User(t, pool, "octocat")
		intruder := testdb.User(t, pool, "hubot")
		p := must(store.Create(ctx, owner, "Private"))

		if _, err := store.Get(ctx, intruder, p.SlugSuffix); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Get: err = %v, want ErrNotFound", err)
		}
		if _, err := store.Rename(ctx, intruder, p.SlugSuffix, "Mine now"); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Rename: err = %v, want ErrNotFound", err)
		}
		if err := store.Delete(ctx, intruder, p.SlugSuffix); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Delete: err = %v, want ErrNotFound", err)
		}
		if got, err := store.Get(ctx, owner, p.SlugSuffix); err != nil || got.Name != "Private" {
			t.Errorf("owner's project changed: %+v, %v", got, err)
		}
	})

	t.Run("retries when a new suffix collides", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")
		taken := must(store.Create(ctx, user, "Taken"))
		suffixes := []string{taken.SlugSuffix, "zzzzzzzzz1"}
		colliding := projects.NewStore(pool)
		colliding.NewSuffix = func() string {
			s := suffixes[0]
			suffixes = suffixes[1:]
			return s
		}

		p, err := colliding.Create(ctx, user, "Second")
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		if p.SlugSuffix != "zzzzzzzzz1" {
			t.Errorf("SlugSuffix = %q, want the retried suffix", p.SlugSuffix)
		}
	})
}

func must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}

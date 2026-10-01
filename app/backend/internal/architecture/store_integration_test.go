//go:build integration

package architecture_test

import (
	"context"
	"errors"
	"testing"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/projects"
	"sys-helper/backend/internal/testdb"
)

func TestStore(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()
	store := architecture.NewStore(pool)
	newProject := func(t *testing.T) (user, suffix string) {
		user = testdb.User(t, pool, "octocat")
		p, err := projects.NewStore(pool).Create(ctx, user, "Shop")
		if err != nil {
			t.Fatal(err)
		}
		return user, p.SlugSuffix
	}
	doc := func(name string) architecture.Document {
		d := architecture.Empty()
		d.Components = append(d.Components, architecture.Component{ID: "a", Type: "service", Name: name})
		return d
	}

	t.Run("a new project has an empty architecture at version 0", func(t *testing.T) {
		user, suffix := newProject(t)

		got, err := store.Get(ctx, user, suffix)
		if err != nil {
			t.Fatalf("Get: %v", err)
		}
		if got.Version != 0 || len(got.Document.Components) != 0 || got.Document.Connections == nil {
			t.Errorf("Get = %+v", got)
		}
	})

	t.Run("each save increments the version", func(t *testing.T) {
		user, suffix := newProject(t)

		v1, err := store.Save(ctx, user, suffix, 0, doc("API"))
		if err != nil || v1 != 1 {
			t.Fatalf("first Save = %d, %v", v1, err)
		}
		v2, err := store.Save(ctx, user, suffix, 1, doc("API v2"))
		if err != nil || v2 != 2 {
			t.Fatalf("second Save = %d, %v", v2, err)
		}
		got, _ := store.Get(ctx, user, suffix)
		if got.Version != 2 || got.Document.Components[0].Name != "API v2" {
			t.Errorf("Get = %+v", got)
		}
	})

	t.Run("rejects a save based on an outdated version", func(t *testing.T) {
		user, suffix := newProject(t)
		if _, err := store.Save(ctx, user, suffix, 0, doc("first tab")); err != nil {
			t.Fatal(err)
		}

		for _, base := range []int{0, 5} {
			if _, err := store.Save(ctx, user, suffix, base, doc("second tab")); !errors.Is(err, architecture.ErrConflict) {
				t.Errorf("Save from version %d: err = %v, want ErrConflict", base, err)
			}
		}
		got, _ := store.Get(ctx, user, suffix)
		if got.Document.Components[0].Name != "first tab" {
			t.Errorf("stale save overwrote the document: %+v", got)
		}
	})

	t.Run("rejects a first save from a non-zero version", func(t *testing.T) {
		user, suffix := newProject(t)

		if _, err := store.Save(ctx, user, suffix, 3, doc("x")); !errors.Is(err, architecture.ErrConflict) {
			t.Errorf("err = %v, want ErrConflict", err)
		}
	})

	t.Run("hides other users' architectures", func(t *testing.T) {
		_, suffix := newProject(t)
		intruder := testdb.User(t, pool, "hubot")

		if _, err := store.Get(ctx, intruder, suffix); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Get: err = %v, want ErrNotFound", err)
		}
		if _, err := store.Save(ctx, intruder, suffix, 0, doc("x")); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Save: err = %v, want ErrNotFound", err)
		}
	})

	t.Run("saving marks the project as recently updated", func(t *testing.T) {
		user, older := newProject(t)
		newer, err := projects.NewStore(pool).Create(ctx, user, "Newer")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := store.Save(ctx, user, older, 0, doc("x")); err != nil {
			t.Fatal(err)
		}

		list, _ := projects.NewStore(pool).List(ctx, user)
		if list[0].SlugSuffix != older || list[1].SlugSuffix != newer.SlugSuffix {
			t.Errorf("List order = %v, %v", list[0].Name, list[1].Name)
		}
	})
}

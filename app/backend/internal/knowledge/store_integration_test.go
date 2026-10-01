//go:build integration

package knowledge_test

import (
	"context"
	"errors"
	"testing"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/projects"
	"sys-helper/backend/internal/testdb"
)

func TestStore(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()
	store := knowledge.NewStore(pool)
	architectures := architecture.NewStore(pool)
	architectures.AfterSave = knowledge.PruneDecisions
	ptr := func(s string) *string { return &s }

	// newProject has components api and db and connection k1 on its canvas.
	newProject := func(t *testing.T) (user, suffix string) {
		user = testdb.User(t, pool, "octocat")
		p, err := projects.NewStore(pool).Create(ctx, user, "Shop")
		if err != nil {
			t.Fatal(err)
		}
		doc := architecture.Empty()
		doc.Components = []architecture.Component{{ID: "api", Type: "service", Name: "API"}, {ID: "db", Type: "database", Name: "DB"}}
		doc.Connections = []architecture.Connection{{ID: "k1", Source: "api", Target: "db", Kind: "sync"}}
		if _, err := architectures.Save(ctx, user, p.SlugSuffix, 0, doc); err != nil {
			t.Fatal(err)
		}
		return user, p.SlugSuffix
	}

	t.Run("numbers requirements and decisions per project", func(t *testing.T) {
		user, suffix := newProject(t)

		r1, err := store.AddRequirement(ctx, user, suffix, "scale", "10k rps")
		if err != nil {
			t.Fatal(err)
		}
		r2, _ := store.AddRequirement(ctx, user, suffix, "cost", "Under $500/month")
		d1, err := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "Postgres", Rationale: "Team knows it",
			Requirements: []int{r2.Num}, Targets: []string{"db"}})
		if err != nil {
			t.Fatal(err)
		}
		if r1.Num != 1 || r2.Num != 2 || d1.Num != 1 || d1.Author != knowledge.AuthorUser {
			t.Errorf("r1 = %+v, r2 = %+v, d1 = %+v", r1, r2, d1)
		}
		k, err := store.Get(ctx, user, suffix)
		if err != nil || len(k.Requirements) != 2 || len(k.Decisions) != 1 || k.Decisions[0].Requirements[0] != 2 {
			t.Fatalf("Get = %+v, %v", k, err)
		}
	})

	t.Run("never reuses the number of a deleted requirement or decision", func(t *testing.T) {
		user, suffix := newProject(t)
		store.AddRequirement(ctx, user, suffix, "scale", "10k rps")
		r2, _ := store.AddRequirement(ctx, user, suffix, "cost", "cheap")
		d1, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "A", Rationale: "R", Targets: []string{"api"}})
		if err := store.RemoveRequirement(ctx, user, suffix, r2.Num); err != nil {
			t.Fatal(err)
		}
		if err := store.RemoveDecision(ctx, user, suffix, d1.Num); err != nil {
			t.Fatal(err)
		}

		r3, err := store.AddRequirement(ctx, user, suffix, "security", "SSO only")
		if err != nil {
			t.Fatal(err)
		}
		d2, err := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "B", Rationale: "R", Targets: []string{"db"}})
		if err != nil {
			t.Fatal(err)
		}
		if r3.Num != 3 || d2.Num != 2 {
			t.Errorf("new requirement R%d, decision D%d; want R3 and D2", r3.Num, d2.Num)
		}
	})

	t.Run("rejects user decisions on missing items or requirements", func(t *testing.T) {
		user, suffix := newProject(t)

		if _, err := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "T", Rationale: "R", Targets: []string{"ghost"}}); !errors.Is(err, knowledge.ErrInvalid) {
			t.Errorf("missing target: err = %v", err)
		}
		if _, err := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "T", Rationale: "R", Targets: []string{"api"}, Requirements: []int{9}}); !errors.Is(err, knowledge.ErrInvalid) {
			t.Errorf("missing requirement: err = %v", err)
		}
	})

	t.Run("changing or removing a requirement flags the decisions citing it", func(t *testing.T) {
		user, suffix := newProject(t)
		r1, _ := store.AddRequirement(ctx, user, suffix, "scale", "10k rps")
		r2, _ := store.AddRequirement(ctx, user, suffix, "cost", "cheap")
		cites1, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "A", Rationale: "R", Requirements: []int{r1.Num}, Targets: []string{"api"}})
		cites2, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "B", Rationale: "R", Requirements: []int{r2.Num}, Targets: []string{"db"}})

		if _, err := store.UpdateRequirement(ctx, user, suffix, r1.Num, nil, ptr("50k rps")); err != nil {
			t.Fatal(err)
		}
		if err := store.RemoveRequirement(ctx, user, suffix, r2.Num); err != nil {
			t.Fatal(err)
		}

		k, _ := store.Get(ctx, user, suffix)
		for _, d := range k.Decisions {
			if !d.NeedsReview {
				t.Errorf("decision %d not flagged: %+v", d.Num, d)
			}
			if d.Num == cites2.Num && len(d.Requirements) != 0 {
				t.Errorf("removed requirement still cited: %+v", d)
			}
		}
		_ = cites1
	})

	t.Run("confirming or editing a decision clears its review flag", func(t *testing.T) {
		user, suffix := newProject(t)
		r1, _ := store.AddRequirement(ctx, user, suffix, "scale", "10k rps")
		d, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "A", Rationale: "R", Requirements: []int{r1.Num}, Targets: []string{"api"}})
		_, _ = store.UpdateRequirement(ctx, user, suffix, r1.Num, nil, ptr("20k rps"))

		updated, err := store.UpdateDecision(ctx, user, suffix, d.Num, knowledge.DecisionPatch{Title: ptr("A, revisited")})
		if err != nil || updated.NeedsReview || updated.Title != "A, revisited" {
			t.Fatalf("UpdateDecision = %+v, %v", updated, err)
		}
	})

	t.Run("saving the canvas detaches decisions from removed items and deletes orphans", func(t *testing.T) {
		user, suffix := newProject(t)
		both, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "Both", Rationale: "R", Targets: []string{"api", "db"}})
		dbOnly, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "DB", Rationale: "R", Targets: []string{"db", "k1"}})

		doc := architecture.Empty()
		doc.Components = []architecture.Component{{ID: "api", Type: "service", Name: "API"}}
		if _, err := architectures.Save(ctx, user, suffix, 1, doc); err != nil {
			t.Fatal(err)
		}

		k, _ := store.Get(ctx, user, suffix)
		if len(k.Decisions) != 1 || k.Decisions[0].Num != both.Num || len(k.Decisions[0].Targets) != 1 || k.Decisions[0].Targets[0] != "api" {
			t.Errorf("decisions = %+v (orphan %d should be gone)", k.Decisions, dbOnly.Num)
		}
	})

	t.Run("sets the experience level", func(t *testing.T) {
		user, suffix := newProject(t)

		if err := store.SetExperienceLevel(ctx, user, suffix, "beginner"); err != nil {
			t.Fatal(err)
		}
		if k, _ := store.Get(ctx, user, suffix); k.ExperienceLevel != "beginner" {
			t.Errorf("level = %q", k.ExperienceLevel)
		}
		if err := store.SetExperienceLevel(ctx, user, suffix, "guru"); !errors.Is(err, knowledge.ErrInvalid) {
			t.Errorf("invalid level: err = %v", err)
		}
	})

	t.Run("falls back to the user's default experience level", func(t *testing.T) {
		user, suffix := newProject(t)

		if level, err := store.DefaultExperienceLevel(ctx, user); err != nil || level != "" {
			t.Fatalf("default before any set = %q, %v", level, err)
		}
		if err := store.SetDefaultExperienceLevel(ctx, user, "expert"); err != nil {
			t.Fatal(err)
		}
		if level, _ := store.DefaultExperienceLevel(ctx, user); level != "expert" {
			t.Errorf("default = %q", level)
		}
		if k, _ := store.Get(ctx, user, suffix); k.ExperienceLevel != "expert" {
			t.Errorf("project without its own level = %q, want the default", k.ExperienceLevel)
		}

		// A level set on the Project wins over the default.
		if err := store.SetExperienceLevel(ctx, user, suffix, "beginner"); err != nil {
			t.Fatal(err)
		}
		if k, _ := store.Get(ctx, user, suffix); k.ExperienceLevel != "beginner" {
			t.Errorf("project level = %q", k.ExperienceLevel)
		}

		if err := store.SetDefaultExperienceLevel(ctx, user, ""); err != nil {
			t.Fatal(err)
		}
		if level, _ := store.DefaultExperienceLevel(ctx, user); level != "" {
			t.Errorf("cleared default = %q", level)
		}
		if err := store.SetDefaultExperienceLevel(ctx, user, "guru"); !errors.Is(err, knowledge.ErrInvalid) {
			t.Errorf("invalid default: err = %v", err)
		}
	})

	t.Run("hides other users' knowledge", func(t *testing.T) {
		_, suffix := newProject(t)
		intruder := testdb.User(t, pool, "hubot")

		if _, err := store.Get(ctx, intruder, suffix); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Get: err = %v", err)
		}
		if _, err := store.AddRequirement(ctx, intruder, suffix, "scale", "x"); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("AddRequirement: err = %v", err)
		}
		if err := store.RemoveDecision(ctx, intruder, suffix, 1); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("RemoveDecision: err = %v", err)
		}
	})

	t.Run("reports unknown requirements and decisions", func(t *testing.T) {
		user, suffix := newProject(t)

		if err := store.RemoveRequirement(ctx, user, suffix, 7); !errors.Is(err, knowledge.ErrNotFound) {
			t.Errorf("RemoveRequirement: err = %v", err)
		}
		if _, err := store.UpdateDecision(ctx, user, suffix, 7, knowledge.DecisionPatch{Title: ptr("x")}); !errors.Is(err, knowledge.ErrNotFound) {
			t.Errorf("UpdateDecision: err = %v", err)
		}
	})
}

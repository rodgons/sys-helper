//go:build integration

package knowledge_test

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

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
	architectures.OnOpen = knowledge.PruneDecisions
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

	t.Run("caps requirements and decisions per project", func(t *testing.T) {
		user, suffix := newProject(t)
		// Fill the project to the limits directly, as many adds would be slow.
		if _, err := pool.Exec(ctx, `
			WITH p AS (SELECT id FROM projects WHERE slug_suffix = $1),
			     r AS (INSERT INTO requirements (id, project_id, num, category, statement)
			           SELECT gen_random_uuid(), p.id, n, 'scale', 'r' || n FROM p, generate_series(1, $2::int) n),
			     d AS (INSERT INTO decisions (id, project_id, num, title, rationale, targets, author)
			           SELECT gen_random_uuid(), p.id, n, 'd' || n, 'why', '{api}', 'user' FROM p, generate_series(1, $3::int) n)
			UPDATE projects SET next_requirement_num = $2 + 1, next_decision_num = $3 + 1 WHERE id = (SELECT id FROM p)`,
			suffix, knowledge.MaxRequirements, knowledge.MaxDecisions); err != nil {
			t.Fatal(err)
		}

		if _, err := store.AddRequirement(ctx, user, suffix, "cost", "cheap"); !errors.Is(err, knowledge.ErrLimit) {
			t.Errorf("requirement over the limit: err = %v, want ErrLimit", err)
		}
		if _, err := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "T", Rationale: "R", Targets: []string{"db"}}); !errors.Is(err, knowledge.ErrLimit) {
			t.Errorf("decision over the limit: err = %v, want ErrLimit", err)
		}
	})

	t.Run("caps a decision's targets and cited requirements", func(t *testing.T) {
		user, suffix := newProject(t)
		r1, _ := store.AddRequirement(ctx, user, suffix, "scale", "10k rps")
		many := func(n int) []int {
			nums := make([]int, n)
			for i := range nums {
				nums[i] = r1.Num
			}
			return nums
		}

		_, err := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "T", Rationale: "R", Targets: []string{"db"},
			Requirements: many(knowledge.MaxReferences + 1)})
		if !errors.Is(err, knowledge.ErrInvalid) {
			t.Errorf("too many cited requirements: err = %v, want ErrInvalid", err)
		}
		d, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "T", Rationale: "R", Targets: []string{"db"}})
		reqs := many(knowledge.MaxReferences + 1)
		if _, err := store.UpdateDecision(ctx, user, suffix, d.Num, knowledge.DecisionPatch{Requirements: &reqs}); !errors.Is(err, knowledge.ErrInvalid) {
			t.Errorf("update with too many cited requirements: err = %v, want ErrInvalid", err)
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

	// save puts only the given components (and no connections) on the project's canvas.
	save := func(t *testing.T, user, suffix string, components ...string) {
		t.Helper()
		current, err := architectures.Get(ctx, user, suffix)
		if err != nil {
			t.Fatal(err)
		}
		doc := architecture.Empty()
		for _, id := range components {
			doc.Components = append(doc.Components, architecture.Component{ID: id, Type: "service", Name: id})
		}
		if _, err := architectures.Save(ctx, user, suffix, current.Version, doc); err != nil {
			t.Fatal(err)
		}
	}
	// stored reads a decision's row as stored, hidden or not.
	stored := func(t *testing.T, suffix string, num int) (targets []string, found bool) {
		t.Helper()
		err := pool.QueryRow(ctx, `
			SELECT d.targets FROM decisions d JOIN projects p ON p.id = d.project_id
			WHERE p.slug_suffix = $1 AND d.num = $2`, suffix, num).Scan(&targets)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false
		}
		if err != nil {
			t.Fatal(err)
		}
		return targets, true
	}
	loaded := func(t *testing.T, user, suffix string) map[int]knowledge.Decision {
		t.Helper()
		k, err := store.Get(ctx, user, suffix)
		if err != nil {
			t.Fatal(err)
		}
		byNum := map[int]knowledge.Decision{}
		for _, d := range k.Decisions {
			byNum[d.Num] = d
		}
		return byNum
	}

	t.Run("hides a decision while its items are off the canvas, and brings it back whole", func(t *testing.T) {
		user, suffix := newProject(t)
		r1, _ := store.AddRequirement(ctx, user, suffix, "scale", "10k rps")
		d, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "DB", Rationale: "R", Requirements: []int{r1.Num}, Targets: []string{"db"}})
		_, _ = store.UpdateRequirement(ctx, user, suffix, r1.Num, nil, ptr("20k rps")) // flags it

		save(t, user, suffix, "api")
		if _, ok := loaded(t, user, suffix)[d.Num]; ok {
			t.Errorf("decision %d shown while db is off the canvas", d.Num)
		}
		if _, ok := stored(t, suffix, d.Num); !ok {
			t.Fatalf("decision %d deleted by a save", d.Num)
		}

		save(t, user, suffix, "api", "db")
		back, ok := loaded(t, user, suffix)[d.Num]
		if !ok || back.Title != "DB" || !back.NeedsReview || !slices.Equal(back.Targets, []string{"db"}) {
			t.Errorf("restored decision = %+v (found %v)", back, ok)
		}
	})

	t.Run("narrows a decision's targets to the items on the canvas", func(t *testing.T) {
		user, suffix := newProject(t)
		both, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "Both", Rationale: "R", Targets: []string{"api", "db"}})

		save(t, user, suffix, "api")
		if got := loaded(t, user, suffix)[both.Num].Targets; !slices.Equal(got, []string{"api"}) {
			t.Errorf("targets with db gone = %v, want [api]", got)
		}

		save(t, user, suffix, "api", "db")
		if got := loaded(t, user, suffix)[both.Num].Targets; !slices.Equal(got, []string{"api", "db"}) {
			t.Errorf("targets with db back = %v, want [api db]", got)
		}
	})

	t.Run("editing a partly hidden decision keeps its hidden targets", func(t *testing.T) {
		user, suffix := newProject(t)
		both, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "Both", Rationale: "R", Targets: []string{"api", "db"}})
		save(t, user, suffix, "api")

		if _, err := store.UpdateDecision(ctx, user, suffix, both.Num, knowledge.DecisionPatch{Title: ptr("Both, revisited")}); err != nil {
			t.Fatal(err)
		}

		if targets, _ := stored(t, suffix, both.Num); !slices.Equal(targets, []string{"api", "db"}) {
			t.Errorf("stored targets = %v, want [api db]", targets)
		}
	})

	t.Run("opening the architecture deletes decisions with no target left and narrows the rest", func(t *testing.T) {
		user, suffix := newProject(t)
		both, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "Both", Rationale: "R", Targets: []string{"api", "db"}})
		dbOnly, _ := store.AddDecision(ctx, user, suffix, knowledge.Decision{Title: "DB", Rationale: "R", Targets: []string{"db", "k1"}})
		save(t, user, suffix, "api")

		if _, err := architectures.Get(ctx, user, suffix); err != nil {
			t.Fatal(err)
		}
		if _, ok := stored(t, suffix, dbOnly.Num); !ok {
			t.Fatalf("Get pruned decision %d", dbOnly.Num)
		}

		v, err := architectures.Open(ctx, user, suffix)
		if err != nil || len(v.Document.Components) != 1 || v.Version != 2 {
			t.Fatalf("Open = %+v, %v", v, err)
		}
		if _, ok := stored(t, suffix, dbOnly.Num); ok {
			t.Errorf("decision %d with no target left survived Open", dbOnly.Num)
		}
		if targets, _ := stored(t, suffix, both.Num); !slices.Equal(targets, []string{"api"}) {
			t.Errorf("stored targets after Open = %v, want [api]", targets)
		}
	})

	t.Run("opening hides other users' architectures", func(t *testing.T) {
		_, suffix := newProject(t)
		intruder := testdb.User(t, pool, "intruder")

		if _, err := architectures.Open(ctx, intruder, suffix); !errors.Is(err, projects.ErrNotFound) {
			t.Errorf("Open: err = %v, want ErrNotFound", err)
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

	t.Run("reads without waiting for a write in progress", func(t *testing.T) {
		user, suffix := newProject(t)
		// Another transaction holds the Project's row lock, as every knowledge write does.
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, `SELECT 1 FROM projects WHERE slug_suffix = $1 FOR UPDATE`, suffix); err != nil {
			t.Fatal(err)
		}

		short, cancel := context.WithTimeout(ctx, time.Second)
		defer cancel()
		if _, err := store.Get(short, user, suffix); err != nil {
			t.Errorf("Get while the Project is locked: %v", err)
		}
	})

	t.Run("reports a failure to read the default experience level", func(t *testing.T) {
		user := testdb.User(t, pool, "octocat")
		cancelled, cancel := context.WithCancel(ctx)
		cancel()

		if level, err := store.DefaultExperienceLevel(cancelled, user); err == nil {
			t.Errorf("DefaultExperienceLevel = %q, nil; want the query's error", level)
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

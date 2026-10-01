package httpapi_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"sys-helper/backend/internal/httpapi"
	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/projects"
)

// fakeKnowledge is octocat's project k3xa9q2m7p, holding knowledge in memory.
type fakeKnowledge struct{ k knowledge.Knowledge }

func (f *fakeKnowledge) owned(userID, suffix string) error {
	if userID != octocat.ID || suffix != "k3xa9q2m7p" {
		return projects.ErrNotFound
	}
	return nil
}

func (f *fakeKnowledge) Get(_ context.Context, userID, suffix string) (knowledge.Knowledge, error) {
	return f.k, f.owned(userID, suffix)
}

func (f *fakeKnowledge) AddRequirement(_ context.Context, userID, suffix, category, statement string) (knowledge.Requirement, error) {
	if err := f.owned(userID, suffix); err != nil {
		return knowledge.Requirement{}, err
	}
	if err := knowledge.CheckRequirement(&category, &statement); err != nil {
		return knowledge.Requirement{}, err
	}
	if len(f.k.Requirements) >= knowledge.MaxRequirements {
		return knowledge.Requirement{}, fmt.Errorf("%w: at most %d", knowledge.ErrLimit, knowledge.MaxRequirements)
	}
	r := knowledge.Requirement{Num: len(f.k.Requirements) + 1, Category: category, Statement: statement}
	f.k.Requirements = append(f.k.Requirements, r)
	return r, nil
}

func (f *fakeKnowledge) UpdateRequirement(_ context.Context, userID, suffix string, num int, category, statement *string) (knowledge.Requirement, error) {
	if err := f.owned(userID, suffix); err != nil {
		return knowledge.Requirement{}, err
	}
	for i, r := range f.k.Requirements {
		if r.Num == num {
			if statement != nil {
				f.k.Requirements[i].Statement = *statement
			}
			return f.k.Requirements[i], nil
		}
	}
	return knowledge.Requirement{}, knowledge.ErrNotFound
}

func (f *fakeKnowledge) RemoveRequirement(_ context.Context, userID, suffix string, num int) error {
	if err := f.owned(userID, suffix); err != nil {
		return err
	}
	return knowledge.ErrNotFound
}

func (f *fakeKnowledge) AddDecision(_ context.Context, userID, suffix string, d knowledge.Decision) (knowledge.Decision, error) {
	if err := f.owned(userID, suffix); err != nil {
		return knowledge.Decision{}, err
	}
	d.Num, d.Author = len(f.k.Decisions)+1, knowledge.AuthorUser
	f.k.Decisions = append(f.k.Decisions, d)
	return d, nil
}

func (f *fakeKnowledge) UpdateDecision(_ context.Context, userID, suffix string, num int, p knowledge.DecisionPatch) (knowledge.Decision, error) {
	if err := f.owned(userID, suffix); err != nil {
		return knowledge.Decision{}, err
	}
	for i, d := range f.k.Decisions {
		if d.Num == num {
			if p.Title != nil {
				f.k.Decisions[i].Title = *p.Title
			}
			f.k.Decisions[i].NeedsReview = false
			return f.k.Decisions[i], nil
		}
	}
	return knowledge.Decision{}, knowledge.ErrNotFound
}

func (f *fakeKnowledge) RemoveDecision(_ context.Context, userID, suffix string, num int) error {
	if err := f.owned(userID, suffix); err != nil {
		return err
	}
	f.k.Decisions = nil
	return nil
}

func (f *fakeKnowledge) SetExperienceLevel(_ context.Context, userID, suffix, level string) error {
	if err := f.owned(userID, suffix); err != nil {
		return err
	}
	if err := knowledge.CheckLevel(level); err != nil {
		return err
	}
	f.k.ExperienceLevel = level
	return nil
}

func TestKnowledge(t *testing.T) {
	const base = "/api/projects/shop-k3xa9q2m7p"
	newDeps := func() (httpapi.Deps, *fakeKnowledge) {
		f := &fakeKnowledge{k: knowledge.Knowledge{Requirements: []knowledge.Requirement{}, Decisions: []knowledge.Decision{
			{Num: 1, Title: "Postgres", Rationale: "ACID", Targets: []string{"db"}, Requirements: []int{}, NeedsReview: true},
		}}}
		return httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: everyone, Knowledge: f}, f
	}

	t.Run("adds a requirement and returns the project's knowledge", func(t *testing.T) {
		deps, _ := newDeps()

		rec := call(t, deps, http.MethodPost, base+"/requirements", `{"category":"scale","statement":"10k rps"}`)
		if rec.Code != http.StatusCreated || decode[map[string]string](t, rec)["id"] != "R1" {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}

		got := decode[map[string]any](t, call(t, deps, http.MethodGet, base+"/knowledge", ""))
		if reqs := got["requirements"].([]any); len(reqs) != 1 || reqs[0].(map[string]any)["statement"] != "10k rps" {
			t.Errorf("knowledge = %v", got)
		}
	})

	t.Run("updates a requirement by its id", func(t *testing.T) {
		deps, _ := newDeps()
		call(t, deps, http.MethodPost, base+"/requirements", `{"category":"scale","statement":"10k rps"}`)

		rec := call(t, deps, http.MethodPatch, base+"/requirements/R1", `{"statement":"20k rps"}`)

		if rec.Code != http.StatusOK || decode[map[string]string](t, rec)["statement"] != "20k rps" {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
	})

	t.Run("adds a decision citing requirements by id", func(t *testing.T) {
		deps, f := newDeps()

		rec := call(t, deps, http.MethodPost, base+"/decisions",
			`{"title":"Cache","rationale":"Reads","pattern":"","alternative":"","requirements":["R2"],"targets":["c-1"]}`)

		if rec.Code != http.StatusCreated || decode[map[string]any](t, rec)["id"] != "D2" {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
		if got := f.k.Decisions[1]; got.Requirements[0] != 2 || got.Targets[0] != "c-1" {
			t.Errorf("stored = %+v", got)
		}
	})

	t.Run("confirms a decision still holds", func(t *testing.T) {
		deps, f := newDeps()

		rec := call(t, deps, http.MethodPatch, base+"/decisions/D1", `{}`)

		if rec.Code != http.StatusOK || f.k.Decisions[0].NeedsReview {
			t.Fatalf("status = %d, decision = %+v", rec.Code, f.k.Decisions[0])
		}
	})

	t.Run("refuses a requirement over the project's limit", func(t *testing.T) {
		deps, f := newDeps()
		f.k.Requirements = make([]knowledge.Requirement, knowledge.MaxRequirements)

		rec := call(t, deps, http.MethodPost, base+"/requirements", `{"category":"cost","statement":"cheap"}`)

		if body := decode[map[string]string](t, rec); rec.Code != http.StatusConflict || body["error"] != "limit_reached" || body["detail"] == "" {
			t.Fatalf("status = %d, body = %v", rec.Code, body)
		}
	})

	t.Run("sets the experience level", func(t *testing.T) {
		deps, f := newDeps()

		if rec := call(t, deps, http.MethodPut, base+"/experience-level", `{"level":"expert"}`); rec.Code != http.StatusOK || f.k.ExperienceLevel != "expert" {
			t.Fatalf("status = %d, level = %q", rec.Code, f.k.ExperienceLevel)
		}
	})

	tests := []struct {
		name, method, path, body string
		status                   int
		code                     string
	}{
		{"invalid category", http.MethodPost, "/requirements", `{"category":"vibes","statement":"x"}`, http.StatusBadRequest, "invalid"},
		{"invalid level", http.MethodPut, "/experience-level", `{"level":"guru"}`, http.StatusBadRequest, "invalid"},
		{"malformed requirement id", http.MethodPatch, "/requirements/X1", `{"statement":"x"}`, http.StatusNotFound, "not_found"},
		{"unknown requirement", http.MethodDelete, "/requirements/R9", ``, http.StatusNotFound, "not_found"},
		{"unknown decision", http.MethodPatch, "/decisions/D9", `{}`, http.StatusNotFound, "not_found"},
		{"decision citing a malformed requirement id", http.MethodPost, "/decisions", `{"title":"T","rationale":"R","requirements":["nope"],"targets":["c"]}`, http.StatusBadRequest, "invalid"},
		{"another user's project", http.MethodGet, "/../nope-zzzzzzzzzz/knowledge", ``, http.StatusNotFound, "not_found"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			deps, _ := newDeps()
			path := base + tt.path
			if tt.name == "another user's project" {
				path = "/api/projects/nope-zzzzzzzzzz/knowledge"
			}

			rec := call(t, deps, tt.method, path, tt.body)

			if rec.Code != tt.status || decode[map[string]string](t, rec)["error"] != tt.code {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
		})
	}
}

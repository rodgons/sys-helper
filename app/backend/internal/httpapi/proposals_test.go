package httpapi_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/httpapi"
	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/projects"
)

// fakeReviews knows octocat's project k3xa9q2m7p at architecture version 3 with pending proposal 2.
// Any other number in it was discarded, so it is not pending.
type fakeReviews struct {
	status   map[int]string
	accepted architecture.Document
	full     bool // the project has no room for the proposal's requirements
}

func (f *fakeReviews) Accept(_ context.Context, userID, suffix string, seq, base int, doc architecture.Document) (int, error) {
	if userID != octocat.ID || suffix != "k3xa9q2m7p" {
		return 0, projects.ErrNotFound
	}
	if base != 3 {
		return 0, architecture.ErrConflict
	}
	if f.status[seq] != "pending" {
		return 0, conversation.ErrNotPending
	}
	if f.full {
		return 0, fmt.Errorf("apply add_requirement: %w: at most 200", knowledge.ErrLimit)
	}
	f.status[seq], f.accepted = "accepted", doc
	return 4, nil
}

func (f *fakeReviews) Reject(_ context.Context, userID, suffix string, seq int) error {
	if userID != octocat.ID || suffix != "k3xa9q2m7p" {
		return projects.ErrNotFound
	}
	if f.status[seq] != "pending" {
		return conversation.ErrNotPending
	}
	f.status[seq] = "rejected"
	return nil
}

func TestProposalReviews(t *testing.T) {
	const base = "/api/projects/shop-k3xa9q2m7p/proposals/"
	const doc = `{"components":[{"id":"c-1","type":"cache","name":"Cache","position":{"x":0,"y":0}}],"connections":[]}`
	newDeps := func() (httpapi.Deps, *fakeReviews) {
		f := &fakeReviews{status: map[int]string{1: "superseded", 2: "pending"}}
		return httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: everyone, Reviews: f}, f
	}

	t.Run("accepts with the resulting architecture and returns the new version", func(t *testing.T) {
		deps, f := newDeps()

		rec := call(t, deps, http.MethodPost, base+"2/accept", `{"version":3,"document":`+doc+`}`)

		if rec.Code != http.StatusOK || decode[map[string]int](t, rec)["version"] != 4 {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
		if f.status[2] != "accepted" || f.accepted.Components[0].Name != "Cache" {
			t.Errorf("fake = %+v", f)
		}
	})

	t.Run("refuses an accept that would exceed the project's limits", func(t *testing.T) {
		deps, f := newDeps()
		f.full = true

		rec := call(t, deps, http.MethodPost, base+"2/accept", `{"version":3,"document":`+doc+`}`)

		if body := decode[map[string]string](t, rec); rec.Code != http.StatusConflict || body["error"] != "limit_reached" || body["detail"] == "" {
			t.Fatalf("status = %d, body = %v", rec.Code, body)
		}
	})

	t.Run("rejects", func(t *testing.T) {
		deps, f := newDeps()

		rec := call(t, deps, http.MethodPost, base+"2/reject", "")

		if rec.Code != http.StatusOK || f.status[2] != "rejected" {
			t.Fatalf("status = %d, fake = %+v", rec.Code, f.status)
		}
	})

	t.Run("a missing or foreign project is still not found", func(t *testing.T) {
		deps, _ := newDeps()

		rec := call(t, deps, http.MethodPost, "/api/projects/shop-zzzzzzzzzz/proposals/2/reject", "")

		if rec.Code != http.StatusNotFound || decode[map[string]string](t, rec)["error"] != "not_found" {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
		}
	})

	tests := []struct {
		name, path, body string
		status           int
		code             string
	}{
		{"accept from an outdated canvas", "2/accept", `{"version":2,"document":` + doc + `}`, http.StatusConflict, "conflict"},
		{"accept a superseded proposal", "1/accept", `{"version":3,"document":` + doc + `}`, http.StatusConflict, "not_pending"},
		{"reject a superseded proposal", "1/reject", "", http.StatusConflict, "not_pending"},
		{"accept an invalid architecture", "2/accept", `{"version":3,"document":{"components":[{"id":"x","type":"mainframe","name":"M","position":{"x":0,"y":0}}],"connections":[]}}`, http.StatusBadRequest, "invalid_architecture"},
		{"accept without a document", "2/accept", `{"version":3}`, http.StatusBadRequest, "invalid_json"},
		{"reject a discarded proposal", "9/reject", "", http.StatusConflict, "not_pending"},
		{"accept a discarded proposal", "9/accept", `{"version":3,"document":` + doc + `}`, http.StatusConflict, "not_pending"},
		{"malformed number", "two/reject", "", http.StatusNotFound, "not_found"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			deps, _ := newDeps()

			rec := call(t, deps, http.MethodPost, base+tt.path, tt.body)

			if rec.Code != tt.status || decode[map[string]string](t, rec)["error"] != tt.code {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
		})
	}
}

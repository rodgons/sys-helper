package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/projects"
)

// KnowledgeStore keeps a Project's Requirements, Decisions and Experience Level. Requirements and
// Decisions are addressed by their per-Project numbers, which the API shows as R1 and D1.
type KnowledgeStore interface {
	Get(ctx context.Context, userID, suffix string) (knowledge.Knowledge, error)
	AddRequirement(ctx context.Context, userID, suffix, category, statement string) (knowledge.Requirement, error)
	UpdateRequirement(ctx context.Context, userID, suffix string, num int, category, statement *string) (knowledge.Requirement, error)
	RemoveRequirement(ctx context.Context, userID, suffix string, num int) error
	AddDecision(ctx context.Context, userID, suffix string, d knowledge.Decision) (knowledge.Decision, error)
	UpdateDecision(ctx context.Context, userID, suffix string, num int, patch knowledge.DecisionPatch) (knowledge.Decision, error)
	RemoveDecision(ctx context.Context, userID, suffix string, num int) error
	SetExperienceLevel(ctx context.Context, userID, suffix, level string) error
}

func handleGetKnowledge(store KnowledgeStore) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		k, err := store.Get(r.Context(), userFrom(r.Context()).ID, suffix)
		respond(w, r, http.StatusOK, k, err)
	})
}

func handleAddRequirement(store KnowledgeStore) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		var body struct{ Category, Statement string }
		if !decodeStrict(w, r, &body) {
			return
		}
		req, err := store.AddRequirement(r.Context(), userFrom(r.Context()).ID, suffix, body.Category, body.Statement)
		respond(w, r, http.StatusCreated, req, err)
	})
}

func handleUpdateRequirement(store KnowledgeStore) http.HandlerFunc {
	return withNum(knowledge.ParseRequirementID, func(w http.ResponseWriter, r *http.Request, suffix string, num int) {
		var body struct{ Category, Statement *string }
		if !decodeStrict(w, r, &body) {
			return
		}
		req, err := store.UpdateRequirement(r.Context(), userFrom(r.Context()).ID, suffix, num, body.Category, body.Statement)
		respond(w, r, http.StatusOK, req, err)
	})
}

func handleRemoveRequirement(store KnowledgeStore) http.HandlerFunc {
	return withNum(knowledge.ParseRequirementID, func(w http.ResponseWriter, r *http.Request, suffix string, num int) {
		err := store.RemoveRequirement(r.Context(), userFrom(r.Context()).ID, suffix, num)
		respond(w, r, http.StatusNoContent, nil, err)
	})
}

func handleAddDecision(store KnowledgeStore) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		var body struct {
			Title, Rationale, Pattern, Alternative string
			Requirements                           []string
			Targets                                []string
		}
		if !decodeStrict(w, r, &body) {
			return
		}
		nums, err := requirementNums(body.Requirements)
		if err != nil {
			respond(w, r, 0, nil, err)
			return
		}
		d, err := store.AddDecision(r.Context(), userFrom(r.Context()).ID, suffix, knowledge.Decision{
			Title: body.Title, Rationale: body.Rationale, Pattern: body.Pattern, Alternative: body.Alternative,
			Requirements: nums, Targets: body.Targets,
		})
		respond(w, r, http.StatusCreated, d, err)
	})
}

// handleUpdateDecision edits a Decision. Any PATCH, even an empty one, clears Needs Review: it is
// how the User confirms a flagged Decision still holds.
func handleUpdateDecision(store KnowledgeStore) http.HandlerFunc {
	return withNum(knowledge.ParseDecisionID, func(w http.ResponseWriter, r *http.Request, suffix string, num int) {
		var body struct {
			Title, Rationale, Pattern, Alternative *string
			Requirements                           *[]string
		}
		if !decodeStrict(w, r, &body) {
			return
		}
		patch := knowledge.DecisionPatch{Title: body.Title, Rationale: body.Rationale, Pattern: body.Pattern, Alternative: body.Alternative}
		if body.Requirements != nil {
			nums, err := requirementNums(*body.Requirements)
			if err != nil {
				respond(w, r, 0, nil, err)
				return
			}
			patch.Requirements = &nums
		}
		d, err := store.UpdateDecision(r.Context(), userFrom(r.Context()).ID, suffix, num, patch)
		respond(w, r, http.StatusOK, d, err)
	})
}

func handleRemoveDecision(store KnowledgeStore) http.HandlerFunc {
	return withNum(knowledge.ParseDecisionID, func(w http.ResponseWriter, r *http.Request, suffix string, num int) {
		err := store.RemoveDecision(r.Context(), userFrom(r.Context()).ID, suffix, num)
		respond(w, r, http.StatusNoContent, nil, err)
	})
}

func handleSetExperienceLevel(store KnowledgeStore) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		var body struct{ Level string }
		if !decodeStrict(w, r, &body) {
			return
		}
		err := store.SetExperienceLevel(r.Context(), userFrom(r.Context()).ID, suffix, body.Level)
		respond(w, r, http.StatusOK, map[string]string{"experienceLevel": body.Level}, err)
	})
}

// withNum resolves the {id} path value ("R3", "D3") to its number; malformed ids are not found.
func withNum(parse func(string) (int, bool), next func(w http.ResponseWriter, r *http.Request, suffix string, num int)) http.HandlerFunc {
	return withSuffix(func(w http.ResponseWriter, r *http.Request, suffix string) {
		num, ok := parse(r.PathValue("id"))
		if !ok {
			writeError(w, http.StatusNotFound, "not_found")
			return
		}
		next(w, r, suffix, num)
	})
}

func requirementNums(ids []string) ([]int, error) {
	nums := make([]int, 0, len(ids))
	for _, id := range ids {
		n, ok := knowledge.ParseRequirementID(id)
		if !ok {
			return nil, fmt.Errorf("%w: %q is not a requirement id like R1", knowledge.ErrInvalid, id)
		}
		nums = append(nums, n)
	}
	return nums, nil
}

func decodeStrict(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return false
	}
	return true
}

// respond writes body with status, or the error the knowledge store returned.
func respond(w http.ResponseWriter, r *http.Request, status int, body any, err error) {
	switch {
	case errors.Is(err, projects.ErrNotFound), errors.Is(err, knowledge.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found")
	case errors.Is(err, knowledge.ErrInvalid):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid", "detail": err.Error()})
	case errors.Is(err, knowledge.ErrLimit):
		writeJSON(w, http.StatusConflict, map[string]string{"error": "limit_reached", "detail": err.Error()})
	case err != nil:
		internalError(w, r, err)
	case status == http.StatusNoContent:
		w.WriteHeader(status)
	default:
		writeJSON(w, status, body)
	}
}

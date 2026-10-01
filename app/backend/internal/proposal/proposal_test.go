package proposal_test

import (
	"encoding/json"
	"strings"
	"testing"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/proposal"
)

func canvas() architecture.Document {
	return architecture.Document{
		Components: []architecture.Component{
			{ID: "api", Type: "service", Name: "API"},
			{ID: "db", Type: "database", Name: "Orders DB"},
		},
		Connections: []architecture.Connection{{ID: "k1", Source: "api", Target: "db", Kind: "sync"}},
	}
}

// known has requirement R1 and decision D1.
func known() knowledge.Knowledge {
	return knowledge.Knowledge{
		Requirements: []knowledge.Requirement{{Num: 1, Category: "scale", Statement: "10k rps"}},
		Decisions:    []knowledge.Decision{{Num: 1, Title: "Postgres", Rationale: "r", Targets: []string{"db"}}},
	}
}

func parse(t *testing.T, s string) proposal.Changes {
	t.Helper()
	var c proposal.Changes
	if err := json.Unmarshal([]byte(s), &c); err != nil {
		t.Fatal(err)
	}
	return c
}

func TestValidate(t *testing.T) {
	t.Run("accepts a valid set of changes", func(t *testing.T) {
		c := parse(t, `{"summary": "Add a read cache", "changes": [
			{"op": "add_component", "ref": "cache", "type": "cache", "name": "Session Cache", "properties": {"engine": "Redis"}},
			{"op": "add_connection", "source": "api", "target": "cache", "kind": "sync", "label": "reads"},
			{"op": "update_component", "id": "db", "properties": {"replicas": "2"}},
			{"op": "update_connection", "id": "k1", "label": "writes"},
			{"op": "remove_connection", "id": "k1"}
		]}`)

		if err := c.Validate(canvas(), known()); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	tests := []struct{ name, changes string }{
		{"no changes", `[]`},
		{"unknown op", `[{"op": "teleport", "id": "api"}]`},
		{"unknown component type", `[{"op": "add_component", "ref": "m", "type": "mainframe", "name": "M"}]`},
		{"add without a ref", `[{"op": "add_component", "type": "cache", "name": "C"}]`},
		{"ref that clashes with an existing id", `[{"op": "add_component", "ref": "api", "type": "cache", "name": "C"}]`},
		{"duplicate ref", `[{"op": "add_component", "ref": "c", "type": "cache", "name": "C"}, {"op": "add_component", "ref": "c", "type": "cache", "name": "D"}]`},
		{"blank name", `[{"op": "add_component", "ref": "c", "type": "cache", "name": " "}]`},
		{"property the type lacks", `[{"op": "add_component", "ref": "c", "type": "cdn", "name": "C", "properties": {"engine": "x"}}]`},
		{"update of a missing component", `[{"op": "update_component", "id": "ghost", "name": "G"}]`},
		{"update that changes nothing", `[{"op": "update_component", "id": "api"}]`},
		{"remove of a missing component", `[{"op": "remove_component", "id": "ghost"}]`},
		{"connection to a missing component", `[{"op": "add_connection", "source": "api", "target": "ghost", "kind": "sync"}]`},
		{"connection to a component removed in the same proposal", `[{"op": "remove_component", "id": "db"}, {"op": "add_connection", "source": "api", "target": "db", "kind": "sync"}]`},
		{"self connection", `[{"op": "add_connection", "source": "api", "target": "api", "kind": "sync"}]`},
		{"unknown connection kind", `[{"op": "add_connection", "source": "api", "target": "db", "kind": "telepathy"}]`},
		{"update of a missing connection", `[{"op": "update_connection", "id": "ghost", "label": "x"}]`},
		{"remove of a missing connection", `[{"op": "remove_connection", "id": "ghost"}]`},
		{"duplicate connection ref", `[{"op": "add_connection", "ref": "x", "source": "api", "target": "db", "kind": "sync"}, {"op": "add_connection", "ref": "x", "source": "db", "target": "api", "kind": "async"}]`},
		{"requirement with an unknown category", `[{"op": "add_requirement", "ref": "r", "category": "vibes", "statement": "s"}]`},
		{"requirement without a statement", `[{"op": "add_requirement", "ref": "r", "category": "scale"}]`},
		{"update of a missing requirement", `[{"op": "update_requirement", "id": "R9", "statement": "s"}]`},
		{"remove of a missing requirement", `[{"op": "remove_requirement", "id": "R9"}]`},
		{"decision without targets", `[{"op": "add_decision", "title": "T", "rationale": "R", "targets": []}]`},
		{"decision on a missing component", `[{"op": "add_decision", "title": "T", "rationale": "R", "targets": ["ghost"]}]`},
		{"decision citing a missing requirement", `[{"op": "add_decision", "title": "T", "rationale": "R", "targets": ["api"], "requirements": ["R9"]}]`},
		{"decision citing a requirement removed in the same proposal", `[{"op": "remove_requirement", "id": "R1"}, {"op": "add_decision", "title": "T", "rationale": "R", "targets": ["api"], "requirements": ["R1"]}]`},
		{"decision without a rationale", `[{"op": "add_decision", "title": "T", "rationale": "", "targets": ["api"]}]`},
		{"unknown experience level", `[{"op": "set_experience_level", "level": "guru"}]`},
	}
	for _, tt := range tests {
		t.Run("rejects "+tt.name, func(t *testing.T) {
			c := parse(t, `{"summary": "s", "changes": `+tt.changes+`}`)
			if err := c.Validate(canvas(), known()); err == nil {
				t.Fatal("expected an error")
			}
		})
	}

	t.Run("accepts requirement, decision and experience changes", func(t *testing.T) {
		c := parse(t, `{"summary": "Record what we know", "changes": [
			{"op": "set_experience_level", "level": "beginner"},
			{"op": "add_requirement", "ref": "reads", "category": "performance", "statement": "p99 reads under 50 ms"},
			{"op": "update_requirement", "id": "R1", "statement": "20k rps at peak"},
			{"op": "add_component", "ref": "cache", "type": "cache", "name": "Cache"},
			{"op": "add_connection", "ref": "api-cache", "source": "api", "target": "cache", "kind": "sync"},
			{"op": "add_decision", "title": "Read-through cache", "rationale": "Reads dominate", "pattern": "Cache-aside",
			 "alternative": "Read replicas: slower to warm", "requirements": ["R1", "reads"], "targets": ["cache", "api-cache", "k1"]}
		]}`)

		if err := c.Validate(canvas(), known()); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("allows a proposal of requirements only", func(t *testing.T) {
		c := parse(t, `{"summary": "Noted", "changes": [{"op": "add_requirement", "ref": "r", "category": "cost", "statement": "Under $500/month"}]}`)
		if err := c.Validate(canvas(), known()); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects a missing summary", func(t *testing.T) {
		c := parse(t, `{"summary": " ", "changes": [{"op": "remove_connection", "id": "k1"}]}`)
		if err := c.Validate(canvas(), known()); err == nil {
			t.Fatal("expected an error")
		}
	})

	t.Run("explains what is wrong, for the model to fix", func(t *testing.T) {
		c := parse(t, `{"summary": "s", "changes": [{"op": "update_component", "id": "ghost", "name": "G"}]}`)
		if err := c.Validate(canvas(), known()); err == nil || !strings.Contains(err.Error(), `"ghost"`) {
			t.Fatalf("err = %v, want it to name the missing id", err)
		}
	})
}

func TestToolSchemaIsValidJSON(t *testing.T) {
	var schema map[string]any
	if err := json.Unmarshal(proposal.Tool.Parameters, &schema); err != nil {
		t.Fatalf("tool schema: %v", err)
	}
	if proposal.Tool.Name != "propose_changes" {
		t.Errorf("tool name = %q", proposal.Tool.Name)
	}
}

func TestItemIDs(t *testing.T) {
	if got := proposal.ComponentID(3, "cache"); got != "p3-cache" {
		t.Errorf("ComponentID = %q", got)
	}
	if got := proposal.ConnectionID(3, proposal.Change{Ref: "api-cache"}, 4); got != "p3-api-cache" {
		t.Errorf("ConnectionID with ref = %q", got)
	}
	if got := proposal.ConnectionID(3, proposal.Change{}, 4); got != "p3-k4" {
		t.Errorf("ConnectionID without ref = %q", got)
	}
}

func TestNormalize(t *testing.T) {
	c := parse(t, `{"summary": "s", "changes": [
		{"op": "add_requirement", "id": "reads", "category": "scale", "statement": "100:1 reads"},
		{"op": "add_decision", "title": "T", "rationale": "R", "targets": ["api"], "requirements": ["reads"]}]}`)

	c.Normalize()

	if c.Changes[0].Ref != "reads" || c.Changes[0].ID != "" {
		t.Fatalf("change = %+v", c.Changes[0])
	}
	if err := c.Validate(canvas(), known()); err != nil {
		t.Fatalf("normalized proposal invalid: %v", err)
	}
}

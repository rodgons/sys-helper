package proposal_test

import (
	"encoding/json"
	"strings"
	"testing"

	"sys-helper/backend/internal/architecture"
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

		if err := c.Validate(canvas()); err != nil {
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
	}
	for _, tt := range tests {
		t.Run("rejects "+tt.name, func(t *testing.T) {
			c := parse(t, `{"summary": "s", "changes": `+tt.changes+`}`)
			if err := c.Validate(canvas()); err == nil {
				t.Fatal("expected an error")
			}
		})
	}

	t.Run("rejects a missing summary", func(t *testing.T) {
		c := parse(t, `{"summary": " ", "changes": [{"op": "remove_connection", "id": "k1"}]}`)
		if err := c.Validate(canvas()); err == nil {
			t.Fatal("expected an error")
		}
	})

	t.Run("explains what is wrong, for the model to fix", func(t *testing.T) {
		c := parse(t, `{"summary": "s", "changes": [{"op": "update_component", "id": "ghost", "name": "G"}]}`)
		if err := c.Validate(canvas()); err == nil || !strings.Contains(err.Error(), `"ghost"`) {
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

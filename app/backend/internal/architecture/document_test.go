package architecture_test

import (
	"encoding/json"
	"strings"
	"testing"

	"sys-helper/backend/internal/architecture"
)

func parse(t *testing.T, s string) architecture.Document {
	t.Helper()
	var d architecture.Document
	if err := json.Unmarshal([]byte(s), &d); err != nil {
		t.Fatal(err)
	}
	return d
}

const valid = `{
	"components": [
		{"id": "lb", "type": "load_balancer", "name": "Edge LB", "position": {"x": 0, "y": 0}},
		{"id": "db", "type": "database", "name": "Users", "position": {"x": 300, "y": 0},
		 "properties": {"engine": "PostgreSQL", "replicas": "2"}},
		{"id": "x", "type": "custom", "name": "Fraud check", "position": {"x": 0, "y": 200},
		 "properties": {"description": "Third-party scoring"}}
	],
	"connections": [
		{"id": "c1", "source": "lb", "target": "db", "kind": "sync", "label": "SQL"}
	]
}`

func TestValidate(t *testing.T) {
	t.Run("accepts a valid document", func(t *testing.T) {
		if err := parse(t, valid).Validate(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("accepts an empty document", func(t *testing.T) {
		if err := parse(t, `{"components": [], "connections": []}`).Validate(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	long := strings.Repeat("x", 101)
	tests := []struct{ name, doc string }{
		{"unknown component type", `{"components": [{"id": "a", "type": "mainframe", "name": "A", "position": {"x":0,"y":0}}], "connections": []}`},
		{"missing component id", `{"components": [{"id": "", "type": "service", "name": "A", "position": {"x":0,"y":0}}], "connections": []}`},
		{"duplicate component id", `{"components": [{"id": "a", "type": "service", "name": "A", "position": {"x":0,"y":0}}, {"id": "a", "type": "cache", "name": "B", "position": {"x":0,"y":0}}], "connections": []}`},
		{"empty name", `{"components": [{"id": "a", "type": "service", "name": " ", "position": {"x":0,"y":0}}], "connections": []}`},
		{"long name", `{"components": [{"id": "a", "type": "service", "name": "` + long + `", "position": {"x":0,"y":0}}], "connections": []}`},
		{"property the type does not have", `{"components": [{"id": "a", "type": "service", "name": "A", "position": {"x":0,"y":0}, "properties": {"engine": "x"}}], "connections": []}`},
		{"dangling connection", `{"components": [{"id": "a", "type": "service", "name": "A", "position": {"x":0,"y":0}}], "connections": [{"id": "c", "source": "a", "target": "zzz", "kind": "sync"}]}`},
		{"unknown connection kind", `{"components": [{"id": "a", "type": "service", "name": "A", "position": {"x":0,"y":0}}, {"id": "b", "type": "cache", "name": "B", "position": {"x":0,"y":0}}], "connections": [{"id": "c", "source": "a", "target": "b", "kind": "telepathy"}]}`},
		{"duplicate connection id", `{"components": [{"id": "a", "type": "service", "name": "A", "position": {"x":0,"y":0}}, {"id": "b", "type": "cache", "name": "B", "position": {"x":0,"y":0}}], "connections": [{"id": "c", "source": "a", "target": "b", "kind": "sync"}, {"id": "c", "source": "b", "target": "a", "kind": "async"}]}`},
		{"component and connection sharing an id", `{"components": [{"id": "a", "type": "service", "name": "A", "position": {"x":0,"y":0}}, {"id": "b", "type": "cache", "name": "B", "position": {"x":0,"y":0}}], "connections": [{"id": "a", "source": "a", "target": "b", "kind": "sync"}]}`},
		{"NUL character in a name", `{"components": [{"id": "a", "type": "service", "name": "A\u0000", "position": {"x":0,"y":0}}], "connections": []}`},
		{"NUL character in a property", `{"components": [{"id": "a", "type": "service", "name": "A", "position": {"x":0,"y":0}, "properties": {"runtime": "\u0000"}}], "connections": []}`},
		{"NUL character in a connection label", `{"components": [{"id": "a", "type": "service", "name": "A", "position": {"x":0,"y":0}}, {"id": "b", "type": "cache", "name": "B", "position": {"x":0,"y":0}}], "connections": [{"id": "c", "source": "a", "target": "b", "kind": "sync", "label": "x\u0000"}]}`},
		{"long connection label", `{"components": [{"id": "a", "type": "service", "name": "A", "position": {"x":0,"y":0}}, {"id": "b", "type": "cache", "name": "B", "position": {"x":0,"y":0}}], "connections": [{"id": "c", "source": "a", "target": "b", "kind": "sync", "label": "` + long + `"}]}`},
	}
	for _, tt := range tests {
		t.Run("rejects "+tt.name, func(t *testing.T) {
			if err := parse(t, tt.doc).Validate(); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}

func TestEmpty(t *testing.T) {
	b, err := json.Marshal(architecture.Empty())
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != `{"components":[],"connections":[]}` {
		t.Errorf("Empty() = %s", b)
	}
}

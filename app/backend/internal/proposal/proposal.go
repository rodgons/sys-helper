// Package proposal defines Proposals: sets of changes to an Architecture that the AI suggests and
// the User accepts or rejects as a whole. It validates them against the current Architecture and
// describes them to the model as a tool.
package proposal

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/llm"
)

const (
	maxChanges = 50
	maxName    = 100
	maxValue   = 500
	maxSummary = 500
	maxRefOrID = 100
)

// Change is one operation. Which fields apply depends on Op:
//   - add_component: Ref (a temporary id later Changes can connect to), Type, Name, Properties
//   - update_component: ID, and Name and/or Properties (merged into the existing ones)
//   - remove_component: ID (its connections go with it)
//   - add_connection: Source, Target (existing ids or refs), Kind, Label
//   - update_connection: ID, and Kind and/or Label
//   - remove_connection: ID
type Change struct {
	Op         string            `json:"op"`
	ID         string            `json:"id,omitempty"`
	Ref        string            `json:"ref,omitempty"`
	Type       string            `json:"type,omitempty"`
	Name       *string           `json:"name,omitempty"`
	Properties map[string]string `json:"properties,omitempty"`
	Source     string            `json:"source,omitempty"`
	Target     string            `json:"target,omitempty"`
	Kind       string            `json:"kind,omitempty"`
	Label      *string           `json:"label,omitempty"`
}

// Changes is what the model submits through the propose_changes tool.
type Changes struct {
	Summary string   `json:"summary"`
	Changes []Change `json:"changes"`
}

var ErrInvalid = errors.New("invalid proposal")

// Validate checks every Change against doc (the Architecture the Proposal is based on). Errors are
// written for the model, which gets a chance to correct them.
func (c Changes) Validate(doc architecture.Document) error {
	if s := strings.TrimSpace(c.Summary); s == "" || utf8.RuneCountInString(s) > maxSummary {
		return invalid("summary must be 1 to %d characters", maxSummary)
	}
	if len(c.Changes) == 0 || len(c.Changes) > maxChanges {
		return invalid("propose 1 to %d changes", maxChanges)
	}
	types := map[string]string{} // existing ids and refs → component type
	for _, comp := range doc.Components {
		types[comp.ID] = comp.Type
	}
	connections := map[string]bool{}
	for _, conn := range doc.Connections {
		connections[conn.ID] = true
	}
	removed := map[string]bool{}

	for i, ch := range c.Changes {
		at := fmt.Sprintf("change %d (%s)", i+1, ch.Op)
		switch ch.Op {
		case "add_component":
			if ch.Ref == "" || len(ch.Ref) > maxRefOrID {
				return invalid("%s: needs a ref, a short temporary id that connections can use", at)
			}
			if _, taken := types[ch.Ref]; taken {
				return invalid("%s: ref %q is already used", at, ch.Ref)
			}
			if _, ok := architecture.ComponentTypes[ch.Type]; !ok {
				return invalid("%s: unknown type %q; use one of %s", at, ch.Type, typeList())
			}
			if ch.Name == nil {
				return invalid("%s: needs a name", at)
			}
			if err := checkComponent(at, ch.Type, ch.Name, ch.Properties); err != nil {
				return err
			}
			types[ch.Ref] = ch.Type
		case "update_component":
			typ, err := existing(at, ch.ID, types, removed)
			if err != nil {
				return err
			}
			if ch.Name == nil && len(ch.Properties) == 0 {
				return invalid("%s: change the name or properties of %q", at, ch.ID)
			}
			if err := checkComponent(at, typ, ch.Name, ch.Properties); err != nil {
				return err
			}
		case "remove_component":
			if _, err := existing(at, ch.ID, types, removed); err != nil {
				return err
			}
			removed[ch.ID] = true
		case "add_connection":
			for _, end := range []string{ch.Source, ch.Target} {
				if _, err := existing(at, end, types, removed); err != nil {
					return err
				}
			}
			if ch.Source == ch.Target {
				return invalid("%s: a component can't connect to itself", at)
			}
			if err := checkConnection(at, ch.Kind, true, ch.Label); err != nil {
				return err
			}
		case "update_connection", "remove_connection":
			if !connections[ch.ID] {
				return invalid("%s: no connection with id %q", at, ch.ID)
			}
			if ch.Op == "update_connection" {
				if ch.Kind == "" && ch.Label == nil {
					return invalid("%s: change the kind or label of %q", at, ch.ID)
				}
				if err := checkConnection(at, ch.Kind, false, ch.Label); err != nil {
					return err
				}
			}
		default:
			return invalid("%s: unknown op; use add_component, update_component, remove_component, add_connection, update_connection or remove_connection", at)
		}
	}
	return nil
}

func existing(at, id string, types map[string]string, removed map[string]bool) (string, error) {
	typ, ok := types[id]
	if !ok {
		return "", invalid("%s: no component with id or ref %q", at, id)
	}
	if removed[id] {
		return "", invalid("%s: component %q is removed earlier in this proposal", at, id)
	}
	return typ, nil
}

func checkComponent(at, typ string, name *string, props map[string]string) error {
	if name != nil && (strings.TrimSpace(*name) == "" || utf8.RuneCountInString(*name) > maxName) {
		return invalid("%s: names must be 1 to %d characters", at, maxName)
	}
	allowed := architecture.ComponentTypes[typ]
	for key, value := range props {
		if !slices.Contains(allowed, key) {
			return invalid("%s: a %s has no property %q (it has: %s)", at, typ, key, strings.Join(allowed, ", "))
		}
		if utf8.RuneCountInString(value) > maxValue {
			return invalid("%s: property %q is too long", at, key)
		}
	}
	return nil
}

func checkConnection(at, kind string, required bool, label *string) error {
	if (required || kind != "") && !slices.Contains(architecture.ConnectionKinds, kind) {
		return invalid("%s: kind must be one of %s", at, strings.Join(architecture.ConnectionKinds, ", "))
	}
	if label != nil && utf8.RuneCountInString(*label) > maxName {
		return invalid("%s: labels must be at most %d characters", at, maxName)
	}
	return nil
}

func typeList() string {
	return strings.Join(sortedTypes(), ", ")
}

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, args...))
}

// Tool is how the model submits a Proposal.
var Tool = llm.Tool{
	Name: "propose_changes",
	Description: "Propose changes to the architecture canvas. The user reviews them as one proposal and " +
		"accepts or rejects it; nothing changes until they accept. Call this at most once per reply, with " +
		"every change for this step. Refer to existing components and connections by their id; give new " +
		"components a short ref and use that ref to connect them.",
	Parameters: json.RawMessage(toolSchema()),
}

func toolSchema() string {
	types, _ := json.Marshal(sortedTypes())
	kinds, _ := json.Marshal(architecture.ConnectionKinds)
	return `{
  "type": "object",
  "properties": {
    "summary": {"type": "string", "description": "One sentence describing the proposal, shown to the user."},
    "changes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "op": {"type": "string", "enum": ["add_component", "update_component", "remove_component", "add_connection", "update_connection", "remove_connection"]},
          "id": {"type": "string", "description": "Existing component or connection id (update_*, remove_*)."},
          "ref": {"type": "string", "description": "Temporary id for a new component (add_component)."},
          "type": {"type": "string", "enum": ` + string(types) + `, "description": "Component type (add_component)."},
          "name": {"type": "string", "description": "Component name (add_component, update_component)."},
          "properties": {"type": "object", "additionalProperties": {"type": "string"}, "description": "Component properties allowed by its type (e.g. database: engine, replicas, sharding)."},
          "source": {"type": "string", "description": "Connection start: component id or ref (add_connection)."},
          "target": {"type": "string", "description": "Connection end: component id or ref (add_connection)."},
          "kind": {"type": "string", "enum": ` + string(kinds) + `, "description": "Connection kind."},
          "label": {"type": "string", "description": "Connection label, e.g. what flows over it."}
        },
        "required": ["op"]
      }
    }
  },
  "required": ["summary", "changes"]
}`
}

func sortedTypes() []string {
	types := make([]string, 0, len(architecture.ComponentTypes))
	for t := range architecture.ComponentTypes {
		types = append(types, t)
	}
	slices.Sort(types)
	return types
}

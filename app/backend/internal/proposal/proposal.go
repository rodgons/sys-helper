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
	"sys-helper/backend/internal/knowledge"
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
//   - add_component: Ref (a temporary id later Changes can use), Type, Name, Properties
//   - update_component: ID, and Name and/or Properties (merged into the existing ones)
//   - remove_component: ID (its connections go with it)
//   - add_connection: Source, Target (component ids or refs), Kind, Label, and an optional Ref
//   - update_connection: ID, and Kind and/or Label
//   - remove_connection: ID
//   - add_requirement: Ref, Category, Statement
//   - update_requirement: ID ("R1"), and Category and/or Statement
//   - remove_requirement: ID
//   - add_decision: Title, Rationale, Pattern, Alternative, Requirements (ids or refs) and
//     Targets (component or connection ids or refs; at least one)
//   - set_experience_level: Level
type Change struct {
	Op         string     `json:"op"`
	ID         string     `json:"id,omitempty"`
	Ref        string     `json:"ref,omitempty"`
	Type       string     `json:"type,omitempty"`
	Name       *string    `json:"name,omitempty"`
	Properties Properties `json:"properties,omitempty"`
	Source     string     `json:"source,omitempty"`
	Target     string     `json:"target,omitempty"`
	Kind       string     `json:"kind,omitempty"`
	Label      *string    `json:"label,omitempty"`

	Category     *string  `json:"category,omitempty"`
	Statement    *string  `json:"statement,omitempty"`
	Title        string   `json:"title,omitempty"`
	Rationale    string   `json:"rationale,omitempty"`
	Pattern      string   `json:"pattern,omitempty"`
	Alternative  string   `json:"alternative,omitempty"`
	Requirements []string `json:"requirements,omitempty"`
	Targets      []string `json:"targets,omitempty"`
	Level        string   `json:"level,omitempty"`
}

// Properties are a component's properties. Models often send numbers and booleans
// ("instances": 2), so those are accepted and kept as text.
type Properties map[string]string

func (p *Properties) UnmarshalJSON(data []byte) error {
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*p = make(Properties, len(raw))
	for key, value := range raw {
		switch v := value.(type) {
		case string:
			(*p)[key] = v
		case float64, bool:
			(*p)[key] = fmt.Sprint(v)
		default:
			return fmt.Errorf("property %q must be a string, number or boolean", key)
		}
	}
	return nil
}

// ops are the Change operations.
var ops = []string{"add_component", "update_component", "remove_component", "add_connection", "update_connection",
	"remove_connection", "add_requirement", "update_requirement", "remove_requirement", "add_decision", "set_experience_level"}

// Changes is what the model submits through the propose_changes tool.
type Changes struct {
	Summary string   `json:"summary"`
	Changes []Change `json:"changes"`
}

// FromCall reads a tool call as Changes. Besides propose_changes, it takes a call named after an
// op (some models call set_experience_level as a tool of its own) as a Proposal of that one
// Change. Any other tool is an error written for the model, like Validate's.
func FromCall(name, arguments string) (Changes, error) {
	if name != Tool.Name && !slices.Contains(ops, name) {
		return Changes{}, fmt.Errorf("there is no %s tool: make every change through %s, with %q as a change's op if that is what you meant", name, Tool.Name, name)
	}
	if name == Tool.Name {
		var c Changes
		if err := json.Unmarshal([]byte(arguments), &c); err != nil {
			return Changes{}, fmt.Errorf("arguments are not valid JSON for this tool: %w", err)
		}
		return c, nil
	}
	var ch Change
	if err := json.Unmarshal([]byte(arguments), &ch); err != nil {
		return Changes{}, fmt.Errorf("arguments are not valid JSON for a %s change: %w", name, err)
	}
	ch.Op = name
	summary := strings.ReplaceAll(name, "_", " ")
	return Changes{Summary: strings.ToUpper(summary[:1]) + summary[1:], Changes: []Change{ch}}, nil
}

// ComponentID and ConnectionID are the ids items added by Proposal seq get once accepted. The
// client applies Proposals with the same scheme (src/architecture/proposal.ts), so Decisions can be
// attached to new items by these ids.
func ComponentID(seq int, ref string) string { return fmt.Sprintf("p%d-%s", seq, ref) }

func ConnectionID(seq int, c Change, index int) string {
	if c.Ref != "" {
		return fmt.Sprintf("p%d-%s", seq, c.Ref)
	}
	return fmt.Sprintf("p%d-k%d", seq, index)
}

var ErrInvalid = errors.New("invalid proposal")

// Normalize forgives common slips: leaving out the op (or giving it in `type`), naming a new item
// in `id` instead of `ref`, leaving a new component unnamed (it is named after its type), and using
// a new component or requirement before the change that adds it. Call it before Validate.
func (c *Changes) Normalize() {
	for i := range c.Changes {
		ch := &c.Changes[i]
		if ch.Op == "" {
			ch.Op = inferOp(ch)
		}
		if strings.HasPrefix(ch.Op, "add_") && ch.Op != "add_decision" && ch.Ref == "" && ch.ID != "" {
			ch.Ref, ch.ID = ch.ID, ""
		}
		if _, known := architecture.ComponentTypes[ch.Type]; ch.Op == "add_component" && ch.Name == nil && known {
			name := typeName(ch.Type)
			ch.Name = &name
		}
	}
	// Nothing can refer to an item before it exists, and refs can't shadow ids, so adding these
	// first never changes what the other changes mean.
	slices.SortStableFunc(c.Changes, func(a, b Change) int {
		return addedFirst(b) - addedFirst(a)
	})
}

func addedFirst(ch Change) int {
	if ch.Op == "add_component" || ch.Op == "add_requirement" {
		return 1
	}
	return 0
}

// typeName is a component type as a default name: "load_balancer" → "Load Balancer".
func typeName(typ string) string {
	words := strings.Split(typ, "_")
	for i, w := range words {
		switch w {
		case "api", "cdn", "dns":
			words[i] = strings.ToUpper(w)
		default:
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// inferOp guesses a missing op from the fields only one op uses.
func inferOp(ch *Change) string {
	switch {
	case slices.Contains(ops, ch.Type):
		op := ch.Type
		ch.Type = ""
		return op
	case ch.Title != "" || ch.Rationale != "" || len(ch.Targets) > 0:
		return "add_decision"
	case ch.Source != "" || ch.Target != "":
		return "add_connection"
	case ch.Level != "":
		return "set_experience_level"
	}
	return ""
}

// Validate checks every Change against doc and k (what the Project has when the Proposal is made).
// Errors are written for the model, which gets a chance to correct them.
func (c Changes) Validate(doc architecture.Document, k knowledge.Knowledge) error {
	if s := strings.TrimSpace(c.Summary); s == "" || utf8.RuneCountInString(s) > maxSummary {
		return invalid("summary must be 1 to %d characters", maxSummary)
	}
	if len(c.Changes) == 0 || len(c.Changes) > maxChanges {
		return invalid("propose 1 to %d changes", maxChanges)
	}
	types := map[string]string{} // component ids and refs → component type
	for _, comp := range doc.Components {
		types[comp.ID] = comp.Type
	}
	connections := map[string]bool{} // connection ids and refs
	for _, conn := range doc.Connections {
		connections[conn.ID] = true
	}
	requirements := map[string]bool{} // requirement ids (R1) and refs
	for _, r := range k.Requirements {
		requirements[knowledge.RequirementID(r.Num)] = true
	}
	removed := map[string]bool{}
	// Running totals, to stay within the Project's limits.
	requirementCount, decisionCount := len(k.Requirements), len(k.Decisions)
	// Ids and refs share one namespace, so a ref can't shadow anything.
	taken := func(ref string) bool {
		_, isComponent := types[ref]
		return isComponent || connections[ref] || requirements[ref]
	}

	for i, ch := range c.Changes {
		at := fmt.Sprintf("change %d (%s)", i+1, ch.Op)
		switch ch.Op {
		case "add_component":
			if err := newRef(at, ch.Ref, taken); err != nil {
				return err
			}
			if ch.Type == "" {
				// Models confuse the two fields, so say which is which.
				return invalid("%s: needs a \"type\", the component type (one of %s); the operation goes in \"op\"", at, typeList())
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
			if ch.Ref != "" {
				if err := newRef(at, ch.Ref, taken); err != nil {
					return err
				}
				connections[ch.Ref] = true
			}
		case "update_connection", "remove_connection":
			if !connections[ch.ID] || removed[ch.ID] {
				return invalid("%s: no connection with id %q", at, ch.ID)
			}
			if ch.Op == "remove_connection" {
				removed[ch.ID] = true
				break
			}
			if ch.Kind == "" && ch.Label == nil {
				return invalid("%s: change the kind or label of %q", at, ch.ID)
			}
			if err := checkConnection(at, ch.Kind, false, ch.Label); err != nil {
				return err
			}
		case "add_requirement":
			if err := newRef(at, ch.Ref, taken); err != nil {
				return err
			}
			if ch.Category == nil || ch.Statement == nil {
				return invalid("%s: needs a category and a statement", at)
			}
			if err := knowledge.CheckRequirement(ch.Category, ch.Statement); err != nil {
				return invalid("%s: %v", at, err)
			}
			if requirementCount++; requirementCount > knowledge.MaxRequirements {
				return invalid("%s: the project already has the most requirements it may have (at most %d); update or remove existing ones instead of adding", at, knowledge.MaxRequirements)
			}
			requirements[ch.Ref] = true
		case "update_requirement", "remove_requirement":
			if !requirements[ch.ID] || removed[ch.ID] {
				return invalid("%s: no requirement %q", at, ch.ID)
			}
			if ch.Op == "remove_requirement" {
				removed[ch.ID] = true
				requirementCount--
				break
			}
			if ch.Category == nil && ch.Statement == nil {
				return invalid("%s: change the category or statement of %q", at, ch.ID)
			}
			if err := knowledge.CheckRequirement(ch.Category, ch.Statement); err != nil {
				return invalid("%s: %v", at, err)
			}
		case "add_decision":
			if err := knowledge.CheckDecisionText(ch.Title, ch.Rationale, ch.Pattern, ch.Alternative); err != nil {
				return invalid("%s: %v", at, err)
			}
			if len(ch.Targets) == 0 {
				return invalid("%s: attach the decision to at least one component or connection (targets)", at)
			}
			if err := knowledge.CheckDecisionReferences(len(ch.Targets), len(ch.Requirements)); err != nil {
				return invalid("%s: %v", at, err)
			}
			if decisionCount++; decisionCount > knowledge.MaxDecisions {
				return invalid("%s: the project already has the most decisions it may have (at most %d); don't record new decisions", at, knowledge.MaxDecisions)
			}
			for _, target := range ch.Targets {
				_, isComponent := types[target]
				if (!isComponent && !connections[target]) || removed[target] {
					return invalid("%s: no component or connection with id or ref %q", at, target)
				}
			}
			for _, req := range ch.Requirements {
				if !requirements[req] || removed[req] {
					return invalid("%s: no requirement %q (cite requirement ids like R1, or refs added in this proposal)", at, req)
				}
			}
		case "set_experience_level":
			if err := knowledge.CheckLevel(ch.Level); err != nil {
				return invalid("%s: %v", at, err)
			}
			if ch.Level == k.ExperienceLevel {
				return invalid("%s: the experience level is already %s; leave this change out, and if nothing else is left, don't call propose_changes", at, ch.Level)
			}
		case "":
			return invalid("%s: every change needs an \"op\", one of %s", at, strings.Join(ops, ", "))
		default:
			return invalid("%s: unknown op", at)
		}
	}
	return nil
}

// newRef checks a ref for a new item is present, short, and not already an id or ref.
func newRef(at, ref string, taken func(string) bool) error {
	if ref == "" || len(ref) > maxRefOrID {
		return invalid("%s: needs a ref, a short temporary id that later changes can use", at)
	}
	if taken(ref) {
		return invalid("%s: ref %q is already used", at, ref)
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
	Description: "Propose changes for the user to review as one proposal: to the architecture canvas, the " +
		"requirements, the decisions that explain the design, and the user's experience level. Nothing " +
		"changes until the user accepts. Call this at most once per reply, with every change for this step. " +
		"Refer to existing items by id (components and connections by their canvas id, requirements as R1, " +
		"R2, …); give new items a short ref and use that ref in later changes of the same proposal.",
	Parameters: json.RawMessage(toolSchema()),
}

func toolSchema() string {
	opNames, _ := json.Marshal(ops)
	types, _ := json.Marshal(sortedTypes())
	kinds, _ := json.Marshal(architecture.ConnectionKinds)
	categories, _ := json.Marshal(knowledge.Categories)
	levels, _ := json.Marshal(knowledge.Levels)
	return `{
  "type": "object",
  "properties": {
    "summary": {"type": "string", "description": "One sentence describing the proposal, shown to the user."},
    "changes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "op": {"type": "string", "enum": ` + string(opNames) + `, "description": "The operation. Always set it; never put the operation in \"type\"."},
          "id": {"type": "string", "description": "Existing item id (update_*, remove_*): a component or connection id, or a requirement id like R1."},
          "ref": {"type": "string", "description": "Temporary id for a new component, connection or requirement (add_*), usable by later changes."},
          "type": {"type": "string", "enum": ` + string(types) + `, "description": "Component type (add_component, required). Not the operation: that goes in \"op\"."},
          "name": {"type": "string", "description": "Component name shown on the canvas (add_component, required; update_component)."},
          "properties": {"type": "object", "additionalProperties": {"type": "string"}, "description": "Component properties allowed by its type (e.g. database: engine, replicas, sharding)."},
          "source": {"type": "string", "description": "Connection start: component id or ref (add_connection)."},
          "target": {"type": "string", "description": "Connection end: component id or ref (add_connection)."},
          "kind": {"type": "string", "enum": ` + string(kinds) + `, "description": "Connection kind."},
          "label": {"type": "string", "description": "Connection label, e.g. what flows over it."},
          "category": {"type": "string", "enum": ` + string(categories) + `, "description": "Requirement category (add_requirement, update_requirement)."},
          "statement": {"type": "string", "description": "Requirement as one line, e.g. '10k requests/s at peak' (add_requirement, update_requirement)."},
          "title": {"type": "string", "description": "Decision title, e.g. 'Redis read-through cache' (add_decision)."},
          "rationale": {"type": "string", "description": "Why this choice fits the requirements (add_decision)."},
          "pattern": {"type": "string", "description": "The pattern or technique applied, e.g. 'Cache-aside' (add_decision)."},
          "alternative": {"type": "string", "description": "The main alternative rejected and why (add_decision)."},
          "requirements": {"type": "array", "items": {"type": "string"}, "description": "Requirement ids or refs the decision serves (add_decision)."},
          "targets": {"type": "array", "items": {"type": "string"}, "description": "Component or connection ids or refs the decision explains; at least one (add_decision)."},
          "level": {"type": "string", "enum": ` + string(levels) + `, "description": "The user's experience level (set_experience_level)."}
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

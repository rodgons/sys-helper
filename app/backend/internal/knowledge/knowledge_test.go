package knowledge_test

import (
	"encoding/json"
	"testing"

	"sys-helper/backend/internal/knowledge"
)

func TestIDs(t *testing.T) {
	for _, tt := range []struct {
		id   string
		want int
		ok   bool
	}{{"R3", 3, true}, {"r12", 12, true}, {"R0", 0, false}, {"D3", 0, false}, {"R", 0, false}, {"Rx", 0, false}} {
		if n, ok := knowledge.ParseRequirementID(tt.id); n != tt.want || ok != tt.ok {
			t.Errorf("ParseRequirementID(%q) = %d, %v", tt.id, n, ok)
		}
	}
	if n, ok := knowledge.ParseDecisionID("D7"); n != 7 || !ok {
		t.Errorf("ParseDecisionID(D7) = %d, %v", n, ok)
	}
}

func TestJSON(t *testing.T) {
	k := knowledge.Knowledge{
		ExperienceLevel: "beginner",
		Requirements:    []knowledge.Requirement{{Num: 1, Category: "scale", Statement: "10k rps"}},
		Decisions: []knowledge.Decision{{Num: 2, Title: "Cache", Rationale: "Reads", Requirements: []int{1},
			Targets: []string{"c-1"}, Author: knowledge.AuthorAI, NeedsReview: true}},
	}
	b, err := json.Marshal(k)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"experienceLevel":"beginner","requirements":[{"category":"scale","id":"R1","statement":"10k rps"}],` +
		`"decisions":[{"id":"D2","title":"Cache","rationale":"Reads","pattern":"","alternative":"","requirements":["R1"],"targets":["c-1"],"author":"ai","needsReview":true}]}`
	if string(b) != want {
		t.Errorf("JSON =\n%s\nwant\n%s", b, want)
	}
}

func TestChecks(t *testing.T) {
	ptr := func(s string) *string { return &s }
	if knowledge.CheckRequirement(ptr("scale"), ptr("10k rps")) != nil || knowledge.CheckRequirement(nil, nil) != nil {
		t.Error("valid requirement rejected")
	}
	if knowledge.CheckRequirement(ptr("vibes"), nil) == nil || knowledge.CheckRequirement(nil, ptr("  ")) == nil {
		t.Error("invalid requirement accepted")
	}
	if knowledge.CheckDecisionText("Cache", "Reads dominate", "", "") != nil {
		t.Error("valid decision rejected")
	}
	if knowledge.CheckDecisionText("", "x", "", "") == nil || knowledge.CheckDecisionText("x", "", "", "") == nil {
		t.Error("invalid decision accepted")
	}
	if knowledge.CheckLevel("expert") != nil || knowledge.CheckLevel("guru") == nil {
		t.Error("CheckLevel wrong")
	}
}

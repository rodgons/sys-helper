// Package knowledge owns what a Project knows besides its canvas: the User's Experience Level, the
// Requirements, and the Decisions that explain the Architecture.
package knowledge

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Categories a Requirement can have.
var Categories = []string{"scale", "performance", "availability", "consistency", "security", "cost", "constraints", "functional"}

// Levels of Experience Level.
var Levels = []string{"beginner", "intermediate", "expert"}

const (
	MaxStatement   = 300
	MaxTitle       = 120
	MaxRationale   = 2000
	MaxPattern     = 120
	MaxAlternative = 1000
)

var ErrInvalid = errors.New("invalid")

type Requirement struct {
	Num       int
	Category  string
	Statement string
}

type Author string

const (
	AuthorUser Author = "user"
	AuthorAI   Author = "ai"
)

type Decision struct {
	Num          int
	Title        string
	Rationale    string
	Pattern      string
	Alternative  string
	Requirements []int    // cited Requirement numbers
	Targets      []string // Component and Connection ids in the Architecture
	Author       Author
	NeedsReview  bool
}

// Knowledge is everything a Project knows besides its canvas.
type Knowledge struct {
	ExperienceLevel string        `json:"experienceLevel"` // empty until known
	Requirements    []Requirement `json:"requirements"`
	Decisions       []Decision    `json:"decisions"`
}

// RequirementID and DecisionID are how the API and the AI name them: R1, D1, …
func RequirementID(num int) string { return "R" + strconv.Itoa(num) }
func DecisionID(num int) string    { return "D" + strconv.Itoa(num) }

// ParseRequirementID and ParseDecisionID read "R3" / "D3" (case-insensitive).
func ParseRequirementID(id string) (int, bool) { return parseID(id, 'R') }
func ParseDecisionID(id string) (int, bool)    { return parseID(id, 'D') }

func parseID(id string, prefix byte) (int, bool) {
	if len(id) < 2 || (id[0] != prefix && id[0] != prefix+'a'-'A') {
		return 0, false
	}
	n, err := strconv.Atoi(id[1:])
	return n, err == nil && n > 0
}

func (r Requirement) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]string{"id": RequirementID(r.Num), "category": r.Category, "statement": r.Statement})
}

func (d Decision) MarshalJSON() ([]byte, error) {
	reqs := make([]string, len(d.Requirements))
	for i, n := range d.Requirements {
		reqs[i] = RequirementID(n)
	}
	return json.Marshal(struct {
		ID           string   `json:"id"`
		Title        string   `json:"title"`
		Rationale    string   `json:"rationale"`
		Pattern      string   `json:"pattern"`
		Alternative  string   `json:"alternative"`
		Requirements []string `json:"requirements"`
		Targets      []string `json:"targets"`
		Author       Author   `json:"author"`
		NeedsReview  bool     `json:"needsReview"`
	}{DecisionID(d.Num), d.Title, d.Rationale, d.Pattern, d.Alternative, reqs, d.Targets, d.Author, d.NeedsReview})
}

// CheckRequirement validates a Requirement's fields; nil pointers are left unchecked (not changed).
func CheckRequirement(category, statement *string) error {
	if category != nil && !slices.Contains(Categories, *category) {
		return fmt.Errorf("%w: category must be one of %s", ErrInvalid, strings.Join(Categories, ", "))
	}
	if statement != nil && !between(*statement, 1, MaxStatement) {
		return fmt.Errorf("%w: a requirement statement must be 1 to %d characters", ErrInvalid, MaxStatement)
	}
	return nil
}

// CheckDecisionText validates a Decision's text fields.
func CheckDecisionText(title, rationale, pattern, alternative string) error {
	switch {
	case !between(title, 1, MaxTitle):
		return fmt.Errorf("%w: a decision title must be 1 to %d characters", ErrInvalid, MaxTitle)
	case !between(rationale, 1, MaxRationale):
		return fmt.Errorf("%w: a decision rationale must be 1 to %d characters", ErrInvalid, MaxRationale)
	case utf8.RuneCountInString(pattern) > MaxPattern:
		return fmt.Errorf("%w: a decision pattern must be at most %d characters", ErrInvalid, MaxPattern)
	case utf8.RuneCountInString(alternative) > MaxAlternative:
		return fmt.Errorf("%w: a decision alternative must be at most %d characters", ErrInvalid, MaxAlternative)
	}
	return nil
}

// CheckLevel validates an Experience Level.
func CheckLevel(level string) error {
	if !slices.Contains(Levels, level) {
		return fmt.Errorf("%w: experience level must be one of %s", ErrInvalid, strings.Join(Levels, ", "))
	}
	return nil
}

func between(s string, lo, hi int) bool {
	n := utf8.RuneCountInString(strings.TrimSpace(s))
	return n >= lo && n <= hi
}

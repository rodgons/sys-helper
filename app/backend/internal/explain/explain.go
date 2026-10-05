// Package explain is the catalog of short explanations the app ships: one per Pattern and one per
// Component Type, each written for every Experience Level. Entries are Markdown files embedded in
// the binary (patterns/<slug>.md, component-types/<type>.md), parsed strictly at start-up.
package explain

import (
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"slices"
	"strings"
)

// Levels holds an entry's text for each Experience Level, as light Markdown.
type Levels struct {
	Beginner     string `json:"beginner"`
	Intermediate string `json:"intermediate"`
	Expert       string `json:"expert"`
}

// Pattern is a known design pattern. ID, its file's slug, never changes; a renamed Pattern keeps
// its old name as an alias.
type Pattern struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Aliases      []string `json:"aliases"`
	Gist         string   `json:"gist"`
	Reference    string   `json:"reference"`
	Explanations Levels   `json:"explanations"`
}

// ComponentType explains a Component Type of the architecture catalog. Type is its id.
type ComponentType struct {
	Type         string `json:"type"`
	Name         string `json:"name"`
	Gist         string `json:"gist"`
	Reference    string `json:"reference"`
	Explanations Levels `json:"explanations"`
}

// Catalog is every explanation. Patterns are sorted by slug, Component Types by type.
type Catalog struct {
	Patterns       []Pattern         `json:"patterns"`
	ComponentTypes []ComponentType   `json:"componentTypes"`
	names          map[string]string // normalized name or alias → Pattern id
}

//go:embed patterns/*.md component-types/*.md
var files embed.FS

var defaultCatalog = func() Catalog {
	c, err := Load(files)
	if err != nil {
		panic(err)
	}
	return c
}()

// Default is the catalog embedded in the binary.
func Default() Catalog { return defaultCatalog }

// Embedded serves the catalog embedded in the binary (httpapi.ExplanationCatalog).
type Embedded struct{}

func (Embedded) Explanations() Catalog { return defaultCatalog }

// Match returns the id of the Pattern that text names in the embedded catalog, if any.
func Match(text string) (string, bool) { return defaultCatalog.Match(text) }

// PatternNames are the embedded catalog's Pattern names, in catalog order.
func PatternNames() []string {
	names := make([]string, len(defaultCatalog.Patterns))
	for i, p := range defaultCatalog.Patterns {
		names[i] = p.Name
	}
	return names
}

// Match returns the id of the Pattern whose name or an alias equals text once both are
// normalized. Anything else, text naming two Patterns included, matches nothing.
func (c Catalog) Match(text string) (string, bool) {
	id, ok := c.names[Normalize(text)]
	return id, ok
}

// Normalize is how names are compared: lowercase, with runs of hyphens, dashes, underscores,
// slashes and spaces as one space, and a trailing "pattern" dropped.
func Normalize(text string) string {
	words := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		switch r {
		case '-', '–', '—', '_', '/':
			return true
		}
		return r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == ' '
	})
	if len(words) > 1 && words[len(words)-1] == "pattern" {
		words = words[:len(words)-1]
	}
	return strings.Join(words, " ")
}

// Load parses the catalog in fsys: patterns/*.md and component-types/*.md. It fails on the first
// malformed file, and on a name or alias that two Patterns share.
func Load(fsys fs.FS) (Catalog, error) {
	c := Catalog{names: map[string]string{}}
	err := each(fsys, "patterns", func(name string, e entry) error {
		p := Pattern{ID: strings.TrimSuffix(path.Base(name), ".md"), Name: e.name, Aliases: e.aliases,
			Gist: e.gist, Reference: e.reference, Explanations: e.levels}
		for _, n := range append([]string{p.Name}, p.Aliases...) {
			if other, taken := c.names[Normalize(n)]; taken {
				return fmt.Errorf("%q also names %s", n, other)
			}
			c.names[Normalize(n)] = p.ID
		}
		c.Patterns = append(c.Patterns, p)
		return nil
	})
	if err != nil {
		return Catalog{}, err
	}
	err = each(fsys, "component-types", func(name string, e entry) error {
		c.ComponentTypes = append(c.ComponentTypes, ComponentType{Type: strings.TrimSuffix(path.Base(name), ".md"),
			Name: e.name, Gist: e.gist, Reference: e.reference, Explanations: e.levels})
		return nil
	})
	if err != nil {
		return Catalog{}, err
	}
	return c, nil
}

// each parses every .md file in dir, in name order, and passes it to add. Errors name the file.
func each(fsys fs.FS, dir string, add func(name string, e entry) error) error {
	names, err := fs.Glob(fsys, dir+"/*.md")
	if err != nil {
		return err
	}
	for _, name := range names {
		data, err := fs.ReadFile(fsys, name)
		if err != nil {
			return err
		}
		e, err := parse(string(data), dir == "patterns")
		if err == nil {
			err = add(name, e)
		}
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
	}
	return nil
}

type entry struct {
	name, gist, reference string
	aliases               []string
	levels                Levels
}

var levelHeadings = []string{"## Beginner", "## Intermediate", "## Expert"}

// parse reads one entry:
//
//	# Name
//	Aliases: a, b      (Patterns only)
//	Gist: …
//	Reference: https://…
//
//	## Beginner
//	…
//	## Intermediate
//	…
//	## Expert
//	…
func parse(text string, withAliases bool) (entry, error) {
	var e entry
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	fields := []string{"Gist: ", "Reference: "}
	if withAliases {
		fields = append([]string{"Aliases: "}, fields...)
	}
	var levels [3][]string
	level := -1 // the level section being read, -1 while in the header
	for i, line := range lines {
		unexpected := fmt.Errorf("line %d: unexpected %q", i+1, line)
		switch {
		case i == 0:
			name, ok := strings.CutPrefix(line, "# ")
			if !ok || strings.TrimSpace(name) == "" {
				return e, errors.New(`line 1: must be "# <Name>"`)
			}
			e.name = strings.TrimSpace(name)
		case level+1 < len(levelHeadings) && line == levelHeadings[level+1]:
			level++
		case strings.HasPrefix(line, "#"):
			return e, unexpected
		case level >= 0:
			levels[level] = append(levels[level], line)
		case strings.TrimSpace(line) == "":
		case len(fields) > 0 && strings.HasPrefix(line, fields[0]):
			value := strings.TrimSpace(strings.TrimPrefix(line, fields[0]))
			switch fields[0] {
			case "Aliases: ":
				for _, a := range strings.Split(value, ",") {
					if a = strings.TrimSpace(a); a != "" {
						e.aliases = append(e.aliases, a)
					}
				}
			case "Gist: ":
				e.gist = value
			case "Reference: ":
				e.reference = value
			}
			fields = fields[1:]
		case slices.ContainsFunc(fields, func(f string) bool { return strings.HasPrefix(line, f) }):
			return e, fmt.Errorf("missing %s", strings.TrimSuffix(fields[0], ": "))
		default:
			return e, unexpected
		}
	}
	switch {
	case len(fields) > 0:
		return e, fmt.Errorf("missing %s", strings.TrimSuffix(fields[0], ": "))
	case e.gist == "":
		return e, errors.New("Gist is empty")
	case !strings.HasPrefix(e.reference, "https://"):
		return e, errors.New("Reference must be an https URL")
	case level < len(levelHeadings)-1:
		return e, fmt.Errorf("missing %s", levelHeadings[level+1])
	}
	seen := map[string]bool{Normalize(e.name): true}
	for _, a := range e.aliases {
		if seen[Normalize(a)] {
			return e, fmt.Errorf("duplicate alias %q", a)
		}
		seen[Normalize(a)] = true
	}
	texts := make([]string, len(levels))
	for i, body := range levels {
		texts[i] = strings.TrimSpace(strings.Join(body, "\n"))
		switch {
		case texts[i] == "":
			return e, fmt.Errorf("%s is empty", levelHeadings[i])
		case strings.Contains(texts[i], "!["):
			return e, fmt.Errorf("%s has an image", levelHeadings[i])
		}
	}
	e.levels = Levels{Beginner: texts[0], Intermediate: texts[1], Expert: texts[2]}
	return e, nil
}

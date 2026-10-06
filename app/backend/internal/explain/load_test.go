package explain_test

import (
	"strings"
	"testing"
	"testing/fstest"

	"sys-helper/backend/internal/explain"
)

const cacheAside = `# Cache-Aside
Aliases: lazy loading, look-aside cache
Gist: The app reads the cache first.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside

## Beginner
Like checking your desk before the library.

## Intermediate
On a miss the app **loads** and fills the cache.

## Expert
- Stampedes on hot keys.
- Stale reads after writes.
`

const cacheType = `# Cache
Gist: Fast memory in front of slower storage.
Reference: https://github.com/donnemartin/system-design-primer#cache

## Beginner
A notepad.

## Intermediate
Key-value memory.

## Expert
Eviction and stampedes.
`

func TestLoadReadsPatternsAndComponentTypes(t *testing.T) {
	c, err := explain.Load(fstest.MapFS{
		"patterns/cache-aside.md":  {Data: []byte(cacheAside)},
		"component-types/cache.md": {Data: []byte(cacheType)},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Patterns) != 1 || len(c.ComponentTypes) != 1 {
		t.Fatalf("got %d patterns and %d component types, want 1 and 1", len(c.Patterns), len(c.ComponentTypes))
	}
	p := c.Patterns[0]
	want := explain.Pattern{
		ID: "cache-aside", Name: "Cache-Aside", Aliases: []string{"lazy loading", "look-aside cache"},
		Gist: "The app reads the cache first.", Reference: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside",
		Explanations: explain.Levels{
			Beginner:     "Like checking your desk before the library.",
			Intermediate: "On a miss the app **loads** and fills the cache.",
			Expert:       "- Stampedes on hot keys.\n- Stale reads after writes.",
		},
	}
	if p.ID != want.ID || p.Name != want.Name || strings.Join(p.Aliases, "|") != strings.Join(want.Aliases, "|") ||
		p.Gist != want.Gist || p.Reference != want.Reference || p.Explanations != want.Explanations {
		t.Errorf("pattern = %+v, want %+v", p, want)
	}
	ct := c.ComponentTypes[0]
	if ct.Type != "cache" || ct.Name != "Cache" || ct.Gist != "Fast memory in front of slower storage." || ct.Explanations.Expert != "Eviction and stampedes." {
		t.Errorf("component type = %+v", ct)
	}
}

func TestLoadRejectsMalformedEntries(t *testing.T) {
	tests := []struct {
		name, file, body, want string
	}{
		{"missing level", "patterns/cache-aside.md",
			strings.Replace(cacheAside, "## Expert\n- Stampedes on hot keys.\n- Stale reads after writes.\n", "", 1),
			"patterns/cache-aside.md: missing ## Expert"},
		{"empty level", "patterns/cache-aside.md",
			strings.Replace(cacheAside, "Like checking your desk before the library.", "", 1),
			"patterns/cache-aside.md: ## Beginner is empty"},
		{"unknown line", "patterns/cache-aside.md",
			strings.Replace(cacheAside, "Gist:", "Summary: x\nGist:", 1),
			`patterns/cache-aside.md: line 3: unexpected "Summary: x"`},
		{"duplicate alias", "patterns/cache-aside.md",
			strings.Replace(cacheAside, "look-aside cache", "Lazy-Loading", 1),
			`patterns/cache-aside.md: duplicate alias "Lazy-Loading"`},
		{"alias that is the name", "patterns/cache-aside.md",
			strings.Replace(cacheAside, "look-aside cache", "cache aside", 1),
			`patterns/cache-aside.md: duplicate alias "cache aside"`},
		{"heading in a level", "patterns/cache-aside.md",
			strings.Replace(cacheAside, "Like checking", "### Note\nLike checking", 1),
			`patterns/cache-aside.md: line 7: unexpected "### Note"`},
		{"image in a level", "patterns/cache-aside.md",
			strings.Replace(cacheAside, "Like checking", "![x](y.png) Like checking", 1),
			"patterns/cache-aside.md: ## Beginner has an image"},
		{"plain http reference", "patterns/cache-aside.md",
			strings.Replace(cacheAside, "https://learn", "http://learn", 1),
			"patterns/cache-aside.md: Reference must be an https URL"},
		{"no gist", "patterns/cache-aside.md",
			strings.Replace(cacheAside, "Gist: The app reads the cache first.\n", "", 1),
			"patterns/cache-aside.md: missing Gist"},
		{"aliases on a component type", "component-types/cache.md",
			strings.Replace(cacheType, "Gist:", "Aliases: memo\nGist:", 1),
			`component-types/cache.md: line 2: unexpected "Aliases: memo"`},
		{"levels out of order", "patterns/cache-aside.md",
			strings.Replace(strings.Replace(cacheAside, "## Beginner", "## TEMP", 1), "## Intermediate", "## Beginner", 1),
			`patterns/cache-aside.md: line 6: unexpected "## TEMP"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fsys := fstest.MapFS{
				"patterns/cache-aside.md":  {Data: []byte(cacheAside)},
				"component-types/cache.md": {Data: []byte(cacheType)},
			}
			fsys[tt.file] = &fstest.MapFile{Data: []byte(tt.body)}
			_, err := explain.Load(fsys)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("err = %v, want it to contain %q", err, tt.want)
			}
		})
	}
}

func TestLoadRejectsAnAliasSharedByTwoPatterns(t *testing.T) {
	other := strings.Replace(strings.Replace(cacheAside, "# Cache-Aside", "# Read-Through", 1), "look-aside cache", "Look Aside Cache", 1)
	other = strings.Replace(other, "lazy loading, ", "", 1)
	_, err := explain.Load(fstest.MapFS{
		"patterns/cache-aside.md":  {Data: []byte(cacheAside)},
		"patterns/read-through.md": {Data: []byte(other)},
	})
	want := `patterns/read-through.md: "Look Aside Cache" also names cache-aside`
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Errorf("err = %v, want it to contain %q", err, want)
	}
}

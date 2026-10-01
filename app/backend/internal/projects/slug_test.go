package projects_test

import (
	"regexp"
	"testing"

	"sys-helper/backend/internal/projects"
)

func TestSlug(t *testing.T) {
	tests := []struct{ name, want string }{
		{"URL Shortener", "url-shortener-k3xa9q2m7p"},
		{"  Café & Crème: v2!  ", "cafe-creme-v2-k3xa9q2m7p"},
		{"Ñandú--payments__API", "nandu-payments-api-k3xa9q2m7p"},
		{"🚀🚀", "k3xa9q2m7p"},
		{"a very long project name that keeps going and going forever", "a-very-long-project-name-that-keeps-goin-k3xa9q2m7p"},
		{"forty chars exactly then a dash-cut here", "forty-chars-exactly-then-a-dash-cut-here-k3xa9q2m7p"},
		{"thirty-nine characters then a space cut x", "thirty-nine-characters-then-a-space-cut-k3xa9q2m7p"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := projects.Project{Name: tt.name, SlugSuffix: "k3xa9q2m7p"}
			if got := p.Slug(); got != tt.want {
				t.Errorf("Slug() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSuffixFromSlug(t *testing.T) {
	tests := []struct {
		slug, want string
		ok         bool
	}{
		{"url-shortener-k3xa9q2m7p", "k3xa9q2m7p", true},
		{"renamed-since-k3xa9q2m7p", "k3xa9q2m7p", true},
		{"k3xa9q2m7p", "k3xa9q2m7p", true},
		{"url-shortener-K3XA9Q2M7P", "", false},
		{"url-shortener-short", "", false},
		{"url-shortener-k3xa9q2m7p0", "", false},
		{"", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.slug, func(t *testing.T) {
			got, ok := projects.SuffixFromSlug(tt.slug)
			if got != tt.want || ok != tt.ok {
				t.Errorf("SuffixFromSlug(%q) = %q, %v; want %q, %v", tt.slug, got, ok, tt.want, tt.ok)
			}
		})
	}
}

func TestNewSuffix(t *testing.T) {
	valid := regexp.MustCompile(`^[a-z0-9]{10}$`)
	seen := map[string]bool{}
	for range 1000 {
		s := projects.NewSuffix()
		if !valid.MatchString(s) {
			t.Fatalf("NewSuffix() = %q, want 10 chars of [a-z0-9]", s)
		}
		if seen[s] {
			t.Fatalf("NewSuffix() repeated %q", s)
		}
		seen[s] = true
	}
}

func TestCleanName(t *testing.T) {
	if got, err := projects.CleanName("  URL Shortener \n"); err != nil || got != "URL Shortener" {
		t.Errorf("CleanName = %q, %v", got, err)
	}
	for _, bad := range []string{"", "   ", string(make([]rune, 101))} {
		if _, err := projects.CleanName(bad); err == nil {
			t.Errorf("CleanName(%q) succeeded, want error", bad)
		}
	}
	long := ""
	for range 100 {
		long += "é"
	}
	if _, err := projects.CleanName(long); err != nil {
		t.Errorf("100 multi-byte characters rejected: %v", err)
	}
}

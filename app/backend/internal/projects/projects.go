// Package projects owns Projects: their names, their Project Slugs and their storage.
package projects

import (
	"crypto/rand"
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

const (
	suffixLen      = 10
	suffixAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	slugNameMax    = 40
	nameMax        = 100
)

var (
	ErrNotFound    = errors.New("project not found")
	ErrInvalidName = errors.New("project name must be 1 to 100 characters")
)

type Project struct {
	ID string
	// SlugSuffix is assigned once at creation and never changes. It alone identifies the Project
	// in URLs; the name part of the slug follows renames.
	SlugSuffix string
	Name       string
	UpdatedAt  time.Time
}

// Slug is the Project Slug: the normalized name followed by the suffix, or the suffix alone when
// the name has no usable characters.
func (p Project) Slug() string {
	if name := slugName(p.Name); name != "" {
		return name + "-" + p.SlugSuffix
	}
	return p.SlugSuffix
}

// SuffixFromSlug extracts the identifying suffix from a Project Slug. The name part is ignored, so
// slugs from before a rename still resolve.
func SuffixFromSlug(slug string) (string, bool) {
	suffix := slug[strings.LastIndexByte(slug, '-')+1:]
	if len(suffix) != suffixLen || strings.Trim(suffix, suffixAlphabet) != "" {
		return "", false
	}
	return suffix, true
}

// NewSuffix returns a random slug suffix of 10 characters from a-z0-9.
func NewSuffix() string {
	out := make([]byte, 0, suffixLen)
	var buf [32]byte
	for len(out) < suffixLen {
		_, _ = rand.Read(buf[:]) // never fails (crypto/rand panics instead)
		for _, c := range buf {
			// Rejection sampling keeps every character equally likely: 252 = 7 × 36.
			if c < 252 && len(out) < suffixLen {
				out = append(out, suffixAlphabet[c%36])
			}
		}
	}
	return string(out)
}

// CleanName trims a Project name and checks it is 1 to 100 characters long.
func CleanName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > nameMax {
		return "", ErrInvalidName
	}
	return name, nil
}

// slugName lowercases name, strips accents, turns every run of other characters into one dash and
// keeps at most 40 characters.
func slugName(name string) string {
	ascii, _, _ := transform.String(transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn))), name)
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(ascii) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			b.WriteRune(r)
			dash = false
		} else {
			dash = true
		}
	}
	s := b.String()
	if len(s) > slugNameMax {
		s = s[:slugNameMax]
	}
	return strings.TrimRight(s, "-")
}

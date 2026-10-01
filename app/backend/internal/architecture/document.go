// Package architecture owns a Project's Architecture: the Components and Connections on its
// canvas, stored as one versioned document.
package architecture

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"
)

const (
	maxComponents  = 500
	maxConnections = 2000
	maxNameLen     = 100
	maxValueLen    = 500
)

// ComponentTypes is the catalog: each Component Type and the properties its Components may have.
var ComponentTypes = map[string][]string{
	"client":           {"platform"},
	"dns":              nil,
	"cdn":              nil,
	"load_balancer":    {"algorithm"},
	"api_gateway":      nil,
	"service":          {"runtime", "instances"},
	"database":         {"engine", "replicas", "sharding"},
	"cache":            {"engine", "eviction"},
	"queue":            {"engine", "delivery"},
	"object_store":     nil,
	"search_index":     {"engine"},
	"external_service": {"provider"},
	"custom":           {"description"},
}

// ConnectionKinds are the ways one Component can talk to another.
var ConnectionKinds = []string{"sync", "async", "replication"}

type Document struct {
	Components  []Component  `json:"components"`
	Connections []Connection `json:"connections"`
}

type Component struct {
	ID         string            `json:"id"`
	Type       string            `json:"type"`
	Name       string            `json:"name"`
	Position   Position          `json:"position"`
	Properties map[string]string `json:"properties,omitempty"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Connection struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Kind   string `json:"kind"`
	Label  string `json:"label,omitempty"`
}

// Empty is the Architecture of a new Project.
func Empty() Document {
	return Document{Components: []Component{}, Connections: []Connection{}}
}

var ErrInvalid = errors.New("invalid architecture")

// Validate checks the document against the catalog and that every Connection joins two existing
// Components.
func (d Document) Validate() error {
	if len(d.Components) > maxComponents || len(d.Connections) > maxConnections {
		return fmt.Errorf("%w: too many components or connections", ErrInvalid)
	}
	ids := make(map[string]bool, len(d.Components))
	for _, c := range d.Components {
		allowed, known := ComponentTypes[c.Type]
		switch {
		case c.ID == "" || len(c.ID) > maxNameLen:
			return fmt.Errorf("%w: component id %q", ErrInvalid, c.ID)
		case ids[c.ID]:
			return fmt.Errorf("%w: duplicate component id %q", ErrInvalid, c.ID)
		case !known:
			return fmt.Errorf("%w: unknown component type %q", ErrInvalid, c.Type)
		case strings.TrimSpace(c.Name) == "" || utf8.RuneCountInString(c.Name) > maxNameLen:
			return fmt.Errorf("%w: component %q needs a name of 1 to %d characters", ErrInvalid, c.ID, maxNameLen)
		}
		for key, value := range c.Properties {
			if !slices.Contains(allowed, key) {
				return fmt.Errorf("%w: a %s has no property %q", ErrInvalid, c.Type, key)
			}
			if utf8.RuneCountInString(value) > maxValueLen {
				return fmt.Errorf("%w: property %q is too long", ErrInvalid, key)
			}
		}
		ids[c.ID] = true
	}
	edgeIDs := make(map[string]bool, len(d.Connections))
	for _, e := range d.Connections {
		switch {
		case e.ID == "" || len(e.ID) > maxNameLen || edgeIDs[e.ID]:
			return fmt.Errorf("%w: connection id %q", ErrInvalid, e.ID)
		case !ids[e.Source] || !ids[e.Target]:
			return fmt.Errorf("%w: connection %q must join two existing components", ErrInvalid, e.ID)
		case !slices.Contains(ConnectionKinds, e.Kind):
			return fmt.Errorf("%w: unknown connection kind %q", ErrInvalid, e.Kind)
		case utf8.RuneCountInString(e.Label) > maxNameLen:
			return fmt.Errorf("%w: connection label is too long", ErrInvalid)
		}
		edgeIDs[e.ID] = true
	}
	return nil
}

package explain_test

import (
	"maps"
	"slices"
	"strings"
	"testing"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/explain"
)

// The embedded catalog loads at all, or every test here panics first: unique slugs, no name or
// alias shared by two Patterns, three levels, a gist and an https reference are Load's rules.
func TestEmbeddedCatalogHasEveryComponentTypeButCustom(t *testing.T) {
	var got []string
	for _, ct := range explain.Default().ComponentTypes {
		got = append(got, ct.Type)
	}
	want := slices.Sorted(maps.Keys(architecture.ComponentTypes))
	want = slices.DeleteFunc(want, func(typ string) bool { return typ == "custom" })
	if !slices.Equal(got, want) {
		t.Errorf("component type explanations = %v, want %v", got, want)
	}
}

func TestEmbeddedComponentTypesAreNamedLikeTheirLabels(t *testing.T) {
	// The labels the canvas shows (COMPONENT_TYPES in src/architecture/model.ts).
	labels := map[string]string{
		"client": "Client", "dns": "DNS", "cdn": "CDN", "load_balancer": "Load Balancer", "api_gateway": "API Gateway",
		"service": "Service", "database": "Database", "cache": "Cache", "queue": "Queue / Stream",
		"object_store": "Object Store", "search_index": "Search Index", "external_service": "External Service",
	}
	for _, ct := range explain.Default().ComponentTypes {
		if ct.Name != labels[ct.Type] {
			t.Errorf("%s is named %q, want %q", ct.Type, ct.Name, labels[ct.Type])
		}
	}
}

func TestEmbeddedCatalogHasTheFirstBuildPatterns(t *testing.T) {
	want := []string{
		"API Gateway", "CDN Caching", "CQRS", "Cache-Aside", "Change Data Capture", "Circuit Breaker",
		"Competing Consumers", "Consistent Hashing", "Denormalization", "Failover", "Fan-out on Read",
		"Fan-out on Write", "Horizontal Scaling", "Idempotent Consumer", "Leader-Follower Replication",
		"Load Balancing", "Materialized View", "Publisher-Subscriber", "Queue-Based Load Leveling",
		"Rate Limiting", "Read Replicas", "Retry with Backoff", "Saga", "Search Index Sync", "Sharding",
		"Static Content Hosting", "Transactional Outbox", "Valet Key", "Write-Through",
	}
	got := slices.Sorted(slices.Values(explain.PatternNames()))
	if !slices.Equal(got, want) {
		t.Errorf("patterns = %v\nwant %v", got, want)
	}
	for _, p := range explain.Default().Patterns {
		if p.ID != strings.ToLower(p.ID) || strings.ContainsAny(p.ID, " _") {
			t.Errorf("slug %q must be lowercase words joined by hyphens", p.ID)
		}
	}
}

func TestMatch(t *testing.T) {
	tests := []struct{ text, want string }{
		{"Cache-aside", "cache-aside"},
		{"cache aside", "cache-aside"},
		{"Cache_Aside pattern", "cache-aside"},
		{"cache–aside", "cache-aside"},
		{"  Lazy  loading ", "cache-aside"},
		{"read/write splitting", "read-replicas"},
		{"replication", "leader-follower-replication"},
		{"throttling", "rate-limiting"},
		{"partitioning", "sharding"},
		{"CDN", "cdn-caching"},
		{"load balancer", "load-balancing"},
		{"Saga choreography", "saga"},
		{"fan-out", ""},
		{"Primary-Replica relational database", ""},
		{"Read replicas + cache-aside", ""},
		{"Single primary", ""},
		{"active-active", ""},
		{"cache", ""},
		{"", ""},
		{"Node.js", ""},
	}
	for _, tt := range tests {
		got, ok := explain.Match(tt.text)
		if got != tt.want || ok != (tt.want != "") {
			t.Errorf("Match(%q) = %q, %v; want %q", tt.text, got, ok, tt.want)
		}
	}
}

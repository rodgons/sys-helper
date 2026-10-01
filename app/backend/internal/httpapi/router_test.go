package httpapi_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"sys-helper/backend/internal/httpapi"
)

type fakePinger struct{ err error }

func (f fakePinger) Ping(context.Context) error { return f.err }

func serve(t *testing.T, deps httpapi.Deps, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	httpapi.NewRouter(deps).ServeHTTP(rec, req)
	return rec
}

func TestHealth(t *testing.T) {
	rec := serve(t, httpapi.Deps{DB: fakePinger{}}, httptest.NewRequest(http.MethodGet, "/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestReady(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want int
	}{
		{"database up", nil, http.StatusOK},
		{"database down", errors.New("boom"), http.StatusServiceUnavailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(t, httpapi.Deps{DB: fakePinger{tt.err}}, httptest.NewRequest(http.MethodGet, "/ready", nil))

			if rec.Code != tt.want {
				t.Fatalf("status = %d, want %d", rec.Code, tt.want)
			}
		})
	}
}

func TestCORS(t *testing.T) {
	deps := httpapi.Deps{DB: fakePinger{}, AllowedOrigins: []string{"http://allowed.test"}}

	t.Run("allowed origin gets CORS headers", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.Header.Set("Origin", "http://allowed.test")

		rec := serve(t, deps, req)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://allowed.test" {
			t.Fatalf("Access-Control-Allow-Origin = %q", got)
		}
	})

	t.Run("unknown origin gets no CORS headers", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.Header.Set("Origin", "http://evil.test")

		rec := serve(t, deps, req)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("Access-Control-Allow-Origin = %q, want empty", got)
		}
	})

	t.Run("preflight short-circuits", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/health", nil)
		req.Header.Set("Origin", "http://allowed.test")
		req.Header.Set("Access-Control-Request-Method", http.MethodGet)

		rec := serve(t, deps, req)

		if rec.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
		}
	})
}

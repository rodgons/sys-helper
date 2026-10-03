package auth_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"sys-helper/backend/internal/auth"
)

// supabase serves a JWKS for key at the path Supabase Auth uses.
func supabase(t *testing.T, key *ecdsa.PrivateKey) *httptest.Server {
	t.Helper()
	point, err := key.PublicKey.Bytes() // 0x04 || X || Y
	if err != nil {
		t.Fatal(err)
	}
	b64 := base64.RawURLEncoding.EncodeToString
	jwks := map[string]any{"keys": []map[string]string{{
		"kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": "k1",
		"x": b64(point[1:33]), "y": b64(point[33:]),
	}}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(jwks)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func sign(t *testing.T, key *ecdsa.PrivateKey, method jwt.SigningMethod, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(method, claims)
	tok.Header["kid"] = "k1"
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestVerifier(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	srv := supabase(t, key)
	verifier, err := auth.NewVerifier(context.Background(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	valid := func() jwt.MapClaims {
		return jwt.MapClaims{
			"iss": srv.URL + "/auth/v1",
			"aud": "authenticated",
			"sub": "user-1",
			"session_id": "session-1",
			"exp": time.Now().Add(time.Hour).Unix(),
		}
	}

	t.Run("returns the subject and session of a valid token", func(t *testing.T) {
		got, err := verifier.Verify(sign(t, key, jwt.SigningMethodES256, valid()))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != (auth.Token{UserID: "user-1", SessionID: "session-1"}) {
			t.Errorf("Verify = %+v", got)
		}
	})

	otherKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name  string
		token func() string
	}{
		{"expired", func() string {
			c := valid()
			c["exp"] = time.Now().Add(-time.Minute).Unix()
			return sign(t, key, jwt.SigningMethodES256, c)
		}},
		{"no expiry", func() string {
			c := valid()
			delete(c, "exp")
			return sign(t, key, jwt.SigningMethodES256, c)
		}},
		{"wrong issuer", func() string {
			c := valid()
			c["iss"] = "http://evil.test/auth/v1"
			return sign(t, key, jwt.SigningMethodES256, c)
		}},
		{"wrong audience", func() string {
			c := valid()
			c["aud"] = "anon"
			return sign(t, key, jwt.SigningMethodES256, c)
		}},
		{"no subject", func() string {
			c := valid()
			delete(c, "sub")
			return sign(t, key, jwt.SigningMethodES256, c)
		}},
		{"without a session", func() string {
			c := valid()
			delete(c, "session_id")
			return sign(t, key, jwt.SigningMethodES256, c)
		}},
		{"signed by another key", func() string { return sign(t, otherKey, jwt.SigningMethodES256, valid()) }},
		{"not a JWT", func() string { return "garbage" }},
	}
	for _, tt := range tests {
		t.Run("rejects a token that is "+tt.name, func(t *testing.T) {
			_, err := verifier.Verify(tt.token())
			if !errors.Is(err, auth.ErrInvalidToken) {
				t.Fatalf("err = %v, want ErrInvalidToken", err)
			}
		})
	}
}

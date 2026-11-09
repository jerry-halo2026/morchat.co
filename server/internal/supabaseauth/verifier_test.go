package supabaseauth

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func proof(sub, issuer string, exp int64) string {
	return "eyJhbGciOiJIUzI1NiJ9." + base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"sub":%q,"iss":%q,"exp":%d}`, sub, issuer, exp))) + ".c2ln"
}
func TestVerifier(t *testing.T) {
	const id = "ea65bf1b-9362-4bef-9d22-a222e13b2a31"
	now := time.Now()
	cases := []struct {
		name, body, sub, issuer string
		exp                     int64
		status                  int
		ok                      bool
	}{
		{"confirmed", `{"id":"` + id + `","email":"a@example.com","email_confirmed_at":"2026-01-01T00:00:00Z","role":"authenticated","is_anonymous":false}`, id, ProjectURL + "/auth/v1", now.Add(time.Hour).Unix(), 200, true},
		{"anonymous", `{"id":"` + id + `","email":"a@example.com","email_confirmed_at":"2026-01-01T00:00:00Z","role":"authenticated","is_anonymous":true}`, id, ProjectURL + "/auth/v1", now.Add(time.Hour).Unix(), 200, false},
		{"unconfirmed", `{"id":"` + id + `","email":"a@example.com","role":"authenticated"}`, id, ProjectURL + "/auth/v1", now.Add(time.Hour).Unix(), 200, false},
		{"wrong issuer", `{"id":"` + id + `","email":"a@example.com","email_confirmed_at":"2026-01-01T00:00:00Z","role":"authenticated"}`, id, "https://other.supabase.co/auth/v1", now.Add(time.Hour).Unix(), 200, false},
		{"expired", `{"id":"` + id + `","email":"a@example.com","email_confirmed_at":"2026-01-01T00:00:00Z","role":"authenticated"}`, id, ProjectURL + "/auth/v1", now.Add(-time.Second).Unix(), 200, false},
		{"mismatched sub", `{"id":"` + id + `","email":"a@example.com","email_confirmed_at":"2026-01-01T00:00:00Z","role":"authenticated"}`, "a5f2f34f-b91c-4ee9-9387-34f0039d7000", ProjectURL + "/auth/v1", now.Add(time.Hour).Unix(), 200, false},
		{"malformed UUID", `{"id":"bad","email":"a@example.com","email_confirmed_at":"2026-01-01T00:00:00Z","role":"authenticated"}`, "bad", ProjectURL + "/auth/v1", now.Add(time.Hour).Unix(), 200, false},
		{"provider rejects", `{"error":"invalid"}`, id, ProjectURL + "/auth/v1", now.Add(time.Hour).Unix(), 401, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			token := proof(tc.sub, tc.issuer, tc.exp)
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/auth/v1/user" || r.Header.Get("apikey") != "sb_publishable_test" || r.Header.Get("Authorization") != "Bearer "+token {
					t.Error("incorrect provider request")
				}
				w.WriteHeader(tc.status)
				fmt.Fprint(w, tc.body)
			}))
			defer srv.Close()
			v := Verifier{URL: srv.URL, Key: "sb_publishable_test", Client: srv.Client()}
			got, err := v.Verify(context.Background(), token)
			if (err == nil) != tc.ok {
				t.Fatalf("success=%v want %v", err == nil, tc.ok)
			}
			if tc.ok && (got.Subject != id || got.Email != "a@example.com" || got.ExpiresAt.Unix() != tc.exp) {
				t.Fatal("identity mismatch")
			}
		})
	}
}
func TestConfigFailClosed(t *testing.T) {
	for _, url := range []string{"", "http://qcpgqehqjescuwqhnmie.supabase.co", "https://other.supabase.co"} {
		t.Setenv("SUPABASE_URL", url)
		t.Setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
		if FromEnv() != nil {
			t.Fatal("enabled wrong provider")
		}
	}
	t.Setenv("SUPABASE_URL", ProjectURL)
	t.Setenv("SUPABASE_PUBLISHABLE_KEY", "service_role_secret")
	if FromEnv() != nil {
		t.Fatal("enabled secret key")
	}
	t.Setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
	if FromEnv() == nil {
		t.Fatal("fixed public provider disabled")
	}
}
func TestVerifierRejectsRedirect(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("followed redirect leaking proof") }))
	defer target.Close()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 302) }))
	defer srv.Close()
	v := Verifier{URL: srv.URL, Key: "sb_publishable_test", Client: srv.Client()}
	if _, err := v.Verify(context.Background(), strings.Repeat("x", 20)); err == nil {
		t.Fatal("accepted redirect")
	}
}

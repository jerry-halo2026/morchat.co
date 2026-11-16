package supabaseauth_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jerry-halo2026/morchat.co/server/internal/auth"
	"github.com/jerry-halo2026/morchat.co/server/internal/handler"
	"github.com/jerry-halo2026/morchat.co/server/internal/middleware"
	"github.com/jerry-halo2026/morchat.co/server/internal/supabaseauth"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// External-package tests exercise the real handler without importing or
// executing the handler package's database-mutating integration TestMain.
const subject = "ea65bf1b-9362-4bef-9d22-a222e13b2a31"

type rowFunc func(...any) error

func (f rowFunc) Scan(dest ...any) error { return f(dest...) }

type localTx struct {
	pgx.Tx
	user                                      db.User
	mapped, collision, failBinding, committed bool
	events                                    []string
}

func (tx *localTx) Begin(context.Context) (pgx.Tx, error) {
	tx.events = append(tx.events, "begin")
	return tx, nil
}
func (tx *localTx) Commit(context.Context) error {
	tx.committed = true
	tx.events = append(tx.events, "commit")
	return nil
}
func (tx *localTx) Rollback(context.Context) error {
	tx.events = append(tx.events, "rollback")
	return nil
}
func (tx *localTx) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	switch {
	case strings.Contains(sql, "pg_advisory_xact_lock"):
		tx.events = append(tx.events, "lock")
	case strings.Contains(sql, `INSERT INTO "user"`):
		tx.events = append(tx.events, "user")
		_ = tx.user.ID.Scan(args[0])
		tx.user.Name = args[1].(string)
		tx.user.Email = args[2].(string)
	case strings.Contains(sql, "INSERT INTO external_auth_identity"):
		tx.events = append(tx.events, "binding")
		if args[0] != supabaseauth.Project || args[1] != subject {
			return pgconn.CommandTag{}, errors.New("wrong stable binding")
		}
		if tx.failBinding {
			return pgconn.CommandTag{}, errors.New("binding write failed")
		}
	default:
		return pgconn.CommandTag{}, fmt.Errorf("unexpected write: %s", sql)
	}
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}
func (tx *localTx) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	return rowFunc(func(dest ...any) error {
		switch {
		case strings.Contains(sql, "FROM external_auth_identity"):
			tx.events = append(tx.events, "lookup-binding")
			if !tx.mapped {
				return pgx.ErrNoRows
			}
			*dest[0].(*string) = subject
			return nil
		case strings.Contains(sql, "SELECT EXISTS"):
			tx.events = append(tx.events, "check-collision")
			*dest[0].(*bool) = tx.collision
			return nil
		case strings.Contains(sql, "HasPendingInvitationForEmail"):
			*dest[0].(*bool) = false
			return nil
		case strings.Contains(sql, `FROM "user"`):
			u := tx.user
			values := []any{u.ID, u.Name, u.Email, u.AvatarUrl, u.CreatedAt, u.UpdatedAt, u.OnboardedAt, u.OnboardingQuestionnaire, u.CloudWaitlistEmail, u.CloudWaitlistReason, u.StarterContentState, u.Language, u.ProfileDescription, u.Timezone, u.WhatsNewSeenVersion, u.StarPromptShownCount, u.StarPromptLastShownAt, u.StarPromptStarredAt, u.PasswordHash, u.PasswordUpdatedAt, u.MustChangePassword}
			if len(values) != len(dest) {
				return errors.New("native user scan shape changed")
			}
			for i := range dest {
				reflect.ValueOf(dest[i]).Elem().Set(reflect.ValueOf(values[i]))
			}
			return nil
		default:
			return fmt.Errorf("unexpected read: %s", sql)
		}
	})
}

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func configureProof(t *testing.T, status int) string {
	t.Helper()
	t.Setenv("SUPABASE_URL", supabaseauth.ProjectURL)
	t.Setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
	exp := time.Now().Add(4 * time.Minute).Unix()
	proof := "eyJhbGciOiJIUzI1NiJ9." + base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"sub":%q,"iss":%q,"exp":%d}`, subject, supabaseauth.ProjectURL+"/auth/v1", exp))) + ".c2ln"
	previous := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = previous })
	http.DefaultTransport = transportFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != supabaseauth.ProjectURL+"/auth/v1/user" || r.Method != "GET" || r.Header.Get("Authorization") != "Bearer "+proof || r.Header.Get("apikey") != "sb_publishable_test" {
			t.Error("invalid fixed-project validation request")
		}
		body := `{"id":"` + subject + `","email":"person@example.com","email_confirmed_at":"2026-01-01T00:00:00Z","role":"authenticated","user_metadata":{"role":"owner"}}`
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})
	return proof
}
func newHandler(tx *localTx, allowSignup bool) *handler.Handler {
	return handler.New(db.New(tx), tx, nil, nil, nil, nil, nil, nil, handler.Config{AllowSignup: allowSignup})
}
func TestSupabaseLoginNativeExchange(t *testing.T) {
	for _, tc := range []struct {
		name                                        string
		mapped, collision, failBinding, allowSignup bool
		providerStatus, want                        int
	}{
		{"new stable identity", false, false, false, true, 200, 200},
		{"same identity returning", true, false, false, false, 200, 200},
		{"email or UUID collision refused", false, true, false, true, 200, 409},
		{"binding write rolls back account", false, false, true, true, 200, 500},
		{"native signup disabled", false, false, false, false, 200, 403},
		{"invalid provider proof", false, false, false, true, 401, 401},
	} {
		t.Run(tc.name, func(t *testing.T) {
			proof := configureProof(t, tc.providerStatus)
			tx := &localTx{mapped: tc.mapped, collision: tc.collision, failBinding: tc.failBinding}
			_ = tx.user.ID.Scan(subject)
			tx.user.Name = "Person"
			tx.user.Email = "person@example.com"
			h := newHandler(tx, tc.allowSignup)
			rec := httptest.NewRecorder()
			h.SupabaseLogin(rec, supabaseLoginRequest(`{"access_token":"`+proof+`"}`))
			if rec.Code != tc.want {
				t.Fatalf("status %d want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
			if tc.want != 200 {
				if tx.committed || len(rec.Result().Cookies()) != 0 {
					t.Fatal("failed login established session or committed identity")
				}
				if tc.providerStatus != 200 && len(tx.events) > 0 {
					t.Fatal("unverified proof touched local identity")
				}
				return
			}
			if !tx.committed {
				t.Fatal("identity not committed")
			}
			var result handler.LoginResponse
			if json.Unmarshal(rec.Body.Bytes(), &result) != nil || result.User.ID != subject {
				t.Fatal("native identity mismatch")
			}
			claims, err := auth.ParseSessionToken(result.Token)
			if err != nil || claims["sub"] != subject || !auth.IsExternalSession(claims) {
				t.Fatal("missing bounded native token")
			}
			if claims["role"] != nil {
				t.Fatal("provider metadata granted role")
			}
			if len(rec.Result().Cookies()) != 3 {
				t.Fatal("native auth and CSRF cookies missing")
			}
			// Real native middleware and CLI/refresh handlers must not extend this proof.
			for _, endpoint := range []string{"cli", "refresh"} {
				next := h.IssueCliToken
				if endpoint == "refresh" {
					next = h.RefreshSession
				}
				request := httptest.NewRequest("POST", "/api/"+endpoint, nil)
				request.Header.Set("Authorization", "Bearer "+result.Token)
				recorder := httptest.NewRecorder()
				middleware.Auth(h.Queries, nil, nil, nil)(http.HandlerFunc(next)).ServeHTTP(recorder, request)
				if recorder.Code != 200 {
					t.Fatalf("native %s rejected: %d", endpoint, recorder.Code)
				}
				if len(recorder.Result().Cookies()) > 0 {
					t.Fatal("bounded session silently renewed")
				}
				var response map[string]any
				_ = json.Unmarshal(recorder.Body.Bytes(), &response)
				if endpoint == "cli" && response["token"] != result.Token {
					t.Fatal("CLI exchange extended provider proof")
				}
				if endpoint == "refresh" && response["renewed"] != false {
					t.Fatal("explicit refresh extended provider proof")
				}
			}
		})
	}
}
func TestSupabaseLoginRejectsClientIdentityAndDisabledConfig(t *testing.T) {
	configureProof(t, 200)
	h := newHandler(&localTx{}, true)
	for _, body := range []string{`{"access_token":"proof","email":"forged@example.com"}`, `{"access_token":"proof","user_id":"forged"}`, `{"password":"must-not-be-sent"}`} {
		rec := httptest.NewRecorder()
		h.SupabaseLogin(rec, supabaseLoginRequest(body))
		if rec.Code != 400 || len(rec.Result().Cookies()) > 0 {
			t.Fatal("trusted client identity or credentials")
		}
	}
	t.Setenv("SUPABASE_URL", "")
	rec := httptest.NewRecorder()
	h.SupabaseConfig(rec, httptest.NewRequest("GET", "/auth/supabase/config", nil))
	if strings.Contains(rec.Body.String(), "publishable_key") || !strings.Contains(rec.Body.String(), `"enabled":false`) {
		t.Fatal("invalid disabled config")
	}
	rec = httptest.NewRecorder()
	h.SupabaseLogin(rec, supabaseLoginRequest(`{}`))
	if rec.Code != 404 {
		t.Fatal("unconfigured adapter enabled")
	}
}

// Initial login has no existing session/CSRF cookie. The request must still be
// JSON (non-simple in browsers) and contain exactly one complete JSON value.
func supabaseLoginRequest(body string) *http.Request {
	request := httptest.NewRequest("POST", "/auth/supabase", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json; charset=utf-8")
	request.Header.Set("Origin", "http://example.com")
	return request
}

func TestSupabaseLoginRejectsFormAndTrailingJSONBeforeProof(t *testing.T) {
	for _, tc := range []struct {
		name, mediaType, suffix string
		want                    int
	}{
		{"cross-origin text form", "text/plain", "=x\r\n", 415},
		{"urlencoded form", "application/x-www-form-urlencoded", "", 415},
		{"missing media type", "", "", 415},
		{"invalid media type", "application/json; charset", "", 415},
		{"second JSON value", "application/json", "{}", 400},
		{"trailing form garbage", "application/json", "=x\r\n", 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			proof := configureProof(t, 200)
			calls := 0
			provider := http.DefaultTransport
			http.DefaultTransport = transportFunc(func(r *http.Request) (*http.Response, error) { calls++; return provider.RoundTrip(r) })
			tx := &localTx{}
			h := newHandler(tx, true)
			request := supabaseLoginRequest(`{"access_token":"` + proof + `"}` + tc.suffix)
			request.Header.Set("Origin", "https://evil.example")
			if tc.mediaType == "" {
				request.Header.Del("Content-Type")
			} else {
				request.Header.Set("Content-Type", tc.mediaType)
			}
			rec := httptest.NewRecorder()
			h.SupabaseLogin(rec, request)
			if rec.Code != tc.want {
				t.Errorf("status %d want %d", rec.Code, tc.want)
			}
			if len(rec.Result().Cookies()) != 0 {
				t.Error("unsafe login set native cookies")
			}
			if calls != 0 {
				t.Error("unsafe login reached provider verification")
			}
			if len(tx.events) != 0 {
				t.Error("unsafe login touched local transaction")
			}
		})
	}
}

func TestSupabaseLoginAllowsSameOriginJSONCharset(t *testing.T) {
	proof := configureProof(t, 200)
	tx := &localTx{}
	h := newHandler(tx, true)
	request := supabaseLoginRequest(`{"access_token":"` + proof + `"} ` + "\n\t")
	rec := httptest.NewRecorder()
	h.SupabaseLogin(rec, request)
	if rec.Code != 200 || !tx.committed || len(rec.Result().Cookies()) != 3 {
		t.Fatalf("legitimate JSON login rejected: %d", rec.Code)
	}
}

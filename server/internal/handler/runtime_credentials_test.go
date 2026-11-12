package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jerry-halo2026/morchat.co/server/internal/gateway"
	"github.com/jerry-halo2026/morchat.co/server/internal/util/secretbox"
)

// These tests drive the real handler against a real database and a fake
// new-api. That combination is the point: the interesting failures here are
// "which row is live after a rotation", "did an unconfigured deployment write
// anything", and "did the key reach a log line" — none of which a mocked
// repository layer can answer honestly.

const credentialTestServerSecret = "credential-test-server-secret"

const credentialTestAdmin = "gateway-admin-token"

// credentialFakeGateway is a stand-in new-api admin API. It records what the
// handler asked it to do so the tests can assert on gateway-side state (the
// only state a leaked key would actually live in).
type credentialFakeGateway struct {
	mu        sync.Mutex
	usernames map[string]int64
	passwords map[int64]string
	tokens    map[int64]string
	live      map[int64]string
	revoked   []int64
	minted    []string
	nextID    int64
	// mintError, when set, makes POST /api/token/ answer 400 with that message.
	// Used to prove an upstream error that echoes a key-shaped string is
	// redacted before it reaches a log.
	mintError string
	// failMint makes POST /api/token/ answer 500 (gateway unavailable).
	failMint bool
}

func newCredentialFakeGateway(t *testing.T) (*credentialFakeGateway, *httptest.Server) {
	t.Helper()
	fake := &credentialFakeGateway{
		usernames: map[string]int64{},
		passwords: map[int64]string{},
		tokens:    map[int64]string{},
		live:      map[int64]string{},
		nextID:    500,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/user/", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"success":false}`, http.StatusBadRequest)
			return
		}
		// The client re-derives each gateway login's password and resets it through
		// this route, so the fake has to accept a PUT and remember the value.
		if r.Method == http.MethodPut {
			fake.mu.Lock()
			fake.passwords[body.ID] = body.Password
			fake.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"success":true}`)
			return
		}
		fake.mu.Lock()
		defer fake.mu.Unlock()
		if id, ok := fake.usernames[body.Username]; ok {
			// new-api answers 200 with success=false for a duplicate login.
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"success":false,"message":"user %d exists"}`, id)
			return
		}
		fake.nextID++
		fake.usernames[body.Username] = fake.nextID
		fake.passwords[fake.nextID] = body.Password
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"success":true,"data":{"id":%d,"username":%q}}`, fake.nextID, body.Username)
	})
	mux.HandleFunc("/api/user/login", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"success":false}`, http.StatusBadRequest)
			return
		}
		fake.mu.Lock()
		id, ok := fake.usernames[body.Username]
		stored := fake.passwords[id]
		fake.mu.Unlock()
		if !ok || (stored != "" && stored != body.Password) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprint(w, `{"success":false,"message":"invalid password"}`)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"success":true,"data":{"id":%d,"access_token":"utok-%d"}}`, id, id)
	})
	mux.HandleFunc("/api/user/search", func(w http.ResponseWriter, r *http.Request) {
		keyword := r.URL.Query().Get("keyword")
		fake.mu.Lock()
		defer fake.mu.Unlock()
		id, ok := fake.usernames[keyword]
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"success":true,"data":{"items":[],"total":0}}`)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"success":true,"data":{"items":[{"id":%d,"username":%q}],"total":1}}`, id, keyword)
	})
	mux.HandleFunc("/api/token/", func(w http.ResponseWriter, r *http.Request) {
		fake.mu.Lock()
		defer fake.mu.Unlock()
		switch r.Method {
		case http.MethodPost:
			var body struct {
				Name          string `json:"name"`
				ModelLimits   string `json:"model_limits"`
				ExpiredTime   int64  `json:"expired_time"`
				ModelLimitsOn bool   `json:"model_limits_enabled"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, `{"success":false}`, http.StatusBadRequest)
				return
			}
			if fake.failMint {
				http.Error(w, `{"success":false,"message":"down"}`, http.StatusInternalServerError)
				return
			}
			if fake.mintError != "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				_, _ = fmt.Fprintf(w, `{"success":false,"message":%q}`, fake.mintError)
				return
			}
			fake.nextID++
			key := fmt.Sprintf("sk-gw%s%04d", strings.Repeat("x", 24), fake.nextID)
			fake.tokens[fake.nextID] = body.Name
			fake.live[fake.nextID] = key
			fake.minted = append(fake.minted, body.Name)
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"success":true,"data":{"id":%d,"name":%q,"key":%q}}`, fake.nextID, body.Name, key)
		case http.MethodDelete:
			var id int64
			_, _ = fmt.Sscanf(strings.TrimPrefix(r.URL.Path, "/api/token/"), "%d", &id)
			if _, ok := fake.live[id]; !ok {
				http.Error(w, `{"success":false,"message":"not found"}`, http.StatusNotFound)
				return
			}
			delete(fake.live, id)
			fake.revoked = append(fake.revoked, id)
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"success":true}`)
		default:
			http.Error(w, `{"success":false}`, http.StatusMethodNotAllowed)
		}
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return fake, srv
}

func (f *credentialFakeGateway) liveCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.live)
}

func (f *credentialFakeGateway) revokedCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.revoked)
}

// credentialTestAPI builds the endpoint set over the shared test handler with a
// real secretbox. Rows created by the test are removed afterwards so one test
// cannot make another's "not configured" assertion fail.
func credentialTestAPI(t *testing.T, srv *httptest.Server, configure bool) *RuntimeCredentialAPI {
	t.Helper()
	if testHandler == nil || testPool == nil {
		t.Skip("handler test database not available")
	}
	box, err := secretbox.New(bytes.Repeat([]byte{0x5a}, secretbox.KeySize))
	if err != nil {
		t.Fatalf("secretbox.New: %v", err)
	}
	previous := testHandler.VCSSecretBox
	testHandler.VCSSecretBox = box
	t.Cleanup(func() { testHandler.VCSSecretBox = previous })
	t.Cleanup(func() { deleteRuntimeCredentialRows(t) })
	deleteRuntimeCredentialRows(t)

	cfg := gateway.Config{Timeout: 2 * time.Second}
	if configure {
		cfg.BaseURL = srv.URL
		cfg.AdminToken = credentialTestAdmin
		cfg.DefaultModels = []string{"claude-sonnet-4-5"}
		cfg.DefaultQuota = 4242
		// Required since gateway logins are derived from it; without one every
		// credential call answers gateway_not_configured.
		cfg.ServerSecret = credentialTestServerSecret
	}
	return NewRuntimeCredentialAPI(testHandler, gateway.New(cfg))
}

func deleteRuntimeCredentialRows(t *testing.T) {
	t.Helper()
	if testPool == nil {
		return
	}
	if _, err := testPool.Exec(context.Background(),
		`DELETE FROM public.gateway_credentials WHERE user_id IN ($1, $2)`,
		testUserID, credentialOtherUserUUID); err != nil {
		t.Fatalf("cleanup gateway_credentials: %v", err)
	}
}

// credentialOtherUserUUID is the second account the isolation test uses. It has
// a fixed id so the row is created once and the credential cleanup can name it
// without creating anything as a side effect.
const credentialOtherUserUUID = "aaaa1111-2222-4333-8444-555555555555"

func credentialOtherUserID(t *testing.T) string {
	t.Helper()
	const email = "runtime-credential-other@multica.ai"
	var existing string
	_ = testPool.QueryRow(context.Background(), `SELECT id::text FROM "user" WHERE email = $1`, email).Scan(&existing)
	if existing != "" {
		return existing
	}
	if _, err := testPool.Exec(context.Background(),
		`INSERT INTO "user" (id, name, email) VALUES ($1, 'Runtime Credential Other', $2)
		 ON CONFLICT (id) DO NOTHING`, credentialOtherUserUUID, email); err != nil {
		t.Fatalf("insert second user: %v", err)
	}
	return credentialOtherUserUUID
}

func credentialRequest(t *testing.T, method, target, userID string, body any) *http.Request {
	t.Helper()
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}
		reader = bytes.NewReader(encoded)
	}
	req := httptest.NewRequest(method, target, reader)
	req.Header.Set("X-User-ID", userID)
	req.Header.Set("Content-Type", "application/json")
	return req
}

type mintedCredential struct {
	BaseURL      string   `json:"base_url"`
	Models       []string `json:"models"`
	APIKey       string   `json:"api_key"`
	APIKeySuffix string   `json:"api_key_suffix"`
	ExpiresAt    *string  `json:"expires_at"`
	Source       string   `json:"source"`
	Provider     string   `json:"provider"`
	TokenName    string   `json:"token_name"`
	Rotated      bool     `json:"rotated"`
}

type credentialStatus struct {
	Configured   bool     `json:"configured"`
	BaseURL      string   `json:"base_url"`
	Models       []string `json:"models"`
	APIKey       string   `json:"api_key"`
	APIKeySuffix string   `json:"api_key_suffix"`
	Source       string   `json:"source"`
	Status       string   `json:"status"`
}

func decodeCredential[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var out T
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response %q: %v", rec.Body.String(), err)
	}
	return out
}

// captureLogs swaps the process logger for the duration of one test and returns
// the raw buffer. Log assertions are the only way to prove the handler does not
// emit key material, because a log line is invisible to every response check.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	buf := &bytes.Buffer{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return buf
}

func TestRuntimeCredentialsMintReturnsKeyExactlyOnce(t *testing.T) {
	fake, srv := newCredentialFakeGateway(t)
	api := credentialTestAPI(t, srv, true)
	logs := captureLogs(t)

	rec := httptest.NewRecorder()
	api.Create(rec, credentialRequest(t, http.MethodPost, "/api/runtime/credentials", testUserID,
		map[string]any{"device_id": "device-mint"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("POST status = %d, body = %s", rec.Code, rec.Body.String())
	}
	minted := decodeCredential[mintedCredential](t, rec)
	if !strings.HasPrefix(minted.APIKey, "sk-") {
		t.Fatalf("api_key = %q, want a gateway key", minted.APIKey)
	}
	if minted.APIKeySuffix != minted.APIKey[len(minted.APIKey)-4:] {
		t.Fatalf("api_key_suffix = %q, want the last 4 characters of the key", minted.APIKeySuffix)
	}
	if minted.ExpiresAt != nil {
		t.Fatalf("expires_at = %v, want null (the credential is long-lived)", *minted.ExpiresAt)
	}
	if !strings.Contains(rec.Body.String(), `"expires_at":null`) {
		t.Fatalf("response omits expires_at:null: %s", rec.Body.String())
	}
	if minted.Source != "company" || minted.Provider != "newapi" {
		t.Fatalf("source/provider = %q/%q", minted.Source, minted.Provider)
	}
	if minted.BaseURL != srv.URL+"/v1" {
		t.Fatalf("base_url = %q, want %q (OpenAI-compatible root)", minted.BaseURL, srv.URL+"/v1")
	}
	if len(minted.Models) != 1 || minted.Models[0] != "claude-sonnet-4-5" {
		t.Fatalf("models = %v, want the configured default", minted.Models)
	}
	if !strings.HasPrefix(minted.TokenName, "mul:") {
		t.Fatalf("token_name = %q, want mul:<uid8>:<dev8>", minted.TokenName)
	}
	if minted.Rotated {
		t.Fatal("first mint must not report rotated")
	}
	if fake.liveCount() != 1 {
		t.Fatalf("gateway live tokens = %d, want 1", fake.liveCount())
	}

	// The stored column is ciphertext: neither the key nor a prefix of it.
	var cipher []byte
	if err := testPool.QueryRow(context.Background(),
		`SELECT secret_cipher FROM public.gateway_credentials WHERE user_id = $1 AND device_id = 'device-mint' AND status = 'active'`,
		testUserID).Scan(&cipher); err != nil {
		t.Fatalf("read secret_cipher: %v", err)
	}
	if len(cipher) == 0 {
		t.Fatal("secret_cipher is empty")
	}
	if bytes.Contains(cipher, []byte(minted.APIKey)) {
		t.Fatal("secret_cipher contains the plaintext key")
	}

	// Reads return the mask and the suffix, never the key.
	status := httptest.NewRecorder()
	api.Get(status, credentialRequest(t, http.MethodGet, "/api/runtime/credentials?device_id=device-mint", testUserID, nil))
	if status.Code != http.StatusOK {
		t.Fatalf("GET status = %d, body = %s", status.Code, status.Body.String())
	}
	view := decodeCredential[credentialStatus](t, status)
	if !view.Configured || view.Status != "active" {
		t.Fatalf("GET view = %+v, want configured active", view)
	}
	if view.APIKey != "***"+minted.APIKeySuffix {
		t.Fatalf("GET api_key = %q, want masked suffix", view.APIKey)
	}
	if strings.Contains(status.Body.String(), minted.APIKey) {
		t.Fatalf("GET body leaks the key: %s", status.Body.String())
	}

	// And no log line anywhere carries it.
	if strings.Contains(logs.String(), minted.APIKey) {
		t.Fatalf("log output leaks the key: %s", logs.String())
	}
}

func TestRuntimeCredentialsRotatesAndRevokesPreviousToken(t *testing.T) {
	fake, srv := newCredentialFakeGateway(t)
	api := credentialTestAPI(t, srv, true)
	captureLogs(t)

	first := httptest.NewRecorder()
	api.Create(first, credentialRequest(t, http.MethodPost, "/api/runtime/credentials", testUserID,
		map[string]any{"device_id": "device-rotate"}))
	if first.Code != http.StatusOK {
		t.Fatalf("first POST status = %d, body = %s", first.Code, first.Body.String())
	}
	original := decodeCredential[mintedCredential](t, first)

	second := httptest.NewRecorder()
	api.Create(second, credentialRequest(t, http.MethodPost, "/api/runtime/credentials", testUserID,
		map[string]any{"device_id": "device-rotate"}))
	if second.Code != http.StatusOK {
		t.Fatalf("second POST status = %d, body = %s", second.Code, second.Body.String())
	}
	rotated := decodeCredential[mintedCredential](t, second)
	if rotated.APIKey == original.APIKey {
		t.Fatal("rotation returned the same key; a rotated key must be new")
	}
	if !rotated.Rotated {
		t.Fatal("second mint must report rotated=true")
	}
	if fake.revokedCount() != 1 {
		t.Fatalf("gateway revoked %d tokens, want exactly 1 (the previous one)", fake.revokedCount())
	}
	if fake.liveCount() != 1 {
		t.Fatalf("gateway live tokens = %d, want 1 (old revoked, new minted)", fake.liveCount())
	}

	var active, revoked int
	if err := testPool.QueryRow(context.Background(), `
		SELECT count(*) FILTER (WHERE status = 'active'), count(*) FILTER (WHERE status = 'revoked')
		FROM public.gateway_credentials WHERE user_id = $1 AND device_id = 'device-rotate'`,
		testUserID).Scan(&active, &revoked); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if active != 1 || revoked != 1 {
		t.Fatalf("rows active/revoked = %d/%d, want 1/1", active, revoked)
	}
}

func TestRuntimeCredentialsUnconfiguredReturns503AndWritesNothing(t *testing.T) {
	_, srv := newCredentialFakeGateway(t)
	api := credentialTestAPI(t, srv, false)

	rec := httptest.NewRecorder()
	api.Create(rec, credentialRequest(t, http.MethodPost, "/api/runtime/credentials", testUserID,
		map[string]any{"device_id": "device-unconfigured"}))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("POST status = %d, want 503; body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"code":"gateway_not_configured"`) {
		t.Fatalf("body = %s, want code gateway_not_configured", rec.Body.String())
	}

	read := httptest.NewRecorder()
	api.Get(read, credentialRequest(t, http.MethodGet, "/api/runtime/credentials?device_id=device-unconfigured", testUserID, nil))
	if read.Code != http.StatusServiceUnavailable {
		t.Fatalf("GET status = %d, want 503", read.Code)
	}
	del := httptest.NewRecorder()
	api.Delete(del, credentialRequest(t, http.MethodDelete, "/api/runtime/credentials?device_id=device-unconfigured", testUserID, nil))
	if del.Code != http.StatusServiceUnavailable {
		t.Fatalf("DELETE status = %d, want 503", del.Code)
	}

	var rows int
	if err := testPool.QueryRow(context.Background(),
		`SELECT count(*) FROM public.gateway_credentials WHERE device_id = 'device-unconfigured'`).Scan(&rows); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if rows != 0 {
		t.Fatalf("unconfigured gateway wrote %d rows, want 0", rows)
	}
}

func TestRuntimeCredentialsAreIsolatedBetweenUsers(t *testing.T) {
	fake, srv := newCredentialFakeGateway(t)
	api := credentialTestAPI(t, srv, true)
	captureLogs(t)
	other := credentialOtherUserID(t)

	owned := httptest.NewRecorder()
	api.Create(owned, credentialRequest(t, http.MethodPost, "/api/runtime/credentials", testUserID,
		map[string]any{"device_id": "device-shared"}))
	if owned.Code != http.StatusOK {
		t.Fatalf("owner POST status = %d, body = %s", owned.Code, owned.Body.String())
	}
	ownerCredential := decodeCredential[mintedCredential](t, owned)

	// The second user asks about the very same device id. Isolation is the
	// user_id in the WHERE clause, not a check the handler has to remember.
	peek := httptest.NewRecorder()
	api.Get(peek, credentialRequest(t, http.MethodGet, "/api/runtime/credentials?device_id=device-shared", other, nil))
	if peek.Code != http.StatusOK {
		t.Fatalf("other GET status = %d, body = %s", peek.Code, peek.Body.String())
	}
	peeked := decodeCredential[credentialStatus](t, peek)
	if peeked.Configured {
		t.Fatalf("other user sees a credential: %+v", peeked)
	}
	if strings.Contains(peek.Body.String(), ownerCredential.APIKeySuffix) {
		t.Fatalf("other user can read the owner's key suffix: %s", peek.Body.String())
	}

	// And deleting must not touch the owner's live credential.
	del := httptest.NewRecorder()
	api.Delete(del, credentialRequest(t, http.MethodDelete, "/api/runtime/credentials?device_id=device-shared", other, nil))
	if del.Code != http.StatusOK {
		t.Fatalf("other DELETE status = %d, body = %s", del.Code, del.Body.String())
	}
	var ownerActive int
	if err := testPool.QueryRow(context.Background(),
		`SELECT count(*) FROM public.gateway_credentials WHERE user_id = $1 AND device_id = 'device-shared' AND status = 'active'`,
		testUserID).Scan(&ownerActive); err != nil {
		t.Fatalf("count owner rows: %v", err)
	}
	if ownerActive != 1 {
		t.Fatalf("owner active rows = %d after another user's delete, want 1", ownerActive)
	}
	if fake.liveCount() != 1 {
		t.Fatalf("gateway live tokens = %d after another user's delete, want 1", fake.liveCount())
	}

	// The other user mints their own credential under their own row.
	own := httptest.NewRecorder()
	api.Create(own, credentialRequest(t, http.MethodPost, "/api/runtime/credentials", other,
		map[string]any{"device_id": "device-shared"}))
	if own.Code != http.StatusOK {
		t.Fatalf("other POST status = %d, body = %s", own.Code, own.Body.String())
	}
	if decodeCredential[mintedCredential](t, own).APIKey == ownerCredential.APIKey {
		t.Fatal("two users received the same key")
	}
}

func TestRuntimeCredentialsDeleteRevokesAndMasksAfterwards(t *testing.T) {
	fake, srv := newCredentialFakeGateway(t)
	api := credentialTestAPI(t, srv, true)
	captureLogs(t)

	mint := httptest.NewRecorder()
	api.Create(mint, credentialRequest(t, http.MethodPost, "/api/runtime/credentials", testUserID,
		map[string]any{"device_id": "device-revoke"}))
	if mint.Code != http.StatusOK {
		t.Fatalf("POST status = %d, body = %s", mint.Code, mint.Body.String())
	}
	key := decodeCredential[mintedCredential](t, mint).APIKey

	del := httptest.NewRecorder()
	api.Delete(del, credentialRequest(t, http.MethodDelete, "/api/runtime/credentials?device_id=device-revoke", testUserID, nil))
	if del.Code != http.StatusOK {
		t.Fatalf("DELETE status = %d, body = %s", del.Code, del.Body.String())
	}
	if !strings.Contains(del.Body.String(), `"revoked":1`) {
		t.Fatalf("DELETE body = %s, want revoked:1", del.Body.String())
	}
	if fake.liveCount() != 0 {
		t.Fatalf("gateway still has %d live tokens after delete", fake.liveCount())
	}
	if strings.Contains(del.Body.String(), key) {
		t.Fatalf("DELETE body leaks the key: %s", del.Body.String())
	}

	after := httptest.NewRecorder()
	api.Get(after, credentialRequest(t, http.MethodGet, "/api/runtime/credentials?device_id=device-revoke", testUserID, nil))
	if after.Code != http.StatusOK {
		t.Fatalf("GET after DELETE status = %d", after.Code)
	}
	if decodeCredential[credentialStatus](t, after).Configured {
		t.Fatal("GET reports a credential after DELETE")
	}
	var active int
	if err := testPool.QueryRow(context.Background(),
		`SELECT count(*) FROM public.gateway_credentials WHERE user_id = $1 AND device_id = 'device-revoke' AND status = 'active'`,
		testUserID).Scan(&active); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if active != 0 {
		t.Fatalf("active rows after DELETE = %d, want 0", active)
	}
}

func TestRuntimeCredentialsGatewayErrorIsRedactedBeforeLogging(t *testing.T) {
	fake, srv := newCredentialFakeGateway(t)
	api := credentialTestAPI(t, srv, true)
	logs := captureLogs(t)

	// The upstream echoes a key-shaped string in its rejection message. Nothing
	// that reaches the log may still look like a gateway key.
	leaked := "sk-leaked000000000000000000000000000000000000000"
	fake.mu.Lock()
	fake.mintError = "rejected: " + leaked
	fake.mu.Unlock()

	rec := httptest.NewRecorder()
	api.Create(rec, credentialRequest(t, http.MethodPost, "/api/runtime/credentials", testUserID,
		map[string]any{"device_id": "device-error"}))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("POST status = %d, want 502; body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"code":"gateway_rejected"`) {
		t.Fatalf("body = %s, want code gateway_rejected", rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), leaked) {
		t.Fatalf("response leaks the upstream error text: %s", rec.Body.String())
	}
	if strings.Contains(logs.String(), leaked) {
		t.Fatalf("log output leaks the upstream error text: %s", logs.String())
	}
	if !strings.Contains(logs.String(), "REDACTED") {
		t.Fatalf("log output does not show the redaction marker, so the sk- rule may not have run: %s", logs.String())
	}

	var rows int
	if err := testPool.QueryRow(context.Background(),
		`SELECT count(*) FROM public.gateway_credentials WHERE device_id = 'device-error'`).Scan(&rows); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if rows != 0 {
		t.Fatalf("failed mint wrote %d rows, want 0", rows)
	}
}

func TestRuntimeCredentialsRequiresAValidRequest(t *testing.T) {
	_, srv := newCredentialFakeGateway(t)
	api := credentialTestAPI(t, srv, true)

	missing := httptest.NewRecorder()
	api.Create(missing, credentialRequest(t, http.MethodPost, "/api/runtime/credentials", testUserID,
		map[string]any{"models": []string{"m"}}))
	if missing.Code != http.StatusBadRequest {
		t.Fatalf("POST without device_id status = %d, want 400; body = %s", missing.Code, missing.Body.String())
	}

	anonymous := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/runtime/credentials", strings.NewReader(`{"device_id":"d"}`))
	api.Create(anonymous, req)
	if anonymous.Code != http.StatusUnauthorized {
		t.Fatalf("POST without a user status = %d, want 401; body = %s", anonymous.Code, anonymous.Body.String())
	}
}

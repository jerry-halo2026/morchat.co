package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeGateway is a minimal but faithful new-api admin API. It exists so the
// client is tested against HTTP semantics (status codes, the envelope shape,
// duplicate-login behaviour) rather than against a Go interface that would
// happily agree with whatever the client does.
type fakeGateway struct {
	mu        sync.Mutex
	admin     string
	nextUser  int64
	usernames map[string]int64
	tokens    map[int64]*fakeToken
	nextToken int64
	mintCalls int
	// rejectMint, when non-empty, makes POST /api/token/ answer 400 with that
	// message: the "upstream echoes key-shaped text in an error" case.
	rejectMint string
	// omitMintBody makes POST /api/token/ answer {"success":true} with no data,
	// which is what older new-api builds do.
	omitMintBody bool
}

type fakeToken struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Key  string `json:"key"`
}

func newFakeGateway(t *testing.T, admin string) (*fakeGateway, *httptest.Server) {
	t.Helper()
	f := &fakeGateway{
		admin:     admin,
		nextUser:  1000,
		usernames: map[string]int64{},
		tokens:    map[int64]*fakeToken{},
		nextToken: 100,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/user/", f.handleUser)
	mux.HandleFunc("/api/user/search", f.handleUserSearch)
	mux.HandleFunc("/api/token/", f.handleToken)
	mux.HandleFunc("/api/token/search", f.handleTokenSearch)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return f, srv
}

// handleToken dispatches the two methods that share /api/token/{id}: create is
// POST on the collection, revoke is DELETE on a member.
func (f *fakeGateway) handleToken(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		f.handleTokenCreate(w, r)
	case http.MethodDelete:
		f.handleTokenDelete(w, r)
	default:
		http.Error(w, `{"success":false,"message":"method"}`, http.StatusMethodNotAllowed)
	}
}

func (f *fakeGateway) authorized(r *http.Request) bool {
	return r.Header.Get("Authorization") == "Bearer "+f.admin
}

func (f *fakeGateway) handleUser(w http.ResponseWriter, r *http.Request) {
	if !f.authorized(r) {
		http.Error(w, `{"success":false,"message":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, `{"success":false,"message":"method"}`, http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"success":false,"message":"bad json"}`, http.StatusBadRequest)
		return
	}
	if !strings.HasPrefix(body.Username, "morechat:") || len(body.Password) == 0 {
		http.Error(w, `{"success":false,"message":"bad username"}`, http.StatusBadRequest)
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	// A duplicate login answers 200 with success=false: that is what new-api
	// does, and it is exactly what the client's search fallback exists for. A
	// second create for the same name must NOT allocate a new id.
	if existing, ok := f.usernames[body.Username]; ok {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"success":false,"message":"user %d exists"}`, existing)
		return
	}
	f.nextUser++
	f.usernames[body.Username] = f.nextUser
	payload, _ := json.Marshal(map[string]any{
		"success": true,
		"data":    map[string]any{"id": f.nextUser, "username": body.Username},
	})
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(payload)
}

func (f *fakeGateway) handleUserSearch(w http.ResponseWriter, r *http.Request) {
	if !f.authorized(r) {
		http.Error(w, `{"success":false}`, http.StatusUnauthorized)
		return
	}
	keyword := r.URL.Query().Get("keyword")
	f.mu.Lock()
	defer f.mu.Unlock()
	// The real endpoint is a keyword search, so it deliberately returns a
	// near-miss alongside the exact match: the client must filter again.
	items := []map[string]any{{"id": 9, "username": keyword + "-not-me"}}
	if id, ok := f.usernames[keyword]; ok {
		items = append(items, map[string]any{"id": id, "username": keyword})
	}
	payload, _ := json.Marshal(map[string]any{
		"success": true,
		"data":    map[string]any{"items": items, "total": len(items)},
	})
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(payload)
}

func (f *fakeGateway) handleTokenCreate(w http.ResponseWriter, r *http.Request) {
	if !f.authorized(r) {
		http.Error(w, `{"success":false}`, http.StatusUnauthorized)
		return
	}
	var body struct {
		Name               string `json:"name"`
		RemainQuota        int64  `json:"remain_quota"`
		ExpiredTime        int64  `json:"expired_time"`
		UnlimitedQuota     bool   `json:"unlimited_quota"`
		ModelLimits        string `json:"model_limits"`
		ModelLimitsEnabled bool   `json:"model_limits_enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"success":false,"message":"bad json"}`, http.StatusBadRequest)
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.mintCalls++
	if f.rejectMint != "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = fmt.Fprintf(w, `{"success":false,"message":%q}`, f.rejectMint)
		return
	}
	if !regexp.MustCompile(`^mul:[0-9a-f]{8}:[0-9a-f]{8}$`).MatchString(body.Name) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"success":false,"message":"bad token name"}`)
		return
	}
	if body.ExpiredTime != -1 {
		// The credential is long-lived by design; a token with an expiry would
		// silently break every CLI at expiry time.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"success":false,"message":"token must not expire"}`)
		return
	}
	f.nextToken++
	token := &fakeToken{ID: f.nextToken, Name: body.Name, Key: fakeKey(f.nextToken)}
	f.tokens[token.ID] = token
	w.Header().Set("Content-Type", "application/json")
	if f.omitMintBody {
		fmt.Fprint(w, `{"success":true,"message":""}`)
		return
	}
	payload, _ := json.Marshal(map[string]any{
		"success": true,
		"data":    map[string]any{"id": token.ID, "name": token.Name, "key": token.Key},
	})
	_, _ = w.Write(payload)
}

func (f *fakeGateway) handleTokenSearch(w http.ResponseWriter, r *http.Request) {
	if !f.authorized(r) {
		http.Error(w, `{"success":false}`, http.StatusUnauthorized)
		return
	}
	keyword := r.URL.Query().Get("keyword")
	f.mu.Lock()
	defer f.mu.Unlock()
	items := make([]map[string]any, 0, 1)
	for _, token := range f.tokens {
		if token.Name == keyword {
			items = append(items, map[string]any{"id": token.ID, "name": token.Name, "key": token.Key})
		}
	}
	payload, _ := json.Marshal(map[string]any{
		"success": true,
		"data":    map[string]any{"items": items, "total": len(items)},
	})
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(payload)
}

func (f *fakeGateway) handleTokenDelete(w http.ResponseWriter, r *http.Request) {
	if !f.authorized(r) {
		http.Error(w, `{"success":false}`, http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(strings.TrimPrefix(r.URL.Path, "/api/token/"), 10, 64)
	if err != nil {
		http.Error(w, `{"success":false,"message":"bad id"}`, http.StatusBadRequest)
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.tokens[id]; !ok {
		http.Error(w, `{"success":false,"message":"not found"}`, http.StatusNotFound)
		return
	}
	delete(f.tokens, id)
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, `{"success":true,"message":""}`)
}

func (f *fakeGateway) live() []fakeToken {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]fakeToken, 0, len(f.tokens))
	for _, token := range f.tokens {
		out = append(out, *token)
	}
	return out
}

func fakeKey(id int64) string {
	// 48 characters after "sk-", which is what new-api issues and what makes the
	// value match pkg/redact's sk- rule.
	return "sk-test" + strings.Repeat("0", 38) + strconv.FormatInt(id, 10)
}

const (
	testAdminToken = "admin-token-for-tests"
	testUserUUID   = "8f14e45f-ceea-467a-9575-4e0e0c9d7b1a"
)

func testClient(t *testing.T, baseURL string) *Client {
	t.Helper()
	return New(Config{
		BaseURL:       baseURL,
		AdminToken:    testAdminToken,
		DefaultModels: []string{"claude-sonnet-4-5", "gpt-5"},
		DefaultQuota:  1234,
		Timeout:       2 * time.Second,
	})
}

func TestClientConfiguredRequiresBothValues(t *testing.T) {
	if New(Config{}).Configured() {
		t.Fatal("empty config must not be configured")
	}
	if New(Config{BaseURL: "https://relay.example.com"}).Configured() {
		t.Fatal("missing admin token must not be configured")
	}
	if New(Config{AdminToken: "x"}).Configured() {
		t.Fatal("missing base url must not be configured")
	}
	client := New(Config{BaseURL: "https://relay.example.com/", AdminToken: "x"})
	if !client.Configured() {
		t.Fatal("both values set must be configured")
	}
	if got, want := client.BaseURL(), "https://relay.example.com"; got != want {
		t.Fatalf("BaseURL() = %q, want %q (trailing slash trimmed)", got, want)
	}
	if got, want := client.OpenAIBaseURL(), "https://relay.example.com/v1"; got != want {
		t.Fatalf("OpenAIBaseURL() = %q, want %q", got, want)
	}
}

func TestFromEnvReadsNewAPIVars(t *testing.T) {
	t.Setenv(EnvBaseURL, "https://relay.example.com")
	t.Setenv(EnvAdminToken, "tok")
	t.Setenv(EnvDefaultModels, "m1, m2 ,m1")
	t.Setenv(EnvDefaultQuota, "777")
	client := FromEnv()
	if !client.Configured() {
		t.Fatal("FromEnv with both vars set must be configured")
	}
	if got := client.DefaultQuota(); got != 777 {
		t.Fatalf("DefaultQuota() = %d, want 777", got)
	}
	if got := client.DefaultModels(); len(got) != 2 || got[0] != "m1" || got[1] != "m2" {
		t.Fatalf("DefaultModels() = %v, want [m1 m2]", got)
	}
}

func TestTokenNameEncodesUserAndDevice(t *testing.T) {
	name := TokenName(testUserUUID, "device-abc")
	if !regexp.MustCompile(`^mul:8f14e45f:[0-9a-f]{8}$`).MatchString(name) {
		t.Fatalf("TokenName() = %q, want mul:<uid8>:<dev8>", name)
	}
	if again := TokenName(testUserUUID, "device-abc"); again != name {
		t.Fatalf("TokenName must be deterministic: %q vs %q", name, again)
	}
	if other := TokenName(testUserUUID, "device-xyz"); other == name {
		t.Fatal("a different device must get a different token name")
	}
}

func TestEnsureUserIsIdempotentAcrossDuplicateAnswers(t *testing.T) {
	fake, srv := newFakeGateway(t, testAdminToken)
	client := testClient(t, srv.URL)

	first, err := client.EnsureUser(context.Background(), testUserUUID)
	if err != nil {
		t.Fatalf("EnsureUser first (create path): %v", err)
	}
	second, err := client.EnsureUser(context.Background(), testUserUUID)
	if err != nil {
		t.Fatalf("EnsureUser second (duplicate -> search path): %v", err)
	}
	if first.ID == 0 || first.ID != second.ID {
		t.Fatalf("EnsureUser ids = %d/%d, want the same positive id (create answers success=false on duplicate)", first.ID, second.ID)
	}
	if want := "morechat:" + testUserUUID; first.Username != want {
		t.Fatalf("username = %q, want %q", first.Username, want)
	}
	if got := len(fake.usernames); got != 1 {
		t.Fatalf("gateway has %d accounts, want exactly 1 (no double create)", got)
	}
}

func TestEnsureUserRejectsUnauthorizedAdmin(t *testing.T) {
	_, srv := newFakeGateway(t, testAdminToken)
	client := New(Config{BaseURL: srv.URL, AdminToken: "wrong", Timeout: 2 * time.Second})
	if _, err := client.EnsureUser(context.Background(), testUserUUID); !errors.Is(err, ErrGatewayRejected) {
		t.Fatalf("EnsureUser with wrong admin token: err = %v, want ErrGatewayRejected", err)
	}
}

func TestMintTokenSendsAllowlistAndNeverExpires(t *testing.T) {
	fake, srv := newFakeGateway(t, testAdminToken)
	client := testClient(t, srv.URL)

	minted, err := client.MintToken(context.Background(), testUserUUID, "device-abc",
		[]string{" claude-sonnet-4-5 ", "gpt-5", "gpt-5", ""}, 4321)
	if err != nil {
		t.Fatalf("MintToken: %v", err)
	}
	if minted.Key == "" || minted.ID == 0 {
		t.Fatalf("MintToken = %+v, want id and key", minted)
	}
	if want := TokenName(testUserUUID, "device-abc"); minted.Name != want {
		t.Fatalf("minted name = %q, want %q", minted.Name, want)
	}
	live := fake.live()
	if len(live) != 1 || live[0].Key != minted.Key {
		t.Fatalf("gateway tokens = %+v, want exactly the minted one", live)
	}
}

func TestMintTokenFallsBackToLookupWhenCreateReturnsNoBody(t *testing.T) {
	fake, srv := newFakeGateway(t, testAdminToken)
	fake.omitMintBody = true
	client := testClient(t, srv.URL)

	minted, err := client.MintToken(context.Background(), testUserUUID, "device-abc", nil, 0)
	if err != nil {
		t.Fatalf("MintToken: %v", err)
	}
	if minted.ID == 0 || minted.Key == "" {
		t.Fatalf("MintToken = %+v, want id and key recovered by exact-name lookup", minted)
	}
}

func TestRevokeTokenIsIdempotent(t *testing.T) {
	fake, srv := newFakeGateway(t, testAdminToken)
	client := testClient(t, srv.URL)

	minted, err := client.MintToken(context.Background(), testUserUUID, "device-abc", nil, 0)
	if err != nil {
		t.Fatalf("MintToken: %v", err)
	}
	if err := client.RevokeToken(context.Background(), strconv.FormatInt(minted.ID, 10)); err != nil {
		t.Fatalf("RevokeToken: %v", err)
	}
	if got := fake.live(); len(got) != 0 {
		t.Fatalf("gateway tokens after revoke = %+v, want none", got)
	}
	// Second revoke: the token is already gone (404) and that is success, because
	// the post-condition "this key no longer works" already holds.
	if err := client.RevokeToken(context.Background(), strconv.FormatInt(minted.ID, 10)); err != nil {
		t.Fatalf("RevokeToken twice: %v", err)
	}
	// An empty id means nothing was minted far enough to have one.
	if err := client.RevokeToken(context.Background(), ""); err != nil {
		t.Fatalf("RevokeToken empty id: %v", err)
	}
}

func TestMintTokenClassifiesRejection(t *testing.T) {
	fake, srv := newFakeGateway(t, testAdminToken)
	// The upstream echoes a key-shaped string in its error text. The client must
	// still classify it as a rejection and must not treat the echo as data.
	fake.rejectMint = "quota exceeded for sk-test00000000000000000000000000000000000000000"
	client := testClient(t, srv.URL)

	_, err := client.MintToken(context.Background(), testUserUUID, "device-abc", nil, 0)
	if !errors.Is(err, ErrGatewayRejected) {
		t.Fatalf("MintToken on 400: err = %v, want ErrGatewayRejected", err)
	}
}

func TestUnavailableGatewayIsClassified(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()
	client := testClient(t, srv.URL)

	if _, err := client.EnsureUser(context.Background(), testUserUUID); !errors.Is(err, ErrGatewayUnavailable) {
		t.Fatalf("EnsureUser on 500: err = %v, want ErrGatewayUnavailable", err)
	}
	if _, err := client.MintToken(context.Background(), testUserUUID, "d", nil, 0); !errors.Is(err, ErrGatewayUnavailable) {
		t.Fatalf("MintToken on 500: err = %v, want ErrGatewayUnavailable", err)
	}
	if err := client.RevokeToken(context.Background(), "5"); !errors.Is(err, ErrGatewayUnavailable) {
		t.Fatalf("RevokeToken on 500: err = %v, want ErrGatewayUnavailable", err)
	}

	// A closed listener is the transport case: retryable, not a rejection.
	dead := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	deadURL := dead.URL
	dead.Close()
	if _, err := testClient(t, deadURL).EnsureUser(context.Background(), "u"); !errors.Is(err, ErrGatewayUnavailable) {
		t.Fatalf("EnsureUser on dead listener: err = %v, want ErrGatewayUnavailable", err)
	}
}

func TestUnconfiguredClientRefusesToDial(t *testing.T) {
	client := New(Config{})
	if _, err := client.EnsureUser(context.Background(), "u"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("EnsureUser: err = %v, want ErrNotConfigured", err)
	}
	if _, err := client.MintToken(context.Background(), "u", "d", nil, 0); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("MintToken: err = %v, want ErrNotConfigured", err)
	}
	if err := client.RevokeToken(context.Background(), "1"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("RevokeToken: err = %v, want ErrNotConfigured", err)
	}
}

package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
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
// duplicate-login behaviour, per-account token scoping) rather than against a Go
// interface that would happily agree with whatever the client does.
//
// Two behaviours are load-bearing:
//
//   - Token routes act on the account the *session* token names, and reject a
//     request whose New-Api-User header disagrees with that account. new-api
//     scopes every token read, mint, reveal and delete this way, so a client that
//     kept minting with the admin token would put the token on the admin.
//   - Field validation failures answer HTTP 200 with success=false, which is what
//     new-api does for an over-long password.
type fakeGateway struct {
	mu          sync.Mutex
	admin       string
	nextUser    int64
	users       map[string]*fakeUser // by username
	nextToken   int64
	tokens      map[int64]*fakeToken
	nextSession int64
	sessions    map[string]*fakeSession // by access token
	mintCalls   int
	loginCalls  int
	tokenCalls  []fakeTokenCall
	// rejectMint, when non-empty, makes POST /api/token/ answer 400 with that
	// message: the "upstream echoes key-shaped text in an error" case.
	rejectMint string
	// omitMintBody makes POST /api/token/ answer {"success":true} with no data,
	// which is what older new-api builds do.
	omitMintBody bool
	// maskKeyReveal makes the reveal route answer the masked key, as a build
	// without a plaintext route would.
	maskKeyReveal bool
}

type fakeUser struct {
	ID       int64
	Username string
	Password string
	// Quota is the account balance the admin quota route credits; a zero balance
	// is what makes a real gateway refuse a call with insufficient_user_quota.
	Quota int64
}

type fakeSession struct {
	Token  string
	UserID int64
}

type fakeToken struct {
	ID     int64  `json:"id"`
	UserID int64  `json:"user_id"`
	Name   string `json:"name"`
	Key    string `json:"key"`
}

// fakeTokenCall is one token-route request as it arrived: which identity
// authorized it and which account it claimed.
type fakeTokenCall struct {
	Method string
	Auth   string
	UserID int64
	Path   string
}

func newFakeGateway(t *testing.T, admin string) (*fakeGateway, *httptest.Server) {
	t.Helper()
	f := &fakeGateway{
		admin:     admin,
		nextUser:  1000,
		users:     map[string]*fakeUser{},
		nextToken: 100,
		tokens:    map[int64]*fakeToken{},
		sessions:  map[string]*fakeSession{},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/user/", f.handleUser)
	mux.HandleFunc("/api/user/search", f.handleUserSearch)
	mux.HandleFunc("/api/user/login", f.handleUserLogin)
	mux.HandleFunc("/api/user/manage", f.handleUserManage)
	mux.HandleFunc("/api/token/search", f.handleTokenSearch)
	mux.HandleFunc("/api/token/", f.handleToken)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return f, srv
}

// handleToken dispatches everything under /api/token/: create and list are on the
// collection, revoke is DELETE on a member, reveal is POST on .../{id}/key.
func (f *fakeGateway) handleToken(w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasSuffix(r.URL.Path, "/key"):
		f.handleTokenKey(w, r)
	case r.Method == http.MethodPost && (r.URL.Path == "/api/token/" || r.URL.Path == "/api/token"):
		f.handleTokenCreate(w, r)
	case r.Method == http.MethodGet:
		f.handleTokenList(w, r)
	case r.Method == http.MethodDelete:
		f.handleTokenDelete(w, r)
	default:
		http.Error(w, `{"success":false,"message":"method"}`, http.StatusMethodNotAllowed)
	}
}

func (f *fakeGateway) adminAuthorized(r *http.Request) bool {
	return r.Header.Get("Authorization") == "Bearer "+f.admin
}

// caller resolves the identity a token-route request acts as. The session token
// decides the account; New-Api-User has to agree with it, and is what the
// gateway actually uses to scope the row. Missing session or a disagreement is a
// 401 — the same shape a stale session produces for real.
func (f *fakeGateway) caller(w http.ResponseWriter, r *http.Request) (int64, bool) {
	auth := r.Header.Get("Authorization")
	claimed := strings.TrimSpace(r.Header.Get("New-Api-User"))

	f.mu.Lock()
	var owner int64
	for token, session := range f.sessions {
		if auth == "Bearer "+token {
			owner = session.UserID
			break
		}
	}
	f.mu.Unlock()

	if owner == 0 || claimed != strconv.FormatInt(owner, 10) {
		http.Error(w, `{"success":false,"message":"unauthorized"}`, http.StatusUnauthorized)
		return 0, false
	}
	f.mu.Lock()
	f.tokenCalls = append(f.tokenCalls, fakeTokenCall{Method: r.Method, Auth: auth, UserID: owner, Path: r.URL.Path})
	f.mu.Unlock()
	return owner, true
}

func (f *fakeGateway) handleUser(w http.ResponseWriter, r *http.Request) {
	if !f.adminAuthorized(r) {
		http.Error(w, `{"success":false,"message":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		http.Error(w, `{"success":false,"message":"method"}`, http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		ID       flexID `json:"id"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeEnvelope(w, http.StatusBadRequest, false, "bad json", nil)
		return
	}
	// new-api validates these fields with 'max' tags and answers a violation at
	// HTTP 200 with success=false. A password over 20 characters is the one this
	// client must never send.
	switch {
	case len(body.Password) > 20:
		writeEnvelope(w, http.StatusOK, false,
			"Field validation for 'Password' failed on the 'max' tag", nil)
		return
	case len(body.Username) > 20:
		writeEnvelope(w, http.StatusOK, false,
			"Field validation for 'Username' failed on the 'max' tag", nil)
		return
	}

	if r.Method == http.MethodPut {
		f.mu.Lock()
		defer f.mu.Unlock()
		target := f.users[body.Username]
		if target == nil || target.ID != int64(body.ID) {
			writeEnvelope(w, http.StatusOK, false, "record not found", nil)
			return
		}
		if body.Password != target.Password {
			target.Password = body.Password
			// A changed password ends the account's sessions, as new-api's
			// password reset does. The cached session is what the 401 retry path
			// exists for.
			f.dropSessionsLocked(target.ID)
		}
		writeEnvelope(w, http.StatusOK, true, "", nil)
		return
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	// A duplicate login answers 200 with success=false: that is what new-api
	// does, and it is exactly what the client's search fallback exists for. A
	// second create for the same name must NOT allocate a new id.
	if existing, ok := f.users[body.Username]; ok {
		writeEnvelope(w, http.StatusOK, false, fmt.Sprintf("user %d exists", existing.ID), nil)
		return
	}
	f.nextUser++
	f.users[body.Username] = &fakeUser{ID: f.nextUser, Username: body.Username, Password: body.Password}
	writeEnvelope(w, http.StatusOK, true, "", map[string]any{"id": f.nextUser, "username": body.Username})
}

func (f *fakeGateway) handleUserSearch(w http.ResponseWriter, r *http.Request) {
	if !f.adminAuthorized(r) {
		http.Error(w, `{"success":false}`, http.StatusUnauthorized)
		return
	}
	keyword := r.URL.Query().Get("keyword")
	f.mu.Lock()
	defer f.mu.Unlock()
	// The real endpoint is a keyword search, so it deliberately returns a
	// near-miss alongside the exact match: the client must filter again.
	items := []map[string]any{{"id": 9, "username": keyword + "-not-me"}}
	if user, ok := f.users[keyword]; ok {
		items = append(items, map[string]any{"id": user.ID, "username": user.Username})
	}
	writeEnvelope(w, http.StatusOK, true, "", map[string]any{"items": items, "total": len(items)})
}

// handleUserLogin is what lets the client act as the user at all. It verifies the
// derived password and hangs a session on the account.
func (f *fakeGateway) handleUserLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"success":false,"message":"method"}`, http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeEnvelope(w, http.StatusBadRequest, false, "bad json", nil)
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.loginCalls++
	user := f.users[body.Username]
	// new-api answers a refused login at HTTP 200 with success=false.
	if user == nil || body.Password == "" || user.Password != body.Password {
		writeEnvelope(w, http.StatusOK, false, "Username or password is incorrect", nil)
		return
	}
	f.nextSession++
	token := fmt.Sprintf("utok-%d-%d", user.ID, f.nextSession)
	f.sessions[token] = &fakeSession{Token: token, UserID: user.ID}
	writeEnvelope(w, http.StatusOK, true, "", map[string]any{
		"access_token": token,
		"token_type":   "Bearer",
		// Current builds nest the account; the flat id is what older builds send.
		"user": map[string]any{"id": user.ID, "username": user.Username},
	})
}

func (f *fakeGateway) handleTokenCreate(w http.ResponseWriter, r *http.Request) {
	owner, ok := f.caller(w, r)
	if !ok {
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
	if !regexp.MustCompile(`^mul:[0-9a-f]{8}:[0-9a-f]{8}$`).MatchString(body.Name) {
		w.WriteHeader(http.StatusBadRequest)
		writeEnvelope(w, http.StatusBadRequest, false, "bad token name", nil)
		return
	}
	if body.ExpiredTime != -1 {
		// The credential is long-lived by design; a token with an expiry would
		// silently break every CLI at expiry time.
		w.WriteHeader(http.StatusBadRequest)
		writeEnvelope(w, http.StatusBadRequest, false, "token must not expire", nil)
		return
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	f.mintCalls++
	if f.rejectMint != "" {
		writeEnvelope(w, http.StatusBadRequest, false, f.rejectMint, nil)
		return
	}
	f.nextToken++
	// The token belongs to the account the session named: this is the whole
	// point of minting as the user.
	token := &fakeToken{ID: f.nextToken, UserID: owner, Name: body.Name, Key: fakeKey(f.nextToken)}
	f.tokens[token.ID] = token
	if f.omitMintBody {
		writeEnvelope(w, http.StatusOK, true, "", nil)
		return
	}
	writeEnvelope(w, http.StatusOK, true, "", map[string]any{
		"id": token.ID, "name": token.Name, "key": token.Key,
	})
}

// handleTokenList mirrors GET /api/token/?p=1: the tokens of the calling account,
// which is how ownership is observable from outside.
func (f *fakeGateway) handleTokenList(w http.ResponseWriter, r *http.Request) {
	owner, ok := f.caller(w, r)
	if !ok {
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	items := make([]map[string]any, 0, len(f.tokens))
	for _, token := range f.tokens {
		if token.UserID != owner {
			continue
		}
		items = append(items, map[string]any{
			"id": token.ID, "user_id": token.UserID, "name": token.Name, "key": token.Key,
		})
	}
	writeEnvelope(w, http.StatusOK, true, "", map[string]any{"items": items, "total": len(items)})
}

// handleTokenKey mirrors new-api's POST /api/token/{id}/key, the one call that
// answers with the plaintext key. maskKeyReveal makes it answer the masked form
// instead, which is how a build without that route behaves.
func (f *fakeGateway) handleTokenKey(w http.ResponseWriter, r *http.Request) {
	owner, ok := f.caller(w, r)
	if !ok {
		return
	}
	id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/token/"), "/key")
	f.mu.Lock()
	key := ""
	for _, token := range f.tokens {
		if strconv.FormatInt(token.ID, 10) == id && token.UserID == owner {
			key = token.Key
			break
		}
	}
	f.mu.Unlock()
	if key == "" {
		http.Error(w, `{"success":false,"message":"record not found"}`, http.StatusNotFound)
		return
	}
	if f.maskKeyReveal {
		key = key[:4] + "**********" + key[len(key)-4:]
	}
	writeEnvelope(w, http.StatusOK, true, "", map[string]any{"key": key})
}

func (f *fakeGateway) handleTokenSearch(w http.ResponseWriter, r *http.Request) {
	owner, ok := f.caller(w, r)
	if !ok {
		return
	}
	keyword := r.URL.Query().Get("keyword")
	f.mu.Lock()
	defer f.mu.Unlock()
	items := make([]map[string]any, 0, 1)
	for _, token := range f.tokens {
		if token.Name == keyword && token.UserID == owner {
			// Every read path masks the key; the plaintext lives behind the
			// reveal route, which is why the client has to call it.
			items = append(items, map[string]any{
				"id": token.ID, "user_id": token.UserID, "name": token.Name, "key": maskKey(token.Key),
			})
		}
	}
	writeEnvelope(w, http.StatusOK, true, "", map[string]any{"items": items, "total": len(items)})
}

func (f *fakeGateway) handleTokenDelete(w http.ResponseWriter, r *http.Request) {
	owner, ok := f.caller(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(strings.TrimPrefix(r.URL.Path, "/api/token/"), 10, 64)
	if err != nil {
		writeEnvelope(w, http.StatusBadRequest, false, "bad id", nil)
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	token, exists := f.tokens[id]
	// A token of another account reads as "not found" here too, which is the
	// trap the owner-scoped revoke avoids.
	if !exists || token.UserID != owner {
		writeEnvelope(w, http.StatusOK, false, "record not found", nil)
		return
	}
	delete(f.tokens, id)
	writeEnvelope(w, http.StatusOK, true, "", nil)
}

func writeEnvelope(w http.ResponseWriter, status int, success bool, message string, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	body := map[string]any{"success": success, "message": message}
	if data != nil {
		body["data"] = data
	}
	encoded, _ := json.Marshal(body)
	_, _ = w.Write(encoded)
}

// ── fake introspection, used by the assertions ───────────────────────────────

func (f *fakeGateway) live() []fakeToken {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]fakeToken, 0, len(f.tokens))
	for _, token := range f.tokens {
		out = append(out, *token)
	}
	return out
}

func (f *fakeGateway) sessionToken(gatewayUserID int64) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	for token, session := range f.sessions {
		if session.UserID == gatewayUserID {
			return token
		}
	}
	return ""
}

func (f *fakeGateway) calls() []fakeTokenCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]fakeTokenCall(nil), f.tokenCalls...)
}

func (f *fakeGateway) password(username string) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if user, ok := f.users[username]; ok {
		return user.Password
	}
	return ""
}

// expireSessions kills every session of one account, the way a password change
// elsewhere or an expiry would.
func (f *fakeGateway) expireSessions(gatewayUserID int64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.dropSessionsLocked(gatewayUserID)
}

func (f *fakeGateway) dropSessionsLocked(gatewayUserID int64) {
	for token, session := range f.sessions {
		if session.UserID == gatewayUserID {
			delete(f.sessions, token)
		}
	}
}

func (f *fakeGateway) loginCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.loginCalls
}

func fakeKey(id int64) string {
	// 48 characters after "sk-", which is what new-api issues and what makes the
	// value match pkg/redact's sk- rule.
	return "sk-test" + strings.Repeat("0", 38) + strconv.FormatInt(id, 10)
}

func maskKey(key string) string {
	if len(key) < 9 {
		return "**********"
	}
	return key[:4] + "**********" + key[len(key)-4:]
}

const (
	testAdminToken = "admin-token-for-tests"
	testSecret     = "c2VjcmV0LWZvci1nYXRld2F5LXRlc3RzLTMyaA=="
	testUserUUID   = "8f14e45f-ceea-467a-9575-4e0e0c9d7b1a"
	testOtherUUID  = "2c1b7c2e-9a52-4fd0-8e39-6f0d1a5c4b77"
)

func testClient(t *testing.T, baseURL string) *Client {
	t.Helper()
	return New(Config{
		BaseURL:       baseURL,
		AdminToken:    testAdminToken,
		AdminUserID:   "2",
		ServerSecret:  testSecret,
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
	t.Setenv(EnvServerSecret, testSecret)
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
	if got := client.serverSecret; got != testSecret {
		t.Fatalf("serverSecret = %q, want the env value", got)
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

// The password is the only thing standing between "the server can act as the
// user" and "every key belongs to the admin", and new-api silently rejects a
// value over 20 characters at HTTP 200. Both properties are pinned here.
func TestGatewayPasswordIsDeterministicAndFitsTheFieldLimit(t *testing.T) {
	password := GatewayPassword(testSecret, testUserUUID)
	if got, want := len(password), 19; got != want {
		t.Fatalf("len(GatewayPassword()) = %d (%q), want %d — 20 is the gateway's max", got, password, want)
	}
	if !regexp.MustCompile(`^mc-[0-9a-f]{16}$`).MatchString(password) {
		t.Fatalf("GatewayPassword() = %q, want mc-<16 hex>", password)
	}
	if again := GatewayPassword(testSecret, testUserUUID); again != password {
		t.Fatalf("password must be deterministic: %q vs %q", password, again)
	}
	if other := GatewayPassword(testSecret, testOtherUUID); other == password {
		t.Fatal("two users must not share a password")
	}
	if rotated := GatewayPassword("another-secret", testUserUUID); rotated == password {
		t.Fatal("rotating the deployment secret must rotate the password")
	}
	// The id is normalized the same way the account name is, so a client that
	// sends an upper-case UUID still signs in to the same account.
	if upper := GatewayPassword(testSecret, strings.ToUpper(testUserUUID)); upper != password {
		t.Fatal("password must not depend on the case of the user id")
	}
}

func TestEnsureUserResetsAnExistingAccountToTheDerivedPassword(t *testing.T) {
	fake, srv := newFakeGateway(t, testAdminToken)
	client := testClient(t, srv.URL)
	username := Username(testUserUUID)

	// The account predates this change: it exists with a password nobody
	// recorded, which is why the reset is what makes it usable at all.
	fake.mu.Lock()
	fake.nextUser++
	fake.users[username] = &fakeUser{ID: fake.nextUser, Username: username, Password: "unknown-old-password"}
	fake.mu.Unlock()

	user, err := client.EnsureUser(context.Background(), testUserUUID)
	if err != nil {
		t.Fatalf("EnsureUser on an existing account: %v", err)
	}
	if user.ID == 0 || user.Username != username {
		t.Fatalf("EnsureUser = %+v, want the existing account %q", user, username)
	}
	if got, want := fake.password(username), GatewayPassword(testSecret, testUserUUID); got != want {
		t.Fatalf("gateway password = %q, want the derived value", got)
	}
	// Idempotent: a second call converges on the same account and password.
	again, err := client.EnsureUser(context.Background(), testUserUUID)
	if err != nil {
		t.Fatalf("EnsureUser second call: %v", err)
	}
	if again.ID != user.ID {
		t.Fatalf("EnsureUser ids = %d/%d, want the same account", user.ID, again.ID)
	}
	if got := len(fake.users); got != 1 {
		t.Fatalf("gateway has %d accounts, want exactly 1", got)
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
	if want := Username(testUserUUID); first.Username != want {
		t.Fatalf("username = %q, want %q", first.Username, want)
	}
	if got := len(fake.users); got != 1 {
		t.Fatalf("gateway has %d accounts, want exactly 1 (no double create)", got)
	}
}

func TestEnsureUserRejectsUnauthorizedAdmin(t *testing.T) {
	_, srv := newFakeGateway(t, testAdminToken)
	client := New(Config{BaseURL: srv.URL, AdminToken: "wrong", ServerSecret: testSecret, Timeout: 2 * time.Second})
	if _, err := client.EnsureUser(context.Background(), testUserUUID); !errors.Is(err, ErrGatewayRejected) {
		t.Fatalf("EnsureUser with wrong admin token: err = %v, want ErrGatewayRejected", err)
	}
}

// Without the deployment secret no password can be derived, and the honest
// outcome is "not configured" — never a random password nobody records, and
// never a fall back to the admin identity.
func TestMissingServerSecretRefusesToAct(t *testing.T) {
	_, srv := newFakeGateway(t, testAdminToken)
	client := New(Config{BaseURL: srv.URL, AdminToken: testAdminToken, Timeout: 2 * time.Second})
	if _, err := client.EnsureUser(context.Background(), testUserUUID); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("EnsureUser without a secret: err = %v, want ErrNotConfigured", err)
	}
	if _, err := client.MintToken(context.Background(), testUserUUID, "d", nil, 0); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("MintToken without a secret: err = %v, want ErrNotConfigured", err)
	}
}

// The core of the fix: the token is created by the user, for the user. If the
// client ever went back to the admin token, this test would see the admin token
// in the Authorization header and the admin's id in the token row.
func TestMintTokenRunsAsTheUserAndOwnsTheToken(t *testing.T) {
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

	user, err := client.EnsureUser(context.Background(), testUserUUID)
	if err != nil {
		t.Fatalf("EnsureUser: %v", err)
	}
	sessionToken := fake.sessionToken(user.ID)
	if sessionToken == "" {
		t.Fatal("the client never signed in as the user")
	}
	calls := fake.calls()
	if len(calls) == 0 {
		t.Fatal("no token route was called")
	}
	for _, call := range calls {
		if got, want := call.Auth, "Bearer "+sessionToken; got != want {
			t.Fatalf("%s %s authorized as %q, want the user's session %q", call.Method, call.Path, got, want)
		}
		if call.Auth == "Bearer "+testAdminToken {
			t.Fatalf("%s %s used the admin token", call.Method, call.Path)
		}
		if call.UserID != user.ID {
			t.Fatalf("%s %s claimed account %d, want %d", call.Method, call.Path, call.UserID, user.ID)
		}
	}

	live := fake.live()
	if len(live) != 1 {
		t.Fatalf("gateway tokens = %+v, want exactly the minted one", live)
	}
	if got := live[0].UserID; got != user.ID {
		t.Fatalf("minted token user_id = %d, want the gateway account %d (not the admin 2)", got, user.ID)
	}
	if got := live[0].Key; got != minted.Key {
		t.Fatalf("gateway key = %q, want the returned key", got)
	}
}

// A login is two round trips; the session is reused until it dies.
func TestUserSessionIsCachedAcrossMints(t *testing.T) {
	fake, srv := newFakeGateway(t, testAdminToken)
	client := testClient(t, srv.URL)

	if _, err := client.MintToken(context.Background(), testUserUUID, "device-abc", nil, 0); err != nil {
		t.Fatalf("MintToken first: %v", err)
	}
	if _, err := client.MintToken(context.Background(), testUserUUID, "device-xyz", nil, 0); err != nil {
		t.Fatalf("MintToken second: %v", err)
	}
	if got := fake.loginCount(); got != 1 {
		t.Fatalf("logins = %d, want 1 (the second mint reuses the cached session)", got)
	}
}

// A session that the gateway no longer accepts must be renewed once, not
// reported to the caller: a password reset elsewhere is not a user-visible
// failure.
func TestExpiredSessionIsRenewedOnce(t *testing.T) {
	fake, srv := newFakeGateway(t, testAdminToken)
	client := testClient(t, srv.URL)

	first, err := client.MintToken(context.Background(), testUserUUID, "device-abc", nil, 0)
	if err != nil {
		t.Fatalf("MintToken first: %v", err)
	}
	user, err := client.EnsureUser(context.Background(), testUserUUID)
	if err != nil {
		t.Fatalf("EnsureUser: %v", err)
	}
	fake.expireSessions(user.ID)

	second, err := client.MintToken(context.Background(), testUserUUID, "device-xyz", nil, 0)
	if err != nil {
		t.Fatalf("MintToken after the session died: %v", err)
	}
	if second.ID == 0 || second.ID == first.ID {
		t.Fatalf("second mint = %+v, want a new token", second)
	}
	if got := fake.loginCount(); got != 2 {
		t.Fatalf("logins = %d, want 2 (initial + exactly one renewal)", got)
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
	// The lookup and the reveal happen under the user's identity too: the search
	// is scoped to the caller, so the admin's session would find nothing.
	calls := fake.calls()
	var paths []string
	for _, call := range calls {
		paths = append(paths, call.Path)
		if strings.HasPrefix(call.Auth, "Bearer "+testAdminToken) {
			t.Fatalf("%s %s used the admin token", call.Method, call.Path)
		}
	}
	if !strings.Contains(strings.Join(paths, " "), "/api/token/search") {
		t.Fatalf("calls = %v, want a token search", paths)
	}
	if !strings.Contains(strings.Join(paths, " "), "/key") {
		t.Fatalf("calls = %v, want a key reveal", paths)
	}
}

// A build whose reveal route answers the masked key must fail the mint instead of
// storing a credential that authenticates as nothing.
func TestMintTokenRejectsMaskedKey(t *testing.T) {
	fake, srv := newFakeGateway(t, testAdminToken)
	fake.omitMintBody = true
	fake.maskKeyReveal = true
	client := testClient(t, srv.URL)

	minted, err := client.MintToken(context.Background(), testUserUUID, "device-abc", nil, 0)
	if err == nil {
		t.Fatalf("MintToken = %+v, want an error instead of a masked key", minted)
	}
	if !errors.Is(err, ErrGatewayRejected) {
		t.Fatalf("MintToken error = %v, want ErrGatewayRejected", err)
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
	// Second revoke: the token is already gone and that is success, because the
	// post-condition "this key no longer works" already holds.
	if err := client.RevokeToken(context.Background(), strconv.FormatInt(minted.ID, 10)); err != nil {
		t.Fatalf("RevokeToken twice: %v", err)
	}
	// An empty id means nothing was minted far enough to have one.
	if err := client.RevokeToken(context.Background(), ""); err != nil {
		t.Fatalf("RevokeToken empty id: %v", err)
	}
}

// Revocation has to run as the owner even in a process that never minted the
// token (a restart between mint and rotate): the gateway reads an admin delete of
// someone else's token as "record not found" and leaves the key live.
func TestRevokeTokenRunsAsTheOwnerSuppliedByTheCaller(t *testing.T) {
	fake, srv := newFakeGateway(t, testAdminToken)
	client := testClient(t, srv.URL)

	minted, err := client.MintToken(context.Background(), testUserUUID, "device-abc", nil, 0)
	if err != nil {
		t.Fatalf("MintToken: %v", err)
	}
	// A fresh client has no memory of the mint, exactly like a restarted server.
	restarted := testClient(t, srv.URL)
	if err := restarted.RevokeToken(context.Background(), strconv.FormatInt(minted.ID, 10), testUserUUID); err != nil {
		t.Fatalf("RevokeToken as the owner: %v", err)
	}
	if got := fake.live(); len(got) != 0 {
		t.Fatalf("gateway tokens after revoke = %+v, want none", got)
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

// Neither the minted key nor the user's session token may reach a log record or
// an error string. A spy handler is installed as the default logger so any future
// log line in this package is checked by this test.
func TestMintLogsAndErrorsCarryNoCredentials(t *testing.T) {
	fake, srv := newFakeGateway(t, testAdminToken)
	client := testClient(t, srv.URL)

	spy := &spyHandler{}
	previous := slog.Default()
	slog.SetDefault(slog.New(spy))
	t.Cleanup(func() { slog.SetDefault(previous) })

	minted, err := client.MintToken(context.Background(), testUserUUID, "device-abc", nil, 0)
	if err != nil {
		t.Fatalf("MintToken: %v", err)
	}
	user, err := client.EnsureUser(context.Background(), testUserUUID)
	if err != nil {
		t.Fatalf("EnsureUser: %v", err)
	}
	sessionToken := fake.sessionToken(user.ID)
	if sessionToken == "" {
		t.Fatal("the client never signed in as the user")
	}

	failure := testClient(t, srv.URL)
	fake.rejectMint = "quota exceeded for " + minted.Key
	_, rejected := failure.MintToken(context.Background(), testUserUUID, "device-x", nil, 0)
	fake.rejectMint = ""
	if rejected == nil {
		t.Fatal("MintToken accepted the rejection case")
	}

	secrets := []string{minted.Key, sessionToken, GatewayPassword(testSecret, testUserUUID)}
	for _, secret := range secrets {
		if strings.Contains(rejected.Error(), secret) {
			t.Fatalf("error text carries a credential: %v", rejected)
		}
		for _, record := range spy.records() {
			if strings.Contains(record, secret) {
				t.Fatalf("log record carries a credential: %q", record)
			}
		}
	}
}

// spyHandler records every log line so a test can inspect what was written.
type spyHandler struct {
	mu   sync.Mutex
	seen []string
}

func (h *spyHandler) Enabled(context.Context, slog.Level) bool { return true }

func (h *spyHandler) Handle(_ context.Context, record slog.Record) error {
	line := record.Message
	record.Attrs(func(attr slog.Attr) bool {
		line += " " + attr.Key + "=" + attr.Value.String()
		return true
	})
	h.mu.Lock()
	h.seen = append(h.seen, line)
	h.mu.Unlock()
	return nil
}

func (h *spyHandler) WithAttrs([]slog.Attr) slog.Handler { return h }

func (h *spyHandler) WithGroup(string) slog.Handler { return h }

func (h *spyHandler) records() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]string(nil), h.seen...)
}

// handleUserManage mirrors new-api's admin quota route: it credits an account and
// answers success, which is what lets a zero-balance login pay for a call.
func (f *fakeGateway) handleUserManage(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID    int64 `json:"id"`
		Value int64 `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"success":false}`, http.StatusBadRequest)
		return
	}
	f.mu.Lock()
	for name, user := range f.users {
		if user.ID == body.ID {
			user.Quota += body.Value
			f.users[name] = user
		}
	}
	f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, `{"success":true}`)
}
// Package gateway is the outbound HTTP client for the company model gateway
// (new-api). It is the ONLY place in the server that holds the gateway admin
// token and the only place that ever sees a freshly minted token key.
//
// Two rules shape this file:
//
//  1. The upstream provider key (T0) is invisible here. We speak to the
//     gateway's *admin* API — create a login, mint a per-person token, revoke
//     it — and nothing else. See docs/plans/RUNTIME-CONFIGURATOR.md §1.2.
//  2. A minted key is returned to the caller in memory and never logged,
//     retried into a body dump, or wrapped into an error string. Callers store
//     it encrypted and forget it. Redaction is the caller's job, but nothing
//     here gives it a reason to be needed.
//
// Configuration is two env vars — NEWAPI_BASE_URL and NEWAPI_ADMIN_TOKEN.
// Missing either means the feature is simply not deployed: Configured()
// reports false and every endpoint degrades to "gateway_not_configured"
// instead of dialing a hard-coded host.
package gateway

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Env vars read by FromEnv.
const (
	// EnvBaseURL is the gateway root, e.g. https://relay.example.com — no
	// trailing /v1. The OpenAI-compatible root handed to clients is derived
	// (BaseURL + "/v1"), because the admin API and the relay API share a host.
	EnvBaseURL = "NEWAPI_BASE_URL"
	// EnvAdminToken is the gateway admin token. Deployments that require the
	// new-api "New-Api-User" header set it together with EnvAdminUserID.
	EnvAdminToken = "NEWAPI_ADMIN_TOKEN"
	// EnvAdminUserID is the numeric id behind EnvAdminToken. Only needed by
	// new-api builds that require the New-Api-User header on admin routes.
	EnvAdminUserID = "NEWAPI_ADMIN_USER_ID"
	// EnvDefaultModels is a comma-separated model allowlist applied when a
	// caller supplies none. Empty means "mint an unrestricted token" — the
	// operator's decision to make, not a guess baked into code.
	EnvDefaultModels = "NEWAPI_DEFAULT_MODELS"
	// EnvDefaultQuota is the per-token quota handed to the gateway. new-api
	// quota units; 0 means unlimited.
	EnvDefaultQuota = "NEWAPI_DEFAULT_QUOTA"
)

// DefaultQuota is applied when NEWAPI_DEFAULT_QUOTA is unset. 500_000 quota
// units is the new-api default for a subscription user and is deliberately
// finite: an unmetered employee key is a support ticket waiting to happen.
const DefaultQuota int64 = 500_000

// DefaultTimeout bounds one admin API call. Minting happens inside a request
// from a desktop client that is waiting for its key, and inside a database
// transaction that holds a per-(user,device) advisory lock, so this must stay
// short enough that a wedged gateway cannot pile up locks.
const DefaultTimeout = 10 * time.Second

// ErrGatewayUnavailable marks a transport failure, a timeout, or a 5xx: the
// gateway could not answer. Retrying later is reasonable and the caller keeps
// whatever credential it already had.
var ErrGatewayUnavailable = errors.New("gateway: unavailable")

// ErrGatewayRejected marks a 4xx the gateway answered on purpose: bad admin
// token, malformed token name, disabled account. Retrying the same call
// changes nothing.
var ErrGatewayRejected = errors.New("gateway: rejected")

// ErrNotConfigured is returned by the operations when the deployment has no
// gateway at all. Callers normally check Configured() first.
var ErrNotConfigured = errors.New("gateway: not configured")

// Config is the resolved configuration. Build it with FromEnv in production and
// directly in tests.
type Config struct {
	// BaseURL is the gateway root without a trailing slash.
	BaseURL string
	// AdminToken authenticates the admin API. Never logged.
	AdminToken string
	// AdminUserID, when non-empty, is sent as the New-Api-User header.
	AdminUserID string
	// Timeout bounds one call; zero selects DefaultTimeout.
	Timeout time.Duration
	// DefaultModels is used when MintToken receives no allowlist.
	DefaultModels []string
	// DefaultQuota is handed to MintToken by the handler. Zero means unlimited.
	DefaultQuota int64
	// HTTPClient overrides the transport (tests, or a deployment behind a
	// proxy). Zero value builds one with Timeout.
	HTTPClient *http.Client
}

// Client is a configured gateway admin client. Safe for concurrent use.
type Client struct {
	baseURL      string
	adminToken   string
	adminUserID  string
	defaultModel []string
	defaultQuota int64
	httpClient   *http.Client
}

// User is the gateway-side login a user's tokens are minted under.
type User struct {
	ID       int64
	Username string
}

// Token is a minted gateway token. Key is plaintext and must not be logged,
// stored unencrypted, or put in an error.
type Token struct {
	ID   int64
	Name string
	Key  string
}

// FromEnv builds a client from the NEWAPI_* env vars. It never fails: an
// unconfigured deployment yields a client whose Configured() is false, which is
// how every caller decides to return 503 instead of dialing.
func FromEnv() *Client {
	quota := DefaultQuota
	if raw := strings.TrimSpace(os.Getenv(EnvDefaultQuota)); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil && parsed >= 0 {
			quota = parsed
		}
	}
	return New(Config{
		BaseURL:       os.Getenv(EnvBaseURL),
		AdminToken:    os.Getenv(EnvAdminToken),
		AdminUserID:   os.Getenv(EnvAdminUserID),
		DefaultModels: splitList(os.Getenv(EnvDefaultModels)),
		DefaultQuota:  quota,
	})
}

// New normalizes cfg and returns a client. BaseURL is trimmed of trailing
// slashes so path joins never double up; a bare host with no scheme is left
// alone (it will fail Configured's caller at request time rather than being
// silently rewritten to http://).
func New(cfg Config) *Client {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: timeout}
	}
	return &Client{
		baseURL:      strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/"),
		adminToken:   strings.TrimSpace(cfg.AdminToken),
		adminUserID:  strings.TrimSpace(cfg.AdminUserID),
		defaultModel: normalizeModels(cfg.DefaultModels),
		defaultQuota: cfg.DefaultQuota,
		httpClient:   client,
	}
}

// Configured reports whether this deployment can mint credentials at all.
func (c *Client) Configured() bool {
	return c != nil && c.baseURL != "" && c.adminToken != ""
}

// BaseURL is the gateway root (admin API). Empty when unconfigured.
func (c *Client) BaseURL() string {
	if c == nil {
		return ""
	}
	return c.baseURL
}

// OpenAIBaseURL is what a client CLI is pointed at: the OpenAI-compatible
// surface of the same host. This is the `base_url` in the mint response and in
// every provider profile the desktop writes.
func (c *Client) OpenAIBaseURL() string {
	if c == nil || c.baseURL == "" {
		return ""
	}
	return c.baseURL + "/v1"
}

// DefaultModels is the configured allowlist applied when a caller asks for none.
func (c *Client) DefaultModels() []string {
	if c == nil {
		return nil
	}
	return append([]string(nil), c.defaultModel...)
}

// DefaultQuota is the quota handed to the gateway at mint time.
func (c *Client) DefaultQuota() int64 {
	if c == nil {
		return 0
	}
	return c.defaultQuota
}

// Username is the gateway login name for one Multica user. Stable across
// devices so every device's token hangs off a single gateway account, which is
// what makes "disable the user" a viable kill switch (plan §3.4).
func Username(userID string) string {
	return "morechat:" + strings.ToLower(strings.TrimSpace(userID))
}

// TokenName is the gateway token name for one (user, device) pair:
// mul:<uid8>:<dev8>. uid8 is the first 8 hex characters of the user UUID, so a
// log line can be traced back to a person; dev8 is the first 8 hex characters
// of sha256(device_id), because the raw device id is client-supplied and may
// contain characters the gateway's name field (or a log line) should not carry.
func TokenName(userID, deviceID string) string {
	uid := strings.ToLower(strings.TrimSpace(userID))
	uid = strings.ReplaceAll(uid, "-", "")
	if len(uid) > 8 {
		uid = uid[:8]
	}
	sum := sha256.Sum256([]byte(strings.TrimSpace(deviceID)))
	dev := hex.EncodeToString(sum[:])[:8]
	return "mul:" + uid + ":" + dev
}

// EnsureUser creates the gateway login for userID, or returns the existing one.
//
// Idempotent by construction: create, and if that fails for any reason (409,
// 400, or new-api's habit of answering 200 with success=false) fall back to an
// exact-match search by username. A create that races another writer therefore
// converges on the same account instead of doubling it (plan §3.3).
func (c *Client) EnsureUser(ctx context.Context, userID string) (User, error) {
	if !c.Configured() {
		return User{}, ErrNotConfigured
	}
	username := Username(userID)
	if username == "morechat:" {
		return User{}, fmt.Errorf("%w: empty user id", ErrGatewayRejected)
	}
	password, err := randomPassword()
	if err != nil {
		return User{}, fmt.Errorf("%w: generate password: %v", ErrGatewayUnavailable, err)
	}

	status, body, err := c.do(ctx, http.MethodPost, "/api/user/", map[string]any{
		"username":     username,
		"password":     password,
		"display_name": username,
		// role 1 = common user. The token's quota/models are set per token, so
		// the account itself needs no privileges.
		"role": 1,
	})
	if err == nil && status >= 200 && status < 300 {
		if resp, ok := decodeEnvelope(body); ok && resp.Success {
			if id := parseID(resp.Data); id > 0 {
				return User{ID: id, Username: username}, nil
			}
			// Some new-api builds answer {"success":true} with no body at all;
			// the search below recovers the id.
		}
	}
	// Transport/5xx failures are fatal: searching would only hit the same
	// unavailable host. Anything else (duplicate login, 200-with-error) means
	// "maybe it already exists", which only a lookup can settle.
	if err != nil {
		return User{}, err
	}

	found, searchErr := c.findUser(ctx, username)
	if searchErr != nil {
		return User{}, searchErr
	}
	if found.ID > 0 {
		return found, nil
	}
	return User{}, fmt.Errorf("%w: create user %q: HTTP %d", ErrGatewayRejected, username, status)
}

// findUser resolves an existing login by exact username match. new-api's search
// is a keyword search, so the list is filtered again here: a prefix collision
// must not hand one person another person's account id.
func (c *Client) findUser(ctx context.Context, username string) (User, error) {
	status, body, err := c.do(ctx, http.MethodGet, "/api/user/search?keyword="+url.QueryEscape(username), nil)
	if err != nil {
		return User{}, err
	}
	if status < 200 || status >= 300 {
		if status >= 500 {
			return User{}, fmt.Errorf("%w: search user: HTTP %d", ErrGatewayUnavailable, status)
		}
		return User{}, fmt.Errorf("%w: search user: HTTP %d", ErrGatewayRejected, status)
	}
	for _, item := range parseItems(body) {
		if strings.EqualFold(item.Username, username) && item.ID > 0 {
			return item, nil
		}
	}
	return User{}, nil
}

// MintToken creates a gateway token for (userID, deviceID) and returns the
// plaintext key. The key is in memory only: the caller seals it immediately and
// the response to the client is the one and only place it is ever emitted.
//
// expired_time is -1 (never expires) on purpose. The credential is a person's
// long-lived LLM key, decoupled from the session (plan §1.2); its only exits are
// rotation and revocation.
func (c *Client) MintToken(ctx context.Context, userID, deviceID string, models []string, quota int64) (Token, error) {
	if !c.Configured() {
		return Token{}, ErrNotConfigured
	}
	name := TokenName(userID, deviceID)
	allow := normalizeModels(models)
	if len(allow) == 0 {
		allow = c.defaultModel
	}
	payload := map[string]any{
		"name":            name,
		"remain_quota":    quota,
		"unlimited_quota": quota <= 0,
		"expired_time":    -1,
		// Only restrict models when we actually have a list. Sending
		// model_limits_enabled with an empty string would mint a token that can
		// call nothing, which reads in the UI as "the company key is broken".
		"model_limits_enabled": len(allow) > 0,
		"model_limits":         strings.Join(allow, ","),
	}
	status, body, err := c.do(ctx, http.MethodPost, "/api/token/", payload)
	if err != nil {
		return Token{}, err
	}
	if status < 200 || status >= 300 {
		return Token{}, classify("mint token", status)
	}
	minted := parseMintedToken(body)
	if minted.Key != "" && minted.ID > 0 {
		minted.Name = name
		return minted, nil
	}
	// Older new-api builds answer {"success":true} and nothing else. The token
	// exists now, so look it up by the exact name we just used rather than
	// reporting a failure the client cannot act on.
	looked, lookupErr := c.findToken(ctx, name)
	if lookupErr != nil {
		return Token{}, lookupErr
	}
	if looked.ID == 0 {
		return Token{}, fmt.Errorf("%w: mint token: token %q not readable after create", ErrGatewayRejected, name)
	}
	if looked.Key == "" {
		return Token{}, fmt.Errorf("%w: mint token: gateway returned no key for %q", ErrGatewayRejected, name)
	}
	looked.Name = name
	return looked, nil
}

// findToken resolves a token by exact name. Used only when a create response
// carries no key/id.
func (c *Client) findToken(ctx context.Context, name string) (Token, error) {
	status, body, err := c.do(ctx, http.MethodGet, "/api/token/search?keyword="+url.QueryEscape(name), nil)
	if err != nil {
		return Token{}, err
	}
	if status < 200 || status >= 300 {
		return Token{}, classify("search token", status)
	}
	for _, raw := range parseItemsRaw(body) {
		var item struct {
			ID   flexID `json:"id"`
			Name string `json:"name"`
			Key  string `json:"key"`
		}
		if json.Unmarshal(raw, &item) != nil {
			continue
		}
		if item.Name == name {
			return Token{ID: int64(item.ID), Name: item.Name, Key: item.Key}, nil
		}
	}
	return Token{}, nil
}

// RevokeToken deletes a token on the gateway. Idempotent: a token that is
// already gone (404) is a success, because the post-condition the caller wants —
// "this key no longer works" — already holds.
func (c *Client) RevokeToken(ctx context.Context, tokenID string) error {
	if !c.Configured() {
		return ErrNotConfigured
	}
	id := strings.TrimSpace(tokenID)
	if id == "" {
		// Nothing was ever minted far enough to have an id; nothing to revoke.
		return nil
	}
	status, _, err := c.do(ctx, http.MethodDelete, "/api/token/"+url.PathEscape(id), nil)
	if err != nil {
		return err
	}
	if status == http.StatusNotFound {
		return nil
	}
	if status < 200 || status >= 300 {
		return classify("revoke token", status)
	}
	return nil
}

// do performs one admin API call. It returns the status and body for every
// answer the server actually gave; err is non-nil only for transport failures,
// timeouts and 5xx — the cases where no body is worth inspecting.
func (c *Client) do(ctx context.Context, method, path string, payload any) (int, []byte, error) {
	var reader io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return 0, nil, fmt.Errorf("%w: encode request: %v", ErrGatewayRejected, err)
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return 0, nil, fmt.Errorf("%w: build request: %v", ErrGatewayRejected, err)
	}
	req.Header.Set("Authorization", "Bearer "+c.adminToken)
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.adminUserID != "" {
		req.Header.Set("New-Api-User", c.adminUserID)
	}

	res, err := c.httpClient.Do(req)
	if err != nil {
		// net/http wraps context deadlines in *url.Error; either way the caller
		// cannot distinguish "our timeout" from "their outage" and both are
		// retryable.
		return 0, nil, fmt.Errorf("%w: %s %s: %v", ErrGatewayUnavailable, method, path, err)
	}
	defer res.Body.Close()
	// 1 MiB is far more than any admin response needs and keeps a hostile or
	// misconfigured gateway from streaming the process out of memory.
	body, readErr := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if readErr != nil {
		return 0, nil, fmt.Errorf("%w: read response: %v", ErrGatewayUnavailable, readErr)
	}
	if res.StatusCode >= 500 {
		return res.StatusCode, body, fmt.Errorf("%w: %s %s: HTTP %d", ErrGatewayUnavailable, method, path, res.StatusCode)
	}
	return res.StatusCode, body, nil
}

// classify turns a non-2xx answer into one of the two sentinels. The gateway's
// message is included, but it is the gateway's own text: it never contains a
// token key, because a key is only ever in a mint *response* body.
func classify(op string, status int) error {
	if status >= 500 {
		return fmt.Errorf("%w: %s: HTTP %d", ErrGatewayUnavailable, op, status)
	}
	return fmt.Errorf("%w: %s: HTTP %d", ErrGatewayRejected, op, status)
}

// ── response decoding ───────────────────────────────────────────────────────

// envelope is new-api's universal response shape.
type envelope struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

// flexID accepts a JSON number or a quoted number: new-api has returned both
// across versions, and an id arriving as "12" must not read as "no id".
type flexID int64

func (f *flexID) UnmarshalJSON(raw []byte) error {
	text := strings.Trim(strings.TrimSpace(string(raw)), `"`)
	if text == "" || text == "null" {
		*f = 0
		return nil
	}
	parsed, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		return fmt.Errorf("flexID: %q is not an integer", text)
	}
	*f = flexID(parsed)
	return nil
}

func decodeEnvelope(body []byte) (envelope, bool) {
	var env envelope
	if len(bytes.TrimSpace(body)) == 0 {
		return env, false
	}
	if err := json.Unmarshal(body, &env); err != nil {
		return env, false
	}
	return env, true
}

// parseID pulls a numeric id out of a data payload that may be an object
// ({"id":7}) or a bare number.
func parseID(raw json.RawMessage) int64 {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return 0
	}
	var score struct {
		ID flexID `json:"id"`
	}
	if trimmed[0] == '{' && json.Unmarshal(trimmed, &score) == nil {
		return int64(score.ID)
	}
	var bare flexID
	if json.Unmarshal(trimmed, &bare) == nil {
		return int64(bare)
	}
	return 0
}

// parseItems reads a search result list. new-api has answered with
// data.items[], with data as a bare array, and with data absent; all three are
// handled so one refactor upstream does not read as "user not found".
func parseItems(body []byte) []User {
	users := make([]User, 0, 4)
	for _, raw := range parseItemsRaw(body) {
		var item struct {
			ID       flexID `json:"id"`
			Username string `json:"username"`
		}
		if json.Unmarshal(raw, &item) != nil {
			continue
		}
		users = append(users, User{ID: int64(item.ID), Username: item.Username})
	}
	return users
}

func parseItemsRaw(body []byte) []json.RawMessage {
	env, ok := decodeEnvelope(body)
	if !ok {
		return nil
	}
	data := bytes.TrimSpace(env.Data)
	if len(data) == 0 || string(data) == "null" {
		return nil
	}
	if data[0] == '[' {
		var items []json.RawMessage
		if json.Unmarshal(data, &items) != nil {
			return nil
		}
		return items
	}
	if data[0] == '{' {
		var wrapped struct {
			Items []json.RawMessage `json:"items"`
		}
		if json.Unmarshal(data, &wrapped) != nil {
			return nil
		}
		return wrapped.Items
	}
	return nil
}

// parseMintedToken reads whatever the create response offered: a bare key
// string, an object with key/id, or nothing at all.
func parseMintedToken(body []byte) Token {
	env, ok := decodeEnvelope(body)
	if !ok {
		return Token{}
	}
	if !env.Success && env.Message != "" {
		return Token{}
	}
	data := bytes.TrimSpace(env.Data)
	if len(data) == 0 || string(data) == "null" {
		return Token{}
	}
	if data[0] == '"' {
		var key string
		if json.Unmarshal(data, &key) == nil {
			return Token{Key: key}
		}
		return Token{}
	}
	if data[0] == '{' {
		var item struct {
			ID   flexID `json:"id"`
			Name string `json:"name"`
			Key  string `json:"key"`
		}
		if json.Unmarshal(data, &item) == nil {
			return Token{ID: int64(item.ID), Name: item.Name, Key: item.Key}
		}
	}
	return Token{}
}

func randomPassword() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "mc-" + hex.EncodeToString(buf), nil
}

// normalizeModels trims, drops empties, de-duplicates and caps an allowlist.
// The cap exists because the list travels in one gateway form field and is
// re-rendered into client files by the desktop.
func normalizeModels(models []string) []string {
	const maxModels = 32
	out := make([]string, 0, len(models))
	seen := make(map[string]struct{}, len(models))
	for _, model := range models {
		trimmed := strings.TrimSpace(model)
		if trimmed == "" || len(trimmed) > 128 {
			continue
		}
		if _, dup := seen[trimmed]; dup {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
		if len(out) == maxModels {
			break
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func splitList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	return strings.Split(raw, ",")
}

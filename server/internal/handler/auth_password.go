package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jerry-halo2026/morchat.co/server/internal/auth"
	"github.com/jerry-halo2026/morchat.co/server/internal/logger"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// Email + password sign-in (docs/engineering/CONTRACTS.md, "登录契约").
//
// The credential itself is a `user.password_hash` PHC string written by
// internal/auth; this file owns the HTTP surface, the failure lockout, and the
// audit trail. Session minting is shared with /auth/verify-code: the same
// issueJWT + auth.SetAuthCookies pair, so a password session is
// indistinguishable from a code session downstream.

const (
	// PasswordMinLength is the contract's weak_password floor, counted in
	// characters (not bytes) so a 10-character CJK passphrase is accepted.
	PasswordMinLength = 10

	// passwordLoginMaxFailures / passwordLoginFailureWindow are the contract
	// lockout: five failed attempts per (email, IP) inside fifteen minutes.
	passwordLoginMaxFailures   = 5
	passwordLoginFailureWindow = 15 * time.Minute
)

// PasswordLoginRequest is the POST /auth/password/login body.
type PasswordLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// PasswordLoginResponse keeps the same shape as LoginResponse (token + user)
// and adds the contract's must_change_password signal.
type PasswordLoginResponse struct {
	Token              string       `json:"token"`
	User               UserResponse `json:"user"`
	MustChangePassword bool         `json:"must_change_password"`
}

// passwordAuthEnabled reports AUTH_PASSWORD_ENABLED, defaulting to true so a
// deployment that upgrades into this feature can sign in immediately and only
// turns it off on purpose.
func passwordAuthEnabled() bool {
	return envBoolDefaultTrue("AUTH_PASSWORD_ENABLED")
}

// codeLoginEnabled reports AUTH_CODE_LOGIN_ENABLED. The emailed code stays
// available as the fallback for accounts without a password, so the default is
// also true; the switch exists for deployments that want password-only entry.
func codeLoginEnabled() bool {
	return envBoolDefaultTrue("AUTH_CODE_LOGIN_ENABLED")
}

func envBoolDefaultTrue(name string) bool {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return true
	}
	enabled, err := strconv.ParseBool(raw)
	if err != nil {
		slog.Warn("ignoring unparsable boolean env; using default true", "env", name, "value", raw)
		return true
	}
	return enabled
}

// PasswordLogin verifies {email, password} and mints the same session
// /auth/verify-code does.
func (h *Handler) PasswordLogin(w http.ResponseWriter, r *http.Request) {
	if !passwordAuthEnabled() {
		writeFeatureDisabled(w, "password_login_disabled", "password sign-in is disabled on this instance")
		return
	}

	var req PasswordLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || req.Password == "" {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "email and password are required")
		return
	}
	if auth.IsTemporarilyDisabledUserEmail(email) {
		writeError(w, http.StatusForbidden, auth.TemporarilyDisabledUserError)
		return
	}

	clientIP := h.clientIPForRateLimit(r)
	lockKey := email + "|" + clientIP
	if retryAfter := passwordLoginFailures.lockedFor(lockKey); retryAfter > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds(retryAfter)))
		writeErrorCode(w, http.StatusTooManyRequests, "too_many_attempts", "too many failed sign-in attempts; try again later")
		return
	}

	user, err := h.Queries.GetUserByEmail(r.Context(), email)
	if err != nil {
		if !isNotFound(err) {
			slog.Warn("password login lookup failed", append(logger.RequestAttrs(r), "error", err, "email", email)...)
			writeErrorCode(w, http.StatusInternalServerError, "internal_error", "failed to look up user")
			return
		}
		// Unknown account: spend the same KDF work as a real verification so
		// response timing does not tell an attacker which emails exist.
		_ = auth.Verify(req.Password, dummyPasswordHash())
		passwordLoginFailures.recordFailure(lockKey)
		slog.Warn("password login failed", append(logger.RequestAttrs(r), "email", email, "reason", "unknown_email")...)
		writeErrorCode(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
		return
	}
	if auth.IsTemporarilyDisabledUser(uuidToString(user.ID), user.Email) {
		writeError(w, http.StatusForbidden, auth.TemporarilyDisabledUserError)
		return
	}

	// A NULL hash means "no password yet": those accounts still sign in with
	// an emailed code, and a password guess against them is a wrong password.
	if !user.PasswordHash.Valid || strings.TrimSpace(user.PasswordHash.String) == "" {
		_ = auth.Verify(req.Password, dummyPasswordHash())
		passwordLoginFailures.recordFailure(lockKey)
		h.recordAuthActivity(r.Context(), auditWorkspaceForUser(r.Context(), h.Queries, user.ID), user.ID, "user_login_failed", map[string]any{
			"email":  email,
			"ip":     clientIP,
			"reason": "no_password_set",
		})
		writeErrorCode(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
		return
	}

	if err := auth.Verify(req.Password, user.PasswordHash.String); err != nil {
		passwordLoginFailures.recordFailure(lockKey)
		h.recordAuthActivity(r.Context(), auditWorkspaceForUser(r.Context(), h.Queries, user.ID), user.ID, "user_login_failed", map[string]any{
			"email":  email,
			"ip":     clientIP,
			"reason": "invalid_password",
		})
		slog.Warn("password login failed", append(logger.RequestAttrs(r), "user_id", uuidToString(user.ID), "reason", "invalid_password")...)
		writeErrorCode(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
		return
	}

	passwordLoginFailures.clear(lockKey)

	// Opportunistically upgrade a hash written with older parameters. A failure
	// here must not block a sign-in that already verified.
	if auth.NeedsRehash(user.PasswordHash.String) {
		if upgraded, err := auth.Hash(req.Password); err == nil {
			if updated, err := h.Queries.SetUserPassword(r.Context(), db.SetUserPasswordParams{
				ID:                 user.ID,
				PasswordHash:       strToText(upgraded),
				MustChangePassword: user.MustChangePassword,
			}); err == nil {
				user = updated
			} else {
				slog.Warn("password rehash write failed", append(logger.RequestAttrs(r), "error", err)...)
			}
		}
	}

	tokenString, err := h.issueJWT(user)
	if err != nil {
		if errors.Is(err, auth.ErrTemporarilyDisabledUser) {
			writeError(w, http.StatusForbidden, auth.TemporarilyDisabledUserError)
			return
		}
		slog.Warn("password login token mint failed", append(logger.RequestAttrs(r), "error", err)...)
		writeErrorCode(w, http.StatusInternalServerError, "internal_error", "failed to generate token")
		return
	}

	if err := auth.SetAuthCookies(w, tokenString); err != nil {
		slog.Warn("failed to set auth cookies", "error", err)
	}
	if h.CFSigner != nil {
		for _, cookie := range h.CFSigner.SignedCookies(time.Now().Add(auth.AuthTokenTTL())) {
			http.SetCookie(w, cookie)
		}
	}

	h.recordAuthActivity(r.Context(), auditWorkspaceForUser(r.Context(), h.Queries, user.ID), user.ID, "user_login_succeeded", map[string]any{
		"email": email,
		"ip":    clientIP,
	})
	slog.Info("user logged in with password", append(logger.RequestAttrs(r), "user_id", uuidToString(user.ID), "email", user.Email)...)

	writeJSON(w, http.StatusOK, PasswordLoginResponse{
		Token:              tokenString,
		User:               h.userToResponse(user),
		MustChangePassword: user.MustChangePassword,
	})
}

// ── Failure lockout ─────────────────────────────────────────────────────────

// passwordLoginFailureGate counts failed password attempts per (email, IP)
// and locks the pair for passwordLoginFailureWindow once the budget is spent.
//
// Why not the existing gates: middleware.RateLimit (the `authRL` chain on
// /auth/send-code) and WebhookRateLimiter are request throttles — they reject
// every request from a key, including ones that would succeed, and neither can
// clear a key. The contract needs the opposite: successes are unlimited and
// reset the counter, only failures accumulate, and the key is an
// (identity, address) pair rather than either alone. The sliding-window shape
// below is deliberately the same as memoryWebhookRateLimiter's so the two
// mechanisms age out identically; only the failure-only accounting differs.
type passwordLoginFailureGate struct {
	mu       sync.Mutex
	failures map[string][]time.Time
	now      func() time.Time
}

func newPasswordLoginFailureGate() *passwordLoginFailureGate {
	return &passwordLoginFailureGate{failures: make(map[string][]time.Time), now: time.Now}
}

// lockedFor returns how long the key stays locked, or 0 when it may try again.
func (g *passwordLoginFailureGate) lockedFor(key string) time.Duration {
	g.mu.Lock()
	defer g.mu.Unlock()
	hits := g.pruneLocked(key)
	if len(hits) < passwordLoginMaxFailures {
		return 0
	}
	remaining := hits[len(hits)-passwordLoginMaxFailures].Add(passwordLoginFailureWindow).Sub(g.now())
	if remaining <= 0 {
		return 0
	}
	return remaining
}

// recordFailure appends one failed attempt and returns the failures still
// inside the window.
func (g *passwordLoginFailureGate) recordFailure(key string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	hits := append(g.pruneLocked(key), g.now())
	g.failures[key] = hits
}

// clear forgets the key: a successful sign-in resets the budget.
func (g *passwordLoginFailureGate) clear(key string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.failures, key)
}

func (g *passwordLoginFailureGate) reset() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.failures = make(map[string][]time.Time)
}

// pruneLocked drops timestamps outside the window. Caller holds g.mu.
func (g *passwordLoginFailureGate) pruneLocked(key string) []time.Time {
	cutoff := g.now().Add(-passwordLoginFailureWindow)
	hits := g.failures[key]
	keep := hits[:0]
	for _, t := range hits {
		if t.After(cutoff) {
			keep = append(keep, t)
		}
	}
	if len(keep) == 0 {
		delete(g.failures, key)
		return nil
	}
	g.failures[key] = keep
	return keep
}

// passwordLoginFailures is process-local. A multi-replica deployment gets one
// budget per replica, which is the same trade-off memoryWebhookRateLimiter
// documents for webhooks when no Redis client is wired into this package;
// widening it means threading a shared client into the limiter, not changing
// the contract (5 failures / 15 minutes).
var passwordLoginFailures = newPasswordLoginFailureGate()

// ── Shared helpers ──────────────────────────────────────────────────────────

// validateNewPassword enforces the contract's weak_password floor. Returns the
// user-facing code when rejected.
func validateNewPassword(password string) (code string, ok bool) {
	if strings.TrimSpace(password) == "" || utf8.RuneCountInString(password) < PasswordMinLength {
		return "weak_password", false
	}
	return "", true
}

// dummyPasswordHash is a real Argon2id hash of a throwaway value, used only to
// spend comparable CPU on unknown-account sign-ins.
var (
	dummyHashOnce sync.Once
	dummyHash     string
)

func dummyPasswordHash() string {
	dummyHashOnce.Do(func() {
		hash, err := auth.Hash("multica-password-timing-equalizer")
		if err != nil {
			// Verification against an empty string is malformed and returns
			// immediately; timing equalisation degrades but sign-in still works.
			hash = ""
		}
		dummyHash = hash
	})
	return dummyHash
}

// auditWorkspaceForUser picks the workspace an account-level audit row is
// written against. activity_log.workspace_id is NOT NULL and references a real
// workspace, so an account that belongs to no workspace has nowhere to record
// the event and the caller skips it (the slog line still exists).
func auditWorkspaceForUser(ctx context.Context, q *db.Queries, userID pgtype.UUID) pgtype.UUID {
	if q == nil || !userID.Valid {
		return pgtype.UUID{}
	}
	workspaces, err := q.ListWorkspaces(ctx, userID)
	if err != nil || len(workspaces) == 0 {
		return pgtype.UUID{}
	}
	return workspaces[0].ID
}

// recordAuthActivity writes one activity_log row for an account-level event.
// Best effort: auditing never fails the request it describes.
func (h *Handler) recordAuthActivity(ctx context.Context, workspaceID, actorID pgtype.UUID, action string, details map[string]any) {
	if h.Queries == nil || !workspaceID.Valid {
		return
	}
	payload, err := json.Marshal(details)
	if err != nil {
		slog.Warn("auth audit detail marshal failed", "action", action, "error", err)
		return
	}
	if payload == nil {
		payload = []byte("{}")
	}
	if _, err := h.Queries.CreateActivity(ctx, db.CreateActivityParams{
		WorkspaceID: workspaceID,
		ActorType:   strToText("member"),
		ActorID:     actorID,
		Action:      action,
		Details:     payload,
	}); err != nil {
		slog.Warn("auth audit write failed", "action", action, "error", err)
	}
}

// retryAfterSeconds formats a lockout duration for the Retry-After header.
func retryAfterSeconds(d time.Duration) int {
	if d <= 0 {
		return 0
	}
	return int(d.Round(time.Second) / time.Second)
}

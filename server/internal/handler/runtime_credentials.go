// Per-user long-lived model-gateway credentials (T1 in
// docs/plans/RUNTIME-CONFIGURATOR.md).
//
// The desktop Runtime Configurator owns the *files* (Claude Code, Codex, DSH);
// this file owns the one thing it cannot do for itself: mint a personal,
// revocable, quota'd gateway token and hand it over exactly once.
//
// Contract, and why each clause exists:
//
//   - POST returns the plaintext key exactly once. Every read afterwards is
//     `***<suffix>`. That is L2 of the plan's five-layer "the company key never
//     reaches the client" rule; a client that loses the key rotates, it cannot
//     re-read.
//   - An existing active credential for the same device is *rotated*, not
//     reused: revoke upstream first, then mint. Reusing would mean a key that
//     was already written to a keychain, a bug report, or a shell history keeps
//     working forever, which is the opposite of what "rotate" means to an
//     operator.
//   - Gateway not configured => 503 gateway_not_configured and NO database
//     write. A deployment without a gateway must not accumulate rows that
//     cannot be reconciled with anything.
//   - Nothing here ever logs the key, and gateway error text is passed through
//     pkg/redact before it reaches a log line, so an upstream that echoes a key
//     back in an error message cannot leak it (L4).
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jerry-halo2026/morchat.co/server/internal/gateway"
	"github.com/jerry-halo2026/morchat.co/server/pkg/redact"
)

const (
	// runtimeCredentialProvider is the only gateway implementation wired today.
	runtimeCredentialProvider = "newapi"
	// runtimeCredentialSecretPrefix domain-separates this ciphertext from every
	// other secret sealed with the same deployment key (VCS tokens, plugin
	// surfaces). Without it a VCS ciphertext would decrypt as a credential blob
	// and vice versa, and any future "swap the rows" bug becomes silent.
	runtimeCredentialSecretPrefix = "gateway-credential:v1:"
	// runtimeCredentialMask is what every read returns in place of a key.
	runtimeCredentialMask = "***"
	// runtimeCredentialSuffixLen is how much of the key the UI may show.
	runtimeCredentialSuffixLen = 4
	// runtimeCredentialMaxDeviceID bounds a client-supplied identifier that is
	// stored and echoed into the gateway token name's hash input.
	runtimeCredentialMaxDeviceID = 128
	// runtimeCredentialBodyLimit is the request cap: a device id, a model list,
	// and nothing else.
	runtimeCredentialBodyLimit = 16 << 10
)

// RuntimeCredentialAPI serves /api/runtime/credentials. It is constructed by
// cmd/server/router.go with the gateway client resolved from NEWAPI_*, which
// keeps Handler free of a field that only these three routes read and lets a
// test point a fake gateway at the same code path.
type RuntimeCredentialAPI struct {
	h  *Handler
	gw *gateway.Client
}

// NewRuntimeCredentialAPI wires the endpoints to a handler (for DB access) and
// a gateway client. A nil client is treated as "not configured" rather than
// panicking, so a stripped-down test handler still returns 503.
func NewRuntimeCredentialAPI(h *Handler, gw *gateway.Client) *RuntimeCredentialAPI {
	return &RuntimeCredentialAPI{h: h, gw: gw}
}

// runtimeCredentialMintResponse is the one and only response that carries a
// plaintext key. Field names are the desktop contract: `base_url`, `models`,
// `api_key` are read verbatim by runtime-configurator/bootstrap.ts.
type runtimeCredentialMintResponse struct {
	BaseURL      string   `json:"base_url"`
	Models       []string `json:"models"`
	APIKey       string   `json:"api_key"`
	APIKeySuffix string   `json:"api_key_suffix"`
	// ExpiresAt is always null: the credential is long-lived and decoupled from
	// the login session (plan section 1.2). Present so clients need no second shape.
	ExpiresAt *string `json:"expires_at"`
	Source    string  `json:"source"`
	Provider  string  `json:"provider"`
	TokenName string  `json:"token_name"`
	Rotated   bool    `json:"rotated"`
	CreatedAt *string `json:"created_at"`
}

// runtimeCredentialStatusResponse is every read: never a key.
type runtimeCredentialStatusResponse struct {
	Configured   bool     `json:"configured"`
	Provider     string   `json:"provider"`
	BaseURL      string   `json:"base_url"`
	Models       []string `json:"models"`
	APIKey       string   `json:"api_key"`
	APIKeySuffix string   `json:"api_key_suffix"`
	ExpiresAt    *string  `json:"expires_at"`
	Source       string   `json:"source"`
	Status       string   `json:"status"`
	DeviceID     string   `json:"device_id"`
	TokenName    string   `json:"token_name"`
	CreatedAt    *string  `json:"created_at"`
	RotatedAt    *string  `json:"rotated_at"`
}

type runtimeCredentialRequest struct {
	DeviceID    string   `json:"device_id"`
	Models      []string `json:"models"`
	WorkspaceID string   `json:"workspace_id"`
}

// Create handles POST /api/runtime/credentials.
func (a *RuntimeCredentialAPI) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	if !a.configured() {
		a.writeNotConfigured(w)
		return
	}
	var req runtimeCredentialRequest
	if !decodeRuntimeCredentialBody(w, r, &req) {
		return
	}
	deviceID, deviceOK := runtimeCredentialDeviceID(w, req.DeviceID)
	if !deviceOK {
		return
	}
	models := normalizeRuntimeCredentialModels(req.Models)
	if len(models) == 0 {
		models = a.gw.DefaultModels()
	}
	workspaceID, workspaceOK := a.resolveCredentialWorkspace(w, r, userID, req.WorkspaceID)
	if !workspaceOK {
		return
	}

	ctx := r.Context()
	// Build the gateway account first: it is idempotent, independent of any
	// credential row, and a failure here must leave the database untouched.
	upstreamUser, err := a.gw.EnsureUser(ctx, userID)
	if err != nil {
		a.writeGatewayFailure(ctx, w, "ensure_user", userID, err)
		return
	}

	if a.h == nil || a.h.TxStarter == nil {
		writeError(w, http.StatusInternalServerError, "credential store is not available")
		return
	}
	tx, err := a.h.TxStarter.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot start credential transaction")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Serialize per (user, device): two desktops that both think they need a
	// fresh key must not both mint one and leave an orphan token working on the
	// gateway with no row pointing at it.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 27))`, userID+"/"+deviceID); err != nil {
		writeError(w, http.StatusInternalServerError, "cannot lock credential")
		return
	}

	var previousID, previousTokenID string
	err = tx.QueryRow(ctx, `
		SELECT id::text, COALESCE(upstream_token_id, '')
		FROM public.gateway_credentials
		WHERE user_id = $1 AND provider = $2 AND device_id = $3 AND status = 'active'
		ORDER BY created_at DESC
		LIMIT 1
		FOR UPDATE`, userID, runtimeCredentialProvider, deviceID).Scan(&previousID, &previousTokenID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "cannot read existing credential")
		return
	}
	rotated := previousID != ""

	// Revoke before mint, and abort if the revoke cannot be confirmed: the
	// alternative is a second live key for the same device, which is exactly the
	// situation rotation exists to end. A gateway *outage* here fails closed and
	// leaves the old row active, so the employee keeps a working key.
	if rotated && previousTokenID != "" {
		if err := a.gw.RevokeToken(ctx, previousTokenID, userID); err != nil {
			a.writeGatewayFailure(ctx, w, "revoke_token", userID, err)
			return
		}
	}

	minted, err := a.gw.MintToken(ctx, userID, deviceID, models, a.gw.DefaultQuota())
	if err != nil {
		a.writeGatewayFailure(ctx, w, "mint_token", userID, err)
		return
	}
	sealed, err := a.sealRuntimeCredential(minted.Key)
	if err != nil {
		a.writeGatewayFailure(ctx, w, "seal_secret", userID, err)
		return
	}
	suffix := runtimeCredentialSuffix(minted.Key)

	if rotated {
		if _, err := tx.Exec(ctx, `
			UPDATE public.gateway_credentials
			SET status = 'revoked', revoked_at = now(), rotated_at = now()
			WHERE id = $1 AND status = 'active'`, previousID); err != nil {
			writeError(w, http.StatusInternalServerError, "cannot retire previous credential")
			return
		}
	}

	var (
		newID     string
		createdAt pgtype.Timestamptz
	)
	err = tx.QueryRow(ctx, `
		INSERT INTO public.gateway_credentials
			(user_id, workspace_id, provider, device_id, upstream_user_id, upstream_token_id,
			 token_name, secret_cipher, secret_suffix, models, quota, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
		RETURNING id::text, created_at`,
		userID, workspaceID, runtimeCredentialProvider, deviceID,
		upstreamUserIDText(upstreamUser.ID), upstreamTokenIDText(minted.ID),
		minted.Name, sealed, suffix, modelsOrEmpty(models), a.gw.DefaultQuota(),
	).Scan(&newID, &createdAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot store credential")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "cannot commit credential")
		return
	}

	// Counts and identifiers only. No key, no suffix - the suffix is short but
	// it is still key material, and log aggregation is the wrong place for it.
	slog.InfoContext(ctx, "runtime credential minted",
		"user_id", userID,
		"credential_id", newID,
		"provider", runtimeCredentialProvider,
		"token_name", minted.Name,
		"models", len(models),
		"rotated", rotated,
	)

	writeJSON(w, http.StatusOK, runtimeCredentialMintResponse{
		BaseURL:      a.gw.OpenAIBaseURL(),
		Models:       modelsOrEmpty(models),
		APIKey:       minted.Key,
		APIKeySuffix: suffix,
		ExpiresAt:    nil,
		Source:       "company",
		Provider:     runtimeCredentialProvider,
		TokenName:    minted.Name,
		Rotated:      rotated,
		CreatedAt:    timestampToPtr(createdAt),
	})
}

// Get handles GET /api/runtime/credentials. Status only: whether a credential
// exists for this device, which suffix it ends with, and when it was rotated.
func (a *RuntimeCredentialAPI) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	if !a.configured() {
		a.writeNotConfigured(w)
		return
	}
	deviceID := strings.TrimSpace(r.URL.Query().Get("device_id"))
	if len(deviceID) > runtimeCredentialMaxDeviceID {
		writeError(w, http.StatusBadRequest, "device_id is too long")
		return
	}

	view := runtimeCredentialStatusResponse{
		Provider:  runtimeCredentialProvider,
		BaseURL:   a.gw.OpenAIBaseURL(),
		Models:    []string{},
		Source:    "company",
		ExpiresAt: nil,
		DeviceID:  deviceID,
		Status:    "none",
	}

	var (
		suffix    string
		models    []string
		tokenName string
		createdAt pgtype.Timestamptz
		rotatedAt pgtype.Timestamptz
	)
	// Scoped by user_id first: a caller who guesses another employee's device_id
	// still matches no row of their own and reads "not configured" (isolation is
	// the WHERE clause, not a check the handler can forget).
	err := a.h.DB.QueryRow(r.Context(), `
		SELECT secret_suffix, models, token_name, created_at, rotated_at
		FROM public.gateway_credentials
		WHERE user_id = $1 AND provider = $2 AND status = 'active'
		  AND ($3 = '' OR device_id = $3)
		ORDER BY created_at DESC
		LIMIT 1`, userID, runtimeCredentialProvider, deviceID).Scan(&suffix, &models, &tokenName, &createdAt, &rotatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusOK, view)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot read credential")
		return
	}
	view.Configured = true
	view.Status = "active"
	view.APIKey = runtimeCredentialMask + suffix
	view.APIKeySuffix = suffix
	view.Models = modelsOrEmpty(models)
	view.TokenName = tokenName
	view.CreatedAt = timestampToPtr(createdAt)
	view.RotatedAt = timestampToPtr(rotatedAt)
	writeJSON(w, http.StatusOK, view)
}

// Delete handles DELETE /api/runtime/credentials.
//
// With a device_id it revokes that device; without one it revokes every live
// credential the user holds, which is what "sign out everywhere" and "member
// removed" both need (plan section 1.2(c)).
func (a *RuntimeCredentialAPI) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	if !a.configured() {
		a.writeNotConfigured(w)
		return
	}
	deviceID := strings.TrimSpace(r.URL.Query().Get("device_id"))
	if len(deviceID) > runtimeCredentialMaxDeviceID {
		writeError(w, http.StatusBadRequest, "device_id is too long")
		return
	}

	ctx := r.Context()
	if a.h == nil || a.h.TxStarter == nil {
		writeError(w, http.StatusInternalServerError, "credential store is not available")
		return
	}
	tx, err := a.h.TxStarter.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot start credential transaction")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	rows, err := tx.Query(ctx, `
		SELECT id::text, COALESCE(upstream_token_id, '')
		FROM public.gateway_credentials
		WHERE user_id = $1 AND provider = $2 AND status = 'active'
		  AND ($3 = '' OR device_id = $3)
		FOR UPDATE`, userID, runtimeCredentialProvider, deviceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot read credentials to revoke")
		return
	}
	type liveCredential struct{ id, tokenID string }
	live := make([]liveCredential, 0, 2)
	for rows.Next() {
		var row liveCredential
		if err := rows.Scan(&row.id, &row.tokenID); err != nil {
			rows.Close()
			writeError(w, http.StatusInternalServerError, "cannot read credentials to revoke")
			return
		}
		live = append(live, row)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "cannot read credentials to revoke")
		return
	}

	// Upstream first, row second: a row marked revoked while the gateway token
	// still works would be a lie the UI shows as "revoked".
	for _, credential := range live {
		if err := a.gw.RevokeToken(ctx, credential.tokenID, userID); err != nil {
			a.writeGatewayFailure(ctx, w, "revoke_token", userID, err)
			return
		}
	}
	for _, credential := range live {
		if _, err := tx.Exec(ctx, `
			UPDATE public.gateway_credentials
			SET status = 'revoked', revoked_at = now()
			WHERE id = $1 AND status = 'active'`, credential.id); err != nil {
			writeError(w, http.StatusInternalServerError, "cannot revoke credential")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "cannot commit revocation")
		return
	}
	if len(live) > 0 {
		slog.InfoContext(ctx, "runtime credential revoked", "user_id", userID, "revoked", len(live))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"revoked":  len(live),
		"status":   "revoked",
		"provider": runtimeCredentialProvider,
	})
}

// ---- helpers ------------------------------------------------------------

func (a *RuntimeCredentialAPI) configured() bool {
	ok := a != nil && a.h != nil && a.gw != nil && a.gw.Configured()
	if !ok {
		slog.Warn("runtime credentials: configured() false",
			"api", a != nil,
			"handler", a != nil && a.h != nil,
			"gw", a != nil && a.gw != nil,
			"base", a != nil && a.gw != nil && a.gw.BaseURL() != "",
			"reason", a.configuredReason())
	}
	return ok
}

// configuredReason names the half that is missing when configured() is false, so a
// 503 in the log does not send the next reader back into the environment.
func (a *RuntimeCredentialAPI) configuredReason() string {
	switch {
	case a == nil:
		return "api nil"
	case a.h == nil:
		return "handler nil"
	case a.gw == nil:
		return "gateway client nil"
	case a.gw.BaseURL() == "":
		return "gateway base url missing"
	case !a.gw.Configured():
		return "gateway admin token missing"
	default:
		return "configured"
	}
}

// writeNotConfigured is the documented 503. It runs before any database access
// so an unconfigured deployment writes nothing.
func (a *RuntimeCredentialAPI) writeNotConfigured(w http.ResponseWriter) {
	slog.Warn("runtime credentials: not configured", "reason", a.configuredReason())
	writeErrorCode(w, http.StatusServiceUnavailable, "gateway_not_configured",
		"company model gateway is not configured on this deployment")
}

// writeGatewayFailure maps the two gateway sentinels onto HTTP and logs the
// cause with the key-shaped parts of the upstream message redacted. The log
// line never carries a token, and never carries a value that merely looks like
// one either.
func (a *RuntimeCredentialAPI) writeGatewayFailure(ctx context.Context, w http.ResponseWriter, op, userID string, err error) {
	detail := err.Error()
	if errors.Is(err, gateway.ErrNotConfigured) {
		slog.WarnContext(ctx, "runtime credential gateway not configured",
			"op", op, "user_id", userID, "err", redact.Text(detail),
			"client_configured", a.gw != nil && a.gw.Configured())
		a.writeNotConfigured(w)
		return
	}
	if errors.Is(err, gateway.ErrGatewayUnavailable) {
		slog.WarnContext(ctx, "runtime credential gateway unavailable",
			"user_id", userID, "op", op, "error", redact.Text(detail))
		writeErrorCode(w, http.StatusBadGateway, "gateway_unavailable",
			"the model gateway could not be reached; try again shortly")
		return
	}
	if errors.Is(err, gateway.ErrGatewayRejected) {
		slog.WarnContext(ctx, "runtime credential gateway rejected request",
			"user_id", userID, "op", op, "error", redact.Text(detail))
		writeErrorCode(w, http.StatusBadGateway, "gateway_rejected",
			"the model gateway rejected the credential request")
		return
	}
	slog.ErrorContext(ctx, "runtime credential failed",
		"user_id", userID, "op", op, "error", redact.Text(detail))
	writeError(w, http.StatusInternalServerError, "cannot issue gateway credential")
}

// sealRuntimeCredential encrypts a freshly minted key with the deployment's
// secretbox (AES-256-GCM, key from MULTICA_VCS_SECRET_KEY, the same box the VCS
// integration uses) and returns the ciphertext for the bytea column.
//
// A deployment without that key cannot store a credential safely, so it gets a
// 503 rather than a plaintext column.
func (a *RuntimeCredentialAPI) sealRuntimeCredential(key string) ([]byte, error) {
	if a.h == nil || a.h.VCSSecretBox == nil {
		return nil, fmt.Errorf("%w: at-rest key (MULTICA_VCS_SECRET_KEY) is unset", gateway.ErrNotConfigured)
	}
	if key == "" {
		return nil, fmt.Errorf("%w: gateway returned an empty key", gateway.ErrGatewayRejected)
	}
	return a.h.VCSSecretBox.Seal([]byte(runtimeCredentialSecretPrefix + key))
}

// openRuntimeCredential reverses sealRuntimeCredential. It exists for the
// rotation audit path and tests; no HTTP response ever returns its output.
func (a *RuntimeCredentialAPI) openRuntimeCredential(sealed []byte) (string, error) {
	if a.h == nil || a.h.VCSSecretBox == nil {
		return "", fmt.Errorf("%w: at-rest key (MULTICA_VCS_SECRET_KEY) is unset", gateway.ErrNotConfigured)
	}
	plaintext, err := a.h.VCSSecretBox.Open(sealed)
	if err != nil {
		return "", err
	}
	raw := string(plaintext)
	if !strings.HasPrefix(raw, runtimeCredentialSecretPrefix) {
		// Refusing a foreign ciphertext is the point of the prefix: the same key
		// seals VCS tokens, and one must never open as the other.
		return "", errors.New("gateway credential: ciphertext is not a gateway credential")
	}
	return strings.TrimPrefix(raw, runtimeCredentialSecretPrefix), nil
}

// resolveCredentialWorkspace validates an optional workspace attribution.
// Minting is user-scoped, so a workspace that the caller is not a member of is
// a 403 rather than a silently dropped label: attribution a client believes it
// set is worse than none.
func (a *RuntimeCredentialAPI) resolveCredentialWorkspace(w http.ResponseWriter, r *http.Request, userID, raw string) (any, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, true
	}
	workspace, ok := parseUUIDOrBadRequest(w, raw, "workspace_id")
	if !ok {
		return nil, false
	}
	var member bool
	if err := a.h.DB.QueryRow(r.Context(), `
		SELECT EXISTS(SELECT 1 FROM public.member WHERE workspace_id = $1 AND user_id = $2)`,
		uuidToString(workspace), userID).Scan(&member); err != nil {
		writeError(w, http.StatusInternalServerError, "cannot verify workspace membership")
		return nil, false
	}
	if !member {
		writeError(w, http.StatusForbidden, "not a member of that workspace")
		return nil, false
	}
	return raw, true
}

func decodeRuntimeCredentialBody(w http.ResponseWriter, r *http.Request, dst *runtimeCredentialRequest) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, runtimeCredentialBodyLimit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid credential request")
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeError(w, http.StatusBadRequest, "credential request must contain one JSON object")
		return false
	}
	return true
}

func runtimeCredentialDeviceID(w http.ResponseWriter, raw string) (string, bool) {
	deviceID := strings.TrimSpace(raw)
	if deviceID == "" {
		writeError(w, http.StatusBadRequest, "device_id is required")
		return "", false
	}
	if len(deviceID) > runtimeCredentialMaxDeviceID {
		writeError(w, http.StatusBadRequest, "device_id is too long")
		return "", false
	}
	return deviceID, true
}

// normalizeRuntimeCredentialModels trims and de-duplicates the requested
// allowlist. The gateway client caps it again; doing it here keeps the stored
// array identical to what was minted.
func normalizeRuntimeCredentialModels(models []string) []string {
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
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// runtimeCredentialSuffix is the last 4 characters of a key. Short keys (which
// no real gateway issues) degrade to whatever exists rather than panicking.
func runtimeCredentialSuffix(key string) string {
	if len(key) <= runtimeCredentialSuffixLen {
		return key
	}
	return key[len(key)-runtimeCredentialSuffixLen:]
}

func modelsOrEmpty(models []string) []string {
	if models == nil {
		return []string{}
	}
	return models
}

func upstreamUserIDText(id int64) any {
	if id <= 0 {
		return nil
	}
	return fmt.Sprintf("%d", id)
}

func upstreamTokenIDText(id int64) any {
	if id <= 0 {
		return nil
	}
	return fmt.Sprintf("%d", id)
}

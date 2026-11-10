package handler

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"
)

// Credential dimension for `task_usage` (migration 624).
//
// A run is paid for by exactly one of two credentials, and the difference is
// commercial, not cosmetic: 'company' is the gateway key the server minted and
// the company ledger pays for it; 'personal' is a key the employee typed into
// Settings on one machine, and their own account pays. The desktop side already
// records which one a run used (`RunRecord.credentialSource`, see
// apps/desktop/src/main/runtime-configurator/credential.ts) — this file is the
// server half: persist it on the usage row, and report the split.
//
// Deliberately read-only with respect to money. Nothing here prices, sums into
// an invoice, or rewrites a cost: `cost_usd_ticks` and `credits_micros` keep
// their existing meaning, and a row with no source still reports its tokens.
// The only thing this dimension changes is which line of the report a usage
// figure appears on.
const (
	// CredentialSourceCompany is the per-user gateway key.
	CredentialSourceCompany = "company"
	// CredentialSourcePersonal is a key stored on one device by its owner.
	CredentialSourcePersonal = "personal"
	// CredentialSourceUnknown is report-only: rows written before migration 624,
	// or by a daemon that does not report the field. Never stored.
	CredentialSourceUnknown = "unknown"
)

// normalizeCredentialSource maps a reported string onto the closed vocabulary,
// or "" when it is not a source at all.
//
// Lowercasing and trimming here is what keeps the database CHECK from becoming
// a 500: `Personal`, ` personal ` and `PERSONAL` are one source, and an empty or
// unrecognised value means "this report does not know" — which must not clear a
// source an earlier report in the same run already established.
func normalizeCredentialSource(raw string) string {
	switch len(raw) {
	case 0:
		return ""
	}
	trimmed := raw
	for len(trimmed) > 0 && (trimmed[0] == ' ' || trimmed[0] == '\t' || trimmed[0] == '\n' || trimmed[0] == '\r') {
		trimmed = trimmed[1:]
	}
	for len(trimmed) > 0 {
		last := trimmed[len(trimmed)-1]
		if last != ' ' && last != '\t' && last != '\n' && last != '\r' {
			break
		}
		trimmed = trimmed[:len(trimmed)-1]
	}
	switch lowerASCII(trimmed) {
	case CredentialSourceCompany:
		return CredentialSourceCompany
	case CredentialSourcePersonal:
		return CredentialSourcePersonal
	default:
		return ""
	}
}

// lowerASCII lowercases ASCII only. The vocabulary is ASCII, so this avoids
// pulling strings.ToLower's Unicode tables into a hot path for two literals.
func lowerASCII(value string) string {
	needs := false
	for i := 0; i < len(value); i++ {
		if value[i] >= 'A' && value[i] <= 'Z' {
			needs = true
			break
		}
	}
	if !needs {
		return value
	}
	out := []byte(value)
	for i := 0; i < len(out); i++ {
		if out[i] >= 'A' && out[i] <= 'Z' {
			out[i] += 'a' - 'A'
		}
	}
	return string(out)
}

// setTaskUsageCredentialSource stamps the credential dimension onto the row the
// usage report just upserted.
//
// A separate UPDATE rather than a new column in UpsertTaskUsage keeps the
// generated sqlc contract (and every existing caller) untouched, and makes the
// "unknown does not overwrite a known source" rule explicit: an empty or
// unrecognised value is a no-op, never a write of NULL. `IS DISTINCT FROM`
// keeps a re-report of the same run from churning the row.
func (h *Handler) setTaskUsageCredentialSource(
	ctx context.Context,
	taskID pgtype.UUID,
	provider string,
	model string,
	source string,
) error {
	normalized := normalizeCredentialSource(source)
	if normalized == "" || h.DB == nil {
		return nil
	}
	_, err := h.DB.Exec(ctx, `
		UPDATE task_usage
		SET credential_source = $4
		WHERE task_id = $1
		  AND provider = $2
		  AND model = $3
		  AND credential_source IS DISTINCT FROM $4`,
		taskID, provider, model, normalized,
	)
	return err
}

// TaskUsageByCredentialSourceRow is one line of the credential report: the
// tokens a source spent over the window.
//
// The model dimension is folded away on purpose — the question this endpoint
// answers is "how much of this month's usage was the company's and how much was
// someone's own key", and a per-model breakdown of that would be a table nobody
// asked for. Cost is split the same way the dashboard splits it: `CostUSDTicks`
// is what the provider itself charged for priced rows, and the `Uncosted*`
// counts are the tokens behind unpriced rows, so a client pricing from its own
// rate table can finish the job without double-counting.
type TaskUsageByCredentialSourceRow struct {
	// CredentialSource is 'company', 'personal', or 'unknown' for rows written
	// before the dimension existed (or by a daemon that does not report it).
	CredentialSource string `json:"credential_source"`
	InputTokens      int64  `json:"input_tokens"`
	OutputTokens     int64  `json:"output_tokens"`
	CacheReadTokens  int64  `json:"cache_read_tokens"`
	CacheWriteTokens int64  `json:"cache_write_tokens"`
	CostUSDTicks     int64  `json:"cost_usd_ticks"`

	UncostedInputTokens      int64 `json:"uncosted_input_tokens"`
	UncostedOutputTokens     int64 `json:"uncosted_output_tokens"`
	UncostedCacheReadTokens  int64 `json:"uncosted_cache_read_tokens"`
	UncostedCacheWriteTokens int64 `json:"uncosted_cache_write_tokens"`

	TaskCount int32 `json:"task_count"`
}

// GetTaskUsageByCredentialSource returns workspace usage grouped by the
// credential that paid for it, over the same `?days=N` window (default 30,
// capped at 365) as the other usage rollups.
//
// Served from the raw `task_usage` table rather than `task_usage_hourly`: the
// hourly rollup is keyed by (workspace, runtime, provider, model) and carries
// no credential dimension, so adding one there would mean widening a rollup
// that other readers (`dashboard`, `runtimes`) already depend on. Raw rows at
// one page per workspace per window are cheap, and this keeps the dimension
// additive — deleting 624 deletes the feature, with no rollup to rebuild.
//
// Authorization is the ordinary workspace membership check: who paid is
// commercially sensitive, but it is the same audience that can already read the
// workspace's billing tab.
func (h *Handler) GetTaskUsageByCredentialSource(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	if _, ok := h.workspaceMember(w, r, workspaceID); !ok {
		return
	}
	// Exact-N cutoff for the same reason the per-agent rollups use it: this
	// response carries no date axis, so the client cannot trim a surplus
	// calendar day client-side.
	since := parseExactSinceParamInTZ(r, 30, h.resolveViewingTZ(r))

	rows, err := h.listTaskUsageByCredentialSource(r.Context(), parseUUID(workspaceID), since)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list usage by credential source")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (h *Handler) listTaskUsageByCredentialSource(
	ctx context.Context,
	workspaceID pgtype.UUID,
	since pgtype.Timestamptz,
) ([]TaskUsageByCredentialSourceRow, error) {
	// The workspace is reached through agent_task_queue -> agent, not through
	// issue: chat-triggered runs have no issue_id, and dropping them here would
	// silently under-report exactly the personal usage this endpoint exists to
	// surface.
	rows, err := h.DB.Query(ctx, `
		SELECT
			COALESCE(tu.credential_source, 'unknown')                                   AS credential_source,
			COALESCE(SUM(tu.input_tokens), 0)::bigint                                   AS input_tokens,
			COALESCE(SUM(tu.output_tokens), 0)::bigint                                  AS output_tokens,
			COALESCE(SUM(tu.cache_read_tokens), 0)::bigint                              AS cache_read_tokens,
			COALESCE(SUM(tu.cache_write_tokens), 0)::bigint                             AS cache_write_tokens,
			COALESCE(SUM(tu.cost_usd_ticks), 0)::bigint                                 AS cost_usd_ticks,
			COALESCE(SUM(tu.input_tokens)       FILTER (WHERE tu.cost_usd_ticks IS NULL), 0)::bigint AS uncosted_input_tokens,
			COALESCE(SUM(tu.output_tokens)      FILTER (WHERE tu.cost_usd_ticks IS NULL), 0)::bigint AS uncosted_output_tokens,
			COALESCE(SUM(tu.cache_read_tokens)  FILTER (WHERE tu.cost_usd_ticks IS NULL), 0)::bigint AS uncosted_cache_read_tokens,
			COALESCE(SUM(tu.cache_write_tokens) FILTER (WHERE tu.cost_usd_ticks IS NULL), 0)::bigint AS uncosted_cache_write_tokens,
			COUNT(DISTINCT tu.task_id)::int                                             AS task_count
		FROM task_usage tu
		JOIN agent_task_queue atq ON atq.id = tu.task_id
		JOIN agent a              ON a.id   = atq.agent_id
		WHERE a.workspace_id = $1
		  AND tu.created_at >= $2
		GROUP BY COALESCE(tu.credential_source, 'unknown')
		ORDER BY COALESCE(tu.credential_source, 'unknown')`,
		workspaceID, since,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []TaskUsageByCredentialSourceRow{}
	for rows.Next() {
		var row TaskUsageByCredentialSourceRow
		if err := rows.Scan(
			&row.CredentialSource,
			&row.InputTokens,
			&row.OutputTokens,
			&row.CacheReadTokens,
			&row.CacheWriteTokens,
			&row.CostUSDTicks,
			&row.UncostedInputTokens,
			&row.UncostedOutputTokens,
			&row.UncostedCacheReadTokens,
			&row.UncostedCacheWriteTokens,
			&row.TaskCount,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

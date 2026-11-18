package handler

// Workbench entity search: GET /api/workbench/search.
//
// The command palette could already reach issues, projects, people and the
// platform's own objects. It could not reach the workbench: a creator, a collab,
// a quote, a goal or a topic pool idea was only findable by opening its page and
// scrolling. This handler is that read — one query string, five kinds, rows the
// palette can render and navigate to.
//
// Four decisions shape it:
//
//   - **Read-only, workspace-scoped, capability-free.** It answers GET, resolves
//     the workspace from the authorized request (the same `resolveWorkspaceID`
//     every workbench read uses) and returns only rows of that workspace. It
//     grants nothing: every caller who can reach this endpoint is already a
//     member, and seeing a title is not a permission to write the row.
//
//   - **Title matching, not full-text ranking.** `creator`, `crm_collab`,
//     `creator_quote`, `goal_okr` and `media_topic` are product tables with a few
//     thousand rows at most; a `ILIKE '%q%'` over the display column answers in
//     milliseconds and needs no index of its own. The query still runs through
//     `runSearchQuery`, so it inherits the platform search's read-only
//     transaction, statement timeout and cancellation handling — a pathological
//     pattern fails fast instead of pinning a connection.
//
//   - **`href` is workspace-absolute.** The row carries the page a reader should
//     land on (`/{slug}/sales/collabs`), built from the workspace's own slug. The
//     slug is read once per request rather than returned per row, and a caller
//     that has no slug to spend gets the same shape the web client expects. Rows
//     name a page, not a deep link: none of these ledgers has a detail route —
//     each opens a sheet on the page it lists.
//
//   - **`subtitle` carries data, not copy.** It is the row's own tokens joined by
//     " · " (`douyin · @kitchen_notes`, `negotiating`), never an English word like
//     "stage". Labels belong to whichever bundle is on screen, so the client
//     decides what to call each token; the server does not ship display copy
//     (COLLAB-MODEL §1's machine-value rule, applied to the payload).

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/logger"
)

const (
	// workbenchSearchDefaultLimit / workbenchSearchMaxLimit bound one kind's
	// rows. A palette group shows a handful; 20 per kind is already more than a
	// reader scrolls, and the cap keeps five queries' worth of JSON small.
	workbenchSearchDefaultLimit = 8
	workbenchSearchMaxLimit     = 20
)

// The five kinds, in the order the answer lists them. `media_topic` is spelled
// as the table so the name does not collide with a generic "topic" the platform
// may grow later.
const (
	workbenchSearchKindCreator = "creator"
	workbenchSearchKindCollab  = "collab"
	workbenchSearchKindQuote   = "quote"
	workbenchSearchKindGoal    = "goal"
	workbenchSearchKindTopic   = "media_topic"
)

// workbenchSearchKindOrder is the response order and the default kind set.
var workbenchSearchKindOrder = []string{
	workbenchSearchKindCreator,
	workbenchSearchKindCollab,
	workbenchSearchKindQuote,
	workbenchSearchKindGoal,
	workbenchSearchKindTopic,
}

// workbenchSearchKinds maps a kind onto the page its rows open on, as a path
// under the workspace slug. Kept beside the queries below: a kind whose route
// moved would otherwise send every palette row to a page that no longer exists.
var workbenchSearchRoutes = map[string]string{
	workbenchSearchKindCreator: "/sales/creators",
	workbenchSearchKindCollab:  "/sales/collabs",
	workbenchSearchKindQuote:   "/sales/quotes",
	workbenchSearchKindGoal:    "/boss/goals",
	workbenchSearchKindTopic:   "/content/topics",
}

// WorkbenchSearchResponse is one answer: the rows, plus the kinds that were
// asked for so a client can tell "no match" from "not searched".
type WorkbenchSearchResponse struct {
	Results []WorkbenchSearchResult `json:"results"`
	Kinds   []string                `json:"kinds"`
}

// WorkbenchSearchResult is one row the palette can render and open.
type WorkbenchSearchResult struct {
	Kind     string `json:"kind"`
	ID       string `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	Href     string `json:"href"`
}

// WorkbenchSearch serves GET /api/workbench/search?q=&kinds=&limit=.
func (h *Handler) WorkbenchSearch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	workspaceID := h.resolveWorkspaceID(r)

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		writeError(w, http.StatusBadRequest, "q parameter is required")
		return
	}

	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}

	limit := workbenchSearchDefaultLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			limit = v
		}
	}
	if limit > workbenchSearchMaxLimit {
		limit = workbenchSearchMaxLimit
	}

	kinds, ok := h.parseWorkbenchSearchKinds(w, r.URL.Query().Get("kinds"))
	if !ok {
		return
	}

	workspace, err := h.Queries.GetWorkspace(ctx, wsUUID)
	if err != nil {
		slog.Warn("workbench search: load workspace failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to resolve workspace")
		return
	}

	// One `%q%` pattern, escaped for LIKE so a query containing `%` or `_`
	// matches those characters literally rather than acting as wildcards.
	pattern := "%" + escapeLikePattern(q) + "%"
	base := "/" + workspace.Slug

	results := make([]WorkbenchSearchResult, 0, len(kinds)*limit)
	for _, kind := range kinds {
		rows, err := h.searchWorkbenchKind(ctx, r, kind, wsUUID, pattern, limit)
		if err != nil {
			if writeSearchCancellation(w, r, err) {
				return
			}
			if isSearchStatementTimeout(err) {
				writeError(w, http.StatusServiceUnavailable, "search timed out; please refine your query or try again")
				return
			}
			slog.Warn("workbench search failed", append(logger.RequestAttrs(r),
				"error", err, "kind", kind, "query", q)...)
			writeError(w, http.StatusInternalServerError, "failed to search "+kind)
			return
		}
		for i := range rows {
			rows[i].Kind = kind
			rows[i].Href = base + workbenchSearchRoutes[kind]
		}
		results = append(results, rows...)
	}
	if writeSearchCancellation(w, r, ctx.Err()) {
		return
	}

	writeJSON(w, http.StatusOK, WorkbenchSearchResponse{Results: results, Kinds: kinds})
}

// parseWorkbenchSearchKinds reads the optional `kinds` filter. An unknown kind
// is a 400 rather than a silently empty group: a caller asking for a kind this
// build does not serve has a typo, and answering "no results" would hide it.
func (h *Handler) parseWorkbenchSearchKinds(w http.ResponseWriter, raw string) ([]string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return append([]string(nil), workbenchSearchKindOrder...), true
	}
	known := make(map[string]bool, len(workbenchSearchKindOrder))
	for _, kind := range workbenchSearchKindOrder {
		known[kind] = true
	}
	var kinds []string
	seen := make(map[string]bool, len(workbenchSearchKindOrder))
	for _, part := range strings.Split(raw, ",") {
		kind := strings.TrimSpace(part)
		if kind == "" {
			continue
		}
		if !known[kind] {
			writeError(w, http.StatusBadRequest,
				"unknown kind "+kind+"; supported: "+strings.Join(workbenchSearchKindOrder, ", "))
			return nil, false
		}
		if seen[kind] {
			continue
		}
		seen[kind] = true
		kinds = append(kinds, kind)
	}
	if len(kinds) == 0 {
		return append([]string(nil), workbenchSearchKindOrder...), true
	}
	return kinds, true
}

// searchWorkbenchKind runs one kind's query.
//
// Every query filters on `workspace_id` first, then on the pattern, then on
// `archived_at IS NULL` — a soft-deleted row is not a search result. Each is
// ordered by `updated_at DESC` so "the one I just edited" is at the top, and by
// id to make the order total.
func (h *Handler) searchWorkbenchKind(
	ctx context.Context,
	r *http.Request,
	kind string,
	wsUUID pgtype.UUID,
	pattern string,
	limit int,
) ([]WorkbenchSearchResult, error) {
	query, ok := workbenchSearchSQL[kind]
	if !ok {
		return nil, fmt.Errorf("no query for kind %s", kind)
	}
	args := []any{wsUUID, pattern, limit}

	var rows []WorkbenchSearchResult
	err := runSearchQuery(ctx, h.TxStarter, query, args, func(pgxRows pgx.Rows) error {
		for pgxRows.Next() {
			var row WorkbenchSearchResult
			var subtitle *string
			if err := pgxRows.Scan(&row.ID, &row.Title, &subtitle); err != nil {
				return fmt.Errorf("scan: %w", err)
			}
			if subtitle != nil {
				row.Subtitle = *subtitle
			}
			rows = append(rows, row)
		}
		return pgxRows.Err()
	})
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// workbenchSearchSQL is one query per kind, all with the same shape:
//
//	SELECT id, title, subtitle FROM … WHERE workspace_id = $1
//	  AND <display column> ILIKE $2 AND archived_at IS NULL
//	  ORDER BY updated_at DESC, id ASC LIMIT $3
//
// `subtitle` is NULLIF-safe: it is built with concat_ws, which drops NULL parts,
// so a row missing its optional token still produces a clean subtitle rather
// than a trailing separator.
var workbenchSearchSQL = map[string]string{
	workbenchSearchKindCreator: `
		SELECT c.id,
		       c.display_name,
		       NULLIF(concat_ws(' · ', c.platform, NULLIF('@' || c.handle, '@')), '')
		FROM creator c
		WHERE c.workspace_id = $1
		  AND c.archived_at IS NULL
		  AND c.display_name ILIKE $2
		ORDER BY c.updated_at DESC, c.id ASC
		LIMIT $3`,
	workbenchSearchKindCollab: `
		SELECT x.id,
		       NULLIF(concat_ws(' · ', c.display_name, b.title), ''),
		       x.stage
		FROM crm_collab x
		LEFT JOIN creator c ON c.id = x.creator_id AND c.workspace_id = x.workspace_id
		LEFT JOIN crm_brief b ON b.id = x.brief_id AND b.workspace_id = x.workspace_id
		WHERE x.workspace_id = $1
		  AND x.archived_at IS NULL
		  AND (c.display_name ILIKE $2 OR b.title ILIKE $2)
		ORDER BY x.updated_at DESC, x.id ASC
		LIMIT $3`,
	workbenchSearchKindQuote: `
		SELECT q.id,
		       c.display_name,
		       NULLIF(concat_ws(' · ', q.status, q.fee_amount::text, q.currency), '')
		FROM creator_quote q
		LEFT JOIN creator c ON c.id = q.creator_id AND c.workspace_id = q.workspace_id
		WHERE q.workspace_id = $1
		  AND q.archived_at IS NULL
		  AND c.display_name ILIKE $2
		ORDER BY q.updated_at DESC, q.id ASC
		LIMIT $3`,
	workbenchSearchKindGoal: `
		SELECT g.id,
		       g.title,
		       NULLIF(concat_ws(' · ', g.cycle, g.status), '')
		FROM goal_okr g
		WHERE g.workspace_id = $1
		  AND g.archived_at IS NULL
		  AND g.title ILIKE $2
		ORDER BY g.updated_at DESC, g.id ASC
		LIMIT $3`,
	workbenchSearchKindTopic: `
		SELECT t.id,
		       t.title,
		       NULLIF(concat_ws(' · ', t.status, t.source), '')
		FROM media_topic t
		WHERE t.workspace_id = $1
		  AND t.archived_at IS NULL
		  AND t.title ILIKE $2
		ORDER BY t.updated_at DESC, t.id ASC
		LIMIT $3`,
}

// escapeLikePattern neutralises the three LIKE metacharacters so a query of
// "50%" searches for those two characters instead of matching everything after
// "50". The queries above use ILIKE, whose default escape is the backslash, so
// the pattern is what needs escaping — not the SQL. (`property.go` owns the same
// helper for issue-property filters; one implementation, one escape rule.)

package handler

// Creator content health: the read surface over `creator_metric`
// (docs/engineering/WORKBENCH-DATA-CONTRACT.md §2.3,
// docs/engineering/WORKBENCH-API.md §19).
//
// Two rules shape this file, and both come from the contract rather than from the
// screens:
//
//   - A creator without a snapshot is still in the list. "Nobody has sampled this
//     person yet" is information; filtering the row out would make the health
//     board quietly shorter than the creator list it summarizes.
//   - A NULL metric stays NULL on the wire. `engagement_rate: null` renders as
//     "no data"; `engagement_rate: 0` would claim this creator has no engagement,
//     which is a different and untrue statement.
//
// Everything here is a read: the numbers are written by `cmd/orange-sync -videos`,
// which is the only writer of `creator_video` and `creator_metric`.

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

const (
	// healthSortFans is the default ordering: the biggest accounts first, which is
	// the only ordering that is meaningful before any content has been sampled.
	healthSortFans = "fans"
	// healthSortEngagement orders by the latest engagement rate, highest first.
	healthSortEngagement = "engagement"
	// healthSortHit orders by the latest hit rate, highest first.
	healthSortHit = "hit"

	// healthRecentDays is the trend window the detail endpoint returns: today plus
	// the 29 days before it, i.e. the last 30 calendar days.
	healthRecentDays = 29
)

// CreatorHealthEntry is one row of the health board: a creator and its latest
// snapshot, flattened. The two counts and `captured_on` are nullable because a
// creator without a snapshot has no value for them — they are not zero.
type CreatorHealthEntry struct {
	ID              string   `json:"id"`
	DisplayName     string   `json:"display_name"`
	Fans            int64    `json:"fans"`
	EngagementRate  *float64 `json:"engagement_rate"`
	HitRate         *float64 `json:"hit_rate"`
	PostsLast30D    *int32   `json:"posts_last_30d"`
	VideosWithStats *int32   `json:"videos_with_stats"`
	CapturedOn      *string  `json:"captured_on"`
}

// CreatorHealthListResponse is the board envelope. `total` is this page's row
// count, the same convention the creator list uses; `next_cursor` is the last
// row's id, and only a full page can have a successor.
type CreatorHealthListResponse struct {
	Creators   []CreatorHealthEntry `json:"creators"`
	Total      int                  `json:"total"`
	NextCursor *string              `json:"next_cursor"`
}

// CreatorMetricResponse is one day's snapshot on the wire. Every measure is
// nullable, and `sample_note` says why when they are.
type CreatorMetricResponse struct {
	ID              string   `json:"id"`
	WorkspaceID     string   `json:"workspace_id"`
	CreatorID       string   `json:"creator_id"`
	CapturedOn      string   `json:"captured_on"`
	VideoCount      *int32   `json:"video_count"`
	VideosWithStats *int32   `json:"videos_with_stats"`
	PostsLast30D    *int32   `json:"posts_last_30d"`
	AvgDigg         *float64 `json:"avg_digg"`
	AvgComment      *float64 `json:"avg_comment"`
	AvgShare        *float64 `json:"avg_share"`
	EngagementRate  *float64 `json:"engagement_rate"`
	HitRate         *float64 `json:"hit_rate"`
	SampleNote      *string  `json:"sample_note"`
	CreatedAt       string   `json:"created_at"`
	UpdatedAt       string   `json:"updated_at"`
}

// CreatorHealthDetailResponse is one creator's health: the newest snapshot plus
// the 30-day trend, newest day first.
type CreatorHealthDetailResponse struct {
	CreatorID string                  `json:"creator_id"`
	Latest    *CreatorMetricResponse  `json:"latest"`
	Recent    []CreatorMetricResponse `json:"recent"`
}

func creatorMetricToResponse(m db.CreatorMetric) CreatorMetricResponse {
	return CreatorMetricResponse{
		ID:              uuidToString(m.ID),
		WorkspaceID:     uuidToString(m.WorkspaceID),
		CreatorID:       uuidToString(m.CreatorID),
		CapturedOn:      dateToString(m.CapturedOn),
		VideoCount:      int4ToPtr(m.VideoCount),
		VideosWithStats: int4ToPtr(m.VideosWithStats),
		PostsLast30D:    int4ToPtr(m.PostsLast30d),
		AvgDigg:         numericToFloatPtr(m.AvgDigg),
		AvgComment:      numericToFloatPtr(m.AvgComment),
		AvgShare:        numericToFloatPtr(m.AvgShare),
		EngagementRate:  numericToFloatPtr(m.EngagementRate),
		HitRate:         numericToFloatPtr(m.HitRate),
		SampleNote:      textToPtr(m.SampleNote),
		CreatedAt:       timestampToString(m.CreatedAt),
		UpdatedAt:       timestampToString(m.UpdatedAt),
	}
}

// workbenchHealthSort validates `?sort=`. An unknown value is a 400 rather than a
// silent fallback: a client asking for an ordering it does not get would present
// unsorted rows as a ranking.
func workbenchHealthSort(w http.ResponseWriter, r *http.Request) (string, bool) {
	switch sort := strings.TrimSpace(r.URL.Query().Get("sort")); sort {
	case "", healthSortFans:
		return healthSortFans, true
	case healthSortEngagement, healthSortHit:
		return sort, true
	default:
		writeError(w, http.StatusBadRequest, "sort must be fans, engagement or hit")
		return "", false
	}
}

// workbenchHealthCursor resolves `?cursor=` into the (id, followers, sort value)
// triple the keyset predicate compares against.
//
// The numbers are re-read from the cursor creator's current state instead of
// being encoded in the cursor: the cursor is a creator id, the same opaque form
// the creator list uses, and a metric that changed since the previous page should
// not strand a client on a cursor it cannot interpret. A cursor that resolves to
// nothing in this workspace is a 400, not a silently empty page.
func (h *Handler) workbenchHealthCursor(w http.ResponseWriter, r *http.Request, scope workbenchScope, sort string) (pgtype.UUID, pgtype.Int8, pgtype.Numeric, bool) {
	raw := strings.TrimSpace(r.URL.Query().Get("cursor"))
	if raw == "" {
		return pgtype.UUID{}, pgtype.Int8{}, pgtype.Numeric{}, true
	}
	cursorID, ok := parseUUIDOrBadRequest(w, raw, "cursor")
	if !ok {
		return pgtype.UUID{}, pgtype.Int8{}, pgtype.Numeric{}, false
	}
	creator, err := h.Queries.GetCreator(r.Context(), db.GetCreatorParams{
		ID:          cursorID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "cursor not found")
		return pgtype.UUID{}, pgtype.Int8{}, pgtype.Numeric{}, false
	}
	cursorFans := pgtype.Int8{Int64: creator.Fans, Valid: true}

	if sort == healthSortFans {
		fans := float64(creator.Fans)
		return cursorID, cursorFans, floatToNumeric(&fans), true
	}

	metric, err := h.Queries.GetCreatorMetricLatest(r.Context(), db.GetCreatorMetricLatestParams{
		WorkspaceID: scope.WorkspaceUUID,
		CreatorID:   cursorID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// The cursor creator has no snapshot, so its sort value is NULL and
			// the NULLS LAST branch of the predicate takes over.
			return cursorID, cursorFans, pgtype.Numeric{}, true
		}
		workbenchInternalError(w, r, "failed to read creator metric", err)
		return pgtype.UUID{}, pgtype.Int8{}, pgtype.Numeric{}, false
	}
	if sort == healthSortHit {
		return cursorID, cursorFans, floatToNumeric(numericToFloatPtr(metric.HitRate)), true
	}
	return cursorID, cursorFans, floatToNumeric(numericToFloatPtr(metric.EngagementRate)), true
}

// ListCreatorHealth — GET /api/workbench/creators/health
func (h *Handler) ListCreatorHealth(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	sort, ok := workbenchHealthSort(w, r)
	if !ok {
		return
	}
	cursorID, cursorFans, cursorValue, ok := h.workbenchHealthCursor(w, r, scope, sort)
	if !ok {
		return
	}
	rows, err := h.Queries.ListCreatorHealth(r.Context(), db.ListCreatorHealthParams{
		WorkspaceID: scope.WorkspaceUUID,
		Sort:        sort,
		CursorID:    cursorID,
		CursorFans:  cursorFans,
		CursorValue: cursorValue,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list creator health", err)
		return
	}

	creators := make([]CreatorHealthEntry, len(rows))
	for i, row := range rows {
		creators[i] = CreatorHealthEntry{
			ID:              uuidToString(row.ID),
			DisplayName:     row.DisplayName,
			Fans:            row.Fans,
			EngagementRate:  numericToFloatPtr(row.EngagementRate),
			HitRate:         numericToFloatPtr(row.HitRate),
			PostsLast30D:    int4ToPtr(row.PostsLast30d),
			VideosWithStats: int4ToPtr(row.VideosWithStats),
			CapturedOn:      dateToPtr(row.CapturedOn),
		}
	}
	payload := CreatorHealthListResponse{Creators: creators, Total: len(creators)}
	// The same rule every other list uses: only a full page names a successor.
	payload.NextCursor = workbenchNextCursor(rows, workbenchLimit(r), func(row db.ListCreatorHealthRow) pgtype.UUID { return row.ID })
	writeJSON(w, http.StatusOK, payload)
}

// GetCreatorHealth — GET /api/workbench/creators/{creatorId}/health
func (h *Handler) GetCreatorHealth(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	creatorID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "creatorId"), "creator id")
	if !ok {
		return
	}
	// The creator must exist here: a health row for a creator this workspace
	// cannot see is either a stale link or someone else's tenant.
	if _, err := h.Queries.GetCreator(r.Context(), db.GetCreatorParams{
		ID:          creatorID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusNotFound, "creator not found")
		return
	}

	payload := CreatorHealthDetailResponse{
		CreatorID: uuidToString(creatorID),
		Recent:    []CreatorMetricResponse{},
	}
	latest, err := h.Queries.GetCreatorMetricLatest(r.Context(), db.GetCreatorMetricLatestParams{
		WorkspaceID: scope.WorkspaceUUID,
		CreatorID:   creatorID,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		workbenchInternalError(w, r, "failed to read creator metric", err)
		return
	}
	if err == nil {
		response := creatorMetricToResponse(latest)
		payload.Latest = &response
	}

	recent, err := h.Queries.ListCreatorMetricRecent(r.Context(), db.ListCreatorMetricRecentParams{
		WorkspaceID: scope.WorkspaceUUID,
		CreatorID:   creatorID,
		Days:        healthRecentDays,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list creator metrics", err)
		return
	}
	for _, row := range recent {
		payload.Recent = append(payload.Recent, creatorMetricToResponse(row))
	}
	writeJSON(w, http.StatusOK, payload)
}

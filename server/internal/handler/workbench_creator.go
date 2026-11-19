package handler

// Creator commerce: creators, their posts, and the daily snapshots of a post's
// numbers (docs/engineering/WORKBENCH-API.md §3).
//
// Ownership: a creator row names its owner (`owner_member_id`) and that is what
// the write gate reads. Posts and snapshots do not carry an owner of their own —
// they inherit the creator's — because a post is an observation of a creator,
// and letting the two disagree would make "my creators" and "my posts" two
// different sets for no product reason.

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

const (
	creatorKindOwned    = "owned"
	creatorKindExternal = "external"

	creatorPostSourceManual = "manual"

	// The ledger's orderings (`?sort=`). `fans` is the default: it is the only
	// ranking that means something before any work has been sampled.
	creatorSortFans       = "fans"
	creatorSortEngagement = "engagement"
	creatorSortHit        = "hit"
	creatorSortRecent     = "recent"
)

// CreatorRequest is both the create body and the PATCH body: every field is
// optional, and create fills the required ones in from defaults it rejects when
// missing.
type CreatorRequest struct {
	Kind             *string  `json:"kind"`
	DisplayName      *string  `json:"display_name"`
	Platform         *string  `json:"platform"`
	Handle           *string  `json:"handle"`
	URL              *string  `json:"url"`
	Fans             *int64   `json:"fans"`
	FansD7           *int64   `json:"fans_d7"`
	AvgPlay          *int64   `json:"avg_play"`
	EngagementRate   *float64 `json:"engagement_rate"`
	Category         *string  `json:"category"`
	AudienceNote     *string  `json:"audience_note"`
	Region           *string  `json:"region"`
	PriceNote        *string  `json:"price_note"`
	Score            *int32   `json:"score"`
	RiskFlag         *bool    `json:"risk_flag"`
	BlacklistReason  *string  `json:"blacklist_reason"`
	OwnerMemberID    *string  `json:"owner_member_id"`
	MediaIPProjectID *string  `json:"media_ip_project_id"`
}

// CreatorPostRequest is the create/PATCH body for a tracked post.
//
// `MediaScriptID` (733) is the publish → plan link: the script version this post
// came from. It is optional in both directions — an external 达人's post, or a post
// tracked before the content workbench existed, has none — and an absent field on a
// PATCH keeps whatever the row already had, so a client that has never heard of the
// column keeps working unchanged.
type CreatorPostRequest struct {
	CreatorID      *string `json:"creator_id"`
	CollabID       *string `json:"collab_id"`
	ContentIssueID *string `json:"content_issue_id"`
	ProductID      *string `json:"product_id"`
	PickID         *string `json:"pick_id"`
	MediaScriptID  *string `json:"media_script_id"`
	Platform       *string `json:"platform"`
	Title          *string `json:"title"`
	URL            *string `json:"url"`
	PublishedAt    *string `json:"published_at"`
	Source         *string `json:"source"`
}

// CreatorPostMetricRequest is one day's snapshot of a post's numbers. Every
// measured field is optional: an importer that only knows plays sends only
// plays, and the upsert keeps the rest of that day's row as it was.
type CreatorPostMetricRequest struct {
	CapturedOn *string  `json:"captured_on"`
	Play       *int64   `json:"play"`
	Likes      *int64   `json:"likes"`
	Comments   *int64   `json:"comments"`
	Shares     *int64   `json:"shares"`
	Clicks     *int64   `json:"clicks"`
	Converts   *int64   `json:"converts"`
	GMVAmount  *float64 `json:"gmv_amount"`
	Currency   *string  `json:"currency"`
	Source     *string  `json:"source"`
}

func (h *Handler) publishCreatorChanged(workspaceID, creatorID, actorID string) {
	h.publish(eventCreatorChanged, workspaceID, "member", actorID, map[string]any{"id": creatorID})
}

func (h *Handler) publishCreatorPostChanged(workspaceID, postID, creatorID, actorID string) {
	h.publish(eventCreatorPostChanged, workspaceID, "member", actorID, map[string]any{
		"id":         postID,
		"creator_id": creatorID,
	})
}

// loadCreatorForWrite resolves {creatorId} inside the workspace and checks that
// the caller may change it. On any failure it has already written the response.
func (h *Handler) loadCreatorForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.Creator, bool) {
	creatorID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "creatorId"), "creator id")
	if !ok {
		return db.Creator{}, false
	}
	creator, err := h.Queries.GetCreator(r.Context(), db.GetCreatorParams{
		ID:          creatorID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "creator not found")
		return db.Creator{}, false
	}
	if !workbenchCanWrite(scope.Member, creator.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change creators you own")
		return db.Creator{}, false
	}
	return creator, true
}

// loadCreatorPostForWrite resolves {postId} plus the creator whose ownership
// decides the write, since a post has no owner column of its own.
func (h *Handler) loadCreatorPostForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.CreatorPost, db.Creator, bool) {
	postID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "postId"), "post id")
	if !ok {
		return db.CreatorPost{}, db.Creator{}, false
	}
	post, err := h.Queries.GetCreatorPost(r.Context(), db.GetCreatorPostParams{
		ID:          postID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "post not found")
		return db.CreatorPost{}, db.Creator{}, false
	}
	creator, err := h.Queries.GetCreator(r.Context(), db.GetCreatorParams{
		ID:          post.CreatorID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "post not found")
		return db.CreatorPost{}, db.Creator{}, false
	}
	if !workbenchCanWrite(scope.Member, creator.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change posts of creators you own")
		return db.CreatorPost{}, db.Creator{}, false
	}
	return post, creator, true
}

// requireCreatorInWorkspace is the relationship check the missing foreign key
// would otherwise do: a post must point at a creator that exists here.
func (h *Handler) requireCreatorInWorkspace(ctx context.Context, w http.ResponseWriter, workspaceID string, raw *string) (db.Creator, bool) {
	creatorID, ok := workbenchOptionalUUID(w, raw, "creator_id")
	if !ok {
		return db.Creator{}, false
	}
	if !creatorID.Valid {
		writeError(w, http.StatusBadRequest, "creator_id is required")
		return db.Creator{}, false
	}
	creator, err := h.Queries.GetCreator(ctx, db.GetCreatorParams{ID: creatorID, WorkspaceID: parseUUID(workspaceID)})
	if err != nil {
		writeError(w, http.StatusBadRequest, "creator not found in this workspace")
		return db.Creator{}, false
	}
	return creator, true
}

// workbenchCollabRef validates an optional collaboration pointer. A post may be
// attributed to a collab; the pointer is what the ROI metric walks, so a foreign
// or typo'd id would silently drop the post's GMV out of the numerator. There is
// no foreign key behind it (repository rule), which is exactly why the check
// lives here.
func (h *Handler) workbenchCollabRef(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (pgtype.UUID, bool) {
	collabID, ok := workbenchOptionalUUID(w, raw, "collab_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	if !collabID.Valid {
		return pgtype.UUID{}, true
	}
	if _, err := h.Queries.GetCrmCollab(r.Context(), db.GetCrmCollabParams{
		ID:          collabID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "collab_id is not a collaboration in this workspace")
		return pgtype.UUID{}, false
	}
	return collabID, true
}

// workbenchIssueRef validates an optional issue pointer. Unlike the ledger's own
// rows, an issue may legitimately disappear (it is deleted, not archived), so a
// stale pointer is tolerated on read; on write it must resolve, otherwise the
// link is created broken.
func (h *Handler) workbenchIssueRef(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (pgtype.UUID, bool) {
	issueID, ok := workbenchOptionalUUID(w, raw, "content_issue_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	if !issueID.Valid {
		return pgtype.UUID{}, true
	}
	if _, err := h.Queries.GetIssueInWorkspace(r.Context(), db.GetIssueInWorkspaceParams{
		ID:          issueID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "content_issue_id is not an issue in this workspace")
		return pgtype.UUID{}, false
	}
	return issueID, true
}

// ---- creators --------------------------------------------------------------

// workbenchMediaScriptRef validates an optional publish → plan pointer (733).
//
// The relationship has no foreign key behind it (repository rule), so this is the
// only place "this post came from that script" is checked: the script must be a
// live row of *this* workspace. An archived or foreign script is a 400 rather than
// a stored dangling pointer, because the pointer exists to reconcile a script's
// `publish_at` with a real publish — a pointer nobody can resolve answers nothing.
func (h *Handler) workbenchMediaScriptRef(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (pgtype.UUID, bool) {
	scriptID, ok := workbenchOptionalUUID(w, raw, "media_script_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	if !scriptID.Valid {
		return pgtype.UUID{}, true
	}
	if _, err := h.Queries.GetMediaScript(r.Context(), db.GetMediaScriptParams{
		ID:          scriptID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "media_script_id is not a script in this workspace")
		return pgtype.UUID{}, false
	}
	return scriptID, true
}

// workbenchCreatorSort validates `?sort=`. An unknown value is a 400 rather than
// a silent fallback: a client that asked for an ordering it did not get would
// draw unsorted rows as a ranking.
func workbenchCreatorSort(w http.ResponseWriter, r *http.Request) (string, bool) {
	switch sort := strings.TrimSpace(r.URL.Query().Get("sort")); sort {
	case "", creatorSortFans:
		return creatorSortFans, true
	case creatorSortEngagement, creatorSortHit, creatorSortRecent:
		return sort, true
	default:
		writeError(w, http.StatusBadRequest, "sort must be fans, engagement, hit or recent")
		return "", false
	}
}

// workbenchCreatorCursor resolves `?cursor=` into the (id, followers, sort
// value) triple the keyset predicate compares against.
//
// The numbers are re-read from the cursor creator's current state instead of
// being encoded in the cursor: the cursor is a creator id, the same opaque form
// the rest of the ledger uses, and a metric that changed since the previous page
// should not strand a client on a cursor it cannot interpret. A cursor that
// resolves to nothing in this workspace is a 400, not a silently empty page.
func (h *Handler) workbenchCreatorCursor(w http.ResponseWriter, r *http.Request, scope workbenchScope, sort string) (pgtype.UUID, pgtype.Int8, pgtype.Numeric, bool) {
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

	if sort == creatorSortFans {
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
			// the NULL branch of the keyset predicate takes over.
			return cursorID, cursorFans, pgtype.Numeric{}, true
		}
		workbenchInternalError(w, r, "failed to read creator metric", err)
		return pgtype.UUID{}, pgtype.Int8{}, pgtype.Numeric{}, false
	}
	switch sort {
	case creatorSortHit:
		return cursorID, cursorFans, floatToNumeric(numericToFloatPtr(metric.HitRate)), true
	case creatorSortRecent:
		if !metric.PostsLast30d.Valid {
			return cursorID, cursorFans, pgtype.Numeric{}, true
		}
		posts := float64(metric.PostsLast30d.Int32)
		return cursorID, cursorFans, floatToNumeric(&posts), true
	default:
		return cursorID, cursorFans, floatToNumeric(numericToFloatPtr(metric.EngagementRate)), true
	}
}

// ListCreators — GET /api/workbench/creators
func (h *Handler) ListCreators(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	if kind != "" && kind != creatorKindOwned && kind != creatorKindExternal {
		writeError(w, http.StatusBadRequest, "kind must be owned or external")
		return
	}
	sort, ok := workbenchCreatorSort(w, r)
	if !ok {
		return
	}
	cursorID, cursorFans, cursorValue, ok := h.workbenchCreatorCursor(w, r, scope, sort)
	if !ok {
		return
	}
	rows, err := h.Queries.ListCreators(r.Context(), db.ListCreatorsParams{
		Sort:        sort,
		WorkspaceID: scope.WorkspaceUUID,
		Kind:        strToText(kind),
		Query:       strToText(strings.TrimSpace(r.URL.Query().Get("q"))),
		CursorID:    cursorID,
		CursorValue: cursorValue,
		CursorFans:  cursorFans,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list creators", err)
		return
	}
	resp := make([]CreatorResponse, len(rows))
	for i, row := range rows {
		resp[i] = creatorListRowToResponse(row)
	}
	// `next_cursor` names the last id of this page, which is also what `?cursor=`
	// accepts; only a full page can have a successor. `total` is the row count of
	// this page — the authoritative workspace-wide numbers are `/counts`, and a
	// per-list COUNT here would double the query count for a footer nobody reads.
	payload := map[string]any{"creators": resp, "total": len(resp), "next_cursor": nil}
	if len(rows) > 0 && int32(len(rows)) == workbenchLimit(r) {
		payload["next_cursor"] = uuidToString(rows[len(rows)-1].Creator.ID)
	}
	writeJSON(w, http.StatusOK, payload)
}

// CreateCreator — POST /api/workbench/creators
func (h *Handler) CreateCreator(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req CreatorRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	kind := creatorKindExternal
	if req.Kind != nil {
		kind = strings.TrimSpace(*req.Kind)
	}
	if kind != creatorKindOwned && kind != creatorKindExternal {
		writeError(w, http.StatusBadRequest, "kind must be owned or external")
		return
	}
	displayName := strings.TrimSpace(valueOrEmpty(req.DisplayName))
	platform := strings.TrimSpace(valueOrEmpty(req.Platform))
	handle := strings.TrimSpace(valueOrEmpty(req.Handle))
	if displayName == "" || platform == "" || handle == "" {
		writeError(w, http.StatusBadRequest, "display_name, platform and handle are required")
		return
	}
	if req.Score != nil && (*req.Score < 1 || *req.Score > 5) {
		writeError(w, http.StatusBadRequest, "score must be between 1 and 5")
		return
	}

	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	mediaIPProject, ok := workbenchOptionalUUID(w, req.MediaIPProjectID, "media_ip_project_id")
	if !ok {
		return
	}
	if mediaIPProject.Valid {
		if _, err := h.Queries.GetProjectInWorkspace(r.Context(), db.GetProjectInWorkspaceParams{
			ID: mediaIPProject, WorkspaceID: scope.WorkspaceUUID,
		}); err != nil {
			writeError(w, http.StatusBadRequest, "media_ip_project_id is not a project in this workspace")
			return
		}
	}

	creator, err := h.Queries.CreateCreator(r.Context(), db.CreateCreatorParams{
		WorkspaceID:      scope.WorkspaceUUID,
		Kind:             kind,
		DisplayName:      displayName,
		Platform:         platform,
		Handle:           handle,
		Url:              optionalTrimmedText(req.URL),
		Fans:             int64Value(req.Fans),
		FansD7:           int64Value(req.FansD7),
		AvgPlay:          int64Value(req.AvgPlay),
		EngagementRate:   floatToNumeric(req.EngagementRate),
		Category:         optionalTrimmedText(req.Category),
		AudienceNote:     optionalTrimmedText(req.AudienceNote),
		Region:           optionalTrimmedText(req.Region),
		PriceNote:        optionalTrimmedText(req.PriceNote),
		Score:            int4Value(req.Score),
		RiskFlag:         boolValue(req.RiskFlag),
		BlacklistReason:  optionalTrimmedText(req.BlacklistReason),
		OwnerMemberID:    owner,
		MediaIpProjectID: mediaIPProject,
		CreatedBy:        scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a creator with this platform handle already exists")
			return
		}
		workbenchInternalError(w, r, "failed to create creator", err)
		return
	}

	h.publishCreatorChanged(scope.WorkspaceID, uuidToString(creator.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, creatorToResponse(creator))
}

// GetCreator — GET /api/workbench/creators/{creatorId}
func (h *Handler) GetCreator(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	creatorID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "creatorId"), "creator id")
	if !ok {
		return
	}
	creator, err := h.Queries.GetCreator(r.Context(), db.GetCreatorParams{
		ID:          creatorID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "creator not found")
		return
	}
	writeJSON(w, http.StatusOK, creatorToResponse(creator))
}

// creatorListRowToResponse turns one row of the list query into the ledger's
// line.
//
// `engagement_rate` is the one field the list reports from the *snapshot*, not
// from the creator row: the ledger's 互动率 column is content health
// (WORKBENCH-DATA-CONTRACT §2.3 — average likes + comments + shares over
// followers), while `creator.engagement_rate` is a legacy manually entered
// number the mirror never writes. `GET /api/workbench/creators/{id}` keeps
// reporting the column, because that endpoint returns the row and nothing else.
// A creator without a snapshot gets null here, never 0.
func creatorListRowToResponse(row db.ListCreatorsRow) CreatorResponse {
	out := creatorToResponse(row.Creator)
	out.EngagementRate = numericToFloatPtr(row.EngagementRate)
	out.HitRate = numericToFloatPtr(row.HitRate)
	out.PostsLast30D = int4ToPtr(row.PostsLast30d)
	out.VideosWithStats = int4ToPtr(row.VideosWithStats)
	out.MetricCapturedOn = dateToPtr(row.MetricCapturedOn)
	return out
}

// ListCreatorVideos — GET /api/workbench/creators/{creatorId}/videos
//
// The mirrored works behind a creator's content health, newest first. The
// drawer's 最近作品 strip reads five of them; `?limit=` is honoured up to the
// ledger's own cap, so the same read serves a wider panel later without a second
// endpoint. Every counter is nullable ("not collected yet" is not 0).
func (h *Handler) ListCreatorVideos(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	creatorID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "creatorId"), "creator id")
	if !ok {
		return
	}
	// A creator this workspace cannot see has no works to show either: the id is
	// resolved first so a foreign id is a 404 rather than an empty list.
	if _, err := h.Queries.GetCreator(r.Context(), db.GetCreatorParams{
		ID:          creatorID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusNotFound, "creator not found")
		return
	}
	rows, err := h.Queries.ListCreatorVideosRecent(r.Context(), db.ListCreatorVideosRecentParams{
		WorkspaceID: scope.WorkspaceUUID,
		CreatorID:   creatorID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list creator videos", err)
		return
	}
	resp := make([]CreatorVideoResponse, len(rows))
	for i, row := range rows {
		resp[i] = creatorVideoToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"videos": resp, "total": len(resp)})
}

// UpdateCreator — PATCH /api/workbench/creators/{creatorId}
func (h *Handler) UpdateCreator(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadCreatorForWrite(w, r, scope)
	if !ok {
		return
	}
	var req CreatorRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	kind := current.Kind
	if req.Kind != nil {
		kind = strings.TrimSpace(*req.Kind)
	}
	if kind != creatorKindOwned && kind != creatorKindExternal {
		writeError(w, http.StatusBadRequest, "kind must be owned or external")
		return
	}
	displayName := strings.TrimSpace(valueOrEmpty(req.DisplayName))
	if req.DisplayName != nil {
		if displayName == "" {
			writeError(w, http.StatusBadRequest, "display_name is required")
			return
		}
	} else {
		displayName = current.DisplayName
	}
	platform := current.Platform
	if req.Platform != nil {
		platform = strings.TrimSpace(*req.Platform)
		if platform == "" {
			writeError(w, http.StatusBadRequest, "platform is required")
			return
		}
	}
	handle := current.Handle
	if req.Handle != nil {
		handle = strings.TrimSpace(*req.Handle)
		if handle == "" {
			writeError(w, http.StatusBadRequest, "handle is required")
			return
		}
	}
	if req.Score != nil && (*req.Score < 1 || *req.Score > 5) {
		writeError(w, http.StatusBadRequest, "score must be between 1 and 5")
		return
	}

	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}
	mediaIPProject := current.MediaIpProjectID
	if req.MediaIPProjectID != nil {
		mediaIPProject, ok = workbenchOptionalUUID(w, req.MediaIPProjectID, "media_ip_project_id")
		if !ok {
			return
		}
		if mediaIPProject.Valid {
			if _, err := h.Queries.GetProjectInWorkspace(r.Context(), db.GetProjectInWorkspaceParams{
				ID: mediaIPProject, WorkspaceID: scope.WorkspaceUUID,
			}); err != nil {
				writeError(w, http.StatusBadRequest, "media_ip_project_id is not a project in this workspace")
				return
			}
		}
	}

	updated, err := h.Queries.UpdateCreator(r.Context(), db.UpdateCreatorParams{
		ID:               current.ID,
		WorkspaceID:      scope.WorkspaceUUID,
		Kind:             kind,
		DisplayName:      displayName,
		Platform:         platform,
		Handle:           handle,
		Url:              applyTextPatch(req.URL, current.Url),
		Fans:             applyInt64Patch(req.Fans, current.Fans),
		FansD7:           applyInt64Patch(req.FansD7, current.FansD7),
		AvgPlay:          applyInt64Patch(req.AvgPlay, current.AvgPlay),
		EngagementRate:   applyNumericPatch(req.EngagementRate, current.EngagementRate),
		Category:         applyTextPatch(req.Category, current.Category),
		AudienceNote:     applyTextPatch(req.AudienceNote, current.AudienceNote),
		Region:           applyTextPatch(req.Region, current.Region),
		PriceNote:        applyTextPatch(req.PriceNote, current.PriceNote),
		Score:            applyInt4Patch(req.Score, int2AsInt4(current.Score)),
		RiskFlag:         applyBoolPatch(req.RiskFlag, current.RiskFlag),
		BlacklistReason:  applyTextPatch(req.BlacklistReason, current.BlacklistReason),
		OwnerMemberID:    owner,
		MediaIpProjectID: mediaIPProject,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a creator with this platform handle already exists")
			return
		}
		workbenchInternalError(w, r, "failed to update creator", err)
		return
	}

	h.publishCreatorChanged(scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, creatorToResponse(updated))
}

// DeleteCreator — DELETE /api/workbench/creators/{creatorId} (soft delete)
func (h *Handler) DeleteCreator(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadCreatorForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveCreator(r.Context(), db.ArchiveCreatorParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete creator", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "creator not found")
		return
	}

	h.publishCreatorChanged(scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- posts -----------------------------------------------------------------

// ListCreatorPosts — GET /api/workbench/creator-posts
func (h *Handler) ListCreatorPosts(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	creatorID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("creator_id"))), "creator_id")
	if !ok {
		return
	}
	publishedFrom, ok := workbenchTimestampValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("from"))), "from")
	if !ok {
		return
	}
	publishedTo, ok := workbenchTimestampValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("to"))), "to")
	if !ok {
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetCreatorPost(r.Context(), db.GetCreatorPostParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
		return row.PublishedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListCreatorPosts(r.Context(), db.ListCreatorPostsParams{
		WorkspaceID:   scope.WorkspaceUUID,
		CreatorID:     creatorID,
		PublishedFrom: publishedFrom,
		PublishedTo:   publishedTo,
		CursorAt:      cursorAt,
		CursorID:      cursorID,
		Limit:         workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list creator posts", err)
		return
	}
	resp := make([]CreatorPostResponse, len(rows))
	for i, row := range rows {
		resp[i] = creatorPostToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"posts": resp, "total": len(resp)})
}

// CreateCreatorPost — POST /api/workbench/creator-posts
func (h *Handler) CreateCreatorPost(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req CreatorPostRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	creator, ok := h.requireCreatorInWorkspace(r.Context(), w, scope.WorkspaceID, req.CreatorID)
	if !ok {
		return
	}
	if !workbenchCanWrite(scope.Member, creator.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only post for creators you own")
		return
	}
	platform := strings.TrimSpace(valueOrEmpty(req.Platform))
	url := strings.TrimSpace(valueOrEmpty(req.URL))
	if platform == "" || url == "" {
		writeError(w, http.StatusBadRequest, "platform and url are required")
		return
	}
	if req.PublishedAt == nil || strings.TrimSpace(*req.PublishedAt) == "" {
		writeError(w, http.StatusBadRequest, "published_at is required")
		return
	}
	publishedAt, ok := workbenchTimestampValue(w, req.PublishedAt, "published_at")
	if !ok {
		return
	}
	collabID, ok := h.workbenchCollabRef(w, r, scope, req.CollabID)
	if !ok {
		return
	}
	contentIssueID, ok := h.workbenchIssueRef(w, r, scope, req.ContentIssueID)
	if !ok {
		return
	}
	// Attribution: which alliance product this post advertises, and under which
	// pick. Nullable — a brand spot has no product behind it.
	productID, ok := h.workbenchProductRef(w, r, scope, req.ProductID)
	if !ok {
		return
	}
	pickID, ok := h.workbenchPickRef(w, r, scope, req.PickID)
	if !ok {
		return
	}
	// The publish → plan link (§12.4/§21). Nullable: an unscripted post is the
	// ordinary case, and the pointer is what lets the 发布 page reconcile a script's
	// `publish_at` with the fact that it went live.
	mediaScriptID, ok := h.workbenchMediaScriptRef(w, r, scope, req.MediaScriptID)
	if !ok {
		return
	}

	source := creatorPostSourceManual
	if req.Source != nil {
		source = strings.TrimSpace(*req.Source)
	}
	if source != "manual" && source != "csv" && source != "api" {
		writeError(w, http.StatusBadRequest, "source must be manual, csv or api")
		return
	}

	post, err := h.Queries.CreateCreatorPost(r.Context(), db.CreateCreatorPostParams{
		WorkspaceID:    scope.WorkspaceUUID,
		CreatorID:      creator.ID,
		CollabID:       collabID,
		ContentIssueID: contentIssueID,
		ProductID:      productID,
		PickID:         pickID,
		MediaScriptID:  mediaScriptID,
		Platform:       platform,
		Title:          optionalTrimmedText(req.Title),
		Url:            url,
		PublishedAt:    publishedAt,
		Source:         source,
		CreatedBy:      scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this creator already has a post with this url")
			return
		}
		workbenchInternalError(w, r, "failed to create creator post", err)
		return
	}

	h.publishCreatorPostChanged(scope.WorkspaceID, uuidToString(post.ID), uuidToString(post.CreatorID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, creatorPostToResponse(post))
}

// UpdateCreatorPost — PATCH /api/workbench/creator-posts/{postId}
func (h *Handler) UpdateCreatorPost(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, _, ok := h.loadCreatorPostForWrite(w, r, scope)
	if !ok {
		return
	}
	var req CreatorPostRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	creatorID := current.CreatorID
	if req.CreatorID != nil && strings.TrimSpace(*req.CreatorID) != "" {
		creator, ok := h.requireCreatorInWorkspace(r.Context(), w, scope.WorkspaceID, req.CreatorID)
		if !ok {
			return
		}
		if !workbenchCanWrite(scope.Member, creator.OwnerMemberID) {
			writeError(w, http.StatusForbidden, "you can only post for creators you own")
			return
		}
		creatorID = creator.ID
	}
	platform := current.Platform
	if req.Platform != nil {
		platform = strings.TrimSpace(*req.Platform)
		if platform == "" {
			writeError(w, http.StatusBadRequest, "platform is required")
			return
		}
	}
	url := current.Url
	if req.URL != nil {
		url = strings.TrimSpace(*req.URL)
		if url == "" {
			writeError(w, http.StatusBadRequest, "url is required")
			return
		}
	}
	publishedAt := current.PublishedAt
	if req.PublishedAt != nil {
		parsed, ok := workbenchTimestampValue(w, req.PublishedAt, "published_at")
		if !ok {
			return
		}
		publishedAt = parsed
	}
	collabID := current.CollabID
	if req.CollabID != nil {
		parsed, ok := h.workbenchCollabRef(w, r, scope, req.CollabID)
		if !ok {
			return
		}
		collabID = parsed
	}
	contentIssueID := current.ContentIssueID
	if req.ContentIssueID != nil {
		parsed, ok := h.workbenchIssueRef(w, r, scope, req.ContentIssueID)
		if !ok {
			return
		}
		contentIssueID = parsed
	}
	productID := current.ProductID
	if req.ProductID != nil {
		parsed, ok := h.workbenchProductRef(w, r, scope, req.ProductID)
		if !ok {
			return
		}
		productID = parsed
	}
	pickID := current.PickID
	if req.PickID != nil {
		parsed, ok := h.workbenchPickRef(w, r, scope, req.PickID)
		if !ok {
			return
		}
		pickID = parsed
	}
	mediaScriptID := current.MediaScriptID
	if req.MediaScriptID != nil {
		parsed, ok := h.workbenchMediaScriptRef(w, r, scope, req.MediaScriptID)
		if !ok {
			return
		}
		mediaScriptID = parsed
	}
	source := current.Source
	if req.Source != nil {
		source = strings.TrimSpace(*req.Source)
		if source != "manual" && source != "csv" && source != "api" {
			writeError(w, http.StatusBadRequest, "source must be manual, csv or api")
			return
		}
	}

	updated, err := h.Queries.UpdateCreatorPost(r.Context(), db.UpdateCreatorPostParams{
		ID:             current.ID,
		WorkspaceID:    scope.WorkspaceUUID,
		CreatorID:      creatorID,
		CollabID:       collabID,
		ContentIssueID: contentIssueID,
		ProductID:      productID,
		PickID:         pickID,
		MediaScriptID:  mediaScriptID,
		Platform:       platform,
		Title:          applyTextPatch(req.Title, current.Title),
		Url:            url,
		PublishedAt:    publishedAt,
		Source:         source,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this creator already has a post with this url")
			return
		}
		workbenchInternalError(w, r, "failed to update creator post", err)
		return
	}

	h.publishCreatorPostChanged(scope.WorkspaceID, uuidToString(updated.ID), uuidToString(updated.CreatorID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, creatorPostToResponse(updated))
}

// DeleteCreatorPost — DELETE /api/workbench/creator-posts/{postId}
func (h *Handler) DeleteCreatorPost(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, _, ok := h.loadCreatorPostForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveCreatorPost(r.Context(), db.ArchiveCreatorPostParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete creator post", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}

	h.publishCreatorPostChanged(scope.WorkspaceID, uuidToString(current.ID), uuidToString(current.CreatorID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- post metrics ----------------------------------------------------------

// ListCreatorPostMetrics — GET /api/workbench/creator-posts/{postId}/metrics
func (h *Handler) ListCreatorPostMetrics(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	postID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "postId"), "post id")
	if !ok {
		return
	}
	if _, err := h.Queries.GetCreatorPost(r.Context(), db.GetCreatorPostParams{
		ID:          postID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusNotFound, "post not found")
		return
	}
	capturedFrom, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("from"))), "from")
	if !ok {
		return
	}
	capturedTo, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("to"))), "to")
	if !ok {
		return
	}
	rows, err := h.Queries.ListCreatorPostMetrics(r.Context(), db.ListCreatorPostMetricsParams{
		WorkspaceID:  scope.WorkspaceUUID,
		PostID:       postID,
		CapturedFrom: capturedFrom,
		CapturedTo:   capturedTo,
		Limit:        workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list post metrics", err)
		return
	}
	resp := make([]CreatorPostMetricResponse, len(rows))
	for i, row := range rows {
		resp[i] = creatorPostMetricToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"metrics": resp, "total": len(resp)})
}

// UpsertCreatorPostMetric — POST /api/workbench/creator-posts/{postId}/metrics
func (h *Handler) UpsertCreatorPostMetric(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	post, _, ok := h.loadCreatorPostForWrite(w, r, scope)
	if !ok {
		return
	}
	var req CreatorPostMetricRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	capturedOn := pgtypeDateToday()
	if req.CapturedOn != nil && strings.TrimSpace(*req.CapturedOn) != "" {
		parsed, ok := workbenchDateValue(w, req.CapturedOn, "captured_on")
		if !ok {
			return
		}
		capturedOn = parsed
	}
	currency := "CNY"
	if req.Currency != nil && strings.TrimSpace(*req.Currency) != "" {
		currency = strings.ToUpper(strings.TrimSpace(*req.Currency))
		if len(currency) != 3 {
			writeError(w, http.StatusBadRequest, "currency must be a 3-letter code")
			return
		}
	}
	source := creatorPostSourceManual
	if req.Source != nil && strings.TrimSpace(*req.Source) != "" {
		source = strings.TrimSpace(*req.Source)
	}

	metric, err := h.Queries.UpsertCreatorPostMetric(r.Context(), db.UpsertCreatorPostMetricParams{
		WorkspaceID: scope.WorkspaceUUID,
		PostID:      post.ID,
		CapturedOn:  capturedOn,
		Play:        int8Value(req.Play),
		Likes:       int8Value(req.Likes),
		Comments:    int8Value(req.Comments),
		Shares:      int8Value(req.Shares),
		Clicks:      int8Value(req.Clicks),
		Converts:    int8Value(req.Converts),
		GmvAmount:   floatToNumeric(req.GMVAmount),
		Currency:    currency,
		Source:      source,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to save post metric", err)
		return
	}

	h.publishCreatorPostChanged(scope.WorkspaceID, uuidToString(post.ID), uuidToString(post.CreatorID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, creatorPostMetricToResponse(metric))
}

package handler

// The P1 knowledge HTTP surface: spaces and items CRUD, the persisted-chunk and
// link reads, workspace search, and the wiki page endpoints.
//
// The routes live under the same /api/knowledge group as the import pipeline, so
// they inherit middleware.RequireWorkspaceMember: the workspace always comes
// from X-Workspace-ID / the slug, never from a body, and the viewer is X-User-ID.
// Reads go through the knowledge package's canViewItem; writes additionally
// assert the caller's workspace role here, because a member of the workspace is
// not automatically an editor of its knowledge base.
//
// Error codes on these routes:
//
//	400 invalid_request              bad enum / missing field / malformed body
//	403 knowledge_forbidden          the viewer may not see or change the row
//	404 knowledge_item_not_found     unknown item id in this workspace
//	404 knowledge_space_not_found    unknown space id in this workspace
//	404 knowledge_page_not_found     unknown page id in this workspace
//	500 knowledge_internal_error     anything the store could not classify

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/jerry-halo2026/morchat.co/server/internal/knowledge"
)

// knowledgeWriteRoles are the workspace roles allowed to change knowledge rows.
// There is no per-space editor list yet, so "a member of this workspace" is the
// assertion; the shape is a list so tightening it later is one argument.
var knowledgeWriteRoles = []string{"owner", "admin", "member"}

// writeKnowledgeCRUDError maps a store/service error onto the codes above.
//
// It is deliberately separate from writeKnowledgeError (the import pipeline's
// mapper): the pipeline answers knowledge_not_found for every missing object
// because a retrieval caller must not be told what exists, while a CRUD caller
// addresses a row by id and is better served by the object-specific code.
func writeKnowledgeCRUDError(w http.ResponseWriter, op string, err error) {
	switch {
	case errors.Is(err, knowledge.ErrKnowledgeForbidden):
		writeErrorCode(w, http.StatusForbidden, "knowledge_forbidden",
			"knowledge item is not visible to this caller")
	case errors.Is(err, knowledge.ErrItemNotFound):
		writeErrorCode(w, http.StatusNotFound, "knowledge_item_not_found", "knowledge item not found")
	case errors.Is(err, knowledge.ErrSpaceNotFound):
		writeErrorCode(w, http.StatusNotFound, "knowledge_space_not_found", "knowledge space not found")
	case errors.Is(err, knowledge.ErrPageNotFound):
		writeErrorCode(w, http.StatusNotFound, "knowledge_page_not_found", "knowledge page not found")
	case errors.Is(err, knowledge.ErrChunkNotFound):
		writeErrorCode(w, http.StatusNotFound, "knowledge_item_not_found", "knowledge chunk not found")
	case errors.Is(err, knowledge.ErrDocumentNotFound):
		writeErrorCode(w, http.StatusNotFound, "knowledge_item_not_found", "knowledge document not found")
	case errors.Is(err, knowledge.ErrInvalidField),
		errors.Is(err, knowledge.ErrUnsupportedMedia):
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", err.Error())
	default:
		writeKnowledgeError(w, op, err)
	}
}

// knowledgeWriteScope resolves the workspace and viewer and asserts that the
// viewer may write here. A failed assertion is knowledge_forbidden (403), not the
// generic middleware sentence, so a client can render the permission state.
func (h *Handler) knowledgeWriteScope(w http.ResponseWriter, r *http.Request) (workspaceID, viewerID string, ok bool) {
	workspaceID, viewerID, ok = knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return "", "", false
	}
	member, err := h.getWorkspaceMember(r.Context(), viewerID, workspaceID)
	if err != nil || !roleAllowed(member.Role, knowledgeWriteRoles...) {
		writeErrorCode(w, http.StatusForbidden, "knowledge_forbidden",
			"this caller may not write to the knowledge base")
		return "", "", false
	}
	return workspaceID, viewerID, true
}

// decodeKnowledgeBody reads a JSON body, tolerating an empty one when allowEmpty.
func decodeKnowledgeBody(r *http.Request, dst any, allowEmpty bool) error {
	err := json.NewDecoder(r.Body).Decode(dst)
	if errors.Is(err, io.EOF) && allowEmpty {
		return nil
	}
	return err
}

// knowledgeLimit reads a positive integer query parameter, clamped to max.
func knowledgeLimit(r *http.Request, name string, fallback, max int) int {
	raw := strings.TrimSpace(r.URL.Query().Get(name))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	if max > 0 && value > max {
		return max
	}
	return value
}

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

// ListKnowledgeSpaces answers GET /api/knowledge/spaces.
//
// The service, not the store: knowledge_space_scope narrows this listing to the
// viewer's department (plus the shared, department-less spaces), and the service
// is where that rule and its log-only observation live.
func (h *Handler) ListKnowledgeSpaces(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	spaces, err := h.knowledgeService().ListSpaces(r.Context(), workspaceID, viewerID)
	if err != nil {
		writeKnowledgeCRUDError(w, "spaces", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"spaces": spaces})
}

// CreateKnowledgeSpace answers POST /api/knowledge/spaces with 201.
func (h *Handler) CreateKnowledgeSpace(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := h.knowledgeWriteScope(w, r)
	if !ok {
		return
	}
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := decodeKnowledgeBody(r, &body, false); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}
	ownerID := viewerID
	space, err := h.knowledgeService().Store().CreateSpace(
		r.Context(), workspaceID, body.Name, body.Description, &ownerID)
	if err != nil {
		writeKnowledgeCRUDError(w, "create space", err)
		return
	}
	writeJSON(w, http.StatusCreated, space)
}

// GetKnowledgeSpace answers GET /api/knowledge/spaces/{spaceId}. A space outside
// the viewer's department scope answers 404 knowledge_space_not_found, the same
// answer a space of another workspace gets.
func (h *Handler) GetKnowledgeSpace(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	space, err := h.knowledgeService().GetSpace(
		r.Context(), workspaceID, viewerID, chi.URLParam(r, "spaceId"))
	if err != nil {
		writeKnowledgeCRUDError(w, "space", err)
		return
	}
	writeJSON(w, http.StatusOK, space)
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

// knowledgeItemResponse is an item plus the fields a detail read adds. The item
// is embedded without a JSON tag on purpose: the wire object stays flat, so a
// client reads `title` at the top level whether or not it asked for the body.
//
// Review is the trust record (W1-A): who approved the item, when, which issue
// carried the review, and when it expires. It is nil only when the item was
// created through a path that did not read it back.
type knowledgeItemResponse struct {
	knowledge.Item
	Content    string              `json:"content,omitempty"`
	ChunkCount int                 `json:"chunk_count"`
	Archived   bool                `json:"archived"`
	Document   *knowledge.Document `json:"document,omitempty"`
	Review     *knowledge.Review   `json:"review,omitempty"`
}

// ListKnowledgeItems answers GET /api/knowledge/items.
func (h *Handler) ListKnowledgeItems(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	query := r.URL.Query()
	list, err := h.knowledgeService().ListItems(r.Context(), knowledge.ListItemsInput{
		WorkspaceID: workspaceID,
		ViewerID:    viewerID,
		SpaceID:     query.Get("space_id"),
		ProjectID:   query.Get("project_id"),
		Status:      query.Get("status"),
		Kind:        query.Get("kind"),
		Query:       query.Get("q"),
		Limit:       knowledgeLimit(r, "limit", 50, 200),
		Cursor:      query.Get("cursor"),
	})
	if err != nil {
		writeKnowledgeCRUDError(w, "items", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// CreateKnowledgeItem answers POST /api/knowledge/items with 201. An optional
// `content` string is stored through the same parser and chunker as an import.
//
// Asking for `status: "active"` runs the review gate (knowledge_review.go): the
// body must name a review_issue_id, the caller must be an approving role, and an
// agent is refused outright. The row is created as a draft and only then flipped,
// so a failure between the two writes leaves a draft rather than unreviewed
// active knowledge.
func (h *Handler) CreateKnowledgeItem(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := h.knowledgeWriteScope(w, r)
	if !ok {
		return
	}
	var body struct {
		SpaceID       string `json:"space_id"`
		Title         string `json:"title"`
		Kind          string `json:"kind"`
		SourceType    string `json:"source_type"`
		SourceRef     string `json:"source_ref"`
		Status        string `json:"status"`
		ACLMode       string `json:"acl_mode"`
		ProjectID     string `json:"project_id"`
		Content       string `json:"content"`
		MIME          string `json:"mime"`
		ReviewIssueID string `json:"review_issue_id"`
	}
	if err := decodeKnowledgeBody(r, &body, false); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}
	wantsActive := strings.EqualFold(strings.TrimSpace(body.Status), knowledge.StatusActive)
	reviewIssueID := strings.TrimSpace(body.ReviewIssueID)
	// A request with no space_id is rejected by the create below with its own
	// message; running the gate first would answer "space not found" instead.
	if wantsActive && strings.TrimSpace(body.SpaceID) != "" {
		// The item does not exist yet, so the gate reads the values the row
		// will have: its owner is the caller, its source and space are the
		// ones in the body.
		ownerID := viewerID
		prospective := knowledge.Item{
			WorkspaceID: workspaceID,
			SpaceID:     body.SpaceID,
			Title:       body.Title,
			SourceRef:   body.SourceRef,
			Status:      knowledge.StatusDraft,
			OwnerID:     &ownerID,
		}
		member, err := h.getWorkspaceMember(r.Context(), viewerID, workspaceID)
		if err != nil {
			writeErrorCode(w, http.StatusForbidden, "knowledge_review_forbidden",
				"this caller is not a member of the workspace")
			return
		}
		resolved, ok := h.requireKnowledgeReview(w, r, knowledgeReviewGate{
			WorkspaceID:   workspaceID,
			ViewerID:      viewerID,
			Member:        member,
			Item:          prospective,
			ReviewIssueID: reviewIssueID,
		})
		if !ok {
			return
		}
		reviewIssueID = resolved
		// Create as draft; the approval below is what makes it active.
		body.Status = knowledge.StatusDraft
	}
	in := knowledge.NewItem{
		WorkspaceID: workspaceID,
		SpaceID:     body.SpaceID,
		Title:       body.Title,
		Kind:        body.Kind,
		SourceType:  body.SourceType,
		SourceRef:   body.SourceRef,
		Status:      body.Status,
		ACLMode:     body.ACLMode,
		OwnerID:     &viewerID,
	}
	if projectID := strings.TrimSpace(body.ProjectID); projectID != "" {
		in.ProjectID = &projectID
	}
	service := h.knowledgeService()
	item, chunks, err := service.CreateItem(r.Context(), in, body.Content, body.MIME)
	if err != nil {
		writeKnowledgeCRUDError(w, "create item", err)
		return
	}
	response := knowledgeItemResponse{Item: item, ChunkCount: chunks}
	if wantsActive {
		review, err := service.Store().ApproveItem(r.Context(), knowledge.ApproveInput{
			WorkspaceID:   workspaceID,
			ItemID:        item.ID,
			ReviewIssueID: reviewIssueID,
			ReviewedBy:    viewerID,
		})
		if err != nil {
			writeKnowledgeCRUDError(w, "approve item", err)
			return
		}
		detail, err := service.GetItemDetail(r.Context(), workspaceID, viewerID, item.ID, false)
		if err != nil {
			writeKnowledgeCRUDError(w, "create item", err)
			return
		}
		response.Item = detail.Item
		response.Review = &review
	}
	writeJSON(w, http.StatusCreated, response)
}

// GetKnowledgeItem answers GET /api/knowledge/items/{itemId}. `?include=content`
// adds the body (the stored chunks, joined) and the active document.
func (h *Handler) GetKnowledgeItem(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	withContent := strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("include")), "content")
	service := h.knowledgeService()
	detail, err := service.GetItemDetail(
		r.Context(), workspaceID, viewerID, chi.URLParam(r, "itemId"), withContent)
	if err != nil {
		writeKnowledgeCRUDError(w, "item", err)
		return
	}
	// The review record travels with the item: a reader has to be able to tell
	// "approved, valid until March" from "a run proposed this and nobody looked".
	review, err := service.Store().GetReview(r.Context(), workspaceID, detail.Item.ID)
	if err != nil {
		writeKnowledgeCRUDError(w, "item", err)
		return
	}
	writeJSON(w, http.StatusOK, knowledgeItemResponse{
		Item:       detail.Item,
		Content:    detail.Content,
		ChunkCount: len(detail.Chunks),
		Archived:   detail.Archived,
		Document:   detail.Document,
		Review:     &review,
	})
}

// UpdateKnowledgeItem answers PATCH /api/knowledge/items/{itemId}.
//
// `{"status":"archived"}` is the archive operation the CLI and the UI use: it is
// a soft delete, so the row survives (readable by id) but leaves the default
// listing and the retrieval index.
//
// `{"status":"active"}` goes through the same review gate as the approve route:
// the PATCH may carry review_issue_id, otherwise the issue already recorded on
// the item is used, and the approval itself is written by ApproveItem so the
// lifecycle and the review record can never disagree.
func (h *Handler) UpdateKnowledgeItem(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := h.knowledgeWriteScope(w, r)
	if !ok {
		return
	}
	var body struct {
		Title         *string `json:"title"`
		Status        *string `json:"status"`
		ACLMode       *string `json:"acl_mode"`
		SourceRef     *string `json:"source_ref"`
		ProjectID     *string `json:"project_id"`
		Content       *string `json:"content"`
		ReviewIssueID string  `json:"review_issue_id"`
	}
	if err := decodeKnowledgeBody(r, &body, false); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}
	itemID := chi.URLParam(r, "itemId")
	service := h.knowledgeService()
	current, err := service.ReadItem(r.Context(), workspaceID, viewerID, itemID)
	if err != nil {
		writeKnowledgeCRUDError(w, "item", err)
		return
	}

	wantsActive := body.Status != nil && strings.EqualFold(strings.TrimSpace(*body.Status), knowledge.StatusActive)
	reviewIssueID := strings.TrimSpace(body.ReviewIssueID)
	if wantsActive {
		if reviewIssueID == "" {
			existing, err := service.Store().GetReview(r.Context(), workspaceID, current.ID)
			if err != nil {
				writeKnowledgeCRUDError(w, "update item", err)
				return
			}
			if existing.ReviewIssueID != nil {
				reviewIssueID = *existing.ReviewIssueID
			}
		}
		member, err := h.getWorkspaceMember(r.Context(), viewerID, workspaceID)
		if err != nil {
			writeErrorCode(w, http.StatusForbidden, "knowledge_review_forbidden",
				"this caller is not a member of the workspace")
			return
		}
		resolved, ok := h.requireKnowledgeReview(w, r, knowledgeReviewGate{
			WorkspaceID:   workspaceID,
			ViewerID:      viewerID,
			Member:        member,
			Item:          current,
			ReviewIssueID: reviewIssueID,
		})
		if !ok {
			return
		}
		reviewIssueID = resolved
	}

	in := knowledge.UpdateItemInput{
		WorkspaceID: workspaceID,
		ItemID:      itemID,
		Title:       body.Title,
		Status:      body.Status,
		ACLMode:     body.ACLMode,
		SourceRef:   body.SourceRef,
	}
	if wantsActive {
		// ApproveItem writes the status, so this update must not race it.
		in.Status = nil
	}
	if body.ProjectID != nil {
		in.ProjectID = &body.ProjectID
	}
	var item knowledge.Item
	updated := body.Title != nil || body.ACLMode != nil || body.SourceRef != nil ||
		body.ProjectID != nil || (body.Status != nil && !wantsActive)
	if updated {
		if item, err = service.Store().UpdateItem(r.Context(), in); err != nil {
			writeKnowledgeCRUDError(w, "update item", err)
			return
		}
	} else {
		item = current
	}
	var review *knowledge.Review
	if wantsActive {
		approved, err := service.Store().ApproveItem(r.Context(), knowledge.ApproveInput{
			WorkspaceID:   workspaceID,
			ItemID:        item.ID,
			ReviewIssueID: reviewIssueID,
			ReviewedBy:    viewerID,
		})
		if err != nil {
			writeKnowledgeCRUDError(w, "approve item", err)
			return
		}
		review = &approved
	}
	if body.Content != nil && strings.TrimSpace(*body.Content) != "" {
		if _, _, err := service.IngestInline(r.Context(), workspaceID, item, *body.Content, "text/markdown"); err != nil {
			writeKnowledgeCRUDError(w, "update item content", err)
			return
		}
	}
	detail, err := service.GetItemDetail(r.Context(), workspaceID, viewerID, item.ID, false)
	if err != nil {
		writeKnowledgeCRUDError(w, "update item", err)
		return
	}
	if review == nil {
		existing, err := service.Store().GetReview(r.Context(), workspaceID, item.ID)
		if err != nil {
			writeKnowledgeCRUDError(w, "update item", err)
			return
		}
		review = &existing
	}
	writeJSON(w, http.StatusOK, knowledgeItemResponse{
		Item:       detail.Item,
		ChunkCount: len(detail.Chunks),
		Archived:   detail.Archived,
		Document:   detail.Document,
		Review:     review,
	})
}

// DeleteKnowledgeItem answers DELETE /api/knowledge/items/{itemId}: the same
// archive transition as PATCH {"status":"archived"}, spelled as the verb.
func (h *Handler) DeleteKnowledgeItem(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := h.knowledgeWriteScope(w, r)
	if !ok {
		return
	}
	itemID := chi.URLParam(r, "itemId")
	service := h.knowledgeService()
	if _, err := service.ReadItem(r.Context(), workspaceID, viewerID, itemID); err != nil {
		writeKnowledgeCRUDError(w, "item", err)
		return
	}
	archived := knowledge.StatusArchived
	if _, err := service.Store().UpdateItem(r.Context(), knowledge.UpdateItemInput{
		WorkspaceID: workspaceID,
		ItemID:      itemID,
		Status:      &archived,
	}); err != nil {
		writeKnowledgeCRUDError(w, "delete item", err)
		return
	}
	detail, err := service.GetItemDetail(r.Context(), workspaceID, viewerID, itemID, false)
	if err != nil {
		writeKnowledgeCRUDError(w, "delete item", err)
		return
	}
	writeJSON(w, http.StatusOK, knowledgeItemResponse{
		Item:       detail.Item,
		ChunkCount: len(detail.Chunks),
		Archived:   detail.Archived,
		Document:   detail.Document,
	})
}

// knowledgeChunkResponse is one stored chunk on the wire: the canonical Chunk
// fields plus `text`, the name the plans and the CLI use for the body.
type knowledgeChunkResponse struct {
	knowledge.Chunk
	Text string `json:"text"`
}

// ListKnowledgeItemChunks answers GET /api/knowledge/items/{itemId}/chunks.
//
// These are the persisted chunks of the item's active document generation — not
// a preview. An item that was created without a body has an empty list.
func (h *Handler) ListKnowledgeItemChunks(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	detail, err := h.knowledgeService().GetItemDetail(
		r.Context(), workspaceID, viewerID, chi.URLParam(r, "itemId"), false)
	if err != nil {
		writeKnowledgeCRUDError(w, "chunks", err)
		return
	}
	chunks := make([]knowledgeChunkResponse, 0, len(detail.Chunks))
	for _, chunk := range detail.Chunks {
		chunks = append(chunks, knowledgeChunkResponse{Chunk: chunk, Text: chunk.Content})
	}
	response := map[string]any{
		"item_id":  detail.Item.ID,
		"chunks":   chunks,
		"preview":  false,
		"revision": 0,
	}
	if detail.Document != nil {
		response["document_id"] = detail.Document.ID
		response["generation"] = detail.Document.ActiveGeneration
		response["revision"] = detail.Document.ActiveGeneration
		response["mime"] = detail.Document.Mime
	}
	writeJSON(w, http.StatusOK, response)
}

// ListKnowledgeItemLinks answers GET /api/knowledge/items/{itemId}/links.
func (h *Handler) ListKnowledgeItemLinks(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	links, err := h.knowledgeService().ListItemLinks(
		r.Context(), workspaceID, viewerID, chi.URLParam(r, "itemId"))
	if err != nil {
		writeKnowledgeCRUDError(w, "links", err)
		return
	}
	writeJSON(w, http.StatusOK, links)
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// knowledgeSearchHit is one retrieval hit plus the revision it came from. The
// revision is the chunk's document generation: the number a reader needs to say
// "this answer is from v3 of the note".
type knowledgeSearchHit struct {
	knowledge.Hit
	Revision int `json:"revision"`
}

// SearchKnowledge answers GET /api/knowledge/search?q=&space_id=&top_k=.
//
// It is a GET wrapper over the same pipeline /retrieval-test runs: permissions
// are the pipeline's (index filter + result recheck), not a second filter here.
func (h *Handler) SearchKnowledge(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	query := r.URL.Query()
	threshold := 0.0
	if raw := strings.TrimSpace(query.Get("score_threshold")); raw != "" {
		parsed, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_request", "score_threshold must be a number")
			return
		}
		threshold = parsed
	}
	result, err := h.knowledgeService().Retrieve(r.Context(), knowledge.RetrieveInput{
		WorkspaceID:    workspaceID,
		ViewerID:       viewerID,
		Query:          query.Get("q"),
		SpaceID:        query.Get("space_id"),
		Mode:           query.Get("mode"),
		TopK:           knowledgeLimit(r, "top_k", knowledge.DefaultTopK, 50),
		ScoreThreshold: threshold,
		Rerank:         query.Get("rerank") == "1" || strings.EqualFold(query.Get("rerank"), "true"),
	})
	if err != nil {
		writeKnowledgeCRUDError(w, "search", err)
		return
	}

	chunkIDs := make([]string, 0, len(result.Hits))
	for _, hit := range result.Hits {
		chunkIDs = append(chunkIDs, hit.ChunkID)
	}
	generations, err := h.knowledgeService().ChunkGenerations(r.Context(), workspaceID, chunkIDs)
	if err != nil {
		writeKnowledgeCRUDError(w, "search", err)
		return
	}
	hits := make([]knowledgeSearchHit, 0, len(result.Hits))
	for _, hit := range result.Hits {
		hits = append(hits, knowledgeSearchHit{Hit: hit, Revision: generations[hit.ChunkID]})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"query":           query.Get("q"),
		"space_id":        query.Get("space_id"),
		"mode":            result.Debug.Mode,
		"top_k":           knowledgeLimit(r, "top_k", knowledge.DefaultTopK, 50),
		"score_threshold": result.Debug.Threshold,
		"hits":            hits,
		"debug":           result.Debug,
	})
}

// ---------------------------------------------------------------------------
// Wiki pages
// ---------------------------------------------------------------------------

// ListKnowledgePages answers GET /api/knowledge/pages?space_id=&q=.
//
// Both shapes are returned because both callers exist: `pages` is the flat,
// path-ordered list a table renders, `tree` is the nested one the sidebar needs.
// A space_id outside the viewer's department scope answers 404, and a listing
// across spaces keeps only the visible ones — both inside the service.
func (h *Handler) ListKnowledgePages(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	pages, tree, err := h.knowledgeService().ListPages(
		r.Context(), workspaceID, viewerID, r.URL.Query().Get("space_id"), r.URL.Query().Get("q"))
	if err != nil {
		writeKnowledgeCRUDError(w, "pages", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"space_id": r.URL.Query().Get("space_id"),
		"pages":    pages,
		"tree":     tree,
	})
}

// CreateKnowledgePage answers POST /api/knowledge/pages?space_id= with 201.
func (h *Handler) CreateKnowledgePage(w http.ResponseWriter, r *http.Request) {
	workspaceID, _, ok := h.knowledgeWriteScope(w, r)
	if !ok {
		return
	}
	var body struct {
		SpaceID  string `json:"space_id"`
		Path     string `json:"path"`
		Title    string `json:"title"`
		PageType string `json:"page_type"`
		Content  string `json:"content"`
	}
	if err := decodeKnowledgeBody(r, &body, false); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}
	spaceID := strings.TrimSpace(body.SpaceID)
	if spaceID == "" {
		spaceID = strings.TrimSpace(r.URL.Query().Get("space_id"))
	}
	page, err := h.knowledgeService().Store().CreatePage(
		r.Context(), workspaceID, spaceID, body.Path, body.Title, body.PageType, body.Content)
	if err != nil {
		writeKnowledgeCRUDError(w, "create page", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"page": page})
}

// GetKnowledgePage answers GET /api/knowledge/pages/{pageId}.
func (h *Handler) GetKnowledgePage(w http.ResponseWriter, r *http.Request) {
	workspaceID, _, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	page, err := h.knowledgeService().Store().GetPage(
		r.Context(), workspaceID, chi.URLParam(r, "pageId"))
	if err != nil {
		writeKnowledgeCRUDError(w, "page", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"page": page})
}

// UpdateKnowledgePage answers PUT /api/knowledge/pages/{pageId}: it writes the
// next revision and returns it, so the caller can display "saved as v4" without
// a second read. An optional base_revision is the client's staleness claim.
func (h *Handler) UpdateKnowledgePage(w http.ResponseWriter, r *http.Request) {
	workspaceID, _, ok := h.knowledgeWriteScope(w, r)
	if !ok {
		return
	}
	var body struct {
		Content      string  `json:"content"`
		Title        *string `json:"title"`
		Summary      *string `json:"summary"`
		BaseRevision *int    `json:"base_revision"`
	}
	if err := decodeKnowledgeBody(r, &body, false); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}
	page, err := h.knowledgeService().Store().PutPage(
		r.Context(), workspaceID, chi.URLParam(r, "pageId"),
		body.Content, body.Title, body.Summary, body.BaseRevision)
	if err != nil {
		writeKnowledgeCRUDError(w, "update page", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"revision": page.Revision,
		"page":     page,
	})
}

// ListKnowledgePageRevisions answers GET /api/knowledge/pages/{pageId}/revisions.
func (h *Handler) ListKnowledgePageRevisions(w http.ResponseWriter, r *http.Request) {
	workspaceID, _, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	current, revisions, err := h.knowledgeService().Store().ListPageRevisions(
		r.Context(), workspaceID, chi.URLParam(r, "pageId"))
	if err != nil {
		writeKnowledgeCRUDError(w, "page revisions", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"page_id":   chi.URLParam(r, "pageId"),
		"revision":  current.Revision,
		"revisions": revisions,
	})
}

// ListKnowledgePageBacklinks answers GET /api/knowledge/pages/{pageId}/backlinks.
func (h *Handler) ListKnowledgePageBacklinks(w http.ResponseWriter, r *http.Request) {
	workspaceID, _, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	backlinks, err := h.knowledgeService().Store().ListPageBacklinks(
		r.Context(), workspaceID, chi.URLParam(r, "pageId"))
	if err != nil {
		writeKnowledgeCRUDError(w, "page backlinks", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"page_id":   chi.URLParam(r, "pageId"),
		"backlinks": backlinks,
	})
}

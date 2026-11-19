package handler

// Interview question bank and per-round interview guides
// (docs/engineering/WORKBENCH-API.md §14).
//
// The product decision behind this file: drafting an exam and grading answers are
// not what an HR team lacks — asking the right questions is. So the unit here is
// the *question asset* (what it verifies, what a good answer contains, what should
// raise a flag) and the *guide* for one round, which is assembled from those
// assets and then ticked through in the room.
//
// The one rule that shapes every write path:
//
//	**A guide is a snapshot, not a reference.**
//
// `hr_interview_guide.items` holds a copy of each question — text, intent,
// signals, red flags — plus what happened (`asked`, `note`, `score`). Editing or
// archiving a bank row must never rewrite a round somebody already ran, so no read
// path in this file joins an item back to `hr_question`. `question_id` inside an
// item is provenance: it exists so the bank can count how often a question was
// used, and nothing else reads it.
//
// Ownership: a question is gated on its own `owner_member_id`. A guide is not
// gated on its own owner first — it is gated on the candidate it belongs to, and
// only falls back to the row's owner when that candidate has no owner recorded,
// because "who may edit this round's questions" must be the same answer as "who
// may edit this candidate".

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/logger"
	"github.com/jerry-halo2026/morchat.co/server/internal/util"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

const (
	eventHrQuestionChanged       = "hr_question:changed"
	eventHrInterviewGuideChanged = "hr_interview_guide:changed"

	// hrGuideMaxItems is the contract's ceiling on one round's outline. It is a
	// product number, not a storage one: a 60-question round is a list nobody
	// finishes, and the client renders the count against it.
	hrGuideMaxItems = 40

	// The generated draft is 6-8 items: fewer cannot cover the five dimensions,
	// more does not fit the round it is meant for. `limit` in the request moves
	// the count inside that window and nothing outside it.
	hrGuideGenerateDefaultCount = 7
	hrGuideGenerateMinCount     = 6
	hrGuideGenerateMaxCount     = 8

	// hrGuideKeywordLimit bounds the keyword pool the template generator draws
	// from, so one pasted résumé cannot turn every question into a word salad.
	hrGuideKeywordLimit = 12
)

var (
	// hrQuestionDimensions reuses the scorecard's four dimensions (683) plus
	// `risk`, which the card does not have: the questions written to surface a
	// disqualifier are not "low skill", and scoring them as such would average a
	// red flag into a 3.
	hrQuestionDimensions = map[string]bool{
		"skill": true, "experience": true, "culture": true, "potential": true, "risk": true,
	}

	hrQuestionSources = map[string]bool{"manual": true, "ai": true, "template": true}
	hrGuideStatuses   = map[string]bool{"draft": true, "ready": true, "used": true}

	hrEmptyJSONArray = []byte("[]")
)

// ---- request bodies --------------------------------------------------------

// HrQuestionRequest is both the create body and the PATCH body. `usage_count` is
// not client-writable: it counts snapshots that named this question, so the only
// writer is the guide save path.
//
// A nil `Tags` means "not sent"; an empty non-nil slice clears the list, exactly
// like `hr_job.keywords`.
type HrQuestionRequest struct {
	JobID         *string  `json:"job_id"`
	Dimension     *string  `json:"dimension"`
	Question      *string  `json:"question"`
	Intent        *string  `json:"intent"`
	Signals       *string  `json:"signals"`
	RedFlags      *string  `json:"red_flags"`
	Source        *string  `json:"source"`
	Tags          []string `json:"tags"`
	OwnerMemberID *string  `json:"owner_member_id"`
}

// HrGuideItem is one snapshot entry: the question as it stood when the guide was
// saved, plus the interviewer's own record of the round.
//
// The text fields are plain strings rather than pointers because the item is a
// document the client renders row by row — "" reads as "not written down yet" and
// there is nothing a JSON null would add. `Score` is a pointer because "not scored
// yet" and "scored 0" are different answers, and 0 is a valid score on the 0-5
// scale the scorecard uses.
type HrGuideItem struct {
	QuestionID *string `json:"question_id"`
	Dimension  string  `json:"dimension"`
	Question   string  `json:"question"`
	Intent     string  `json:"intent"`
	Signals    string  `json:"signals"`
	RedFlags   string  `json:"red_flags"`
	Asked      bool    `json:"asked"`
	Note       string  `json:"note"`
	Score      *int16  `json:"score"`
}

// HrGuideRequest is the create/PATCH body for one round's outline. `items` is
// replaced whole: nil means "not sent" and an empty array is a deliberate clear, so
// a PATCH that carries no `items` never wipes the outline it did not mention.
type HrGuideRequest struct {
	InterviewID   *string       `json:"interview_id"`
	CandidateID   *string       `json:"candidate_id"`
	JobID         *string       `json:"job_id"`
	Round         *int16        `json:"round"`
	Status        *string       `json:"status"`
	Items         []HrGuideItem `json:"items"`
	Note          *string       `json:"note"`
	OwnerMemberID *string       `json:"owner_member_id"`
}

// HrGuideItemPatchRequest edits one snapshot entry in place: what was asked, what
// the interviewer noted, and the score. The question text itself is not editable
// here — retyping a question mid-round would break the snapshot the guide exists
// to be. `Score` is raw so `"score": null` (clear it) can be told apart from an
// omitted key (keep it).
type HrGuideItemPatchRequest struct {
	Asked *bool           `json:"asked"`
	Note  *string         `json:"note"`
	Score json.RawMessage `json:"score"`
}

// HrGuideGenerateRequest is `POST /guides/generate`: the facts the draft is built
// from. Nothing is written; the client confirms the draft through `POST /guides`.
type HrGuideGenerateRequest struct {
	CandidateID *string `json:"candidate_id"`
	Round       *int16  `json:"round"`
	JobID       *string `json:"job_id"`
	Limit       *int32  `json:"limit"`
}

// ---- responses -------------------------------------------------------------

type HrQuestionResponse struct {
	ID            string   `json:"id"`
	WorkspaceID   string   `json:"workspace_id"`
	JobID         *string  `json:"job_id"`
	Dimension     string   `json:"dimension"`
	Question      string   `json:"question"`
	Intent        *string  `json:"intent"`
	Signals       *string  `json:"signals"`
	RedFlags      *string  `json:"red_flags"`
	Source        string   `json:"source"`
	Tags          []string `json:"tags"`
	UsageCount    int32    `json:"usage_count"`
	OwnerMemberID *string  `json:"owner_member_id"`
	CreatedBy     *string  `json:"created_by"`
	CreatedAt     string   `json:"created_at"`
	UpdatedAt     string   `json:"updated_at"`
}

func hrQuestionToResponse(q db.HrQuestion) HrQuestionResponse {
	tags := q.Tags
	if tags == nil {
		tags = []string{}
	}
	return HrQuestionResponse{
		ID:            uuidToString(q.ID),
		WorkspaceID:   uuidToString(q.WorkspaceID),
		JobID:         uuidToPtr(q.JobID),
		Dimension:     q.Dimension,
		Question:      q.Question,
		Intent:        textToPtr(q.Intent),
		Signals:       textToPtr(q.Signals),
		RedFlags:      textToPtr(q.RedFlags),
		Source:        q.Source,
		Tags:          tags,
		UsageCount:    q.UsageCount,
		OwnerMemberID: uuidToPtr(q.OwnerMemberID),
		CreatedBy:     uuidToPtr(q.CreatedBy),
		CreatedAt:     timestampToString(q.CreatedAt),
		UpdatedAt:     timestampToString(q.UpdatedAt),
	}
}

type HrGuideResponse struct {
	ID            string        `json:"id"`
	WorkspaceID   string        `json:"workspace_id"`
	InterviewID   *string       `json:"interview_id"`
	CandidateID   string        `json:"candidate_id"`
	JobID         *string       `json:"job_id"`
	Round         int16         `json:"round"`
	Status        string        `json:"status"`
	Items         []HrGuideItem `json:"items"`
	Note          *string       `json:"note"`
	OwnerMemberID *string       `json:"owner_member_id"`
	CreatedBy     *string       `json:"created_by"`
	CreatedAt     string        `json:"created_at"`
	UpdatedAt     string        `json:"updated_at"`
}

func hrGuideToResponse(g db.HrInterviewGuide) HrGuideResponse {
	return HrGuideResponse{
		ID:            uuidToString(g.ID),
		WorkspaceID:   uuidToString(g.WorkspaceID),
		InterviewID:   uuidToPtr(g.InterviewID),
		CandidateID:   uuidToString(g.CandidateID),
		JobID:         uuidToPtr(g.JobID),
		Round:         g.Round,
		Status:        g.Status,
		Items:         hrGuideItemsFromColumn(g.Items),
		Note:          textToPtr(g.Note),
		OwnerMemberID: uuidToPtr(g.OwnerMemberID),
		CreatedBy:     uuidToPtr(g.CreatedBy),
		CreatedAt:     timestampToString(g.CreatedAt),
		UpdatedAt:     timestampToString(g.UpdatedAt),
	}
}

// HrGuideGenerateResponse is an unsaved draft. `source` is the answer the client
// shows next to it: `template` means the skeleton generator wrote it (no model is
// configured), `ai` means a model drafted it. It is never `manual` — nothing was
// stored.
type HrGuideGenerateResponse struct {
	CandidateID string        `json:"candidate_id"`
	Round       int16         `json:"round"`
	JobID       *string       `json:"job_id"`
	Source      string        `json:"source"`
	Items       []HrGuideItem `json:"items"`
	Total       int           `json:"total"`
}

// ---- item helpers ----------------------------------------------------------

// hrGuideItemsFromColumn reads the JSONB snapshot. A drifted value — an object, a
// scalar, malformed JSON — degrades to an empty list rather than failing the
// read: an outline whose items cannot be parsed is still a row the interviewer
// owns, and blanking the panel is recoverable while a 500 is not.
func hrGuideItemsFromColumn(raw []byte) []HrGuideItem {
	items := []HrGuideItem{}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return items
	}
	if err := json.Unmarshal([]byte(trimmed), &items); err != nil || items == nil {
		return []HrGuideItem{}
	}
	return items
}

// hrGuideItemsColumn serializes a validated snapshot for the column.
func hrGuideItemsColumn(items []HrGuideItem) []byte {
	if items == nil {
		return hrEmptyJSONArray
	}
	raw, err := json.Marshal(items)
	if err != nil {
		return hrEmptyJSONArray
	}
	return raw
}

// hrNormalizeGuideItems trims the stored strings and enforces the snapshot's
// contract: at most 40 entries, every entry carrying a question, a dimension from
// the enum, and a score that is either absent or on the 0-5 scale.
//
// The validation is here rather than in a CHECK constraint because the rules are
// about the *elements* of a JSONB array, which a column constraint cannot say; one
// function keeps the write paths (create, patch, append) in step.
func hrNormalizeGuideItems(w http.ResponseWriter, items []HrGuideItem) ([]HrGuideItem, bool) {
	if len(items) > hrGuideMaxItems {
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("a guide holds at most %d questions", hrGuideMaxItems))
		return nil, false
	}
	cleaned := make([]HrGuideItem, len(items))
	for i, item := range items {
		item.Dimension = strings.TrimSpace(item.Dimension)
		if !hrQuestionDimensions[item.Dimension] {
			writeError(w, http.StatusBadRequest,
				fmt.Sprintf("items[%d].dimension must be skill, experience, culture, potential or risk", i))
			return nil, false
		}
		item.Question = strings.TrimSpace(item.Question)
		if item.Question == "" {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("items[%d].question is required", i))
			return nil, false
		}
		item.Intent = strings.TrimSpace(item.Intent)
		item.Signals = strings.TrimSpace(item.Signals)
		item.RedFlags = strings.TrimSpace(item.RedFlags)
		item.Note = strings.TrimSpace(item.Note)
		if item.Score != nil && (*item.Score < 0 || *item.Score > 5) {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("items[%d].score must be between 0 and 5", i))
			return nil, false
		}
		if item.QuestionID != nil {
			trimmed := strings.TrimSpace(*item.QuestionID)
			if trimmed == "" {
				item.QuestionID = nil
			} else {
				questionID, ok := parseUUIDOrBadRequest(w, trimmed, fmt.Sprintf("items[%d].question_id", i))
				if !ok {
					return nil, false
				}
				value := uuidToString(questionID)
				item.QuestionID = &value
			}
		}
		cleaned[i] = item
	}
	return cleaned, true
}

// hrSnapshotsQuestionUsage bumps `usage_count` for every bank row a snapshot
// names. It is best effort by design: the guide is already saved, and a failure to
// count a use must not turn a successful save into a 500 — the number is a
// popularity hint, not the record.
func (h *Handler) hrSnapshotsQuestionUsage(ctx context.Context, r *http.Request, scope workbenchScope, items []HrGuideItem) {
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		if item.QuestionID == nil || seen[*item.QuestionID] {
			continue
		}
		seen[*item.QuestionID] = true
		questionID, err := util.ParseUUID(*item.QuestionID)
		if err != nil {
			continue
		}
		if err := h.Queries.IncrementHrQuestionUsage(ctx, db.IncrementHrQuestionUsageParams{
			ID:          questionID,
			WorkspaceID: scope.WorkspaceUUID,
		}); err != nil {
			workbenchLogOnly(r, "failed to count a question's use", err)
		}
	}
}

// workbenchLogOnly records a non-fatal failure without turning it into a response.
func workbenchLogOnly(r *http.Request, message string, err error) {
	slog.Warn(message, append(logger.RequestAttrs(r), "error", err)...)
}

// ---- question bank: loaders and validators ---------------------------------

// loadHrQuestionForWrite resolves {questionId} inside the workspace and checks the
// write gate, which for a bank row is its own owner.
func (h *Handler) loadHrQuestionForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrQuestion, bool) {
	questionID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "questionId"), "question id")
	if !ok {
		return db.HrQuestion{}, false
	}
	question, err := h.Queries.GetHrQuestion(r.Context(), db.GetHrQuestionParams{
		ID:          questionID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "question not found")
		return db.HrQuestion{}, false
	}
	if !workbenchCanWrite(scope.Member, question.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change questions you own")
		return db.HrQuestion{}, false
	}
	return question, true
}

// hrQuestionConflicts answers the "one row per sentence" rule before the insert.
// The unique index behind it is the race-safe backstop; this read exists so the
// common case answers 409 with a message instead of an unhandled violation.
func (h *Handler) hrQuestionConflicts(ctx context.Context, w http.ResponseWriter, r *http.Request, scope workbenchScope, question string, excludeID pgtype.UUID) bool {
	conflicts, err := h.Queries.CountHrQuestionConflicts(ctx, db.CountHrQuestionConflictsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Question:    question,
		ExcludeID:   excludeID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to check the question bank", err)
		return false
	}
	if conflicts > 0 {
		writeError(w, http.StatusConflict, "this question is already in the bank")
		return false
	}
	return true
}

// hrQuestionDimension validates the required dimension enum.
func hrQuestionDimension(w http.ResponseWriter, raw *string) (string, bool) {
	dimension := strings.TrimSpace(valueOrEmpty(raw))
	if dimension == "" {
		writeError(w, http.StatusBadRequest, "dimension is required")
		return "", false
	}
	if !hrQuestionDimensions[dimension] {
		writeError(w, http.StatusBadRequest, "dimension must be skill, experience, culture, potential or risk")
		return "", false
	}
	return dimension, true
}

// hrQuestionSource validates the optional provenance, defaulting to `manual`.
func hrQuestionSource(w http.ResponseWriter, raw *string) (string, bool) {
	source := strings.TrimSpace(valueOrEmpty(raw))
	if source == "" {
		return "manual", true
	}
	if !hrQuestionSources[source] {
		writeError(w, http.StatusBadRequest, "source must be manual, ai or template")
		return "", false
	}
	return source, true
}

// ---- guides: loaders and validators ---------------------------------------

// hrGuideOwner is the row whose owner decides the write: the candidate's, and only
// when the candidate records none, the guide's own. A guide that named its creator
// as its owner first would let whoever prepared the outline edit a candidate
// somebody else owns — the outline is a view of that candidate, not an asset of the
// preparer.
func hrGuideOwner(candidate db.HrCandidate, guide db.HrInterviewGuide) pgtype.UUID {
	if candidate.OwnerMemberID.Valid {
		return candidate.OwnerMemberID
	}
	return guide.OwnerMemberID
}

// loadHrGuideForWrite resolves {guideId} plus the candidate that gates it.
func (h *Handler) loadHrGuideForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrInterviewGuide, db.HrCandidate, bool) {
	guideID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "guideId"), "guide id")
	if !ok {
		return db.HrInterviewGuide{}, db.HrCandidate{}, false
	}
	guide, err := h.Queries.GetHrInterviewGuide(r.Context(), db.GetHrInterviewGuideParams{
		ID:          guideID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "guide not found")
		return db.HrInterviewGuide{}, db.HrCandidate{}, false
	}
	candidate, err := h.Queries.GetHrCandidate(r.Context(), db.GetHrCandidateParams{
		ID:          guide.CandidateID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "guide not found")
		return db.HrInterviewGuide{}, db.HrCandidate{}, false
	}
	if !workbenchCanWrite(scope.Member, hrGuideOwner(candidate, guide)) {
		writeError(w, http.StatusForbidden, "you can only change guides of candidates you own")
		return db.HrInterviewGuide{}, db.HrCandidate{}, false
	}
	return guide, candidate, true
}

// hrGuideCanPrepare reports whether the caller may prepare a guide for this
// candidate: the create gate, mirrored for the unsaved draft the generator
// returns.
func hrGuideCanPrepare(scope workbenchScope, candidate db.HrCandidate) bool {
	if !candidate.OwnerMemberID.Valid {
		// An unowned candidate has no owner to defer to, and the creator becomes
		// the guide's owner, so preparing one is allowed.
		return true
	}
	return workbenchCanWrite(scope.Member, candidate.OwnerMemberID)
}

// hrGuideConflicts answers "one guide per candidate per round" before the insert,
// with the unique index as the race-safe backstop.
func (h *Handler) hrGuideConflicts(ctx context.Context, w http.ResponseWriter, r *http.Request, scope workbenchScope, candidateID pgtype.UUID, round int16, excludeID pgtype.UUID) bool {
	conflicts, err := h.Queries.CountHrGuideConflicts(ctx, db.CountHrGuideConflictsParams{
		WorkspaceID: scope.WorkspaceUUID,
		CandidateID: candidateID,
		Round:       round,
		ExcludeID:   excludeID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to check the guide", err)
		return false
	}
	if conflicts > 0 {
		writeError(w, http.StatusConflict, "this candidate already has a guide for that round")
		return false
	}
	return true
}

// hrGuideRound validates the round number. It is required to be positive because it
// is half of the per-candidate key: round 0 would be a second way to say round 1.
func hrGuideRound(patched *int16, current int16) (int16, bool) {
	round := applyInt16Value(patched, current)
	return round, round > 0
}

// hrGuideStatus validates the outline's own lifecycle.
func hrGuideStatus(w http.ResponseWriter, raw *string, current string) (string, bool) {
	if raw == nil {
		return current, true
	}
	status := strings.TrimSpace(*raw)
	if !hrGuideStatuses[status] {
		writeError(w, http.StatusBadRequest, "status must be draft, ready or used")
		return "", false
	}
	return status, true
}

// hrGuideInterview validates the optional interview pointer and returns its
// candidate so a guide cannot be attached to another person's round.
func (h *Handler) hrGuideInterview(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (pgtype.UUID, pgtype.UUID, bool) {
	interviewID, ok := workbenchOptionalUUID(w, raw, "interview_id")
	if !ok {
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	if !interviewID.Valid {
		return pgtype.UUID{}, pgtype.UUID{}, true
	}
	interview, err := h.Queries.GetHrInterview(r.Context(), db.GetHrInterviewParams{
		ID:          interviewID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "interview_id is not an interview in this workspace")
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	return interviewID, interview.CandidateID, true
}

// ---- questions: CRUD -------------------------------------------------------

// ListHrQuestions — GET /api/workbench/hr/questions
func (h *Handler) ListHrQuestions(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	jobID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("job_id"))), "job_id")
	if !ok {
		return
	}
	dimension := strings.TrimSpace(r.URL.Query().Get("dimension"))
	if dimension != "" && !hrQuestionDimensions[dimension] {
		writeError(w, http.StatusBadRequest, "dimension must be skill, experience, culture, potential or risk")
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetHrQuestion(r.Context(), db.GetHrQuestionParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListHrQuestions(r.Context(), db.ListHrQuestionsParams{
		WorkspaceID: scope.WorkspaceUUID,
		JobID:       jobID,
		Dimension:   optionalTrimmedText(stringPtr(dimension)),
		Query:       optionalTrimmedText(stringPtr(query)),
		CursorAt:    cursorAt,
		CursorID:    cursorID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list questions", err)
		return
	}
	resp := make([]HrQuestionResponse, len(rows))
	for i, row := range rows {
		resp[i] = hrQuestionToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"questions": resp, "total": len(resp)})
}

// CreateHrQuestion — POST /api/workbench/hr/questions
func (h *Handler) CreateHrQuestion(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req HrQuestionRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	dimension, ok := hrQuestionDimension(w, req.Dimension)
	if !ok {
		return
	}
	question := strings.TrimSpace(valueOrEmpty(req.Question))
	if question == "" {
		writeError(w, http.StatusBadRequest, "question is required")
		return
	}
	source, ok := hrQuestionSource(w, req.Source)
	if !ok {
		return
	}
	var jobID pgtype.UUID
	if req.JobID != nil && strings.TrimSpace(*req.JobID) != "" {
		job, ok := h.requireHrJobInWorkspace(r.Context(), w, scope.WorkspaceID, req.JobID)
		if !ok {
			return
		}
		jobID = job.ID
	}
	ownerID, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	if !h.hrQuestionConflicts(r.Context(), w, r, scope, question, hrZeroUUID) {
		return
	}

	created, err := h.Queries.CreateHrQuestion(r.Context(), db.CreateHrQuestionParams{
		WorkspaceID:   scope.WorkspaceUUID,
		JobID:         jobID,
		Dimension:     dimension,
		Question:      question,
		Intent:        optionalTrimmedText(req.Intent),
		Signals:       optionalTrimmedText(req.Signals),
		RedFlags:      optionalTrimmedText(req.RedFlags),
		Source:        source,
		Tags:          hrTagListOrEmpty(req.Tags),
		UsageCount:    0,
		OwnerMemberID: ownerID,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this question is already in the bank")
			return
		}
		workbenchInternalError(w, r, "failed to create question", err)
		return
	}
	h.publishHrChanged(eventHrQuestionChanged, scope.WorkspaceID, uuidToString(created.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, hrQuestionToResponse(created))
}

// GetHrQuestion — GET /api/workbench/hr/questions/{questionId}
func (h *Handler) GetHrQuestion(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	questionID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "questionId"), "question id")
	if !ok {
		return
	}
	question, err := h.Queries.GetHrQuestion(r.Context(), db.GetHrQuestionParams{
		ID:          questionID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "question not found")
		return
	}
	writeJSON(w, http.StatusOK, hrQuestionToResponse(question))
}

// UpdateHrQuestion — PATCH /api/workbench/hr/questions/{questionId}
//
// Editing a bank row never touches a saved guide: guides hold snapshots (759), so
// this PATCH changes what the *next* guide will copy.
func (h *Handler) UpdateHrQuestion(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrQuestionForWrite(w, r, scope)
	if !ok {
		return
	}
	var req HrQuestionRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	dimension := current.Dimension
	if req.Dimension != nil {
		parsed, ok := hrQuestionDimension(w, req.Dimension)
		if !ok {
			return
		}
		dimension = parsed
	}
	question := current.Question
	if req.Question != nil {
		question = strings.TrimSpace(*req.Question)
		if question == "" {
			writeError(w, http.StatusBadRequest, "question is required")
			return
		}
	}
	source := current.Source
	if req.Source != nil && strings.TrimSpace(*req.Source) != "" {
		parsed, ok := hrQuestionSource(w, req.Source)
		if !ok {
			return
		}
		source = parsed
	}
	jobID := current.JobID
	if req.JobID != nil {
		if strings.TrimSpace(*req.JobID) == "" {
			jobID = pgtype.UUID{}
		} else {
			job, ok := h.requireHrJobInWorkspace(r.Context(), w, scope.WorkspaceID, req.JobID)
			if !ok {
				return
			}
			jobID = job.ID
		}
	}
	ownerID, ok := h.hrQuestionOwnerForUpdate(w, r, scope, current.OwnerMemberID, req.OwnerMemberID)
	if !ok {
		return
	}
	tags := current.Tags
	if req.Tags != nil {
		tags = hrTagList(req.Tags)
	}
	if tags == nil {
		tags = []string{}
	}
	if !h.hrQuestionConflicts(r.Context(), w, r, scope, question, current.ID) {
		return
	}

	updated, err := h.Queries.UpdateHrQuestion(r.Context(), db.UpdateHrQuestionParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		JobID:         jobID,
		Dimension:     dimension,
		Question:      question,
		Intent:        applyTextPatch(req.Intent, current.Intent),
		Signals:       applyTextPatch(req.Signals, current.Signals),
		RedFlags:      applyTextPatch(req.RedFlags, current.RedFlags),
		Source:        source,
		Tags:          tags,
		OwnerMemberID: ownerID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this question is already in the bank")
			return
		}
		workbenchInternalError(w, r, "failed to update question", err)
		return
	}
	h.publishHrChanged(eventHrQuestionChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrQuestionToResponse(updated))
}

// DeleteHrQuestion — DELETE /api/workbench/hr/questions/{questionId}
//
// Soft delete, and it does not reach into guides: an outline that already copied
// this question keeps it, which is the whole point of the snapshot.
func (h *Handler) DeleteHrQuestion(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrQuestionForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveHrQuestion(r.Context(), db.ArchiveHrQuestionParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete question", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "question not found")
		return
	}
	h.publishHrChanged(eventHrQuestionChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// hrQuestionOwnerForUpdate resolves the owner a question PATCH leaves behind: an
// absent or empty field keeps the stored owner (clearing an owner is not a supported
// edit anywhere in the workbench), and a different one is delegated to
// `workbenchOwnerForUpdate`, which only an owner/admin may do.
func (h *Handler) hrQuestionOwnerForUpdate(w http.ResponseWriter, r *http.Request, scope workbenchScope, current pgtype.UUID, raw *string) (pgtype.UUID, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return current, true
	}
	requested, ok := parseUUIDOrBadRequest(w, strings.TrimSpace(*raw), "owner_member_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	return h.workbenchOwnerForUpdate(w, r, scope, current, requested)
}

// hrTagList trims a requested tag list for the TEXT[] column. nil means "not
// sent"; an empty slice is a deliberate clear. The column is `NOT NULL DEFAULT
// '{}'`, so a stored value is never handed back as nil.
func hrTagList(tags []string) []string {
	if tags == nil {
		return nil
	}
	cleaned := make([]string, 0, len(tags))
	for _, tag := range tags {
		if trimmed := strings.TrimSpace(tag); trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}
	return cleaned
}

// ---- guides: CRUD ----------------------------------------------------------

// ListHrInterviewGuides — GET /api/workbench/hr/guides
func (h *Handler) ListHrInterviewGuides(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	candidateID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("candidate_id"))), "candidate_id")
	if !ok {
		return
	}
	interviewID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("interview_id"))), "interview_id")
	if !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !hrGuideStatuses[status] {
		writeError(w, http.StatusBadRequest, "status must be draft, ready or used")
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetHrInterviewGuide(r.Context(), db.GetHrInterviewGuideParams{
			ID:          id,
			WorkspaceID: scope.WorkspaceUUID,
		})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListHrInterviewGuides(r.Context(), db.ListHrInterviewGuidesParams{
		WorkspaceID: scope.WorkspaceUUID,
		CandidateID: candidateID,
		InterviewID: interviewID,
		Status:      optionalTrimmedText(stringPtr(status)),
		CursorAt:    cursorAt,
		CursorID:    cursorID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list guides", err)
		return
	}
	resp := make([]HrGuideResponse, len(rows))
	for i, row := range rows {
		resp[i] = hrGuideToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"guides": resp, "total": len(resp)})
}

// CreateHrInterviewGuide — POST /api/workbench/hr/guides
func (h *Handler) CreateHrInterviewGuide(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req HrGuideRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	candidate, ok := h.requireHrCandidateInWorkspace(r.Context(), w, scope.WorkspaceID, req.CandidateID)
	if !ok {
		return
	}
	if !hrGuideCanPrepare(scope, candidate) {
		writeError(w, http.StatusForbidden, "you can only prepare guides for candidates you own")
		return
	}
	round, ok := hrGuideRound(req.Round, 1)
	if !ok {
		writeError(w, http.StatusBadRequest, "round must be greater than 0")
		return
	}
	status, ok := hrGuideStatus(w, req.Status, "draft")
	if !ok {
		return
	}
	interviewID, interviewCandidateID, ok := h.hrGuideInterview(w, r, scope, req.InterviewID)
	if !ok {
		return
	}
	if interviewID.Valid && uuidToString(interviewCandidateID) != uuidToString(candidate.ID) {
		writeError(w, http.StatusBadRequest, "interview_id belongs to another candidate")
		return
	}
	jobID := candidate.JobID
	if req.JobID != nil {
		if strings.TrimSpace(*req.JobID) == "" {
			jobID = pgtype.UUID{}
		} else {
			job, ok := h.requireHrJobInWorkspace(r.Context(), w, scope.WorkspaceID, req.JobID)
			if !ok {
				return
			}
			jobID = job.ID
		}
	}
	items, ok := hrGuideRequestItems(w, req.Items)
	if !ok {
		return
	}
	ownerID, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	if !h.hrGuideConflicts(r.Context(), w, r, scope, candidate.ID, round, hrZeroUUID) {
		return
	}

	created, err := h.Queries.CreateHrInterviewGuide(r.Context(), db.CreateHrInterviewGuideParams{
		WorkspaceID:   scope.WorkspaceUUID,
		InterviewID:   interviewID,
		CandidateID:   candidate.ID,
		JobID:         jobID,
		Round:         round,
		Status:        status,
		Items:         string(hrGuideItemsColumn(items)),
		Note:          optionalTrimmedText(req.Note),
		OwnerMemberID: ownerID,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this candidate already has a guide for that round")
			return
		}
		workbenchInternalError(w, r, "failed to create guide", err)
		return
	}
	h.hrSnapshotsQuestionUsage(r.Context(), r, scope, items)
	h.publishHrChanged(eventHrInterviewGuideChanged, scope.WorkspaceID, uuidToString(created.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, hrGuideToResponse(created))
}

// hrGuideRequestItems normalizes the `items` a create body carried. A nil slice is
// "nothing sent", which is a legitimate empty outline on create; the PATCH path
// distinguishes nil from an empty array itself, so that an omitted `items` never
// clears a saved one.
func hrGuideRequestItems(w http.ResponseWriter, items []HrGuideItem) ([]HrGuideItem, bool) {
	if items == nil {
		return []HrGuideItem{}, true
	}
	return hrNormalizeGuideItems(w, items)
}

// GetHrInterviewGuide — GET /api/workbench/hr/guides/{guideId}
func (h *Handler) GetHrInterviewGuide(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	guideID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "guideId"), "guide id")
	if !ok {
		return
	}
	guide, err := h.Queries.GetHrInterviewGuide(r.Context(), db.GetHrInterviewGuideParams{
		ID:          guideID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "guide not found")
		return
	}
	writeJSON(w, http.StatusOK, hrGuideToResponse(guide))
}

// UpdateHrInterviewGuide — PATCH /api/workbench/hr/guides/{guideId}
//
// `candidate_id` is not movable: the guide belongs to a person, and moving it would
// silently rewrite whose round this is. Sending the same id back is accepted so a
// client can resend the row it just read.
func (h *Handler) UpdateHrInterviewGuide(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, candidate, ok := h.loadHrGuideForWrite(w, r, scope)
	if !ok {
		return
	}
	var req HrGuideRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	if req.CandidateID != nil && strings.TrimSpace(*req.CandidateID) != "" {
		moved, ok := h.requireHrCandidateInWorkspace(r.Context(), w, scope.WorkspaceID, req.CandidateID)
		if !ok {
			return
		}
		if uuidToString(moved.ID) != uuidToString(candidate.ID) {
			writeError(w, http.StatusBadRequest, "candidate_id cannot be changed")
			return
		}
	}

	round := current.Round
	if req.Round != nil {
		parsed, ok := hrGuideRound(req.Round, current.Round)
		if !ok {
			writeError(w, http.StatusBadRequest, "round must be greater than 0")
			return
		}
		round = parsed
	}
	status, ok := hrGuideStatus(w, req.Status, current.Status)
	if !ok {
		return
	}
	interviewID := current.InterviewID
	if req.InterviewID != nil {
		parsed, interviewCandidateID, ok := h.hrGuideInterview(w, r, scope, req.InterviewID)
		if !ok {
			return
		}
		if parsed.Valid && uuidToString(interviewCandidateID) != uuidToString(candidate.ID) {
			writeError(w, http.StatusBadRequest, "interview_id belongs to another candidate")
			return
		}
		interviewID = parsed
	}
	jobID := current.JobID
	if req.JobID != nil {
		if strings.TrimSpace(*req.JobID) == "" {
			jobID = pgtype.UUID{}
		} else {
			job, ok := h.requireHrJobInWorkspace(r.Context(), w, scope.WorkspaceID, req.JobID)
			if !ok {
				return
			}
			jobID = job.ID
		}
	}
	items := hrGuideItemsFromColumn(current.Items)
	if req.Items != nil {
		parsed, ok := hrNormalizeGuideItems(w, req.Items)
		if !ok {
			return
		}
		items = parsed
	}
	if !h.hrGuideConflicts(r.Context(), w, r, scope, candidate.ID, round, current.ID) {
		return
	}

	updated, err := h.Queries.UpdateHrInterviewGuide(r.Context(), db.UpdateHrInterviewGuideParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
		InterviewID: interviewID,
		JobID:       jobID,
		Round:       round,
		Status:      status,
		Items:       string(hrGuideItemsColumn(items)),
		Note:        applyTextPatch(req.Note, current.Note),
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this candidate already has a guide for that round")
			return
		}
		workbenchInternalError(w, r, "failed to update guide", err)
		return
	}
	h.publishHrChanged(eventHrInterviewGuideChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrGuideToResponse(updated))
}

// DeleteHrInterviewGuide — DELETE /api/workbench/hr/guides/{guideId}
func (h *Handler) DeleteHrInterviewGuide(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, _, ok := h.loadHrGuideForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveHrInterviewGuide(r.Context(), db.ArchiveHrInterviewGuideParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete guide", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "guide not found")
		return
	}
	h.publishHrChanged(eventHrInterviewGuideChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- guides: items ---------------------------------------------------------

// AppendHrGuideItem — POST /api/workbench/hr/guides/{guideId}/items
//
// The route the picker uses: it appends one question's snapshot and answers the
// whole outline, because appending shifts nothing and the client renders the list
// from one payload.
func (h *Handler) AppendHrGuideItem(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	guide, _, ok := h.loadHrGuideForWrite(w, r, scope)
	if !ok {
		return
	}
	var item HrGuideItem
	if !decodeWorkbenchBody(w, r, &item) {
		return
	}
	items := hrGuideItemsFromColumn(guide.Items)
	if len(items) >= hrGuideMaxItems {
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("a guide holds at most %d questions", hrGuideMaxItems))
		return
	}
	normalized, ok := hrNormalizeGuideItems(w, []HrGuideItem{item})
	if !ok {
		return
	}
	items = append(items, normalized[0])
	updated, ok := h.saveHrGuideItems(w, r, scope, guide, items)
	if !ok {
		return
	}
	h.hrSnapshotsQuestionUsage(r.Context(), r, scope, normalized)
	h.publishHrChanged(eventHrInterviewGuideChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, hrGuideToResponse(updated))
}

// hrGuideItemIndex reads `{index}` from the path and bounds it against the current
// snapshot. An out-of-range index is a 404: the entry the client is editing is not
// there any more, which is the same answer as a missing row.
func hrGuideItemIndex(w http.ResponseWriter, raw string, count int) (int, bool) {
	index, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || index < 0 || index >= count {
		writeError(w, http.StatusNotFound, "guide item not found")
		return 0, false
	}
	return index, true
}

// UpdateHrGuideItem — PATCH /api/workbench/hr/guides/{guideId}/items/{index}
//
// Edits one entry of the snapshot: whether it was asked, the note taken in the
// room, and the 0-5 score. The question text is deliberately not patchable — a
// guide's value is that it records what was actually asked.
func (h *Handler) UpdateHrGuideItem(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	guide, _, ok := h.loadHrGuideForWrite(w, r, scope)
	if !ok {
		return
	}
	items := hrGuideItemsFromColumn(guide.Items)
	index, ok := hrGuideItemIndex(w, chi.URLParam(r, "index"), len(items))
	if !ok {
		return
	}
	var req HrGuideItemPatchRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	item := items[index]
	if req.Asked != nil {
		item.Asked = *req.Asked
	}
	if req.Note != nil {
		item.Note = strings.TrimSpace(*req.Note)
	}
	if len(req.Score) > 0 {
		if strings.TrimSpace(string(req.Score)) == "null" {
			item.Score = nil
		} else {
			var score int16
			if err := json.Unmarshal(req.Score, &score); err != nil {
				writeError(w, http.StatusBadRequest, "score must be a number between 0 and 5, or null")
				return
			}
			if score < 0 || score > 5 {
				writeError(w, http.StatusBadRequest, "score must be between 0 and 5")
				return
			}
			item.Score = &score
		}
	}
	items[index] = item
	updated, ok := h.saveHrGuideItems(w, r, scope, guide, items)
	if !ok {
		return
	}
	h.publishHrChanged(eventHrInterviewGuideChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrGuideToResponse(updated))
}

// DeleteHrGuideItem — DELETE /api/workbench/hr/guides/{guideId}/items/{index}
//
// Answers the whole outline rather than 204: deleting entry 3 renumbers 4..n, and
// a client that only learned "it worked" would have to guess the new order.
func (h *Handler) DeleteHrGuideItem(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	guide, _, ok := h.loadHrGuideForWrite(w, r, scope)
	if !ok {
		return
	}
	items := hrGuideItemsFromColumn(guide.Items)
	index, ok := hrGuideItemIndex(w, chi.URLParam(r, "index"), len(items))
	if !ok {
		return
	}
	items = append(items[:index], items[index+1:]...)
	updated, ok := h.saveHrGuideItems(w, r, scope, guide, items)
	if !ok {
		return
	}
	h.publishHrChanged(eventHrInterviewGuideChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrGuideToResponse(updated))
}

// saveHrGuideItems is the one statement that rewrites a snapshot, so the three item
// routes cannot drift on status, round or the guide fields they do not touch.
func (h *Handler) saveHrGuideItems(w http.ResponseWriter, r *http.Request, scope workbenchScope, guide db.HrInterviewGuide, items []HrGuideItem) (db.HrInterviewGuide, bool) {
	updated, err := h.Queries.UpdateHrInterviewGuide(r.Context(), db.UpdateHrInterviewGuideParams{
		ID:          guide.ID,
		WorkspaceID: scope.WorkspaceUUID,
		InterviewID: guide.InterviewID,
		JobID:       guide.JobID,
		Round:       guide.Round,
		Status:      guide.Status,
		Items:       string(hrGuideItemsColumn(items)),
		Note:        guide.Note,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update the guide", err)
		return db.HrInterviewGuide{}, false
	}
	return updated, true
}

// ---- guides: generate ------------------------------------------------------

// GenerateHrInterviewGuide — POST /api/workbench/hr/guides/generate
//
// Returns an **unsaved** draft: the client shows the questions, edits or drops
// them, and only then saves through POST /guides. That split is why this route
// writes nothing — a draft the user rejected must not exist as a row, and a byte of
// state would be a second thing to clean up.
//
// Two sources, and the answer says which one ran:
//
//   - `ai` — the deployment has an LLM configured (h.LLM). The model drafts the
//     questions from the requisition's `jd` / `requirements` / `keywords` and the
//     candidate's résumé; the reply is parsed and validated by the same rules a
//     save would apply.
//   - `template` — no model, or the model failed. A deterministic skeleton
//     generator reads the same fields and writes 6-8 questions across the five
//     dimensions, each with its intent and signals.
//
// The fallback is announced, never faked: `source` in the response is the truth
// about where the text came from, and a deployment without a model says so.
func (h *Handler) GenerateHrInterviewGuide(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req HrGuideGenerateRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	candidate, ok := h.requireHrCandidateInWorkspace(r.Context(), w, scope.WorkspaceID, req.CandidateID)
	if !ok {
		return
	}
	if !hrGuideCanPrepare(scope, candidate) {
		writeError(w, http.StatusForbidden, "you can only prepare guides for candidates you own")
		return
	}
	round := applyInt16Value(req.Round, 1)
	if round <= 0 {
		writeError(w, http.StatusBadRequest, "round must be greater than 0")
		return
	}

	// The requisition the draft is written against: the one the caller named, else
	// the one the candidate is in the funnel for.
	job := db.HrJob{}
	var jobID pgtype.UUID
	if req.JobID != nil && strings.TrimSpace(*req.JobID) != "" {
		loaded, ok := h.requireHrJobInWorkspace(r.Context(), w, scope.WorkspaceID, req.JobID)
		if !ok {
			return
		}
		job, jobID = loaded, loaded.ID
	} else if candidate.JobID.Valid {
		loaded, err := h.Queries.GetHrJob(r.Context(), db.GetHrJobParams{
			ID:          candidate.JobID,
			WorkspaceID: scope.WorkspaceUUID,
		})
		if err == nil {
			job, jobID = loaded, loaded.ID
		}
	}

	count := hrGuideGenerateCount(req.Limit)
	keywords := hrGuideKeywords(candidate, job)

	source := "template"
	items := hrGuideTemplateItems(job, keywords, count)
	if drafted, ok := h.hrGuideModelDraft(r.Context(), candidate, job, keywords, count); ok {
		items, source = drafted, "ai"
	}

	resp := HrGuideGenerateResponse{
		CandidateID: uuidToString(candidate.ID),
		Round:       round,
		JobID:       uuidToPtr(jobID),
		Source:      source,
		Items:       items,
		Total:       len(items),
	}
	writeJSON(w, http.StatusOK, resp)
}

// hrGuideGenerateCount clamps the requested draft size to the 6-8 window. A
// request outside it is not an error: the number is a preference, and the window is
// the contract.
func hrGuideGenerateCount(raw *int32) int {
	if raw == nil {
		return hrGuideGenerateDefaultCount
	}
	count := int(*raw)
	if count < hrGuideGenerateMinCount {
		return hrGuideGenerateMinCount
	}
	if count > hrGuideGenerateMaxCount {
		return hrGuideGenerateMaxCount
	}
	return count
}

// hrGuideModelDraft asks the configured model for the questions. `ok=false` means
// "use the template": no model is configured, the call failed, or the reply did not
// parse into valid items. Every one of those is the same outcome for the caller, and
// none of them is an error to report — the request still returns a usable draft.
func (h *Handler) hrGuideModelDraft(ctx context.Context, candidate db.HrCandidate, job db.HrJob, keywords []string, count int) ([]HrGuideItem, bool) {
	if h.LLM == nil || !h.LLM.Enabled() {
		return nil, false
	}
	prompt := hrGuideDraftPrompt(candidate, job, keywords, count)
	raw, err := h.LLM.GenerateText(ctx, "", hrGuideDraftSystemPrompt, prompt)
	if err != nil {
		slog.Warn("interview guide draft fell back to the template", "error", err)
		return nil, false
	}
	items, ok := hrParseGuideDraft(raw)
	if !ok {
		slog.Warn("interview guide draft reply was unusable; template used instead")
		return nil, false
	}
	return items, true
}

// hrGuideDraftSystemPrompt asks for exactly the fields the guide stores, in the
// shape the parser reads. It carries no language instruction beyond "match the
// input's language": the requisition is written by the recruiter, and the questions
// should read in the same language they wrote it in.
const hrGuideDraftSystemPrompt = `You help a hiring manager prepare one interview round.
Given a job requisition and a candidate profile, draft 6-8 interview questions that
would actually verify fit. Return ONLY a JSON object — no prose, no code fence:

{"items":[{"dimension":"skill|experience|culture|potential|risk","question":"...","intent":"...","signals":"...","red_flags":"..."}]}

Rules:
- Cover all five dimensions: skill (can they do the work), experience (have they done it),
  culture (how they work with others), potential (what they would do first), risk (what
  should disqualify them).
- "intent" says what the question is evidence for; "signals" says what a strong answer
  contains; "red_flags" says what should raise a flag. Never leave intent or signals empty.
- Write the questions in the same language as the requisition text.
- Ask about specifics the requisition and the profile actually mention; do not invent
  employers, projects or technologies that appear in neither.`

// hrGuideDraftPrompt flattens the two rows into the facts the model may use. It
// names no field the database does not have, so the model cannot be asked about
// something the caller never supplied.
func hrGuideDraftPrompt(candidate db.HrCandidate, job db.HrJob, keywords []string, count int) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Questions needed: %d\n", count)
	b.WriteString("Requisition\n")
	fmt.Fprintf(&b, "- title: %s\n", fallbackText(job.Title, "(not set)"))
	fmt.Fprintf(&b, "- requirements: %s\n", fallbackText(textOrEmpty(job.Requirements), "(not set)"))
	fmt.Fprintf(&b, "- jd: %s\n", fallbackText(textOrEmpty(job.Jd), "(not set)"))
	fmt.Fprintf(&b, "- education: %s\n", fallbackText(textOrEmpty(job.Edu), "(not set)"))
	fmt.Fprintf(&b, "- experience: %s\n", fallbackText(textOrEmpty(job.Years), "(not set)"))
	fmt.Fprintf(&b, "- keywords: %s\n", fallbackText(strings.Join(keywords, ", "), "(none)"))
	b.WriteString("Candidate\n")
	fmt.Fprintf(&b, "- name: %s\n", fallbackText(candidate.Name, "(not set)"))
	fmt.Fprintf(&b, "- education: %s\n", fallbackText(textOrEmpty(candidate.Edu), "(not set)"))
	fmt.Fprintf(&b, "- years of experience: %s\n", fallbackText(hrYearsExperience(candidate.YearsExperience), "(not set)"))
	fmt.Fprintf(&b, "- resume: %s\n", fallbackText(textOrEmpty(candidate.ResumeText), "(not set)"))
	return b.String()
}

// hrParseGuideDraft reads the model's JSON reply into guide items. It tolerates a
// fenced code block (a common reply shape) and rejects a reply that does not yield
// at least the minimum number of valid items — a half-empty draft is worse than the
// deterministic template, which always covers the five dimensions.
func hrParseGuideDraft(raw string) ([]HrGuideItem, bool) {
	body := strings.TrimSpace(raw)
	if fence := strings.Index(body, "```"); fence >= 0 {
		body = strings.TrimPrefix(body[fence:], "```json")
		body = strings.TrimPrefix(body, "```")
		if end := strings.Index(body, "```"); end >= 0 {
			body = body[:end]
		}
		body = strings.TrimSpace(body)
	}
	if start := strings.Index(body, "{"); start > 0 {
		body = body[start:]
	}
	var payload struct {
		Items []HrGuideItem `json:"items"`
	}
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		return nil, false
	}
	items := make([]HrGuideItem, 0, len(payload.Items))
	for _, item := range payload.Items {
		item.Question = strings.TrimSpace(item.Question)
		item.Dimension = strings.TrimSpace(item.Dimension)
		item.Intent = strings.TrimSpace(item.Intent)
		item.Signals = strings.TrimSpace(item.Signals)
		item.RedFlags = strings.TrimSpace(item.RedFlags)
		if item.Question == "" || item.Intent == "" || item.Signals == "" {
			continue
		}
		if !hrQuestionDimensions[item.Dimension] {
			continue
		}
		// A drafted question has no bank row behind it yet.
		item.QuestionID = nil
		item.Asked = false
		item.Note = ""
		item.Score = nil
		items = append(items, item)
	}
	if len(items) < hrGuideGenerateMinCount {
		return nil, false
	}
	if len(items) > hrGuideGenerateMaxCount {
		items = items[:hrGuideGenerateMaxCount]
	}
	return items, true
}

// ---- template generator ----------------------------------------------------

// hrGuideKeywords builds the keyword pool the template generator substitutes into
// its skeletons: the requisition's own `keywords` first (a recruiter already chose
// them), then the tokens of its title, requirements and jd, then the candidate's
// résumé and education.
//
// Note the asymmetry with `hr_candidate`: the candidate table has no `keywords`
// column (705 added `edu` / `years_experience` / `resume_text`), so the candidate
// side contributes tokens mined from `resume_text` instead of a curated list.
func hrGuideKeywords(candidate db.HrCandidate, job db.HrJob) []string {
	pool := make([]string, 0, hrGuideKeywordLimit)
	seen := make(map[string]bool, hrGuideKeywordLimit)
	add := func(keyword string) {
		if len(pool) >= hrGuideKeywordLimit {
			return
		}
		trimmed := strings.TrimSpace(keyword)
		if trimmed == "" {
			return
		}
		key := strings.ToLower(trimmed)
		if seen[key] || hrGuideStopWords[key] {
			return
		}
		seen[key] = true
		pool = append(pool, trimmed)
	}
	for _, keyword := range hrKeywordList(job.Keywords) {
		add(keyword)
	}
	hrExtractKeywords(job.Title, add)
	hrExtractKeywords(textOrEmpty(job.Requirements), add)
	hrExtractKeywords(textOrEmpty(job.Jd), add)
	hrExtractKeywords(textOrEmpty(candidate.ResumeText), add)
	return pool
}

// hrExtractKeywords feeds the runs of letters and digits in `text` to `add`. CJK
// text has no spaces, so a "word" is a run of identical script: two or more Chinese
// characters not separated by punctuation read as one term, which is the granularity
// the skeletons need ("分布式", "带团队").
func hrExtractKeywords(text string, add func(string)) {
	var token strings.Builder
	flush := func() {
		value := token.String()
		token.Reset()
		if utf8.RuneCountInString(value) >= 2 {
			add(value)
		}
	}
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '+' || r == '#' {
			token.WriteRune(r)
			continue
		}
		flush()
	}
	flush()
}

// hrGuideStopWords are the filler terms a requisition is made of. They would read as
// a keyword in every question without telling an interviewer anything.
var hrGuideStopWords = map[string]bool{
	"以及": true, "相关": true, "负责": true, "我们": true, "你们": true,
	"要求": true, "优先": true, "以上": true, "公司": true, "岗位": true,
	"the": true, "and": true, "with": true, "for": true, "you": true,
}

// hrGuideTemplateItems is the no-model generator. It produces `count` skeletons in a
// fixed order chosen so that *every* prefix of length >= 6 covers all five
// dimensions: skill, experience, culture, potential, risk, then the two repeats.
//
// Each item carries its intent and signals — that is the product, not decoration:
// the outline exists so an interviewer knows what to listen for before the round
// starts, so a skeleton without them would be the same generic list of questions the
// team already has.
func hrGuideTemplateItems(job db.HrJob, keywords []string, count int) []HrGuideItem {
	role := strings.TrimSpace(job.Title)
	if role == "" {
		role = "这个岗位"
	}
	keyword := func(offset int) string {
		if len(keywords) == 0 {
			return "这个岗位的核心技能"
		}
		return keywords[offset%len(keywords)]
	}

	// 1 keyword is passed positionally: %[1]s = keyword, %[2]s = role.
	skeletons := []struct {
		dimension string
		question  string
		intent    string
		signals   string
		redFlags  string
	}{
		{
			"skill",
			"请挑一个你最拿手的 %[1]s 项目，讲讲你负责哪一部分、结果如何？",
			"验证 %[1]s 是动手做过，还是只知道名词。",
			"能说清自己的职责边界、关键取舍和具体数字。",
			"只复述团队成果，追问本人贡献就模糊。",
		},
		{
			"experience",
			"%[2]s 这个岗位最贴近你哪一段经历？那段工作里 %[1]s 占多少比重？",
			"确认过往岗位与本岗位的重合度，而不是简历上的年限。",
			"能对上具体项目、团队规模和汇报关系。",
			"只有年限和公司名，说不清做过什么。",
		},
		{
			"culture",
			"讲一次你和同事判断不一致、最后怎么推进的经历。",
			"看在分歧中的沟通方式，而不是让候选人给自己做性格自评。",
			"先对齐目标，再谈方案取舍，并说明最后谁拍板。",
			"把分歧归因于对方水平不够。",
		},
		{
			"potential",
			"如果入职第一个月只能做成一件 %[1]s 相关的事，你会选什么？",
			"看这人怎么判断优先级，以及第一周会把力气花在哪。",
			"先问清目标和现状，再给出可验证的第一步。",
			"不问现状就承诺大改造。",
		},
		{
			"risk",
			"上一份工作为什么离开？这次入职后，什么情况下你会再考虑离开？",
			"对齐离职动因与本岗位的真实条件，避免同一原因再流失一次。",
			"离职原因具体、指向发展或条件，且与本岗位条件不冲突。",
			"只抱怨前同事或前老板，说不出留下需要什么。",
		},
		{
			"skill",
			"用 %[1]s 时你踩过最大的坑是什么？当时怎么定位、怎么修的？",
			"看排障路径是否真实，以及会不会复盘。",
			"有明确的现象、假设、验证顺序，并给出最终根因。",
			"把问题归给他人或环境，讲不出自己做过什么。",
		},
		{
			"experience",
			"上一份工作里，一次 %[1]s 相关的交付从需求到上线是怎么走的？",
			"看流程熟练度：这人在真实协作里怎么把事推上线。",
			"讲得出评审、联调、上线各环节分别是谁做了什么。",
			"只讲个人编码，没有协作环节。",
		},
		{
			"risk",
			"简历上 %[1]s 这段经历，有哪部分是你没做过的？",
			"主动给一个承认边界的机会，看是否会夸大。",
			"能明确划出自己没碰过的部分，并说明准备怎么补。",
			"什么都做过，一追问细节就模糊。",
		},
	}

	if count > len(skeletons) {
		count = len(skeletons)
	}
	items := make([]HrGuideItem, 0, count)
	for i := 0; i < count; i++ {
		skeleton := skeletons[i]
		term := keyword(i)
		items = append(items, HrGuideItem{
			Dimension: skeleton.dimension,
			Question:  fmt.Sprintf(skeleton.question, term, role),
			Intent:    fmt.Sprintf(skeleton.intent, term, role),
			Signals:   fmt.Sprintf(skeleton.signals, term, role),
			RedFlags:  fmt.Sprintf(skeleton.redFlags, term, role),
			Asked:     false,
			Note:      "",
			Score:     nil,
		})
	}
	return items
}

// hrTagListOrEmpty is hrTagList for a create: the `tags` column is `NOT NULL
// DEFAULT '{}'`, and an INSERT that names the column with a NULL would be rejected
// rather than defaulted, so "not sent" becomes an empty array.
func hrTagListOrEmpty(tags []string) []string {
	if cleaned := hrTagList(tags); cleaned != nil {
		return cleaned
	}
	return []string{}
}

// hrYearsExperience renders `hr_candidate.years_experience` (NUMERIC(4,1)) for a
// prompt: the shortest decimal form, so "3.5 年" stays 3.5 and 0 stays "0".
func hrYearsExperience(value pgtype.Numeric) string {
	if years := numericToFloatPtr(value); years != nil {
		return strconv.FormatFloat(*years, 'f', -1, 64)
	}
	return ""
}

// textOrEmpty renders a nullable text column for a prompt.
func textOrEmpty(t pgtype.Text) string {
	if !t.Valid {
		return ""
	}
	return t.String
}

// fallbackText keeps a prompt line from reading as an empty label.
func fallbackText(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

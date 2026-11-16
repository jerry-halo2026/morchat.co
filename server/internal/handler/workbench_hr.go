package handler

// HR ledger: jobs, candidates, interviews, scorecards and employee profiles
// (docs/engineering/WORKBENCH-API.md §10).
//
// Ownership and the write gate match B0: `hr_job`, `hr_candidate` and
// `hr_employee_profile` name their owner in `owner_member_id` (the member's
// *user* id), `owner`/`admin` write everything and a `member` writes only its own
// rows. An interview and a scorecard carry no owner of their own — they belong to
// a candidate — so the gate reads the candidate's owner instead of inventing a
// second source of truth, exactly as a settlement reads its collaboration's.
//
// Two invariants the schema owns, turned into answers here:
//
//   - "one person, one job": a candidate that already exists in the requisition
//     (same lowercase name, same phone) answers 409;
//   - "one interviewer, one slot": creating or moving an interview onto a taken
//     slot answers 409, and a moved slot increments `rescheduled_count`.
//
// `POST /candidates/{candidateId}/hire` stamps `hired_at` and writes the employee
// profile in one transaction, so the funnel and the employee record can never
// disagree about who was hired.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

const (
	eventHrJobChanged             = "hr_job:changed"
	eventHrCandidateChanged       = "hr_candidate:changed"
	eventHrCandidateStageChanged  = "hr_candidate:stage_changed"
	eventHrInterviewChanged       = "hr_interview:changed"
	eventHrScorecardChanged       = "hr_scorecard:changed"
	eventHrEmployeeProfileChanged = "hr_employee_profile:changed"
)

var (
	hrJobStatuses = map[string]bool{"draft": true, "open": true, "paused": true, "closed": true}

	// hrCandidateStages is the funnel (docs/METRICS.md §3 C4: named
	// `hr_stage` in the UI, never the bare `stage`).
	hrCandidateStages = map[string]bool{
		"screening": true, "test": true, "interview": true, "scored": true,
		"offer": true, "hired": true, "rejected": true, "withdrawn": true,
	}

	hrInterviewModes    = map[string]bool{"onsite": true, "video": true, "phone": true}
	hrInterviewStatuses = map[string]bool{"scheduled": true, "done": true, "cancelled": true, "no_show": true}
	hrScorecardVerdicts = map[string]bool{"strong_yes": true, "yes": true, "no": true, "strong_no": true}
	hrEmptyJSONObject   = []byte("{}")
	hrZeroUUID          = pgtype.UUID{Bytes: [16]byte{}, Valid: true}
)

func (h *Handler) publishHrChanged(eventType, workspaceID, id, actorID string) {
	h.publish(eventType, workspaceID, "member", actorID, map[string]any{"id": id})
}

// ---- request bodies --------------------------------------------------------

// HrJobRequest is both the create body and the PATCH body: every field is
// optional and create fills the required ones in from defaults it rejects when
// missing.
type HrJobRequest struct {
	Title         *string  `json:"title"`
	DepartmentID  *string  `json:"department_id"`
	Level         *string  `json:"level"`
	Headcount     *int32   `json:"headcount"`
	Status        *string  `json:"status"`
	SalaryMin     *float64 `json:"salary_min"`
	SalaryMax     *float64 `json:"salary_max"`
	Currency      *string  `json:"currency"`
	Requirements  *string  `json:"requirements"`
	OwnerMemberID *string  `json:"owner_member_id"`
}

// HrCandidateRequest is the create/PATCH body for a candidate. `hired_at` is not
// client-writable: the hire route owns that milestone.
type HrCandidateRequest struct {
	JobID              *string  `json:"job_id"`
	Name               *string  `json:"name"`
	Stage              *string  `json:"stage"`
	Source             *string  `json:"source"`
	Phone              *string  `json:"phone"`
	Email              *string  `json:"email"`
	ResumeAttachmentID *string  `json:"resume_attachment_id"`
	MatchScore         *int16   `json:"match_score"`
	ScoreResume        *float64 `json:"score_resume"`
	ScoreTest          *float64 `json:"score_test"`
	ScoreInterview     *float64 `json:"score_interview"`
	ExpectedSalary     *float64 `json:"expected_salary"`
	OfferSalary        *float64 `json:"offer_salary"`
	Currency           *string  `json:"currency"`
	RejectedReason     *string  `json:"rejected_reason"`
	OwnerMemberID      *string  `json:"owner_member_id"`
}

// HrHireRequest is `POST /candidates/{candidateId}/hire`. `member_id` names the
// workspace member the profile belongs to and is required; the rest seeds the
// profile the transaction creates or updates.
type HrHireRequest struct {
	MemberID      *string          `json:"member_id"`
	DepartmentID  *string          `json:"department_id"`
	JobTitle      *string          `json:"job_title"`
	Grade         *string          `json:"grade"`
	HireDate      *string          `json:"hire_date"`
	RegularDate   *string          `json:"regular_date"`
	ContractEnd   *string          `json:"contract_end"`
	Ability       *json.RawMessage `json:"ability"`
	Disc          *json.RawMessage `json:"disc"`
	OwnerMemberID *string          `json:"owner_member_id"`
}

// HrInterviewRequest is the create/PATCH body for one interview round.
// `rescheduled_count` is derived, not sent: moving `scheduled_at` increments it.
type HrInterviewRequest struct {
	CandidateID         *string `json:"candidate_id"`
	Round               *int16  `json:"round"`
	ScheduledAt         *string `json:"scheduled_at"`
	DurationMinutes     *int32  `json:"duration_minutes"`
	InterviewerMemberID *string `json:"interviewer_member_id"`
	Mode                *string `json:"mode"`
	Status              *string `json:"status"`
	Note                *string `json:"note"`
}

// HrScorecardRequest is the create/PATCH body for one reviewer's scorecard.
type HrScorecardRequest struct {
	InterviewID      *string  `json:"interview_id"`
	ReviewerMemberID *string  `json:"reviewer_member_id"`
	ScoreSkill       *int16   `json:"score_skill"`
	ScoreExperience  *int16   `json:"score_experience"`
	ScoreCulture     *int16   `json:"score_culture"`
	ScorePotential   *int16   `json:"score_potential"`
	WeightedScore    *float64 `json:"weighted_score"`
	Verdict          *string  `json:"verdict"`
	Comment          *string  `json:"comment"`
}

// HrEmployeeProfileRequest is the create/PATCH body for an employee profile.
// `member_id` identifies the row and cannot be changed afterwards.
type HrEmployeeProfileRequest struct {
	MemberID      *string          `json:"member_id"`
	DepartmentID  *string          `json:"department_id"`
	JobTitle      *string          `json:"job_title"`
	Grade         *string          `json:"grade"`
	HireDate      *string          `json:"hire_date"`
	RegularDate   *string          `json:"regular_date"`
	ContractEnd   *string          `json:"contract_end"`
	Ability       *json.RawMessage `json:"ability"`
	Disc          *json.RawMessage `json:"disc"`
	OwnerMemberID *string          `json:"owner_member_id"`
}

// ---- responses -------------------------------------------------------------

type HrJobResponse struct {
	ID            string   `json:"id"`
	WorkspaceID   string   `json:"workspace_id"`
	Title         string   `json:"title"`
	DepartmentID  *string  `json:"department_id"`
	Level         *string  `json:"level"`
	Headcount     int32    `json:"headcount"`
	Status        *string  `json:"status"`
	SalaryMin     *float64 `json:"salary_min"`
	SalaryMax     *float64 `json:"salary_max"`
	Currency      *string  `json:"currency"`
	Requirements  *string  `json:"requirements"`
	OwnerMemberID *string  `json:"owner_member_id"`
	CreatedBy     *string  `json:"created_by"`
	CreatedAt     string   `json:"created_at"`
	UpdatedAt     string   `json:"updated_at"`
}

func hrJobToResponse(j db.HrJob) HrJobResponse {
	return HrJobResponse{
		ID:            uuidToString(j.ID),
		WorkspaceID:   uuidToString(j.WorkspaceID),
		Title:         j.Title,
		DepartmentID:  uuidToPtr(j.DepartmentID),
		Level:         textToPtr(j.Level),
		Headcount:     j.Headcount,
		Status:        stringPtr(j.Status),
		SalaryMin:     numericToFloatPtr(j.SalaryMin),
		SalaryMax:     numericToFloatPtr(j.SalaryMax),
		Currency:      stringPtr(j.Currency),
		Requirements:  textToPtr(j.Requirements),
		OwnerMemberID: uuidToPtr(j.OwnerMemberID),
		CreatedBy:     uuidToPtr(j.CreatedBy),
		CreatedAt:     timestampToString(j.CreatedAt),
		UpdatedAt:     timestampToString(j.UpdatedAt),
	}
}

type HrCandidateResponse struct {
	ID                 string   `json:"id"`
	WorkspaceID        string   `json:"workspace_id"`
	JobID              string   `json:"job_id"`
	Name               string   `json:"name"`
	Stage              string   `json:"stage"`
	Source             *string  `json:"source"`
	Phone              *string  `json:"phone"`
	Email              *string  `json:"email"`
	ResumeAttachmentID *string  `json:"resume_attachment_id"`
	MatchScore         *int32   `json:"match_score"`
	ScoreResume        *float64 `json:"score_resume"`
	ScoreTest          *float64 `json:"score_test"`
	ScoreInterview     *float64 `json:"score_interview"`
	ExpectedSalary     *float64 `json:"expected_salary"`
	OfferSalary        *float64 `json:"offer_salary"`
	Currency           *string  `json:"currency"`
	OwnerMemberID      *string  `json:"owner_member_id"`
	HiredAt            *string  `json:"hired_at"`
	RejectedReason     *string  `json:"rejected_reason"`
	CreatedBy          *string  `json:"created_by"`
	CreatedAt          string   `json:"created_at"`
	UpdatedAt          string   `json:"updated_at"`
}

func hrCandidateToResponse(c db.HrCandidate) HrCandidateResponse {
	return HrCandidateResponse{
		ID:                 uuidToString(c.ID),
		WorkspaceID:        uuidToString(c.WorkspaceID),
		JobID:              uuidToString(c.JobID),
		Name:               c.Name,
		Stage:              c.Stage,
		Source:             textToPtr(c.Source),
		Phone:              textToPtr(c.Phone),
		Email:              textToPtr(c.Email),
		ResumeAttachmentID: uuidToPtr(c.ResumeAttachmentID),
		MatchScore:         int2ToPtr(c.MatchScore),
		ScoreResume:        numericToFloatPtr(c.ScoreResume),
		ScoreTest:          numericToFloatPtr(c.ScoreTest),
		ScoreInterview:     numericToFloatPtr(c.ScoreInterview),
		ExpectedSalary:     numericToFloatPtr(c.ExpectedSalary),
		OfferSalary:        numericToFloatPtr(c.OfferSalary),
		Currency:           stringPtr(c.Currency),
		OwnerMemberID:      uuidToPtr(c.OwnerMemberID),
		HiredAt:            timestampToPtr(c.HiredAt),
		RejectedReason:     textToPtr(c.RejectedReason),
		CreatedBy:          uuidToPtr(c.CreatedBy),
		CreatedAt:          timestampToString(c.CreatedAt),
		UpdatedAt:          timestampToString(c.UpdatedAt),
	}
}

type HrInterviewResponse struct {
	ID                  string  `json:"id"`
	WorkspaceID         string  `json:"workspace_id"`
	CandidateID         string  `json:"candidate_id"`
	Round               int16   `json:"round"`
	ScheduledAt         string  `json:"scheduled_at"`
	DurationMinutes     int32   `json:"duration_minutes"`
	InterviewerMemberID *string `json:"interviewer_member_id"`
	Mode                *string `json:"mode"`
	Status              string  `json:"status"`
	RescheduledCount    int32   `json:"rescheduled_count"`
	Note                *string `json:"note"`
	CreatedBy           *string `json:"created_by"`
	CreatedAt           string  `json:"created_at"`
	UpdatedAt           string  `json:"updated_at"`
}

func hrInterviewToResponse(i db.HrInterview) HrInterviewResponse {
	return HrInterviewResponse{
		ID:                  uuidToString(i.ID),
		WorkspaceID:         uuidToString(i.WorkspaceID),
		CandidateID:         uuidToString(i.CandidateID),
		Round:               i.Round,
		ScheduledAt:         timestampToString(i.ScheduledAt),
		DurationMinutes:     i.DurationMinutes,
		InterviewerMemberID: uuidToPtr(i.InterviewerMemberID),
		Mode:                textToPtr(i.Mode),
		Status:              i.Status,
		RescheduledCount:    i.RescheduledCount,
		Note:                textToPtr(i.Note),
		CreatedBy:           uuidToPtr(i.CreatedBy),
		CreatedAt:           timestampToString(i.CreatedAt),
		UpdatedAt:           timestampToString(i.UpdatedAt),
	}
}

type HrScorecardResponse struct {
	ID               string   `json:"id"`
	WorkspaceID      string   `json:"workspace_id"`
	InterviewID      string   `json:"interview_id"`
	ReviewerMemberID *string  `json:"reviewer_member_id"`
	ScoreSkill       *int32   `json:"score_skill"`
	ScoreExperience  *int32   `json:"score_experience"`
	ScoreCulture     *int32   `json:"score_culture"`
	ScorePotential   *int32   `json:"score_potential"`
	WeightedScore    *float64 `json:"weighted_score"`
	Verdict          *string  `json:"verdict"`
	Comment          *string  `json:"comment"`
	CreatedBy        *string  `json:"created_by"`
	CreatedAt        string   `json:"created_at"`
	UpdatedAt        string   `json:"updated_at"`
}

func hrScorecardToResponse(s db.HrScorecard) HrScorecardResponse {
	return HrScorecardResponse{
		ID:               uuidToString(s.ID),
		WorkspaceID:      uuidToString(s.WorkspaceID),
		InterviewID:      uuidToString(s.InterviewID),
		ReviewerMemberID: uuidToPtr(s.ReviewerMemberID),
		ScoreSkill:       int2ToPtr(s.ScoreSkill),
		ScoreExperience:  int2ToPtr(s.ScoreExperience),
		ScoreCulture:     int2ToPtr(s.ScoreCulture),
		ScorePotential:   int2ToPtr(s.ScorePotential),
		WeightedScore:    numericToFloatPtr(s.WeightedScore),
		Verdict:          textToPtr(s.Verdict),
		Comment:          textToPtr(s.Comment),
		CreatedBy:        uuidToPtr(s.CreatedBy),
		CreatedAt:        timestampToString(s.CreatedAt),
		UpdatedAt:        timestampToString(s.UpdatedAt),
	}
}

type HrEmployeeProfileResponse struct {
	ID            string          `json:"id"`
	WorkspaceID   string          `json:"workspace_id"`
	MemberID      string          `json:"member_id"`
	DepartmentID  *string         `json:"department_id"`
	JobTitle      *string         `json:"job_title"`
	Grade         *string         `json:"grade"`
	HireDate      *string         `json:"hire_date"`
	RegularDate   *string         `json:"regular_date"`
	ContractEnd   *string         `json:"contract_end"`
	Ability       json.RawMessage `json:"ability"`
	Disc          json.RawMessage `json:"disc"`
	OwnerMemberID *string         `json:"owner_member_id"`
	CreatedBy     *string         `json:"created_by"`
	CreatedAt     string          `json:"created_at"`
	UpdatedAt     string          `json:"updated_at"`
}

// hrJSONColumn renders a JSONB column, defaulting to `{}` so the client always
// receives an object it can read keys from.
func hrJSONColumn(raw []byte) json.RawMessage {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return json.RawMessage(hrEmptyJSONObject)
	}
	return json.RawMessage(trimmed)
}

func hrEmployeeProfileToResponse(p db.HrEmployeeProfile) HrEmployeeProfileResponse {
	return HrEmployeeProfileResponse{
		ID:            uuidToString(p.ID),
		WorkspaceID:   uuidToString(p.WorkspaceID),
		MemberID:      uuidToString(p.MemberID),
		DepartmentID:  uuidToPtr(p.DepartmentID),
		JobTitle:      textToPtr(p.JobTitle),
		Grade:         textToPtr(p.Grade),
		HireDate:      dateToPtr(p.HireDate),
		RegularDate:   dateToPtr(p.RegularDate),
		ContractEnd:   dateToPtr(p.ContractEnd),
		Ability:       hrJSONColumn(p.Ability),
		Disc:          hrJSONColumn(p.Disc),
		OwnerMemberID: uuidToPtr(p.OwnerMemberID),
		CreatedBy:     uuidToPtr(p.CreatedBy),
		CreatedAt:     timestampToString(p.CreatedAt),
		UpdatedAt:     timestampToString(p.UpdatedAt),
	}
}

// HrHireResponse is what `POST /candidates/{candidateId}/hire` answers: both rows
// the transaction touched, so the client can open the profile without a second
// round trip.
type HrHireResponse struct {
	Candidate       HrCandidateResponse       `json:"candidate"`
	EmployeeProfile HrEmployeeProfileResponse `json:"employee_profile"`
}

// ---- value helpers ---------------------------------------------------------

// applyInt32Value keeps a NOT NULL INTEGER column's stored value when the PATCH
// body did not carry the field.
func applyInt32Value(patched *int32, current int32) int32 {
	if patched == nil {
		return current
	}
	return *patched
}

// applyInt16Value keeps a NOT NULL SMALLINT column's stored value.
func applyInt16Value(patched *int16, current int16) int16 {
	if patched == nil {
		return current
	}
	return *patched
}

// applyInt2Patch keeps a nullable SMALLINT column's stored value.
func applyInt2Patch(patched *int16, current pgtype.Int2) pgtype.Int2 {
	if patched == nil {
		return current
	}
	return pgtype.Int2{Int16: *patched, Valid: true}
}

// applyJSONPatch keeps a JSONB column's stored value when the body omitted it.
func applyJSONPatch(patched []byte, current []byte) []byte {
	if patched == nil {
		return current
	}
	return patched
}

// workbenchJSONObject accepts only a JSON object for a JSONB column, so a stray
// array or scalar cannot land in a field the UI reads key by key. An absent or
// empty value means NULL and is filled in by the caller's default.
func workbenchJSONObject(w http.ResponseWriter, raw *json.RawMessage, fieldName string) ([]byte, bool) {
	if raw == nil {
		return nil, true
	}
	trimmed := strings.TrimSpace(string(*raw))
	if trimmed == "" || trimmed == "null" {
		return nil, true
	}
	if !strings.HasPrefix(trimmed, "{") {
		writeError(w, http.StatusBadRequest, fieldName+" must be a JSON object")
		return nil, false
	}
	return []byte(trimmed), true
}

// ---- relationship helpers --------------------------------------------------

// requireHrJobInWorkspace is the relationship check the missing foreign key would
// otherwise do: a candidate must point at a requisition that exists here.
func (h *Handler) requireHrJobInWorkspace(ctx context.Context, w http.ResponseWriter, workspaceID string, raw *string) (db.HrJob, bool) {
	jobID, ok := workbenchOptionalUUID(w, raw, "job_id")
	if !ok {
		return db.HrJob{}, false
	}
	if !jobID.Valid {
		writeError(w, http.StatusBadRequest, "job_id is required")
		return db.HrJob{}, false
	}
	job, err := h.Queries.GetHrJob(ctx, db.GetHrJobParams{ID: jobID, WorkspaceID: parseUUID(workspaceID)})
	if err != nil {
		writeError(w, http.StatusBadRequest, "job not found in this workspace")
		return db.HrJob{}, false
	}
	return job, true
}

// requireHrCandidateInWorkspace resolves a candidate pointer for an interview or
// a scorecard, and returns the row because the write gate reads its owner.
func (h *Handler) requireHrCandidateInWorkspace(ctx context.Context, w http.ResponseWriter, workspaceID string, raw *string) (db.HrCandidate, bool) {
	candidateID, ok := workbenchOptionalUUID(w, raw, "candidate_id")
	if !ok {
		return db.HrCandidate{}, false
	}
	if !candidateID.Valid {
		writeError(w, http.StatusBadRequest, "candidate_id is required")
		return db.HrCandidate{}, false
	}
	candidate, err := h.Queries.GetHrCandidate(ctx, db.GetHrCandidateParams{
		ID:          candidateID,
		WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "candidate not found in this workspace")
		return db.HrCandidate{}, false
	}
	return candidate, true
}

// requireHrDepartment validates an optional department pointer.
func (h *Handler) requireHrDepartment(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (pgtype.UUID, bool) {
	departmentID, ok := workbenchOptionalUUID(w, raw, "department_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	if !departmentID.Valid {
		return pgtype.UUID{}, true
	}
	if _, err := h.Queries.GetDepartment(r.Context(), db.GetDepartmentParams{
		ID:          departmentID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "department_id is not a department in this workspace")
		return pgtype.UUID{}, false
	}
	return departmentID, true
}

// requireHrMember validates an optional member pointer (interviewer, reviewer,
// the person a profile belongs to). `member_id` columns hold the member's user id.
func (h *Handler) requireHrMember(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string, fieldName string) (pgtype.UUID, bool) {
	memberID, ok := workbenchOptionalUUID(w, raw, fieldName)
	if !ok {
		return pgtype.UUID{}, false
	}
	if !memberID.Valid {
		return pgtype.UUID{}, true
	}
	if _, err := h.getWorkspaceMember(r.Context(), uuidToString(memberID), scope.WorkspaceID); err != nil {
		writeError(w, http.StatusBadRequest, fieldName+" is not a member of this workspace")
		return pgtype.UUID{}, false
	}
	return memberID, true
}

// hrInterviewSlotFree answers the interviewer×slot exclusivity rule. An interview
// without an interviewer reserves nothing, and `excludeID` lets a reschedule
// ignore the row it is moving. The unique constraint behind it is the race-safe
// backstop; this read exists so the common case answers 409 with a message
// instead of an unhandled constraint violation.
func (h *Handler) hrInterviewSlotFree(ctx context.Context, w http.ResponseWriter, r *http.Request, scope workbenchScope, interviewer pgtype.UUID, scheduledAt pgtype.Timestamptz, excludeID pgtype.UUID) bool {
	if !interviewer.Valid || !scheduledAt.Valid {
		return true
	}
	conflicts, err := h.Queries.CountHrInterviewConflicts(ctx, db.CountHrInterviewConflictsParams{
		WorkspaceID:         scope.WorkspaceUUID,
		InterviewerMemberID: interviewer,
		ScheduledAt:         scheduledAt,
		ExcludeID:           excludeID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to check the interview slot", err)
		return false
	}
	if conflicts > 0 {
		writeError(w, http.StatusConflict, "this interviewer already has an interview at that time")
		return false
	}
	return true
}

// ---- write loaders ---------------------------------------------------------

// loadHrJobForWrite resolves {jobId} inside the workspace and checks the write
// gate.
func (h *Handler) loadHrJobForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrJob, bool) {
	jobID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "jobId"), "job id")
	if !ok {
		return db.HrJob{}, false
	}
	job, err := h.Queries.GetHrJob(r.Context(), db.GetHrJobParams{ID: jobID, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "job not found")
		return db.HrJob{}, false
	}
	if !workbenchCanWrite(scope.Member, job.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change jobs you own")
		return db.HrJob{}, false
	}
	return job, true
}

// loadHrCandidateForWrite resolves {candidateId} and checks the write gate.
func (h *Handler) loadHrCandidateForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrCandidate, bool) {
	candidateID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "candidateId"), "candidate id")
	if !ok {
		return db.HrCandidate{}, false
	}
	candidate, err := h.Queries.GetHrCandidate(r.Context(), db.GetHrCandidateParams{
		ID:          candidateID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "candidate not found")
		return db.HrCandidate{}, false
	}
	if !workbenchCanWrite(scope.Member, candidate.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change candidates you own")
		return db.HrCandidate{}, false
	}
	return candidate, true
}

// loadHrInterviewForWrite resolves {interviewId} plus the candidate whose
// ownership decides the write, since an interview has no owner column.
func (h *Handler) loadHrInterviewForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrInterview, db.HrCandidate, bool) {
	interviewID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "interviewId"), "interview id")
	if !ok {
		return db.HrInterview{}, db.HrCandidate{}, false
	}
	interview, err := h.Queries.GetHrInterview(r.Context(), db.GetHrInterviewParams{
		ID:          interviewID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "interview not found")
		return db.HrInterview{}, db.HrCandidate{}, false
	}
	candidate, err := h.Queries.GetHrCandidate(r.Context(), db.GetHrCandidateParams{
		ID:          interview.CandidateID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "interview not found")
		return db.HrInterview{}, db.HrCandidate{}, false
	}
	if !workbenchCanWrite(scope.Member, candidate.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change interviews of candidates you own")
		return db.HrInterview{}, db.HrCandidate{}, false
	}
	return interview, candidate, true
}

// loadHrScorecardForWrite resolves {scorecardId} and gates on the interview's
// candidate: a scorecard belongs to a round, which belongs to a candidate.
func (h *Handler) loadHrScorecardForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrScorecard, bool) {
	scorecardID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "scorecardId"), "scorecard id")
	if !ok {
		return db.HrScorecard{}, false
	}
	scorecard, err := h.Queries.GetHrScorecard(r.Context(), db.GetHrScorecardParams{
		ID:          scorecardID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "scorecard not found")
		return db.HrScorecard{}, false
	}
	if !h.hrInterviewWritable(w, r, scope, scorecard.InterviewID) {
		return db.HrScorecard{}, false
	}
	return scorecard, true
}

// hrInterviewWritable reports whether the caller may write around an interview,
// by walking the same candidate-owner gate the interview routes use.
func (h *Handler) hrInterviewWritable(w http.ResponseWriter, r *http.Request, scope workbenchScope, interviewID pgtype.UUID) bool {
	interview, err := h.Queries.GetHrInterview(r.Context(), db.GetHrInterviewParams{
		ID:          interviewID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "interview not found")
		return false
	}
	candidate, err := h.Queries.GetHrCandidate(r.Context(), db.GetHrCandidateParams{
		ID:          interview.CandidateID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "interview not found")
		return false
	}
	if !workbenchCanWrite(scope.Member, candidate.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change interviews of candidates you own")
		return false
	}
	return true
}

// loadHrEmployeeProfileForWrite resolves {employeeId} and checks the write gate.
func (h *Handler) loadHrEmployeeProfileForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrEmployeeProfile, bool) {
	profileID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "employeeId"), "employee profile id")
	if !ok {
		return db.HrEmployeeProfile{}, false
	}
	profile, err := h.Queries.GetHrEmployeeProfile(r.Context(), db.GetHrEmployeeProfileParams{
		ID:          profileID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "employee profile not found")
		return db.HrEmployeeProfile{}, false
	}
	if !workbenchCanWrite(scope.Member, profile.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change employee profiles you own")
		return db.HrEmployeeProfile{}, false
	}
	return profile, true
}

// ---- jobs ------------------------------------------------------------------

// ListHrJobs — GET /api/workbench/hr/jobs
func (h *Handler) ListHrJobs(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !hrJobStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	departmentID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("department_id"))), "department_id")
	if !ok {
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetHrJob(r.Context(), db.GetHrJobParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListHrJobs(r.Context(), db.ListHrJobsParams{
		WorkspaceID:  scope.WorkspaceUUID,
		Status:       strToText(status),
		DepartmentID: departmentID,
		Query:        strToText(strings.TrimSpace(r.URL.Query().Get("q"))),
		CursorAt:     cursorAt,
		CursorID:     cursorID,
		Limit:        workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list jobs", err)
		return
	}
	resp := make([]HrJobResponse, len(rows))
	for i, row := range rows {
		resp[i] = hrJobToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"jobs": resp, "total": len(resp)})
}

// CreateHrJob — POST /api/workbench/hr/jobs
func (h *Handler) CreateHrJob(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req HrJobRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	title := strings.TrimSpace(valueOrEmpty(req.Title))
	if title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	headcount := int32(1)
	if req.Headcount != nil {
		headcount = *req.Headcount
	}
	status := "draft"
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
	}
	if !hrJobStatuses[status] {
		writeError(w, http.StatusBadRequest, "status must be draft, open, paused or closed")
		return
	}
	currency := "CNY"
	if req.Currency != nil && strings.TrimSpace(*req.Currency) != "" {
		parsed, ok := workbenchCurrency(w, req.Currency)
		if !ok {
			return
		}
		currency = parsed
	}
	departmentID, ok := h.requireHrDepartment(w, r, scope, req.DepartmentID)
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}

	job, err := h.Queries.CreateHrJob(r.Context(), db.CreateHrJobParams{
		WorkspaceID:   scope.WorkspaceUUID,
		Title:         title,
		DepartmentID:  departmentID,
		Level:         optionalTrimmedText(req.Level),
		Headcount:     headcount,
		Status:        strToText(status),
		SalaryMin:     floatToNumeric(req.SalaryMin),
		SalaryMax:     floatToNumeric(req.SalaryMax),
		Currency:      strToText(currency),
		Requirements:  optionalTrimmedText(req.Requirements),
		OwnerMemberID: owner,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create job", err)
		return
	}
	h.publishHrChanged(eventHrJobChanged, scope.WorkspaceID, uuidToString(job.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, hrJobToResponse(job))
}

// GetHrJob — GET /api/workbench/hr/jobs/{jobId}
func (h *Handler) GetHrJob(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	jobID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "jobId"), "job id")
	if !ok {
		return
	}
	job, err := h.Queries.GetHrJob(r.Context(), db.GetHrJobParams{ID: jobID, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}
	writeJSON(w, http.StatusOK, hrJobToResponse(job))
}

// UpdateHrJob — PATCH /api/workbench/hr/jobs/{jobId}
func (h *Handler) UpdateHrJob(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrJobForWrite(w, r, scope)
	if !ok {
		return
	}
	var req HrJobRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	title := current.Title
	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
		if title == "" {
			writeError(w, http.StatusBadRequest, "title is required")
			return
		}
	}
	status := current.Status
	if req.Status != nil {
		trimmed := strings.TrimSpace(*req.Status)
		if !hrJobStatuses[trimmed] {
			writeError(w, http.StatusBadRequest, "status must be draft, open, paused or closed")
			return
		}
		status = trimmed
	}
	currency := current.Currency
	if req.Currency != nil {
		parsed, ok := workbenchCurrency(w, req.Currency)
		if !ok {
			return
		}
		currency = parsed
	}
	departmentID := current.DepartmentID
	if req.DepartmentID != nil {
		parsed, ok := h.requireHrDepartment(w, r, scope, req.DepartmentID)
		if !ok {
			return
		}
		departmentID = parsed
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateHrJob(r.Context(), db.UpdateHrJobParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		Title:         title,
		DepartmentID:  departmentID,
		Level:         applyTextPatch(req.Level, current.Level),
		Headcount:     applyInt32Value(req.Headcount, current.Headcount),
		Status:        strToText(status),
		SalaryMin:     applyNumericPatch(req.SalaryMin, current.SalaryMin),
		SalaryMax:     applyNumericPatch(req.SalaryMax, current.SalaryMax),
		Currency:      strToText(currency),
		Requirements:  applyTextPatch(req.Requirements, current.Requirements),
		OwnerMemberID: owner,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update job", err)
		return
	}
	h.publishHrChanged(eventHrJobChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrJobToResponse(updated))
}

// DeleteHrJob — DELETE /api/workbench/hr/jobs/{jobId} (soft delete)
func (h *Handler) DeleteHrJob(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrJobForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveHrJob(r.Context(), db.ArchiveHrJobParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete job", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}
	h.publishHrChanged(eventHrJobChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- candidates ------------------------------------------------------------

// ListHrCandidates — GET /api/workbench/hr/candidates
func (h *Handler) ListHrCandidates(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	jobID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("job_id"))), "job_id")
	if !ok {
		return
	}
	stage := strings.TrimSpace(r.URL.Query().Get("stage"))
	if stage != "" && !hrCandidateStages[stage] {
		writeError(w, http.StatusBadRequest, "invalid stage")
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetHrCandidate(r.Context(), db.GetHrCandidateParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListHrCandidates(r.Context(), db.ListHrCandidatesParams{
		WorkspaceID: scope.WorkspaceUUID,
		JobID:       jobID,
		Stage:       strToText(stage),
		CursorAt:    cursorAt,
		CursorID:    cursorID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list candidates", err)
		return
	}
	resp := make([]HrCandidateResponse, len(rows))
	for i, row := range rows {
		resp[i] = hrCandidateToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"candidates": resp, "total": len(resp)})
}

// CreateHrCandidate — POST /api/workbench/hr/candidates
func (h *Handler) CreateHrCandidate(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req HrCandidateRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	job, ok := h.requireHrJobInWorkspace(r.Context(), w, scope.WorkspaceID, req.JobID)
	if !ok {
		return
	}
	if !workbenchCanWrite(scope.Member, job.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only add candidates to jobs you own")
		return
	}
	name := strings.TrimSpace(valueOrEmpty(req.Name))
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	stage := "screening"
	if req.Stage != nil {
		stage = strings.TrimSpace(*req.Stage)
	}
	if !hrCandidateStages[stage] {
		writeError(w, http.StatusBadRequest, "invalid stage")
		return
	}
	if req.MatchScore != nil && (*req.MatchScore < 0 || *req.MatchScore > 100) {
		writeError(w, http.StatusBadRequest, "match_score must be between 0 and 100")
		return
	}
	currency := "CNY"
	if req.Currency != nil && strings.TrimSpace(*req.Currency) != "" {
		parsed, ok := workbenchCurrency(w, req.Currency)
		if !ok {
			return
		}
		currency = parsed
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	resumeAttachmentID, ok := workbenchOptionalUUID(w, req.ResumeAttachmentID, "resume_attachment_id")
	if !ok {
		return
	}

	candidate, err := h.Queries.CreateHrCandidate(r.Context(), db.CreateHrCandidateParams{
		WorkspaceID:        scope.WorkspaceUUID,
		JobID:              job.ID,
		Name:               name,
		Stage:              stage,
		Source:             optionalTrimmedText(req.Source),
		Phone:              optionalTrimmedText(req.Phone),
		Email:              optionalTrimmedText(req.Email),
		ResumeAttachmentID: resumeAttachmentID,
		MatchScore:         applyInt2Patch(req.MatchScore, pgtype.Int2{}),
		ScoreResume:        floatToNumeric(req.ScoreResume),
		ScoreTest:          floatToNumeric(req.ScoreTest),
		ScoreInterview:     floatToNumeric(req.ScoreInterview),
		ExpectedSalary:     floatToNumeric(req.ExpectedSalary),
		OfferSalary:        floatToNumeric(req.OfferSalary),
		Currency:           strToText(currency),
		OwnerMemberID:      owner,
		RejectedReason:     optionalTrimmedText(req.RejectedReason),
		CreatedBy:          scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this person is already a candidate for this job")
			return
		}
		workbenchInternalError(w, r, "failed to create candidate", err)
		return
	}
	h.publishHrChanged(eventHrCandidateChanged, scope.WorkspaceID, uuidToString(candidate.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, hrCandidateToResponse(candidate))
}

// GetHrCandidate — GET /api/workbench/hr/candidates/{candidateId}
func (h *Handler) GetHrCandidate(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	candidateID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "candidateId"), "candidate id")
	if !ok {
		return
	}
	candidate, err := h.Queries.GetHrCandidate(r.Context(), db.GetHrCandidateParams{
		ID:          candidateID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "candidate not found")
		return
	}
	writeJSON(w, http.StatusOK, hrCandidateToResponse(candidate))
}

// UpdateHrCandidate — PATCH /api/workbench/hr/candidates/{candidateId}
//
// Moving the stage to `hired` here stamps `hired_at` the same way the hire route
// does, so a candidate cannot reach the hired stage without the milestone the
// `hr.time_to_hire.median` metric reads.
func (h *Handler) UpdateHrCandidate(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrCandidateForWrite(w, r, scope)
	if !ok {
		return
	}
	var req HrCandidateRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	jobID := current.JobID
	if req.JobID != nil && strings.TrimSpace(*req.JobID) != "" {
		job, ok := h.requireHrJobInWorkspace(r.Context(), w, scope.WorkspaceID, req.JobID)
		if !ok {
			return
		}
		if !workbenchCanWrite(scope.Member, job.OwnerMemberID) {
			writeError(w, http.StatusForbidden, "you can only add candidates to jobs you own")
			return
		}
		jobID = job.ID
	}
	name := current.Name
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
	}
	stage := current.Stage
	if req.Stage != nil {
		stage = strings.TrimSpace(*req.Stage)
		if !hrCandidateStages[stage] {
			writeError(w, http.StatusBadRequest, "invalid stage")
			return
		}
	}
	if req.MatchScore != nil && (*req.MatchScore < 0 || *req.MatchScore > 100) {
		writeError(w, http.StatusBadRequest, "match_score must be between 0 and 100")
		return
	}
	currency := current.Currency
	if req.Currency != nil {
		parsed, ok := workbenchCurrency(w, req.Currency)
		if !ok {
			return
		}
		currency = parsed
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}
	resumeAttachmentID := current.ResumeAttachmentID
	if req.ResumeAttachmentID != nil {
		parsed, ok := workbenchOptionalUUID(w, req.ResumeAttachmentID, "resume_attachment_id")
		if !ok {
			return
		}
		resumeAttachmentID = parsed
	}
	hiredAt := current.HiredAt
	if stage == "hired" && !hiredAt.Valid {
		hiredAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	}

	updated, err := h.Queries.UpdateHrCandidate(r.Context(), db.UpdateHrCandidateParams{
		ID:                 current.ID,
		WorkspaceID:        scope.WorkspaceUUID,
		JobID:              jobID,
		Name:               name,
		Stage:              stage,
		Source:             applyTextPatch(req.Source, current.Source),
		Phone:              applyTextPatch(req.Phone, current.Phone),
		Email:              applyTextPatch(req.Email, current.Email),
		ResumeAttachmentID: resumeAttachmentID,
		MatchScore:         applyInt2Patch(req.MatchScore, current.MatchScore),
		ScoreResume:        applyNumericPatch(req.ScoreResume, current.ScoreResume),
		ScoreTest:          applyNumericPatch(req.ScoreTest, current.ScoreTest),
		ScoreInterview:     applyNumericPatch(req.ScoreInterview, current.ScoreInterview),
		ExpectedSalary:     applyNumericPatch(req.ExpectedSalary, current.ExpectedSalary),
		OfferSalary:        applyNumericPatch(req.OfferSalary, current.OfferSalary),
		Currency:           strToText(currency),
		OwnerMemberID:      owner,
		HiredAt:            hiredAt,
		RejectedReason:     applyTextPatch(req.RejectedReason, current.RejectedReason),
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this person is already a candidate for this job")
			return
		}
		workbenchInternalError(w, r, "failed to update candidate", err)
		return
	}

	actorID := uuidToString(scope.Member.UserID)
	if updated.Stage != current.Stage {
		h.publish(eventHrCandidateStageChanged, scope.WorkspaceID, "member", actorID, map[string]any{
			"id":   uuidToString(updated.ID),
			"from": current.Stage,
			"to":   updated.Stage,
		})
	}
	h.publishHrChanged(eventHrCandidateChanged, scope.WorkspaceID, uuidToString(updated.ID), actorID)
	writeJSON(w, http.StatusOK, hrCandidateToResponse(updated))
}

// DeleteHrCandidate — DELETE /api/workbench/hr/candidates/{candidateId}
func (h *Handler) DeleteHrCandidate(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrCandidateForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveHrCandidate(r.Context(), db.ArchiveHrCandidateParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete candidate", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "candidate not found")
		return
	}
	h.publishHrChanged(eventHrCandidateChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// HireHrCandidate — POST /api/workbench/hr/candidates/{candidateId}/hire
//
// One transaction writes the funnel side (`stage = hired`, `hired_at = now()`)
// and the employee side (create or update `hr_employee_profile` for the member the
// request names). A half-applied hire — a hired candidate with no employee record
// — is the one state nobody would notice until payroll did.
func (h *Handler) HireHrCandidate(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrCandidateForWrite(w, r, scope)
	if !ok {
		return
	}
	var req HrHireRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	if req.MemberID == nil || strings.TrimSpace(*req.MemberID) == "" {
		writeError(w, http.StatusBadRequest, "member_id is required")
		return
	}
	memberID, ok := parseUUIDOrBadRequest(w, strings.TrimSpace(*req.MemberID), "member_id")
	if !ok {
		return
	}
	if _, err := h.getWorkspaceMember(r.Context(), uuidToString(memberID), scope.WorkspaceID); err != nil {
		writeError(w, http.StatusBadRequest, "member_id is not a member of this workspace")
		return
	}
	departmentID, ok := h.requireHrDepartment(w, r, scope, req.DepartmentID)
	if !ok {
		return
	}
	ability, ok := workbenchJSONObject(w, req.Ability, "ability")
	if !ok {
		return
	}
	disc, ok := workbenchJSONObject(w, req.Disc, "disc")
	if !ok {
		return
	}
	hireDate, ok := workbenchDateValue(w, req.HireDate, "hire_date")
	if !ok {
		return
	}
	regularDate, ok := workbenchDateValue(w, req.RegularDate, "regular_date")
	if !ok {
		return
	}
	contractEnd, ok := workbenchDateValue(w, req.ContractEnd, "contract_end")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to hire candidate", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	hired, err := qtx.HireHrCandidate(r.Context(), db.HireHrCandidateParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to hire candidate", err)
		return
	}

	existing, err := qtx.GetHrEmployeeProfileByMember(r.Context(), db.GetHrEmployeeProfileByMemberParams{
		WorkspaceID: scope.WorkspaceUUID,
		MemberID:    memberID,
	})
	var profile db.HrEmployeeProfile
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		profile, err = qtx.CreateHrEmployeeProfile(r.Context(), db.CreateHrEmployeeProfileParams{
			WorkspaceID:   scope.WorkspaceUUID,
			MemberID:      memberID,
			DepartmentID:  departmentID,
			JobTitle:      optionalTrimmedText(req.JobTitle),
			Grade:         optionalTrimmedText(req.Grade),
			HireDate:      firstValidDate(hireDate, pgtypeDateToday()),
			RegularDate:   regularDate,
			ContractEnd:   contractEnd,
			Ability:       applyJSONPatch(ability, hrEmptyJSONObject),
			Disc:          applyJSONPatch(disc, hrEmptyJSONObject),
			OwnerMemberID: owner,
			CreatedBy:     scope.Member.UserID,
		})
	case err != nil:
		workbenchInternalError(w, r, "failed to read employee profile", err)
		return
	default:
		profile, err = qtx.UpdateHrEmployeeProfile(r.Context(), db.UpdateHrEmployeeProfileParams{
			ID:            existing.ID,
			WorkspaceID:   scope.WorkspaceUUID,
			DepartmentID:  firstValidUUID(departmentID, existing.DepartmentID),
			JobTitle:      firstFilledText(req.JobTitle, existing.JobTitle),
			Grade:         firstFilledText(req.Grade, existing.Grade),
			HireDate:      firstValidDate(hireDate, existing.HireDate),
			RegularDate:   firstValidDate(regularDate, existing.RegularDate),
			ContractEnd:   firstValidDate(contractEnd, existing.ContractEnd),
			Ability:       applyJSONPatch(ability, existing.Ability),
			Disc:          applyJSONPatch(disc, existing.Disc),
			OwnerMemberID: existing.OwnerMemberID,
		})
	}
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this member already has an employee profile")
			return
		}
		workbenchInternalError(w, r, "failed to save employee profile", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to hire candidate", err)
		return
	}

	actorID := uuidToString(scope.Member.UserID)
	if current.Stage != "hired" {
		h.publish(eventHrCandidateStageChanged, scope.WorkspaceID, "member", actorID, map[string]any{
			"id":   uuidToString(hired.ID),
			"from": current.Stage,
			"to":   hired.Stage,
		})
	}
	h.publishHrChanged(eventHrCandidateChanged, scope.WorkspaceID, uuidToString(hired.ID), actorID)
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(profile.ID), actorID)
	writeJSON(w, http.StatusOK, HrHireResponse{
		Candidate:       hrCandidateToResponse(hired),
		EmployeeProfile: hrEmployeeProfileToResponse(profile),
	})
}

// firstValidUUID keeps the stored pointer when the request omitted it.
func firstValidUUID(preferred, fallback pgtype.UUID) pgtype.UUID {
	if preferred.Valid {
		return preferred
	}
	return fallback
}

// firstFilledText keeps the stored text when the request did not send one.
func firstFilledText(raw *string, fallback pgtype.Text) pgtype.Text {
	if raw == nil {
		return fallback
	}
	return optionalTrimmedText(raw)
}

// firstValidDate keeps the stored date when the request omitted it.
func firstValidDate(preferred, fallback pgtype.Date) pgtype.Date {
	if preferred.Valid {
		return preferred
	}
	return fallback
}

// ---- interviews ------------------------------------------------------------

// ListHrInterviews — GET /api/workbench/hr/interviews
func (h *Handler) ListHrInterviews(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	candidateID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("candidate_id"))), "candidate_id")
	if !ok {
		return
	}
	interviewerID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("interviewer_member_id"))), "interviewer_member_id")
	if !ok {
		return
	}
	scheduledFrom, ok := workbenchTimestampValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("from"))), "from")
	if !ok {
		return
	}
	scheduledTo, ok := workbenchTimestampValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("to"))), "to")
	if !ok {
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetHrInterview(r.Context(), db.GetHrInterviewParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
		return row.ScheduledAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListHrInterviews(r.Context(), db.ListHrInterviewsParams{
		WorkspaceID:         scope.WorkspaceUUID,
		CandidateID:         candidateID,
		InterviewerMemberID: interviewerID,
		ScheduledFrom:       scheduledFrom,
		ScheduledTo:         scheduledTo,
		CursorAt:            cursorAt,
		CursorID:            cursorID,
		Limit:               workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list interviews", err)
		return
	}
	resp := make([]HrInterviewResponse, len(rows))
	for i, row := range rows {
		resp[i] = hrInterviewToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"interviews": resp, "total": len(resp)})
}

// CreateHrInterview — POST /api/workbench/hr/interviews
func (h *Handler) CreateHrInterview(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req HrInterviewRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	candidate, ok := h.requireHrCandidateInWorkspace(r.Context(), w, scope.WorkspaceID, req.CandidateID)
	if !ok {
		return
	}
	if !workbenchCanWrite(scope.Member, candidate.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only schedule interviews for candidates you own")
		return
	}
	if req.ScheduledAt == nil || strings.TrimSpace(*req.ScheduledAt) == "" {
		writeError(w, http.StatusBadRequest, "scheduled_at is required")
		return
	}
	scheduledAt, ok := workbenchTimestampValue(w, req.ScheduledAt, "scheduled_at")
	if !ok {
		return
	}
	interviewerID, ok := h.requireHrMember(w, r, scope, req.InterviewerMemberID, "interviewer_member_id")
	if !ok {
		return
	}
	mode := strings.TrimSpace(valueOrEmpty(req.Mode))
	if mode != "" && !hrInterviewModes[mode] {
		writeError(w, http.StatusBadRequest, "mode must be onsite, video or phone")
		return
	}
	status := "scheduled"
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
	}
	if !hrInterviewStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	if !h.hrInterviewSlotFree(r.Context(), w, r, scope, interviewerID, scheduledAt, hrZeroUUID) {
		return
	}

	interview, err := h.Queries.CreateHrInterview(r.Context(), db.CreateHrInterviewParams{
		WorkspaceID:         scope.WorkspaceUUID,
		CandidateID:         candidate.ID,
		Round:               applyInt16Value(req.Round, 1),
		ScheduledAt:         scheduledAt,
		DurationMinutes:     applyInt32Value(req.DurationMinutes, 45),
		InterviewerMemberID: interviewerID,
		Mode:                optionalTrimmedText(req.Mode),
		Status:              status,
		RescheduledCount:    0,
		Note:                optionalTrimmedText(req.Note),
		CreatedBy:           scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this interviewer already has an interview at that time")
			return
		}
		workbenchInternalError(w, r, "failed to create interview", err)
		return
	}
	h.publishHrChanged(eventHrInterviewChanged, scope.WorkspaceID, uuidToString(interview.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, hrInterviewToResponse(interview))
}

// GetHrInterview — GET /api/workbench/hr/interviews/{interviewId}
func (h *Handler) GetHrInterview(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	interviewID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "interviewId"), "interview id")
	if !ok {
		return
	}
	interview, err := h.Queries.GetHrInterview(r.Context(), db.GetHrInterviewParams{
		ID:          interviewID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "interview not found")
		return
	}
	writeJSON(w, http.StatusOK, hrInterviewToResponse(interview))
}

// UpdateHrInterview — PATCH /api/workbench/hr/interviews/{interviewId}
//
// Moving `scheduled_at` is a reschedule: it must land on a free interviewer slot
// (409 otherwise) and increments `rescheduled_count`, the evidence
// `hr.interview.on_time_rate` reads.
func (h *Handler) UpdateHrInterview(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, _, ok := h.loadHrInterviewForWrite(w, r, scope)
	if !ok {
		return
	}
	var req HrInterviewRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	candidateID := current.CandidateID
	if req.CandidateID != nil && strings.TrimSpace(*req.CandidateID) != "" {
		candidate, ok := h.requireHrCandidateInWorkspace(r.Context(), w, scope.WorkspaceID, req.CandidateID)
		if !ok {
			return
		}
		if !workbenchCanWrite(scope.Member, candidate.OwnerMemberID) {
			writeError(w, http.StatusForbidden, "you can only schedule interviews for candidates you own")
			return
		}
		candidateID = candidate.ID
	}
	scheduledAt := current.ScheduledAt
	if req.ScheduledAt != nil {
		parsed, ok := workbenchTimestampValue(w, req.ScheduledAt, "scheduled_at")
		if !ok {
			return
		}
		if !parsed.Valid {
			writeError(w, http.StatusBadRequest, "scheduled_at is required")
			return
		}
		scheduledAt = parsed
	}
	interviewerID := current.InterviewerMemberID
	if req.InterviewerMemberID != nil {
		parsed, ok := h.requireHrMember(w, r, scope, req.InterviewerMemberID, "interviewer_member_id")
		if !ok {
			return
		}
		interviewerID = parsed
	}
	status := current.Status
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
		if !hrInterviewStatuses[status] {
			writeError(w, http.StatusBadRequest, "invalid status")
			return
		}
	}
	if req.Mode != nil {
		trimmed := strings.TrimSpace(*req.Mode)
		if trimmed != "" && !hrInterviewModes[trimmed] {
			writeError(w, http.StatusBadRequest, "mode must be onsite, video or phone")
			return
		}
	}
	rescheduledCount := current.RescheduledCount
	rescheduled := scheduledAt.Valid && current.ScheduledAt.Valid && !scheduledAt.Time.Equal(current.ScheduledAt.Time)
	if rescheduled {
		rescheduledCount++
	}
	if !h.hrInterviewSlotFree(r.Context(), w, r, scope, interviewerID, scheduledAt, current.ID) {
		return
	}

	updated, err := h.Queries.UpdateHrInterview(r.Context(), db.UpdateHrInterviewParams{
		ID:                  current.ID,
		WorkspaceID:         scope.WorkspaceUUID,
		CandidateID:         candidateID,
		Round:               applyInt16Value(req.Round, current.Round),
		ScheduledAt:         scheduledAt,
		DurationMinutes:     applyInt32Value(req.DurationMinutes, current.DurationMinutes),
		InterviewerMemberID: interviewerID,
		Mode:                applyTextPatch(req.Mode, current.Mode),
		Status:              status,
		RescheduledCount:    rescheduledCount,
		Note:                applyTextPatch(req.Note, current.Note),
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this interviewer already has an interview at that time")
			return
		}
		workbenchInternalError(w, r, "failed to update interview", err)
		return
	}
	h.publishHrChanged(eventHrInterviewChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrInterviewToResponse(updated))
}

// DeleteHrInterview — DELETE /api/workbench/hr/interviews/{interviewId}
func (h *Handler) DeleteHrInterview(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, _, ok := h.loadHrInterviewForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveHrInterview(r.Context(), db.ArchiveHrInterviewParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete interview", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "interview not found")
		return
	}
	h.publishHrChanged(eventHrInterviewChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- scorecards ------------------------------------------------------------

// ListHrScorecards — GET /api/workbench/hr/scorecards
func (h *Handler) ListHrScorecards(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	interviewID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("interview_id"))), "interview_id")
	if !ok {
		return
	}
	reviewerID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("reviewer_member_id"))), "reviewer_member_id")
	if !ok {
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetHrScorecard(r.Context(), db.GetHrScorecardParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListHrScorecards(r.Context(), db.ListHrScorecardsParams{
		WorkspaceID:      scope.WorkspaceUUID,
		InterviewID:      interviewID,
		ReviewerMemberID: reviewerID,
		CursorAt:         cursorAt,
		CursorID:         cursorID,
		Limit:            workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list scorecards", err)
		return
	}
	resp := make([]HrScorecardResponse, len(rows))
	for i, row := range rows {
		resp[i] = hrScorecardToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"scorecards": resp, "total": len(resp)})
}

// CreateHrScorecard — POST /api/workbench/hr/scorecards
func (h *Handler) CreateHrScorecard(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req HrScorecardRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	interviewID, ok := workbenchOptionalUUID(w, req.InterviewID, "interview_id")
	if !ok {
		return
	}
	if !interviewID.Valid {
		writeError(w, http.StatusBadRequest, "interview_id is required")
		return
	}
	if _, err := h.Queries.GetHrInterview(r.Context(), db.GetHrInterviewParams{
		ID:          interviewID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "interview_id is not an interview in this workspace")
		return
	}
	if !h.hrInterviewWritable(w, r, scope, interviewID) {
		return
	}
	reviewerID, ok := h.requireHrMember(w, r, scope, req.ReviewerMemberID, "reviewer_member_id")
	if !ok {
		return
	}
	if !hrScorecardVerdict(w, req.Verdict) {
		return
	}

	scorecard, err := h.Queries.CreateHrScorecard(r.Context(), db.CreateHrScorecardParams{
		WorkspaceID:      scope.WorkspaceUUID,
		InterviewID:      interviewID,
		ReviewerMemberID: reviewerID,
		ScoreSkill:       applyInt2Patch(req.ScoreSkill, pgtype.Int2{}),
		ScoreExperience:  applyInt2Patch(req.ScoreExperience, pgtype.Int2{}),
		ScoreCulture:     applyInt2Patch(req.ScoreCulture, pgtype.Int2{}),
		ScorePotential:   applyInt2Patch(req.ScorePotential, pgtype.Int2{}),
		WeightedScore:    floatToNumeric(req.WeightedScore),
		Verdict:          optionalTrimmedText(req.Verdict),
		Comment:          optionalTrimmedText(req.Comment),
		CreatedBy:        scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this reviewer already scored this interview")
			return
		}
		workbenchInternalError(w, r, "failed to create scorecard", err)
		return
	}
	h.publishHrChanged(eventHrScorecardChanged, scope.WorkspaceID, uuidToString(scorecard.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, hrScorecardToResponse(scorecard))
}

// UpdateHrScorecard — PATCH /api/workbench/hr/scorecards/{scorecardId}
func (h *Handler) UpdateHrScorecard(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrScorecardForWrite(w, r, scope)
	if !ok {
		return
	}
	var req HrScorecardRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	interviewID := current.InterviewID
	if req.InterviewID != nil && strings.TrimSpace(*req.InterviewID) != "" {
		parsed, ok := workbenchOptionalUUID(w, req.InterviewID, "interview_id")
		if !ok {
			return
		}
		if _, err := h.Queries.GetHrInterview(r.Context(), db.GetHrInterviewParams{
			ID:          parsed,
			WorkspaceID: scope.WorkspaceUUID,
		}); err != nil {
			writeError(w, http.StatusBadRequest, "interview_id is not an interview in this workspace")
			return
		}
		if !h.hrInterviewWritable(w, r, scope, parsed) {
			return
		}
		interviewID = parsed
	}
	reviewerID := current.ReviewerMemberID
	if req.ReviewerMemberID != nil {
		parsed, ok := h.requireHrMember(w, r, scope, req.ReviewerMemberID, "reviewer_member_id")
		if !ok {
			return
		}
		reviewerID = parsed
	}
	if !hrScorecardVerdict(w, req.Verdict) {
		return
	}

	updated, err := h.Queries.UpdateHrScorecard(r.Context(), db.UpdateHrScorecardParams{
		ID:               current.ID,
		WorkspaceID:      scope.WorkspaceUUID,
		InterviewID:      interviewID,
		ReviewerMemberID: reviewerID,
		ScoreSkill:       applyInt2Patch(req.ScoreSkill, current.ScoreSkill),
		ScoreExperience:  applyInt2Patch(req.ScoreExperience, current.ScoreExperience),
		ScoreCulture:     applyInt2Patch(req.ScoreCulture, current.ScoreCulture),
		ScorePotential:   applyInt2Patch(req.ScorePotential, current.ScorePotential),
		WeightedScore:    applyNumericPatch(req.WeightedScore, current.WeightedScore),
		Verdict:          applyTextPatch(req.Verdict, current.Verdict),
		Comment:          applyTextPatch(req.Comment, current.Comment),
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this reviewer already scored this interview")
			return
		}
		workbenchInternalError(w, r, "failed to update scorecard", err)
		return
	}
	h.publishHrChanged(eventHrScorecardChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrScorecardToResponse(updated))
}

// DeleteHrScorecard — DELETE /api/workbench/hr/scorecards/{scorecardId}
func (h *Handler) DeleteHrScorecard(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrScorecardForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveHrScorecard(r.Context(), db.ArchiveHrScorecardParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete scorecard", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "scorecard not found")
		return
	}
	h.publishHrChanged(eventHrScorecardChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// hrScorecardVerdict validates the verdict vocabulary the CHECK constraint lists.
func hrScorecardVerdict(w http.ResponseWriter, raw *string) bool {
	if raw == nil {
		return true
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" || hrScorecardVerdicts[trimmed] {
		return true
	}
	writeError(w, http.StatusBadRequest, "invalid verdict")
	return false
}

// ---- employee profiles -----------------------------------------------------

// ListHrEmployees — GET /api/workbench/hr/employees
func (h *Handler) ListHrEmployees(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	departmentID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("department_id"))), "department_id")
	if !ok {
		return
	}
	memberID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("member_id"))), "member_id")
	if !ok {
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetHrEmployeeProfile(r.Context(), db.GetHrEmployeeProfileParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListHrEmployeeProfiles(r.Context(), db.ListHrEmployeeProfilesParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: departmentID,
		MemberID:     memberID,
		CursorAt:     cursorAt,
		CursorID:     cursorID,
		Limit:        workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list employee profiles", err)
		return
	}
	resp := make([]HrEmployeeProfileResponse, len(rows))
	for i, row := range rows {
		resp[i] = hrEmployeeProfileToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"employees": resp, "total": len(resp)})
}

// CreateHrEmployee — POST /api/workbench/hr/employees
func (h *Handler) CreateHrEmployee(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req HrEmployeeProfileRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	if req.MemberID == nil || strings.TrimSpace(*req.MemberID) == "" {
		writeError(w, http.StatusBadRequest, "member_id is required")
		return
	}
	memberID, ok := parseUUIDOrBadRequest(w, strings.TrimSpace(*req.MemberID), "member_id")
	if !ok {
		return
	}
	if _, err := h.getWorkspaceMember(r.Context(), uuidToString(memberID), scope.WorkspaceID); err != nil {
		writeError(w, http.StatusBadRequest, "member_id is not a member of this workspace")
		return
	}
	departmentID, ok := h.requireHrDepartment(w, r, scope, req.DepartmentID)
	if !ok {
		return
	}
	ability, ok := workbenchJSONObject(w, req.Ability, "ability")
	if !ok {
		return
	}
	disc, ok := workbenchJSONObject(w, req.Disc, "disc")
	if !ok {
		return
	}
	hireDate, ok := workbenchDateValue(w, req.HireDate, "hire_date")
	if !ok {
		return
	}
	regularDate, ok := workbenchDateValue(w, req.RegularDate, "regular_date")
	if !ok {
		return
	}
	contractEnd, ok := workbenchDateValue(w, req.ContractEnd, "contract_end")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}

	profile, err := h.Queries.CreateHrEmployeeProfile(r.Context(), db.CreateHrEmployeeProfileParams{
		WorkspaceID:   scope.WorkspaceUUID,
		MemberID:      memberID,
		DepartmentID:  departmentID,
		JobTitle:      optionalTrimmedText(req.JobTitle),
		Grade:         optionalTrimmedText(req.Grade),
		HireDate:      hireDate,
		RegularDate:   regularDate,
		ContractEnd:   contractEnd,
		Ability:       applyJSONPatch(ability, hrEmptyJSONObject),
		Disc:          applyJSONPatch(disc, hrEmptyJSONObject),
		OwnerMemberID: owner,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this member already has an employee profile")
			return
		}
		workbenchInternalError(w, r, "failed to create employee profile", err)
		return
	}
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(profile.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, hrEmployeeProfileToResponse(profile))
}

// GetHrEmployee — GET /api/workbench/hr/employees/{employeeId}
func (h *Handler) GetHrEmployee(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	profileID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "employeeId"), "employee profile id")
	if !ok {
		return
	}
	profile, err := h.Queries.GetHrEmployeeProfile(r.Context(), db.GetHrEmployeeProfileParams{
		ID:          profileID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "employee profile not found")
		return
	}
	writeJSON(w, http.StatusOK, hrEmployeeProfileToResponse(profile))
}

// UpdateHrEmployee — PATCH /api/workbench/hr/employees/{employeeId}
func (h *Handler) UpdateHrEmployee(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrEmployeeProfileForWrite(w, r, scope)
	if !ok {
		return
	}
	var req HrEmployeeProfileRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	if req.MemberID != nil && strings.TrimSpace(*req.MemberID) != "" {
		memberID, ok := parseUUIDOrBadRequest(w, strings.TrimSpace(*req.MemberID), "member_id")
		if !ok {
			return
		}
		if uuidToString(memberID) != uuidToString(current.MemberID) {
			writeError(w, http.StatusBadRequest, "member_id cannot be changed")
			return
		}
	}
	departmentID := current.DepartmentID
	if req.DepartmentID != nil {
		parsed, ok := h.requireHrDepartment(w, r, scope, req.DepartmentID)
		if !ok {
			return
		}
		departmentID = parsed
	}
	ability, ok := workbenchJSONObject(w, req.Ability, "ability")
	if !ok {
		return
	}
	disc, ok := workbenchJSONObject(w, req.Disc, "disc")
	if !ok {
		return
	}
	hireDate, ok := applyDatePatch(req.HireDate, w, "hire_date", current.HireDate)
	if !ok {
		return
	}
	regularDate, ok := applyDatePatch(req.RegularDate, w, "regular_date", current.RegularDate)
	if !ok {
		return
	}
	contractEnd, ok := applyDatePatch(req.ContractEnd, w, "contract_end", current.ContractEnd)
	if !ok {
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

	updated, err := h.Queries.UpdateHrEmployeeProfile(r.Context(), db.UpdateHrEmployeeProfileParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		DepartmentID:  departmentID,
		JobTitle:      applyTextPatch(req.JobTitle, current.JobTitle),
		Grade:         applyTextPatch(req.Grade, current.Grade),
		HireDate:      hireDate,
		RegularDate:   regularDate,
		ContractEnd:   contractEnd,
		Ability:       applyJSONPatch(ability, current.Ability),
		Disc:          applyJSONPatch(disc, current.Disc),
		OwnerMemberID: owner,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update employee profile", err)
		return
	}
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrEmployeeProfileToResponse(updated))
}

// DeleteHrEmployee — DELETE /api/workbench/hr/employees/{employeeId}
func (h *Handler) DeleteHrEmployee(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrEmployeeProfileForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveHrEmployeeProfile(r.Context(), db.ArchiveHrEmployeeProfileParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete employee profile", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "employee profile not found")
		return
	}
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

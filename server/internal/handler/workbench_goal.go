package handler

// General manager workbench: OKR goals 目标 -> key results -> department packages,
// and the radar signals that become one or the other
// (docs/engineering/WORKBENCH-API.md §13).
//
// Four tables and one link column:
//
//	goal_okr            one objective for one cycle
//	goal_key_result     one measurable result under a goal, with target/current
//	goal_package        one goal split for one department, with its own owner
//	market_signal       one external/internal observation, graded and converted
//	issue.goal_id       the task side: which objective this work advances
//
// The two shapes that decide everything else:
//
//   - a goal response embeds its key results and its packages, ordered by
//     `position`. One board reads a cycle's goals with three queries total, and
//     the children never come back as a separate "now fetch KRs" round trip.
//   - `goal_key_result.current` is a stored number, written by the two paths that
//     know it (an operator's PATCH, and the application's roll-up of the issues
//     under the goal). It is never computed at read time: a report that
//     recomputes on read rewrites last quarter every time a task is reopened, so
//     no two exports of the same period ever agree (745).
//
// Ownership follows the row: a goal is gated by its own `owner_member_id`, and a
// key result or a package inherits the gate of the goal it hangs off — the
// `owner_member_id` a package carries is who the split answers to, not the write
// gate, because reassigning a goal must not leave its splits owned by somebody
// else. A signal is gated by its own `owner_member_id` like every other workbench
// row; converting it writes exactly one of `converted_goal_id` /
// `converted_issue_id`.

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/issuestatus"
	"github.com/jerry-halo2026/morchat.co/server/internal/service"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// Workbench event types for the general manager domain. Registered alongside the
// other workbench events so the client can invalidate one domain prefix instead
// of guessing which list a write touched.
const (
	eventGoalChanged         = "goal:changed"
	eventMarketSignalChanged = "market_signal:changed"
)

// Enum vocabularies. The database CHECK constraints are the authority; these
// lists exist so a bad value is a 400 with a readable message instead of a 500
// from the driver.
var (
	goalStatuses             = []string{"draft", "active", "paused", "done", "cancelled"}
	goalPriorities           = []string{"P0", "P1", "P2"}
	goalKeyResultStatuses    = []string{"on_track", "at_risk", "off_track", "done"}
	marketSignalCategories   = []string{"market", "competitor", "channel", "product", "policy", "other"}
	marketSignalSources      = []string{"manual", "ai", "import"}
	marketSignalCuts         = []string{"hot", "warm", "cold"}
	marketSignalUrgencies    = []string{"high", "medium", "low"}
	marketSignalStatuses     = []string{"new", "reviewing", "converted", "dismissed"}
	marketSignalConvertGoals = []string{"goal", "issue"}
)

// The defaults a create body falls back to, which are also the values the
// columns default to (744-747).
const (
	goalStatusDraft               = "draft"
	goalStatusActive              = "active"
	goalPriorityDefault           = "P2"
	goalKeyResultStatusOnTrack    = "on_track"
	marketSignalStatusNew         = "new"
	marketSignalStatusConverted   = "converted"
	marketSignalCutWarm           = "warm"
	marketSignalUrgencyMedium     = "medium"
	marketSignalCategoryOther     = "other"
	marketSignalSourceManual      = "manual"
	marketSignalConvertTargetGoal = "goal"
	marketSignalConvertTargetTask = "issue"
)

// ---- requests --------------------------------------------------------------

// GoalRequest is both the create and the PATCH body. `cycle` is free text
// (`2026Q4`); the create path defaults it to the current quarter when omitted.
type GoalRequest struct {
	Cycle         *string `json:"cycle"`
	Title         *string `json:"title"`
	Description   *string `json:"description"`
	OwnerMemberID *string `json:"owner_member_id"`
	DepartmentID  *string `json:"department_id"`
	Status        *string `json:"status"`
	DueDate       *string `json:"due_date"`
	Priority      *string `json:"priority"`
}

// GoalKeyResultRequest is both the create and the PATCH body. `target` is a
// pointer so "not decided yet" (NULL) stays distinct from 0 — 0 would be a claim
// the result is already missed.
type GoalKeyResultRequest struct {
	Title    *string  `json:"title"`
	Target   *float64 `json:"target"`
	Current  *float64 `json:"current"`
	Unit     *string  `json:"unit"`
	Position *int32   `json:"position"`
	Status   *string  `json:"status"`
}

// GoalPackageRequest is both the create and the PATCH body. `department_id` is
// required on create: a package *is* the assignment to a department.
type GoalPackageRequest struct {
	DepartmentID  *string `json:"department_id"`
	Title         *string `json:"title"`
	OwnerMemberID *string `json:"owner_member_id"`
	Status        *string `json:"status"`
	Position      *int32  `json:"position"`
}

// MarketSignalRequest is both the create and the PATCH body. `status` cannot be
// set to `converted` here — that value belongs to POST …/convert, which also
// writes the pointer it implies.
type MarketSignalRequest struct {
	Title         *string  `json:"title"`
	Category      *string  `json:"category"`
	Source        *string  `json:"source"`
	URL           *string  `json:"url"`
	Summary       *string  `json:"summary"`
	Cut           *string  `json:"cut"`
	Score         *float64 `json:"score"`
	Urgency       *string  `json:"urgency"`
	Status        *string  `json:"status"`
	Note          *string  `json:"note"`
	OwnerMemberID *string  `json:"owner_member_id"`
}

// MarketSignalConvertRequest is POST …/signals/{id}/convert. `cycle` and
// `department_id` are used by the goal target and ignored by the task target;
// `project_id` is used by the task target (a converted signal becomes a real
// issue in a real project) and ignored by the goal target.
type MarketSignalConvertRequest struct {
	Target       *string `json:"target"`
	Cycle        *string `json:"cycle"`
	DepartmentID *string `json:"department_id"`
	ProjectID    *string `json:"project_id"`
}

// GoalIssueRequest attaches an existing issue to a goal (POST …/goals/{id}/issues).
type GoalIssueRequest struct {
	IssueID *string `json:"issue_id"`
}

// ---- responses -------------------------------------------------------------

type GoalKeyResultResponse struct {
	ID          string   `json:"id"`
	WorkspaceID string   `json:"workspace_id"`
	GoalID      string   `json:"goal_id"`
	Title       string   `json:"title"`
	Target      *float64 `json:"target"`
	Current     float64  `json:"current"`
	Unit        *string  `json:"unit"`
	Position    int32    `json:"position"`
	Status      string   `json:"status"`
	CreatedBy   *string  `json:"created_by"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
	ArchivedAt  *string  `json:"archived_at"`
}

type GoalPackageResponse struct {
	ID            string  `json:"id"`
	WorkspaceID   string  `json:"workspace_id"`
	GoalID        string  `json:"goal_id"`
	DepartmentID  string  `json:"department_id"`
	Title         string  `json:"title"`
	OwnerMemberID *string `json:"owner_member_id"`
	Status        string  `json:"status"`
	Position      int32   `json:"position"`
	CreatedBy     *string `json:"created_by"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
	ArchivedAt    *string `json:"archived_at"`
}

// GoalResponse embeds the goal's key results and department packages, both in
// `position` order. They are always present (an empty list, never null) so a
// client can render a goal without checking whether the children were fetched.
type GoalResponse struct {
	ID            string                  `json:"id"`
	WorkspaceID   string                  `json:"workspace_id"`
	Cycle         string                  `json:"cycle"`
	Title         string                  `json:"title"`
	Description   *string                 `json:"description"`
	OwnerMemberID string                  `json:"owner_member_id"`
	DepartmentID  *string                 `json:"department_id"`
	Status        string                  `json:"status"`
	DueDate       *string                 `json:"due_date"`
	Priority      string                  `json:"priority"`
	CreatedBy     *string                 `json:"created_by"`
	CreatedAt     string                  `json:"created_at"`
	UpdatedAt     string                  `json:"updated_at"`
	ArchivedAt    *string                 `json:"archived_at"`
	KeyResults    []GoalKeyResultResponse `json:"key_results"`
	Packages      []GoalPackageResponse   `json:"packages"`
}

// GoalIssueResponse is one task under a goal: a projection of the issue, not the
// whole issue response. The goal screen needs the task's identity and its state;
// everything else lives behind the issue's own endpoint.
type GoalIssueResponse struct {
	ID     string  `json:"id"`
	Number int32   `json:"number"`
	Title  string  `json:"title"`
	Status string  `json:"status"`
	GoalID *string `json:"goal_id"`
}

// GoalDetailResponse is GET /goals/{id}: the goal with its key results, its
// packages and the issues attached to it.
type GoalDetailResponse struct {
	GoalResponse
	Issues []GoalIssueResponse `json:"issues"`
}

type MarketSignalResponse struct {
	ID               string   `json:"id"`
	WorkspaceID      string   `json:"workspace_id"`
	Title            string   `json:"title"`
	Category         string   `json:"category"`
	Source           string   `json:"source"`
	URL              *string  `json:"url"`
	Summary          *string  `json:"summary"`
	Cut              string   `json:"cut"`
	Score            *float64 `json:"score"`
	Urgency          string   `json:"urgency"`
	Status           string   `json:"status"`
	ConvertedGoalID  *string  `json:"converted_goal_id"`
	ConvertedIssueID *string  `json:"converted_issue_id"`
	Note             *string  `json:"note"`
	OwnerMemberID    *string  `json:"owner_member_id"`
	CreatedBy        *string  `json:"created_by"`
	CreatedAt        string   `json:"created_at"`
	UpdatedAt        string   `json:"updated_at"`
	ArchivedAt       *string  `json:"archived_at"`
}

// MarketSignalConvertResponse answers POST …/convert. Exactly one of Goal and
// Issue is set; the signal carries the pointer that was written, so a client does
// not have to guess which target it just created.
type MarketSignalConvertResponse struct {
	Signal MarketSignalResponse `json:"signal"`
	Goal   *GoalResponse        `json:"goal,omitempty"`
	Issue  *GoalIssueResponse   `json:"issue,omitempty"`
}

func goalKeyResultToResponse(kr db.GoalKeyResult) GoalKeyResultResponse {
	return GoalKeyResultResponse{
		ID:          uuidToString(kr.ID),
		WorkspaceID: uuidToString(kr.WorkspaceID),
		GoalID:      uuidToString(kr.GoalID),
		Title:       kr.Title,
		Target:      numericToFloatPtr(kr.Target),
		Current:     numericToFloat(kr.Current),
		Unit:        textToPtr(kr.Unit),
		Position:    kr.Position,
		Status:      kr.Status,
		CreatedBy:   uuidToPtr(kr.CreatedBy),
		CreatedAt:   timestampToString(kr.CreatedAt),
		UpdatedAt:   timestampToString(kr.UpdatedAt),
		ArchivedAt:  timestampToPtr(kr.ArchivedAt),
	}
}

func goalPackageToResponse(pkg db.GoalPackage) GoalPackageResponse {
	return GoalPackageResponse{
		ID:            uuidToString(pkg.ID),
		WorkspaceID:   uuidToString(pkg.WorkspaceID),
		GoalID:        uuidToString(pkg.GoalID),
		DepartmentID:  uuidToString(pkg.DepartmentID),
		Title:         pkg.Title,
		OwnerMemberID: uuidToPtr(pkg.OwnerMemberID),
		Status:        pkg.Status,
		Position:      pkg.Position,
		CreatedBy:     uuidToPtr(pkg.CreatedBy),
		CreatedAt:     timestampToString(pkg.CreatedAt),
		UpdatedAt:     timestampToString(pkg.UpdatedAt),
		ArchivedAt:    timestampToPtr(pkg.ArchivedAt),
	}
}

func goalToResponse(goal db.GoalOkr) GoalResponse {
	return GoalResponse{
		ID:            uuidToString(goal.ID),
		WorkspaceID:   uuidToString(goal.WorkspaceID),
		Cycle:         goal.Cycle,
		Title:         goal.Title,
		Description:   textToPtr(goal.Description),
		OwnerMemberID: uuidToString(goal.OwnerMemberID),
		DepartmentID:  uuidToPtr(goal.DepartmentID),
		Status:        goal.Status,
		DueDate:       dateToPtr(goal.DueDate),
		Priority:      goal.Priority,
		CreatedBy:     uuidToPtr(goal.CreatedBy),
		CreatedAt:     timestampToString(goal.CreatedAt),
		UpdatedAt:     timestampToString(goal.UpdatedAt),
		ArchivedAt:    timestampToPtr(goal.ArchivedAt),
		KeyResults:    []GoalKeyResultResponse{},
		Packages:      []GoalPackageResponse{},
	}
}

func marketSignalToResponse(signal db.MarketSignal) MarketSignalResponse {
	return MarketSignalResponse{
		ID:               uuidToString(signal.ID),
		WorkspaceID:      uuidToString(signal.WorkspaceID),
		Title:            signal.Title,
		Category:         signal.Category,
		Source:           signal.Source,
		URL:              textToPtr(signal.Url),
		Summary:          textToPtr(signal.Summary),
		Cut:              signal.Cut,
		Score:            numericToFloatPtr(signal.Score),
		Urgency:          signal.Urgency,
		Status:           signal.Status,
		ConvertedGoalID:  uuidToPtr(signal.ConvertedGoalID),
		ConvertedIssueID: uuidToPtr(signal.ConvertedIssueID),
		Note:             textToPtr(signal.Note),
		OwnerMemberID:    uuidToPtr(signal.OwnerMemberID),
		CreatedBy:        uuidToPtr(signal.CreatedBy),
		CreatedAt:        timestampToString(signal.CreatedAt),
		UpdatedAt:        timestampToString(signal.UpdatedAt),
		ArchivedAt:       timestampToPtr(signal.ArchivedAt),
	}
}

// ---- value helpers ---------------------------------------------------------

// goalCurrentCycle is the cycle a goal created without one belongs to. Cycles are
// free text (744), so this is a convention rather than a format the database
// enforces: `2026Q4`, the quarter of the request. A caller that keeps its
// planning in months passes `2026-11` instead, and nothing downstream cares.
func goalCurrentCycle() string {
	now := pgtypeDateToday().Time
	quarter := (int(now.Month())-1)/3 + 1
	return fmt.Sprintf("%dQ%d", now.Year(), quarter)
}

// goalEnumValue resolves an optional enum field against its vocabulary: absent
// keeps the stored value (or the create default), a value outside the list is a
// 400 naming the field.
func goalEnumValue(w http.ResponseWriter, field string, patched *string, current string, allowed []string) (string, bool) {
	if patched == nil {
		return current, true
	}
	value := strings.TrimSpace(*patched)
	if mediaEnumInvalid(value, allowed) {
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("%s must be one of %s", field, strings.Join(allowed, ", ")))
		return "", false
	}
	return value, true
}

// goalPositionValue resolves an optional position. Absent keeps the stored value
// on a PATCH and means 0 on a create — 0 is where an unordered row sorts, and the
// read falls back to creation order for ties.
func goalPositionValue(patched *int32, current int32) int32 {
	if patched == nil {
		return current
	}
	return *patched
}

// goalScoreValue validates a signal's 0-100 relevance. Absent keeps the stored
// value; a value outside the band is a 400 rather than a stored 137.
func goalScoreValue(w http.ResponseWriter, patched *float64, current pgtype.Numeric) (pgtype.Numeric, bool) {
	if patched == nil {
		return current, true
	}
	if *patched < 0 || *patched > 100 {
		writeError(w, http.StatusBadRequest, "score must be between 0 and 100")
		return pgtype.Numeric{}, false
	}
	return floatToNumeric(patched), true
}

// goalTargetValue validates a key result's target. `target >= 0` is the handler's
// rule (the column CHECK is the backstop): a negative target is a typo, and
// answering 400 names the field instead of surfacing a constraint violation.
// There is no upper check — a target is a commitment, not a percentage.
func goalTargetValue(w http.ResponseWriter, patched *float64, current pgtype.Numeric) (pgtype.Numeric, bool) {
	if patched == nil {
		return current, true
	}
	if *patched < 0 {
		writeError(w, http.StatusBadRequest, "target must be zero or positive")
		return pgtype.Numeric{}, false
	}
	return floatToNumeric(patched), true
}

// goalCurrentValue is the stored progress of a key result. It is deliberately
// unbounded above: over-achievement is a real outcome, and clamping it to
// `target` would hide the quarter's best number. It may also exceed a NULL
// target, which is the normal state of a result whose target is still undecided.
func goalCurrentValue(patched *float64, current pgtype.Numeric) pgtype.Numeric {
	if patched == nil {
		return current
	}
	return floatToNumeric(patched)
}

// marketSignalIssueBody renders a converted signal as an issue description: the
// summary, the source link and the operator's note, in that order. An issue with
// no description would lose the reason it exists, and the signal row itself is
// not readable from the issue screen.
func marketSignalIssueBody(signal db.MarketSignal) pgtype.Text {
	parts := make([]string, 0, 3)
	if summary := strings.TrimSpace(signal.Summary.String); signal.Summary.Valid && summary != "" {
		parts = append(parts, summary)
	}
	if url := strings.TrimSpace(signal.Url.String); signal.Url.Valid && url != "" {
		parts = append(parts, "来源："+url)
	}
	if note := strings.TrimSpace(signal.Note.String); signal.Note.Valid && note != "" {
		parts = append(parts, "备注："+note)
	}
	if len(parts) == 0 {
		return pgtype.Text{}
	}
	return pgtype.Text{String: strings.Join(parts, "\n\n"), Valid: true}
}

// ---- loaders ---------------------------------------------------------------

// loadGoalForWrite resolves a goal in the caller's workspace and gates on its own
// owner. Key results and packages walk through here, which is what makes the
// goal's owner the write gate for the whole tree.
func (h *Handler) loadGoalForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.GoalOkr, bool) {
	goalID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "goalId"), "goal id")
	if !ok {
		return db.GoalOkr{}, false
	}
	goal, err := h.Queries.GetGoal(r.Context(), db.GetGoalParams{ID: goalID, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "goal not found")
		return db.GoalOkr{}, false
	}
	if !workbenchCanWrite(scope.Member, goal.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change goals you own")
		return db.GoalOkr{}, false
	}
	return goal, true
}

// loadGoalKeyResultForWrite resolves a key result plus the goal it belongs to and
// gates on that goal's owner.
func (h *Handler) loadGoalKeyResultForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.GoalKeyResult, db.GoalOkr, bool) {
	goal, ok := h.loadGoalForWrite(w, r, scope)
	if !ok {
		return db.GoalKeyResult{}, db.GoalOkr{}, false
	}
	keyResultID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "keyResultId"), "key result id")
	if !ok {
		return db.GoalKeyResult{}, db.GoalOkr{}, false
	}
	keyResult, err := h.Queries.GetGoalKeyResult(r.Context(), db.GetGoalKeyResultParams{
		ID: keyResultID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil || uuidToString(keyResult.GoalID) != uuidToString(goal.ID) {
		// A key result that belongs to another goal is not reachable from this
		// URL, so it is answered the same way as a missing one.
		writeError(w, http.StatusNotFound, "key result not found")
		return db.GoalKeyResult{}, db.GoalOkr{}, false
	}
	return keyResult, goal, true
}

// loadGoalPackageForWrite resolves a department package plus its goal, gated on
// the goal's owner.
func (h *Handler) loadGoalPackageForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.GoalPackage, db.GoalOkr, bool) {
	goal, ok := h.loadGoalForWrite(w, r, scope)
	if !ok {
		return db.GoalPackage{}, db.GoalOkr{}, false
	}
	packageID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "packageId"), "package id")
	if !ok {
		return db.GoalPackage{}, db.GoalOkr{}, false
	}
	pkg, err := h.Queries.GetGoalPackage(r.Context(), db.GetGoalPackageParams{
		ID: packageID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil || uuidToString(pkg.GoalID) != uuidToString(goal.ID) {
		writeError(w, http.StatusNotFound, "package not found")
		return db.GoalPackage{}, db.GoalOkr{}, false
	}
	return pkg, goal, true
}

func (h *Handler) loadMarketSignalForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.MarketSignal, bool) {
	signalID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "signalId"), "signal id")
	if !ok {
		return db.MarketSignal{}, false
	}
	signal, err := h.Queries.GetMarketSignal(r.Context(), db.GetMarketSignalParams{
		ID: signalID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "signal not found")
		return db.MarketSignal{}, false
	}
	if !workbenchCanWrite(scope.Member, signal.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change signals you own")
		return db.MarketSignal{}, false
	}
	return signal, true
}

// ---- goals -----------------------------------------------------------------

// ListGoals — GET /api/workbench/goals
//
// Every listed goal carries its key results and its packages. The children are
// read in two batched statements over the goals that were just returned, not one
// statement per goal: a cycle holds tens of goals and the board renders them all.
func (h *Handler) ListGoals(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	cycle := strings.TrimSpace(r.URL.Query().Get("cycle"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && mediaEnumInvalid(status, goalStatuses) {
		writeError(w, http.StatusBadRequest, "status must be draft, active, paused, done or cancelled")
		return
	}
	rows, err := h.Queries.ListGoals(r.Context(), db.ListGoalsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Cycle:       strToText(cycle),
		Status:      strToText(status),
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list goals", err)
		return
	}
	goals := make([]GoalResponse, len(rows))
	goalIDs := make([]pgtype.UUID, len(rows))
	for i, row := range rows {
		goals[i] = goalToResponse(row)
		goalIDs[i] = row.ID
	}
	if len(goalIDs) > 0 {
		children, err := h.goalChildren(r.Context(), scope, goalIDs)
		if err != nil {
			workbenchInternalError(w, r, "failed to read goal progress", err)
			return
		}
		for i := range goals {
			goals[i].KeyResults = children.keyResults[uuidToString(rows[i].ID)]
			goals[i].Packages = children.packages[uuidToString(rows[i].ID)]
		}
	}
	// `total` is this page's row count, like every other workbench list.
	writeJSON(w, http.StatusOK, map[string]any{"goals": goals, "total": len(goals)})
}

// goalChildIndex holds the batched children of a goal list, keyed by goal id.
type goalChildIndex struct {
	keyResults map[string][]GoalKeyResultResponse
	packages   map[string][]GoalPackageResponse
}

// goalChildren reads the key results and packages of goalIDs in two statements
// and groups them by goal, preserving the order the SQL returned (position, then
// creation).
func (h *Handler) goalChildren(ctx context.Context, scope workbenchScope, goalIDs []pgtype.UUID) (goalChildIndex, error) {
	index := goalChildIndex{
		keyResults: make(map[string][]GoalKeyResultResponse, len(goalIDs)),
		packages:   make(map[string][]GoalPackageResponse, len(goalIDs)),
	}
	for _, goalID := range goalIDs {
		index.keyResults[uuidToString(goalID)] = []GoalKeyResultResponse{}
		index.packages[uuidToString(goalID)] = []GoalPackageResponse{}
	}
	keyResults, err := h.Queries.ListGoalKeyResults(ctx, db.ListGoalKeyResultsParams{
		WorkspaceID: scope.WorkspaceUUID, GoalIds: goalIDs,
	})
	if err != nil {
		return goalChildIndex{}, err
	}
	for _, row := range keyResults {
		goalID := uuidToString(row.GoalID)
		index.keyResults[goalID] = append(index.keyResults[goalID], goalKeyResultToResponse(row))
	}
	packages, err := h.Queries.ListGoalPackages(ctx, db.ListGoalPackagesParams{
		WorkspaceID: scope.WorkspaceUUID, GoalIds: goalIDs,
	})
	if err != nil {
		return goalChildIndex{}, err
	}
	for _, row := range packages {
		goalID := uuidToString(row.GoalID)
		index.packages[goalID] = append(index.packages[goalID], goalPackageToResponse(row))
	}
	return index, nil
}

// CreateGoal — POST /api/workbench/goals
func (h *Handler) CreateGoal(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	var req GoalRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	title := strings.TrimSpace(valueOrEmpty(req.Title))
	if title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	cycle := strings.TrimSpace(valueOrEmpty(req.Cycle))
	if cycle == "" {
		cycle = goalCurrentCycle()
	}
	status, ok := goalEnumValue(w, "status", req.Status, goalStatusDraft, goalStatuses)
	if !ok {
		return
	}
	priority, ok := goalEnumValue(w, "priority", req.Priority, goalPriorityDefault, goalPriorities)
	if !ok {
		return
	}
	dueDate, ok := workbenchDateValue(w, req.DueDate, "due_date")
	if !ok {
		return
	}
	departmentID, ok := workbenchOptionalUUID(w, req.DepartmentID, "department_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}

	goal, err := h.Queries.CreateGoal(r.Context(), db.CreateGoalParams{
		WorkspaceID:   scope.WorkspaceUUID,
		Cycle:         cycle,
		Title:         title,
		Description:   optionalTrimmedText(req.Description),
		OwnerMemberID: owner,
		DepartmentID:  departmentID,
		Status:        status,
		DueDate:       dueDate,
		Priority:      priority,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a goal with this title already exists in this cycle")
			return
		}
		workbenchInternalError(w, r, "failed to create goal", err)
		return
	}

	h.publishGoalChanged(scope, uuidToString(goal.ID))
	writeJSON(w, http.StatusCreated, goalToResponse(goal))
}

// GetGoal — GET /api/workbench/goals/{goalId}
func (h *Handler) GetGoal(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	goalID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "goalId"), "goal id")
	if !ok {
		return
	}
	goal, err := h.Queries.GetGoal(r.Context(), db.GetGoalParams{
		ID: goalID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "goal not found")
		return
	}
	children, err := h.goalChildren(r.Context(), scope, []pgtype.UUID{goal.ID})
	if err != nil {
		workbenchInternalError(w, r, "failed to read goal progress", err)
		return
	}
	issues, err := h.Queries.ListGoalIssues(r.Context(), db.ListGoalIssuesParams{
		WorkspaceID: scope.WorkspaceUUID, GoalID: goal.ID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list the goal's issues", err)
		return
	}
	resp := GoalDetailResponse{
		GoalResponse: goalToResponse(goal),
		Issues:       make([]GoalIssueResponse, len(issues)),
	}
	resp.KeyResults = children.keyResults[uuidToString(goal.ID)]
	resp.Packages = children.packages[uuidToString(goal.ID)]
	for i, issue := range issues {
		resp.Issues[i] = goalIssueToResponse(issue)
	}
	writeJSON(w, http.StatusOK, resp)
}

// UpdateGoal — PATCH /api/workbench/goals/{goalId}
func (h *Handler) UpdateGoal(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	current, ok := h.loadGoalForWrite(w, r, scope)
	if !ok {
		return
	}
	var req GoalRequest
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
	cycle := current.Cycle
	if req.Cycle != nil {
		cycle = strings.TrimSpace(*req.Cycle)
		if cycle == "" {
			writeError(w, http.StatusBadRequest, "cycle is required")
			return
		}
	}
	status, ok := goalEnumValue(w, "status", req.Status, current.Status, goalStatuses)
	if !ok {
		return
	}
	priority, ok := goalEnumValue(w, "priority", req.Priority, current.Priority, goalPriorities)
	if !ok {
		return
	}
	dueDate, ok := applyDatePatch(req.DueDate, w, "due_date", current.DueDate)
	if !ok {
		return
	}
	departmentID := current.DepartmentID
	if req.DepartmentID != nil {
		departmentID, ok = workbenchOptionalUUID(w, req.DepartmentID, "department_id")
		if !ok {
			return
		}
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateGoal(r.Context(), db.UpdateGoalParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		Cycle:         cycle,
		Title:         title,
		Description:   applyTextPatch(req.Description, current.Description),
		OwnerMemberID: owner,
		DepartmentID:  departmentID,
		Status:        status,
		DueDate:       dueDate,
		Priority:      priority,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a goal with this title already exists in this cycle")
			return
		}
		workbenchInternalError(w, r, "failed to update goal", err)
		return
	}

	h.publishGoalChanged(scope, uuidToString(updated.ID))
	writeJSON(w, http.StatusOK, goalToResponse(updated))
}

// DeleteGoal — DELETE /api/workbench/goals/{goalId} (soft delete)
//
// Archives the goal and, in the same transaction, its key results and packages: a
// live key result whose goal is gone would keep showing up in the batched child
// read of a goal list that no longer includes it.
func (h *Handler) DeleteGoal(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	current, ok := h.loadGoalForWrite(w, r, scope)
	if !ok {
		return
	}
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to delete goal", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	if err := qtx.ArchiveGoalKeyResultsForGoal(r.Context(), db.ArchiveGoalKeyResultsForGoalParams{
		WorkspaceID: scope.WorkspaceUUID, GoalID: current.ID,
	}); err != nil {
		workbenchInternalError(w, r, "failed to delete goal", err)
		return
	}
	if err := qtx.ArchiveGoalPackagesForGoal(r.Context(), db.ArchiveGoalPackagesForGoalParams{
		WorkspaceID: scope.WorkspaceUUID, GoalID: current.ID,
	}); err != nil {
		workbenchInternalError(w, r, "failed to delete goal", err)
		return
	}
	deleted, err := qtx.ArchiveGoal(r.Context(), db.ArchiveGoalParams{
		ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete goal", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "goal not found")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to delete goal", err)
		return
	}

	// The attached issues keep `goal_id`: archiving a goal is "this objective was
	// created by mistake", not "detach the work that was done against it". Reads
	// of a goal go through `goal_okr`, so a dangling pointer is never rendered.
	h.publishGoalChanged(scope, uuidToString(current.ID))
	w.WriteHeader(http.StatusNoContent)
}

// AttachGoalIssue — POST /api/workbench/goals/{goalId}/issues
//
// Writes `issue.goal_id` (748). An issue advances at most one objective, so an
// issue that already carries a pointer is a 409 in both directions: the same goal
// (already attached) and another goal (detach first). Re-pointing in place would
// silently move a task's completion between objectives.
func (h *Handler) AttachGoalIssue(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	goal, ok := h.loadGoalForWrite(w, r, scope)
	if !ok {
		return
	}
	var req GoalIssueRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	issueID, ok := parseUUIDOrBadRequest(w, strings.TrimSpace(valueOrEmpty(req.IssueID)), "issue_id")
	if !ok {
		return
	}
	issue, err := h.Queries.GetIssueGoalPointer(r.Context(), db.GetIssueGoalPointerParams{
		ID: issueID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "issue_id is not an issue in this workspace")
		return
	}
	if issue.GoalID.Valid {
		if uuidToString(issue.GoalID) == uuidToString(goal.ID) {
			writeError(w, http.StatusConflict, "this issue is already attached to the goal")
			return
		}
		writeError(w, http.StatusConflict, "this issue already belongs to another goal; detach it first")
		return
	}

	attached, err := h.Queries.SetIssueGoal(r.Context(), db.SetIssueGoalParams{
		ID:          issue.ID,
		WorkspaceID: scope.WorkspaceUUID,
		GoalID:      goal.ID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to attach the issue to the goal", err)
		return
	}

	h.publishGoalChanged(scope, uuidToString(goal.ID))
	writeJSON(w, http.StatusCreated, setGoalIssueToResponse(attached))
}

// DetachGoalIssue — DELETE /api/workbench/goals/{goalId}/issues/{issueId}
//
// Clears `issue.goal_id`. The issue is not deleted: it stays in its project and
// simply stops counting towards this objective.
func (h *Handler) DetachGoalIssue(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	goal, ok := h.loadGoalForWrite(w, r, scope)
	if !ok {
		return
	}
	issueID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "issueId"), "issue id")
	if !ok {
		return
	}
	issue, err := h.Queries.GetIssueGoalPointer(r.Context(), db.GetIssueGoalPointerParams{
		ID: issueID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "issue not found")
		return
	}
	if !issue.GoalID.Valid || uuidToString(issue.GoalID) != uuidToString(goal.ID) {
		writeError(w, http.StatusNotFound, "this issue is not attached to the goal")
		return
	}

	if _, err := h.Queries.SetIssueGoal(r.Context(), db.SetIssueGoalParams{
		ID:          issue.ID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		workbenchInternalError(w, r, "failed to detach the issue from the goal", err)
		return
	}

	h.publishGoalChanged(scope, uuidToString(goal.ID))
	w.WriteHeader(http.StatusNoContent)
}

// goalIssueRowToResponse builds the projection from the five columns every
// issue-under-a-goal read returns. The two generated row structs
// (`ListGoalIssuesRow`, `SetIssueGoalRow`) carry the same columns, so the shape
// lives here once instead of in a converter per statement.
func goalIssueRowToResponse(id pgtype.UUID, number int32, title, status string, goalID pgtype.UUID) GoalIssueResponse {
	return GoalIssueResponse{
		ID:     uuidToString(id),
		Number: number,
		Title:  title,
		Status: status,
		GoalID: uuidToPtr(goalID),
	}
}

func goalIssueToResponse(i db.ListGoalIssuesRow) GoalIssueResponse {
	return goalIssueRowToResponse(i.ID, i.Number, i.Title, i.Status, i.GoalID)
}

func setGoalIssueToResponse(i db.SetIssueGoalRow) GoalIssueResponse {
	return goalIssueRowToResponse(i.ID, i.Number, i.Title, i.Status, i.GoalID)
}

// ---- key results -----------------------------------------------------------

// CreateGoalKeyResult — POST /api/workbench/goals/{goalId}/key-results
func (h *Handler) CreateGoalKeyResult(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	goal, ok := h.loadGoalForWrite(w, r, scope)
	if !ok {
		return
	}
	var req GoalKeyResultRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	title := strings.TrimSpace(valueOrEmpty(req.Title))
	if title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	status, ok := goalEnumValue(w, "status", req.Status, goalKeyResultStatusOnTrack, goalKeyResultStatuses)
	if !ok {
		return
	}
	target, ok := goalTargetValue(w, req.Target, pgtype.Numeric{})
	if !ok {
		return
	}

	keyResult, err := h.Queries.CreateGoalKeyResult(r.Context(), db.CreateGoalKeyResultParams{
		WorkspaceID: scope.WorkspaceUUID,
		GoalID:      goal.ID,
		Title:       title,
		Target:      target,
		Current:     goalCurrentValue(req.Current, floatToNumeric(zeroFloat())),
		Unit:        optionalTrimmedText(req.Unit),
		Position:    goalPositionValue(req.Position, 0),
		Status:      status,
		CreatedBy:   scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create key result", err)
		return
	}

	h.publishGoalChanged(scope, uuidToString(goal.ID))
	writeJSON(w, http.StatusCreated, goalKeyResultToResponse(keyResult))
}

// UpdateGoalKeyResult — PATCH /api/workbench/goals/{goalId}/key-results/{keyResultId}
//
// This is one of the two writes that may move `current`. It is a recorded figure,
// not a computed one: the caller's number is stored as given (and may exceed
// `target`), while the roll-up of attached issues writes the aggregate back
// separately.
func (h *Handler) UpdateGoalKeyResult(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	current, goal, ok := h.loadGoalKeyResultForWrite(w, r, scope)
	if !ok {
		return
	}
	var req GoalKeyResultRequest
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
	status, ok := goalEnumValue(w, "status", req.Status, current.Status, goalKeyResultStatuses)
	if !ok {
		return
	}
	target, ok := goalTargetValue(w, req.Target, current.Target)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateGoalKeyResult(r.Context(), db.UpdateGoalKeyResultParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
		Title:       title,
		Target:      target,
		Current:     goalCurrentValue(req.Current, current.Current),
		Unit:        applyTextPatch(req.Unit, current.Unit),
		Position:    goalPositionValue(req.Position, current.Position),
		Status:      status,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update key result", err)
		return
	}

	h.publishGoalChanged(scope, uuidToString(goal.ID))
	writeJSON(w, http.StatusOK, goalKeyResultToResponse(updated))
}

// DeleteGoalKeyResult — DELETE /api/workbench/goals/{goalId}/key-results/{keyResultId}
func (h *Handler) DeleteGoalKeyResult(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	current, goal, ok := h.loadGoalKeyResultForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveGoalKeyResult(r.Context(), db.ArchiveGoalKeyResultParams{
		ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete key result", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "key result not found")
		return
	}
	h.publishGoalChanged(scope, uuidToString(goal.ID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- department packages ---------------------------------------------------

// CreateGoalPackage — POST /api/workbench/goals/{goalId}/packages
//
// `owner_member_id` here is who the split answers to, not a write gate: the gate
// stays the goal's owner. Owners and admins may name any member; a member may
// only name itself (or omit it), the same rule as every other owned row.
func (h *Handler) CreateGoalPackage(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	goal, ok := h.loadGoalForWrite(w, r, scope)
	if !ok {
		return
	}
	var req GoalPackageRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	departmentID, ok := workbenchOptionalUUID(w, req.DepartmentID, "department_id")
	if !ok {
		return
	}
	if !departmentID.Valid {
		writeError(w, http.StatusBadRequest, "department_id is required")
		return
	}
	title := strings.TrimSpace(valueOrEmpty(req.Title))
	if title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	status, ok := goalEnumValue(w, "status", req.Status, goalStatusDraft, goalStatuses)
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}

	pkg, err := h.Queries.CreateGoalPackage(r.Context(), db.CreateGoalPackageParams{
		WorkspaceID:   scope.WorkspaceUUID,
		GoalID:        goal.ID,
		DepartmentID:  departmentID,
		Title:         title,
		OwnerMemberID: owner,
		Status:        status,
		Position:      goalPositionValue(req.Position, 0),
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create package", err)
		return
	}

	h.publishGoalChanged(scope, uuidToString(goal.ID))
	writeJSON(w, http.StatusCreated, goalPackageToResponse(pkg))
}

// UpdateGoalPackage — PATCH /api/workbench/goals/{goalId}/packages/{packageId}
func (h *Handler) UpdateGoalPackage(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	current, goal, ok := h.loadGoalPackageForWrite(w, r, scope)
	if !ok {
		return
	}
	var req GoalPackageRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	departmentID := current.DepartmentID
	if req.DepartmentID != nil {
		departmentID, ok = workbenchOptionalUUID(w, req.DepartmentID, "department_id")
		if !ok {
			return
		}
		if !departmentID.Valid {
			writeError(w, http.StatusBadRequest, "department_id is required")
			return
		}
	}
	title := current.Title
	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
		if title == "" {
			writeError(w, http.StatusBadRequest, "title is required")
			return
		}
	}
	status, ok := goalEnumValue(w, "status", req.Status, current.Status, goalStatuses)
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

	updated, err := h.Queries.UpdateGoalPackage(r.Context(), db.UpdateGoalPackageParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		DepartmentID:  departmentID,
		Title:         title,
		OwnerMemberID: owner,
		Status:        status,
		Position:      goalPositionValue(req.Position, current.Position),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update package", err)
		return
	}

	h.publishGoalChanged(scope, uuidToString(goal.ID))
	writeJSON(w, http.StatusOK, goalPackageToResponse(updated))
}

// DeleteGoalPackage — DELETE /api/workbench/goals/{goalId}/packages/{packageId}
func (h *Handler) DeleteGoalPackage(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	current, goal, ok := h.loadGoalPackageForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveGoalPackage(r.Context(), db.ArchiveGoalPackageParams{
		ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete package", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "package not found")
		return
	}
	h.publishGoalChanged(scope, uuidToString(goal.ID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- signals ---------------------------------------------------------------

// ListMarketSignals — GET /api/workbench/signals
//
// Ordered hottest first, then by score: the radar is a queue, not a table. All
// three filters are optional and independent.
func (h *Handler) ListMarketSignals(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	cut := strings.TrimSpace(r.URL.Query().Get("cut"))
	if cut != "" && mediaEnumInvalid(cut, marketSignalCuts) {
		writeError(w, http.StatusBadRequest, "cut must be hot, warm or cold")
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && mediaEnumInvalid(status, marketSignalStatuses) {
		writeError(w, http.StatusBadRequest, "status must be new, reviewing, converted or dismissed")
		return
	}
	category := strings.TrimSpace(r.URL.Query().Get("category"))
	if category != "" && mediaEnumInvalid(category, marketSignalCategories) {
		writeError(w, http.StatusBadRequest,
			"category must be market, competitor, channel, product, policy or other")
		return
	}
	rows, err := h.Queries.ListMarketSignals(r.Context(), db.ListMarketSignalsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Cut:         strToText(cut),
		Status:      strToText(status),
		Category:    strToText(category),
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list signals", err)
		return
	}
	resp := make([]MarketSignalResponse, len(rows))
	for i, row := range rows {
		resp[i] = marketSignalToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"signals": resp, "total": len(resp)})
}

// CreateMarketSignal — POST /api/workbench/signals
func (h *Handler) CreateMarketSignal(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	var req MarketSignalRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	title := strings.TrimSpace(valueOrEmpty(req.Title))
	if title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	category, ok := goalEnumValue(w, "category", req.Category, marketSignalCategoryOther, marketSignalCategories)
	if !ok {
		return
	}
	source, ok := goalEnumValue(w, "source", req.Source, marketSignalSourceManual, marketSignalSources)
	if !ok {
		return
	}
	cut, ok := goalEnumValue(w, "cut", req.Cut, marketSignalCutWarm, marketSignalCuts)
	if !ok {
		return
	}
	urgency, ok := goalEnumValue(w, "urgency", req.Urgency, marketSignalUrgencyMedium, marketSignalUrgencies)
	if !ok {
		return
	}
	status, ok := goalSignalStatusValue(w, req.Status, marketSignalStatusNew)
	if !ok {
		return
	}
	score, ok := goalScoreValue(w, req.Score, pgtype.Numeric{})
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}

	signal, err := h.Queries.CreateMarketSignal(r.Context(), db.CreateMarketSignalParams{
		WorkspaceID:   scope.WorkspaceUUID,
		Title:         title,
		Category:      category,
		Source:        source,
		Url:           optionalTrimmedText(req.URL),
		Summary:       optionalTrimmedText(req.Summary),
		Cut:           cut,
		Score:         score,
		Urgency:       urgency,
		Status:        status,
		Note:          optionalTrimmedText(req.Note),
		OwnerMemberID: owner,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create signal", err)
		return
	}

	h.publishMarketSignalChanged(scope, uuidToString(signal.ID))
	writeJSON(w, http.StatusCreated, marketSignalToResponse(signal))
}

// UpdateMarketSignal — PATCH /api/workbench/signals/{signalId}
func (h *Handler) UpdateMarketSignal(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	current, ok := h.loadMarketSignalForWrite(w, r, scope)
	if !ok {
		return
	}
	var req MarketSignalRequest
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
	category, ok := goalEnumValue(w, "category", req.Category, current.Category, marketSignalCategories)
	if !ok {
		return
	}
	source, ok := goalEnumValue(w, "source", req.Source, current.Source, marketSignalSources)
	if !ok {
		return
	}
	cut, ok := goalEnumValue(w, "cut", req.Cut, current.Cut, marketSignalCuts)
	if !ok {
		return
	}
	urgency, ok := goalEnumValue(w, "urgency", req.Urgency, current.Urgency, marketSignalUrgencies)
	if !ok {
		return
	}
	status, ok := goalSignalStatusValue(w, req.Status, current.Status)
	if !ok {
		return
	}
	score, ok := goalScoreValue(w, req.Score, current.Score)
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

	updated, err := h.Queries.UpdateMarketSignal(r.Context(), db.UpdateMarketSignalParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		Title:         title,
		Category:      category,
		Source:        source,
		Url:           applyTextPatch(req.URL, current.Url),
		Summary:       applyTextPatch(req.Summary, current.Summary),
		Cut:           cut,
		Score:         score,
		Urgency:       urgency,
		Status:        status,
		Note:          applyTextPatch(req.Note, current.Note),
		OwnerMemberID: owner,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update signal", err)
		return
	}

	h.publishMarketSignalChanged(scope, uuidToString(updated.ID))
	writeJSON(w, http.StatusOK, marketSignalToResponse(updated))
}

// DeleteMarketSignal — DELETE /api/workbench/signals/{signalId} (soft delete)
func (h *Handler) DeleteMarketSignal(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	current, ok := h.loadMarketSignalForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveMarketSignal(r.Context(), db.ArchiveMarketSignalParams{
		ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete signal", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "signal not found")
		return
	}
	h.publishMarketSignalChanged(scope, uuidToString(current.ID))
	w.WriteHeader(http.StatusNoContent)
}

// goalSignalStatusValue resolves a signal status, refusing `converted`: that
// value is written by the convert endpoint alone, because it always travels with
// the pointer that says into what. A PATCH that set it here would leave the radar
// showing a signal that claims to have landed somewhere with nothing to open.
func goalSignalStatusValue(w http.ResponseWriter, patched *string, current string) (string, bool) {
	status, ok := goalEnumValue(w, "status", patched, current, marketSignalStatuses)
	if !ok {
		return "", false
	}
	if patched != nil && status == marketSignalStatusConverted {
		writeError(w, http.StatusBadRequest,
			"status converted is written by POST /signals/{id}/convert, not by a patch")
		return "", false
	}
	return status, true
}

// ConvertMarketSignal — POST /api/workbench/signals/{signalId}/convert
//
// The radar's only exit into work: `{ "target": "goal" | "issue" }` creates the
// objective or the task and writes the landing pointer back onto the signal.
//
// Idempotency is the point of the transaction below. The signal row is locked
// (`FOR UPDATE`) before anything is created, so two concurrent converts do not
// both build a goal: the second waits, then sees `converted` and answers 409. The
// conditional update inside `ConvertMarketSignal` is the backstop for the case
// the lock cannot cover — a caller that is not in this transaction at all.
//
// The created task goes through `IssueService.Create`, not a direct INSERT: that
// is the one path that numbers the issue, applies the duplicate guard, applies the
// workflow status, and broadcasts `issue:created` to the other clients.
func (h *Handler) ConvertMarketSignal(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capBossRead) {
		return
	}
	signalID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "signalId"), "signal id")
	if !ok {
		return
	}
	var req MarketSignalConvertRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	target, ok := goalEnumValue(w, "target", req.Target, "", marketSignalConvertGoals)
	if !ok {
		return
	}
	if target == "" {
		writeError(w, http.StatusBadRequest, `target is required: "goal" or "issue"`)
		return
	}
	departmentID, ok := workbenchOptionalUUID(w, req.DepartmentID, "department_id")
	if !ok {
		return
	}
	projectID, ok := workbenchOptionalUUID(w, req.ProjectID, "project_id")
	if !ok {
		return
	}
	cycle := strings.TrimSpace(valueOrEmpty(req.Cycle))
	if cycle == "" {
		cycle = goalCurrentCycle()
	}

	ctx := r.Context()
	tx, err := h.TxStarter.Begin(ctx)
	if err != nil {
		workbenchInternalError(w, r, "failed to convert signal", err)
		return
	}
	defer tx.Rollback(ctx)
	qtx := h.Queries.WithTx(tx)

	signal, err := qtx.GetMarketSignalForUpdate(ctx, db.GetMarketSignalForUpdateParams{
		ID: signalID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "signal not found")
		return
	}
	if !workbenchCanWrite(scope.Member, signal.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only convert signals you own")
		return
	}
	if signal.Status == marketSignalStatusConverted {
		writeError(w, http.StatusConflict, "this signal has already been converted")
		return
	}
	// A signal with no owner converts into a goal or a task owned by whoever
	// converted it: both targets need an accountable member, and the action is the
	// convert itself.
	owner := signal.OwnerMemberID
	if !owner.Valid {
		owner = scope.Member.UserID
	}

	var (
		goal      db.GoalOkr
		issue     db.SetIssueGoalRow
		converted db.MarketSignal
	)
	switch target {
	case marketSignalConvertTargetGoal:
		goal, err = qtx.CreateGoal(ctx, db.CreateGoalParams{
			WorkspaceID:   scope.WorkspaceUUID,
			Cycle:         cycle,
			Title:         signal.Title,
			Description:   signal.Summary,
			OwnerMemberID: owner,
			DepartmentID:  departmentID,
			Status:        goalStatusActive,
			Priority:      goalPriorityDefault,
			CreatedBy:     scope.Member.UserID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				writeError(w, http.StatusConflict, "a goal with this title already exists in this cycle")
				return
			}
			workbenchInternalError(w, r, "failed to create the goal from the signal", err)
			return
		}
		converted, err = qtx.ConvertMarketSignal(ctx, db.ConvertMarketSignalParams{
			ID: signal.ID, WorkspaceID: scope.WorkspaceUUID, ConvertedGoalID: goal.ID,
		})
	case marketSignalConvertTargetTask:
		created, createErr := h.IssueService.Create(ctx, service.IssueCreateParams{
			WorkspaceID: scope.WorkspaceUUID,
			Title:       signal.Title,
			Description: marketSignalIssueBody(signal),
			Status:      issuestatus.Todo,
			Priority:    "none",
			CreatorType: "member",
			CreatorID:   scope.Member.UserID,
			ProjectID:   projectID,
			// The signal is the reason this task exists; a second signal with the
			// same headline is a second observation, not a duplicate to swallow.
			AllowDuplicate: true,
		}, service.IssueCreateOpts{ActorID: uuidToString(scope.Member.UserID)})
		if createErr != nil {
			workbenchInternalError(w, r, "failed to create the issue from the signal", createErr)
			return
		}
		converted, err = qtx.ConvertMarketSignal(ctx, db.ConvertMarketSignalParams{
			ID: signal.ID, WorkspaceID: scope.WorkspaceUUID, ConvertedIssueID: created.Issue.ID,
		})
		issue = db.SetIssueGoalRow{
			ID:     created.Issue.ID,
			Number: created.Issue.Number,
			Title:  created.Issue.Title,
			Status: created.Issue.Status,
			GoalID: created.Issue.GoalID,
		}
	default:
		writeError(w, http.StatusBadRequest, `target is required: "goal" or "issue"`)
		return
	}
	if err != nil {
		// Zero rows from ConvertMarketSignal means somebody converted the signal
		// between the lock and this statement: the target created above is rolled
		// back with the transaction, so nothing is left pointing at nothing.
		writeError(w, http.StatusConflict, "this signal has already been converted")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		workbenchInternalError(w, r, "failed to convert signal", err)
		return
	}

	h.publishMarketSignalChanged(scope, uuidToString(converted.ID))
	if goal.ID.Valid {
		h.publishGoalChanged(scope, uuidToString(goal.ID))
	}

	resp := MarketSignalConvertResponse{Signal: marketSignalToResponse(converted)}
	if goal.ID.Valid {
		goalResp := goalToResponse(goal)
		resp.Goal = &goalResp
	} else {
		issueResp := setGoalIssueToResponse(issue)
		resp.Issue = &issueResp
	}
	writeJSON(w, http.StatusCreated, resp)
}

// zeroFloat is the create default for a key result's `current`: 0, which is also
// the column default. Named so the call site reads as "no progress recorded yet".
func zeroFloat() *float64 {
	value := float64(0)
	return &value
}

// ---- events ----------------------------------------------------------------

func (h *Handler) publishGoalChanged(scope workbenchScope, goalID string) {
	h.publish(eventGoalChanged, scope.WorkspaceID, "member", uuidToString(scope.Member.UserID),
		map[string]any{"id": goalID})
}

func (h *Handler) publishMarketSignalChanged(scope workbenchScope, signalID string) {
	h.publish(eventMarketSignalChanged, scope.WorkspaceID, "member", uuidToString(scope.Member.UserID),
		map[string]any{"id": signalID})
}

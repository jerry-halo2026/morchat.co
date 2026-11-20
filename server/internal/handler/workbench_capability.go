package handler

// Product-layer capabilities (docs/engineering/WORKBENCH-API.md 搂24,
// docs/engineering/COLLAB-MODEL.md 搂1/搂6).
//
// `member.role` stays the platform primitive and this file does not change what it
// means: owner/admin still write everything. What the product layer needs on top is
// a vocabulary that can say "a 鍟嗗姟 may quote but may not settle" without inventing
// platform roles, so capabilities are **string constants** resolved per request from
// five sources, in this order (搂24.2):
//
//	1. role owner|admin  鈫?every capability
//	2. workbench_role_template for the member's job title (hr_employee_profile)
//	3. the department default table below (job function, by department name)
//	3b. department present but its name matches no built-in fragment: every `*.read`,
//	    nothing else (`source: "department_unknown"`)
//	4. fallback: the pre-capability set, for a member with NO department at all
//
// Two things this file deliberately does NOT do:
//
//   - it never narrows a *read* below the workspace by itself. Reads stay
//     workspace-wide unless `workspace.settings.workbench_visibility` is
//     `department` (搂24.4), because a permission system that hides data by default
//     turns every page into a support ticket.
//   - it never replaces the ownership rule. A write needs the capability **and**
//     (owner/admin, or the row's owner) 鈥?"I have crm.write" does not mean "I may
//     edit your collaboration", which is exactly the mistake COLLAB-MODEL 搂1 warns
//     about ("琚寚娲句笉绛変簬鏈夋潈鏀?).

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// Capability constants (搂24.1). They are the wire values: the client renders entry
// points from these strings, so renaming one is a breaking change.
const (
	capCRMRead    = "crm.read"
	capCRMWrite   = "crm.write"
	capCRMAmount  = "crm.amount"
	capCRMSettle  = "crm.settle"
	capMediaRead  = "media.read"
	capMediaWrite = "media.write"
	// capMediaPublish is the "this went live" write: creating, editing or removing a
	// creator post (WORKBENCH-API §12.3). The content scripts never "publish" — their
	// statuses stop at approved, so a script write is media.write.
	capMediaPublish = "media.publish"
	capHRRead       = "hr.read"
	capHRWrite      = "hr.write"
	capBossRead     = "boss.read"
	capAdsRead      = "ads.read"
	// capReviewAccept is the review gate (搂7.2 of COLLAB-MODEL): accepting what an
	// agent or an import wrote into a high-value field.
	capReviewAccept = "review.accept"
	// capAgentDelegate lets an agent write on this member's behalf. An agent never
	// gets more than its delegator, and without this it gets nothing.
	capAgentDelegate = "agent.delegate"
)

// workbenchCapabilityCatalog is every capability this server knows about, in the
// order 搂24.1 lists them. Unknown strings arriving from a template are ignored on
// read (a future capability must not lock an older server out of a workspace).
var workbenchCapabilityCatalog = []string{
	capCRMRead, capCRMWrite, capCRMAmount, capCRMSettle,
	capMediaRead, capMediaWrite, capMediaPublish,
	capHRRead, capHRWrite, capBossRead, capAdsRead,
	capReviewAccept, capAgentDelegate,
}

// workbenchCapabilitySource* are the `source` wire values (搂24.2). The pre-existing
// vocabulary is kept as it was and extended with one name, `department_unknown`: the
// member HAS a department but its name matched no built-in fragment. `source` exists to
// make "why can't I edit this" answerable, so folding that case into `department` would
// make the answer wrong. The client union `WorkbenchCapabilitySource`
// (packages/core/types/workbench.ts) carries the same literals.
const (
	capabilitySourceRole              = "role"
	capabilitySourceTemplate          = "template"
	capabilitySourceDepartment        = "department"
	capabilitySourceDepartmentUnknown = "department_unknown"
	capabilitySourceFallback          = "fallback"
)

// workbenchDepartmentDefaults is 搂24.2 step 3: a job function's default capability
// set, keyed by a normalised fragment of the department's own name.
//
// It is a constant table rather than a database one on purpose: this batch has no
// admin UI for department defaults, and a table nobody can edit would be a worse
// answer than a documented default that a role template can override per person.
// Matching is by substring against `lower(department.name)`, longest fragment first,
// so 閿€鍞儴 / 鍟嗗姟鎷撳睍閮?/ 鐢靛晢閿€鍞?all land on the same entry.
var workbenchDepartmentDefaults = []struct {
	fragment     string
	capabilities []string
}{
	{"销售", []string{capCRMRead, capCRMWrite, capCRMAmount, capMediaRead, capBossRead}},
	{"商务", []string{capCRMRead, capCRMWrite, capCRMAmount, capMediaRead, capBossRead}},
	{"bd", []string{capCRMRead, capCRMWrite, capCRMAmount, capMediaRead, capBossRead}},
	{"客户", []string{capCRMRead, capCRMWrite, capMediaRead}},
	{"内容", []string{capMediaRead, capMediaWrite, capMediaPublish, capCRMRead}},
	{"运营", []string{capMediaRead, capMediaWrite, capMediaPublish, capCRMRead, capBossRead}},
	{"投放", []string{capAdsRead, capMediaRead, capBossRead}},
	{"广告", []string{capAdsRead, capMediaRead, capBossRead}},
	{"人事", []string{capHRRead, capHRWrite}},
	{"hr", []string{capHRRead, capHRWrite}},
	{"财务", []string{capCRMRead, capBossRead, capCRMSettle}},
	{"设计", []string{capMediaRead, capMediaWrite}},
}

// capabilitySet is one request's resolved capability set. A set, not a slice: every
// check is a membership test and the response renders it sorted.
type capabilitySet map[string]struct{}

func newCapabilitySet(values ...string) capabilitySet {
	set := make(capabilitySet, len(values))
	for _, value := range values {
		set[value] = struct{}{}
	}
	return set
}

func (s capabilitySet) has(capability string) bool {
	_, present := s[capability]
	return present
}

// list renders the set in catalog order (unknown extras last, alphabetically) so the
// client can diff two responses without re-sorting.
func (s capabilitySet) list() []string {
	out := make([]string, 0, len(s))
	for _, known := range workbenchCapabilityCatalog {
		if s.has(known) {
			out = append(out, known)
		}
	}
	extras := make([]string, 0, len(s))
	for value := range s {
		known := false
		for _, catalogued := range workbenchCapabilityCatalog {
			if value == catalogued {
				known = true
				break
			}
		}
		if !known {
			extras = append(extras, value)
		}
	}
	sort.Strings(extras)
	return append(out, extras...)
}

// fallbackCapabilities is 搂24.2 step 4: what a member with no role template and no
// department gets. It is deliberately the set the server granted before capabilities
// existed 鈥?everything `workbenchCanWrite` needed 鈥?and nothing that is new:
//
//	crm.read crm.write crm.amount crm.settle media.read media.write media.publish
//	hr.read ads.read boss.read
//
// The fallback must not be narrower than the behaviour it replaces. Most members have
// neither a job title (an HR profile is rare) nor a department (departments were added
// later), so a read-only fallback would silently demote the majority of a real
// workspace from "I can edit my own rows" to "read only" on deploy 鈥?a regression
// nobody would report as a permissions bug; they would report it as "the product got
// worse". `hr.write`, `review.accept` and `agent.delegate` are absent on purpose: they
// are capabilities that did not exist before, so withholding them changes nothing,
// while granting them by default would hand out new rights no owner ever approved.
//
// It is reachable only through `!member.department_id` (see resolveWorkbenchCapabilities).
// A member who HAS a department whose name matches no built-in fragment gets
// unknownDepartmentCapabilities instead: handing them this set would make an
// unrecognised department outrank a recognised one (5 narrow capabilities for 商务, 10
// broad ones for a renamed department), which turns "rename or delete the department"
// into the cheapest way to gain rights.
func fallbackCapabilities() capabilitySet {
	return newCapabilitySet(
		capCRMRead, capCRMWrite, capCRMAmount, capCRMSettle,
		capMediaRead, capMediaWrite, capMediaPublish,
		capHRRead, capAdsRead, capBossRead,
	)
}

// unknownDepartmentCapabilities is what a member with a department the default table
// cannot classify gets (a renamed department, one created before the table knew its
// job function, or a dangling department_id). An unrecognised name tells the server
// nothing about the job function, so the honest answer is the read-only floor of the
// catalogue rather than the legacy write set: `crm.read media.read boss.read hr.read
// ads.read` and nothing else.
//
// No write, settle, publish, `review.accept` or `agent.delegate`: those are decisions an
// owner has to hand out explicitly, and a department name that matched nothing is not an
// owner's decision. The department's people keep every read entry point, and a role
// template (or a workspace with a better department name) grants more.
func unknownDepartmentCapabilities() capabilitySet {
	return newCapabilitySet(capCRMRead, capMediaRead, capBossRead, capHRRead, capAdsRead)
}

// departmentDefaultCapabilities is step 3 for one department name: the first (longest)
// fragment the lowered name contains wins. `ok=false` means no fragment matched, which
// the caller must not read as "no department".
func departmentDefaultCapabilities(name string) (capabilitySet, bool) {
	lowered := strings.ToLower(name)
	for _, entry := range workbenchDepartmentDefaults {
		if strings.Contains(lowered, entry.fragment) {
			return newCapabilitySet(entry.capabilities...), true
		}
	}
	return nil, false
}

// filterKnownCapabilities drops strings this server does not know, and de-duplicates.
// Storing the unknown ones would make a downgrade silently grant nothing; storing only
// known ones keeps the template readable.
func filterKnownCapabilities(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if !newCapabilitySet(workbenchCapabilityCatalog...).has(trimmed) {
			continue
		}
		if _, duplicate := seen[trimmed]; duplicate {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

// ---- resolution ------------------------------------------------------------

// workbenchCapabilityFacts is everything 搂24.2 needs once the database has answered.
// It exists so the resolution order can be tested as a pure function: the queries live in
// collectWorkbenchCapabilityFacts, the decision lives in resolveWorkbenchCapabilities.
type workbenchCapabilityFacts struct {
	// Role is `member.role`, the platform primitive. owner/admin short-circuit the rest.
	Role string
	// HasTemplate reports whether the job title resolved a role template.
	HasTemplate bool
	// TemplateCapabilities is that template's set. A template saved with no capabilities
	// still wins over the department default, which is why HasTemplate is separate.
	TemplateCapabilities []string
	// HasDepartment reports whether `member.department_id` is set, even when the row
	// could not be read. A set-but-unreadable department is unknown, never "no
	// department": a failed lookup must not widen rights.
	HasDepartment bool
	// DepartmentName is the name of the row `department_id` points at, or nil when it
	// could not be read. Only meaningful together with HasDepartment.
	DepartmentName *string
}

// resolveWorkbenchCapabilities is 搂24.2 as a pure function, so the order and every
// terminal set are pinned by tests without a database: role 鈫?template 鈫?department
// default 鈫?read-only floor. The returned string is the `source` wire value.
//
// The one decision worth reading twice is the read-only floor versus the legacy
// fallback: only a member with NO department gets fallbackCapabilities. A member whose
// department exists but whose name matched nothing gets unknownDepartmentCapabilities,
// because "the department's name is unfamiliar" is not evidence of permission.
func resolveWorkbenchCapabilities(facts workbenchCapabilityFacts) (capabilitySet, string) {
	if facts.Role == "owner" || facts.Role == "admin" {
		return newCapabilitySet(workbenchCapabilityCatalog...), capabilitySourceRole
	}
	if facts.HasTemplate {
		return newCapabilitySet(facts.TemplateCapabilities...), capabilitySourceTemplate
	}
	if facts.HasDepartment {
		if facts.DepartmentName != nil {
			if defaults, ok := departmentDefaultCapabilities(*facts.DepartmentName); ok {
				return defaults, capabilitySourceDepartment
			}
		}
		return unknownDepartmentCapabilities(), capabilitySourceDepartmentUnknown
	}
	return fallbackCapabilities(), capabilitySourceFallback
}

// collectWorkbenchCapabilityFacts reads the two rows steps 2 and 3 need: the member's
// live HR profile (for the job title) and the department row. Every failure mode leaves
// the corresponding fact unset, and the resolver decides what that means 鈥?the queries
// never pick a capability set themselves.
func (h *Handler) collectWorkbenchCapabilityFacts(ctx context.Context, scope workbenchScope) workbenchCapabilityFacts {
	facts := workbenchCapabilityFacts{
		Role:          scope.Member.Role,
		HasDepartment: scope.Member.DepartmentID.Valid,
	}

	// Step 2 input: the job title's template. A member with no HR profile has no title,
	// so an HR profile is not a prerequisite for using the workbench.
	if profile, err := h.Queries.GetHrEmployeeProfileByMember(ctx, db.GetHrEmployeeProfileByMemberParams{
		WorkspaceID: scope.WorkspaceUUID,
		MemberID:    scope.Member.UserID,
	}); err == nil && !profile.ArchivedAt.Valid && profile.JobTitle.Valid {
		title := strings.TrimSpace(profile.JobTitle.String)
		if title != "" {
			if template, err := h.Queries.GetWorkbenchRoleTemplateByJobTitle(ctx, db.GetWorkbenchRoleTemplateByJobTitleParams{
				WorkspaceID: scope.WorkspaceUUID,
				JobTitle:    title,
			}); err == nil {
				facts.HasTemplate = true
				facts.TemplateCapabilities = template.Capabilities
			}
		}
	}

	// Step 3 input: the department's name.
	if scope.Member.DepartmentID.Valid {
		if department, err := h.Queries.GetDepartment(ctx, db.GetDepartmentParams{
			ID:          scope.Member.DepartmentID,
			WorkspaceID: scope.WorkspaceUUID,
		}); err == nil {
			name := department.Name
			facts.DepartmentName = &name
		}
	}

	return facts
}

// workbenchCapabilities resolves 搂scope's capabilities. The order is the contract:
// role 鈫?job-title template 鈫?department default 鈫?read-only fallback.
func (h *Handler) workbenchCapabilities(ctx context.Context, scope workbenchScope) capabilitySet {
	capabilities, _ := h.workbenchCapabilitiesWithSource(ctx, scope)
	return capabilities
}

// requireWorkbenchCapability gates one handler on one capability and writes the 403
// itself. The response body carries `{capability}` (搂24.3) so the client can hide the
// entry point rather than render an error it cannot act on.
func (h *Handler) requireWorkbenchCapability(w http.ResponseWriter, r *http.Request, scope workbenchScope, capability string) bool {
	if h.workbenchCapabilities(r.Context(), scope).has(capability) {
		return true
	}
	writeCapabilityError(w, capability)
	return false
}

// writeCapabilityError is the one place the 403 body is shaped.
// writeRoleRequiredError is the 403 for routes gated on workspace role rather than
// on a capability. Naming an unrelated capability in `capability` would make a
// client that hides entries per capability draw the wrong conclusion.
func writeRoleRequiredError(w http.ResponseWriter) {
	writeJSON(w, http.StatusForbidden, map[string]any{
		"error": "forbidden_role",
		"role":  "owner",
	})
}
func writeCapabilityError(w http.ResponseWriter, capability string) {
	writeJSON(w, http.StatusForbidden, map[string]any{
		"error":      "forbidden_capability",
		"capability": capability,
	})
}

// ---- department visibility -------------------------------------------------

// workbenchVisibilitySetting is `workspace.settings.workbench_visibility` (搂24.4).
type workbenchVisibilitySetting string

const (
	workbenchVisibilityTransparent workbenchVisibilitySetting = "transparent"
	workbenchVisibilityDepartment  workbenchVisibilitySetting = "department"
)

// workbenchVisibility reads the switch once per request scope. Anything unparseable
// (older rows, a typo written by hand) is `transparent`: the default must be the
// behaviour that existed before the switch, or a bad value would hide data.
func (h *Handler) workbenchVisibility(ctx context.Context, scope workbenchScope) workbenchVisibilitySetting {
	workspace, err := h.Queries.GetWorkspace(ctx, scope.WorkspaceUUID)
	if err != nil || len(workspace.Settings) == 0 {
		return workbenchVisibilityTransparent
	}
	var settings struct {
		Visibility string `json:"workbench_visibility"`
	}
	if err := json.Unmarshal(workspace.Settings, &settings); err != nil {
		return workbenchVisibilityTransparent
	}
	if strings.EqualFold(strings.TrimSpace(settings.Visibility), string(workbenchVisibilityDepartment)) {
		return workbenchVisibilityDepartment
	}
	return workbenchVisibilityTransparent
}

// workbenchReadDepartment is the department a *read* list is narrowed to, or an
// invalid UUID when reads stay workspace-wide:
//
//   - `transparent` (the default) 鈫?workspace-wide, exactly as before 搂24.4;
//   - `department` 鈫?the caller's own department;
//   - `department` with a caller who has no department 鈫?nothing at all. "Unknown
//     department" must never widen into "every department", which is the same
//     fail-closed rule the department aggregate filter follows.
//
// Writes are not narrowed by this: 搂24.4 says the switch affects reads only.
func (h *Handler) workbenchReadDepartment(ctx context.Context, scope workbenchScope) (filter pgtype.UUID, visible bool) {
	if h.workbenchVisibility(ctx, scope) != workbenchVisibilityDepartment {
		return pgtype.UUID{}, true
	}
	if !scope.Member.DepartmentID.Valid {
		// A caller with no department sees nothing in department mode; an unknown
		// department must never widen into "every department".
		return pgtype.UUID{}, false
	}
	return scope.Member.DepartmentID, true
}

// workbenchCrossDepartment reports whether a write would cross a department boundary
// while the workspace is in `department` mode. It is the write-side half of 搂24.4:
// a member may not change a row owned by someone in another department, and a member
// with no department may not change rows that belong to one.
func (h *Handler) workbenchCrossDepartment(ctx context.Context, scope workbenchScope, ownerMemberID pgtype.UUID) bool {
	if h.workbenchVisibility(ctx, scope) != workbenchVisibilityDepartment {
		return false
	}
	if scope.Member.Role == "owner" || scope.Member.Role == "admin" {
		return false
	}
	if !ownerMemberID.Valid {
		return false // a row with no owner belongs to nobody's department
	}
	if !scope.Member.DepartmentID.Valid {
		return true
	}
	owner := scope.Member
	_ = owner
	var sameDepartment bool
	if err := h.DB.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM member m
			WHERE m.workspace_id = $1 AND m.user_id = $2 AND m.department_id = $3
		)`, scope.WorkspaceUUID, ownerMemberID, scope.Member.DepartmentID).Scan(&sameDepartment); err != nil {
		return true // fail closed: a query error must not open the boundary
	}
	return !sameDepartment
}

// workbenchCrossDepartmentGate is `workbenchCrossDepartment` as a handler gate: it
// writes the 403 itself and returns false when the write must stop. Used by the
// loaders that resolve a row for writing, so the check runs on the row's real owner
// rather than on whatever the request body claimed.
func (h *Handler) workbenchCrossDepartmentGate(w http.ResponseWriter, r *http.Request, scope workbenchScope, ownerMemberID pgtype.UUID) bool {
	if !h.workbenchCrossDepartment(r.Context(), scope, ownerMemberID) {
		return true
	}
	writeError(w, http.StatusForbidden, "cross_department")
	return false
}

// ---- role templates: API ---------------------------------------------------

// WorkbenchRoleTemplateResponse is one job title's capability set.
type WorkbenchRoleTemplateResponse struct {
	ID           string   `json:"id"`
	WorkspaceID  string   `json:"workspace_id"`
	JobTitle     string   `json:"job_title"`
	Capabilities []string `json:"capabilities"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
}

func roleTemplateToResponse(row db.WorkbenchRoleTemplate) WorkbenchRoleTemplateResponse {
	return WorkbenchRoleTemplateResponse{
		ID:           uuidToString(row.ID),
		WorkspaceID:  uuidToString(row.WorkspaceID),
		JobTitle:     row.JobTitle,
		Capabilities: row.Capabilities,
		CreatedAt:    timestampToString(row.CreatedAt),
		UpdatedAt:    timestampToString(row.UpdatedAt),
	}
}

// WorkbenchCapabilitiesResponse is `GET /api/workbench/capabilities` 鈥?what the caller
// may do, so the client can hide entries instead of showing a 403.
type WorkbenchCapabilitiesResponse struct {
	Capabilities []string `json:"capabilities"`
	// Source names which resolution step answered: `role`, `template`, `department`,
	// `department_unknown` or `fallback`. It is diagnostic, and it is what makes "why
	// can't I edit this" answerable from the browser. `department_unknown` is the one
	// value this server added to the original four; the client parses `source` as a
	// plain string, so an older client reads it as "not a step I know".
	Source string `json:"source"`
	Role   string `json:"role"`
	// Visibility is the workspace's read scope (搂24.4), so a page can say
	// "you are seeing your department" without a second request.
	Visibility string `json:"visibility"`
}

// GetWorkbenchCapabilities 鈥?GET /api/workbench/capabilities
func (h *Handler) GetWorkbenchCapabilities(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	capabilities, source := h.workbenchCapabilitiesWithSource(r.Context(), scope)
	writeJSON(w, http.StatusOK, WorkbenchCapabilitiesResponse{
		Capabilities: capabilities.list(),
		Source:       source,
		Role:         scope.Member.Role,
		Visibility:   string(h.workbenchVisibility(r.Context(), scope)),
	})
}

// workbenchCapabilitiesWithSource is `workbenchCapabilities` plus the step name, for
// the diagnostic surface. Both entry points run the same resolver so the diagnostic
// response and the enforcement path cannot drift apart.
func (h *Handler) workbenchCapabilitiesWithSource(ctx context.Context, scope workbenchScope) (capabilitySet, string) {
	// Step 1 needs no queries at all.
	if scope.Member.Role == "owner" || scope.Member.Role == "admin" {
		return resolveWorkbenchCapabilities(workbenchCapabilityFacts{Role: scope.Member.Role})
	}
	return resolveWorkbenchCapabilities(h.collectWorkbenchCapabilityFacts(ctx, scope))
}

// ListWorkbenchRoleTemplates 鈥?GET /api/workbench/role-templates
func (h *Handler) ListWorkbenchRoleTemplates(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	rows, err := h.Queries.ListWorkbenchRoleTemplates(r.Context(), scope.WorkspaceUUID)
	if err != nil {
		workbenchInternalError(w, r, "failed to list role templates", err)
		return
	}
	templates := make([]WorkbenchRoleTemplateResponse, len(rows))
	for i, row := range rows {
		templates[i] = roleTemplateToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"templates": templates, "total": len(templates)})
}

// WorkbenchRoleTemplateRequest is the PUT body: the whole capability set, replacing
// whatever the title had. A partial "add one capability" endpoint would need a
// reconciling client and can wait.
type WorkbenchRoleTemplateRequest struct {
	Capabilities []string `json:"capabilities"`
}

// PutWorkbenchRoleTemplate 鈥?PUT /api/workbench/role-templates/{jobTitle}
//
// Owner/admin only: handing out capabilities is the one write that can widen everyone
// else's. The job title is the URL segment (URL-decoded by chi), matched
// case-insensitively like the unique index.
func (h *Handler) PutWorkbenchRoleTemplate(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if scope.Member.Role != "owner" && scope.Member.Role != "admin" {
		writeRoleRequiredError(w)
		return
	}
	jobTitle := strings.TrimSpace(chi.URLParam(r, "jobTitle"))
	if jobTitle == "" {
		writeError(w, http.StatusBadRequest, "job title is required")
		return
	}
	var req WorkbenchRoleTemplateRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	capabilities := filterKnownCapabilities(req.Capabilities)
	row, err := h.Queries.UpsertWorkbenchRoleTemplate(r.Context(), db.UpsertWorkbenchRoleTemplateParams{
		WorkspaceID:  scope.WorkspaceUUID,
		JobTitle:     jobTitle,
		Capabilities: capabilities,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to save the role template", err)
		return
	}
	writeJSON(w, http.StatusOK, roleTemplateToResponse(row))
}

// DeleteWorkbenchRoleTemplate 鈥?DELETE /api/workbench/role-templates/{jobTitle}
// Removing a template sends its holders back to the next resolution step rather than
// leaving them with whatever the template last granted.
func (h *Handler) DeleteWorkbenchRoleTemplate(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if scope.Member.Role != "owner" && scope.Member.Role != "admin" {
		writeRoleRequiredError(w)
		return
	}
	jobTitle := strings.TrimSpace(chi.URLParam(r, "jobTitle"))
	if jobTitle == "" {
		writeError(w, http.StatusBadRequest, "job title is required")
		return
	}
	deleted, err := h.Queries.ArchiveWorkbenchRoleTemplate(r.Context(), db.ArchiveWorkbenchRoleTemplateParams{
		WorkspaceID: scope.WorkspaceUUID,
		JobTitle:    jobTitle,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete the role template", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "role template not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

package handler

// HR document generation: templates and generated files
// (docs/engineering/WORKBENCH-API.md section 18).
//
// The customer confirmed that stamping stays offline: this system generates the
// file, somebody downloads it, prints it and stamps it by hand. So the write path
// here ends at "bytes in storage plus a row in the ledger", and the read paths are
// the ones a page needs:
//
//	hr_doc_template   (the body, with {{placeholder}} slots)
//	      ↓ POST /hr/employees/{id}/documents   {template_id, format, values?}
//	hr_doc_generation (what was produced for whom, from which template, with what values)
//	      ↓ attachment_id
//	attachment        (the .docx or .pdf itself)
//
// Three rules this file encodes:
//
//   - **The values are filled from the employee's file, and a caller may override
//     any of them.** A certificate is about one person, so `values` being absent
//     must still produce a complete document: the name, department, title, hire
//     date, leave date, company name and today come from the profile, the
//     department row, the workspace and the clock. An explicit value in the body
//     wins, which is how a one-off wording ("借调至客户现场") is possible without
//     editing the person's file.
//   - **An unknown placeholder stays in the file.** `docgen.Render` returns it
//     verbatim and reports a warning; those warnings are returned to the caller and
//     logged, because a typo must be visible before the page is stamped.
//   - **A generation is a snapshot.** `template_name` and `values` are copied into
//     the ledger, so a document issued today keeps saying what it said after the
//     template is reworded or the person is promoted.
//
// Permissions follow the rest of the workbench with one deliberate tightening:
// reads are member-wide, but **template writes and generation are owner/admin
// only** -- a generated certificate goes into the person's file, and the body that
// produces it is a company artefact.

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
	"github.com/jerry-halo2026/morchat.co/server/pkg/docgen"
)

// Document formats the generator can produce. `pdf` is a real PDF (see
// server/pkg/docgen/pdf.go for the CJK decision), not a renamed docx.
const (
	hrDocFormatDocx = "docx"
	hrDocFormatPDF  = "pdf"
)

// Content types and file extensions per format.
var hrDocFormats = map[string]struct {
	extension   string
	contentType string
}{
	hrDocFormatDocx: {
		extension:   "docx",
		contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	},
	hrDocFormatPDF: {extension: "pdf", contentType: "application/pdf"},
}

// hrDocTemplateEditable is the PATCH allow-list. `builtin` is absent: a seeded row
// is read-only (the list handler re-seeds it on every read, so an edit would be a
// lie about what the server will hand out).
var hrDocTemplateEditable = map[string]bool{
	"name": true, "kind": true, "body": true, "owner_member_id": true,
}

// ---- request bodies --------------------------------------------------------

// HrDocTemplateRequest is the create body. `name`, `kind` and `body` are required;
// `name` must be unique among the workspace's live templates (409).
//
// There is no `builtin` field: only the server seeds builtin rows.
type HrDocTemplateRequest struct {
	Name          *string `json:"name"`
	Kind          *string `json:"kind"`
	Body          *string `json:"body"`
	OwnerMemberID *string `json:"owner_member_id"`
}

// HrDocDocumentRequest is the generation body. `values` overlays the employee-file
// defaults; every key it names replaces the automatic value, including with "".
type HrDocDocumentRequest struct {
	TemplateID *string           `json:"template_id"`
	Format     *string           `json:"format"`
	Values     map[string]string `json:"values"`
}

// ---- responses -------------------------------------------------------------

// HrDocTemplateResponse is one template. `placeholders` is derived from `body` and
// is what a client renders the values form from -- it saves the client parsing the
// body grammar itself.
type HrDocTemplateResponse struct {
	ID            string   `json:"id"`
	WorkspaceID   string   `json:"workspace_id"`
	Name          string   `json:"name"`
	Kind          string   `json:"kind"`
	Body          string   `json:"body"`
	Builtin       bool     `json:"builtin"`
	Placeholders  []string `json:"placeholders"`
	OwnerMemberID *string  `json:"owner_member_id"`
	CreatedBy     *string  `json:"created_by"`
	CreatedAt     string   `json:"created_at"`
	UpdatedAt     string   `json:"updated_at"`
	ArchivedAt    *string  `json:"archived_at"`
}

func hrDocTemplateToResponse(t db.HrDocTemplate) HrDocTemplateResponse {
	return HrDocTemplateResponse{
		ID:            uuidToString(t.ID),
		WorkspaceID:   uuidToString(t.WorkspaceID),
		Name:          t.Name,
		Kind:          t.Kind,
		Body:          t.Body,
		Builtin:       t.Builtin,
		Placeholders:  docgen.Placeholders(t.Body),
		OwnerMemberID: uuidToPtr(t.OwnerMemberID),
		CreatedBy:     uuidToPtr(t.CreatedBy),
		CreatedAt:     timestampToString(t.CreatedAt),
		UpdatedAt:     timestampToString(t.UpdatedAt),
		ArchivedAt:    timestampToPtr(t.ArchivedAt),
	}
}

// HrDocGenerationResponse is one generated document: the ledger row plus the two
// attachment fields a download needs. `url` is the durable storage URL and may be
// empty when the attachment has been deleted; `values` is the snapshot the file was
// rendered with.
type HrDocGenerationResponse struct {
	ID           string            `json:"id"`
	WorkspaceID  string            `json:"workspace_id"`
	EmployeeID   string            `json:"employee_id"`
	TemplateID   *string           `json:"template_id"`
	TemplateName string            `json:"template_name"`
	Format       string            `json:"format"`
	AttachmentID *string           `json:"attachment_id"`
	URL          string            `json:"url"`
	Filename     string            `json:"filename"`
	Values       map[string]string `json:"values"`
	GeneratedBy  *string           `json:"generated_by"`
	CreatedAt    string            `json:"created_at"`
}

func hrDocGenerationToResponse(g db.HrDocGeneration, url, filename string) HrDocGenerationResponse {
	return HrDocGenerationResponse{
		ID:           uuidToString(g.ID),
		WorkspaceID:  uuidToString(g.WorkspaceID),
		EmployeeID:   uuidToString(g.EmployeeID),
		TemplateID:   uuidToPtr(g.TemplateID),
		TemplateName: g.TemplateName,
		Format:       g.Format,
		AttachmentID: uuidToPtr(g.AttachmentID),
		URL:          url,
		Filename:     filename,
		Values:       hrDocValuesFromColumn(g.Values),
		GeneratedBy:  uuidToPtr(g.GeneratedBy),
		CreatedAt:    timestampToString(g.CreatedAt),
	}
}

// hrDocValuesFromColumn decodes the stored JSONB snapshot. A malformed column is an
// empty snapshot rather than a 500: the row still answers "what, for whom, when",
// which is the part the ledger exists for.
func hrDocValuesFromColumn(raw []byte) map[string]string {
	values := map[string]string{}
	if len(raw) == 0 {
		return values
	}
	if err := json.Unmarshal(raw, &values); err != nil {
		slog.Warn("hr doc generation: unreadable values snapshot", "error", err)
		return map[string]string{}
	}
	return values
}

// ---- validation ------------------------------------------------------------

// hrDocTemplateName validates the required, unique-per-workspace name.
func hrDocTemplateName(w http.ResponseWriter, raw *string) (string, bool) {
	name := strings.TrimSpace(valueOrEmpty(raw))
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return "", false
	}
	return name, true
}

// hrDocTemplateKind validates the closed enum. It is the list's filter, so an
// unknown value is a 400 rather than a row no filter can reach.
func hrDocTemplateKind(w http.ResponseWriter, raw *string) (string, bool) {
	kind := strings.TrimSpace(valueOrEmpty(raw))
	if kind == "" {
		writeError(w, http.StatusBadRequest,
			"kind is required: employment, resignation, contract, offer or other")
		return "", false
	}
	if !docgen.ValidKind(kind) {
		writeError(w, http.StatusBadRequest,
			"kind must be employment, resignation, contract, offer or other")
		return "", false
	}
	return kind, true
}

// hrDocTemplateBody validates the required body. A template with no text generates
// a blank page somebody then stamps, so it is refused.
func hrDocTemplateBody(w http.ResponseWriter, raw *string) (string, bool) {
	body := valueOrEmpty(raw)
	if strings.TrimSpace(body) == "" {
		writeError(w, http.StatusBadRequest, "body is required")
		return "", false
	}
	return body, true
}

// ---- loaders ---------------------------------------------------------------

// loadHrDocTemplate resolves {templateId} inside the workspace.
func (h *Handler) loadHrDocTemplate(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrDocTemplate, bool) {
	templateID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "templateId"), "template id")
	if !ok {
		return db.HrDocTemplate{}, false
	}
	template, err := h.Queries.GetHrDocTemplate(r.Context(), db.GetHrDocTemplateParams{
		ID:          templateID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "template not found")
		return db.HrDocTemplate{}, false
	}
	return template, true
}

// loadHrDocEmployee resolves {employeeId} from the path. A document is always about
// one person, so the person is a path parameter, not a body field: a request that
// named the template for employee A while living under employee B has no meaning.
func (h *Handler) loadHrDocEmployee(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrEmployeeProfile, bool) {
	employeeID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "employeeId"), "employee id")
	if !ok {
		return db.HrEmployeeProfile{}, false
	}
	employee, err := h.Queries.GetHrEmployeeProfile(r.Context(), db.GetHrEmployeeProfileParams{
		ID:          employeeID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "employee not found")
		return db.HrEmployeeProfile{}, false
	}
	return employee, true
}

// requireHrDocWriter is the write gate for templates and generation: owner/admin
// only. Unlike the rest of the workbench, ownership does not widen it -- a
// certificate body and the file filed into somebody's record are company-level.
func requireHrDocWriter(w http.ResponseWriter, scope workbenchScope, message string) bool {
	if roleAllowed(scope.Member.Role, "owner", "admin") {
		return true
	}
	writeError(w, http.StatusForbidden, message)
	return false
}

// hrDocTemplateConflicts answers "name already used" before the insert or update.
// The partial unique index (781) is the race-safe backstop; this read exists so the
// common case answers 409 with a message. `excludeID` lets a rename keep its name.
func (h *Handler) hrDocTemplateConflicts(w http.ResponseWriter, r *http.Request, scope workbenchScope, name string, excludeID pgtype.UUID) bool {
	conflicts, err := h.Queries.CountHrDocTemplateNameConflicts(r.Context(), db.CountHrDocTemplateNameConflictsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Name:        name,
		ExcludeID:   excludeID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to check the template name", err)
		return false
	}
	if conflicts > 0 {
		writeError(w, http.StatusConflict, "a template with this name already exists")
		return false
	}
	return true
}

// ensureBuiltinDocTemplates materialises the three builtin templates for a
// workspace. It runs on every template read and is idempotent (the seed is
// `ON CONFLICT DO NOTHING`), which is what makes "a new workspace has the builtin
// templates" true without a migration that has to know every workspace.
func (h *Handler) ensureBuiltinDocTemplates(w http.ResponseWriter, r *http.Request, scope workbenchScope) bool {
	for _, template := range docgen.Builtin() {
		if err := h.Queries.SeedHrDocTemplate(r.Context(), db.SeedHrDocTemplateParams{
			WorkspaceID: scope.WorkspaceUUID,
			Name:        template.Name,
			Kind:        template.Kind,
			Body:        template.Body,
		}); err != nil {
			workbenchInternalError(w, r, "failed to prepare the builtin templates", err)
			return false
		}
	}
	return true
}

// ---- templates -------------------------------------------------------------

// ListHrDocTemplates — GET /api/workbench/hr/doc-templates
//
// The workspace's templates, builtin first. `?kind=` narrows to one document type.
// The read seeds the builtin rows, so a workspace created a minute ago answers with
// the same three templates an old one has.
func (h *Handler) ListHrDocTemplates(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	if kind != "" && !docgen.ValidKind(kind) {
		writeError(w, http.StatusBadRequest,
			"kind must be employment, resignation, contract, offer or other")
		return
	}
	if !h.ensureBuiltinDocTemplates(w, r, scope) {
		return
	}
	rows, err := h.Queries.ListHrDocTemplates(r.Context(), db.ListHrDocTemplatesParams{
		WorkspaceID: scope.WorkspaceUUID,
		Kind:        optionalTrimmedText(stringPtr(kind)),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list doc templates", err)
		return
	}
	resp := make([]HrDocTemplateResponse, len(rows))
	for i, row := range rows {
		resp[i] = hrDocTemplateToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"templates": resp, "total": len(resp)})
}

// CreateHrDocTemplate — POST /api/workbench/hr/doc-templates (owner/admin)
func (h *Handler) CreateHrDocTemplate(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !requireHrDocWriter(w, scope, "only an owner or admin can create doc templates") {
		return
	}
	var req HrDocTemplateRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	name, ok := hrDocTemplateName(w, req.Name)
	if !ok {
		return
	}
	kind, ok := hrDocTemplateKind(w, req.Kind)
	if !ok {
		return
	}
	body, ok := hrDocTemplateBody(w, req.Body)
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	if !h.hrDocTemplateConflicts(w, r, scope, name, pgtype.UUID{}) {
		return
	}

	created, err := h.Queries.CreateHrDocTemplate(r.Context(), db.CreateHrDocTemplateParams{
		WorkspaceID:   scope.WorkspaceUUID,
		Name:          name,
		Kind:          kind,
		Body:          body,
		OwnerMemberID: owner,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a template with this name already exists")
			return
		}
		workbenchInternalError(w, r, "failed to create the doc template", err)
		return
	}
	writeJSON(w, http.StatusCreated, hrDocTemplateToResponse(created))
}

// UpdateHrDocTemplate — PATCH /api/workbench/hr/doc-templates/{templateId}
// (owner/admin)
//
// `name` / `kind` / `body` / `owner_member_id`, decoded as a key set so an absent
// field keeps its stored value. A builtin template is a 400: the server re-seeds it
// on every read, so editing it would not survive, and a client that wants different
// wording copies the body into its own row.
func (h *Handler) UpdateHrDocTemplate(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !requireHrDocWriter(w, scope, "only an owner or admin can change doc templates") {
		return
	}
	current, ok := h.loadHrDocTemplate(w, r, scope)
	if !ok {
		return
	}
	if current.Builtin {
		writeError(w, http.StatusBadRequest,
			"builtin templates cannot be edited: create your own template with this body to change the wording")
		return
	}
	var body map[string]json.RawMessage
	if !decodeWorkbenchBody(w, r, &body) {
		return
	}
	for field := range body {
		if !hrDocTemplateEditable[field] {
			writeError(w, http.StatusBadRequest, "unknown field "+field)
			return
		}
	}

	name, kind, text := current.Name, current.Kind, current.Body
	owner := current.OwnerMemberID

	if raw, sent := body["name"]; sent {
		var value *string
		if err := json.Unmarshal(raw, &value); err != nil {
			writeError(w, http.StatusBadRequest, "name must be a string")
			return
		}
		if name, ok = hrDocTemplateName(w, value); !ok {
			return
		}
	}
	if raw, sent := body["kind"]; sent {
		var value *string
		if err := json.Unmarshal(raw, &value); err != nil {
			writeError(w, http.StatusBadRequest, "kind must be a string")
			return
		}
		if kind, ok = hrDocTemplateKind(w, value); !ok {
			return
		}
	}
	if raw, sent := body["body"]; sent {
		var value *string
		if err := json.Unmarshal(raw, &value); err != nil {
			writeError(w, http.StatusBadRequest, "body must be a string")
			return
		}
		if text, ok = hrDocTemplateBody(w, value); !ok {
			return
		}
	}
	if raw, sent := body["owner_member_id"]; sent {
		var value *string
		if err := json.Unmarshal(raw, &value); err != nil {
			writeError(w, http.StatusBadRequest, "owner_member_id must be a string or null")
			return
		}
		requested, ok := workbenchOptionalUUID(w, value, "owner_member_id")
		if !ok {
			return
		}
		if owner, ok = h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requested); !ok {
			return
		}
	}

	if name != current.Name && !h.hrDocTemplateConflicts(w, r, scope, name, current.ID) {
		return
	}

	updated, err := h.Queries.UpdateHrDocTemplate(r.Context(), db.UpdateHrDocTemplateParams{
		Name:          name,
		Kind:          kind,
		Body:          text,
		OwnerMemberID: owner,
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a template with this name already exists")
			return
		}
		workbenchInternalError(w, r, "failed to update the doc template", err)
		return
	}
	writeJSON(w, http.StatusOK, hrDocTemplateToResponse(updated))
}

// DeleteHrDocTemplate — DELETE /api/workbench/hr/doc-templates/{templateId}
// (owner/admin)
//
// Soft delete, like every other workbench ledger: a template archived by mistake
// stops being offered while the row (and the name it held) stays. A builtin one is
// a 400 for the reason the PATCH gives -- the next read would bring it back.
func (h *Handler) DeleteHrDocTemplate(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !requireHrDocWriter(w, scope, "only an owner or admin can delete doc templates") {
		return
	}
	current, ok := h.loadHrDocTemplate(w, r, scope)
	if !ok {
		return
	}
	if current.Builtin {
		writeError(w, http.StatusBadRequest, "builtin templates cannot be deleted")
		return
	}
	archived, err := h.Queries.ArchiveHrDocTemplate(r.Context(), db.ArchiveHrDocTemplateParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete the doc template", err)
		return
	}
	if archived == 0 {
		writeError(w, http.StatusNotFound, "template not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- generated documents ---------------------------------------------------

// ListHrEmployeeDocuments — GET /api/workbench/hr/employees/{employeeId}/documents
//
// The employee's generated documents, newest first. Reads are member-wide: seeing
// which certificates were issued for a colleague is part of the personnel file.
func (h *Handler) ListHrEmployeeDocuments(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	employee, ok := h.loadHrDocEmployee(w, r, scope)
	if !ok {
		return
	}
	rows, err := h.Queries.ListHrDocGenerations(r.Context(), db.ListHrDocGenerationsParams{
		WorkspaceID: scope.WorkspaceUUID,
		EmployeeID:  employee.ID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list generated documents", err)
		return
	}
	resp := make([]HrDocGenerationResponse, len(rows))
	for i, row := range rows {
		url, filename := "", ""
		if row.AttachmentUrl.Valid {
			url = row.AttachmentUrl.String
		}
		if row.AttachmentFilename.Valid {
			filename = row.AttachmentFilename.String
		}
		resp[i] = hrDocGenerationToResponse(db.HrDocGeneration{
			ID:           row.ID,
			WorkspaceID:  row.WorkspaceID,
			EmployeeID:   row.EmployeeID,
			TemplateID:   row.TemplateID,
			TemplateName: row.TemplateName,
			Format:       row.Format,
			AttachmentID: row.AttachmentID,
			Values:       row.Values,
			GeneratedBy:  row.GeneratedBy,
			CreatedAt:    row.CreatedAt,
		}, url, filename)
	}
	writeJSON(w, http.StatusOK, map[string]any{"documents": resp, "total": len(resp)})
}

// CreateHrEmployeeDocument — POST /api/workbench/hr/employees/{employeeId}/documents
// (owner/admin)
//
// Renders the template with the employee's own values (overlaid by `values`),
// produces the file, stores it as an ordinary attachment and records the
// generation. The response returns the ledger row, the attachment it points at and
// the renderer's warnings; a warning means the file still contains a literal
// `{{...}}` and should be looked at before anybody prints it.
func (h *Handler) CreateHrEmployeeDocument(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !requireHrDocWriter(w, scope,
		"only an owner or admin can generate documents: the result is filed in the employee's record") {
		return
	}
	if h.Storage == nil {
		writeFeatureDisabled(w, "document_generation_not_configured",
			"document generation needs object storage, which is not configured")
		return
	}
	employee, ok := h.loadHrDocEmployee(w, r, scope)
	if !ok {
		return
	}
	var req HrDocDocumentRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	if req.TemplateID == nil || strings.TrimSpace(*req.TemplateID) == "" {
		writeError(w, http.StatusBadRequest, "template_id is required")
		return
	}
	templateID, ok := parseUUIDOrBadRequest(w, strings.TrimSpace(*req.TemplateID), "template_id")
	if !ok {
		return
	}
	template, err := h.Queries.GetHrDocTemplate(r.Context(), db.GetHrDocTemplateParams{
		ID:          templateID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "template not found")
		return
	}

	format := strings.TrimSpace(valueOrEmpty(req.Format))
	spec, known := hrDocFormats[format]
	if !known {
		writeError(w, http.StatusBadRequest, "format must be docx or pdf")
		return
	}

	values, ok := h.hrDocDocumentValues(w, r, scope, employee)
	if !ok {
		return
	}
	for key, value := range req.Values {
		if key == "" {
			continue
		}
		values[key] = value
	}

	rendered := docgen.Render(template.Body, values)
	if rendered.HasWarnings() {
		slog.Warn("hr doc generation: template named placeholders without values",
			"workspace_id", scope.WorkspaceID,
			"template_id", uuidToString(template.ID),
			"employee_id", uuidToString(employee.ID),
			"warnings", rendered.Warnings,
		)
	}

	var data []byte
	switch format {
	case hrDocFormatDocx:
		data, err = docgen.Docx(rendered.Text)
	default:
		data, err = docgen.PDF(rendered.Text)
	}
	if err != nil {
		workbenchInternalError(w, r, "failed to render the document", err)
		return
	}

	id, err := uuid.NewV7()
	if err != nil {
		workbenchInternalError(w, r, "failed to allocate a document id", err)
		return
	}
	filename := hrDocFilename(template.Name, spec.extension)
	key := "workspaces/" + scope.WorkspaceID + "/documents/" + id.String() + "." + spec.extension
	link, err := h.Storage.Upload(r.Context(), key, data, spec.contentType, filename)
	if err != nil {
		slog.Error("hr doc generation: upload failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to store the generated document")
		return
	}

	uploaderType, uploaderID := h.resolveActor(r, uuidToString(scope.Member.UserID), scope.WorkspaceID)
	attachment, err := h.Queries.CreateAttachment(r.Context(), db.CreateAttachmentParams{
		ID:           pgtype.UUID{Bytes: id, Valid: true},
		WorkspaceID:  scope.WorkspaceUUID,
		UploaderType: uploaderType,
		UploaderID:   parseUUID(uploaderID),
		Filename:     filename,
		Url:          link,
		ContentType:  spec.contentType,
		SizeBytes:    int64(len(data)),
	})
	if err != nil {
		// The bytes are already stored; without the row nothing can download them,
		// so the object goes with the failure instead of becoming an orphan.
		h.deleteS3Objects(r.Context(), []string{link})
		workbenchInternalError(w, r, "failed to record the generated document", err)
		return
	}

	snapshot, err := json.Marshal(rendered.Values)
	if err != nil {
		workbenchInternalError(w, r, "failed to record the document values", err)
		return
	}
	generation, err := h.Queries.CreateHrDocGeneration(r.Context(), db.CreateHrDocGenerationParams{
		WorkspaceID:  scope.WorkspaceUUID,
		EmployeeID:   employee.ID,
		TemplateID:   template.ID,
		TemplateName: template.Name,
		Format:       format,
		AttachmentID: attachment.ID,
		Values:       snapshot,
		GeneratedBy:  scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to record the generated document", err)
		return
	}

	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID,
		uuidToString(employee.ID), uuidToString(scope.Member.UserID))

	attachmentResponse := h.attachmentToResponse(attachment.Attachment(), attachmentURLModeFromRequest(r))
	url := attachmentResponse.DownloadURL
	if url == "" {
		url = attachmentResponse.URL
	}
	document := hrDocGenerationToResponse(generation, url, attachmentResponse.Filename)
	writeJSON(w, http.StatusCreated, map[string]any{
		"document": document,
		"warnings": rendered.Warnings,
	})
}

// hrDocFilename is the name the browser saves: the template's name plus the
// format's extension. Path separators are replaced because the name is
// workspace-editable free text and ends up in a filename header.
func hrDocFilename(name, extension string) string {
	cleaned := strings.NewReplacer("/", "-", "\\", "-", "\n", " ", "\r", " ").Replace(strings.TrimSpace(name))
	if cleaned == "" {
		cleaned = "document"
	}
	return cleaned + "." + extension
}

// hrDocDocumentValues fills the placeholders from the employee's own file, which is
// what makes `values` optional in the request.
//
// A missing department is a blank, not a 500 (the column is a soft pointer and the
// department may have been deleted); a missing member or workspace is a 500,
// because those rows are what the request was resolved through.
func (h *Handler) hrDocDocumentValues(w http.ResponseWriter, r *http.Request, scope workbenchScope, employee db.HrEmployeeProfile) (map[string]string, bool) {
	values := map[string]string{
		"员工姓名": "",
		"部门":   "",
		"职位":   strings.TrimSpace(employee.JobTitle.String),
		"入职日期": dateToString(employee.HireDate),
		"离职日期": dateToString(employee.LeaveDate),
		"今天":   dateToString(pgtypeDateToday()),
	}

	// `hr_employee_profile.member_id` holds a *user* id, not `member.id`: it is the
	// value `getWorkspaceMember` accepts and every hire path writes, so the name is
	// one lookup away rather than two.
	user, err := h.Queries.GetUser(r.Context(), employee.MemberID)
	if err != nil {
		workbenchInternalError(w, r, "failed to read the employee's name", err)
		return nil, false
	}
	values["员工姓名"] = strings.TrimSpace(user.Name)
	if employee.DepartmentID.Valid {
		if department, err := h.Queries.GetDepartment(r.Context(), db.GetDepartmentParams{
			ID:          employee.DepartmentID,
			WorkspaceID: scope.WorkspaceUUID,
		}); err == nil {
			values["部门"] = strings.TrimSpace(department.Name)
		}
	}

	workspace, err := h.Queries.GetWorkspace(r.Context(), scope.WorkspaceUUID)
	if err != nil {
		workbenchInternalError(w, r, "failed to read the workspace name", err)
		return nil, false
	}
	values["公司名称"] = strings.TrimSpace(workspace.Name)

	return values, true
}

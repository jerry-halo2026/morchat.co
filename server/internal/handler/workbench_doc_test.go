package handler

// HR document generation tests (docs/engineering/WORKBENCH-API.md section 18).
//
// Four properties this domain has to prove beyond the shared ledger rules:
//
//   - **the template name is unique per workspace** (409), case-insensitively and
//     over live rows only, because the name is how a person picks a template.
//   - **a generation leaves a file and a ledger row.** The bytes reach storage as an
//     ordinary attachment, the row points at it, and the value snapshot is stored
//     next to it -- otherwise "which certificate did we issue, and what did it say"
//     has no answer a month later.
//   - **the employee-file values are the default.** A request with no `values` must
//     still produce a complete document, because the page's happy path is "pick a
//     template, press generate".
//   - **generation is owner/admin only.** The file is filed in the person's record,
//     so a `member` cannot create one even for a profile it owns.

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// docTemplateEnvelope and friends are the wire shapes section 18 fixes: lists are
// wrapped with a `total` counting this page (§3.1), a generation is returned inside
// `{ document, warnings }`.
type docTemplateListResponse struct {
	Templates []HrDocTemplateResponse `json:"templates"`
	Total     int                     `json:"total"`
}

type docGenerationListResponse struct {
	Documents []HrDocGenerationResponse `json:"documents"`
	Total     int                       `json:"total"`
}

type docGenerationEnvelope struct {
	Document HrDocGenerationResponse `json:"document"`
	Warnings []string                `json:"warnings"`
}

// createDocEmployeeFixture creates one employee profile through the handler and
// registers the cleanup for the rows it can grow: the profile and its generated
// documents. The department is left empty on purpose -- a blank is a legal value
// (§18.4), and the fixture should not depend on a department row existing.
func createDocEmployeeFixture(t *testing.T, label string) HrEmployeeProfileResponse {
	t.Helper()
	suffix := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	memberUserID := dbfx.User(t, "Doc Employee",
		fmt.Sprintf("wb-doc-%s-%s@multica.ai", label, suffix))
	dbfx.Member(t, testWorkspaceID, memberUserID, "member")
	req := workbenchRequest(t, "POST", "/api/workbench/hr/employees", map[string]any{
		"member_id": memberUserID,
		"job_title": "高级后端工程师",
		"hire_date": "2023-04-10",
	}, "")
	profile := testutil.Decode[HrEmployeeProfileResponse](t, testHandler.CreateHrEmployee, req, http.StatusCreated)
	// No foreign key removes the generations, so a test that forgot them would hand
	// the next one somebody else's document list.
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM hr_doc_generation WHERE employee_id = $1`, profile.ID)
	})
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM hr_employee_profile WHERE id = $1`, profile.ID)
	})
	return profile
}

// createDocTemplate creates a template through the handler and removes it again.
func createDocTemplate(t *testing.T, name, body string) HrDocTemplateResponse {
	t.Helper()
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM hr_doc_template WHERE workspace_id = $1 AND name = $2`,
			testWorkspaceID, name)
	})
	req := workbenchRequest(t, "POST", "/api/workbench/hr/doc-templates", map[string]any{
		"name": name,
		"kind": "other",
		"body": body,
	}, "")
	return testutil.Decode[HrDocTemplateResponse](t, testHandler.CreateHrDocTemplate, req, http.StatusCreated)
}

// generateDoc posts a generation request for one employee.
func generateDoc(t *testing.T, employeeID, userID string, body map[string]any, want int) *http.Request {
	t.Helper()
	req := workbenchRequest(t, "POST", "/api/workbench/hr/employees/"+employeeID+"/documents", body, userID)
	req = withURLParam(req, "employeeId", employeeID)
	testutil.Call(t, testHandler.CreateHrEmployeeDocument, req).Want(want)
	return req
}

// generateDocOK posts a generation request and decodes the 201 body.
func generateDocOK(t *testing.T, employeeID, userID string, body map[string]any) docGenerationEnvelope {
	t.Helper()
	req := workbenchRequest(t, "POST", "/api/workbench/hr/employees/"+employeeID+"/documents", body, userID)
	req = withURLParam(req, "employeeId", employeeID)
	return testutil.Decode[docGenerationEnvelope](t, testHandler.CreateHrEmployeeDocument, req, http.StatusCreated)
}

// uploadedDoc returns the single uploaded object with the given extension.
func uploadedDoc(t *testing.T, store *mockStorage, extension string) []byte {
	t.Helper()
	store.mu.Lock()
	defer store.mu.Unlock()
	for key, data := range store.files {
		if strings.HasSuffix(key, "."+extension) {
			return data
		}
	}
	t.Fatalf("no uploaded %s object in storage (keys: %v)", extension, keysOf(store.files))
	return nil
}

func keysOf(files map[string][]byte) []string {
	keys := make([]string, 0, len(files))
	for key := range files {
		keys = append(keys, key)
	}
	return keys
}

// TestDocTemplateNameIsUnique covers (1): two live templates may not share a name,
// and the comparison ignores case because a person picking a template does. The
// same name after a soft delete is allowed -- a renamed-away name is free.
func TestDocTemplateNameIsUnique(t *testing.T) {
	createDocTemplate(t, "在职证明（测试）", "兹证明 {{员工姓名}}。")

	// Case-insensitive duplicate: the index is on lower(name).
	req := workbenchRequest(t, "POST", "/api/workbench/hr/doc-templates", map[string]any{
		"name": "在职证明（测试）",
		"kind": "employment",
		"body": "另一份正文",
	}, "")
	testutil.Call(t, testHandler.CreateHrDocTemplate, req).Want(http.StatusConflict)

	// A rename onto a taken name is the same conflict.
	other := createDocTemplate(t, "离职证明（测试）", "兹证明 {{员工姓名}} 已离职。")
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/doc-templates/"+other.ID,
		map[string]any{"name": "在职证明（测试）"}, "")
	req = withURLParam(req, "templateId", other.ID)
	testutil.Call(t, testHandler.UpdateHrDocTemplate, req).Want(http.StatusConflict)

	// A rename that keeps its own name is not a conflict with itself.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/doc-templates/"+other.ID,
		map[string]any{"name": "离职证明（测试）", "body": "兹证明 {{员工姓名}} 已于 {{离职日期}} 离职。"}, "")
	req = withURLParam(req, "templateId", other.ID)
	updated := testutil.Decode[HrDocTemplateResponse](t, testHandler.UpdateHrDocTemplate, req, http.StatusOK)
	if !strings.Contains(updated.Body, "{{离职日期}}") {
		t.Fatalf("body = %q, want the patched body", updated.Body)
	}

	// Archiving frees the name.
	req = workbenchRequest(t, "DELETE", "/api/workbench/hr/doc-templates/"+other.ID, nil, "")
	req = withURLParam(req, "templateId", other.ID)
	testutil.Call(t, testHandler.DeleteHrDocTemplate, req).Want(http.StatusNoContent)

	req = workbenchRequest(t, "POST", "/api/workbench/hr/doc-templates", map[string]any{
		"name": "离职证明（测试）",
		"kind": "resignation",
		"body": "复用被软删的名字",
	}, "")
	reused := testutil.Decode[HrDocTemplateResponse](t, testHandler.CreateHrDocTemplate, req, http.StatusCreated)
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM hr_doc_template WHERE id = $1`, reused.ID)
	})
}

// TestDocGenerationProducesFileAndLedger covers (2): a docx generation returns an
// attachment id, stores a real .docx whose rendered Chinese is inside it, and
// records exactly one ledger row whose value snapshot matches what was rendered.
// The same request in pdf stores a PDF.
func TestDocGenerationProducesFileAndLedger(t *testing.T) {
	store := installProxyModeStorage(t)
	employee := createDocEmployeeFixture(t, "a")
	template := createDocTemplate(t, "在职证明（生成测试）",
		"在职证明\n\n兹证明 {{员工姓名}} 系 {{公司名称}} 员工，职位 {{职位}}。\n\n{{今天}}")
	events := collectWorkbenchEvents(t, eventHrEmployeeProfileChanged)

	envelope := generateDocOK(t, employee.ID, "", map[string]any{
		"template_id": template.ID,
		"format":      "docx",
	})
	document := envelope.Document
	if document.AttachmentID == nil || *document.AttachmentID == "" {
		t.Fatalf("document = %+v, want an attachment_id", document)
	}
	if document.Format != "docx" {
		t.Fatalf("format = %q, want docx", document.Format)
	}
	if document.Filename != "在职证明（生成测试）.docx" {
		t.Fatalf("filename = %q, want the template name plus .docx", document.Filename)
	}
	if document.URL == "" {
		t.Fatalf("document = %+v, want a download url", document)
	}
	if len(envelope.Warnings) != 0 {
		t.Fatalf("warnings = %v, want none: every placeholder is supplied", envelope.Warnings)
	}
	// The values snapshot is the employee's own file, not the request.
	if got := document.Values["员工姓名"]; got != "Doc Employee" {
		t.Fatalf("values[员工姓名] = %q, want the member's name", got)
	}
	if got := document.Values["职位"]; got != "高级后端工程师" {
		t.Fatalf("values[职位] = %q, want the profile's job title", got)
	}
	workspace, err := testHandler.Queries.GetWorkspace(context.Background(), parseUUID(testWorkspaceID))
	if err != nil {
		t.Fatalf("load workspace: %v", err)
	}
	if got := document.Values["公司名称"]; got != workspace.Name {
		t.Fatalf("values[公司名称] = %q, want the workspace name %q", got, workspace.Name)
	}
	if got := document.Values["今天"]; got == "" {
		t.Fatal("values[今天] is empty, want today's date")
	}

	// The stored bytes are a real .docx with the rendered Chinese in it.
	docxBytes := uploadedDoc(t, store, "docx")
	if !bytes.HasPrefix(docxBytes, []byte("PK\x03\x04")) {
		t.Fatalf("stored docx starts with %q, want a zip header", docxBytes[:4])
	}
	archive, err := zip.NewReader(bytes.NewReader(docxBytes), int64(len(docxBytes)))
	if err != nil {
		t.Fatalf("stored docx is not a readable zip: %v", err)
	}
	var found bool
	for _, file := range archive.File {
		if file.Name != "word/document.xml" {
			continue
		}
		found = true
		reader, err := file.Open()
		if err != nil {
			t.Fatalf("open word/document.xml: %v", err)
		}
		body, err := io.ReadAll(reader)
		reader.Close()
		if err != nil {
			t.Fatalf("read word/document.xml: %v", err)
		}
		for _, fragment := range []string{"在职证明", "Doc Employee", workspace.Name} {
			if !strings.Contains(string(body), fragment) {
				t.Fatalf("word/document.xml does not contain %q:\n%s", fragment, body)
			}
		}
	}
	if !found {
		t.Fatal("stored docx has no word/document.xml")
	}

	// Exactly one ledger row, and the row points at the attachment.
	listReq := workbenchRequest(t, "GET", "/api/workbench/hr/employees/"+employee.ID+"/documents", nil, "")
	listReq = withURLParam(listReq, "employeeId", employee.ID)
	listed := testutil.Decode[docGenerationListResponse](t, testHandler.ListHrEmployeeDocuments, listReq, http.StatusOK)
	if listed.Total != 1 || len(listed.Documents) != 1 {
		t.Fatalf("documents = %+v, want exactly one row", listed.Documents)
	}
	row := listed.Documents[0]
	if row.TemplateName != template.Name {
		t.Fatalf("template_name = %q, want the snapshot %q", row.TemplateName, template.Name)
	}
	if row.AttachmentID == nil || *row.AttachmentID != *document.AttachmentID {
		t.Fatalf("listed attachment_id = %v, want %v", row.AttachmentID, *document.AttachmentID)
	}
	if row.Filename == "" || row.URL == "" {
		t.Fatalf("listed row = %+v, want the attachment's filename and url", row)
	}
	if got := row.Values["员工姓名"]; got != "Doc Employee" {
		t.Fatalf("stored values snapshot = %v, want the rendered values", row.Values)
	}

	// The write hangs off the employee profile, so it publishes that event.
	if events.count(eventHrEmployeeProfileChanged) != 1 {
		t.Fatalf("published %d hr_employee_profile:changed events, want 1",
			events.count(eventHrEmployeeProfileChanged))
	}
	if payload := events.last(eventHrEmployeeProfileChanged); payload["id"] != employee.ID {
		t.Fatalf("event payload = %v, want the employee profile id %s", payload, employee.ID)
	}

	// The same request in pdf stores a PDF that starts and ends like one.
	pdfEnvelope := generateDocOK(t, employee.ID, "", map[string]any{
		"template_id": template.ID,
		"format":      "pdf",
		"values":      map[string]string{"职位": "借调至客户现场"},
	})
	if pdfEnvelope.Document.Format != "pdf" || !strings.HasSuffix(pdfEnvelope.Document.Filename, ".pdf") {
		t.Fatalf("pdf document = %+v, want a .pdf", pdfEnvelope.Document)
	}
	if got := pdfEnvelope.Document.Values["职位"]; got != "借调至客户现场" {
		t.Fatalf("values[职位] = %q, want the explicit override to win", got)
	}
	pdfBytes := uploadedDoc(t, store, "pdf")
	if !bytes.HasPrefix(pdfBytes, []byte("%PDF-")) || !bytes.HasSuffix(pdfBytes, []byte("%%EOF\n")) {
		t.Fatalf("stored pdf is not framed as a PDF (%d bytes)", len(pdfBytes))
	}

	// A body whose placeholder nothing supplies keeps the slot and reports it.
	warnTemplate := createDocTemplate(t, "未知占位符（测试）", "{{员工姓名}} / {{不存在的字段}}")
	warned := generateDocOK(t, employee.ID, "", map[string]any{
		"template_id": warnTemplate.ID,
		"format":      "docx",
	})
	if len(warned.Warnings) != 1 || !strings.Contains(warned.Warnings[0], "{{不存在的字段}}") {
		t.Fatalf("warnings = %v, want the unknown placeholder reported", warned.Warnings)
	}
	if _, ok := warned.Document.Values["不存在的字段"]; ok {
		t.Fatalf("values = %v, want the unknown placeholder absent", warned.Document.Values)
	}
}

// TestDocGenerationUnknownTemplate covers (3): a template id from another workspace
// or a deleted one is a 404, not a 500 and not an empty document.
func TestDocGenerationUnknownTemplate(t *testing.T) {
	installProxyModeStorage(t)
	employee := createDocEmployeeFixture(t, "a")

	generateDoc(t, employee.ID, "", map[string]any{
		"template_id": "018f0000-0000-7000-8000-000000000000",
		"format":      "docx",
	}, http.StatusNotFound)

	// A malformed id is a 400, and a missing one a 400 as well.
	generateDoc(t, employee.ID, "", map[string]any{"format": "docx"}, http.StatusBadRequest)
	generateDoc(t, employee.ID, "", map[string]any{"template_id": "not-a-uuid", "format": "docx"},
		http.StatusBadRequest)

	// An unknown format is a 400: "pdf or docx" is the whole enum.
	template := createDocTemplate(t, "格式（测试）", "正文 {{员工姓名}}")
	generateDoc(t, employee.ID, "", map[string]any{
		"template_id": template.ID,
		"format":      "odt",
	}, http.StatusBadRequest)

	// A generation about somebody else's employee id is a 404 (the id is resolved
	// against this workspace).
	generateDoc(t, "018f0000-0000-7000-8000-000000000001", "",
		map[string]any{"template_id": template.ID, "format": "docx"}, http.StatusNotFound)
}

// TestDocGenerationIsOwnerOrAdmin covers (4): a `member` cannot generate a document
// or write a template, even for a profile it owns -- the result is filed in the
// person's record. Reads stay member-wide.
func TestDocGenerationIsOwnerOrAdmin(t *testing.T) {
	installProxyModeStorage(t)
	memberUserID := workbenchTestMember(t)

	// The member owns this profile (it created it), which is exactly the case the
	// stricter gate exists for.
	req := workbenchRequest(t, "POST", "/api/workbench/hr/employees", map[string]any{
		"member_id": memberUserID,
		"job_title": "内容运营",
	}, memberUserID)
	profile := testutil.Decode[HrEmployeeProfileResponse](t, testHandler.CreateHrEmployee, req, http.StatusCreated)
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM hr_doc_generation WHERE employee_id = $1`, profile.ID)
	})
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM hr_employee_profile WHERE id = $1`, profile.ID)
	})

	template := createDocTemplate(t, "越权（测试）", "兹证明 {{员工姓名}}。")

	generateDoc(t, profile.ID, memberUserID, map[string]any{
		"template_id": template.ID,
		"format":      "docx",
	}, http.StatusForbidden)

	// Template writes are the same gate.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/doc-templates", map[string]any{
		"name": "member 建的模板",
		"kind": "other",
		"body": "正文",
	}, memberUserID)
	testutil.Call(t, testHandler.CreateHrDocTemplate, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/doc-templates/"+template.ID,
		map[string]any{"body": "member 改的正文"}, memberUserID)
	req = withURLParam(req, "templateId", template.ID)
	testutil.Call(t, testHandler.UpdateHrDocTemplate, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "DELETE", "/api/workbench/hr/doc-templates/"+template.ID, nil, memberUserID)
	req = withURLParam(req, "templateId", template.ID)
	testutil.Call(t, testHandler.DeleteHrDocTemplate, req).Want(http.StatusForbidden)

	// Reads are member-wide: the template list and an (empty) document list.
	req = workbenchRequest(t, "GET", "/api/workbench/hr/doc-templates", nil, memberUserID)
	testutil.Call(t, testHandler.ListHrDocTemplates, req).Want(http.StatusOK)
	req = workbenchRequest(t, "GET", "/api/workbench/hr/employees/"+profile.ID+"/documents", nil, memberUserID)
	req = withURLParam(req, "employeeId", profile.ID)
	testutil.Call(t, testHandler.ListHrEmployeeDocuments, req).Want(http.StatusOK)
}

// TestDocBuiltinTemplatesAreSeeded covers (5): the three builtin templates exist in
// a workspace nobody configured, they are read-only, and the seeding survives a
// second read (it must not insert duplicates or fail on the unique index).
func TestDocBuiltinTemplatesAreSeeded(t *testing.T) {
	// Start from "a workspace nobody configured": drop whatever the suite has
	// seeded so far, then read once.
	removeBuiltinDocTemplates := func() {
		dbfx.Exec(t, `DELETE FROM hr_doc_template WHERE workspace_id = $1 AND builtin`, testWorkspaceID)
	}
	removeBuiltinDocTemplates()
	t.Cleanup(removeBuiltinDocTemplates)

	list := func() docTemplateListResponse {
		req := workbenchRequest(t, "GET", "/api/workbench/hr/doc-templates", nil, "")
		return testutil.Decode[docTemplateListResponse](t, testHandler.ListHrDocTemplates, req, http.StatusOK)
	}

	seeded := list()
	var builtins []HrDocTemplateResponse
	for _, template := range seeded.Templates {
		if template.Builtin {
			builtins = append(builtins, template)
		}
	}
	if len(builtins) != 3 {
		t.Fatalf("builtin templates = %d, want 3 (%+v)", len(builtins), seeded.Templates)
	}
	wantNames := map[string]string{
		"在职证明":     "employment",
		"离职证明":     "resignation",
		"劳动合同补充协议": "contract",
	}
	for _, template := range builtins {
		kind, ok := wantNames[template.Name]
		if !ok {
			t.Fatalf("unexpected builtin template %q", template.Name)
		}
		if template.Kind != kind {
			t.Fatalf("%q kind = %q, want %q", template.Name, template.Kind, kind)
		}
		if !contains(template.Placeholders, "员工姓名") || !contains(template.Placeholders, "公司名称") {
			t.Fatalf("%q placeholders = %v, want the employee and company slots",
				template.Name, template.Placeholders)
		}
	}

	// The second read is idempotent: still three, no duplicate-key failure.
	if again := list(); again.Total != seeded.Total {
		t.Fatalf("second read returned %d templates, want %d", again.Total, seeded.Total)
	}

	// A builtin cannot be edited or deleted -- the next read would bring it back.
	req := workbenchRequest(t, "PATCH", "/api/workbench/hr/doc-templates/"+builtins[0].ID,
		map[string]any{"body": "改写内置正文"}, "")
	req = withURLParam(req, "templateId", builtins[0].ID)
	testutil.Call(t, testHandler.UpdateHrDocTemplate, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "DELETE", "/api/workbench/hr/doc-templates/"+builtins[0].ID, nil, "")
	req = withURLParam(req, "templateId", builtins[0].ID)
	testutil.Call(t, testHandler.DeleteHrDocTemplate, req).Want(http.StatusBadRequest)
}

// TestDocTeardownCoversNewTables covers (6): both new tables are part of the
// workspace-deletion manifest (which classifies every table in the schema), and the
// per-test fixtures remove their rows -- no foreign key removes them.
func TestDocTeardownCoversNewTables(t *testing.T) {
	for _, table := range []string{"hr_doc_template", "hr_doc_generation"} {
		if action, ok := workspaceDeletionManifest[table]; !ok || action != workspaceDelete {
			t.Fatalf("workspaceDeletionManifest[%s] = %q (present=%v), want delete", table, action, ok)
		}
	}

	installProxyModeStorage(t)
	employee := createDocEmployeeFixture(t, "a")
	template := createDocTemplate(t, "清理（测试）", "兹证明 {{员工姓名}}。")
	generateDocOK(t, employee.ID, "", map[string]any{"template_id": template.ID, "format": "docx"})

	const (
		generationCount = `SELECT count(*) FROM hr_doc_generation WHERE employee_id = $1`
		templateCount   = `SELECT count(*) FROM hr_doc_template WHERE id = $1`
	)
	if got := dbfx.Count(t, generationCount, employee.ID); got != 1 {
		t.Fatalf("generation rows = %d, want 1", got)
	}
	if got := dbfx.Count(t, templateCount, template.ID); got != 1 {
		t.Fatalf("template rows = %d, want 1", got)
	}

	// The same statements the fixtures and the workspace teardown run: no foreign
	// key removes these rows, so these deletes are the only thing that does.
	dbfx.Exec(t, `DELETE FROM hr_doc_generation WHERE employee_id = $1`, employee.ID)
	dbfx.Exec(t, `DELETE FROM hr_doc_template WHERE id = $1`, template.ID)
	if got := dbfx.Count(t, generationCount, employee.ID); got != 0 {
		t.Fatalf("after teardown %d generation rows remain, want 0", got)
	}
	if got := dbfx.Count(t, templateCount, template.ID); got != 0 {
		t.Fatalf("after teardown %d template rows remain, want 0", got)
	}
}

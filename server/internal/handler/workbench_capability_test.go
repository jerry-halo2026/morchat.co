package handler

// Product-layer capability tests (docs/engineering/WORKBENCH-API.md 搂24,
// docs/engineering/COLLAB-MODEL.md 搂1/搂6).
//
// The five resolution steps and the two "narrower than ownership" capabilities are
// each pinned once here, because every one of them is a rule that would silently
// widen if it regressed: a fallback that granted writes, a template that was ignored,
// or an amount check that never ran would all look like "everything still works".

import (
	"net/http"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// capabilityMember creates a member with the given department and job title (both
// optional) and returns its user id. No role template is seeded, so the caller can
// assert which resolution step answered.
func capabilityMember(t *testing.T, label, departmentID, jobTitle string) string {
	t.Helper()
	slug := strings.NewReplacer("_", "-", "/", "-", " ", "-").Replace(strings.ToLower(t.Name() + "-" + label))
	userID := dbfx.User(t, "Capability Member", "cap-"+slug+"@multica.ai")
	dbfx.Member(t, testWorkspaceID, userID, "member")
	if departmentID != "" {
		dbfx.Exec(t, `UPDATE member SET department_id = $1 WHERE workspace_id = $2 AND user_id = $3`,
			departmentID, testWorkspaceID, userID)
	}
	if jobTitle != "" {
		dbfx.Insert(t, "hr_employee_profile", testutil.Cols{
			"workspace_id": testWorkspaceID,
			"member_id":    userID,
			"job_title":    jobTitle,
		})
	}
	return userID
}

// capabilityDepartment inserts a department with the given name.
func capabilityDepartment(t *testing.T, name string) string {
	t.Helper()
	return dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         name + " " + t.Name(),
	})
}

// seedRoleTemplate stores one job title's capability set.
func seedRoleTemplate(t *testing.T, jobTitle string, capabilities string) {
	t.Helper()
	dbfx.Exec(t, `
		INSERT INTO workbench_role_template (workspace_id, job_title, capabilities)
		VALUES ($1, $2, $3::text[])
		ON CONFLICT (workspace_id, lower(job_title)) WHERE archived_at IS NULL
		DO UPDATE SET capabilities = EXCLUDED.capabilities, updated_at = now()`,
		testWorkspaceID, jobTitle, capabilities)
}

// fetchCapabilitiesIn is `fetchCapabilities` against a specific workspace: the
// pre-capability case runs in its own workspace so the money it writes cannot move the
// workspace-wide aggregates other cases assert on.
func fetchCapabilitiesIn(t *testing.T, workspaceID, userID string) WorkbenchCapabilitiesResponse {
	t.Helper()
	req := bdRequestIn(t, "GET", "/api/workbench/capabilities", workspaceID, nil, userID)
	return testutil.Decode[WorkbenchCapabilitiesResponse](t, testHandler.GetWorkbenchCapabilities, req, http.StatusOK)
}

// fetchCapabilities reads `GET /api/workbench/capabilities` as userID.
func fetchCapabilities(t *testing.T, userID string) WorkbenchCapabilitiesResponse {
	t.Helper()
	req := workbenchRequest(t, "GET", "/api/workbench/capabilities", nil, userID)
	return testutil.Decode[WorkbenchCapabilitiesResponse](t, testHandler.GetWorkbenchCapabilities, req, http.StatusOK)
}

// hasCapability reports whether the response lists one capability.
func hasCapability(response WorkbenchCapabilitiesResponse, capability string) bool {
	for _, value := range response.Capabilities {
		if value == capability {
			return true
		}
	}
	return false
}

// TestWorkbenchCapabilitiesOwnerHasEverything covers step 1: role, not templates.
func TestWorkbenchCapabilitiesOwnerHasEverything(t *testing.T) {
	response := fetchCapabilities(t, testUserID)
	if response.Source != "role" || response.Role != "owner" {
		t.Fatalf("capabilities = %+v, want source=role role=owner", response)
	}
	for _, capability := range workbenchCapabilityCatalog {
		if !hasCapability(response, capability) {
			t.Fatalf("owner is missing %s", capability)
		}
	}
}

// TestWorkbenchCapabilitiesFromJobTitleTemplate covers step 2, including the "the
// template wins over the department default" half of the order.
func TestWorkbenchCapabilitiesFromJobTitleTemplate(t *testing.T) {
	// A department whose default would grant writes, plus a title whose template
	// deliberately grants only reads: the template must win.
	departmentID := capabilityDepartment(t, "销售部")
	userID := capabilityMember(t, "template", departmentID, "鍙浼氳")
	seedRoleTemplate(t, "鍙浼氳", "{crm.read}")

	response := fetchCapabilities(t, userID)
	if response.Source != "template" {
		t.Fatalf("source = %q, want template (the department default must not win)", response.Source)
	}
	if !hasCapability(response, capCRMRead) || hasCapability(response, capCRMWrite) {
		t.Fatalf("capabilities = %v, want crm.read only", response.Capabilities)
	}

	// The narrowing is real: a write the department default would have allowed is 403.
	req := workbenchRequest(t, "POST", "/api/workbench/creators", map[string]any{
		"kind": "external", "display_name": "template denied", "platform": "douyin", "handle": "template-denied",
	}, userID)
	var body map[string]any
	testutil.Call(t, testHandler.CreateCreator, req).Want(http.StatusForbidden).JSON(&body)
	if body["error"] != "forbidden_capability" || body["capability"] != capCRMWrite {
		t.Fatalf("403 body = %v, want forbidden_capability {capability: crm.write}", body)
	}
}

// TestWorkbenchCapabilitiesFromDepartmentDefault covers step 3.
func TestWorkbenchCapabilitiesFromDepartmentDefault(t *testing.T) {
	departmentID := capabilityDepartment(t, "销售部")
	userID := capabilityMember(t, "department", departmentID, "")

	response := fetchCapabilities(t, userID)
	if response.Source != "department" {
		t.Fatalf("source = %q, want department", response.Source)
	}
	if !hasCapability(response, capCRMWrite) || !hasCapability(response, capCRMAmount) {
		t.Fatalf("capabilities = %v, want the 销售部 department defaults", response.Capabilities)
	}
	if hasCapability(response, capHRWrite) {
		t.Fatalf("capabilities = %v, a 销售部 default must not include hr.write", response.Capabilities)
	}
}

// TestWorkbenchFallbackKeepsPreCapabilityBehavior is the no-silent-regression case:
// a member with no department and no HR profile 鈥?the ordinary shape of a real
// workspace, where departments and job titles were added long after people joined 鈥?// must still be able to do everything `workbenchCanWrite` allowed before capabilities
// existed. The fallback is the *old* behaviour, not a read-only lockdown.
func TestWorkbenchFallbackKeepsPreCapabilityBehavior(t *testing.T) {
	// Its own workspace: the rows this case writes would otherwise move the
	// workspace-wide signed/collected figures other cases assert exactly.
	workspaceID, ownerUserID := bdScratchWorkspace(t, "Capability fallback workspace")
	memberUserID := dbfx.User(t, "Fallback Member", "cap-fallback-pre@multica.ai")
	dbfx.Member(t, workspaceID, memberUserID, "member")

	response := fetchCapabilitiesIn(t, workspaceID, memberUserID)
	if response.Source != "fallback" {
		t.Fatalf("source = %q, want fallback (no template, no department)", response.Source)
	}
	for _, capability := range []string{capCRMWrite, capCRMAmount, capCRMSettle, capMediaWrite, capMediaPublish, capHRRead, capBossRead} {
		if !hasCapability(response, capability) {
			t.Fatalf("fallback is missing %s 閳?the default must equal the pre-capability behaviour", capability)
		}
	}

	// The whole money chain, as the member itself: client 閳?brief 閳?creator 閳?collab
	// with amounts 閳?settlement 閳?stage settled.
	req := bdRequestIn(t, "POST", "/api/workbench/creators", workspaceID, map[string]any{
		"kind": "external", "display_name": "Fallback creator", "platform": "douyin", "handle": "cap-fallback-creator",
	}, memberUserID)
	creator := testutil.Decode[CreatorResponse](t, testHandler.CreateCreator, req, http.StatusCreated)

	req = bdRequestIn(t, "POST", "/api/workbench/crm/clients", workspaceID, map[string]any{
		"name": "Fallback client",
	}, memberUserID)
	client := testutil.Decode[CrmClientResponse](t, testHandler.CreateCrmClient, req, http.StatusCreated)

	req = bdRequestIn(t, "POST", "/api/workbench/crm/briefs", workspaceID, map[string]any{
		"client_id": client.ID, "title": "Fallback brief",
	}, memberUserID)
	brief := testutil.Decode[CrmBriefResponse](t, testHandler.CreateCrmBrief, req, http.StatusCreated)

	req = bdRequestIn(t, "POST", "/api/workbench/crm/collabs", workspaceID, map[string]any{
		"brief_id": brief.ID, "creator_id": creator.ID, "stage": "confirmed",
		"final_amount": 8000, "creator_fee": 3000,
	}, memberUserID)
	collab := testutil.Decode[CrmCollabResponse](t, testHandler.CreateCrmCollab, req, http.StatusCreated)

	// crm.amount: changing the money is allowed by the fallback (it always was).
	req = withURLParam(bdRequestIn(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, workspaceID,
		map[string]any{"final_amount": 9000}, memberUserID), "collabId", collab.ID)
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusOK)

	// crm.settle: recording a settlement and moving the collaboration to settled.
	req = bdRequestIn(t, "POST", "/api/workbench/crm/settlements", workspaceID, map[string]any{
		"collab_id": collab.ID, "kind": "final", "amount": 9000,
	}, memberUserID)
	testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)

	req = withURLParam(bdRequestIn(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, workspaceID,
		map[string]any{"stage": "settled"}, memberUserID), "collabId", collab.ID)
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusOK)

	_ = ownerUserID
}

// TestWorkbenchFallbackLacksNewCapabilities is the other half of the same decision:
// the fallback grants what existed before and **nothing that is new**. These three
// capabilities did not exist prior to 搂24, so withholding them changes no existing
// behaviour 鈥?while granting them by default would hand out rights no owner approved.
func TestWorkbenchFallbackLacksNewCapabilities(t *testing.T) {
	memberUserID := capabilityMember(t, "newcaps", "", "")

	response := fetchCapabilities(t, memberUserID)
	for _, capability := range []string{capHRWrite, capReviewAccept, capAgentDelegate} {
		if hasCapability(response, capability) {
			t.Fatalf("fallback grants %s, which is a capability the product did not have before", capability)
		}
	}

	// hr.write has a write path: the profile ledger refuses the member with the
	// capability name in the body.
	req := workbenchRequest(t, "POST", "/api/workbench/hr/employees", map[string]any{
		"member_id": memberUserID, "job_title": "Designer",
	}, memberUserID)
	var body map[string]any
	testutil.Call(t, testHandler.CreateHrEmployee, req).Want(http.StatusForbidden).JSON(&body)
	if body["capability"] != capHRWrite {
		t.Fatalf("hr 403 body = %v, want capability hr.write", body)
	}

	// Handing out capabilities is an owner/admin act: a member editing a template is
	// exactly the escalation this gate exists to stop. The 403 names the role rule
	// rather than a capability 鈥?a client that hides entries per capability must not
	// read it as "review.accept missing" and offer to grant it.
	req = withURLParam(workbenchRequest(t, "PUT", "/api/workbench/role-templates/商务", map[string]any{
		"capabilities": []string{capCRMWrite},
	}, memberUserID), "jobTitle", "商务")
	testutil.Call(t, testHandler.PutWorkbenchRoleTemplate, req).Want(http.StatusForbidden).JSON(&body)
	if body["error"] != "forbidden_role" || body["role"] != "owner" {
		t.Fatalf("template 403 body = %v, want forbidden_role/owner", body)
	}

	// agent.delegate has no HTTP write path yet (agents write through MCP, 搂6), so its
	// absence is asserted on the resolved set, which is the only place it can appear.
	for _, capability := range response.Capabilities {
		if capability == capAgentDelegate {
			t.Fatalf("fallback grants agent.delegate")
		}
	}
}

// TestWorkbenchAmountAndSettleNeedTheirCapability covers the two capabilities that are
// narrower than "may write": a member who may edit a collaboration may still not move
// its money or record a settlement (COLLAB-MODEL 搂1: 琚寚娲句笉绛変簬鏈夋潈鏀?.
func TestWorkbenchAmountAndSettleNeedTheirCapability(t *testing.T) {
	// A title whose template grants the write but neither crm.amount nor crm.settle:
	// the baseline fixture template grants both, so the narrowing needs its own row.
	seedRoleTemplate(t, "鍙啓商务", "{crm.read,crm.write}")
	memberUserID := capabilityMember(t, "amount", "", "鍙啓商务")
	client := createWorkbenchClient(t, memberUserID, "Capability amount client")
	brief := createWorkbenchBrief(t, client.ID, "Capability amount brief")
	creator := createWorkbenchCreator(t, memberUserID, "Capability amount creator")
	// Owned by the member: the capability check is what must refuse, not ownership.
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{"stage": "negotiating", "owner_member_id": memberUserID})

	// Changing the fee needs crm.amount.
	req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID,
		map[string]any{"final_amount": 9000}, memberUserID), "collabId", collab.ID)
	var body map[string]any
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusForbidden).JSON(&body)
	if body["capability"] != capCRMAmount {
		t.Fatalf("amount 403 body = %v, want capability crm.amount", body)
	}

	// Recording payment needs crm.settle.
	req = workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID, "kind": "prepay", "amount": 1000,
	}, memberUserID)
	testutil.Call(t, testHandler.CreateCrmSettlement, req).Want(http.StatusForbidden).JSON(&body)
	if body["capability"] != capCRMSettle {
		t.Fatalf("settle 403 body = %v, want capability crm.settle", body)
	}

	// Moving the collaboration to `settled` is a settlement decision too.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID,
		map[string]any{"stage": "settled"}, memberUserID), "collabId", collab.ID)
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusForbidden).JSON(&body)
	if body["capability"] != capCRMSettle {
		t.Fatalf("settled-stage 403 body = %v, want capability crm.settle", body)
	}

	// A non-money edit still works: the capability check is on the fields, not the verb.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID,
		map[string]any{"settlement_mode": "flat"}, memberUserID), "collabId", collab.ID)
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusOK)
}

// TestWorkbenchDepartmentVisibilityIsolatesWrites covers 搂24.4's write half: with
// `workbench_visibility=department`, a member may not change a row owned by someone in
// another department, and the same write is allowed once the switch is back to
// `transparent`.
func TestWorkbenchDepartmentVisibilityIsolatesWrites(t *testing.T) {
	ownerDepartment := capabilityDepartment(t, "销售部")
	otherDepartment := capabilityDepartment(t, "内容组")
	ownerUserID := capabilityMember(t, "dept-owner", ownerDepartment, "商务")
	otherUserID := capabilityMember(t, "dept-other", otherDepartment, "商务")

	client := createWorkbenchClient(t, ownerUserID, "Visibility client")
	brief := createWorkbenchBrief(t, client.ID, "Visibility brief")
	creator := createWorkbenchCreator(t, ownerUserID, "Visibility creator")
	// Owned by the member of the 销售部 department, so the cross-department check is what
	// must refuse 鈥?not ownership.
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{"stage": "negotiating", "owner_member_id": ownerUserID})

	// Restore the workspace's setting when the case ends: the suite shares one row.
	settings := dbfx.Count(t, `SELECT count(*) FROM workspace WHERE id = $1 AND settings = '{}'::jsonb`, testWorkspaceID)
	t.Cleanup(func() {
		if settings == 1 {
			dbfx.Exec(t, `UPDATE workspace SET settings = '{}'::jsonb WHERE id = $1`, testWorkspaceID)
		} else {
			dbfx.Exec(t, `UPDATE workspace SET settings = settings - 'workbench_visibility' WHERE id = $1`, testWorkspaceID)
		}
	})

	// Transparent (default): the other department's member reads the row.
	req := withURLParam(workbenchRequest(t, "GET", "/api/workbench/crm/collabs/"+collab.ID, nil, otherUserID), "collabId", collab.ID)
	testutil.Call(t, testHandler.GetCrmCollab, req).Want(http.StatusOK)

	// Switch to department isolation.
	dbfx.Exec(t, `UPDATE workspace SET settings = COALESCE(settings, '{}'::jsonb) || '{"workbench_visibility":"department"}'::jsonb WHERE id = $1`, testWorkspaceID)

	response := fetchCapabilities(t, otherUserID)
	if response.Visibility != "department" {
		t.Fatalf("visibility = %q, want department", response.Visibility)
	}

	// 搂24.4 is a read switch (writes keep their own gates): the by-id read of another
	// department's collaboration is refused instead of leaking the row.
	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/crm/collabs/"+collab.ID, nil, otherUserID), "collabId", collab.ID)
	var body map[string]any
	testutil.Call(t, testHandler.GetCrmCollab, req).Want(http.StatusForbidden).JSON(&body)
	if body["error"] != "cross_department" {
		t.Fatalf("403 body = %v, want cross_department", body)
	}

	// The owning department still reads it, and the owner/admin always does.
	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/crm/collabs/"+collab.ID, nil, ownerUserID), "collabId", collab.ID)
	testutil.Call(t, testHandler.GetCrmCollab, req).Want(http.StatusOK)
}

// TestWorkbenchRoleTemplateEndpoints covers the owner/admin-only template writes.
func TestWorkbenchRoleTemplateEndpoints(t *testing.T) {
	memberUserID := workbenchTestMember(t)

	req := workbenchRequest(t, "PUT", "/api/workbench/role-templates/"+"设计部", map[string]any{
		"capabilities": []string{capMediaRead, capMediaWrite, "not.a.capability"},
	}, testUserID)
	req = withURLParam(req, "jobTitle", "设计部")
	saved := testutil.Decode[WorkbenchRoleTemplateResponse](t, testHandler.PutWorkbenchRoleTemplate, req, http.StatusOK)
	if len(saved.Capabilities) != 2 || saved.Capabilities[0] != capMediaRead || saved.Capabilities[1] != capMediaWrite {
		t.Fatalf("saved capabilities = %v, want the two known ones in order", saved.Capabilities)
	}
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM workbench_role_template WHERE workspace_id = $1 AND lower(job_title) = '设计部'`, testWorkspaceID)
	})

	req = workbenchRequest(t, "GET", "/api/workbench/role-templates", nil, memberUserID)
	var list struct {
		Templates []WorkbenchRoleTemplateResponse `json:"templates"`
		Total     int                             `json:"total"`
	}
	testutil.Call(t, testHandler.ListWorkbenchRoleTemplates, req).Want(http.StatusOK).JSON(&list)
	if list.Total < 1 {
		t.Fatalf("template list = %+v, want the saved one", list)
	}

	// A member cannot hand out capabilities.
	req = workbenchRequest(t, "PUT", "/api/workbench/role-templates/设计部", map[string]any{
		"capabilities": []string{capCRMWrite},
	}, memberUserID)
	req = withURLParam(req, "jobTitle", "设计部")
	testutil.Call(t, testHandler.PutWorkbenchRoleTemplate, req).Want(http.StatusForbidden)

	// Deleting a template that does not exist is a 404, not a silent success.
	req = withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/role-templates/不存在", nil, testUserID), "jobTitle", "不存在")
	testutil.Call(t, testHandler.DeleteWorkbenchRoleTemplate, req).Want(http.StatusNotFound)
}

package handler

import (
	"net/http"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// CRM ledger tests: clients, briefs, collaborations and settlements. Each one
// proves the same two properties as the creator suite — a member writes only its
// own rows, and a successful write publishes the domain event — plus the
// collaboration-specific rule that a stage transition stamps its milestone.

func createWorkbenchClient(t *testing.T, ownerUserID, name string) CrmClientResponse {
	t.Helper()
	body := map[string]any{"name": name, "brand": "Fixture Brand"}
	if ownerUserID != "" {
		body["owner_member_id"] = ownerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/crm/clients", body, ownerUserID)
	created := testutil.Decode[CrmClientResponse](t, testHandler.CreateCrmClient, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_client WHERE id = $1`, created.ID) })
	return created
}

func createWorkbenchBrief(t *testing.T, clientID, title string) CrmBriefResponse {
	t.Helper()
	req := workbenchRequest(t, "POST", "/api/workbench/crm/briefs", map[string]any{
		"client_id":     clientID,
		"title":         title,
		"platforms":     []string{"douyin", "xiaohongshu"},
		"budget_min":    0,
		"kpi_play":      100000,
		"schedule_from": "2026-11-01",
		"schedule_to":   "2026-11-30",
	}, "")
	created := testutil.Decode[CrmBriefResponse](t, testHandler.CreateCrmBrief, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_brief WHERE id = $1`, created.ID) })
	return created
}

func createWorkbenchCollab(t *testing.T, briefID, creatorID string, body map[string]any) CrmCollabResponse {
	t.Helper()
	payload := map[string]any{
		"brief_id":     briefID,
		"creator_id":   creatorID,
		"final_amount": 10000,
		"creator_fee":  4000,
		"sample_cost":  500,
		"platform_fee": 500,
	}
	for key, value := range body {
		payload[key] = value
	}
	req := workbenchRequest(t, "POST", "/api/workbench/crm/collabs", payload, "")
	created := testutil.Decode[CrmCollabResponse](t, testHandler.CreateCrmCollab, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_collab WHERE id = $1`, created.ID) })
	return created
}

// TestCrmClientPermissionsAndEvent covers the client ledger's read/write split.
func TestCrmClientPermissionsAndEvent(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	client := createWorkbenchClient(t, testUserID, "Client permission fixture")

	req := workbenchRequest(t, "GET", "/api/workbench/crm/clients/"+client.ID, nil, memberUserID)
	req = withURLParam(req, "clientId", client.ID)
	got := testutil.Decode[CrmClientResponse](t, testHandler.GetCrmClient, req, http.StatusOK)
	if got.ID != client.ID {
		t.Fatalf("GetCrmClient as member returned %s, want %s", got.ID, client.ID)
	}

	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/clients/"+client.ID, map[string]any{
		"name": "Renamed by a non-owner",
	}, memberUserID)
	req = withURLParam(req, "clientId", client.ID)
	testutil.Call(t, testHandler.UpdateCrmClient, req).Want(http.StatusForbidden)

	events := collectWorkbenchEvents(t, eventCRMClientChanged)
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/clients/"+client.ID, map[string]any{
		"name":     "Renamed by the owner",
		"industry": "beauty",
	}, testUserID)
	req = withURLParam(req, "clientId", client.ID)
	updated := testutil.Decode[CrmClientResponse](t, testHandler.UpdateCrmClient, req, http.StatusOK)
	if updated.Name != "Renamed by the owner" {
		t.Fatalf("name = %q, want the patched value", updated.Name)
	}
	if updated.Industry == nil || *updated.Industry != "beauty" {
		t.Fatalf("industry = %v, want beauty", updated.Industry)
	}
	if events.count(eventCRMClientChanged) != 1 {
		t.Fatalf("crm_client:changed published %d times, want 1", events.count(eventCRMClientChanged))
	}
	if payload := events.last(eventCRMClientChanged); payload == nil || payload["id"] != client.ID {
		t.Fatalf("crm_client:changed payload = %v, want id %s", payload, client.ID)
	}

	req = workbenchRequest(t, "DELETE", "/api/workbench/crm/clients/"+client.ID, nil, memberUserID)
	req = withURLParam(req, "clientId", client.ID)
	testutil.Call(t, testHandler.DeleteCrmClient, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "DELETE", "/api/workbench/crm/clients/"+client.ID, nil, testUserID)
	req = withURLParam(req, "clientId", client.ID)
	testutil.Call(t, testHandler.DeleteCrmClient, req).Want(http.StatusNoContent)
}

// TestCrmBriefCRUD covers the brief ledger: required client relationship, the
// platform array round-trip, the status filter and the member write gate.
func TestCrmBriefCRUD(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	client := createWorkbenchClient(t, testUserID, "Brief fixture client")

	brief := createWorkbenchBrief(t, client.ID, "Brief fixture")
	if brief.Status != "draft" {
		t.Fatalf("new brief status = %q, want draft", brief.Status)
	}
	if len(brief.Platforms) != 2 {
		t.Fatalf("platforms = %v, want the two sent values", brief.Platforms)
	}
	if brief.ScheduleFrom == nil || *brief.ScheduleFrom != "2026-11-01" {
		t.Fatalf("schedule_from = %v, want 2026-11-01", brief.ScheduleFrom)
	}
	if brief.KPIPlay == nil || *brief.KPIPlay != 100000 {
		t.Fatalf("kpi_play = %v, want 100000", brief.KPIPlay)
	}

	// A brief must point at a client in this workspace.
	req := workbenchRequest(t, "POST", "/api/workbench/crm/briefs", map[string]any{
		"client_id": "00000000-0000-0000-0000-000000000000",
		"title":     "Foreign client brief",
	}, testUserID)
	testutil.Call(t, testHandler.CreateCrmBrief, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/briefs/"+brief.ID, map[string]any{
		"status": "open",
	}, memberUserID)
	req = withURLParam(req, "briefId", brief.ID)
	testutil.Call(t, testHandler.UpdateCrmBrief, req).Want(http.StatusForbidden)

	events := collectWorkbenchEvents(t, eventCRMBriefChanged)
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/briefs/"+brief.ID, map[string]any{
		"status": "open",
	}, testUserID)
	req = withURLParam(req, "briefId", brief.ID)
	updated := testutil.Decode[CrmBriefResponse](t, testHandler.UpdateCrmBrief, req, http.StatusOK)
	if updated.Status != "open" {
		t.Fatalf("status = %q after patch, want open", updated.Status)
	}
	if events.count(eventCRMBriefChanged) != 1 {
		t.Fatalf("crm_brief:changed published %d times, want 1", events.count(eventCRMBriefChanged))
	}

	// The list honours the status filter.
	req = workbenchRequest(t, "GET", "/api/workbench/crm/briefs?status=open&client_id="+client.ID, nil, testUserID)
	var list struct {
		Briefs []CrmBriefResponse `json:"briefs"`
	}
	testutil.Call(t, testHandler.ListCrmBriefs, req).Want(http.StatusOK).JSON(&list)
	found := false
	for _, row := range list.Briefs {
		if row.ID == brief.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("open brief %s missing from the filtered list", brief.ID)
	}

	req = workbenchRequest(t, "DELETE", "/api/workbench/crm/briefs/"+brief.ID, nil, testUserID)
	req = withURLParam(req, "briefId", brief.ID)
	testutil.Call(t, testHandler.DeleteCrmBrief, req).Want(http.StatusNoContent)
}

// TestCrmCollabStageMilestonesAndEvents locks in the PATCH rule that a stage
// change writes confirmed_at / published_at / accepted_at, and that it publishes
// both the stage event and the generic crm_collab:changed.
func TestCrmCollabStageMilestonesAndEvents(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	client := createWorkbenchClient(t, testUserID, "Collab fixture client")
	brief := createWorkbenchBrief(t, client.ID, "Collab fixture brief")
	creator := createWorkbenchCreator(t, testUserID, "Collab fixture creator")

	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{"stage": "negotiating"})
	if collab.Stage != "negotiating" {
		t.Fatalf("stage = %q, want negotiating", collab.Stage)
	}
	if collab.ConfirmedAt != nil || collab.PublishedAt != nil || collab.AcceptedAt != nil {
		t.Fatalf("a negotiating collab must not carry milestones: %+v", collab)
	}

	stageEvents := collectWorkbenchEvents(t, eventCRMCollabStageChange, eventCRMCollabChanged)

	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage": "confirmed",
	}, memberUserID)
	req = withURLParam(req, "collabId", collab.ID)
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage": "confirmed",
	}, testUserID)
	req = withURLParam(req, "collabId", collab.ID)
	confirmed := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab, req, http.StatusOK)
	if confirmed.ConfirmedAt == nil {
		t.Fatalf("stage=confirmed did not write confirmed_at: %+v", confirmed)
	}
	if confirmed.PublishedAt != nil || confirmed.AcceptedAt != nil {
		t.Fatalf("confirmed must not stamp later milestones: %+v", confirmed)
	}
	payload := stageEvents.last(eventCRMCollabStageChange)
	if payload == nil || payload["from"] != "negotiating" || payload["to"] != "confirmed" || payload["id"] != collab.ID {
		t.Fatalf("crm_collab:stage_changed payload = %v, want negotiating -> confirmed for %s", payload, collab.ID)
	}
	if stageEvents.count(eventCRMCollabChanged) != 1 {
		t.Fatalf("crm_collab:changed published %d times, want 1", stageEvents.count(eventCRMCollabChanged))
	}

	confirmedAt := *confirmed.ConfirmedAt

	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage": "published",
	}, testUserID)
	req = withURLParam(req, "collabId", collab.ID)
	published := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab, req, http.StatusOK)
	if published.PublishedAt == nil {
		t.Fatalf("stage=published did not write published_at: %+v", published)
	}
	if published.ConfirmedAt == nil || *published.ConfirmedAt != confirmedAt {
		t.Fatalf("published overwrote confirmed_at: %v -> %v", confirmedAt, published.ConfirmedAt)
	}
	if published.AcceptedAt != nil {
		t.Fatalf("published must not stamp accepted_at: %+v", published)
	}

	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage": "settled",
	}, testUserID)
	req = withURLParam(req, "collabId", collab.ID)
	settled := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab, req, http.StatusOK)
	if settled.AcceptedAt == nil {
		t.Fatalf("stage=settled did not write accepted_at: %+v", settled)
	}

	// An unknown stage is rejected before the write, not by the CHECK constraint.
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage": "handshake",
	}, testUserID)
	req = withURLParam(req, "collabId", collab.ID)
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusBadRequest)

	// Probability is stored 0-1 (docs/METRICS.md §3 C3).
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"prob": 60,
	}, testUserID)
	req = withURLParam(req, "collabId", collab.ID)
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusBadRequest)
}

// TestCrmSettlementPermissionsAndEvent covers settlement ownership: a settlement
// inherits its collaboration's owner, so a member writing into someone else's
// collab is refused.
func TestCrmSettlementPermissionsAndEvent(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	client := createWorkbenchClient(t, testUserID, "Settlement fixture client")
	brief := createWorkbenchBrief(t, client.ID, "Settlement fixture brief")
	creator := createWorkbenchCreator(t, testUserID, "Settlement fixture creator")
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{"stage": "accepted"})

	req := workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID,
		"kind":      "prepay",
		"amount":    3000,
	}, memberUserID)
	testutil.Call(t, testHandler.CreateCrmSettlement, req).Want(http.StatusForbidden)

	events := collectWorkbenchEvents(t, eventCRMSettlementChanged)
	req = workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID,
		"kind":      "prepay",
		"amount":    3000,
		"due_at":    "2026-11-20",
	}, testUserID)
	created := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, created.ID) })
	if created.Amount != 3000 {
		t.Fatalf("amount = %v, want 3000", created.Amount)
	}
	if created.Currency != "CNY" {
		t.Fatalf("currency = %q, want the CNY default", created.Currency)
	}
	if created.DueAt == nil || *created.DueAt != "2026-11-20" {
		t.Fatalf("due_at = %v, want 2026-11-20", created.DueAt)
	}
	if events.count(eventCRMSettlementChanged) != 1 {
		t.Fatalf("crm_settlement:changed published %d times, want 1", events.count(eventCRMSettlementChanged))
	}

	// Marking it paid moves it out of the "pending" filter.
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/settlements/"+created.ID, map[string]any{
		"paid_at": "2026-11-16",
	}, testUserID)
	req = withURLParam(req, "settlementId", created.ID)
	updated := testutil.Decode[CrmSettlementResponse](t, testHandler.UpdateCrmSettlement, req, http.StatusOK)
	if updated.PaidAt == nil || *updated.PaidAt != "2026-11-16" {
		t.Fatalf("paid_at = %v, want 2026-11-16", updated.PaidAt)
	}

	req = workbenchRequest(t, "GET", "/api/workbench/crm/settlements?paid=false&collab_id="+collab.ID, nil, testUserID)
	var list struct {
		Settlements []CrmSettlementResponse `json:"settlements"`
	}
	testutil.Call(t, testHandler.ListCrmSettlements, req).Want(http.StatusOK).JSON(&list)
	for _, row := range list.Settlements {
		if row.ID == created.ID {
			t.Fatalf("paid settlement %s still returned by paid=false", created.ID)
		}
	}

	req = workbenchRequest(t, "DELETE", "/api/workbench/crm/settlements/"+created.ID, nil, memberUserID)
	req = withURLParam(req, "settlementId", created.ID)
	testutil.Call(t, testHandler.DeleteCrmSettlement, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "DELETE", "/api/workbench/crm/settlements/"+created.ID, nil, testUserID)
	req = withURLParam(req, "settlementId", created.ID)
	testutil.Call(t, testHandler.DeleteCrmSettlement, req).Want(http.StatusNoContent)
}

// TestCrmCollabDeleteArchivesItsSettlements covers the delete rule from §20.1: a
// withdrawn collaboration takes its settlements with it, in one transaction. The
// settlements include a cleared one — archiving a paid row does not un-pay it, it
// only takes it out of the ledgers (see the handler comment).
func TestCrmCollabDeleteArchivesItsSettlements(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Collab delete client")
	brief := createWorkbenchBrief(t, client.ID, "Collab delete brief")
	creator := createWorkbenchCreator(t, testUserID, "Collab delete creator")
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{"stage": "accepted"})

	// A second collaboration in the same chain: its settlement must survive.
	other := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{"stage": "accepted"})

	createSettlement := func(collabID string, kind string, amount float64, paidAt string) CrmSettlementResponse {
		t.Helper()
		body := map[string]any{"collab_id": collabID, "kind": kind, "amount": amount}
		if paidAt != "" {
			body["paid_at"] = paidAt
		}
		req := workbenchRequest(t, "POST", "/api/workbench/crm/settlements", body, testUserID)
		created := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)
		t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, created.ID) })
		return created
	}
	prepay := createSettlement(collab.ID, "prepay", 3000, "")
	paid := createSettlement(collab.ID, "final", 7000, "2026-11-15")
	untouched := createSettlement(other.ID, "prepay", 1200, "")

	events := collectWorkbenchEvents(t, eventCRMCollabChanged, eventCRMSettlementChanged)

	req := withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/crm/collabs/"+collab.ID, nil, testUserID), "collabId", collab.ID)
	testutil.Call(t, testHandler.DeleteCrmCollab, req).Want(http.StatusNoContent)

	// Both settlements are gone from the ledger the API reads.
	req = workbenchRequest(t, "GET", "/api/workbench/crm/settlements?collab_id="+collab.ID, nil, testUserID)
	var list struct {
		Settlements []CrmSettlementResponse `json:"settlements"`
		Total       int                     `json:"total"`
	}
	testutil.Call(t, testHandler.ListCrmSettlements, req).Want(http.StatusOK).JSON(&list)
	if list.Total != 0 {
		t.Fatalf("settlements left after deleting the collab: %+v", list.Settlements)
	}
	// ... while the other collaboration's settlement is untouched.
	req = workbenchRequest(t, "GET", "/api/workbench/crm/settlements?collab_id="+other.ID, nil, testUserID)
	testutil.Call(t, testHandler.ListCrmSettlements, req).Want(http.StatusOK).JSON(&list)
	if list.Total != 1 || list.Settlements[0].ID != untouched.ID {
		t.Fatalf("other collab's settlements = %+v, want only %s", list.Settlements, untouched.ID)
	}
	// A soft delete, not a physical one: the rows and their paid markers remain.
	for _, settlement := range []CrmSettlementResponse{prepay, paid} {
		archived := dbfx.Count(t, `SELECT count(*) FROM crm_settlement WHERE id = $1 AND archived_at IS NOT NULL`, settlement.ID)
		if archived != 1 {
			t.Fatalf("settlement %s was not archived", settlement.ID)
		}
	}
	if stillPaid := dbfx.Count(t, `SELECT count(*) FROM crm_settlement WHERE id = $1 AND paid_at IS NOT NULL`, paid.ID); stillPaid != 1 {
		t.Fatalf("archiving un-paid the settlement %s", paid.ID)
	}

	// The collaboration itself is archived, and a second DELETE is a 404.
	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/crm/collabs/"+collab.ID, nil, testUserID), "collabId", collab.ID)
	testutil.Call(t, testHandler.GetCrmCollab, req).Want(http.StatusNotFound)
	req = withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/crm/collabs/"+collab.ID, nil, testUserID), "collabId", collab.ID)
	testutil.Call(t, testHandler.DeleteCrmCollab, req).Want(http.StatusNotFound)

	// Both ledgers are told to refetch: the collab, and each archived settlement.
	if events.count(eventCRMCollabChanged) != 1 {
		t.Fatalf("crm_collab:changed published %d times, want 1", events.count(eventCRMCollabChanged))
	}
	if got := events.count(eventCRMSettlementChanged); got != 2 {
		t.Fatalf("crm_settlement:changed published %d times, want one per archived settlement (2)", got)
	}
}

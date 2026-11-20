package handler

// Tests for the P1 knowledge HTTP surface (knowledge_crud.go).
//
// They run against the migrated dev database the rest of the handler suite uses
// (DATABASE_URL), through the real workspace middleware, so what is asserted is
// the contract a client sees: status codes, error codes, and the snake_case field
// names. Each test builds its own space, because the row identity — not a shared
// fixture — is what makes "cross-workspace" and "archived" meaningful.

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/middleware"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// knowledgeDo runs handler behind the workspace middleware, with the caller's
// identity in the headers the middleware reads, and decodes the JSON answer.
func knowledgeDo(t *testing.T, handler http.HandlerFunc, req *http.Request, userID, workspaceID string, params ...string) (int, map[string]any) {
	t.Helper()
	if userID == "" {
		userID = testUserID
	}
	if workspaceID == "" {
		workspaceID = testWorkspaceID
	}
	req = testutil.WithHeaders(req, "X-User-ID", userID, "X-Workspace-ID", workspaceID)
	if len(params) > 0 {
		req = testutil.WithURLParams(req, params...)
	}
	rec := httptest.NewRecorder()
	middleware.RequireWorkspaceMember(testHandler.Queries)(handler).ServeHTTP(rec, req)

	var body map[string]any
	if rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("%s %s: decode body %q: %v", req.Method, req.URL.Path, rec.Body.String(), err)
		}
	}
	return rec.Code, body
}

// knowledgeObjectOf pulls one object out of a response that may wrap it under
// its resource name, which is what the API does for pages (`{"page": {...}}`).
func knowledgeObjectOf(t *testing.T, body map[string]any, key string) map[string]any {
	t.Helper()
	if nested, ok := body[key].(map[string]any); ok {
		return nested
	}
	return body
}

func knowledgeString(t *testing.T, body map[string]any, key string) string {
	t.Helper()
	value, _ := body[key].(string)
	if value == "" {
		t.Fatalf("field %q missing from %v", key, body)
	}
	return value
}

// knowledgeCreateSpace creates a space owned by the given workspace member.
func knowledgeCreateSpace(t *testing.T, name, userID, workspaceID string) string {
	t.Helper()
	status, body := knowledgeDo(t, testHandler.CreateKnowledgeSpace,
		testutil.JSONRequest(http.MethodPost, "/api/knowledge/spaces", map[string]any{
			"name":        name,
			"description": "created by the P1 handler tests",
		}), userID, workspaceID)
	if status != http.StatusCreated {
		t.Fatalf("create space: status = %d, body = %v", status, body)
	}
	return knowledgeString(t, body, "id")
}

// knowledgeCreateItem creates one item in spaceID as the given workspace member
// (empty means the suite's own) and returns its id.
func knowledgeCreateItem(t *testing.T, spaceID, title, userID, workspaceID string, extra map[string]any) string {
	t.Helper()
	payload := map[string]any{
		"space_id": spaceID,
		"title":    title,
		"kind":     "note",
	}
	for key, value := range extra {
		payload[key] = value
	}
	status, body := knowledgeDo(t, testHandler.CreateKnowledgeItem,
		testutil.JSONRequest(http.MethodPost, "/api/knowledge/items", payload), userID, workspaceID)
	if status != http.StatusCreated {
		t.Fatalf("create item: status = %d, body = %v", status, body)
	}
	return knowledgeString(t, body, "id")
}

// TestKnowledgeCRUDLifecycle is the write→read contract end to end: a space, an
// item inside it, a patch, and the archive delete.
func TestKnowledgeCRUDLifecycle(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceID := knowledgeCreateSpace(t, "CRUD lifecycle", "", "")
	// Active knowledge is reviewed knowledge (W1-A): the helper creates the
	// draft, opens a done review issue and approves it.
	itemID := knowledgeCreateActiveItem(t, spaceID, "Retrieval notes", "", "", map[string]any{
		"content": "# Retrieval\n\nThe keyword channel and the vector channel are fused with RRF.\n",
	})

	// Space detail carries the item count the list column renders.
	status, body := knowledgeDo(t, testHandler.GetKnowledgeSpace,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/spaces/"+spaceID, nil), "", "", "spaceId", spaceID)
	if status != http.StatusOK {
		t.Fatalf("get space: status = %d, body = %v", status, body)
	}
	if count, _ := body["item_count"].(float64); count < 1 {
		t.Fatalf("space item_count = %v, want >= 1", body["item_count"])
	}

	// Detail with include=content returns the stored body and chunk count.
	status, body = knowledgeDo(t, testHandler.GetKnowledgeItem,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/items/"+itemID+"?include=content", nil),
		"", "", "itemId", itemID)
	if status != http.StatusOK {
		t.Fatalf("get item: status = %d, body = %v", status, body)
	}
	if content, _ := body["content"].(string); content == "" {
		t.Fatalf("include=content returned no body: %v", body)
	}
	if count, _ := body["chunk_count"].(float64); count < 1 {
		t.Fatalf("chunk_count = %v, want >= 1", body["chunk_count"])
	}

	// Persisted chunks are readable without re-chunking anything.
	status, body = knowledgeDo(t, testHandler.ListKnowledgeItemChunks,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/items/"+itemID+"/chunks", nil),
		"", "", "itemId", itemID)
	if status != http.StatusOK {
		t.Fatalf("list chunks: status = %d, body = %v", status, body)
	}
	chunks, _ := body["chunks"].([]any)
	if len(chunks) == 0 {
		t.Fatalf("list chunks: empty: %v", body)
	}
	first, _ := chunks[0].(map[string]any)
	if text, _ := first["text"].(string); text == "" {
		t.Fatalf("chunk has no text field: %v", first)
	}
	if _, ok := first["ord"]; !ok {
		t.Fatalf("chunk has no ord field: %v", first)
	}

	// PATCH updates the fields it is given and leaves the rest alone.
	status, body = knowledgeDo(t, testHandler.UpdateKnowledgeItem,
		testutil.JSONRequest(http.MethodPatch, "/api/knowledge/items/"+itemID, map[string]any{
			"title":      "Retrieval notes (edited)",
			"source_ref": "https://example.test/dispatched",
		}), "", "", "itemId", itemID)
	if status != http.StatusOK {
		t.Fatalf("patch item: status = %d, body = %v", status, body)
	}
	if title, _ := body["title"].(string); title != "Retrieval notes (edited)" {
		t.Fatalf("patch title = %q", title)
	}
	if ref, _ := body["source_ref"].(string); ref != "https://example.test/dispatched" {
		t.Fatalf("patch source_ref = %q", ref)
	}
	if got, _ := body["status"].(string); got != "active" {
		t.Fatalf("patch status = %q, want the untouched active", got)
	}

	// DELETE is the archive transition, not a row delete: the item stays readable
	// by id and keeps its lifecycle state, with the archive flag set.
	status, body = knowledgeDo(t, testHandler.DeleteKnowledgeItem,
		testutil.JSONRequest(http.MethodDelete, "/api/knowledge/items/"+itemID, nil), "", "", "itemId", itemID)
	if status != http.StatusOK {
		t.Fatalf("delete item: status = %d, body = %v", status, body)
	}
	if archived, _ := body["archived"].(bool); !archived {
		t.Fatalf("archived flag not set by DELETE: %v", body)
	}
	status, body = knowledgeDo(t, testHandler.GetKnowledgeItem,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/items/"+itemID, nil), "", "", "itemId", itemID)
	if status != http.StatusOK {
		t.Fatalf("get archived item: status = %d, body = %v", status, body)
	}
	if archived, _ := body["archived"].(bool); !archived {
		t.Fatalf("get archived item: archived = false: %v", body)
	}
}

// knowledgeSpaceDepartment inserts a department in the given workspace (empty
// means the suite's) and returns its id, so the space tests file under a row that
// really exists.
func knowledgeSpaceDepartment(t *testing.T, workspaceID, prefix string) string {
	t.Helper()
	if workspaceID == "" {
		workspaceID = testWorkspaceID
	}
	return dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": workspaceID,
		"name":         uniqueDepartmentName(prefix),
	})
}

// knowledgeUpdateSpace drives PATCH /api/knowledge/spaces/{spaceId}.
func knowledgeUpdateSpace(t *testing.T, spaceID string, payload map[string]any) (int, map[string]any) {
	t.Helper()
	return knowledgeDo(t, testHandler.UpdateKnowledgeSpace,
		testutil.JSONRequest(http.MethodPatch, "/api/knowledge/spaces/"+spaceID, payload),
		"", "", "spaceId", spaceID)
}

// knowledgeListedSpaceDepartment reads department_id out of the space listing,
// which is where a client reads it. The pointer keeps JSON null (unfiled)
// distinguishable from a missing key, which it fails on.
func knowledgeListedSpaceDepartment(t *testing.T, spaceID string) *string {
	t.Helper()
	status, body := knowledgeDo(t, testHandler.ListKnowledgeSpaces,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/spaces", nil), "", "")
	if status != http.StatusOK {
		t.Fatalf("list spaces: status = %d, body = %v", status, body)
	}
	spaces, _ := body["spaces"].([]any)
	for _, entry := range spaces {
		space, _ := entry.(map[string]any)
		if id, _ := space["id"].(string); id != spaceID {
			continue
		}
		raw, present := space["department_id"]
		if !present {
			t.Fatalf("space listing omits department_id: %v", space)
		}
		if raw == nil {
			return nil
		}
		value, ok := raw.(string)
		if !ok {
			t.Fatalf("listed department_id = %T, want a string or null", raw)
		}
		return &value
	}
	t.Fatalf("space %s is missing from its workspace listing", spaceID)
	return nil
}

// knowledgeStoredSpaceDepartment reads the column itself: "the refused write
// changed nothing" is an assertion on the row, not on a projection.
func knowledgeStoredSpaceDepartment(t *testing.T, spaceID string) *string {
	t.Helper()
	var department *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM knowledge_spaces WHERE id = $1`, spaceID).Scan(&department)
	return department
}

// TestKnowledgeSpaceDepartmentAttribution is the write path for
// knowledge_spaces.department_id (docs/engineering/ORG-MODEL.md §3): create files
// the space under a department and answers it, the listing carries the same
// value, an update moves the filing, an absent key leaves it, and null clears it.
func TestKnowledgeSpaceDepartmentAttribution(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}
	first := knowledgeSpaceDepartment(t, "", "knowledge-first")
	second := knowledgeSpaceDepartment(t, "", "knowledge-second")

	status, body := knowledgeDo(t, testHandler.CreateKnowledgeSpace,
		testutil.JSONRequest(http.MethodPost, "/api/knowledge/spaces", map[string]any{
			"name":          "Department filed space",
			"description":   "filed under a department on create",
			"department_id": first,
		}), "", "")
	if status != http.StatusCreated {
		t.Fatalf("create space with a department: status = %d, body = %v", status, body)
	}
	spaceID := knowledgeString(t, body, "id")
	if got, _ := body["department_id"].(string); got != first {
		t.Fatalf("create response department_id = %v, want %q", body["department_id"], first)
	}
	if listed := knowledgeListedSpaceDepartment(t, spaceID); listed == nil || *listed != first {
		t.Fatalf("listing department_id = %v, want %q", listed, first)
	}

	// Moving the filing to another department of the same workspace.
	status, body = knowledgeUpdateSpace(t, spaceID, map[string]any{"department_id": second})
	if status != http.StatusOK {
		t.Fatalf("move department: status = %d, body = %v", status, body)
	}
	if got, _ := body["department_id"].(string); got != second {
		t.Fatalf("updated department_id = %v, want %q", body["department_id"], second)
	}
	if stored := knowledgeStoredSpaceDepartment(t, spaceID); stored == nil || *stored != second {
		t.Fatalf("stored department_id = %v, want %q", stored, second)
	}

	// An absent key means "unchanged": renaming must not unfiled the space.
	status, body = knowledgeUpdateSpace(t, spaceID, map[string]any{"name": "Department filed space (renamed)"})
	if status != http.StatusOK {
		t.Fatalf("rename space: status = %d, body = %v", status, body)
	}
	if got, _ := body["department_id"].(string); got != second {
		t.Fatalf("department_id after a name-only patch = %v, want %q", body["department_id"], second)
	}

	// An explicit null clears the filing; "" is the same request in another
	// spelling. Each case refills first, so both are proved to clear a filed row.
	for _, tc := range []struct {
		name    string
		payload map[string]any
	}{
		{"null clears", map[string]any{"department_id": nil}},
		{"empty string clears", map[string]any{"department_id": ""}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if status, body := knowledgeUpdateSpace(t, spaceID, map[string]any{"department_id": first}); status != http.StatusOK {
				t.Fatalf("refill department: status = %d, body = %v", status, body)
			}
			status, body := knowledgeUpdateSpace(t, spaceID, tc.payload)
			if status != http.StatusOK {
				t.Fatalf("clear department: status = %d, body = %v", status, body)
			}
			if raw, present := body["department_id"]; !present || raw != nil {
				t.Fatalf("cleared department_id = %v (present = %v), want null", raw, present)
			}
			if stored := knowledgeStoredSpaceDepartment(t, spaceID); stored != nil {
				t.Fatalf("stored department_id = %q after a clear, want NULL", *stored)
			}
		})
	}
}

// TestKnowledgeSpaceCreatedWithoutDepartment pins the default: a create that
// names no department is unfiled — not rejected, and not attributed by accident.
func TestKnowledgeSpaceCreatedWithoutDepartment(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}
	status, body := knowledgeDo(t, testHandler.CreateKnowledgeSpace,
		testutil.JSONRequest(http.MethodPost, "/api/knowledge/spaces", map[string]any{
			"name": "Unfiled space",
		}), "", "")
	if status != http.StatusCreated {
		t.Fatalf("create space: status = %d, body = %v", status, body)
	}
	spaceID := knowledgeString(t, body, "id")
	if raw, present := body["department_id"]; !present || raw != nil {
		t.Fatalf("create response department_id = %v (present = %v), want null", raw, present)
	}
	if listed := knowledgeListedSpaceDepartment(t, spaceID); listed != nil {
		t.Fatalf("listing department_id = %q, want null", *listed)
	}
	if stored := knowledgeStoredSpaceDepartment(t, spaceID); stored != nil {
		t.Fatalf("stored department_id = %q, want NULL", *stored)
	}
}

// TestKnowledgeSpaceDepartmentRejected refuses a department this workspace does
// not own — another workspace's row, an unknown id, a malformed one — and proves
// the stored row was left alone.
func TestKnowledgeSpaceDepartmentRejected(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}
	own := knowledgeSpaceDepartment(t, "", "knowledge-own")
	foreignWorkspaceID := dbfx.Insert(t, "workspace", testutil.Cols{
		"name":         "Knowledge foreign workspace",
		"slug":         uniqueDepartmentName("knowledge-foreign"),
		"description":  "Foreign workspace",
		"issue_prefix": "KFW",
	})
	foreign := knowledgeSpaceDepartment(t, foreignWorkspaceID, "knowledge-foreign")

	spaceID := knowledgeCreateSpace(t, "Rejection target", "", "")
	if status, body := knowledgeUpdateSpace(t, spaceID, map[string]any{"department_id": own}); status != http.StatusOK {
		t.Fatalf("file under the workspace's own department: status = %d, body = %v", status, body)
	}

	for _, tc := range []struct {
		name       string
		department string
		want       string
	}{
		{"foreign workspace", foreign, "department not found in this workspace"},
		{"unknown id", "00000000-0000-4000-8000-000000000000", "department not found in this workspace"},
		{"malformed", "not-a-department", "invalid department_id"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			status, body := knowledgeUpdateSpace(t, spaceID, map[string]any{"department_id": tc.department})
			if status != http.StatusBadRequest {
				t.Fatalf("update with a %s department: status = %d, body = %v", tc.name, status, body)
			}
			if message, _ := body["error"].(string); !strings.Contains(message, tc.want) {
				t.Fatalf("error = %q, want it to contain %q", message, tc.want)
			}
			if stored := knowledgeStoredSpaceDepartment(t, spaceID); stored == nil || *stored != own {
				t.Fatalf("the refused update left department_id = %v, want %q", stored, own)
			}
		})
	}

	// The same refusal applies to a create, and it inserts nothing.
	status, body := knowledgeDo(t, testHandler.CreateKnowledgeSpace,
		testutil.JSONRequest(http.MethodPost, "/api/knowledge/spaces", map[string]any{
			"name":          "Rejected department create",
			"department_id": foreign,
		}), "", "")
	if status != http.StatusBadRequest {
		t.Fatalf("create with a foreign department: status = %d, body = %v", status, body)
	}
	if message, _ := body["error"].(string); !strings.Contains(message, "department not found in this workspace") {
		t.Fatalf("error = %q, want the workspace-scoped refusal", message)
	}
	var created int
	dbfx.QueryRow(t, `SELECT count(*) FROM knowledge_spaces WHERE workspace_id = $1 AND display_name = $2`,
		testWorkspaceID, "Rejected department create").Scan(&created)
	if created != 0 {
		t.Fatalf("a refused create inserted %d space rows", created)
	}
}

// TestKnowledgeArchiveDropsFromDefaultList pins the archive contract: after
// PATCH {"status":"archived"} the item leaves both the default listing and the
// active listing, and only an explicit status=archived asks for it again.
func TestKnowledgeArchiveDropsFromDefaultList(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceID := knowledgeCreateSpace(t, "Archive listing", "", "")
	itemID := knowledgeCreateActiveItem(t, spaceID, "Ephemeral note", "", "", nil)

	status, body := knowledgeDo(t, testHandler.ListKnowledgeItems,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/items?space_id="+spaceID, nil), "", "")
	if status != http.StatusOK {
		t.Fatalf("list items: status = %d, body = %v", status, body)
	}
	if !knowledgeListHasItem(body, itemID) {
		t.Fatalf("item missing from the default listing before archiving: %v", body)
	}

	status, body = knowledgeDo(t, testHandler.UpdateKnowledgeItem,
		testutil.JSONRequest(http.MethodPatch, "/api/knowledge/items/"+itemID, map[string]any{
			"status": "archived",
		}), "", "", "itemId", itemID)
	if status != http.StatusOK {
		t.Fatalf("archive item: status = %d, body = %v", status, body)
	}

	for _, path := range []string{
		"/api/knowledge/items?space_id=" + spaceID,
		"/api/knowledge/items?space_id=" + spaceID + "&status=active",
	} {
		status, body = knowledgeDo(t, testHandler.ListKnowledgeItems,
			testutil.JSONRequest(http.MethodGet, path, nil), "", "")
		if status != http.StatusOK {
			t.Fatalf("list %s: status = %d, body = %v", path, status, body)
		}
		if knowledgeListHasItem(body, itemID) {
			t.Fatalf("archived item still listed by %s: %v", path, body)
		}
	}

	status, body = knowledgeDo(t, testHandler.ListKnowledgeItems,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/items?space_id="+spaceID+"&status=archived", nil), "", "")
	if status != http.StatusOK {
		t.Fatalf("list archived: status = %d, body = %v", status, body)
	}
	if !knowledgeListHasItem(body, itemID) {
		t.Fatalf("status=archived does not return the archived item: %v", body)
	}
}

func knowledgeListHasItem(body map[string]any, itemID string) bool {
	rows, _ := body["items"].([]any)
	for _, row := range rows {
		item, _ := row.(map[string]any)
		if id, _ := item["id"].(string); id == itemID {
			return true
		}
	}
	return false
}

// TestKnowledgeCrossWorkspaceAndPrivateIsolation pins attribution: an item of
// another workspace is a 404 (not a 403, so existence does not leak), and a
// private item of a colleague in the same workspace is a 403.
func TestKnowledgeCrossWorkspaceAndPrivateIsolation(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	otherWorkspaceID := dbfx.Workspace(t, "Knowledge Other", "knowledge-other-ws")
	otherUserID := dbfx.User(t, "Knowledge Other User", "knowledge-other@multica.ai")
	dbfx.Member(t, otherWorkspaceID, otherUserID, "owner")

	otherSpaceID := knowledgeCreateSpace(t, "Other workspace space", otherUserID, otherWorkspaceID)
	otherItemID := knowledgeCreateItem(t, otherSpaceID, "Other workspace note", otherUserID, otherWorkspaceID, nil)

	// Same id, suite's workspace: the row is invisible, and the answer is a 404
	// with the item-specific code rather than a bland not-found.
	status, body := knowledgeDo(t, testHandler.GetKnowledgeItem,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/items/"+otherItemID, nil), "", "", "itemId", otherItemID)
	if status != http.StatusNotFound {
		t.Fatalf("cross-workspace read: status = %d, body = %v", status, body)
	}
	if code, _ := body["code"].(string); code != "knowledge_item_not_found" {
		t.Fatalf("cross-workspace code = %q, want knowledge_item_not_found", code)
	}

	// The owning workspace reads it normally.
	status, body = knowledgeDo(t, testHandler.GetKnowledgeItem,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/items/"+otherItemID, nil),
		otherUserID, otherWorkspaceID, "itemId", otherItemID)
	if status != http.StatusOK {
		t.Fatalf("owner read: status = %d, body = %v", status, body)
	}

	// A private item is readable by its owner only; a colleague in the same
	// workspace gets the fail-closed 403.
	spaceID := knowledgeCreateSpace(t, "Private ACL", "", "")
	privateItemID := knowledgeCreateItem(t, spaceID, "Private note", "", "", map[string]any{
		"acl_mode": "private",
	})
	colleagueID := dbfx.User(t, "Knowledge Colleague", "knowledge-colleague@multica.ai")
	dbfx.Member(t, testWorkspaceID, colleagueID, "member")

	status, body = knowledgeDo(t, testHandler.GetKnowledgeItem,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/items/"+privateItemID, nil),
		colleagueID, "", "itemId", privateItemID)
	if status != http.StatusForbidden {
		t.Fatalf("private read by colleague: status = %d, body = %v", status, body)
	}
	if code, _ := body["code"].(string); code != "knowledge_forbidden" {
		t.Fatalf("private read code = %q, want knowledge_forbidden", code)
	}

	status, body = knowledgeDo(t, testHandler.GetKnowledgeItem,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/items/"+privateItemID, nil), "", "", "itemId", privateItemID)
	if status != http.StatusOK {
		t.Fatalf("private read by owner: status = %d, body = %v", status, body)
	}
}

// TestKnowledgeSearchHitCarriesIdentity pins the search response contract: every
// hit names its chunk, its item, and the revision (document generation) it came
// from, and the pipeline's own debug block is passed through.
func TestKnowledgeSearchHitCarriesIdentity(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceID := knowledgeCreateSpace(t, "Search hits", "", "")
	itemID := knowledgeCreateActiveItem(t, spaceID, "Fusion notes", "", "", map[string]any{
		"content": "# Fusion\n\nReciprocal rank fusion combines the keyword ranking and the " +
			"vector ranking by rank, never by raw score.\n",
	})

	status, body := knowledgeDo(t, testHandler.SearchKnowledge,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/search?q=fusion&space_id="+spaceID+"&top_k=5", nil), "", "")
	if status != http.StatusOK {
		t.Fatalf("search: status = %d, body = %v", status, body)
	}
	hits, _ := body["hits"].([]any)
	if len(hits) == 0 {
		t.Fatalf("search returned no hits: %v", body)
	}
	hit, _ := hits[0].(map[string]any)
	if got, _ := hit["item_id"].(string); got != itemID {
		t.Fatalf("hit item_id = %q, want %q", got, itemID)
	}
	if got, _ := hit["chunk_id"].(string); got == "" {
		t.Fatalf("hit has no chunk_id: %v", hit)
	}
	if revision, _ := hit["revision"].(float64); revision < 1 {
		t.Fatalf("hit revision = %v, want >= 1", hit["revision"])
	}
	if _, ok := body["debug"]; !ok {
		t.Fatalf("search answer has no debug block: %v", body)
	}
}

// TestKnowledgePagesRevisionIncrement pins the wiki write path: a page is created
// at revision 1 and every PUT stores the next revision, which the page and the
// revision listing both report.
func TestKnowledgePagesRevisionIncrement(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceID := knowledgeCreateSpace(t, "Wiki tree", "", "")
	status, body := knowledgeDo(t, testHandler.CreateKnowledgePage,
		testutil.JSONRequest(http.MethodPost, "/api/knowledge/pages?space_id="+spaceID, map[string]any{
			"space_id": spaceID,
			"path":     "team/decisions/retrieval",
			"title":    "Retrieval decision",
			"content":  "# Retrieval decision\n\nWe fuse with RRF.\n",
		}), "", "")
	if status != http.StatusCreated {
		t.Fatalf("create page: status = %d, body = %v", status, body)
	}
	page := knowledgeObjectOf(t, body, "page")
	pageID := knowledgeString(t, page, "id")
	if revision, _ := page["revision"].(float64); revision != 1 {
		t.Fatalf("created page revision = %v, want 1", page["revision"])
	}

	for want := 2; want <= 3; want++ {
		status, body = knowledgeDo(t, testHandler.UpdateKnowledgePage,
			testutil.JSONRequest(http.MethodPut, "/api/knowledge/pages/"+pageID, map[string]any{
				"content":       fmt.Sprintf("# Retrieval decision\n\nRevision %d.\n", want),
				"base_revision": want - 1,
			}), "", "", "pageId", pageID)
		if status != http.StatusOK {
			t.Fatalf("put page revision %d: status = %d, body = %v", want, status, body)
		}
		if revision, _ := body["revision"].(float64); int(revision) != want {
			t.Fatalf("put returned revision %v, want %d", body["revision"], want)
		}
	}

	// A stale base_revision is refused rather than silently overwriting.
	status, body = knowledgeDo(t, testHandler.UpdateKnowledgePage,
		testutil.JSONRequest(http.MethodPut, "/api/knowledge/pages/"+pageID, map[string]any{
			"content":       "# Stale\n",
			"base_revision": 1,
		}), "", "", "pageId", pageID)
	if status != http.StatusBadRequest {
		t.Fatalf("stale base_revision: status = %d, body = %v", status, body)
	}

	status, body = knowledgeDo(t, testHandler.ListKnowledgePageRevisions,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/pages/"+pageID+"/revisions", nil),
		"", "", "pageId", pageID)
	if status != http.StatusOK {
		t.Fatalf("list revisions: status = %d, body = %v", status, body)
	}
	revisions, _ := body["revisions"].([]any)
	if len(revisions) != 3 {
		t.Fatalf("revision count = %d, want 3: %v", len(revisions), body)
	}
	newest, _ := revisions[0].(map[string]any)
	if revision, _ := newest["revision"].(float64); revision != 3 {
		t.Fatalf("newest revision = %v, want 3", newest["revision"])
	}

	// The tree listing reflects the path the page answers for.
	status, body = knowledgeDo(t, testHandler.ListKnowledgePages,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/pages?space_id="+spaceID, nil), "", "")
	if status != http.StatusOK {
		t.Fatalf("list pages: status = %d, body = %v", status, body)
	}
	pages, _ := body["pages"].([]any)
	if len(pages) != 1 {
		t.Fatalf("page count = %d, want 1: %v", len(pages), body)
	}
	if tree, _ := body["tree"].([]any); len(tree) != 1 {
		t.Fatalf("tree root count = %d, want 1: %v", len(tree), body)
	}
}

package knowledge

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// Agent tool surface tests: the declared schemas, the dispatch, and the fact that
// the tools obey the same permissions the HTTP surface does.

// TestToolSchemasAreValidJSON is the anti-drift check for the surface itself: a
// tool whose schema does not parse is a tool no client can register.
func TestToolSchemasAreValidJSON(t *testing.T) {
	service := testService()
	tools := service.Tools()
	if len(tools) != 3 {
		t.Fatalf("declared %d tools, want 3", len(tools))
	}
	names := map[string]bool{}
	for _, tool := range tools {
		names[tool.Name] = true
		if tool.Description == "" {
			t.Errorf("%s has no description", tool.Name)
		}
		var schema struct {
			Type       string                     `json:"type"`
			Properties map[string]json.RawMessage `json:"properties"`
			Required   []string                   `json:"required"`
		}
		if err := json.Unmarshal(tool.InputSchema, &schema); err != nil {
			t.Fatalf("%s: schema is not JSON: %v", tool.Name, err)
		}
		if schema.Type != "object" {
			t.Errorf("%s: schema type = %q, want object", tool.Name, schema.Type)
		}
		if len(schema.Properties) == 0 {
			t.Errorf("%s: schema declares no properties", tool.Name)
		}
		if len(schema.Required) == 0 {
			t.Errorf("%s: schema requires nothing", tool.Name)
		}
		for _, required := range schema.Required {
			if _, ok := schema.Properties[required]; !ok {
				t.Errorf("%s: required field %q is not a property", tool.Name, required)
			}
		}
	}
	for _, want := range []string{ToolKnowledgeSearch, ToolKnowledgeGet} {
		if !names[want] {
			t.Errorf("tool %s is not declared", want)
		}
	}
}

func TestInvokeToolRejectsUnknownName(t *testing.T) {
	service := testService()
	_, err := service.InvokeTool(context.Background(), ToolInvocation{
		Name:        "knowledge.deleteEverything",
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Args:        json.RawMessage(`{}`),
	})
	if !errors.Is(err, ErrUnknownTool) {
		t.Fatalf("unknown tool: %v, want ErrUnknownTool", err)
	}
}

// TestInvokeToolRejectsBadArguments proves a malformed call is a 400 rather than
// a silently defaulted query: an unknown field and a missing required field both
// fail.
func TestInvokeToolRejectsBadArguments(t *testing.T) {
	service := testService()
	for _, tc := range []struct {
		name string
		tool string
		args string
	}{
		{"unknown field", ToolKnowledgeSearch, `{"query":"x","limit":3}`},
		{"missing query", ToolKnowledgeSearch, `{}`},
		{"missing item", ToolKnowledgeGet, `{}`},
		{"not an object", ToolKnowledgeSearch, `"query"`},
		{"empty", ToolKnowledgeSearch, ``},
	} {
		_, err := service.InvokeTool(context.Background(), ToolInvocation{
			Name:        tc.tool,
			WorkspaceID: testWorkspaceID,
			ViewerID:    testUserID,
			Args:        json.RawMessage(tc.args),
		})
		if !errors.Is(err, ErrInvalidField) {
			t.Errorf("%s: %v, want ErrInvalidField", tc.name, err)
		}
	}
}

// TestInvokeSearchToolFindsTheImportedDocument runs knowledge.search through the
// tool surface and checks the answer is the retrieval pipeline's own.
func TestInvokeSearchToolFindsTheImportedDocument(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	service := testService()
	importForTest(t, service, spaceID, "Retrieval handbook", importDoc())

	raw, err := service.InvokeTool(context.Background(), ToolInvocation{
		Name:        ToolKnowledgeSearch,
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Args:        json.RawMessage(`{"query":"zeppelin","top_k":3}`),
	})
	if err != nil {
		t.Fatalf("InvokeTool search: %v", err)
	}
	result, ok := raw.(RetrieveResult)
	if !ok {
		t.Fatalf("search tool returned %T, want RetrieveResult", raw)
	}
	if len(result.Hits) == 0 {
		t.Fatalf("tool search returned no hits; debug=%+v", result.Debug)
	}
	if !strings.Contains(strings.ToLower(result.Hits[0].Content), "zeppelin") {
		t.Fatalf("top hit does not contain the term: %q", result.Hits[0].Content)
	}
}

// TestInvokeGetToolReadsChunksAndRespectsVisibility covers both halves of
// knowledge.get: the document comes back with its chunks, and an item outside the
// caller's workspace is forbidden rather than empty.
func TestInvokeGetToolReadsChunksAndRespectsVisibility(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	service := testService()
	itemID, _ := importForTest(t, service, spaceID, "Retrieval handbook", importDoc())

	args, err := json.Marshal(map[string]any{"item_id": itemID})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := service.InvokeTool(ctx, ToolInvocation{
		Name:        ToolKnowledgeGet,
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Args:        args,
	})
	if err != nil {
		t.Fatalf("InvokeTool get: %v", err)
	}
	result, ok := raw.(KnowledgeGetResult)
	if !ok {
		t.Fatalf("get tool returned %T, want KnowledgeGetResult", raw)
	}
	if result.Item.ID != itemID {
		t.Fatalf("item = %s, want %s", result.Item.ID, itemID)
	}
	if len(result.Chunks) == 0 {
		t.Fatal("get tool returned no chunks for an imported item")
	}

	// An item the caller cannot see is forbidden, not missing.
	otherWorkspace := dbfx.Workspace(t, "Knowledge Tool Other Workspace", "knowledge-tool-other-ws")
	dbfx.Cleanup(t, `DELETE FROM workspace WHERE id = $1`, otherWorkspace)
	otherUser := dbfx.User(t, "Tool Other User", "knowledge-tool-other-user@multica.ai")
	dbfx.Cleanup(t, `DELETE FROM "user" WHERE id = $1`, otherUser)
	foreignItem, _ := importForTestInWorkspace(t, service, otherWorkspace, testSpace(t, otherWorkspace), otherUser, "Foreign doc")

	foreignArgs, err := json.Marshal(map[string]any{"item_id": foreignItem})
	if err != nil {
		t.Fatal(err)
	}
	_, err = service.InvokeTool(ctx, ToolInvocation{
		Name:        ToolKnowledgeGet,
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Args:        foreignArgs,
	})
	if !errors.Is(err, ErrKnowledgeForbidden) {
		t.Fatalf("foreign item through the tool: %v, want ErrKnowledgeForbidden", err)
	}
}

// TestInvokeGetSkipsChunksWhenAsked keeps the tool's include_chunks flag honest.
func TestInvokeGetSkipsChunksWhenAsked(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	service := testService()
	itemID, _ := importForTest(t, service, spaceID, "Retrieval handbook", importDoc())

	args, err := json.Marshal(map[string]any{"item_id": itemID, "include_chunks": false})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := service.InvokeTool(context.Background(), ToolInvocation{
		Name:        ToolKnowledgeGet,
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Args:        args,
	})
	if err != nil {
		t.Fatalf("InvokeTool get: %v", err)
	}
	result := raw.(KnowledgeGetResult)
	if len(result.Chunks) != 0 {
		t.Fatalf("include_chunks=false returned %d chunks", len(result.Chunks))
	}
}

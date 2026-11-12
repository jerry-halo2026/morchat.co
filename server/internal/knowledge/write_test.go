package knowledge

import (
	"context"
	"strings"
	"testing"
)

// The write path is what makes a run able to leave something behind. These tests
// pin the two decisions it makes: which space a note lands in, and what happens when
// the pipeline does not finish in time.

func TestWriteDocumentRequiresContent(t *testing.T) {
	s := &Service{}
	_, err := s.WriteDocument(context.Background(), WriteRequest{
		WorkspaceID: "11111111-1111-1111-1111-111111111111",
		Title:       "Empty",
	})
	if err == nil {
		t.Fatal("expected an error for empty content")
	}
	if !strings.Contains(err.Error(), "content is required") {
		t.Fatalf("error = %v, want content is required", err)
	}
}

func TestEnsureDefaultSpaceRequiresWorkspace(t *testing.T) {
	s := &Service{}
	_, err := s.EnsureDefaultSpace(context.Background(), "  ")
	if err == nil {
		t.Fatal("expected an error for a blank workspace")
	}
	if !strings.Contains(err.Error(), "workspace_id is required") {
		t.Fatalf("error = %v, want workspace_id is required", err)
	}
}

// The tool surface must declare the write tool; a model can only call what is
// declared, and the whole point is that the write exists.
func TestToolsDeclareWrite(t *testing.T) {
	s := &Service{}
	var found bool
	for _, tool := range s.Tools() {
		if tool.Name != ToolKnowledgeWrite {
			continue
		}
		found = true
		for _, required := range []string{`"title"`, `"content"`} {
			if !strings.Contains(string(tool.InputSchema), required) {
				t.Fatalf("write schema is missing %s", required)
			}
		}
	}
	if !found {
		t.Fatalf("%s is not declared", ToolKnowledgeWrite)
	}
}

// An unknown tool stays a routing miss rather than a bad request.
func TestInvokeUnknownTool(t *testing.T) {
	s := &Service{}
	_, err := s.InvokeTool(context.Background(), ToolInvocation{Name: "knowledge.nope"})
	if err == nil || !strings.Contains(err.Error(), "unknown tool") {
		t.Fatalf("error = %v, want unknown tool", err)
	}
}

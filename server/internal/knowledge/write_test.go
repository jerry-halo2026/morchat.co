package knowledge

import (
	"context"
	"errors"
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

// The tool surface must declare the proposal tool, and must NOT declare a write
// tool: an agent can only propose, and a model can only call what is declared.
func TestToolsDeclarePropose(t *testing.T) {
	s := &Service{}
	var found bool
	for _, tool := range s.Tools() {
		if tool.Name == "knowledge.write" {
			t.Fatalf("%s is still declared; an agent must not write knowledge directly", tool.Name)
		}
		if tool.Name != ToolKnowledgePropose {
			continue
		}
		found = true
		for _, required := range []string{`"title"`, `"content"`} {
			if !strings.Contains(string(tool.InputSchema), required) {
				t.Fatalf("propose schema is missing %s", required)
			}
		}
		for _, wording := range []string{"DRAFT", "approve"} {
			if !strings.Contains(tool.Description, wording) {
				t.Fatalf("propose description does not say %q: %s", wording, tool.Description)
			}
		}
	}
	if !found {
		t.Fatalf("%s is not declared", ToolKnowledgePropose)
	}
}

// A deployment with no issue-creation wired cannot accept a proposal: answering
// "stored" would strand a draft nobody is asked to review.
func TestProposeWithoutIssueCreatorFails(t *testing.T) {
	s := &Service{}
	_, err := s.Propose(context.Background(), ProposeRequest{
		WorkspaceID: "11111111-1111-1111-1111-111111111111",
		OwnerID:     "22222222-2222-2222-2222-222222222222",
		Title:       "A conclusion",
		Content:     "something worth keeping",
	})
	if !errors.Is(err, ErrProposeUnavailable) {
		t.Fatalf("error = %v, want ErrProposeUnavailable", err)
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

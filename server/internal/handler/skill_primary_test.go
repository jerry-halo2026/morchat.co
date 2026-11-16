package handler

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// "Primary" is the agent's role skill, and it is singular: marking one clears the
// previous, and clearing it leaves the agent with none rather than reviving the
// old pick. The listing order is what the UI relies on, so it is asserted too.
func TestSetAgentSkillPrimaryKeepsOneRoleSkill(t *testing.T) {
	agentID := createHandlerTestAgent(t, "Handler Skill Primary Test", nil)
	firstID := insertHandlerTestSkill(t, "agent-skill-primary-first", "# First")
	secondID := insertHandlerTestSkill(t, "agent-skill-primary-second", "# Second")
	for _, skillID := range []string{firstID, secondID} {
		if _, err := testPool.Exec(context.Background(),
			`INSERT INTO agent_skill (agent_id, skill_id) VALUES ($1, $2)`,
			agentID, skillID,
		); err != nil {
			t.Fatalf("attach skill to agent: %v", err)
		}
	}

	setPrimary := func(skillID string, primary bool) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		req := newRequest("PUT", "/api/agents/"+agentID+"/skills/"+skillID+"/primary", map[string]any{
			"is_primary": primary,
		})
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", agentID)
		rctx.URLParams.Add("skillId", skillID)
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
		testHandler.SetAgentSkillPrimary(w, req)
		return w
	}

	if w := setPrimary(firstID, true); w.Code != 200 {
		t.Fatalf("mark first primary: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if w := setPrimary(secondID, true); w.Code != 200 {
		t.Fatalf("mark second primary: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	rows, err := testHandler.Queries.ListAgentSkillSummaries(context.Background(), parseUUID(agentID))
	if err != nil {
		t.Fatalf("list agent skills: %v", err)
	}
	var primaries []string
	for _, row := range rows {
		if row.IsPrimary {
			primaries = append(primaries, uuidToString(row.ID))
		}
	}
	if len(primaries) != 1 || primaries[0] != secondID {
		t.Fatalf("expected only the second skill primary, got %v", primaries)
	}
	// The role skill sorts first so every caller lists it at the top.
	if rows[0].ID == parseUUID(firstID) {
		t.Fatalf("primary skill must sort first: %+v", rows)
	}

	if w := setPrimary(secondID, false); w.Code != 200 {
		t.Fatalf("clear primary: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	rows, err = testHandler.Queries.ListAgentSkillSummaries(context.Background(), parseUUID(agentID))
	if err != nil {
		t.Fatalf("list agent skills: %v", err)
	}
	for _, row := range rows {
		if row.IsPrimary {
			t.Fatalf("primary not cleared: %+v", row)
		}
	}
}

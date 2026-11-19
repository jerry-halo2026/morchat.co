package handler

import (
	"net/http"
	"sync"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/events"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// The BD ledgers and the topic pool announce their writes (WORKBENCH-API §4,
// §12.6, §20.5).
//
// Two families of debt land here. `creator_activity` / `creator_quote` /
// `creator_campaign` shipped with no event at all (§20.6 recorded it), so another
// client's ledger only moved when its own mutation refetched. `media_topic:changed`
// was published by the write path but registered nowhere on the client (§12.7),
// which amounts to the same silence. The properties worth a guard are the ones a
// second screen depends on: exactly one event per successful write, a payload that
// names the row, and an actor that is the request's resolved identity rather than
// the workspace's.

// bdActivityPatch / bdQuotePatch / bdCampaignPatch drive one PATCH each through its
// handler, so the event the test counts came from the real write path.
func bdActivityPatch(t *testing.T, id string, body map[string]any) BdActivityResponse {
	t.Helper()
	req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/activities/"+id, body, testUserID),
		"activityId", id)
	return testutil.Decode[BdActivityResponse](t, testHandler.UpdateBdActivity, req, http.StatusOK)
}

func bdQuotePatch(t *testing.T, id string, body map[string]any) BdQuoteResponse {
	t.Helper()
	req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/quotes/"+id, body, testUserID),
		"quoteId", id)
	return testutil.Decode[BdQuoteResponse](t, testHandler.UpdateBdQuote, req, http.StatusOK)
}

func bdCampaignPatch(t *testing.T, id string, body map[string]any) BdCampaignResponse {
	t.Helper()
	req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/campaigns/"+id, body, testUserID),
		"campaignId", id)
	return testutil.Decode[BdCampaignResponse](t, testHandler.UpdateBdCampaign, req, http.StatusOK)
}

// workbenchEventActors records who one event type says acted. The payload is not
// enough for that question: the actor sits on the envelope, and "an agent's write
// must not read as its delegator's" (§4, COLLAB-MODEL §2/§6) is exactly that field.
type workbenchEventActors struct {
	mu    sync.Mutex
	types []string
	ids   []string
}

func collectWorkbenchEventActors(t *testing.T, eventType string) *workbenchEventActors {
	t.Helper()
	collector := &workbenchEventActors{}
	testHandler.Bus.Subscribe(eventType, func(e events.Event) {
		collector.mu.Lock()
		defer collector.mu.Unlock()
		collector.types = append(collector.types, e.ActorType)
		collector.ids = append(collector.ids, e.ActorID)
	})
	return collector
}

func (c *workbenchEventActors) snapshot() (types, ids []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.types...), append([]string(nil), c.ids...)
}

// TestBdQuoteEventCarriesTheAgentActor drives one whitelisted agent write through
// the real MCP endpoint and reads the envelope it produced: the row is the
// delegator's, the trail says agent, and the broadcast has to say the same thing or
// a second client's ledger would attribute the quote to a human who did not write it.
func TestBdQuoteEventCarriesTheAgentActor(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	creator := createWorkbenchCreator(t, testUserID, "Agent event creator")
	agentID, taskID := agentWriteFixture(t)
	actors := collectWorkbenchEventActors(t, eventBdQuoteChanged)

	_, frame := agentWriteCall(t, workbenchToolCreateQuote, map[string]any{
		"creator_id": creator.ID,
		"status":     "draft",
		"quoted_at":  "2026-11-18T09:00:00Z",
	}, testUserID, agentID, taskID)
	var quote BdQuoteResponse
	workbenchMCPOK(t, frame, &quote)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_quote WHERE id = $1`, quote.ID) })

	types, ids := actors.snapshot()
	if len(types) != 1 {
		t.Fatalf("creator_quote:changed published %d events, want 1", len(types))
	}
	if types[0] != "agent" || ids[0] != agentID {
		t.Fatalf("creator_quote:changed actor = %s/%s, want agent/%s", types[0], ids[0], agentID)
	}
}

func TestBdFollowupWritesPublishChanged(t *testing.T) {
	events := collectWorkbenchEvents(t, eventBdActivityChanged)
	creator := createWorkbenchCreator(t, testUserID, "Follow-up event creator")

	activity := bdCreateActivity(t, "", testUserID, creator.ID, nil)
	if events.count(eventBdActivityChanged) != 1 {
		t.Fatalf("create published %d events, want 1", events.count(eventBdActivityChanged))
	}
	if payload := events.last(eventBdActivityChanged); payload == nil || payload["id"] != activity.ID {
		t.Fatalf("create payload = %v, want id %s", payload, activity.ID)
	}

	bdActivityPatch(t, activity.ID, map[string]any{"kind": "call"})
	if events.count(eventBdActivityChanged) != 2 {
		t.Fatalf("update published %d events, want 2", events.count(eventBdActivityChanged))
	}

	req := withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/bd/activities/"+activity.ID, nil, testUserID),
		"activityId", activity.ID)
	testutil.Call(t, testHandler.DeleteBdActivity, req).Want(http.StatusNoContent)
	if events.count(eventBdActivityChanged) != 3 {
		t.Fatalf("delete published %d events, want 3", events.count(eventBdActivityChanged))
	}
	if payload := events.last(eventBdActivityChanged); payload == nil || payload["id"] != activity.ID {
		t.Fatalf("delete payload = %v, want id %s", payload, activity.ID)
	}
}

func TestBdQuoteWritesPublishChanged(t *testing.T) {
	events := collectWorkbenchEvents(t, eventBdQuoteChanged)
	creator := createWorkbenchCreator(t, testUserID, "Quote event creator")

	quote := bdCreateQuote(t, "", testUserID, creator.ID, nil)
	if events.count(eventBdQuoteChanged) != 1 {
		t.Fatalf("create published %d events, want 1", events.count(eventBdQuoteChanged))
	}
	if payload := events.last(eventBdQuoteChanged); payload == nil || payload["id"] != quote.ID {
		t.Fatalf("create payload = %v, want id %s", payload, quote.ID)
	}

	bdQuotePatch(t, quote.ID, map[string]any{"status": "accepted"})
	if events.count(eventBdQuoteChanged) != 2 {
		t.Fatalf("update published %d events, want 2", events.count(eventBdQuoteChanged))
	}

	req := withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/bd/quotes/"+quote.ID, nil, testUserID),
		"quoteId", quote.ID)
	testutil.Call(t, testHandler.DeleteBdQuote, req).Want(http.StatusNoContent)
	if events.count(eventBdQuoteChanged) != 3 {
		t.Fatalf("delete published %d events, want 3", events.count(eventBdQuoteChanged))
	}
}

func TestBdCampaignWritesPublishChanged(t *testing.T) {
	events := collectWorkbenchEvents(t, eventBdCampaignChanged)

	campaign := bdCreateCampaign(t, "", testUserID, map[string]any{"name": "事件批次 11 月"})
	if events.count(eventBdCampaignChanged) != 1 {
		t.Fatalf("create published %d events, want 1", events.count(eventBdCampaignChanged))
	}
	if payload := events.last(eventBdCampaignChanged); payload == nil || payload["id"] != campaign.ID {
		t.Fatalf("create payload = %v, want id %s", payload, campaign.ID)
	}

	bdCampaignPatch(t, campaign.ID, map[string]any{"note": "改名前的备注"})
	if events.count(eventBdCampaignChanged) != 2 {
		t.Fatalf("update published %d events, want 2", events.count(eventBdCampaignChanged))
	}

	req := withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/bd/campaigns/"+campaign.ID, nil, testUserID),
		"campaignId", campaign.ID)
	testutil.Call(t, testHandler.DeleteBdCampaign, req).Want(http.StatusNoContent)
	if events.count(eventBdCampaignChanged) != 3 {
		t.Fatalf("delete published %d events, want 3", events.count(eventBdCampaignChanged))
	}
	if payload := events.last(eventBdCampaignChanged); payload == nil || payload["id"] != campaign.ID {
		t.Fatalf("delete payload = %v, want id %s", payload, campaign.ID)
	}
}

// TestMediaTopicCrudPublishesChanged covers the topic pool's own CRUD, which is the
// gap §12.7 named: only `/adopt` was wired end to end, so an operator's edit never
// reached a second client's pool.
func TestMediaTopicCrudPublishesChanged(t *testing.T) {
	events := collectWorkbenchEvents(t, eventMediaTopicChanged)
	ip := mediaIPFixture(t, testUserID, "选题事件 IP")

	topic := mediaTopicFixture(t, testUserID, ip.ID, "选题事件：收纳盒到底值不值")
	if events.count(eventMediaTopicChanged) != 1 {
		t.Fatalf("create published %d events, want 1", events.count(eventMediaTopicChanged))
	}
	if payload := events.last(eventMediaTopicChanged); payload == nil || payload["id"] != topic.ID {
		t.Fatalf("create payload = %v, want id %s", payload, topic.ID)
	}

	req := mediaURLParams(workbenchRequest(t, "PATCH", "/api/workbench/media/topics/"+topic.ID,
		map[string]any{"status": "scripting"}, testUserID), map[string]string{"topicId": topic.ID})
	testutil.Decode[MediaTopicResponse](t, testHandler.UpdateMediaTopic, req, http.StatusOK)
	if events.count(eventMediaTopicChanged) != 2 {
		t.Fatalf("update published %d events, want 2", events.count(eventMediaTopicChanged))
	}

	req = mediaURLParams(workbenchRequest(t, "DELETE", "/api/workbench/media/topics/"+topic.ID, nil, testUserID),
		map[string]string{"topicId": topic.ID})
	testutil.Call(t, testHandler.DeleteMediaTopic, req).Want(http.StatusNoContent)
	if events.count(eventMediaTopicChanged) != 3 {
		t.Fatalf("delete published %d events, want 3", events.count(eventMediaTopicChanged))
	}
	if payload := events.last(eventMediaTopicChanged); payload == nil || payload["id"] != topic.ID {
		t.Fatalf("delete payload = %v, want id %s", payload, topic.ID)
	}
}

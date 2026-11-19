package handler

// `media.publish` is the last capability that used to be declared but never
// checked (§24.1, §27.6). These two cases pin its anchor: a post's create, edit and
// delete are "this content went live", while reading the ledger and recording a
// day's numbers are not (§12.3, §24.5).
//
// Both cases also prove the gate is the *capability* and not ownership: the post is
// owned by the member in every assertion, so a 403 can only come from the capability
// check that runs before the row is resolved.

import (
	"net/http"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// createWorkbenchCreatorFor creates a creator owned by ownerUserID while acting as
// the workspace owner.
//
// The fixture path matters: creating a creator needs `crm.write`, which the members
// these cases are about do not hold — that is the point of the case. Handing them a
// row to own from the owner's side keeps the assertion about the publish gate.
func createWorkbenchCreatorFor(t *testing.T, ownerUserID, displayName string) CreatorResponse {
	t.Helper()
	body := map[string]any{
		"kind":            "external",
		"display_name":    displayName,
		"platform":        "douyin",
		"handle":          strings.NewReplacer(" ", "-").Replace(strings.ToLower(displayName)),
		"owner_member_id": ownerUserID,
	}
	req := workbenchRequest(t, "POST", "/api/workbench/creators", body, testUserID)
	created := testutil.Decode[CreatorResponse](t, testHandler.CreateCreator, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator WHERE id = $1`, created.ID) })
	return created
}

// TestCreatorPostPublishNeedsMediaPublish covers the narrowing: a member who may
// track numbers may not put content live, and the refusal names `media.publish`
// rather than the write it does hold.
func TestCreatorPostPublishNeedsMediaPublish(t *testing.T) {
	// A title whose template grants the media write but not the publish. The
	// baseline fixture template grants `media.publish`, so the narrowing needs its
	// own row.
	seedRoleTemplate(t, "复盘员", "{media.read,media.write}")
	memberUserID := capabilityMember(t, "no-publish", "", "复盘员")

	creator := createWorkbenchCreatorFor(t, memberUserID, "No publish creator")
	// The owner publishes it; the post belongs to the member through the creator,
	// so everything below may proceed on ownership alone.
	post := createWorkbenchPost(t, creator.ID, "https://example.test/no-publish/post-1")

	postBody := map[string]any{
		"creator_id":   creator.ID,
		"platform":     "douyin",
		"url":          "https://example.test/no-publish/post-2",
		"published_at": "2026-11-12T09:00:00Z",
	}
	var body map[string]any

	// Create is a publish.
	req := workbenchRequest(t, "POST", "/api/workbench/creator-posts", postBody, memberUserID)
	testutil.Call(t, testHandler.CreateCreatorPost, req).Want(http.StatusForbidden).JSON(&body)
	if body["error"] != "forbidden_capability" || body["capability"] != capMediaPublish {
		t.Fatalf("create 403 body = %v, want forbidden_capability {capability: media.publish}", body)
	}

	// So is an edit to the published row.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/creator-posts/"+post.ID,
		map[string]any{"title": "renamed"}, memberUserID), "postId", post.ID)
	testutil.Call(t, testHandler.UpdateCreatorPost, req).Want(http.StatusForbidden).JSON(&body)
	if body["capability"] != capMediaPublish {
		t.Fatalf("patch 403 body = %v, want capability media.publish", body)
	}

	// Taking a publish down uses the same right as putting it up.
	req = withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/creator-posts/"+post.ID, nil, memberUserID), "postId", post.ID)
	testutil.Call(t, testHandler.DeleteCreatorPost, req).Want(http.StatusForbidden).JSON(&body)
	if body["capability"] != capMediaPublish {
		t.Fatalf("delete 403 body = %v, want capability media.publish", body)
	}

	// Nothing was archived by the refused delete.
	req = workbenchRequest(t, "GET", "/api/workbench/creator-posts?creator_id="+creator.ID, nil, memberUserID)
	var posts struct {
		Posts []CreatorPostResponse `json:"posts"`
		Total int                   `json:"total"`
	}
	testutil.Call(t, testHandler.ListCreatorPosts, req).Want(http.StatusOK).JSON(&posts)
	found := false
	for _, candidate := range posts.Posts {
		if candidate.ID == post.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("post %s is gone after a refused delete", post.ID)
	}

	// Reading the snapshots stays behind `media.read`.
	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/creator-posts/"+post.ID+"/metrics", nil, memberUserID), "postId", post.ID)
	testutil.Call(t, testHandler.ListCreatorPostMetrics, req).Want(http.StatusOK)

	// Filling in a day's numbers is `media.write`, not a publish: the member holds
	// that and owns the post, so it is accepted.
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/creator-posts/"+post.ID+"/metrics", map[string]any{
		"captured_on": "2026-11-12",
		"play":        800,
	}, memberUserID), "postId", post.ID)
	created := testutil.Decode[CreatorPostMetricResponse](t, testHandler.UpsertCreatorPostMetric, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_post_metric WHERE id = $1`, created.ID) })
	if created.Play == nil || *created.Play != 800 {
		t.Fatalf("play = %v, want 800", created.Play)
	}
}

// TestCreatorPostPublishFromDepartmentTemplate covers the other end: the 内容
// department's default set (§24.2 step 3) is exactly `media.read media.write
// media.publish crm.read`, and its members must be able to run the whole post
// lifecycle. Before the gate existed, the publish right was decorative for them:
// the post writes asked for `crm.write`, which they do not have.
func TestCreatorPostPublishFromDepartmentTemplate(t *testing.T) {
	departmentID := capabilityDepartment(t, "内容部")
	memberUserID := capabilityMember(t, "content", departmentID, "")

	creator := createWorkbenchCreatorFor(t, memberUserID, "Content department creator")

	// Publish.
	req := workbenchRequest(t, "POST", "/api/workbench/creator-posts", map[string]any{
		"creator_id":   creator.ID,
		"platform":     "douyin",
		"url":          "https://example.test/content/post-1",
		"published_at": "2026-11-13T09:00:00Z",
	}, memberUserID)
	post := testutil.Decode[CreatorPostResponse](t, testHandler.CreateCreatorPost, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_post WHERE id = $1`, post.ID) })

	// Edit the published row.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/creator-posts/"+post.ID,
		map[string]any{"title": "首条发布"}, memberUserID), "postId", post.ID)
	patched := testutil.Decode[CreatorPostResponse](t, testHandler.UpdateCreatorPost, req, http.StatusOK)
	if patched.Title == nil || *patched.Title != "首条发布" {
		t.Fatalf("title = %v, want 首条发布", patched.Title)
	}

	// Read the ledger and the snapshots.
	req = workbenchRequest(t, "GET", "/api/workbench/creator-posts?creator_id="+creator.ID, nil, memberUserID)
	testutil.Call(t, testHandler.ListCreatorPosts, req).Want(http.StatusOK)
	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/creator-posts/"+post.ID+"/metrics", nil, memberUserID), "postId", post.ID)
	testutil.Call(t, testHandler.ListCreatorPostMetrics, req).Want(http.StatusOK)

	// Backfill a day.
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/creator-posts/"+post.ID+"/metrics", map[string]any{
		"captured_on": "2026-11-13",
		"play":        1200,
	}, memberUserID), "postId", post.ID)
	metric := testutil.Decode[CreatorPostMetricResponse](t, testHandler.UpsertCreatorPostMetric, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_post_metric WHERE id = $1`, metric.ID) })

	// Withdraw it.
	req = withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/creator-posts/"+post.ID, nil, memberUserID), "postId", post.ID)
	testutil.Call(t, testHandler.DeleteCreatorPost, req).Want(http.StatusNoContent)
}

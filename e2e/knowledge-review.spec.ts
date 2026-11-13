import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTestApi } from "./helpers";

/**
 * The knowledge gate is an API rule, not a screen: an item may only become
 * `active` through a human decision backed by a finished review issue. This spec
 * drives that rule end to end against the real server, without a browser, because
 * the agent side of the chain needs a live task token (covered by handler tests).
 */
test("a knowledge item only goes active through a finished review issue", async () => {
  test.setTimeout(120_000);
  const api = await createTestApi();

  const space = await api.createKnowledgeSpace(`E2E Knowledge ${Date.now()}`);
  const reviewIssue = await api.createIssue("[知识入库] E2E review");
  await api.updateIssue(reviewIssue.id, { status: "done" });

  try {
    const item = await api.createKnowledgeItem({
      space_id: space.id,
      title: "E2E knowledge draft",
      status: "draft",
      source_ref: "library:e2e-asset-1",
      content: "A conclusion that still needs a human.",
    });
    expect(item.status).toBe("draft");

    // No review issue: the gate refuses, and says why.
    const missing = await api.approveKnowledgeItem(item.id, "");
    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.body)).toContain("knowledge_review_required");

    // An issue that does not exist (or is not finished) cannot stand in for review.
    const bogus = await api.approveKnowledgeItem(item.id, randomUUID());
    expect(bogus.status).toBe(400);
    expect(JSON.stringify(bogus.body)).toContain("knowledge_review_issue_invalid");

    // The finished review issue does the job.
    const approved = await api.approveKnowledgeItem(item.id, reviewIssue.id);
    expect(approved.status).toBe(200);

    const stored = await api.getKnowledgeItem(item.id);
    expect(stored.status).toBe("active");
    expect(stored.review?.review_issue_id).toBe(reviewIssue.id);
    expect(stored.review?.reviewed_at).toBeTruthy();
    expect(stored.review?.stale_after).toBeTruthy();

    // The audit endpoint answers all three report buckets.
    const audit = await api.knowledgeReviewAudit();
    expect(Array.isArray(audit.unreviewed_active)).toBe(true);
    expect(Array.isArray(audit.stale)).toBe(true);
    expect(Array.isArray(audit.orphaned)).toBe(true);
  } finally {
    await api.cleanup();
  }
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWithFallback } from "./schema";
import {
  CreatorListResponseSchema,
  CreatorPostListResponseSchema,
  CreatorPostMetricListResponseSchema,
  CreatorPostSchema,
  CreatorSchema,
  CrmBriefListResponseSchema,
  CrmBriefSchema,
  CrmClientListResponseSchema,
  CrmCollabListResponseSchema,
  CrmCollabSchema,
  CrmSettlementListResponseSchema,
  EMPTY_CREATOR,
  EMPTY_CREATOR_LIST_RESPONSE,
  EMPTY_CREATOR_POST,
  EMPTY_CREATOR_POST_LIST_RESPONSE,
  EMPTY_CREATOR_POST_METRIC_LIST_RESPONSE,
  EMPTY_CRM_BRIEF,
  EMPTY_CRM_BRIEF_LIST_RESPONSE,
  EMPTY_CRM_CLIENT_LIST_RESPONSE,
  EMPTY_CRM_COLLAB,
  EMPTY_CRM_COLLAB_LIST_RESPONSE,
  EMPTY_CRM_SETTLEMENT_LIST_RESPONSE,
  EMPTY_WORKBENCH_COUNTS_RESPONSE,
  WorkbenchCountsResponseSchema,
} from "./schemas";

const endpoint = "workbench-test";

// One row of each ledger as the migration in docs/engineering/WORKBENCH-API.md §2
// defines it, kept to the fields a client cannot render without.
const creator = {
  id: "creator-1",
  workspace_id: "ws",
  kind: "external",
  display_name: "Creator One",
  platform: "douyin",
  handle: "@one",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("workbench ledger schemas", () => {
  it("fills absent nullable columns with null and counters with zero", () => {
    const parsed = CreatorListResponseSchema.parse({ creators: [creator], total: 1 });
    expect(parsed.creators[0]).toMatchObject({
      id: "creator-1",
      url: null,
      fans: 0,
      fans_d7: 0,
      avg_play: 0,
      engagement_rate: null,
      score: null,
      risk_flag: false,
      archived_at: null,
    });
    // Cursor paging: a page with no cursor is the last page, not an error.
    expect(parsed.next_cursor).toBeNull();
  });

  it("keeps unknown enum values instead of rejecting the row", () => {
    // A newer server may add a collab stage or a settlement mode. The row must
    // still parse so the UI can default-case it: dropping the row would hide
    // money that exists.
    const parsed = CrmCollabListResponseSchema.parse({
      collabs: [{ id: "collab-1", stage: "future_stage", settlement_mode: "rev_share" }],
      total: 1,
    });
    expect(parsed.collabs[0]?.stage).toBe("future_stage");
    expect(parsed.collabs[0]?.settlement_mode).toBe("rev_share");
  });

  it("treats a missing TEXT[] platform list as empty, never null", () => {
    const parsed = CrmBriefListResponseSchema.parse({
      briefs: [{ id: "brief-1", client_id: "client-1", title: "Launch" }],
    });
    expect(parsed.briefs[0]?.platforms).toEqual([]);
    expect(parsed.briefs[0]?.status).toBe("draft");
  });

  it("keeps a money amount null when it was never quoted", () => {
    const parsed = CrmCollabListResponseSchema.parse({
      collabs: [{ id: "collab-1", final_amount: null, quote_amount: 1200 }],
    });
    expect(parsed.collabs[0]?.final_amount).toBeNull();
    expect(parsed.collabs[0]?.quote_amount).toBe(1200);
    expect(parsed.collabs[0]?.currency).toBe("CNY");
  });

  it("keeps a one-sided metric snapshot one-sided", () => {
    // A platform that reports likes only must not be recorded as zero plays.
    const parsed = CreatorPostMetricListResponseSchema.parse({
      metrics: [{ id: "metric-1", post_id: "post-1", captured_on: "2026-01-02", likes: 12 }],
    });
    expect(parsed.metrics[0]).toMatchObject({
      play: null,
      likes: 12,
      gmv_amount: null,
      currency: "CNY",
    });
  });

  it.each([
    ["creators", CreatorListResponseSchema, EMPTY_CREATOR_LIST_RESPONSE],
    ["posts", CreatorPostListResponseSchema, EMPTY_CREATOR_POST_LIST_RESPONSE],
    ["metrics", CreatorPostMetricListResponseSchema, EMPTY_CREATOR_POST_METRIC_LIST_RESPONSE],
    ["clients", CrmClientListResponseSchema, EMPTY_CRM_CLIENT_LIST_RESPONSE],
    ["briefs", CrmBriefListResponseSchema, EMPTY_CRM_BRIEF_LIST_RESPONSE],
    ["collabs", CrmCollabListResponseSchema, EMPTY_CRM_COLLAB_LIST_RESPONSE],
    ["settlements", CrmSettlementListResponseSchema, EMPTY_CRM_SETTLEMENT_LIST_RESPONSE],
  ])("falls back to an empty %s page on a malformed body", (_label, schema, fallback) => {
    for (const malformed of [null, "not-an-array", 42]) {
      expect(parseWithFallback(malformed, schema, fallback, { endpoint })).toEqual(fallback);
    }
  });

  it("parses the sidebar counts and defaults every missing counter", () => {
    expect(WorkbenchCountsResponseSchema.parse({ creators: 3, collabs_open: 2 })).toEqual({
      creators: 3,
      clients: 0,
      briefs: 0,
      collabs_open: 2,
      settlements_pending: 0,
    });
    expect(
      parseWithFallback(
        { creators: "many" },
        WorkbenchCountsResponseSchema,
        EMPTY_WORKBENCH_COUNTS_RESPONSE,
        { endpoint },
      ),
    ).toEqual(EMPTY_WORKBENCH_COUNTS_RESPONSE);
  });

  it("degrades a single malformed detail row to the empty record", () => {
    // Detail reads gate an edit form; an id-less body must never be rendered as
    // a row, because the form would then save against an empty id.
    expect(parseWithFallback({ id: 42 }, CrmCollabSchema, EMPTY_CRM_COLLAB, { endpoint })).toEqual(
      EMPTY_CRM_COLLAB,
    );
    expect(parseWithFallback({ id: 42 }, CrmBriefSchema, EMPTY_CRM_BRIEF, { endpoint })).toEqual(
      EMPTY_CRM_BRIEF,
    );
    expect(parseWithFallback({ id: 42 }, CreatorPostSchema, EMPTY_CREATOR_POST, { endpoint })).toEqual(
      EMPTY_CREATOR_POST,
    );
    expect(parseWithFallback("not-an-object", CreatorSchema, EMPTY_CREATOR, { endpoint })).toEqual(
      EMPTY_CREATOR,
    );
  });
});

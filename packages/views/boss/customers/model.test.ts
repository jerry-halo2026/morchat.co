// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CrmBrief, CrmClient, CrmCollab, CrmCollabStage } from "@morechat/core/types";
import {
  briefBudget,
  briefsOfClient,
  clientRows,
  clientStage,
  collabsOfBrief,
  collabsOfBriefs,
} from "./model";

/**
 * 客户商机's two rules, pinned without a DOM:
 *
 *   - 归属: a brief belongs to the client whose `client_id` it carries, and a
 *     collab to the brief named by its `brief_id`. The filters are what stop one
 *     customer's drawer from showing another's work.
 *   - 状态 is derived, because `crm_client` has no status column: the ladder in
 *     `clientStage` is checked here case by case.
 */

const WS = "ws-1";

function client(id: string, overrides: Partial<CrmClient> = {}): CrmClient {
  return {
    id,
    workspace_id: WS,
    name: `客户 ${id}`,
    brand: null,
    industry: null,
    contact_name: null,
    contact_channel: null,
    contract_entity: null,
    payment_terms: null,
    credit_note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function brief(
  id: string,
  clientId: string,
  overrides: Partial<CrmBrief> = {},
): CrmBrief {
  return {
    id,
    workspace_id: WS,
    client_id: clientId,
    title: `需求 ${id}`,
    category: null,
    budget_min_amount: null,
    budget_max_amount: null,
    target_audience: null,
    deliverable_type: null,
    platforms: [],
    schedule_from: null,
    schedule_to: null,
    kpi_play: null,
    kpi_gmv_amount: null,
    status: "open",
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-02T02:00:00Z",
    updated_at: "2026-11-02T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function collab(
  id: string,
  briefId: string,
  stage: CrmCollabStage,
  overrides: Partial<CrmCollab> = {},
): CrmCollab {
  return {
    id,
    workspace_id: WS,
    brief_id: briefId,
    creator_id: "creator-1",
    stage,
    quote_amount: null,
    final_amount: null,
    prob: null,
    creator_fee: null,
    sample_cost: null,
    platform_fee: null,
    currency: "CNY",
    settlement_mode: null,
    commission_rate: null,
    sample_required: false,
    script_required: false,
    scheduled_at: null,
    confirmed_at: null,
    published_at: null,
    accepted_at: null,
    issue_id: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-03T02:00:00Z",
    updated_at: "2026-11-03T02:00:00Z",
    archived_at: null,
    publish_url: null,
    settled_on: null,
    ...overrides,
  };
}

describe("归属：客户 → 需求单 → 合作单", () => {
  const briefs = [
    brief("b-1", "c-1", { created_at: "2026-11-02T02:00:00Z" }),
    brief("b-2", "c-1", { created_at: "2026-11-05T02:00:00Z" }),
    brief("b-9", "c-2"),
  ];
  const collabs = [
    collab("k-1", "b-1", "inquiry", { created_at: "2026-11-03T02:00:00Z" }),
    collab("k-2", "b-2", "confirmed", { created_at: "2026-11-04T02:00:00Z" }),
    collab("k-9", "b-9", "confirmed", { created_at: "2026-11-05T02:00:00Z" }),
  ];

  it("keeps only the briefs this client carries, newest first", () => {
    expect(briefsOfClient(briefs, "c-1").map((row) => row.id)).toEqual(["b-2", "b-1"]);
    expect(briefsOfClient(briefs, "c-2").map((row) => row.id)).toEqual(["b-9"]);
  });

  it("never attaches a collab whose brief belongs to another client", () => {
    const own = new Set(briefsOfClient(briefs, "c-1").map((row) => row.id));
    expect(collabsOfBriefs(collabs, own).map((row) => row.id)).toEqual(["k-2", "k-1"]);
  });

  it("groups one brief's collabs on their own", () => {
    expect(collabsOfBrief(collabs, "b-2").map((row) => row.id)).toEqual(["k-2"]);
    expect(collabsOfBrief(collabs, "b-9").map((row) => row.id)).toEqual(["k-9"]);
  });
});

describe("状态标签由链路推导", () => {
  it("is 没有需求单 when nothing was asked for", () => {
    expect(clientStage([], [])).toBe("none");
    // A stray collab cannot rescue a client with no brief.
    expect(clientStage([], [collab("k-1", "b-1", "settled")])).toBe("none");
  });

  it("is 跟进中 while a brief or a collab is still live", () => {
    expect(clientStage([brief("b-1", "c-1", { status: "open" })], [])).toBe("active");
    // A closed brief still has work running under it.
    expect(
      clientStage(
        [brief("b-1", "c-1", { status: "closed" })],
        [collab("k-1", "b-1", "sampling")],
      ),
    ).toBe("active");
  });

  it("is 已成交 once a collab was accepted or settled", () => {
    expect(
      clientStage(
        [brief("b-1", "c-1", { status: "open" })],
        [collab("k-1", "b-1", "settled")],
      ),
    ).toBe("won");
    expect(
      clientStage(
        [brief("b-1", "c-1", { status: "closed" })],
        [collab("k-1", "b-1", "accepted")],
      ),
    ).toBe("won");
  });

  it("is 已结束 when every brief is closed and no collab is left running", () => {
    expect(
      clientStage(
        [brief("b-1", "c-1", { status: "closed" })],
        [collab("k-1", "b-1", "cancelled")],
      ),
    ).toBe("closed");
    expect(clientStage([brief("b-1", "c-1", { status: "closed" })], [])).toBe("closed");
  });
});

describe("表格行", () => {
  const clients = [
    client("c-1", {
      name: "海川跨境",
      industry: "跨境电商",
      updated_at: "2026-11-10T02:00:00Z",
    }),
    client("c-2", {
      name: "岸上咖啡",
      contact_name: "曹总",
      updated_at: "2026-11-12T02:00:00Z",
    }),
  ];
  const briefs = [brief("b-1", "c-1"), brief("b-2", "c-2")];
  const collabs = [collab("k-1", "b-1", "confirmed"), collab("k-2", "b-2", "inquiry")];

  it("orders by the last touch and carries each client's own slice", () => {
    const rows = clientRows(clients, briefs, collabs);
    expect(rows.map((row) => row.client.id)).toEqual(["c-2", "c-1"]);
    expect(rows[1]!.briefs.map((row) => row.id)).toEqual(["b-1"]);
    expect(rows[1]!.collabs.map((row) => row.id)).toEqual(["k-1"]);
    expect(rows[1]!.stage).toBe("active");
  });

  it("searches the fields the row prints, and only those", () => {
    expect(clientRows(clients, briefs, collabs, "跨境").map((row) => row.client.id)).toEqual([
      "c-1",
    ]);
    expect(clientRows(clients, briefs, collabs, "曹总").map((row) => row.client.id)).toEqual([
      "c-2",
    ]);
    expect(clientRows(clients, briefs, collabs, "海川").map((row) => row.client.id)).toEqual([
      "c-1",
    ]);
    expect(clientRows(clients, briefs, collabs, "没人")).toEqual([]);
    expect(clientRows(clients, briefs, collabs, "   ")).toHaveLength(2);
  });
});

describe("预算", () => {
  it("carries the two sides separately — one side alone is a real answer", () => {
    expect(briefBudget(brief("b-1", "c-1"))).toEqual({ min: null, max: null });
    expect(
      briefBudget(brief("b-1", "c-1", { budget_min_amount: 5000, budget_max_amount: 8000 })),
    ).toEqual({ min: 5000, max: 8000 });
    expect(briefBudget(brief("b-1", "c-1", { budget_min_amount: 5000 }))).toEqual({
      min: 5000,
      max: null,
    });
  });
});

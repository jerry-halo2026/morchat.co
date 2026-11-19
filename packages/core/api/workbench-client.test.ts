// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";

afterEach(() => vi.unstubAllGlobals());

/**
 * Stubs `fetch` and returns the recorded calls, so a test can assert both the
 * decoded body AND the exact path the contract names — a wrong path degrades to
 * a 404 that parseWithFallback would otherwise hide.
 */
function stubFetch(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(async () =>
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function calledUrl(fetchMock: ReturnType<typeof stubFetch>): string {
  const first = fetchMock.mock.calls[0] as unknown as [string];
  return first[0];
}

function calledInit(fetchMock: ReturnType<typeof stubFetch>): RequestInit | undefined {
  const first = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
  return first[1];
}

const client = () => new ApiClient("https://api.example.test");

const creator = {
  id: "creator-1",
  workspace_id: "ws",
  kind: "external",
  display_name: "Creator One",
  platform: "douyin",
  handle: "@one",
};

describe("workbench API paths (contract §3)", () => {
  it("sends the creator filters as query params and omits absent ones", async () => {
    const fetchMock = stubFetch({ creators: [creator], total: 1, next_cursor: null });
    await client().listCreators({ kind: "external", q: "one", limit: 20, cursor: "c1", department_id: "d1" });

    const url = new URL(calledUrl(fetchMock));
    expect(url.pathname).toBe("/api/workbench/creators");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      kind: "external",
      q: "one",
      limit: "20",
      cursor: "c1",
      department_id: "d1",
    });

    const empty = stubFetch({ creators: [], total: 0, next_cursor: null });
    await client().listCreators({ kind: undefined, q: "" });
    expect(calledUrl(empty)).toBe("https://api.example.test/api/workbench/creators");
  });

  it("scopes the aggregates by department_id, or not at all when unset", async () => {
    const scoped = stubFetch({ metrics: {} });
    await client().getWorkbenchOverview({ department_id: "dept-1" });
    expect(calledUrl(scoped)).toBe(
      "https://api.example.test/api/workbench/overview?department_id=dept-1",
    );

    const all = stubFetch({ metrics: {} });
    await client().getWorkbenchOverview({ department_id: null });
    expect(calledUrl(all)).toBe("https://api.example.test/api/workbench/overview");

    const counts = stubFetch({ creators: 1 });
    await client().getWorkbenchCounts({ department_id: "dept-1" });
    expect(calledUrl(counts)).toBe(
      "https://api.example.test/api/workbench/counts?department_id=dept-1",
    );
  });

  it("keeps paid=false in the settlement query — it is a filter, not an absence", async () => {
    const fetchMock = stubFetch({ settlements: [], total: 0 });
    await client().listCrmSettlements({ collab_id: "collab-1", paid: false });

    const url = new URL(calledUrl(fetchMock));
    expect(url.pathname).toBe("/api/workbench/crm/settlements");
    expect(Object.fromEntries(url.searchParams)).toEqual({ collab_id: "collab-1", paid: "false" });
  });

  it("puts the delete's expected_revision in the query string, not a body", async () => {
    // A DELETE body is not portable, so the §3 guard travels as a parameter
    // (WORKBENCH-API §3.5) — and an unguarded delete sends no parameter at all,
    // which is what the server reads as "do not check" (old clients).
    const guarded = stubFetch({});
    await client().deleteCrmCollab("collab-1", 4);
    const url = new URL(calledUrl(guarded));
    expect(url.pathname).toBe("/api/workbench/crm/collabs/collab-1");
    expect(Object.fromEntries(url.searchParams)).toEqual({ expected_revision: "4" });
    expect(calledInit(guarded)?.method).toBe("DELETE");
    expect(calledInit(guarded)?.body).toBeUndefined();

    const legacy = stubFetch({});
    await client().deleteBdQuote("quote-1");
    const legacyUrl = new URL(calledUrl(legacy));
    expect(legacyUrl.pathname).toBe("/api/workbench/bd/quotes/quote-1");
    expect(legacyUrl.search).toBe("");
    expect(calledInit(legacy)?.method).toBe("DELETE");

    const revisioned = stubFetch({});
    await client().deleteBdQuote("quote-1", 7);
    expect(new URL(calledUrl(revisioned)).searchParams.get("expected_revision")).toBe("7");
  });

  it("names every ledger path the contract registers", async () => {
    const cases: Array<[string, string, (c: ApiClient) => Promise<unknown>]> = [
      ["GET", "/api/workbench/creators/creator-1", (c) => c.getCreator("creator-1")],
      ["PATCH", "/api/workbench/creators/creator-1", (c) => c.updateCreator("creator-1", { fans: 1 })],
      ["DELETE", "/api/workbench/creators/creator-1", (c) => c.deleteCreator("creator-1")],
      ["GET", "/api/workbench/creator-posts", (c) => c.listCreatorPosts()],
      ["PATCH", "/api/workbench/creator-posts/post-1", (c) => c.updateCreatorPost("post-1", { title: "t" })],
      ["DELETE", "/api/workbench/creator-posts/post-1", (c) => c.deleteCreatorPost("post-1")],
      ["GET", "/api/workbench/creator-posts/post-1/metrics", (c) => c.listCreatorPostMetrics("post-1")],
      ["GET", "/api/workbench/crm/clients", (c) => c.listCrmClients()],
      ["GET", "/api/workbench/crm/clients/client-1", (c) => c.getCrmClient("client-1")],
      ["PATCH", "/api/workbench/crm/clients/client-1", (c) => c.updateCrmClient("client-1", { name: "n" })],
      ["DELETE", "/api/workbench/crm/clients/client-1", (c) => c.deleteCrmClient("client-1")],
      ["GET", "/api/workbench/crm/briefs", (c) => c.listCrmBriefs()],
      ["GET", "/api/workbench/crm/briefs/brief-1", (c) => c.getCrmBrief("brief-1")],
      ["PATCH", "/api/workbench/crm/briefs/brief-1", (c) => c.updateCrmBrief("brief-1", { title: "t" })],
      ["DELETE", "/api/workbench/crm/briefs/brief-1", (c) => c.deleteCrmBrief("brief-1")],
      ["GET", "/api/workbench/crm/collabs", (c) => c.listCrmCollabs()],
      ["GET", "/api/workbench/crm/collabs/collab-1", (c) => c.getCrmCollab("collab-1")],
      ["PATCH", "/api/workbench/crm/collabs/collab-1", (c) => c.updateCrmCollab("collab-1", { stage: "confirmed" })],
      ["DELETE", "/api/workbench/crm/collabs/collab-1", (c) => c.deleteCrmCollab("collab-1")],
      ["PATCH", "/api/workbench/crm/settlements/settle-1", (c) => c.updateCrmSettlement("settle-1", { paid_at: "2026-01-02" })],
      ["DELETE", "/api/workbench/crm/settlements/settle-1", (c) => c.deleteCrmSettlement("settle-1")],
    ];

    for (const [method, path, call] of cases) {
      const fetchMock = stubFetch({ id: "row", workspace_id: "ws" });
      await call(client());
      const url = new URL(calledUrl(fetchMock));
      expect(`${method} ${url.pathname}`).toBe(`${method} ${path}`);
      expect(calledInit(fetchMock)?.method ?? "GET").toBe(method);
    }
  });

  it("posts the upsert body to the post's metric collection", async () => {
    const fetchMock = stubFetch({ id: "metric-1", post_id: "post-1", captured_on: "2026-01-02" });
    await client().upsertCreatorPostMetric("post-1", {
      captured_on: "2026-01-02",
      play: 100,
      gmv_amount: 12.5,
    });

    const url = new URL(calledUrl(fetchMock));
    expect(url.pathname).toBe("/api/workbench/creator-posts/post-1/metrics");
    expect(calledInit(fetchMock)?.method).toBe("POST");
    expect(JSON.parse(String(calledInit(fetchMock)?.body))).toEqual({
      captured_on: "2026-01-02",
      play: 100,
      gmv_amount: 12.5,
    });
  });

  it("falls back on a malformed body instead of throwing", async () => {
    const malformed = stubFetch({ creators: "nope", metrics: "nope", settlements: 7 });

    const list = await client().listCreators();
    expect(list).toEqual({ creators: [], total: 0, next_cursor: null });

    const overview = await client().getWorkbenchOverview();
    expect(overview).toEqual({ metrics: {} });

    const settlements = await client().listCrmSettlements();
    expect(settlements).toEqual({ settlements: [], total: 0 });

    const detail = await client().getCrmCollab("collab-1");
    expect(detail.id).toBe("");

    void malformed;
  });
});

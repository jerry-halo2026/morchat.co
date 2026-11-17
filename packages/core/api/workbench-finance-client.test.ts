// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { EMPTY_WORKBENCH_FINANCE_RESPONSE } from "./schemas";

afterEach(() => vi.unstubAllGlobals());

/**
 * Stubs `fetch` and returns the recorded calls: the money block's path is part of
 * the contract, and a wrong path would degrade to a 404 that `parseWithFallback`
 * turns into a page of gap cards instead of an error.
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

const client = () => new ApiClient("https://api.example.test");

const figure = {
  window: { month: "2026-11" },
  signed: { value: 10000, sample_count: 1, empty: "zero" },
  collected: { value: 3000, sample_count: 1, empty: "zero" },
  gross_margin: { value: 0.6667, sample_count: 1, empty: "zero" },
  receivable_days: { value: null, sample_count: 0, empty: "insufficient_data" },
  cash_floor: { value: null, sample_count: 0, empty: "insufficient_data" },
};

describe("workbench finance client (contract §3)", () => {
  it("scopes the money block by department_id, or not at all when unset", async () => {
    const scoped = stubFetch(figure);
    const parsed = await client().getWorkbenchFinance({ department_id: "dept-1" });
    expect(calledUrl(scoped)).toBe(
      "https://api.example.test/api/workbench/finance?department_id=dept-1",
    );
    expect(parsed.signed.value).toBe(10000);
    expect(parsed.receivable_days.value).toBeNull();

    const all = stubFetch(figure);
    await client().getWorkbenchFinance({ department_id: null });
    expect(calledUrl(all)).toBe("https://api.example.test/api/workbench/finance");
  });

  it("degrades a malformed body to the all-gaps block", async () => {
    stubFetch({ signed: "10000", collected: 7 });
    expect(await client().getWorkbenchFinance()).toEqual(EMPTY_WORKBENCH_FINANCE_RESPONSE);
  });
});

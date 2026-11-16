// @vitest-environment node
import { describe, expect, it } from "vitest";
import { METRIC_IDS } from "./contracts";
import {
  EMPTY_WORKBENCH_OVERVIEW,
  WorkbenchOverviewResponseSchema,
  type WorkbenchOverviewResponse,
} from "./response";
import { parseWithFallback } from "../api/schema";

const endpoint = "GET /api/workbench/overview";

describe("workbench overview response", () => {
  it("keeps every contract metric the server answered", () => {
    const parsed = WorkbenchOverviewResponseSchema.parse({
      metrics: {
        "work.throughput.week": { value: 7, sample_count: 12, empty: "zero" },
        "crm.pipeline.weighted_amount": { value: null, sample_count: 0, empty: "insufficient_data" },
      },
    });

    expect(parsed.metrics["work.throughput.week"]).toEqual({
      value: 7,
      sample_count: 12,
      empty: "zero",
    });
    // A null value is not a zero: it is the gap card's cue.
    expect(parsed.metrics["crm.pipeline.weighted_amount"]?.value).toBeNull();
  });

  it("drops a metric id this client does not know instead of failing the response", () => {
    // A newer server may ship a new metric. The client must keep rendering the
    // ids it does know rather than blanking the whole metrics strip.
    const parsed = parseWithFallback<WorkbenchOverviewResponse>(
      {
        metrics: {
          "work.throughput.week": { value: 3, sample_count: 3, empty: "zero" },
          "crm.future.metric": { value: 99, sample_count: 1, empty: "zero" },
        },
      },
      WorkbenchOverviewResponseSchema,
      EMPTY_WORKBENCH_OVERVIEW,
      { endpoint },
    );

    expect(Object.keys(parsed.metrics)).toEqual(["work.throughput.week"]);
    expect(parsed.metrics["work.throughput.week"]?.value).toBe(3);
    // The unknown id is gone, not coerced onto a known one.
    expect(parsed.metrics).not.toHaveProperty("crm.future.metric");
  });

  it("tolerates a response that omits metrics the client knows", () => {
    // The server only answers what it could compute; every id is optional.
    const parsed = WorkbenchOverviewResponseSchema.parse({
      metrics: { "knowledge.created.week": { value: 0, sample_count: 0, empty: "zero" } },
    });

    for (const id of METRIC_IDS) {
      if (id === "knowledge.created.week") continue;
      expect(parsed.metrics[id]).toBeUndefined();
    }
  });

  it("defaults a missing value/sample_count and fails an unknown empty state toward the gap card", () => {
    const parsed = WorkbenchOverviewResponseSchema.parse({
      metrics: {
        "work.overdue.count": {},
        // A future server could add a fourth empty state; showing 0 for it would
        // present "not measured" as "measured zero" (docs/METRICS.md rule 3).
        "work.stalled.count": { value: 4, sample_count: 9, empty: "future_state" },
      },
    });

    expect(parsed.metrics["work.overdue.count"]).toEqual({
      value: null,
      sample_count: 0,
      empty: "insufficient_data",
    });
    expect(parsed.metrics["work.stalled.count"]?.empty).toBe("insufficient_data");
    expect(parsed.metrics["work.stalled.count"]?.value).toBe(4);
  });

  it("falls back to an empty metrics strip on a malformed body", () => {
    for (const malformed of [null, "not-an-object", 42, { metrics: "not-a-record" }, { metrics: { "work.wip.count": "7" } }]) {
      expect(
        parseWithFallback(malformed, WorkbenchOverviewResponseSchema, EMPTY_WORKBENCH_OVERVIEW, {
          endpoint,
        }),
      ).toEqual(EMPTY_WORKBENCH_OVERVIEW);
    }
  });
});

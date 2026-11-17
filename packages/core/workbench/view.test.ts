// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  WORKBENCH_VIEWS,
  defaultViewFor,
  isWorkbenchView,
  readViewPreference,
  viewGroups,
  viewMetricIds,
  viewPreferenceKey,
  writeViewPreference,
} from "./view";
import { METRIC_IDS, WORKBENCH_METRICS } from "../metrics/contracts";
import type { StorageAdapter } from "../types/storage";

/** A StorageAdapter with no Web Storage behind it: these are pure-function
 * tests, and the adapter is the seam the app layer injects. */
function memoryStorage(seed: Record<string, string> = {}): StorageAdapter & {
  snapshot: () => Record<string, string>;
} {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    keys: () => [...values.keys()],
    snapshot: () => Object.fromEntries(values),
  };
}

describe("defaultViewFor", () => {
  it("opens owners and admins on the view that reads the whole business", () => {
    expect(defaultViewFor("owner")).toBe("finance");
    expect(defaultViewFor("admin")).toBe("finance");
  });

  it("opens everyone else on the neutral delivery view", () => {
    // Not "people" and not "commerce": a member's department is a user-created
    // name, so nothing about their role says which business they read.
    expect(defaultViewFor("member")).toBe("all");
  });
});

describe("viewMetricIds", () => {
  it("gives the people view only hiring numbers, and more than none", () => {
    const ids = viewMetricIds("people");
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id.startsWith("hr.")).toBe(true);
      expect(
        WORKBENCH_METRICS[id].source.some((source) => source.startsWith("hr_")),
      ).toBe(true);
    }
    // Every hiring metric in the catalogue is in it — the split is derived from
    // `source`, so a new hr metric cannot be forgotten here.
    expect([...ids].sort()).toEqual(
      METRIC_IDS.filter((id) => id.startsWith("hr.")).sort(),
    );
  });

  it("gives the commerce view only commercial numbers", () => {
    const ids = viewMetricIds("commerce");
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id.startsWith("crm.")).toBe(true);
      expect(
        WORKBENCH_METRICS[id].source.some(
          (source) => source.startsWith("crm_") || source.startsWith("ops_"),
        ),
      ).toBe(true);
    }
    expect([...ids].sort()).toEqual(
      METRIC_IDS.filter((id) => id.startsWith("crm.")).sort(),
    );
  });

  it("files every metric under exactly one narrow view", () => {
    // A metric that belongs to no view would be invisible everywhere except the
    // view that reads everything; one that belongs to two would draw twice.
    for (const id of METRIC_IDS) {
      const owners = WORKBENCH_VIEWS.filter(
        (view) => view !== "finance" && viewMetricIds(view).includes(id),
      );
      expect(owners).toHaveLength(1);
    }
  });

  it("files delivery work under the neutral view, not the two business ones", () => {
    // The narrow views stay narrow: delivery numbers (issues, agent runs,
    // knowledge) are nobody's private ledger and would otherwise be repeated
    // three times over.
    const delivery = viewMetricIds("all");
    expect(delivery).toContain("work.throughput.week");
    expect(delivery).toContain("agent.cost.month");
    expect(delivery).toContain("collab.cross_department.rate");
    expect(viewMetricIds("people")).not.toContain("work.throughput.week");
    expect(viewMetricIds("commerce")).not.toContain("work.throughput.week");
  });

  it("gives the view that reads everything the whole catalogue", () => {
    expect(viewMetricIds("finance")).toEqual(METRIC_IDS);
  });
});

describe("viewGroups", () => {
  it("names one group for a narrow view and every group for the broad ones", () => {
    expect(viewGroups("commerce")).toEqual(["commerce"]);
    expect(viewGroups("people")).toEqual(["people"]);
    // Reading the business means reading both ledgers; the default view keeps
    // the two groups it has always drawn.
    expect(viewGroups("all")).toBe("all");
    expect(viewGroups("finance")).toBe("all");
  });
});

describe("view preference", () => {
  it("round-trips a choice per user", () => {
    const storage = memoryStorage();
    expect(readViewPreference("user-a", storage)).toBeNull();

    writeViewPreference("user-a", "people", storage);
    expect(readViewPreference("user-a", storage)).toBe("people");
    expect(viewPreferenceKey("user-a")).toBe("workbench.view.user-a");
    expect(storage.snapshot()).toEqual({ "workbench.view.user-a": "people" });

    // Another person in the same browser keeps their own choice.
    expect(readViewPreference("user-b", storage)).toBeNull();
    writeViewPreference("user-b", "finance", storage);
    expect(readViewPreference("user-a", storage)).toBe("people");
    expect(readViewPreference("user-b", storage)).toBe("finance");

    // Switching overwrites rather than accumulating.
    writeViewPreference("user-a", "all", storage);
    expect(readViewPreference("user-a", storage)).toBe("all");
    expect(storage.keys?.()).toHaveLength(2);
  });

  it("falls back to null when the stored value is not a view", () => {
    // A key left by an older build, or hand-edited storage, must not throw and
    // must not be trusted: the role default takes over.
    expect(
      readViewPreference("user-a", memoryStorage({ "workbench.view.user-a": "sales" })),
    ).toBeNull();
    expect(
      readViewPreference("user-a", memoryStorage({ "workbench.view.user-a": "" })),
    ).toBeNull();
  });

  it("recognises exactly the four views", () => {
    for (const view of WORKBENCH_VIEWS) expect(isWorkbenchView(view)).toBe(true);
    expect(isWorkbenchView("sales")).toBe(false);
    expect(isWorkbenchView(null)).toBe(false);
  });
});

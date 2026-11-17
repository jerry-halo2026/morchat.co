/**
 * Which slice of the workbench a reader sees.
 *
 * The workbench draws 22 metrics and nine ledgers at once. That is one screen
 * answering three different jobs: a recruiter has no use for the pipeline
 * amount, a salesperson has no use for interview punctuality, and the person
 * running the business wants all of it. A *view* is the reader's answer to
 * "which of these is mine", and it is a **choice**, not an inference: the view
 * comes from what the reader picked (or, on a first visit, from their role),
 * never from a department name. Departments are user-created ("内容部",
 * "市场部") and `department.system_key` is empty, so mapping "人事部" to a
 * people view would be a guess, and a wrong one the moment someone renames a
 * department.
 *
 * Three things are decided here and nowhere else:
 *
 *   1. What a role lands on (`defaultViewFor`).
 *   2. What each view shows, derived from the metric contracts' `source` field
 *      rather than from a second hand-written list of ids (`viewMetricIds`,
 *      `viewGroups`). A metric added to
 *      `packages/core/metrics/contracts.ts` lands in the right view on its own.
 *   3. Where the choice is remembered (`readViewPreference` /
 *      `writeViewPreference`), keyed per user through the `StorageAdapter` — no
 *      table, no store, no server round-trip.
 *
 * The department filter in the workbench header is deliberately NOT part of
 * this: that one narrows *attribution* inside whatever view is up.
 */

import {
  METRIC_IDS,
  WORKBENCH_METRICS,
  type MetricContract,
  type MetricId,
  type MetricSource,
} from "../metrics/contracts";
import { defaultStorage } from "../platform/storage";
import type { StorageAdapter } from "../types/storage";

/**
 * The four views, in the order the switcher lists them: the neutral default
 * first, then the two narrow businesses, then the one that reads everything.
 */
export const WORKBENCH_VIEWS = ["all", "commerce", "people", "finance"] as const;

export type WorkbenchView = (typeof WORKBENCH_VIEWS)[number];

/**
 * The three read-out groups a ledger belongs to (`docs/engineering/WORKBENCH-API.md`
 * §2, §10, §11): commerce rows are money moving through a signed deal,
 * affiliate rows are the 精选联盟 platform reports, and people rows are who is
 * being hired and who is on staff. `packages/views/blocks/data.ts` owns the
 * ledger→group table; this union is the same three names, repeated because core
 * may not import the view layer.
 */
export type LedgerGroup = "commerce" | "affiliate" | "people";

/** Narrows a stored or externally supplied value to a view. */
export function isWorkbenchView(value: string | null): value is WorkbenchView {
  return value !== null && (WORKBENCH_VIEWS as readonly string[]).includes(value);
}

/**
 * The view a role lands on before they pick one.
 *
 * Owners and admins steer the business, so they open on the view that reads
 * everything. Everyone else opens on the neutral delivery view — a guess about
 * the *role*, never about the person's department.
 */
export function defaultViewFor(role: "owner" | "admin" | "member"): WorkbenchView {
  return role === "owner" || role === "admin" ? "finance" : "all";
}

/**
 * Which ledgers a view lists.
 *
 * `"all"` means "every group, in the contract's own order": the narrow views
 * name their one group, and the view that reads everything lists them all. The
 * page renders the groups in the array's order, so the narrow views' group also
 * leads. The affiliate group has no view of its own yet, so both commerce and
 * people readers see it only through the views that read everything — a
 * narrow view that cannot reach a ledger is a ledger the reader must not be
 * shown half of.
 */
export function viewGroups(view: WorkbenchView): readonly LedgerGroup[] | "all" {
  switch (view) {
    case "commerce":
      return ["commerce"];
    case "people":
      return ["people"];
    case "all":
    case "finance":
      return "all";
  }
}

/**
 * The metric sources whose numbers belong to the commercial side.
 *
 * `crm_*` is the ledger side of a deal; the ops money tables are what the
 * money block will read once it becomes a metric. Both describe money moving,
 * which is what the commerce view is for.
 */
const COMMERCE_SOURCES: readonly MetricSource[] = ["ops_finance_month", "ops_attendance"];

const COMMERCE_SOURCE_PREFIX = "crm_";
const PEOPLE_SOURCE_PREFIX = "hr_";

/** The three buckets every metric falls into, one per narrow view. */
type MetricBusiness = "delivery" | "commerce" | "people";

/**
 * Which business a contract describes, read off the tables it declares.
 *
 * A metric that touches a hiring table is a hiring number, one that touches a
 * commercial table is a commercial number, and everything else (issues, agent
 * runs, knowledge, cross-department work) is delivery work — the neutral view's
 * own block. `hr_*` wins over `crm_*` on a mixed contract, which today cannot
 * happen; stating the precedence keeps a future mixed metric from silently
 * landing in the wrong view.
 */
function metricBusiness(contract: MetricContract): MetricBusiness {
  if (contract.source.some((source) => source.startsWith(PEOPLE_SOURCE_PREFIX))) {
    return "people";
  }
  if (
    contract.source.some(
      (source) =>
        source.startsWith(COMMERCE_SOURCE_PREFIX) || COMMERCE_SOURCES.includes(source),
    )
  ) {
    return "commerce";
  }
  return "delivery";
}

/**
 * The catalogue folded into the three buckets, once at module load.
 *
 * Adding a metric to `contracts.ts` puts it in the right view without touching
 * this file; the order inside each bucket is the catalogue's own order, so the
 * strips keep the sequence the contracts were written in.
 */
function metricIdsByBusiness(): Record<MetricBusiness, readonly MetricId[]> {
  const buckets: Record<MetricBusiness, MetricId[]> = {
    delivery: [],
    commerce: [],
    people: [],
  };
  for (const id of METRIC_IDS) {
    buckets[metricBusiness(WORKBENCH_METRICS[id])].push(id);
  }
  return buckets;
}

const METRIC_IDS_BY_BUSINESS = metricIdsByBusiness();

/**
 * The numbers a view shows.
 *
 * The narrow views really are narrow — "all" means the delivery work, not
 * "everything" — because a view that shows nearly everything has not answered
 * the question. The exception is `finance`: reading the whole business is
 * exactly what that view is for.
 */
export function viewMetricIds(view: WorkbenchView): readonly MetricId[] {
  switch (view) {
    case "all":
      return METRIC_IDS_BY_BUSINESS.delivery;
    case "commerce":
      return METRIC_IDS_BY_BUSINESS.commerce;
    case "people":
      return METRIC_IDS_BY_BUSINESS.people;
    case "finance":
      return METRIC_IDS;
  }
}

/**
 * The storage key a view preference lives under.
 *
 * Per user, not per workspace: which business someone reads is a property of
 * the person, and the same person on the same workspace should not have to
 * choose twice. It sits outside the workspace namespacing on purpose.
 */
export function viewPreferenceKey(userId: string): string {
  return `workbench.view.${userId}`;
}

/**
 * The view this user last picked, or `null` when they have not picked one (or
 * what is stored is not a view — a stale key from an older build falls back to
 * the role default rather than throwing).
 */
export function readViewPreference(
  userId: string,
  storage: StorageAdapter = defaultStorage,
): WorkbenchView | null {
  const stored = storage.getItem(viewPreferenceKey(userId));
  return isWorkbenchView(stored) ? stored : null;
}

/** Remember this user's choice. Written on every switch, never read back here. */
export function writeViewPreference(
  userId: string,
  view: WorkbenchView,
  storage: StorageAdapter = defaultStorage,
): void {
  storage.setItem(viewPreferenceKey(userId), view);
}

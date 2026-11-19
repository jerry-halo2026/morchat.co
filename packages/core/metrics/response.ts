import { z } from "zod";
import { METRIC_IDS, type MetricId } from "./contracts";

/**
 * The `/api/workbench/overview` response (docs/engineering/WORKBENCH-API.md §3).
 *
 * The server answers one entry per metric it could compute, and the client is
 * *not* allowed to compute any of them itself — `docs/METRICS.md` rule 2. That
 * makes this module the boundary where the number's provenance stops: whatever
 * arrives here is rendered, and a missing entry renders as a gap card rather
 * than a zero.
 *
 * Three fields per entry:
 * - `value` is the number, or null when the server cannot state one (no rows,
 *   or every row it needed was absent).
 * - `sample_count` is the denominator the caller can show next to it ("of 12")
 *   and is what distinguishes "a true zero" from "nothing measured".
 * - `empty` says which of the contract's `emptyRule` outcomes applies, so the
 *   UI never has to infer it from `value === 0`.
 */
export type MetricEmptyState = "zero" | "insufficient_data";

export interface WorkbenchMetricValue {
  value: number | null;
  sample_count: number;
  empty: MetricEmptyState;
}

/**
 * Keyed by `MetricId`, but partial on purpose: the server may legitimately omit
 * an id it cannot compute, and a metric added server-side before this client
 * ships is dropped at the schema boundary instead of failing the response.
 */
export interface WorkbenchOverviewResponse {
  metrics: Partial<Record<MetricId, WorkbenchMetricValue>>;
}

export const EMPTY_WORKBENCH_OVERVIEW: WorkbenchOverviewResponse = { metrics: {} };

const KNOWN_METRIC_IDS: ReadonlySet<string> = new Set<string>(METRIC_IDS);

/**
 * `empty` falls back toward the gap card, never toward a zero: rendering 0 for
 * an unknown state would present "not measured" as "measured zero", which is
 * the exact confusion `docs/METRICS.md` rule 3 exists to prevent.
 */
export const WorkbenchMetricValueSchema = z
  .object({
    value: z.number().nullable().default(null),
    sample_count: z.number().default(0),
    empty: z.enum(["zero", "insufficient_data"]).catch("insufficient_data"),
  })
  .loose();

/**
 * Unknown metric ids are dropped rather than rejected: an older client must keep
 * rendering the ids it knows when a newer server adds one. Known ids that the
 * server omitted simply stay absent from the record.
 */
export const WorkbenchOverviewResponseSchema = z
  .object({
    metrics: z.record(z.string(), WorkbenchMetricValueSchema).default({}),
  })
  .loose()
  .transform((doc): WorkbenchOverviewResponse => {
    const metrics: Partial<Record<MetricId, WorkbenchMetricValue>> = {};
    for (const [id, metric] of Object.entries(doc.metrics)) {
      if (KNOWN_METRIC_IDS.has(id)) metrics[id as MetricId] = metric;
    }
    return { metrics };
  });

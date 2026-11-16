"use client";

/**
 * Metric rendering: contract → what a block draws.
 *
 * This module **does not compute** a metric. `docs/METRICS.md` rule 2 puts the
 * arithmetic on the server and the definition in
 * `@morechat/core/metrics/contracts`; what is left for the view layer is a
 * three-way decision about which of the contract's `emptyRule` outcomes the
 * payload represents, plus the unit conversion the contract fixes for display.
 * Both live here so that `MetricRow` is only markup and so the decision can be
 * tested without a DOM.
 */

import {
  metricContract,
  type MetricContract,
  type MetricId,
  type MetricUnit,
} from "@morechat/core/metrics/contracts";
import type { WorkbenchMetricValue } from "@morechat/core/metrics/response";
import type blocks from "../locales/en/blocks.json";
import type { LedgerDomain } from "./data";

/**
 * The six numbers the overview strip shows. Six is what a KPI row reads at one
 * glance; the rest of the catalogue belongs to the domain sections that will
 * cite them next to the rows they describe.
 */
export const OVERVIEW_METRIC_IDS: readonly MetricId[] = [
  "work.throughput.week",
  "work.cycle_time.median",
  "work.on_time.rate",
  "work.overdue.count",
  "work.wip.count",
  "crm.pipeline.weighted_amount",
];

/**
 * The four numbers the hiring group shows (`docs/engineering/WORKBENCH-API.md`
 * §10.5). They sit on the people group of the ledger tab rather than in the
 * overview strip: recruiting is a second business, and mixing its four numbers
 * into the delivery strip would make one row answer two questions.
 */
export const HR_METRIC_IDS: readonly MetricId[] = [
  "hr.candidates.active",
  "hr.time_to_hire.median",
  "hr.scorecard.backlog",
  "hr.interview.on_time_rate",
];

/** What a metric cell draws. */
export type MetricRenderState =
  /** A stated number. */
  | { kind: "value"; value: number; sampleCount: number }
  /** The server measured, and the answer is a true zero. */
  | { kind: "zero"; sampleCount: number }
  /** The contract says the number does not apply here. */
  | { kind: "dash" }
  /** Rows are missing: draw the gap card, never a zero. */
  | { kind: "gap" };

/**
 * Read one payload entry as one render state.
 *
 * `sample.empty` names the outcome when the number carries no measurement, so
 * it decides between "a true zero" and "nothing measured" — but it never
 * overrides a stated non-zero value. A metric the server omitted is a gap, not
 * a zero (`@morechat/core/metrics/response` states the same rule from the other
 * side); rendering 0 for "not measured" is exactly the confusion
 * `docs/METRICS.md` rule 3 exists to prevent.
 */
export function metricRenderState(
  contract: MetricContract,
  sample: WorkbenchMetricValue | undefined,
): MetricRenderState {
  if (!sample) return { kind: "gap" };
  if (sample.empty === "insufficient_data") return { kind: "gap" };
  const stated = sample.value;
  if (stated === null) {
    return contract.emptyRule === "dash" ? { kind: "dash" } : { kind: "gap" };
  }
  if (stated === 0) {
    return contract.emptyRule === "dash"
      ? { kind: "dash" }
      : { kind: "zero", sampleCount: sample.sample_count };
  }
  return { kind: "value", value: stated, sampleCount: sample.sample_count };
}

/** A number plus how to write it down. */
export interface MetricDisplay {
  value: number;
  unit: MetricUnit;
  fractionDigits: number;
  /** Set for `unit: "money"`; the symbol is chosen from this, never from the
   * viewer's locale (`docs/METRICS.md` C9 — a third money format is the thing
   * the shared `CurrencyNumberFlow` exists to prevent). */
  currency?: "CNY" | "USD";
}

/**
 * Convert a stated value to what the tile prints.
 *
 * The one arithmetic step is the percent ×100: `docs/METRICS.md` C3 settled the
 * storage scale at 0–1 and the display scale at 0–100, so the multiplication is
 * part of the contract rather than a per-component decision.
 */
export function metricDisplay(contract: MetricContract, amount: number): MetricDisplay {
  switch (contract.unit) {
    case "percent": {
      const percent = amount * 100;
      return {
        value: percent,
        unit: "percent",
        fractionDigits: Number.isInteger(percent) ? 0 : 1,
      };
    }
    case "days":
      return {
        value: amount,
        unit: "days",
        fractionDigits: Number.isInteger(amount) ? 0 : 1,
      };
    case "ratio":
      return { value: amount, unit: "ratio", fractionDigits: 2 };
    case "money":
      return {
        value: amount,
        unit: "money",
        fractionDigits: 2,
        currency: contract.currency ?? "CNY",
      };
    case "count":
    case "hours":
    case "tokens":
      return { value: amount, unit: contract.unit, fractionDigits: 0 };
  }
}

/**
 * The `blocks.metric.*` key a contract names.
 *
 * `MetricContract.labelKey` stores a full i18n path by design (METRICS rule 7:
 * copy never lives in the contract), so the namespace prefix is stripped here —
 * once, where the type system can check the remainder against the bundle.
 */
export type BlocksMetricLabelKey = keyof typeof blocks.metric;

const METRIC_LABEL_PREFIX = "blocks.metric.";

export function metricLabelKey(contract: MetricContract): BlocksMetricLabelKey {
  return contract.labelKey.slice(METRIC_LABEL_PREFIX.length) as BlocksMetricLabelKey;
}

/**
 * The ledger that fills a metric's gap, or null when the metric reads data the
 * ledgers do not own (delivery issues, agent runs). Typing a ledger row is what
 * turns a gap card from a complaint into an instruction.
 */
const GAP_DOMAIN: Partial<Record<MetricId, LedgerDomain>> = {
  "crm.pipeline.weighted_amount": "collabs",
  "crm.contract.signed_month": "collabs",
  "crm.payment.collected_month": "settlements",
  "crm.quote.margin_rate": "collabs",
  "crm.collab.roi": "collabs",
  "crm.creator.repeat_rate": "creators",
  // B1 (§10.5). Each of the four names the one hr table its formula reads:
  // candidates carry the stage and the hire date, interviews carry the scorecard
  // backlog and the reschedule count. `hr_scorecard.backlog` points at
  // `interviews` because a scorecard is opened from the interview that owes it
  // (§10.3: scorecards have no standalone list).
  "hr.candidates.active": "candidates",
  "hr.time_to_hire.median": "candidates",
  "hr.scorecard.backlog": "interviews",
  "hr.interview.on_time_rate": "interviews",
};

export function gapDomain(id: MetricId): LedgerDomain | null {
  return GAP_DOMAIN[id] ?? null;
}

/** `blocks.gap.needs_*` — what has to be entered for the metric to light up. */
export type GapNeedsKey = keyof typeof blocks.gap;

export function gapNeedsKey(domain: LedgerDomain): GapNeedsKey {
  switch (domain) {
    case "creators":
      return "needs_creators";
    case "clients":
      return "needs_clients";
    case "briefs":
      return "needs_briefs";
    case "collabs":
      return "needs_collabs";
    case "settlements":
      return "needs_settlements";
    case "jobs":
      return "needs_jobs";
    case "candidates":
      return "needs_candidates";
    case "interviews":
      return "needs_interviews";
    case "employees":
      return "needs_employees";
  }
}

/** The contract for `id`, re-exported so blocks need one import less. */
export { metricContract };
export type { MetricContract, MetricId };

import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import { bdKeys } from "./queries";
import type { BdPerformanceFilters } from "../types";

/**
 * BD performance over a date range (docs/engineering/WORKBENCH-API.md §22).
 *
 * Where the cockpit (`bdPipelineOptions`) answers "where do the ledgers stand
 * today", this answers "what did this window produce": 签约 / 交付 / 回款 / 报价
 * (发出、中标、中标率、金额) / 跟进产出 (条数、回复、见面) / 联盟佣金 (机构、达人、已结算),
 * cut by member and by month. Every fact buckets by its own date, so one
 * collaboration can appear in two blocks with two amounts — that is the report.
 *
 * Reading rules a screen must keep (the shapes encode them, see `types/bd.ts`):
 *
 *   - **One currency.** `currency` names the currency every amount is in; rows in
 *     another currency are excluded from the counts too. Never add two amounts
 *     across a currency boundary.
 *   - **Money is three-state.** `amount: null` + `empty: "insufficient_data"` is
 *     "no rows to sum", not 0.00. Counts are always numbers.
 *   - **`empty` describes the window**, not a block: `zero` once the interval holds
 *     a fact, `insufficient_data` when it holds none.
 *
 * Read-only: there is no write path here — the report is computed from the ledgers
 * the other modules own. Adopting one is not a mutation on this key; it is a
 * mutation on the ledger that produced the number.
 */
export { BdPerformanceSchema, EMPTY_BD_PERFORMANCE } from "../api/schemas";

/**
 * Fragments the key from the filters actually sent. Two screens asking for the same
 * window share a cache entry; a screen that flips `from` gets its own.
 */
export function bdPerformanceKey(wsId: string, filters: BdPerformanceFilters = {}) {
  return [...bdKeys.all(wsId), "performance", filters] as const;
}

/**
 * One request, every block. Splitting them would turn one page's single loading
 * state into six, and the server computes them in one pass anyway.
 *
 * `from`/`to` are inclusive days and both optional: the server defaults to "this
 * month so far" and echoes the window it used (`from`/`to` on the response), so the
 * page labels the trend from the response, not from what it happened to ask for.
 */
export function bdPerformanceOptions(wsId: string, filters: BdPerformanceFilters = {}) {
  return queryOptions({
    queryKey: bdPerformanceKey(wsId, filters),
    queryFn: () => api.getBdPerformance(filters),
    enabled: !!wsId,
  });
}

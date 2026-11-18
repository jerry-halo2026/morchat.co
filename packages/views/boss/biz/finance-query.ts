/**
 * `GET /api/workbench/finance?month=YYYY-MM` — the money aggregate narrowed to one
 * calendar month.
 *
 * `workbenchFinanceOptions` (`@morechat/core/crm/queries`) is the department-scoped
 * variant and always describes the server's current month; this file is the
 * month-scoped read the 经营数据 page needs, and it is deliberately local to
 * `boss/biz` because the month parameter is not part of the core client's
 * signature yet.
 *
 * The key keeps the `["workbench", wsId]` prefix, so the ledger events and the CRM
 * mutations that already invalidate `workbenchKeys.all(wsId)` refresh every month
 * of this page at once — a settlement that turns paid moves the collected figure
 * of the month it cleared in, whichever month the reader is looking at.
 *
 * `null` means "the current month": the parameter is omitted, which is the
 * contract's default (and the behaviour every other caller already gets). An
 * explicit `YYYY-MM` is passed through.
 */

import { queryOptions } from "@tanstack/react-query";
import { api } from "@morechat/core/api";
import { workbenchKeys } from "@morechat/core/crm/queries";
import type { WorkbenchFinanceResponse } from "@morechat/core/types";

/** The month segment for one scope; `"current"` is the omitted-parameter read. */
export const bizFinanceKeys = {
  month: (wsId: string, month: string | null) =>
    [...workbenchKeys.all(wsId), "finance", "all", month ?? "current"] as const,
};

export function bizFinanceOptions(wsId: string, month: string | null) {
  return queryOptions({
    queryKey: bizFinanceKeys.month(wsId, month),
    queryFn: () => readFinance(month),
    enabled: !!wsId,
  });
}

/**
 * One month's aggregate.
 *
 * `null` omits the parameter (the contract's "current month" read); any other
 * value is the `YYYY-MM` label. The response's own `window.month` is the authority
 * on which month was sliced, and the page compares it against what was asked for —
 * so a server that ignores the parameter shows up as a sentence instead of one
 * month's numbers printed under another's label.
 */
function readFinance(month: string | null): Promise<WorkbenchFinanceResponse> {
  return api.getWorkbenchFinance(
    month ? { department_id: null, month } : { department_id: null },
  );
}

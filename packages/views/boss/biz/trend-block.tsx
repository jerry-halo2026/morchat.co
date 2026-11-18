"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  workbenchFinanceMonthsOptions,
  workbenchFinanceOptions,
} from "@morechat/core/crm/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morechat/ui/components/ui/table";
import { ObjectSectionCard } from "../../layout/object-page";
import { useT } from "../../i18n";
import { BossBlock } from "../home/block";
import { MoneyText, MissingText } from "./figure";
import { trendRows, type TrendRow } from "./model";

/**
 * 月度趋势: the last six months, one row each.
 *
 * The row set is fixed and continuous — a month nobody entered is still a row, so
 * a gap in the history reads as a gap and not as a shorter story. What a row can
 * state depends on what exists for it:
 *
 *   - 未录入      — no entry row for that month at all;
 *   - 数据不足    — an entry exists but the amounts are blank (the columns store
 *                   NULL, not 0, so the block prints the gap);
 *   - a number    — a recorded figure.
 *
 * 收入 and 毛利 are only filled for the month the server aggregated: `GET /finance`
 * describes the current natural month and there is no per-month revenue read, so
 * the earlier rows state the cost and opening cash that were entered instead of
 * inventing a series. The caption under the table says so.
 */
export function BossBizTrendBlock({ wsId }: { wsId: string }) {
  const { t } = useT("biz");
  const finance = useQuery(workbenchFinanceOptions(wsId));
  const months = useQuery(workbenchFinanceMonthsOptions(wsId));

  const rows = useMemo(
    () =>
      trendRows(months.data?.months, {
        month: finance.data?.window.month ?? "",
        signed: finance.data?.signed?.value ?? null,
        collected: finance.data?.collected?.value ?? null,
      }),
    [months.data, finance.data],
  );

  // One scale for the cost bars, so a row's bar means the same as its neighbours'.
  const maxCost = rows.reduce((max, row) => Math.max(max, row.cost ?? 0), 0);

  return (
    <BossBlock
      title={t(($) => $.biz.block_trend)}
      isLoading={finance.isPending || months.isPending}
      isError={finance.isError || months.isError}
      onRetry={() => {
        void finance.refetch();
        void months.refetch();
      }}
    >
      <ObjectSectionCard className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t(($) => $.biz.trend_month)}</TableHead>
              <TableHead className="text-right">{t(($) => $.biz.trend_revenue)}</TableHead>
              <TableHead className="text-right">{t(($) => $.biz.trend_cost)}</TableHead>
              <TableHead className="text-right">{t(($) => $.biz.trend_gross)}</TableHead>
              <TableHead className="text-right">{t(($) => $.biz.trend_cash)}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.month} data-month={row.month}>
                <TableCell className="tabular-nums text-muted-foreground">{row.month}</TableCell>
                <TableCell className="text-right">
                  <MoneyText amount={row.revenue} currency="CNY" />
                </TableCell>
                <TableCell className="text-right">
                  <CostCell row={row} maxCost={maxCost} />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyText amount={row.gross} currency="CNY" />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyText amount={row.cashOpen} currency="CNY" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="border-t px-5 py-2.5 text-caption text-muted-foreground">
          {t(($) => $.biz.trend_caption)}
        </p>
      </ObjectSectionCard>
    </BossBlock>
  );
}

/**
 * 成本 for one month: the amount, a bar scaled to the largest cost in the window,
 * or the word for why there is no number.
 */
function CostCell({ row, maxCost }: { row: TrendRow; maxCost: number }) {
  const { t } = useT("biz");
  if (row.cost === null) {
    return (
      <span data-cost-state={row.recorded ? "insufficient" : "unrecorded"}>
        {row.recorded ? (
          <MissingText />
        ) : (
          <span data-slot="figure-unrecorded" className="text-caption text-muted-foreground">
            {t(($) => $.unrecorded)}
          </span>
        )}
      </span>
    );
  }
  const share = maxCost > 0 ? Math.max(row.cost / maxCost, 0) : 0;
  return (
    <span className="flex items-center justify-end gap-2">
      <span
        aria-hidden="true"
        className="hidden h-1.5 w-12 shrink-0 overflow-hidden rounded-xs bg-brand/15 sm:block"
      >
        <span
          className="block h-full rounded-xs bg-brand/60"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </span>
      <MoneyText amount={row.cost} currency="CNY" />
    </span>
  );
}

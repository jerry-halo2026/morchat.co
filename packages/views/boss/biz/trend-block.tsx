"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { workbenchFinanceMonthsOptions } from "@morechat/core/crm/queries";
import type { WorkbenchFinanceResponse } from "@morechat/core/types";
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
import { bizFinanceOptions } from "./finance-query";
import { MoneyText, MissingText } from "./figure";
import { monthFinanceOf, monthOf, recentMonths, trendRows, TREND_MONTHS } from "./model";

/**
 * 月度趋势: the last six months ending at the month in hand, one row each.
 *
 * Each row is its own `GET /finance?month=` — the aggregate is per month, so a
 * six-month series is six reads of the same endpoint rather than a derived
 * sequence. They run in parallel, share the cache with the block above (the
 * selected month's key is identical), and a month that answers
 * `insufficient_data` prints 数据不足 while a month nobody entered prints 未录入:
 * the axis stays continuous instead of shrinking to the months that have data.
 *
 * The cost side still comes from `GET /finance/months`, which is where the entered
 * amounts live; the margin is the overview's `moneySummary`.
 */
export function BossBizTrendBlock({ wsId, month }: { wsId: string; month: string | null }) {
  const { t } = useT("biz");
  // The same read the month block makes: one request, two blocks reading it.
  const anchor = useQuery(bizFinanceOptions(wsId, month));
  const browserMonth = useMemo(() => monthOf(new Date()), []);
  const endMonth = month ?? anchor.data?.window.month ?? browserMonth;
  const labels = useMemo(() => recentMonths(endMonth, TREND_MONTHS), [endMonth]);

  const reads = useQueries({
    queries: labels.map((label) => bizFinanceOptions(wsId, label)),
  });
  const months = useQuery(workbenchFinanceMonthsOptions(wsId));

  const finances = reads
    .map((read) => read.data)
    .filter((data): data is WorkbenchFinanceResponse => !!data)
    .map(monthFinanceOf);
  const rows = trendRows(months.data?.months, finances, endMonth);
  // One scale for the cost bars, so a row's bar means the same as its neighbours'.
  const maxCost = rows.reduce((max, row) => Math.max(max, row.cost ?? 0), 0);

  const isLoading =
    anchor.isPending || months.isPending || reads.some((read) => read.isPending);
  const isError = anchor.isError || months.isError || reads.some((read) => read.isError);

  return (
    <BossBlock
      title={t(($) => $.biz.block_trend)}
      count={endMonth || undefined}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => {
        void anchor.refetch();
        void months.refetch();
        for (const read of reads) void read.refetch();
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
                  <CostCell
                    answered={row.answered}
                    recorded={row.recorded}
                    cost={row.cost}
                    maxCost={maxCost}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyText amount={row.gross} currency="CNY" />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyText amount={row.cash} currency="CNY" />
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
function CostCell({
  answered,
  recorded,
  cost,
  maxCost,
}: {
  answered: boolean;
  recorded: boolean;
  cost: number | null;
  maxCost: number;
}) {
  const { t } = useT("biz");
  if (cost === null) {
    return (
      <span data-cost-state={recorded ? "insufficient" : "unrecorded"}>
        {recorded ? (
          <MissingText />
        ) : (
          <span data-slot="figure-unrecorded" className="text-caption text-muted-foreground">
            {answered ? t(($) => $.unrecorded) : t(($) => $.insufficient)}
          </span>
        )}
      </span>
    );
  }
  const share = maxCost > 0 ? Math.max(cost / maxCost, 0) : 0;
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
      <MoneyText amount={cost} currency="CNY" />
    </span>
  );
}

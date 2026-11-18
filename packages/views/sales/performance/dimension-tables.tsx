"use client";

import { useMemo } from "react";
import type { BdPerformanceMonthRow, BdPerformanceTotals } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale } from "../../i18n";
import {
  CollectionEmptyValue,
  CollectionList,
  type CollectionColumn,
} from "../../layout/collection-list";
import { amountText } from "../collabs/model";
import { usePerformanceCopy } from "./copy";
import { monthRows, ratioText, totalOf, type MemberPerformanceRow } from "./model";

/**
 * One line of either dimension table. Both tables show the same seven figures, so
 * they share one row shape and one column definition — a member line and a month
 * line can never end up with two different definitions of 中标率.
 */
interface DimensionRow {
  key: string;
  label: string;
  totals: BdPerformanceTotals;
  win_rate: number | null;
  /** The 合计 line: same columns, emphasised, and never the only line. */
  total?: boolean;
}

function useDimensionColumns(
  currency: string,
  labelHeader: string,
): CollectionColumn<DimensionRow>[] {
  const { t } = usePerformanceCopy();
  const locale = useLocale();

  return [
    {
      key: "label",
      header: labelHeader,
      width: 200,
      core: true,
      cell: (row) => (
        <span
          className={cn("min-w-0 truncate", row.total ? "font-semibold" : "font-medium")}
          title={row.label}
        >
          {row.label}
        </span>
      ),
    },
    {
      key: "signed",
      header: t(($) => $.deal_signed),
      width: 90,
      align: "end",
      core: true,
      cell: (row) => <span className="tabular-nums">{row.totals.signed_count}</span>,
    },
    {
      key: "signed_amount",
      header: t(($) => $.deal_signed_amount),
      width: 120,
      align: "end",
      cell: (row) => {
        const text = amountText(row.totals.signed_amount, currency, locale);
        return text === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums">{text}</span>
        );
      },
    },
    {
      key: "delivered",
      header: t(($) => $.deal_delivered),
      width: 90,
      align: "end",
      cell: (row) => <span className="tabular-nums">{row.totals.delivered_count}</span>,
    },
    {
      key: "collected",
      header: t(($) => $.deal_collected),
      width: 120,
      align: "end",
      core: true,
      cell: (row) => {
        const text = amountText(row.totals.collected_amount, currency, locale);
        return text === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums">{text}</span>
        );
      },
    },
    {
      key: "quote_sent",
      header: t(($) => $.quote_sent),
      width: 90,
      align: "end",
      cell: (row) => <span className="tabular-nums">{row.totals.quote_sent}</span>,
    },
    {
      key: "win_rate",
      header: t(($) => $.quote_win_rate),
      width: 100,
      align: "end",
      cell: (row) => {
        const text = ratioText(row.win_rate);
        return text === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums">{text}</span>
        );
      },
    },
    {
      key: "followups",
      header: t(($) => $.activity_count),
      width: 90,
      align: "end",
      cell: (row) => <span className="tabular-nums">{row.totals.followups}</span>,
    },
  ];
}

/**
 * The 合计 line, built from the lines the table shows — never read from anywhere
 * else, so it cannot disagree with them.
 */
function totalLine(
  rows: readonly DimensionRow[],
  currency: string,
  label: string,
): DimensionRow {
  const total = totalOf(
    rows.map((row) => row.totals),
    currency,
  );
  return {
    key: "__total__",
    label,
    total: true,
    win_rate: total.win_rate,
    totals: {
      signed_count: total.signed_count,
      signed_amount: total.signed_amount.amount,
      delivered_count: total.delivered_count,
      collected_count: total.collected_count,
      collected_amount: total.collected_amount.amount,
      quote_sent: total.quote_sent,
      quote_accepted: total.quote_accepted,
      quote_amount: total.quote_amount.amount,
      followups: total.followups,
      replied: total.replied,
      meetings: total.meetings,
    },
  };
}

/** Both tables draw the same eight columns; only the first header differs. */
function DimensionTable({
  label,
  headerLabel,
  rows,
  currency,
}: {
  label: string;
  headerLabel: string;
  rows: readonly DimensionRow[];
  currency: string;
}) {
  const { t } = usePerformanceCopy();
  const columns = useDimensionColumns(currency, headerLabel);
  const totalLabel = t(($) => $.total_row);

  const tableRows = useMemo(
    () => (rows.length === 0 ? [] : [...rows, totalLine(rows, currency, totalLabel)]),
    [rows, currency, totalLabel],
  );

  return (
    <section aria-label={label} className="flex flex-col gap-1.5">
      <h2 className="text-label font-medium">{label}</h2>
      <CollectionList
        label={label}
        columns={columns}
        rows={tableRows}
        getRowId={(row) => row.key}
        getRowClassName={(row) => (row.total ? "bg-muted/40" : undefined)}
        embedded
        pageShortcuts={false}
      />
    </section>
  );
}

/**
 * 按成员 — who produced what, with a 合计 line over the same rows.
 *
 * The total is the sum of the lines above it, in the response's one currency, so
 * it cannot disagree with them. Its rate is recomputed from the summed counts
 * rather than averaged over the members: a member with one offer must not weigh as
 * much as one with forty.
 */
export function MemberTable({
  rows,
  currency,
}: {
  rows: readonly MemberPerformanceRow[];
  currency: string;
}) {
  const { t } = usePerformanceCopy();
  const lines = useMemo(
    () =>
      rows.map((entry) => ({
        key: entry.memberId,
        label: entry.name,
        win_rate: entry.row.win_rate,
        totals: entry.row,
      })),
    [rows],
  );

  return (
    <DimensionTable
      label={t(($) => $.table_member)}
      headerLabel={t(($) => $.column_member)}
      rows={lines}
      currency={currency}
    />
  );
}

/**
 * 按月 — the same figures cut by calendar month, oldest first, so the table reads
 * as a trend. Months come from the response; the page does not invent an empty
 * month for a gap.
 */
export function MonthTable({
  rows,
  currency,
}: {
  rows: readonly BdPerformanceMonthRow[];
  currency: string;
}) {
  const { t } = usePerformanceCopy();
  const lines = useMemo(
    () =>
      monthRows(rows).map((entry) => ({
        key: entry.month,
        label: entry.month,
        win_rate: entry.win_rate,
        totals: entry,
      })),
    [rows],
  );

  return (
    <DimensionTable
      label={t(($) => $.table_month)}
      headerLabel={t(($) => $.column_month)}
      rows={lines}
      currency={currency}
    />
  );
}

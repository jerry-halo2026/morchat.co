"use client";

import { useQuery } from "@tanstack/react-query";
import { workbenchFinanceMonthsOptions } from "@morechat/core/crm/queries";
import type { WorkbenchFinanceCostBasis } from "@morechat/core/types";
import { KPI_GRID_CLASS, KpiCell, kpiLastCellClass } from "../../blocks/metric-row";
import { useT } from "../../i18n";
import { ObjectSectionCard } from "../../layout/object-page";
import { BossBlock } from "../home/block";
import { moneySummary, monthEntry } from "../home/model";
import { DaysText, MoneyText } from "./figure";
import { bizFinanceOptions } from "./finance-query";
import { monthGaps, type MonthGap } from "./model";

/** Six figures, so the closing tile spans what the grid leaves. */
const MONTH_FIGURES = 6;

/**
 * 当月: what was signed, what was collected, what the month cost, the margin
 * between the last two, the cash figure and how old the unpaid money is.
 *
 * The month is the reader's choice (`month`), and `null` means "the server's
 * current one". The label under the title is `window.month` from the response, so
 * the numbers can never be printed under a month the server did not slice. The
 * cost is that same month's entry, and the margin is `moneySummary`: 已回款 −
 * 成本, null when either side is missing, exactly as `boss/home/money-block.tsx`
 * states it. There is no second margin formula on this page.
 *
 * Where the margin has no value the tile says *which* input is missing — no
 * revenue that month, or no cost entered — because those are two different facts
 * and only one of them can be fixed by typing.
 */
export function BossBizMonthBlock({ wsId, month }: { wsId: string; month: string | null }) {
  const { t } = useT("biz");
  const { t: tFinance } = useT("finance");
  const { t: tBlocks } = useT("blocks");
  const finance = useQuery(bizFinanceOptions(wsId, month));

  // The month the response describes: the requested one when the server honoured
  // it, the server's own current month when nothing was requested.
  const answered = finance.data?.window.month ?? "";
  const months = useQuery({
    ...workbenchFinanceMonthsOptions(wsId, answered || null),
    enabled: !!wsId && !!answered,
  });

  const entry = monthEntry(months.data?.months, answered);
  const summary = moneySummary(
    finance.data
      ? {
          signed: finance.data.signed?.value ?? null,
          collected: finance.data.collected?.value ?? null,
        }
      : null,
    entry,
    answered,
  );
  const cash = finance.data?.cash_floor ?? null;
  const gaps = monthGaps(summary);

  const basisLabel = (basis: WorkbenchFinanceCostBasis): string => {
    switch (basis) {
      case "entered":
        return tFinance(($) => $.basis.entered);
      case "settled_collabs":
        return tFinance(($) => $.basis.settled_collabs);
      case "none":
        return tFinance(($) => $.basis.none);
    }
  };

  const gapLabel = (gap: MonthGap): string =>
    gap === "no_cost"
      ? tFinance(($) => $.empty.no_cost_entry)
      : tFinance(($) => $.empty.no_revenue);

  return (
    <BossBlock
      title={t(($) => $.biz.block_month)}
      count={answered || month || undefined}
      isLoading={finance.isPending || (!!answered && months.isPending)}
      isError={finance.isError || (!!answered && months.isError)}
      onRetry={() => {
        void finance.refetch();
        void months.refetch();
      }}
    >
      <ObjectSectionCard>
        <div className={KPI_GRID_CLASS}>
          <KpiCell
            label={tFinance(($) => $.card.signed)}
            value={<MoneyText amount={summary.signed} currency="CNY" />}
            hint={tFinance(($) => $.hint.signed)}
          />
          <KpiCell
            label={tFinance(($) => $.card.collected)}
            value={<MoneyText amount={summary.paid} currency="CNY" />}
            hint={tFinance(($) => $.hint.collected)}
          />
          <KpiCell
            label={tBlocks(($) => $.boss_home.money.cost)}
            value={<MoneyText amount={summary.cost} currency="CNY" />}
            hint={
              summary.cost === null
                ? tBlocks(($) => $.boss_home.money.missing.cost)
                : tFinance(($) => $.basis.entered)
            }
          />
          <KpiCell
            label={tFinance(($) => $.card.margin)}
            value={<MoneyText amount={summary.margin} currency="CNY" />}
            hint={gaps.length === 0 ? undefined : gapLabel(gaps[0]!)}
          />
          <KpiCell
            label={tFinance(($) => $.card.cash)}
            value={<MoneyText amount={cash?.value ?? null} currency="CNY" />}
            hint={
              cash && cash.value !== null
                ? basisLabel(cash.basis)
                : tFinance(($) => $.empty.cash_open)
            }
          />
          <KpiCell
            className={kpiLastCellClass(MONTH_FIGURES)}
            label={tFinance(($) => $.card.receivable)}
            value={<DaysText days={finance.data?.receivable_days?.value ?? null} />}
            hint={tFinance(($) => $.hint.receivable)}
          />
        </div>
        <p className="border-t px-5 py-2.5 text-caption text-muted-foreground">
          {t(($) => $.biz.month_basis)}
        </p>
      </ObjectSectionCard>
    </BossBlock>
  );
}

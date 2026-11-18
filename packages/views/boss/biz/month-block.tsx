"use client";

import { useQuery } from "@tanstack/react-query";
import {
  workbenchFinanceMonthsOptions,
  workbenchFinanceOptions,
} from "@morechat/core/crm/queries";
import type { WorkbenchFinanceCostBasis } from "@morechat/core/types";
import { KPI_GRID_CLASS, KpiCell, kpiLastCellClass } from "../../blocks/metric-row";
import { useT } from "../../i18n";
import { ObjectSectionCard } from "../../layout/object-page";
import { BossBlock } from "../home/block";
import { moneySummary, monthEntry } from "../home/model";
import { DaysText, MoneyText } from "./figure";

/** Six figures, so the closing tile spans what the grid leaves. */
const MONTH_FIGURES = 6;

/**
 * 本月: what was signed, what was collected, what this month cost, the margin
 * between the last two, the cash figure and how old the unpaid money is.
 *
 * Four of the six are the money block's own numbers (`GET /finance`, for the month
 * the server names in `window.month` — never the browser's clock); the cost is that
 * same month's entry, and the margin is `moneySummary`: 已回款 − 成本, null when
 * either side is missing, exactly as `boss/home/money-block.tsx` states it. There
 * is no second margin formula on this page.
 *
 * `cash_floor` is the server's own figure and carries a `basis` — which cost set
 * produced it. Where it has no value, the tile says opening cash is missing instead
 * of printing 0: no ledger row can supply an opening balance.
 */
export function BossBizMonthBlock({ wsId }: { wsId: string }) {
  const { t } = useT("biz");
  const { t: tFinance } = useT("finance");
  const { t: tBlocks } = useT("blocks");
  const finance = useQuery(workbenchFinanceOptions(wsId));

  const month = finance.data?.window.month ?? "";
  const months = useQuery({
    ...workbenchFinanceMonthsOptions(wsId, month || null),
    // The cost entry is keyed by the month the aggregate named; without that month
    // there is no key to read.
    enabled: !!wsId && !!month,
  });

  const entry = monthEntry(months.data?.months, month);
  const summary = moneySummary(
    finance.data
      ? {
          signed: finance.data.signed?.value ?? null,
          collected: finance.data.collected?.value ?? null,
        }
      : null,
    entry,
    month,
  );
  const cash = finance.data?.cash_floor ?? null;

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

  return (
    <BossBlock
      title={t(($) => $.biz.block_month)}
      count={month || undefined}
      isLoading={finance.isPending || (!!month && months.isPending)}
      isError={finance.isError || (!!month && months.isError)}
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
            hint={
              summary.margin === null
                ? tBlocks(($) => $.boss_home.money.missing.margin)
                : undefined
            }
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

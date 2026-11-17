"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { workbenchFinanceOptions } from "@morechat/core/crm/queries";
import type {
  WorkbenchFinanceBlock,
  WorkbenchFinanceCostBasis,
  WorkbenchFinanceCostBlock,
  WorkbenchFinanceResponse,
} from "@morechat/core/types";
import { Button } from "@morechat/ui/components/ui/button";
import { CurrencyNumberFlow, NumberFlow } from "@morechat/ui/components/ui/number-flow";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { useLocale, useT } from "../i18n";
import { FinanceCostDialog } from "./finance-cost-dialog";
import { KPI_GRID_CLASS, KpiCell, kpiLastCellClass } from "./metric-row";

interface FinanceSectionProps {
  wsId: string;
  /** `?dept=` — null reads every department. */
  departmentId: string | null;
}

/** Signed, collected, margin, receivable days, cash floor. */
const FINANCE_FIGURES = 5;

/**
 * The workbench's money block: what was signed, what was collected, what the
 * margin is, how long the money has been owed, and where the cash would land
 * (`GET /api/workbench/finance`, docs/engineering/WORKBENCH-API.md §3).
 *
 * The server owns every number, the margin ratio included: this block only
 * decides which of the three states a figure is in — stated, a true zero, or a
 * gap — and prints it in the tiles the metric strip already established
 * (`KpiCard` inside one bordered grid, no second border, `--text-*` scale). A
 * figure with no rows behind it renders `—` and the copy that says what is
 * missing; it never renders a 0 the ledger cannot support
 * (docs/METRICS.md §1 rule 3).
 *
 * The two figures with a cost side also name the cost set they used (`basis`):
 * this month's entered cost, the fees of the collaborations settled this month, or
 * nothing at all. That is what makes the gap actionable — the header's button
 * opens `FinanceCostDialog` for the missing input instead of leaving the reader to
 * guess which table to fill in.
 *
 * The one arithmetic step is the percent display scale (C3: stored 0–1, shown
 * 0–100), the same conversion `metricDisplay` applies — not a recomputation of
 * the ratio.
 */
export function FinanceSection({ wsId, departmentId }: FinanceSectionProps) {
  const { t } = useT("finance");
  // Units and the currency symbol are the workbench's existing copy, not a second
  // set of the same glyphs (C9: one money format, one percent sign).
  const { t: tUnit } = useT("blocks");
  const locales = useLocale();
  const { data, isPending, isError } = useQuery(
    workbenchFinanceOptions(wsId, departmentId),
  );
  const [costOpen, setCostOpen] = useState(false);

  const figures: WorkbenchFinanceResponse | null = data ?? null;
  const month = figures?.window.month ?? "";

  /** The small text for a stated figure: which cost set produced it. */
  const basisLabel = (basis: WorkbenchFinanceCostBasis): string => {
    switch (basis) {
      case "entered":
        return t(($) => $.basis.entered);
      case "settled_collabs":
        return t(($) => $.basis.settled_collabs);
      case "none":
        return t(($) => $.basis.none);
    }
  };

  /**
   * What is missing when the margin has no value. Two different gaps hide here:
   * no cost side at all, and no collected money to divide by. With a cost side and
   * no revenue the division has no denominator, so that is the one to name.
   */
  const marginGap = (block: WorkbenchFinanceCostBlock, collected: WorkbenchFinanceBlock): string => {
    if (block.basis !== "none") return t(($) => $.empty.no_revenue);
    // Revenue with no cost side is a stale entry, not an empty ledger: the reader
    // can fix it, so the copy points at the form.
    const revenue = collected.value ?? 0;
    return revenue > 0 ? t(($) => $.empty.no_cost_entry) : t(($) => $.empty.no_cost);
  };

  return (
    <section aria-label={t(($) => $.tab)} className="space-y-1.5">
      <div className="flex h-7 items-center justify-between gap-2">
        {month ? (
          <p className="text-caption text-muted-foreground">{month}</p>
        ) : (
          <span />
        )}
        {month ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => setCostOpen(true)}
          >
            {t(($) => $.cost.open, { month })}
          </Button>
        ) : null}
      </div>
      {isError ? (
        <p role="status" className="text-caption text-muted-foreground">
          {t(($) => $.error)}
        </p>
      ) : null}
      <div className={KPI_GRID_CLASS}>
        {isPending ? <FinanceSkeleton /> : null}
        {!isPending && figures ? (
          <>
            <KpiCell
              label={t(($) => $.card.signed)}
              value={
                <MoneyValue
                  amount={figures.signed.value}
                  locales={locales}
                  prefix={tUnit(($) => $.unit.currency.CNY)}
                />
              }
              hint={t(($) => $.hint.signed)}
            />
            <KpiCell
              label={t(($) => $.card.collected)}
              value={
                <MoneyValue
                  amount={figures.collected.value}
                  locales={locales}
                  prefix={tUnit(($) => $.unit.currency.CNY)}
                />
              }
              hint={t(($) => $.hint.collected)}
            />
            <KpiCell
              label={t(($) => $.card.margin)}
              value={
                <PercentValue
                  ratio={figures.gross_margin.value}
                  locales={locales}
                  suffix={tUnit(($) => $.unit.percent)}
                />
              }
              // A margin with no cost side is not "0 % margin": the cell says
              // which input is missing, or which cost set the number used.
              hint={
                isStated(figures.gross_margin)
                  ? basisLabel(figures.gross_margin.basis)
                  : marginGap(figures.gross_margin, figures.collected)
              }
            />
            <KpiCell
              label={t(($) => $.card.receivable)}
              value={
                <DaysValue
                  days={figures.receivable_days.value}
                  locales={locales}
                  suffix={tUnit(($) => $.unit.days)}
                />
              }
              hint={t(($) => $.hint.receivable)}
            />
            <KpiCell
              label={t(($) => $.card.cash)}
              // The five-figure block closes here: at `lg` the fifth figure has
              // one column left beside it, so it takes the rest of the row
              // instead of leaving a hole (same rule as the metric strips).
              className={kpiLastCellClass(FINANCE_FIGURES)}
              value={
                <MoneyValue
                  amount={figures.cash_floor.value}
                  locales={locales}
                  prefix={tUnit(($) => $.unit.currency.CNY)}
                />
              }
              // The one input the ledgers cannot supply: opening cash. Without it
              // there is nothing to add the month's flow to, and "0" would be
              // fiction.
              hint={
                isStated(figures.cash_floor)
                  ? basisLabel(figures.cash_floor.basis)
                  : t(($) => $.empty.cash_open)
              }
            />
          </>
        ) : null}
      </div>
      {/* Mounted only while open, so a closed dialog costs no query and no hook. */}
      {figures && month && costOpen ? (
        <FinanceCostDialog wsId={wsId} month={month} open onOpenChange={setCostOpen} />
      ) : null}
    </section>
  );
}

/**
 * Whether the server stated this figure. `value: null` (or the block missing from
 * a degraded response) is the gap state, whatever `empty` says — the same rule
 * `metricRenderState` applies to the strip.
 */
function isStated(block: WorkbenchFinanceBlock | undefined): boolean {
  return !!block && block.value !== null;
}

function FinanceSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-16" />
    </div>
  );
}

/** A figure with no rows behind it: the workbench's one glyph for that, from
 * `blocks.empty.value`, so the money block and the metric strips print the same
 * word for "no number here". */
function DashValue() {
  const { t } = useT("blocks");
  return <span className="text-muted-foreground">{t(($) => $.empty.value)}</span>;
}

/** Money in the ledger's currency (CNY, C9), through the shared currency flow. */
function MoneyValue({
  amount,
  locales,
  prefix,
}: {
  amount: number | null;
  locales: string;
  prefix: string;
}) {
  if (amount === null) return <DashValue />;
  return <CurrencyNumberFlow value={amount} locales={locales} prefix={prefix} />;
}

/**
 * A 0–1 ratio printed at the display scale. The multiplication is the contract's
 * own unit conversion (docs/METRICS.md C3) and is pinned to whole percents, which
 * is what a margin is read at.
 */
function PercentValue({
  ratio,
  locales,
  suffix,
}: {
  ratio: number | null;
  locales: string;
  suffix: string;
}) {
  if (ratio === null) return <DashValue />;
  const percent = ratio * 100;
  return (
    <NumberFlow
      value={percent}
      locales={locales}
      suffix={suffix}
      format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }}
      aria-label={`${Math.round(percent)}${suffix}`}
    />
  );
}

/** Days as one decimal at most: an average of half a day should not read as 0. */
function DaysValue({
  days,
  locales,
  suffix,
}: {
  days: number | null;
  locales: string;
  suffix: string;
}) {
  if (days === null) return <DashValue />;
  return (
    <NumberFlow
      value={days}
      locales={locales}
      suffix={suffix}
      format={{ minimumFractionDigits: 0, maximumFractionDigits: 1 }}
      aria-label={`${days.toFixed(1)}${suffix}`}
    />
  );
}

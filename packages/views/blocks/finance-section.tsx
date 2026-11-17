"use client";

import { useQuery } from "@tanstack/react-query";
import { workbenchFinanceOptions } from "@morechat/core/crm/queries";
import type { WorkbenchFinanceBlock, WorkbenchFinanceResponse } from "@morechat/core/types";
import { CurrencyNumberFlow, NumberFlow } from "@morechat/ui/components/ui/number-flow";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { useLocale, useT } from "../i18n";
import { KpiCard } from "../runtimes/components/shared";

interface FinanceSectionProps {
  wsId: string;
  /** `?dept=` — null reads every department. */
  departmentId: string | null;
}

/**
 * The workbench's money block: what was signed, what was collected, what the
 * margin is, and how long the money has been owed
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

  const figures: WorkbenchFinanceResponse | null = data ?? null;

  return (
    <section aria-label={t(($) => $.tab)} className="space-y-1.5">
      {figures?.window.month ? (
        <p className="text-caption text-muted-foreground">{figures.window.month}</p>
      ) : null}
      {isError ? (
        <p role="status" className="text-caption text-muted-foreground">
          {t(($) => $.error)}
        </p>
      ) : null}
      <div className="grid grid-cols-1 divide-y rounded-lg border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5">
        {isPending ? <FinanceSkeleton /> : null}
        {!isPending && figures ? (
          <>
            <KpiCard
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
            <KpiCard
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
            <KpiCard
              label={t(($) => $.card.margin)}
              value={
                <PercentValue
                  ratio={figures.gross_margin.value}
                  locales={locales}
                  suffix={tUnit(($) => $.unit.percent)}
                />
              }
              // A margin with no settled collaboration is not "0 % margin": the
              // cost side is missing, and that is what the cell has to say.
              hint={
                isStated(figures.gross_margin)
                  ? t(($) => $.hint.margin)
                  : t(($) => $.empty.no_cost)
              }
            />
            <KpiCard
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
            <KpiCard
              label={t(($) => $.card.cash)}
              value={<DashValue />}
              // Always a gap today: the schema has neither an opening cash
              // balance nor a cost entry, so saying "0" would be fiction.
              hint={t(($) => $.empty.cash)}
            />
          </>
        ) : null}
      </div>
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

function DashValue() {
  return <span className="text-muted-foreground">—</span>;
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

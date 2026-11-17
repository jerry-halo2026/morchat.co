"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspacePaths } from "@morechat/core/paths";
import { workbenchOverviewOptions } from "@morechat/core/crm/queries";
import {
  CurrencyNumberFlow,
  NumberFlow,
} from "@morechat/ui/components/ui/number-flow";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT } from "../i18n";
import { GapCard } from "./gap-card";
import {
  OVERVIEW_METRIC_IDS,
  gapDomain,
  gapNeedsKey,
  metricContract,
  metricDisplay,
  metricLabelKey,
  metricRenderState,
  type MetricDisplay,
  type MetricId,
} from "./metrics";

/**
 * The workbench's one KPI grid.
 *
 * Every strip on the page draws into this same rule — the delivery numbers, the
 * hiring numbers, the money block — so a tile is the same width in all three:
 * one column on a phone, two from `md`, four on a desktop, five once `xl` has
 * the room. `auto-rows` gives every row the same floor, so a card with a hint
 * and a card without one still end on the same line.
 */
export const KPI_GRID_CLASS =
  "grid auto-rows-[minmax(8rem,auto)] grid-cols-1 divide-y rounded-lg border bg-card md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-4 xl:grid-cols-5";

/** Columns per breakpoint, in the order `KPI_GRID_CLASS` turns them on. */
const KPI_COLUMNS = { md: 2, lg: 4, xl: 5 } as const;

type KpiBreakpoint = keyof typeof KPI_COLUMNS;

/**
 * The `col-span` that makes the last card of a strip cover the columns it would
 * otherwise leave empty. Written out rather than interpolated because Tailwind
 * reads class names from source text.
 */
const LAST_CELL_SPAN: Record<KpiBreakpoint, Record<number, string>> = {
  md: { 1: "", 2: "md:col-span-2" },
  lg: { 1: "", 2: "lg:col-span-2", 3: "lg:col-span-3", 4: "lg:col-span-4" },
  xl: {
    1: "",
    2: "xl:col-span-2",
    3: "xl:col-span-3",
    4: "xl:col-span-4",
    5: "xl:col-span-5",
  },
};

/**
 * The class the closing card of a `count`-cell strip carries.
 *
 * A strip whose length is not a multiple of the column count leaves a hole in
 * its last row (six numbers in five columns leave four empty cells). The last
 * card spans what is left instead, at every breakpoint that divides the strip
 * unevenly. Empty string when the cards already fill the row.
 */
export function kpiLastCellClass(count: number): string {
  return (Object.keys(KPI_COLUMNS) as KpiBreakpoint[])
    .map(
      (breakpoint) =>
        LAST_CELL_SPAN[breakpoint][spanAt(count, KPI_COLUMNS[breakpoint])] ?? "",
    )
    .filter(Boolean)
    .join(" ");
}

/** Columns the closing card has to cover: the leftover ones, plus itself. */
function spanAt(count: number, columns: number): number {
  const remainder = count % columns;
  return remainder === 0 ? 1 : columns - remainder + 1;
}

/**
 * One KPI tile, shared by every strip on the workbench.
 *
 * The label is an overline at `--text-micro`, the number is the page-title step
 * `--text-display-sm`, and the note under it is `--text-caption` — the same
 * three roles in the delivery strip, the hiring strip and the money block.
 * `KpiCard` in `runtimes/components/shared` is the runtime detail's hero tile
 * (`--text-display`): a different step of the same scale, for a different page.
 */
export function KpiCell({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 p-5", className)}>
      <div className="text-micro font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-display-sm font-semibold leading-none tabular-nums">{value}</div>
      {hint != null ? <div className="text-caption text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

interface MetricRowProps {
  wsId: string;
  /** `?dept=` — null reads every department. */
  departmentId: string | null;
  metricIds?: readonly MetricId[];
  /**
   * Opens the ledger that can fill a gap. Omitted on a surface with no ledger
   * tab (the block then offers nothing for that gap rather than a dead button).
   */
  onFillGap?: (id: MetricId) => void;
}

/**
 * The workbench's number strip.
 *
 * One cell per contract, drawn in the contract's own three states: a stated
 * value, a true zero (0 plus the empty glyph), or a gap card naming what is
 * missing and where to type it. Nothing here decides what a metric means — that
 * is `metricRenderState` in `./metrics`, and behind it `docs/METRICS.md`.
 */
export function MetricRow({
  wsId,
  departmentId,
  metricIds = OVERVIEW_METRIC_IDS,
  onFillGap,
}: MetricRowProps) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const p = useWorkspacePaths();
  const { data, isPending } = useQuery(workbenchOverviewOptions(wsId, departmentId));

  return (
    <div className={KPI_GRID_CLASS}>
      {metricIds.map((id, index) => {
        const contract = metricContract(id);
        const label = t(($) => $.metric[metricLabelKey(contract)]);
        const closing = index === metricIds.length - 1 ? kpiLastCellClass(metricIds.length) : undefined;
        if (isPending) return <MetricCellSkeleton key={id} className={closing} />;
        const state = metricRenderState(contract, data?.metrics[id]);
        switch (state.kind) {
          case "gap": {
            const domain = gapDomain(id);
            return (
              <GapCard
                key={id}
                title={label}
                needs={domain ? t(($) => $.gap[gapNeedsKey(domain, id)]) : t(($) => $.gap.needs_issues)}
                actionLabel={domain ? t(($) => $.gap.fill_ledger) : t(($) => $.gap.fill_issues)}
                // A ledger gap switches tabs in place when the page can do
                // that; otherwise the same destination is a real link, so the
                // card never sits there with nothing to click.
                onAction={domain && onFillGap ? () => onFillGap(id) : undefined}
                href={
                  domain
                    ? onFillGap
                      ? undefined
                      : `${p.overview()}?tab=ledger&domain=${domain}`
                    : p.issues()
                }
                className={closing}
              />
            );
          }
          case "dash":
            return (
              <KpiCell
                key={id}
                label={label}
                value={<span className="text-muted-foreground">{t(($) => $.empty.value)}</span>}
                className={closing}
              />
            );
          case "zero":
            // A measured zero is a figure, not an absence: printing `0` and then
            // the "no value" glyph underneath said two contradictory things at
            // once. The dash belongs to the `dash` case only.
            return (
              <KpiCell
                key={id}
                label={label}
                value={<MetricNumber display={metricDisplay(contract, 0)} locales={locales} />}
                className={closing}
              />
            );
          case "value":
            return (
              <KpiCell
                key={id}
                label={label}
                value={<MetricNumber display={metricDisplay(contract, state.value)} locales={locales} />}
                hint={
                  state.sampleCount > 0
                    ? t(($) => $.metric_value.samples, { count: state.sampleCount })
                    : undefined
                }
                className={closing}
              />
            );
        }
      })}
    </div>
  );
}

function MetricCellSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 p-5", className)}>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-16" />
    </div>
  );
}

/** The number itself, formatted by unit. Money goes through the shared currency
 * flow so the workbench cannot grow a third money format (METRICS C9). */
function MetricNumber({
  display,
  locales,
}: {
  display: MetricDisplay;
  locales: string;
}) {
  const { t } = useT("blocks");
  if (display.unit === "money") {
    // The symbol follows the contract's currency, not the UI language: a CNY
    // contract must read ¥ for a French-speaking viewer too.
    const prefix =
      display.currency === "USD"
        ? t(($) => $.unit.currency.USD)
        : t(($) => $.unit.currency.CNY);
    return (
      <CurrencyNumberFlow
        value={display.value}
        locales={locales}
        prefix={prefix}
      />
    );
  }
  const suffix =
    display.unit === "days"
      ? t(($) => $.unit.days)
      : display.unit === "hours"
        ? t(($) => $.unit.hours)
        : display.unit === "percent"
          ? t(($) => $.unit.percent)
          : display.unit === "ratio"
            ? t(($) => $.unit.ratio)
            : undefined;
  return (
    <NumberFlow
      value={display.value}
      locales={locales}
      suffix={suffix}
      format={{
        minimumFractionDigits: display.fractionDigits,
        maximumFractionDigits: display.fractionDigits,
      }}
      aria-label={`${display.value}${suffix ?? ""}`}
    />
  );
}

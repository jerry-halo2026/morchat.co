"use client";

import { useQuery } from "@tanstack/react-query";
import { useWorkspacePaths } from "@morechat/core/paths";
import { workbenchOverviewOptions } from "@morechat/core/crm/queries";
import {
  CurrencyNumberFlow,
  NumberFlow,
} from "@morechat/ui/components/ui/number-flow";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { useLocale, useT } from "../i18n";
import { KpiCard } from "../runtimes/components/shared";
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
 * value, a true zero (0 plus "none yet"), or a gap card naming what is missing
 * and where to type it. Nothing here decides what a metric means — that is
 * `metricRenderState` in `./metrics`, and behind it `docs/METRICS.md`.
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
    <div className="grid grid-cols-1 divide-y rounded-lg border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
      {metricIds.map((id) => {
        const contract = metricContract(id);
        const label = t(($) => $.metric[metricLabelKey(contract)]);
        if (isPending) return <MetricCellSkeleton key={id} />;
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
              />
            );
          }
          case "dash":
            return (
              <KpiCard key={id} label={label} value={<span className="text-muted-foreground">—</span>} />
            );
          case "zero":
            return (
              <KpiCard
                key={id}
                label={label}
                value={<MetricNumber display={metricDisplay(contract, 0)} locales={locales} />}
                hint={t(($) => $.metric_value.zero)}
              />
            );
          case "value":
            return (
              <KpiCard
                key={id}
                label={label}
                value={<MetricNumber display={metricDisplay(contract, state.value)} locales={locales} />}
                hint={
                  state.sampleCount > 0
                    ? t(($) => $.metric_value.samples, { count: state.sampleCount })
                    : undefined
                }
              />
            );
        }
      })}
    </div>
  );
}

function MetricCellSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-5">
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

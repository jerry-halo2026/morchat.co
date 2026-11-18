"use client";

import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { KPI_GRID_CLASS, KpiCell, kpiLastCellClass } from "../../blocks/metric-row";
import { useLocale, useT } from "../../i18n";

/**
 * The three counts a BD lead opens the cockpit for.
 *
 * Each one comes from a different place, and the strip says so only where the
 * word is ambiguous — 跟进中 is "has a logged result", not "is in progress", and a
 * reader who assumes the second will read a plateau as a stall:
 *
 *   跟进中    `pipeline.creators.contacted` — a creator with a follow-up that
 *             carries an outcome (a note is not contact)
 *   本月新增  creators created in the reader's month
 *   本月签单  `signed` / `deal` creators whose `updated_at` is in that month
 *
 * `null` is the fourth state and prints `—`: the pipeline's number is three-state
 * on the wire, and the two month figures are `null` while the ledger is only
 * partly read. A skeleton is the fifth state — the strip is unknown, not empty.
 */
export function KpiStrip({
  following,
  newThisMonth,
  signedThisMonth,
  loading,
}: {
  following: number | null;
  newThisMonth: number | null;
  signedThisMonth: number | null;
  loading: boolean;
}) {
  const { t } = useT("blocks");
  const locale = useLocale();

  if (loading) {
    return (
      <div className={KPI_GRID_CLASS} data-slot="kpi-skeleton">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-2 p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={KPI_GRID_CLASS}>
      <KpiCell
        label={t(($) => $.sales_dashboard.kpi_following)}
        value={<Count value={following} locale={locale} />}
        hint={t(($) => $.sales_dashboard.kpi_following_hint)}
      />
      <KpiCell
        label={t(($) => $.sales_dashboard.kpi_new_this_month)}
        value={<Count value={newThisMonth} locale={locale} />}
      />
      <KpiCell
        label={t(($) => $.sales_dashboard.kpi_signed_this_month)}
        value={<Count value={signedThisMonth} locale={locale} />}
        className={kpiLastCellClass(3)}
      />
    </div>
  );
}

/** A whole count in the reader's digits, or the page's glyph for "no answer". */
function Count({ value, locale }: { value: number | null; locale: string }) {
  const { t } = useT("blocks");
  if (value === null) {
    return <span className="text-muted-foreground">{t(($) => $.empty.value)}</span>;
  }
  return <span className="tabular-nums">{new Intl.NumberFormat(locale).format(value)}</span>;
}

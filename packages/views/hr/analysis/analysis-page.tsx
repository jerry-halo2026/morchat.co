"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { cn } from "@morechat/ui/lib/utils";
import { useWorkspaceId } from "@morechat/core/hooks";
import { HR_PAGES } from "@morechat/core/paths";
import {
  hrCandidateListOptions,
  hrEmployeeListOptions,
  hrJobListOptions,
} from "@morechat/core/hr/queries";
import { departmentListOptions } from "@morechat/core/workspace/queries";
import { useLocale, useT } from "../../i18n";
import { CollectionPageHeader, CollectionPageState } from "../../layout/collection-page";
import { PAGE_GUTTER } from "../../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../../layout/route-icon-components";
import { SegmentedToggle } from "../../common/segmented-toggle";
import { KPI_GRID_CLASS, KpiCell, kpiLastCellClass } from "../../blocks/metric-row";
import {
  useAnalysisCopy,
  type AnalysisCopyKey,
} from "./analysis-copy";
import { CategoryBarChart, MonthlyBarChart, type BarDatum } from "./analysis-charts";
import {
  ANALYSIS_RANGES,
  DEFAULT_RANGE,
  UNASSIGNED_DEPARTMENT,
  buildKpis,
  departmentSlices,
  formatRate,
  funnelCounts,
  hasAnyCount,
  hasAnyMovement,
  monthLabel,
  monthlySeries,
  tenureSlices,
  type AnalysisRange,
  type DepartmentScope,
  type FunnelStage,
  type TenureBucket,
} from "./analysis-model";

/** The department picker's "everything" value: a Select needs a value per row. */
const ALL_DEPARTMENTS = "__all";

const RANGE_COPY_KEYS: Record<AnalysisRange, AnalysisCopyKey> = {
  3: "range_3m",
  6: "range_6m",
  12: "range_12m",
};

const STAGE_COPY_KEYS: Record<FunnelStage, AnalysisCopyKey> = {
  screening: "stage_screening",
  test: "stage_test",
  interview: "stage_interview",
  scored: "stage_scored",
  offer: "stage_offer",
  hired: "stage_hired",
};

const TENURE_COPY_KEYS: Record<TenureBucket, AnalysisCopyKey> = {
  under_3m: "tenure_under_3m",
  m3_1y: "tenure_m3_1y",
  y1_3y: "tenure_y1_3y",
  y3_5y: "tenure_y3_5y",
  over_5y: "tenure_over_5y",
};

/**
 * `/{slug}/hr/analysis` — 人事分析: four charts and four numbers, read from the
 * roster and the pipeline, under one department scope and one time window.
 *
 * Nothing here writes, and nothing here is a workbench metric: the 22-metric
 * contract in `packages/core` is the workbench's, these readings are this page's
 * own (see `analysis-model.ts` for why aggregating here is allowed). The
 * retired AI 月报 is not part of this page — it goes through the agent channel,
 * not through a local calculation.
 *
 * What the page draws, and what each one means:
 *
 *   KPI strip    on staff · on probation · joined in the window · turnover
 *   by department  people on staff today, grouped by `department`, unassigned
 *                  included
 *   funnel         candidates whose current stage is at or past each step
 *   by month       joins (`hire_date`) and departures (`leave_date`) per month
 *   tenure         whole months since `hire_date`, five bands
 *
 * Two readings were chosen deliberately and are stated under their charts on
 * screen: the funnel is cumulative (raw per-stage counts are not a funnel), and
 * turnover divides by the headcount at the window start, printing `—` rather
 * than 0% when that base is nobody.
 *
 * The department filter narrows every reading, the department chart included:
 * one scope for the whole page is a rule a reader can hold, and a chart that
 * quietly ignored the filter would be the door to a double reading. The window
 * (3 / 6 / 12 months, default 12) drives the two dated readings — the KPI strip
 * and the monthly chart — while the other three are taken as of today.
 */
export function HrAnalysisPage() {
  const wsId = useWorkspaceId();
  return <AnalysisBody wsId={wsId} />;
}

function AnalysisBody({ wsId }: { wsId: string }) {
  const { t: tl } = useT("layout");
  const locale = useLocale();
  const copy = useAnalysisCopy();
  const Icon = ROUTE_ICON_COMPONENTS[HR_PAGES.analysis.icon];

  // One clock per render: the tenure bands and the window must not disagree
  // because they were computed a millisecond apart.
  const today = useMemo(() => new Date(), []);

  const [scope, setScope] = useState<DepartmentScope>(null);
  const [range, setRange] = useState<AnalysisRange>(DEFAULT_RANGE);

  // One read each, none of them filtered by department: the department chart
  // needs every department anyway, and the scope is then applied in memory, so
  // switching it never refetches. The four lists are single pages — the counts
  // are over the rows that arrived.
  const employees = useQuery(hrEmployeeListOptions(wsId));
  const candidates = useQuery(hrCandidateListOptions(wsId));
  const jobs = useQuery(hrJobListOptions(wsId));
  const departments = useQuery(departmentListOptions(wsId));

  const employeeRows = employees.data?.employees;
  const candidateRows = candidates.data?.candidates;
  const jobRows = jobs.data?.jobs;
  const departmentRows = departments.data;

  const loading =
    employees.isLoading ||
    candidates.isLoading ||
    jobs.isLoading ||
    departments.isLoading;
  const failure =
    employees.error ?? candidates.error ?? jobs.error ?? departments.error ?? null;

  const readings = useMemo(() => {
    const options = { now: today, months: range, scope };
    const staff = employeeRows ?? [];
    return {
      kpis: buildKpis(staff, options),
      departments: departmentSlices(staff, departmentRows ?? [], scope),
      funnel: funnelCounts(candidateRows ?? [], jobRows ?? [], scope),
      months: monthlySeries(staff, options),
      tenure: tenureSlices(staff, options),
    };
  }, [employeeRows, candidateRows, jobRows, departmentRows, scope, range, today]);

  const scopeItems = useMemo(
    () => [
      { value: ALL_DEPARTMENTS, label: copy("scope_all") },
      { value: UNASSIGNED_DEPARTMENT, label: copy("scope_unassigned") },
      ...(departmentRows ?? []).map((department) => ({
        value: department.id,
        label: department.name,
      })),
    ],
    [departmentRows, copy],
  );

  const scopeLabel =
    scope === null
      ? copy("scope_all")
      : scope === UNASSIGNED_DEPARTMENT
        ? copy("scope_unassigned")
        : ((departmentRows ?? []).find((department) => department.id === scope)?.name ??
          copy("scope_unassigned"));

  const retry = () => {
    void employees.refetch();
    void candidates.refetch();
    void jobs.refetch();
    void departments.refetch();
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tl(($) => $.nav[HR_PAGES.analysis.navKey])}
      tools={
        <Select
          items={scopeItems}
          value={scope ?? ALL_DEPARTMENTS}
          onValueChange={(next) =>
            setScope(next === ALL_DEPARTMENTS ? null : String(next))
          }
        >
          <SelectTrigger
            aria-label={copy("filter_department")}
            size="sm"
            className="w-44"
          >
            <SelectValue>
              {() => (
                <span className="min-w-0 truncate" title={scopeLabel}>
                  {scopeLabel}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {scopeItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                <span className="max-w-56 truncate" title={item.label}>
                  {item.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      actions={
        <div role="group" aria-label={copy("range_label")}>
          <SegmentedToggle
            value={String(range)}
            options={ANALYSIS_RANGES.map(
              (months) => [String(months), copy(RANGE_COPY_KEYS[months])] as const,
            )}
            onChange={(next) => setRange(Number(next) as AnalysisRange)}
          />
        </div>
      }
    />
  );

  if (failure) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={copy("error_title")}
          description={
            failure instanceof Error && failure.message
              ? failure.message
              : copy("error_description")
          }
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {copy("error_retry")}
            </Button>
          }
        />
      </div>
    );
  }

  // Nobody on file at all: the page's first-run state rather than four empty
  // charts, which would read as four failed loads.
  const firstRun = !loading && (employeeRows ?? []).length === 0;

  const departmentData: BarDatum[] = readings.departments.map((slice) => ({
    label: slice.name ?? copy("scope_unassigned"),
    count: slice.count,
  }));
  const funnelData: BarDatum[] = readings.funnel.map((row) => ({
    label: copy(STAGE_COPY_KEYS[row.stage]),
    count: row.count,
  }));
  const tenureData: BarDatum[] = readings.tenure.map((row) => ({
    label: copy(TENURE_COPY_KEYS[row.bucket]),
    count: row.count,
  }));
  const monthLabels = readings.months.map((point) => monthLabel(point.month, locale));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(PAGE_GUTTER, "flex flex-col gap-4 py-4")}>
          {firstRun ? (
            <CollectionPageState
              icon={Icon}
              title={copy("empty_title")}
              description={copy("empty_body")}
            />
          ) : loading ? (
            <AnalysisSkeleton />
          ) : (
            <>
              <div className={KPI_GRID_CLASS}>
                <KpiCell
                  label={copy("kpi_headcount")}
                  value={formatCount(readings.kpis.headcount, locale)}
                />
                <KpiCell
                  label={copy("kpi_probation")}
                  value={formatCount(readings.kpis.probation, locale)}
                />
                <KpiCell
                  label={copy("kpi_hires", { months: range })}
                  value={formatCount(readings.kpis.hires, locale)}
                />
                <KpiCell
                  label={copy("kpi_turnover", { months: range })}
                  value={
                    formatRate(readings.kpis.turnover, locale) ?? (
                      <span className="text-muted-foreground">—</span>
                    )
                  }
                  className={kpiLastCellClass(4)}
                />
              </div>
              <p data-slot="analysis-kpi-caption" className="text-caption text-muted-foreground">
                {copy("caption_kpis", { months: range })}
              </p>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard
                  title={copy("chart_department")}
                  caption={copy("caption_department")}
                  emptyHint={copy("chart_empty")}
                  empty={!hasAnyCount(departmentData)}
                >
                  <CategoryBarChart
                    data={departmentData}
                    seriesLabel={copy("series_people")}
                    color="var(--chart-1)"
                    summary={summarize(departmentData)}
                  />
                </ChartCard>

                <ChartCard
                  title={copy("chart_funnel")}
                  caption={copy("caption_funnel")}
                  emptyHint={copy("chart_empty")}
                  empty={!hasAnyCount(funnelData)}
                >
                  <CategoryBarChart
                    data={funnelData}
                    seriesLabel={copy("series_people")}
                    color="var(--chart-2)"
                    summary={summarize(funnelData)}
                  />
                </ChartCard>

                <ChartCard
                  title={copy("chart_monthly")}
                  caption={copy("caption_monthly")}
                  emptyHint={copy("chart_empty")}
                  empty={!hasAnyMovement(readings.months)}
                >
                  <MonthlyBarChart
                    data={readings.months}
                    hiresLabel={copy("series_hires")}
                    departuresLabel={copy("series_departures")}
                    monthLabels={monthLabels}
                    summary={summarizeMonths(readings.months, monthLabels)}
                  />
                </ChartCard>

                <ChartCard
                  title={copy("chart_tenure")}
                  caption={copy("caption_tenure")}
                  emptyHint={copy("chart_empty")}
                  empty={!hasAnyCount(tenureData)}
                >
                  <CategoryBarChart
                    data={tenureData}
                    seriesLabel={copy("series_people")}
                    color="var(--chart-4)"
                    summary={summarize(tenureData)}
                    maxTickChars={18}
                    tickWidth={132}
                  />
                </ChartCard>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One chart and the reading its numbers were computed by.
 *
 * The card owns the "nothing to count" state: a chart with no bar would draw an
 * empty axis and grid, which looks exactly like a chart that failed to load, so
 * the body is replaced by `—` and the caption below still says what would have
 * been counted.
 */
function ChartCard({
  title,
  caption,
  emptyHint,
  empty,
  children,
}: {
  title: string;
  caption: string;
  emptyHint: string;
  /** Whether the chart has a bar worth drawing (`hasAnyCount` / `hasAnyMovement`). */
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <section
      data-slot="analysis-chart"
      className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4"
    >
      <h2 className="text-label font-medium">{title}</h2>
      {empty ? (
        <p
          data-slot="analysis-chart-empty"
          title={emptyHint}
          className="flex w-full items-center justify-center py-10 text-title-sm text-muted-foreground"
        >
          —
        </p>
      ) : (
        children
      )}
      <p className="text-caption text-muted-foreground">{caption}</p>
    </section>
  );
}

/** What a bar chart's bars say, for its accessible name. */
function summarize(data: readonly BarDatum[]): string {
  return data.map((row) => `${row.label}: ${row.count}`).join(", ");
}

/** What the monthly chart says, including the months nothing happened in. */
function summarizeMonths(
  months: readonly { hires: number; departures: number }[],
  labels: readonly string[],
): string {
  return months
    .map(
      (point, index) =>
        `${labels[index] ?? ""}: +${point.hires} / -${point.departures}`,
    )
    .join(", ");
}

/** A whole count in the reader's digits. */
function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Four skeleton tiles and four skeleton charts, the shapes the page fills. */
function AnalysisSkeleton() {
  return (
    <div data-slot="analysis-skeleton" className="flex flex-col gap-4">
      <div className={KPI_GRID_CLASS}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col gap-2 p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="rounded-lg border bg-card p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 aspect-[2/1] w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

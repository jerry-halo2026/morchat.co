"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { cn } from "@morechat/ui/lib/utils";
import { bdPerformanceOptions } from "@morechat/core/bd/performance";
import { useWorkspaceId } from "@morechat/core/hooks";
import { SALES_PAGES } from "@morechat/core/paths";
import { memberListOptions } from "@morechat/core/workspace/queries";
import { useT } from "../i18n";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import { PAGE_TOOLBAR } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { PerformanceBlocks } from "./performance/blocks";
import { usePerformanceCopy } from "./performance/copy";
import { MemberTable, MonthTable } from "./performance/dimension-tables";
import {
  isEmptyWindow,
  memberRows,
  monthRange,
  rangeFor,
  validRange,
  windowLabel,
  type DayRange,
  type RangeKey,
} from "./performance/model";
import { RangePicker } from "./performance/range-picker";
import { localDayOf } from "./quotes/model";

/**
 * `/{slug}/sales/performance` — 业绩: what one window produced, cut four ways and
 * then twice again.
 *
 * The report is `GET /api/workbench/bd/performance` (`WORKBENCH-API.md` §22): one
 * request, one window, **one currency**, every fact bucketed by its own date. The
 * page's job is to state that without lying about it —
 *
 *   - the window is chosen here (本月 / 上月 / 本季 / 自定义) and sent as explicit
 *     days, so the caption under the toolbar is the window the numbers describe;
 *   - the four blocks answer 成交 / 报价 / 过程 / 联盟, each figure in one of the
 *     report's three states (a number, a measured zero, or the empty marker);
 *   - the two tables cut the same facts by member and by month, each with a 合计
 *     line summed from the rows above it.
 *
 * Three rules it keeps, all of which are the report's own:
 *
 *   - **One currency, said once.** `currency` names the currency every amount is in
 *     and rows in another currency are excluded from the counts too. The page says
 *     so above the blocks and never prints a second symbol.
 *   - **Nothing is filled in.** A rate with no offers behind it is `null` and prints
 *     the empty marker; an amount nobody summed is `null` and never becomes ¥0. A
 *     zero that is measured prints as `0`.
 *   - **An empty window is its own page.** `empty: insufficient_data` means no fact
 *     is dated inside these days, so the page says that and offers a wider window
 *     instead of drawing four zeros.
 *
 * It reads the member directory only to put a name on a row the report identified
 * by id — the report's own `name` wins when it has one.
 */
export function SalesPerformancePage() {
  const wsId = useWorkspaceId();
  return <PerformanceBody wsId={wsId} />;
}

function PerformanceBody({ wsId }: { wsId: string }) {
  const copy = usePerformanceCopy();
  const { t } = copy;
  const { t: tLayout } = useT("layout");
  const Icon = ROUTE_ICON_COMPONENTS[SALES_PAGES.performance.icon];

  // One clock per render: the preset windows and the custom fields' opening days
  // must not disagree about today.
  const today = useMemo(() => localDayOf(new Date()), []);

  const [range, setRange] = useState<RangeKey>("month");
  // 自定义 opens on 本月, so switching to it never starts from an empty form.
  const [custom, setCustom] = useState<DayRange>(() => monthRange(today));

  // The `else` branch is narrowed to the three presets, so no cast is needed.
  const active: DayRange = range === "custom" ? custom : rangeFor(range, today);
  const askable = validRange(active);

  const report = useQuery({
    ...bdPerformanceOptions(wsId, active),
    enabled: !!wsId && askable,
  });
  const members = useQuery(memberListOptions(wsId));

  const names = useMemo(
    () => new Map((members.data ?? []).map((member) => [member.id, member.name] as const)),
    [members.data],
  );

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[SALES_PAGES.performance.navKey])}
    />
  );

  const data = report.data;
  const failure = report.error ?? null;

  if (failure) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.error_title)}
          description={failure instanceof Error && failure.message ? failure.message : undefined}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => void report.refetch()}>
              {t(($) => $.error_retry)}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      <div className={cn(PAGE_TOOLBAR, "flex-wrap gap-2")}>
        <RangePicker
          value={range}
          onChange={setRange}
          custom={custom}
          onCustomChange={setCustom}
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-end gap-x-3 text-caption text-muted-foreground">
          {data ? (
            <span className="tabular-nums">{windowLabel(data)}</span>
          ) : null}
          {data ? (
            <span className="min-w-0 truncate">
              {t(($) => $.currency_note, { currency: data.currency })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {!askable ? (
          <CollectionPageState
            tone="warning"
            icon={AlertCircle}
            title={t(($) => $.range_invalid)}
          />
        ) : report.isPending ? (
          <div className="flex flex-col gap-4 pt-2" aria-busy="true">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : data === undefined ? null : isEmptyWindow(data) ? (
          <CollectionPageState
            icon={Icon}
            title={t(($) => $.empty_title)}
            description={t(($) => $.empty_description)}
          />
        ) : (
          <div className="flex flex-col gap-5 pt-2">
            <PerformanceBlocks report={data} />
            <div className="grid gap-5 xl:grid-cols-2">
              <MemberTable rows={memberRows(data.by_member, names)} currency={data.currency} />
              <MonthTable rows={data.by_month} currency={data.currency} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { bdActivityListOptions, bdPipelineOptions } from "@morechat/core/bd/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { SALES_PAGES, useWorkspacePaths } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import { AlertCircle } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import { PAGE_GUTTER } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { ActivitySection } from "./dashboard/activity-section";
import { FollowupSection } from "./dashboard/followup-section";
import { KpiStrip } from "./dashboard/kpi-strip";
import { MyWorkbenchQueue } from "./dashboard/my-queue";
import { MoneyLine } from "./dashboard/money-line";
import { QuickFollowupDialog, type FollowupTarget } from "./dashboard/quick-followup-dialog";
import { TodayBar } from "./dashboard/today-bar";
import { useCreatorLedger } from "./dashboard/creator-ledger";
import {
  creatorMonthCounts,
  creatorNamesById,
  dueFollowups,
} from "./dashboard/model";

/**
 * Rows of the follow-up ledger the cockpit reads to build today's queue.
 *
 * `GET /api/workbench/bd/activities` sorts by `happened_at DESC` and takes
 * `limit` only — there is no `due=1` filter — so "who is due" is answered from
 * the newest rows of the ledger. 200 is the endpoint's ceiling: enough to cover
 * a month of a busy BD desk, and the same statement the sidebar badge makes with
 * its own page. §20.6 records the missing filter as known debt; until it lands,
 * a creator whose newest follow-up is older than this window cannot appear here.
 */
const ACTIVITY_SCAN_LIMIT = 200;

/**
 * `/{slug}/sales` — 商务驾驶舱: today, three counts, the money line, the
 * creators waiting for a call, and the last few follow-ups.
 *
 * What the page reads and where each number comes from:
 *
 *   今天        the browser's clock (`Intl`, see `dashboard/today-bar`)
 *   三格        `/bd/pipeline` for 跟进中; the creator ledger's month counts for
 *               本月新增 and 本月签单 (`dashboard/model`)
 *   钱          `/bd/pipeline` orders — 已签 and 已回款, three-state each
 *   今日跟进    the newest follow-up per creator whose `next_follow_at` passed
 *   最近动态    the last eight follow-up rows as the server ordered them
 *
 * Three blocks the original cockpit had are **not** drawn, because nothing in
 * this workspace can fill them and an empty frame would claim otherwise:
 *
 *   - 本月业绩目标. `ops_finance_month` carries no target column, so there is no
 *     denominator for a progress bar. The money line prints the two figures and
 *     the 口径 under them instead.
 *   - 待办. There is no `bd_todo` table; a to-do block would be a list this
 *     client invented.
 *   - 达人生日. `creator` has no birthday column.
 *
 * Every block owns its own empty, loading and error state, so one unread ledger
 * does not blank a page whose other four blocks answered — except the pipeline
 * and the follow-up ledger themselves, whose failure is the page's failure.
 */
export function SalesDashboardPage() {
  const wsId = useWorkspaceId();
  return <DashboardBody wsId={wsId} />;
}

function DashboardBody({ wsId }: { wsId: string }) {
  const { t } = useT("blocks");
  const { t: tLayout } = useT("layout");
  const p = useWorkspacePaths();
  const Icon = ROUTE_ICON_COMPONENTS[SALES_PAGES.dashboard.icon];

  // One clock per render: 今天's line, the month counts and the overdue badges
  // must not disagree because they were computed a millisecond apart.
  const now = useMemo(() => new Date(), []);

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  // A member may log a follow-up (the server defaults the owner to them); only
  // a viewer with no role at all — not a member of this workspace — may not.
  const canWrite = !memberLoading && role !== null;

  const pipeline = useQuery(bdPipelineOptions(wsId));
  const activities = useQuery(bdActivityListOptions(wsId, { limit: ACTIVITY_SCAN_LIMIT }));
  const ledger = useCreatorLedger(wsId);

  const [target, setTarget] = useState<FollowupTarget | null>(null);

  const names = useMemo(() => creatorNamesById(ledger.creators), [ledger.creators]);
  const months = useMemo(
    () => creatorMonthCounts(ledger.creators, now, ledger.complete),
    [ledger.creators, now, ledger.complete],
  );
  const due = useMemo(
    () => dueFollowups(activities.data?.activities ?? [], now),
    [activities.data, now],
  );

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[SALES_PAGES.dashboard.navKey])}
    />
  );

  const failure = pipeline.error ?? activities.error ?? null;

  if (failure) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.sales_dashboard.error_title)}
          description={
            failure instanceof Error && failure.message
              ? failure.message
              : t(($) => $.sales_dashboard.error_description)
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void pipeline.refetch();
                void activities.refetch();
                ledger.refetch();
              }}
            >
              {t(($) => $.sales_dashboard.error_retry)}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(PAGE_GUTTER, "flex flex-col gap-5 py-4")}>
          <TodayBar now={now} />
          <KpiStrip
            following={pipeline.data?.creators.contacted.value ?? null}
            newThisMonth={months.newThisMonth}
            signedThisMonth={months.signedThisMonth}
            loading={pipeline.isPending || ledger.loading}
          />
          <MoneyLine
            signed={pipeline.data?.orders.total_amount}
            collected={pipeline.data?.orders.paid_amount}
            loading={pipeline.isPending}
          />
          <MyWorkbenchQueue />
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <FollowupSection
              rows={due}
              names={names}
              moreHref={p.sales.followups()}
              canWrite={canWrite}
              onRecord={setTarget}
              loading={activities.isPending}
            />
            <ActivitySection
              activities={activities.data?.activities ?? []}
              names={names}
              loading={activities.isPending}
            />
          </div>
        </div>
      </div>
      <QuickFollowupDialog
        target={target}
        open={target !== null}
        onOpenChange={(next) => {
          if (!next) setTarget(null);
        }}
      />
    </div>
  );
}

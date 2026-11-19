"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { bdActivityListOptions } from "@morechat/core/bd/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { SALES_PAGES, useWorkspacePaths } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import { AlertCircle, Clock3, Inbox, MessageSquare } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { SegmentedToggle } from "../common/segmented-toggle";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import { PAGE_GUTTER } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { AppLink } from "../navigation";
import { useFollowupsCopy } from "./followups/copy";
import { FollowupRow } from "./followups/followup-row";
import { LogFollowupForm } from "./followups/log-followup-form";
import { useLedgerCopy, useRowFocus } from "./quotes/deep-link";
import {
  ACTIVITY_WINDOW,
  newestIds,
  newestPerCreator,
  overdueQueue,
  todayQueue,
  type FollowupTab,
  type QueueRow,
} from "./followups/model";
import { shortCreatorId, useCreatorDirectory } from "./followups/use-creator-directory";
import { ImportCsvButton } from "./import/import-dialog";

/**
 * `/{slug}/sales/followups` —— 跟进：商务每天开工看的第一页。
 *
 * 这一页只回答两个问题，并且让人在这里把事情做完：**谁今天该跟**、**谁逾期了**。
 * 所以列表不是表格而是行卡片，每行就地能「记一笔」（展开内联表单）或「跳过」
 * （推一天），不跳到达人页、不开弹窗、不丢列表位置。
 *
 * 三个分页的口径（`followups/model.ts` 里有逐条说明）：
 *
 *   今天到期   每位达人的**最新一条**跟进，`next_follow_at` 落在本地今天
 *   逾期       最新一条 `next_follow_at` 早于本地今天零点，逾期久的在前
 *   全部记录   全部 `creator_activity`，服务端 `happened_at DESC` 的原样
 *
 * 三个分页共用**一次读**：`bdActivityListOptions(wsId, { limit: 200 })`。服务端的
 * 跟进台账没有 due 过滤、也没有 cursor/offset（WORKBENCH-API §20，`limit` 上限
 * 200），所以"最新一条"只在这 200 行里成立，"全部记录"也只能翻到 200 行为止——
 * 底部那句说明写的就是这件事，而不是假装还有下一页。每天几十条的量级下，200 行
 * 足够覆盖一个多月的窗口；再往前的记录在达人自己的页面上读。
 *
 * 写权限：`useCurrentMember` 没有角色（不是这个 workspace 的成员）时不渲染「记一条」
 * 「记一笔」「跳过」——一排灰掉的按钮是把同一条规则说十几遍。
 */
export function SalesFollowupsPage() {
  const wsId = useWorkspaceId();
  return <FollowupsBody wsId={wsId} />;
}

function FollowupsBody({ wsId }: { wsId: string }) {
  const { t: tLayout } = useT("layout");
  const copy = useFollowupsCopy();
  const p = useWorkspacePaths();
  const Icon = ROUTE_ICON_COMPONENTS[SALES_PAGES.followups.icon];

  // 一次渲染一个时钟：三个分页的"今天"必须一致，不能各算各的毫秒。
  const now = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<FollowupTab>("due");
  const [composerOpen, setComposerOpen] = useState(false);

  const activities = useQuery(bdActivityListOptions(wsId, { limit: ACTIVITY_WINDOW }));
  // One array identity per response: everything below memos on it, and an empty
  // `?? []` per render would rebuild the queues on every unrelated render.
  const rows = useMemo(() => activities.data?.activities ?? [], [activities.data]);

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  const canWrite = !memberLoading && role !== null;

  const due = useMemo(() => todayQueue(rows, now), [rows, now]);
  const overdue = useMemo(() => overdueQueue(rows, now), [rows, now]);
  const carrying = useMemo(() => newestIds(rows), [rows]);
  // 「全部记录」是流水本身，不是义务：行首不挂今天/逾期，`dueDays` 只用来对齐类型。
  const records = useMemo<QueueRow[]>(
    () => rows.map((activity) => ({ activity, dueDays: 0 })),
    [rows],
  );

  const creatorIds = useMemo(() => rows.map((activity) => activity.creator_id), [rows]);
  const directory = useCreatorDirectory(wsId, creatorIds);

  const nameOf = (creatorId: string) =>
    directory.names.get(creatorId) ??
    copy("creator_unknown", { id: shortCreatorId(creatorId) });

  // 「记一条」只能对已经有关系的人：跟进是接着上次往下说，第一次联系属于达人页
  // （空态里那句"去达人页挑几个"）。所以下拉的选项就是本页已经读到的达人，不需要
  // 另读一遍台账，也不会出现一个"你从没跟过的人"的选项。
  const composerCreators = useMemo(
    () =>
      newestPerCreator(rows)
        .map((activity) => ({
          id: activity.creator_id,
          name:
            directory.names.get(activity.creator_id) ??
            copy("creator_unknown", { id: shortCreatorId(activity.creator_id) }),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rows, directory.names, copy],
  );

  const visible: QueueRow[] = tab === "due" ? due : tab === "overdue" ? overdue : records;
  const visibleIds = useMemo(
    () => visible.map((row) => row.activity.id),
    [visible],
  );

  /**
   * `?followup=<id>` — the inbox's workbench notice and 我的队列 link at one
   * follow-up. Matched against the tab this page is drawing, so a row in another
   * queue is reported as missing instead of silently ignored; switching tabs then
   * brings it into view like any other deep link.
   */
  const focus = useRowFocus("followup", visibleIds, !activities.isPending);
  const ledger = useLedgerCopy();

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[SALES_PAGES.followups.navKey])}
      actions={
        canWrite ? (
          <>
            {/*
              A month of follow-ups is typed, not clicked: the import writes
              `creator_activity` rows straight into this page's ledger, and the
              dialog invalidates `["bd", wsId]` + `["workbench", wsId]` on commit
              (§23.6), so the three queues reread themselves.
            */}
            <ImportCsvButton wsId={wsId} kind="activities" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              aria-expanded={composerOpen}
              onClick={() => setComposerOpen((open) => !open)}
            >
              {copy("log_single")}
            </Button>
          </>
        ) : undefined
      }
    />
  );

  if (activities.error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={copy("error_title")}
          description={
            activities.error instanceof Error && activities.error.message
              ? activities.error.message
              : copy("error_description")
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void activities.refetch();
                directory.refetch();
              }}
            >
              {copy("retry")}
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
        <div className={cn(PAGE_GUTTER, "flex flex-col gap-3 py-4")}>
          <div className="max-w-md">
            <SegmentedToggle
              value={tab}
              options={[
                ["due", copy("tab_due")],
                ["overdue", copy("tab_overdue")],
                ["all", copy("tab_all")],
              ]}
              onChange={setTab}
            />
          </div>

          {/*
            A deep link that matches nothing in this tab says so here, above
            whichever of the three states is drawn: the row itself is not on
            screen, so it cannot carry the message.
          */}
          {focus.missing ? (
            <p
              role="status"
              data-slot="followup-focus-missing"
              className="text-caption text-muted-foreground"
            >
              {ledger.rowMissing}
            </p>
          ) : null}

          {canWrite && composerOpen ? (
            <LogFollowupForm
              creators={composerCreators}
              onSaved={() => setComposerOpen(false)}
              onCancel={() => setComposerOpen(false)}
            />
          ) : null}

          {activities.isPending ? (
            <div className="flex flex-col gap-1.5" data-slot="followups-skeleton">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <TabEmpty
              tab={tab}
              canWrite={canWrite}
              creatorsHref={p.sales.creators()}
              onLogOne={() => setComposerOpen(true)}
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {visible.map((row) => (
                <li key={row.activity.id} className="min-w-0">
                  <FollowupRow
                    activity={row.activity}
                    name={nameOf(row.activity.creator_id)}
                    dueDays={tab === "all" ? null : row.dueDays}
                    canWrite={canWrite}
                    canSkip={carrying.has(row.activity.id)}
                    focused={focus.classNameOf(row.activity.id) !== undefined}
                  />
                </li>
              ))}
            </ul>
          )}

          {tab === "all" && rows.length >= ACTIVITY_WINDOW ? (
            <p className="text-caption text-muted-foreground">
              {copy("window_note", { count: ACTIVITY_WINDOW })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * 三种空态说三件不同的事。
 *
 * 今天没有要跟的人不是问题，缺的是名单——所以它指向达人页；没有逾期是好事，不
 * 需要动作；还没有记录是第一次，动作是记第一条。共用一句"暂无数据"会把这三件
 * 事说成一件。
 */
function TabEmpty({
  tab,
  canWrite,
  creatorsHref,
  onLogOne,
}: {
  tab: FollowupTab;
  canWrite: boolean;
  creatorsHref: string;
  onLogOne: () => void;
}) {
  const copy = useFollowupsCopy();

  if (tab === "due") {
    return (
      <CollectionPageState
        icon={MessageSquare}
        title={copy("empty_due_title")}
        description={copy("empty_due_description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            render={<AppLink href={creatorsHref} />}
            nativeButton={false}
          >
            {copy("empty_due_link")}
          </Button>
        }
      />
    );
  }

  if (tab === "overdue") {
    return (
      <CollectionPageState
        icon={Clock3}
        title={copy("empty_overdue_title")}
        description={copy("empty_overdue_description")}
      />
    );
  }

  return (
    <CollectionPageState
      icon={Inbox}
      title={copy("empty_all_title")}
      description={copy("empty_all_description")}
      actions={
        canWrite ? (
          <Button type="button" variant="outline" size="sm" onClick={onLogOne}>
            {copy("log_single")}
          </Button>
        ) : undefined
      }
    />
  );
}

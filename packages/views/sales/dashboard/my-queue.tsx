"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ListChecks } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { cn } from "@morechat/ui/lib/utils";
import { bdActivityListOptions, bdQuoteListOptions } from "@morechat/core/bd/queries";
import { useOpenBdQuoteThread } from "@morechat/core/bd/mutations";
import { crmCollabListOptions } from "@morechat/core/crm/queries";
import { useOpenCrmCollabThread } from "@morechat/core/crm/mutations";
import { useWorkspaceId } from "@morechat/core/hooks";
import { useWorkspacePaths } from "@morechat/core/paths";
import type { BdActivity, BdQuote, CrmCollab, WorkbenchThread } from "@morechat/core/types";
import { useT } from "../../i18n";
import { CollectionPageState } from "../../layout/collection-page";
import { SegmentedToggle } from "../../common/segmented-toggle";
import { useCreatorLedger } from "./creator-ledger";
import { creatorNamesById } from "./model";

/**
 * 我的队列 — the three ledgers narrowed to the reader's own work (COLLAB-MODEL §4).
 *
 * `?assignee=me` is answered by the server against the *actor*: a member sees the
 * rows assigned to their user id, an agent sees the rows assigned to the agent.
 * This component therefore never filters client-side — it asks the question and
 * renders the answer, which is the only version that stays right when the queue
 * belongs to an agent rather than to the human whose session opened it.
 *
 * Each row carries the two things a queue needs to be actionable: the date that
 * makes it due, and its discussion — 讨论 N · 最近一条, with the issue behind it
 * (§5). A discussion whose issue was deleted renders as 已归档 and keeps the row:
 * the row is still work, even when its thread is gone.
 *
 * Self-contained on purpose: it owns its three reads, its switch and its states, so
 * the cockpit composes it as one element and a ledger that fails takes only this
 * block down.
 */

const QUEUE_SCAN_LIMIT = 100;

type QueueTab = "followups" | "quotes" | "collabs";

export function MyWorkbenchQueue() {
  const wsId = useWorkspaceId();
  return <QueueBody wsId={wsId} />;
}

function QueueBody({ wsId }: { wsId: string }) {
  const { t } = useT("sales");
  const p = useWorkspacePaths();
  const [tab, setTab] = useState<QueueTab>("followups");

  // One filter object per tab, each asking the server for the actor's queue.
  const mine = { assignee: "me", limit: QUEUE_SCAN_LIMIT } as const;
  const activities = useQuery(bdActivityListOptions(wsId, mine));
  const quotes = useQuery(bdQuoteListOptions(wsId, mine));
  const collabs = useQuery(crmCollabListOptions(wsId, mine));
  const ledger = useCreatorLedger(wsId);
  // One name index for the whole block, built from the ledger pages the cockpit
  // already reads: a queue row names a creator, and a second read for the same
  // names would be the N+1 this page exists to avoid.
  const names = useMemo(() => creatorNamesById(ledger.creators), [ledger.creators]);
  const nameOf = (creatorID: string) => names.get(creatorID) ?? creatorID.slice(0, 8);

  const activityRows = useMemo(() => activities.data?.activities ?? [], [activities.data]);
  const quoteRows = useMemo(() => quotes.data?.quotes ?? [], [quotes.data]);
  const collabRows = useMemo(() => collabs.data?.collabs ?? [], [collabs.data]);

  const active = tab === "followups" ? activities : tab === "quotes" ? quotes : collabs;
  const rows = tab === "followups" ? activityRows.length : tab === "quotes" ? quoteRows.length : collabRows.length;

  const retry = () => {
    void activities.refetch();
    void quotes.refetch();
    void collabs.refetch();
  };

  return (
    <section
      data-mc="my-workbench-queue"
      className="flex flex-col gap-3 rounded-card border border-surface-border bg-surface p-4"
    >
      <header className="flex flex-wrap items-center gap-2">
        <ListChecks aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="text-body font-medium">{t(($) => $.queue.title)}</h2>
        <div role="group" aria-label={t(($) => $.queue.title)} className="ml-auto">
          <SegmentedToggle
            value={tab}
            options={[
              ["followups", t(($) => $.queue.tab_followups)],
              ["quotes", t(($) => $.queue.tab_quotes)],
              ["collabs", t(($) => $.queue.tab_collabs)],
            ]}
            onChange={setTab}
          />
        </div>
      </header>

      {active.isError ? (
        <CollectionPageState
          role="alert"
          tone="destructive"
          size="compact"
          icon={AlertCircle}
          title={t(($) => $.queue.error)}
          description={
            active.error instanceof Error && active.error.message ? active.error.message : undefined
          }
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t(($) => $.queue.retry)}
            </Button>
          }
        />
      ) : active.isPending ? (
        <p className="py-6 text-center text-caption text-muted-foreground" aria-busy="true">
          {t(($) => $.queue.loading)}
        </p>
      ) : rows === 0 ? (
        <p data-mc="my-queue-empty" className="py-6 text-center text-caption text-muted-foreground">
          {t(($) => $.queue.empty)}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-surface-border">
          {tab === "followups"
            ? activityRows.map((row) => (
                <ActivityQueueRow key={row.id} row={row} name={nameOf(row.creator_id)} />
              ))
            : null}
          {tab === "quotes"
            ? quoteRows.map((row) => (
                <QuoteQueueRow key={row.id} row={row} name={nameOf(row.creator_id)} />
              ))
            : null}
          {tab === "collabs"
            ? collabRows.map((row) => (
                <CollabQueueRow key={row.id} row={row} name={nameOf(row.creator_id)} />
              ))
            : null}
        </ul>
      )}

      <p className="text-caption text-muted-foreground">
        <a
          href={tab === "followups" ? p.sales.followups() : tab === "quotes" ? p.sales.quotes() : p.sales.collabs()}
          className="underline-offset-2 hover:underline"
        >
          {t(($) => $.queue.open_ledger)}
        </a>
      </p>
    </section>
  );
}

/** The one fact that makes the row due, rendered beside its name. */
function QueueRowShell({
  name,
  detail,
  href,
  children,
}: {
  name: string;
  detail: string;
  /**
   * Where this row lives in its ledger, as `?quote=|?collab=|?followup=<id>`.
   * The ledger pages read it and focus the row (deep-link), so "my queue" can
   * hand the reader the exact record instead of the top of a list.
   */
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-body">
      <a className="min-w-0 flex-1 truncate underline-offset-2 hover:underline" title={name} href={href}>
        {name}
      </a>
      <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{detail}</span>
      {children}
    </li>
  );
}

function ActivityQueueRow({ row, name }: { row: BdActivity; name: string }) {
  const p = useWorkspacePaths();
  const { t } = useT("sales");
  const detail = row.next_follow_at
    ? t(($) => $.queue.due_on, { date: row.next_follow_at.slice(0, 10) })
    : t(($) => $.queue.no_date);
  return <QueueRowShell name={name} href={`${p.sales.followups()}?followup=${row.id}`} detail={detail} />;
}

function QuoteQueueRow({ row, name }: { row: BdQuote; name: string }) {
  const p = useWorkspacePaths();
  const { t } = useT("sales");
  const open = useOpenBdQuoteThread();
  const detail = row.valid_until
    ? t(($) => $.queue.expires_on, { date: row.valid_until.slice(0, 10) })
    : t(($) => $.queue.no_date);
  return (
    <QueueRowShell name={name} href={`${p.sales.quotes()}?quote=${row.id}`} detail={detail}>
      <ThreadChip
        thread={row.thread ?? null}
        busy={open.isPending}
        onOpen={() => open.mutate(row.id)}
      />
    </QueueRowShell>
  );
}

function CollabQueueRow({ row, name }: { row: CrmCollab; name: string }) {
  const p = useWorkspacePaths();
  const { t } = useT("sales");
  const open = useOpenCrmCollabThread();
  const detail = row.settled_on
    ? t(($) => $.queue.settles_on, { date: row.settled_on.slice(0, 10) })
    : t(($) => $.queue.no_date);
  return (
    <QueueRowShell name={name} href={`${p.sales.collabs()}?collab=${row.id}`} detail={detail}>
      <ThreadChip
        thread={row.thread ?? null}
        busy={open.isPending}
        onOpen={() => open.mutate(row.id)}
      />
    </QueueRowShell>
  );
}

/**
 * 讨论 N · 最近一条, or the one action that starts one.
 *
 * Three states, and none of them is an error: no thread yet (a button that opens
 * it — idempotent, so the second click answers the same issue), a live thread (the
 * count, the newest line, and a link to the issue), and a thread whose issue was
 * deleted (已归档, no link). The row itself is present in all three.
 */
export function ThreadChip({
  thread,
  busy,
  onOpen,
}: {
  thread: WorkbenchThread | null;
  busy: boolean;
  onOpen: () => void;
}) {
  const { t } = useT("sales");
  const p = useWorkspacePaths();

  if (!thread) {
    return (
      <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={onOpen}>
        {t(($) => $.queue.start_thread)}
      </Button>
    );
  }
  if (thread.state !== "linked") {
    return (
      <span className="shrink-0 text-caption text-muted-foreground">
        {t(($) => $.queue.thread_archived)}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-2 text-caption">
      <a
        href={p.issueDetail(thread.issue_id)}
        className="tabular-nums text-brand underline-offset-2 hover:underline"
        title={thread.last_comment_preview ?? undefined}
      >
        {t(($) => $.queue.thread_count, { count: thread.comment_count })}
        {thread.last_comment_preview ? (
          <span className={cn("ml-1 font-normal text-muted-foreground")}>
            · {thread.last_comment_preview}
          </span>
        ) : null}
      </a>
    </span>
  );
}

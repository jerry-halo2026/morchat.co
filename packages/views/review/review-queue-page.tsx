"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspaceId } from "@morechat/core/hooks";
import { BOSS_PAGES } from "@morechat/core/paths";
import { reviewQueueOptions, useAcceptReview, useRejectReview } from "@morechat/core/review/queries";
import { isEditableShortcutTarget } from "@morechat/core/shortcuts";
import type { ReviewQueueRow } from "@morechat/core/types";
import { Button } from "@morechat/ui/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@morechat/ui/components/ui/select";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { CollectionPageState } from "../layout/collection-page";
import { PAGE_GUTTER, PageHeader } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { useReviewCopy } from "./copy";
import {
  DOMAIN_ORDER,
  cursorAfterRemoval,
  domainCopyKey,
  domainCounts,
  isKnownDomain,
  moveCursor,
  rowKey,
  toggleRow,
  verdictTargets,
} from "./model";
import { RejectReviewDialog } from "./reject-dialog";
import { ReviewQueueTable } from "./queue-table";

/** One read is capped server-side (`workbenchLimit`); the page says so. */
const QUEUE_LIMIT = 200;

/** The select's value for "every ledger"; never sent. */
const ALL_DOMAINS = "all";

/**
 * `/{slug}/boss/review` — 复核队列 (WORKBENCH-API §26).
 *
 * The page where a person answers for what an agent wrote. Four ledgers arrive
 * flattened into one queue, newest change first, and each row gets one of two
 * verdicts: accepted, or rejected with a reason. The reason is free text because
 * a reviewer is explaining a judgement; the *overwrite* reasons (four fixed
 * kinds) belong to the other direction — a human replacing an agent's value — and
 * are asked for by the ledger drawers, not here.
 *
 * Keyboard is the primary interface, because a queue is worked top to bottom:
 * `j`/`k` move the cursor, `x` ticks a row, and `a`/`r` decide for the ticked
 * rows (or the cursor's row when nothing is ticked). That makes "work the queue"
 * one hand on the keyboard, and the mouse a shortcut for the same three actions.
 *
 * Nothing is optimistic. A verdict changes what four ledgers mean to a person —
 * and feeds two of the three rates on the cockpit — so the row stays until the
 * server says it moved, and the list is re-read rather than patched.
 */
export function BossReviewPage() {
  const wsId = useWorkspaceId() ?? "";
  const { t } = useT("layout");
  const copy = useReviewCopy();
  const Icon = ROUTE_ICON_COMPONENTS[BOSS_PAGES.review.icon];

  const [domain, setDomain] = useState<string>(ALL_DOMAINS);
  const [cursor, setCursor] = useState(0);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = useState<ReviewQueueRow[] | null>(null);
  const [rejectFailure, setRejectFailure] = useState<string | null>(null);

  const accept = useAcceptReview();
  const reject = useRejectReview();

  const queue = useQuery(reviewQueueOptions(wsId, { domain: domain === ALL_DOMAINS ? undefined : domain, limit: QUEUE_LIMIT }));
  const rows = useMemo(() => queue.data?.rows ?? [], [queue.data]);
  const counts = useMemo(() => domainCounts(rows), [rows]);

  const domainOptions = useMemo(
    () => [
      { value: ALL_DOMAINS, label: copy("filter_all") },
      ...DOMAIN_ORDER.map((value) => ({
        value,
        label: domainCopyKey(value) ? copy(domainCopyKey(value)!) : value,
      })),
      // A server that names a ledger this build does not know is still workable:
      // the filter gains its raw value rather than hiding its rows.
      ...(domain !== ALL_DOMAINS && !isKnownDomain(domain)
        ? [{ value: domain, label: domain }]
        : []),
    ],
    [copy, domain],
  );

  const markPending = useCallback((keys: readonly string[], pending: boolean) => {
    setPendingKeys((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (pending) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }, []);

  const runAccept = useCallback(
    async (targets: readonly ReviewQueueRow[]) => {
      if (targets.length === 0) return;
      const keys = targets.map(rowKey);
      markPending(keys, true);
      try {
        // One request per row: the contract has no bulk endpoint, and a partial
        // failure must leave the rows that did work decided.
        await Promise.all(targets.map((row) => accept.mutateAsync({ domain: row.domain, id: row.id })));
        setSelection(new Set());
        setCursor((current) => cursorAfterRemoval(current, targets.length, rows.length - targets.length));
        toast.success(
          targets.length === 1 ? copy("accept_done") : copy("bulk_done", { n: targets.length }),
        );
      } catch {
        toast.error(copy("accept_failed"));
      } finally {
        markPending(keys, false);
      }
    },
    [accept, copy, markPending, rows.length],
  );

  const openReject = useCallback((targets: readonly ReviewQueueRow[]) => {
    if (targets.length === 0) return;
    setRejectFailure(null);
    setRejecting([...targets]);
  }, []);

  const confirmReject = useCallback(
    async (reason: string) => {
      const targets = rejecting;
      if (!targets || targets.length === 0) return;
      const keys = targets.map(rowKey);
      markPending(keys, true);
      setRejectFailure(null);
      try {
        await Promise.all(
          targets.map((row) => reject.mutateAsync({ domain: row.domain, id: row.id, reason })),
        );
        setRejecting(null);
        setSelection(new Set());
        setCursor((current) => cursorAfterRemoval(current, targets.length, rows.length - targets.length));
        toast.success(
          targets.length === 1 ? copy("reject_done") : copy("bulk_done", { n: targets.length }),
        );
      } catch {
        setRejectFailure(copy("reject_failed"));
      } finally {
        markPending(keys, false);
      }
    },
    [copy, markPending, reject, rejecting, rows.length],
  );

  const targets = useMemo(() => verdictTargets(rows, cursor, selection), [rows, cursor, selection]);

  /**
   * The queue's keyboard: j/k move, x ticks, a/r decide.
   *
   * The listener is document-wide so the page works without clicking into it
   * first, and it stands down whenever the reader is typing, a shortcut was
   * already handled, or the reject dialog is open — a queue that swallows `j`
   * inside a textarea would be a trap.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableShortcutTarget(event.target)) return;
      if (rejecting !== null) return;
      if (rows.length === 0) return;
      switch (event.key) {
        case "j":
          event.preventDefault();
          setCursor((current) => moveCursor(current, 1, rows.length));
          return;
        case "k":
          event.preventDefault();
          setCursor((current) => moveCursor(current, -1, rows.length));
          return;
        case "x": {
          const row = rows[cursor];
          if (!row) return;
          event.preventDefault();
          setSelection((current) => toggleRow(current, rowKey(row)));
          return;
        }
        case "a":
          event.preventDefault();
          void runAccept(targets);
          return;
        case "r":
          event.preventDefault();
          openReject(targets);
          return;
        default:
          return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cursor, openReject, rejecting, rows, runAccept, targets]);

  const header = (
    <PageHeader>
      <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
        <h1 className="flex min-w-0 items-center gap-2 px-2 text-body font-medium">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{t(($) => $.nav[BOSS_PAGES.review.navKey])}</span>
        </h1>
        <Select
          items={domainOptions}
          value={domain}
          onValueChange={(next) => {
            setDomain(String(next));
            setCursor(0);
            setSelection(new Set());
          }}
        >
          <SelectTrigger size="sm" aria-label={copy("filter_label")} className="min-w-0">
            <SelectValue>
              {() => domainOptions.find((option) => option.value === domain)?.label ?? ""}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            {domainOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={targets.length === 0 || accept.isPending}
          onClick={() => void runAccept(targets)}
        >
          {copy("accept")}
          {selection.size > 1 ? ` (${selection.size})` : ""}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={targets.length === 0 || reject.isPending}
          onClick={() => openReject(targets)}
        >
          {copy("reject")}
        </Button>
      </div>
    </PageHeader>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {queue.isPending ? (
        <div className={cn(PAGE_GUTTER, "min-h-0 flex-1 overflow-y-auto pt-4 pb-10")}>
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        </div>
      ) : queue.isError ? (
        <CollectionPageState
          icon={Icon}
          tone="destructive"
          title={copy("error_title")}
          description={queue.error instanceof Error ? queue.error.message : undefined}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => void queue.refetch()}>
              {copy("error_retry")}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <CollectionPageState
          icon={Icon}
          title={copy("empty_title")}
          description={
            domain === ALL_DOMAINS ? copy("empty_description") : copy("empty_filtered")
          }
        />
      ) : (
        <div className={cn(PAGE_GUTTER, "min-h-0 flex-1 overflow-y-auto pt-4 pb-10")}>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-baseline gap-3 text-caption text-muted-foreground">
              <span className="tabular-nums">{copy("count_loaded", { n: rows.length })}</span>
              {DOMAIN_ORDER.map((key) => {
                const count = counts.get(key) ?? 0;
                if (count === 0) return null;
                return (
                  <span key={key} className="tabular-nums">
                    {domainCopyKey(key) ? copy(domainCopyKey(key)!) : key} {count}
                  </span>
                );
              })}
              {rows.length >= QUEUE_LIMIT ? (
                <span className="text-warning">{copy("count_capped", { limit: QUEUE_LIMIT })}</span>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-lg border border-surface-border">
              <ReviewQueueTable
                rows={rows}
                cursor={cursor}
                selection={selection}
                pendingKeys={pendingKeys}
                onSelect={(row, checked) =>
                  setSelection((current) => {
                    const key = rowKey(row);
                    if (checked === current.has(key)) return current;
                    return toggleRow(current, key);
                  })
                }
                onFocusRow={setCursor}
                onAccept={(row) => void runAccept([row])}
                onReject={(row) => openReject([row])}
              />
            </div>
            <p className="text-caption text-muted-foreground">{copy("keyboard_hint")}</p>
          </div>
        </div>
      )}

      <RejectReviewDialog
        open={rejecting !== null}
        pending={reject.isPending}
        count={rejecting?.length ?? 0}
        failure={rejectFailure}
        onOpenChange={(next) => {
          if (!next) {
            setRejecting(null);
            setRejectFailure(null);
          }
        }}
        onConfirm={(reason) => void confirmReject(reason)}
      />
    </div>
  );
}



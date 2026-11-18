"use client";

import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@morechat/core/api";
import { creatorKeys } from "@morechat/core/creator/queries";
import type { Creator, CreatorListSort } from "@morechat/core/types";

/**
 * The creator ledger, read page by page in the order the server sorted it.
 *
 * **Why the page reads the whole ledger.** `GET /api/workbench/creators` has no
 * parameter for cooperation stage, lead status, follower band or region, and its
 * `q` covers only the name and the handle (see `model.ts`). A screen whose filters
 * only see the current page would answer "who matches among the 200 rows that
 * arrived", which is not the question a BD desk opens this page to ask. Until those
 * parameters exist, the whole ledger is read once and the filters run over it —
 * 几千 rows, 200 at a time, on the query the ledger already uses.
 *
 * Two limits are deliberate, both the dashboard's:
 *
 *   - **{@link CREATOR_PAGE_CAP} pages** (5000 creators). A ledger past that is not
 *     a page question any more, and the page says which count it could not see
 *     rather than presenting a filtered subset as the whole ledger.
 *   - **One failed page stops the walk.** A half-read ledger must not look whole,
 *     so a failed page surfaces as the page's error instead of a shorter list.
 *
 * Rows appear as pages arrive rather than after the last one: the walk is an
 * implementation detail of "the whole ledger", and a table that stays empty for
 * twenty round trips would look broken.
 */

/**
 * Rows of the follow-up log the table reads to answer 最近跟进 / 下次跟进.
 *
 * `GET /api/workbench/bd/activities` sorts by `happened_at DESC` and takes `limit`
 * only — there is no `due=1` and no per-creator batching — so "when did we last
 * talk, and when is the next call" is answered from the newest rows of the ledger.
 * 200 is the endpoint's ceiling: enough to cover a month of a busy BD desk, and the
 * same window the cockpit reads. A creator whose newest follow-up is older than this
 * window shows a dash, which is also what a creator nobody has called shows.
 */
export const FOLLOWUP_SCAN_LIMIT = 200;

/** The server's page ceiling for one request (`workbenchLimit`). */
export const CREATOR_PAGE_SIZE = 200;

/** Pages this page is willing to read: 5000 creators. */
export const CREATOR_PAGE_CAP = 25;

/** Creators the walk can cover; also the number the cap note prints. */
export const CREATOR_WALK_CEILING = CREATOR_PAGE_SIZE * CREATOR_PAGE_CAP;

/**
 * A key under the ledger's prefix — so `["creator", wsId]` invalidation (a
 * follow-up write, an upstream sync) reaches this cache entry — but distinct from
 * `creatorListOptions`, which holds one list response rather than pages. The sort
 * is part of the key: a different order is a different walk.
 */
export function creatorPagesKey(wsId: string, sort: CreatorListSort) {
  return [...creatorKeys.all(wsId), "sales_creator_pages", { sort }] as const;
}

export interface CreatorLedger {
  creators: readonly Creator[];
  /** The first page is in flight: the table has nothing to draw yet. */
  loading: boolean;
  /** More pages are being read; rows already on screen stay. */
  walking: boolean;
  /** Every page the ledger has was read. */
  complete: boolean;
  /** The walk stopped at the page cap with rows still unread. */
  capped: boolean;
  error: Error | null;
  /** Reads the ledger again from the first page (the page-level retry). */
  refetch: () => void;
}

export function useCreatorLedger(wsId: string, sort: CreatorListSort): CreatorLedger {
  const query = useInfiniteQuery({
    queryKey: creatorPagesKey(wsId, sort),
    queryFn: ({ pageParam }) =>
      api.listCreators({
        limit: CREATOR_PAGE_SIZE,
        sort,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: !!wsId,
  });

  const {
    data,
    isPending,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isError,
    error,
    fetchNextPage,
  } = query;
  const pageCount = data?.pages.length ?? 0;
  const capped = pageCount >= CREATOR_PAGE_CAP;
  const failed = isError || isFetchNextPageError;

  // One array identity per fetched-data identity: the page derives the facets and
  // the filter menu from this, and a fresh array every render would rebuild both
  // on every keystroke.
  const creators = useMemo(
    () => (data ? data.pages.flatMap((page) => page.creators) : []),
    [data],
  );

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || capped || failed) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, capped, failed, fetchNextPage]);

  return {
    creators,
    loading: isPending,
    walking: hasNextPage && !capped && !failed,
    complete: !failed && !hasNextPage,
    capped,
    error: failed ? ((error as Error | null) ?? new Error("creator ledger failed")) : null,
    refetch: () => {
      void query.refetch();
    },
  };
}

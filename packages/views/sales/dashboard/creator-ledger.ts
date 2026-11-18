"use client";

import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@morechat/core/api";
import { creatorKeys } from "@morechat/core/creator/queries";
import type { Creator } from "@morechat/core/types";

/**
 * The whole creator ledger, read page by page.
 *
 * 本月新增 and 本月签单 are counts over every live creator, and
 * `GET /api/workbench/creators` pages by cursor with a 200-row ceiling (§3.1),
 * so one page cannot answer them. This walks the cursor to the end and keeps the
 * rows; the query key sits under `["creator", wsId]` so any creator write
 * invalidates it with the rest of the ledger.
 *
 * Two limits are deliberate:
 *
 *   - **{@link CREATOR_PAGE_CAP} pages.** A ledger that big is not a cockpit
 *     question any more, and walking it on every visit would spend the reader's
 *     time on a number that is already history. Past the cap the month figures
 *     read `—` rather than a count of whatever happened to arrive.
 *   - **One failed page stops the walk.** The month figures are optional; a
 *     ledger half-read must not look whole, and retrying a failing page forever
 *     would keep the strip in its skeleton. A later refetch starts the walk
 *     again.
 */

/** The ledger's own page size — the server's ceiling for one request. */
export const CREATOR_PAGE_SIZE = 200;

/** Pages the dashboard is willing to read: 4000 live creators. */
export const CREATOR_PAGE_CAP = 20;

/**
 * A key under the ledger's prefix, so `["creator", wsId]` invalidation reaches
 * it, but distinct from `creatorListOptions`: this cache entry holds pages, not
 * one list response.
 */
export function creatorPageKey(wsId: string) {
  return [...creatorKeys.all(wsId), "dashboard_pages"] as const;
}

export interface CreatorLedger {
  creators: Creator[];
  /** Every live creator is in `creators`; the month counts can be computed. */
  complete: boolean;
  /** The ledger is still being read, so the month cells have no answer yet. */
  loading: boolean;
  /** Reads the ledger again, from the first page (the page-level retry). */
  refetch: () => void;
}

export function useCreatorLedger(wsId: string): CreatorLedger {
  const query = useInfiniteQuery({
    queryKey: creatorPageKey(wsId),
    queryFn: ({ pageParam }) =>
      api.listCreators({ limit: CREATOR_PAGE_SIZE, cursor: pageParam ?? undefined }),
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
    fetchNextPage,
  } = query;
  const pageCount = data?.pages.length ?? 0;
  const capped = pageCount >= CREATOR_PAGE_CAP;
  const failed = isError || isFetchNextPageError;

  // One array identity per fetched-data identity: the page derives the name
  // index and the month counts from this, and a fresh array every render would
  // rebuild both on every keystroke elsewhere on the page.
  const creators = useMemo(
    () => (data ? data.pages.flatMap((page) => page.creators) : []),
    [data],
  );

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || capped || isFetchNextPageError) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, capped, isFetchNextPageError, fetchNextPage]);

  return {
    creators,
    complete: !failed && !hasNextPage,
    loading: isPending || (hasNextPage && !capped && !isFetchNextPageError),
    refetch: () => {
      void query.refetch();
    },
  };
}

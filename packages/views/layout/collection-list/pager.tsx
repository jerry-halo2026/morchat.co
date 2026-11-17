"use client";

import type { ReactElement } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { useT } from "../../i18n";

/**
 * The end of a cursor-paginated list: one "load more" control and the count that
 * says how much of the list is already on screen.
 *
 * Cursor, not page numbers. The API pages by `?cursor=&limit=` and has no
 * `offset` (`docs/engineering/WORKBENCH-API.md` §3.1), so a page bar could only
 * be built by threading cursors into "page N" — it would hold the whole list in
 * the client and re-read it to jump. The originals have no page bar either: each
 * `workstation-*` workbench renders its filtered array straight into one
 * `<tbody>`. So a list that outgrows one response grows downward, here.
 *
 * A caller that knows the list's size (`/counts` is the only authoritative
 * source; a list response's own `total` is *this page's* row count) gets the
 * fuller sentence; a caller that does not says only how many rows are loaded.
 * Both are the honest statement, and neither invents a page number the server
 * cannot serve.
 */
export interface CollectionPagerProps {
  /** Whether the server has another page. */
  hasMore: boolean;
  /** Rising while the next page is in flight. */
  loading?: boolean;
  /** Rows the list is currently showing. */
  loadedCount: number;
  /** The list's size, when the caller already knows it. */
  total?: number;
  onLoadMore: () => void;
  /** Accessible name of the pager group: which list this belongs to. */
  label: string;
}

export function CollectionPager({
  hasMore,
  loading = false,
  loadedCount,
  total,
  onLoadMore,
  label,
}: CollectionPagerProps): ReactElement | null {
  const { t } = useT("layout");

  // Nothing loaded and nothing behind it: an empty list says so through its own
  // empty state, and a pager under it would be a control for a list that has no
  // rows to page.
  if (loadedCount === 0 && !hasMore) return null;

  return (
    <div role="group" aria-label={label} className="flex flex-col items-center gap-1 py-3">
      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          aria-busy={loading || undefined}
          onClick={onLoadMore}
        >
          {/* The visible label already says it, so the spinner is decorative. */}
          {loading ? <Spinner aria-hidden className="size-3.5" /> : null}
          {loading ? t(($) => $.collection.pager.loading) : t(($) => $.collection.pager.more)}
        </Button>
      ) : (
        <span className="text-caption text-muted-foreground">{t(($) => $.collection.pager.end)}</span>
      )}
      <span className="text-caption tabular-nums text-muted-foreground">
        {total === undefined
          ? t(($) => $.collection.pager.count_loaded, { loaded: loadedCount })
          : t(($) => $.collection.pager.count, { loaded: loadedCount, total })}
      </span>
    </div>
  );
}

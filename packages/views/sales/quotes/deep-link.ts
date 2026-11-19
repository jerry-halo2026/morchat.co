"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { useNavigation } from "../../navigation";

/**
 * The four behaviours the three ledgers share, in one place.
 *
 *   1. **`?quote=` / `?collab=` / `?followup=`** — the inbox's workbench notices
 *      and the cockpit's 我的队列 link at a single row, not at a list. Landing on
 *      the ledger and hunting for the row is the bug backlog #31 names, so a
 *      parameter scrolls that row into view and marks it for a moment.
 *   2. **A parameter that matches nothing** — the row is filtered out, on another
 *      page of the window, or gone. Silence would read as "the link is broken",
 *      so the page says so above the list (`deep_link.missing`).
 *   3. **`expected_revision`** — the §3 guard travels with any PATCH of a ledger
 *      row, counted from the revision this reader last saw.
 *   4. **`409 stale_write`** — its sentence (`stale_write.refreshed`), shared by
 *      the three drawers so they cannot drift into three wordings.
 *
 * It lives here, under `quotes/`, because the quote ledger is where the parameter
 * first landed; the collaboration and follow-up pages import from this module the
 * same way they already import `quotes/model` (money, days, ratios).
 */

/**
 * How long the focused row keeps its emphasis before it fades back into the list.
 *
 * Long enough to find the row after a scroll, short enough that the ledger is not
 * left looking permanently selected — the URL keeps the focus, the colour does
 * not.
 */
export const ROW_FLASH_MS = 1200;

/**
 * The emphasis on the focused row: the list's own surface-hover vocabulary at
 * brand strength, with a ring so the row reads as *this one* rather than as
 * "hovered", plus a transition so the removal is a fade and not a blink.
 */
export const ROW_FLASH_CLASS = "bg-brand/10 ring-1 ring-inset ring-ring/50 transition-colors";

export interface RowFocus {
  /**
   * The URL names a row this list is not showing. Only true once the ledger has
   * answered: while it is still loading, "not found" would be a guess.
   */
  missing: boolean;
  /** The row's own class while it holds the focus; `undefined` for every other. */
  classNameOf: (rowId: string) => string | undefined;
}

/**
 * Reads `?<param>=<id>` and drives the focus for a list of rows.
 *
 * `rowIds` is what the list **is showing** — after the page's own filtering and
 * inside the page of rows it read — so a row hidden by a filter is reported as
 * missing rather than scrolled to somewhere it is not drawn. `ready` is the
 * query's "answered at least once" flag; until then neither branch fires.
 *
 * The two effects are deliberately apart: the flash restarts whenever the row
 * becomes drawable, while the scroll happens once per id, so a re-render (a
 * refetch, a filter reset) does not yank the reader back up the page.
 */
export function useRowFocus(
  param: string,
  rowIds: readonly string[],
  ready: boolean,
): RowFocus {
  const navigation = useNavigation();
  const params: URLSearchParams | undefined = navigation.searchParams;
  const target = params ? params.get(param) : null;

  const found = target !== null && rowIds.includes(target);

  const [flash, setFlash] = useState<string | null>(null);
  const scrolled = useRef<string | null>(null);

  useEffect(() => {
    if (target === null || !found) return;
    setFlash(target);
    const timer = setTimeout(() => setFlash(null), ROW_FLASH_MS);
    return () => clearTimeout(timer);
  }, [target, found]);

  useEffect(() => {
    if (target === null) {
      scrolled.current = null;
      return;
    }
    if (!found || scrolled.current === target) return;
    scrolled.current = target;
    // The row is found by its own id rather than by a DOM id: the list owns its
    // element ids (`${listId}-row-${id}`) and this module is not the list.
    const row = Array.from(
      document.querySelectorAll<HTMLElement>("[data-row-id]"),
    ).find((element) => element.dataset.rowId === target);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [target, found]);

  const classNameOf = useCallback(
    (rowId: string) => (flash !== null && flash === rowId ? ROW_FLASH_CLASS : undefined),
    [flash],
  );

  return { missing: ready && target !== null && !found, classNameOf };
}

/**
 * The two sentences the three ledgers share, from the `sales` bundle.
 *
 * Selectors, not `defaultValue` tables: these keys ship in all eight bundles
 * (`deep_link.missing`, `stale_write.refreshed`), so a missing one is a compile
 * error rather than an English string on a translated screen.
 */
export function useLedgerCopy(): { rowMissing: string; staleWrite: string } {
  const { t } = useT("sales");
  return {
    rowMissing: t(($) => $.deep_link.missing),
    staleWrite: t(($) => $.stale_write.refreshed),
  };
}

/** `expected_revision` for a PATCH, or nothing when the row predates §3. */
export function expectedRevisionPatch(
  revision: number | undefined,
): { expected_revision: number } | Record<string, never> {
  return revision === undefined ? {} : { expected_revision: revision };
}

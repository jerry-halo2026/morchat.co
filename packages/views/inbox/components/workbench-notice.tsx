"use client";

import { ArrowUpRight } from "@morechat/ui/icons";
import { paths, useWorkspaceSlug } from "@morechat/core/paths";
import type { InboxItem } from "@morechat/core/types";
import { useT } from "../../i18n";
import { resolveClickIntent, useIntentNavigate } from "../../navigation";

/**
 * The workbench's due notices in the inbox (docs/engineering/COLLAB-MODEL.md §4).
 *
 * A workbench notice is issue-less on purpose: the thing it is about is a ledger
 * row (a follow-up, a quote, a collaboration), and the discussion, if the reader
 * wants one, is a thread on that row. So these rows have no issue to open — they
 * have a ledger to open, and that is the one thing this file adds to the inbox.
 *
 * The path is built through `paths`, never by string concatenation: the ledger
 * pages' route shape is `useWorkspacePaths`'s business, and a hardcoded
 * `/sales/quotes` would silently stop matching the day the shape moves.
 *
 * `?quote=` / `?followup=` / `?collab=` is the row's id, in the URL rather than in
 * client state: a notice is a link somebody may paste into a chat, and a row
 * identifier that only exists in the sender's tab is not a link.
 */

/** The ledger a notice is about, as `(subject_type, subject_id)`. */
export interface WorkbenchSubject {
  type: "creator_activity" | "creator_quote" | "crm_collab";
  id: string;
}

/** Workbench notices are `workbench.<subject>.<event>` (§4's `type` contract). */
export function isWorkbenchNotice(type: string): boolean {
  return type.startsWith("workbench.");
}

/**
 * The subject a notice names, or null when the row predates the contract (a
 * notice without `details.subject_type` is still a workbench row by its `type`,
 * but there is nowhere to link it to).
 */
export function workbenchSubject(item: InboxItem): WorkbenchSubject | null {
  const details = item.details ?? {};
  const type = details.subject_type ?? "";
  const id = details.subject_id ?? "";
  if (!id) return null;
  if (type === "creator_activity" || type === "creator_quote" || type === "crm_collab") {
    return { type, id };
  }
  return null;
}

/** The ledger row's own page, with the row named in the query string. */
export function workbenchHref(slug: string, subject: WorkbenchSubject): string | null {
  const p = paths.workspace(slug);
  const id = encodeURIComponent(subject.id);
  switch (subject.type) {
    case "creator_activity":
      return `${p.sales.followups()}?followup=${id}`;
    case "creator_quote":
      return `${p.sales.quotes()}?quote=${id}`;
    case "crm_collab":
      return `${p.sales.collabs()}?collab=${id}`;
    default:
      return null;
  }
}

/**
 * "Open the ledger row" — a real link, so modifier-click opens a new tab, and the
 * plain click goes through the intent adapter like every other row affordance.
 */
export function WorkbenchNoticeLink({ item }: { item: InboxItem }) {
  const { t } = useT("inbox");
  const slug = useWorkspaceSlug();
  const navigate = useIntentNavigate();
  const subject = workbenchSubject(item);
  const href = slug && subject ? workbenchHref(slug, subject) : null;
  if (!href) return null;

  return (
    <button
      type="button"
      data-mc="workbench-open-ledger"
      onClick={(event) => {
        event.stopPropagation();
        if (event.defaultPrevented) return;
        navigate(href, resolveClickIntent(event));
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-caption font-medium text-brand transition-colors hover:bg-brand/10 focus-visible:ring-1 focus-visible:ring-ring"
    >
      {t(($) => $.workbench.open_ledger)}
      <ArrowUpRight aria-hidden="true" className="size-3.5" />
    </button>
  );
}

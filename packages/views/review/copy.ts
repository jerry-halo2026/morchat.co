"use client";

import { useCallback } from "react";
import "./i18n";
import { useT } from "../i18n";

/**
 * The review queue's copy, and the one place its bundle keys are written down.
 *
 * Every string lives in the `review` bundle. The table below is the English
 * edition and is passed as `defaultValue`, so a bundle that has not caught up
 * shows the English words instead of the raw path — and the page can pick copy by
 * a derived key (a domain, a changed field) without a cast per call site, which
 * is the same trade the studio's copy module makes.
 */
const COPY = {
  /** Header + filters. The page's own name is `layout.nav.boss_review`, the key
   *  the left column's row reads, so the two cannot disagree. */
  filter_all: "All",
  filter_label: "Ledger",
  count_loaded: "{{n}} waiting",
  count_capped: "Showing the newest {{limit}}",

  /** The table's columns. */
  column_row: "Row",
  column_author: "Written by",
  column_changed: "What changed",
  column_amount: "Amount",
  column_updated: "Updated",
  column_actions: "Verdict",

  /** One row. */
  row_agent: "Agent",
  row_member: "Member",
  row_no_fields: "No field detail",
  row_no_amount: "—",
  row_selected: "Selected",
  row_select: "Select this row",

  /** Verdicts. */
  accept: "Accept",
  reject: "Reject",
  accept_done: "Accepted",
  reject_done: "Rejected",
  accept_failed: "The row could not be accepted. Nothing changed.",
  reject_failed: "The row could not be rejected. Nothing changed.",
  bulk_done: "{{n}} rows decided",

  /** Reject dialog. */
  reject_title: "Why is this refused?",
  reject_description: "The reason is stored with the verdict and read by whoever wrote the row.",
  reject_reason_label: "Reason",
  reject_reason_required: "Say why — a rejection without a reason is not reviewable.",
  reject_reason_too_long: "Keep it under {{max}} characters.",
  reject_confirm: "Reject",
  cancel: "Cancel",

  /** Keyboard help, shown under the table. */
  keyboard_hint: "j / k move · x selects · a accepts · r rejects",

  /** States. */
  loading: "Loading the queue",
  error_title: "Couldn't load the review queue",
  error_retry: "Retry",
  empty_title: "Nothing is waiting for review",
  empty_description:
    "Rows written by an agent, or a person's edit of an amount, land here before they are taken as fact.",
  empty_filtered: "No pending rows in this ledger.",

  /** Domain names, keyed by the contract's `domain` values. */
  domain_collabs: "Collaborations",
  domain_quotes: "Quotes",
  domain_activities: "Follow-ups",
  domain_settlements: "Settlements",

  /** Overwrite attribution (§26.3). */
  overwrite_title: "Why are you changing this?",
  overwrite_description:
    "An agent wrote this row. The reason is what makes the overwrite rate mean something.",
  overwrite_wrong_fact: "Wrong fact",
  overwrite_wrong_judgement: "Wrong judgement",
  overwrite_stale: "It went stale",
  overwrite_taste: "A matter of taste",
  overwrite_confirm: "Change it",
  overwrite_failed: "The change was refused again. Nothing was saved.",

  /** The three review rates on the cockpit (§26.4). */
  quality_title: "Review quality",
  quality_insufficient: "Not enough data",
  quality_absent: "—",
  quality_open: "Open the queue",
} as const;

export type ReviewCopyKey = keyof typeof COPY;

export type ReviewTranslate = (
  key: ReviewCopyKey,
  vars?: Record<string, string | number>,
) => string;

export function useReviewCopy(): ReviewTranslate {
  const { t } = useT("review");
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return useCallback<ReviewTranslate>(
    (key, vars) => translate(`review.${key}`, { defaultValue: COPY[key], ...vars }),
    [translate],
  );
}

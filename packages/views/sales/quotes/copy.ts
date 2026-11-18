"use client";

import { useCallback } from "react";
import type { BdQuoteStatus } from "@morechat/core/types";
import { useT } from "../../i18n";
import type { QuotesSort } from "./model";

/**
 * The quote ledger's copy, and the one place its bundle keys are written down.
 *
 * Every string on the page lives in the `blocks` bundle under `sales_quotes.*`.
 * The table below is the English edition of those keys and is passed as
 * `defaultValue`, so a bundle that has not caught up shows the English words
 * rather than the raw path — the same arrangement `content_studio` and the
 * HR pages use while their keys await the merge into the eight bundles.
 *
 * The page's own name is not here: the header reads `layout.nav.sales_quotes`,
 * the key the left column's row already uses, so the two cannot disagree.
 */
const COPY = {
  /** Header and toolbar. */
  new_quote: "New quote",
  filter_status: "Status",
  status_all: "All statuses",
  search_label: "Search creators",
  sort_label: "Sort",
  sort_created: "Newest",
  sort_valid_until: "Expiring first",
  window_caption: "Showing the newest {{loaded}} quotes. Narrow by status to reach older ones.",

  /** Columns. */
  list_label: "Quotes",
  column_creator: "Creator",
  column_fee: "Slot fee",
  column_commission: "Commission",
  column_valid_until: "Valid until",
  column_status: "Status",
  column_items: "Breakdown",
  creator_unknown: "Unknown creator",

  /** The five statuses, as badges. */
  status_draft: "Draft",
  status_sent: "Sent",
  status_accepted: "Accepted",
  status_rejected: "Rejected",
  status_expired: "Expired",

  /** The 有效期至 column, which says two different things about a passed day. */
  validity_expired: "Expired",
  validity_overdue: "Past due",

  /** 明细. */
  // One key, not i18next plural suffixes: `_one` is a dead category in zh/ja/ko
  // and the parity guard rejects it.
  items_count: "{{n}} lines",


  /** States. */
  empty_title: "No quotes yet",
  empty_description:
    "A quote is the price you offer one creator: a slot fee, a commission rate, and a day the offer stops standing.",
  no_matches_title: "No quotes match",
  no_matches_description: "Nothing in this status matches that name.",
  error_title: "Couldn't load quotes",
  error_description: "The quote ledger didn't answer. Check the connection, then try again.",
  error_retry: "Retry",

  /** Row actions. */
  row_actions: "Quote actions",
  action_accept: "Mark accepted",
  action_reject: "Mark rejected",
  action_delete: "Delete",
  delete_title: "Delete this quote?",
  delete_description: "The row leaves every list. The creator's history keeps its record.",
  delete_confirm: "Delete",

  /** Toasts. */
  toast_accepted: "Quote marked accepted",
  toast_rejected: "Quote marked rejected",
  toast_deleted: "Quote deleted",
  toast_saved_draft: "Draft saved",
  toast_sent: "Quote sent",

  /** The sheet. */
  form_create_title: "New quote",
  form_edit_title: "Edit quote",
  form_edit_description: "The creator stays fixed: a quote that changes person is a different record.",
  form_creator: "Creator",
  form_creator_pick: "Select a creator",
  form_creator_search: "Search creators",
  form_creator_empty: "No creator matches.",
  form_creator_required: "Pick the creator this offer is for.",
  form_creator_fixed: "The creator can't be changed after the quote exists.",
  form_fee: "Slot fee",
  form_currency: "Currency",
  form_commission: "Commission",
  form_commission_hint: "20% is stored as 0.2",
  form_valid_until: "Valid until",
  form_valid_until_hint: "Two weeks from today unless you change it.",
  form_valid_until_error: "The valid-until day is before the quote day. The server refuses this too.",
  form_items: "Breakdown",
  form_items_hint: "One line per deliverable. The subtotal is Σ price × quantity.",
  form_item_name: "Line {{index}} name",
  form_item_spec: "Line {{index}} spec",
  form_item_unit: "Line {{index}} unit",
  form_item_price: "Line {{index}} price",
  form_item_qty: "Line {{index}} qty",
  form_item_remove: "Remove line {{index}}",
  form_item_add: "Add line",
  form_subtotal: "Subtotal",
  form_note: "Note",
  form_save_draft: "Save as draft",
  form_save_sent: "Save and send",
  form_cancel: "Cancel",
  form_failed: "The quote wasn't saved. Try again.",
} as const;

export type QuotesCopyKey = keyof typeof COPY;

export type QuotesTranslate = (
  key: QuotesCopyKey,
  vars?: Record<string, string | number>,
) => string;

export function useQuotesCopy(): QuotesTranslate {
  const { t } = useT("blocks");
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return useCallback<QuotesTranslate>(
    (key, vars) => translate(`sales_quotes.${key}`, { defaultValue: COPY[key], ...vars }),
    [translate],
  );
}

/** Every status the contract allows, each with a word — a new one fails here. */
export const STATUS_KEYS: Readonly<Record<BdQuoteStatus, QuotesCopyKey>> = {
  draft: "status_draft",
  sent: "status_sent",
  accepted: "status_accepted",
  rejected: "status_rejected",
  expired: "status_expired",
};

/** The toolbar's two orders. */
export const SORT_KEYS: Readonly<Record<QuotesSort, QuotesCopyKey>> = {
  created: "sort_created",
  valid_until: "sort_valid_until",
};

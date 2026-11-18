"use client";

import { useMemo } from "react";
import type { CreatorListSort } from "@morechat/core/types";
import { useLocale, useT } from "../../i18n";
import {
  type CreatorIntent,
  type CreatorLeadStatus,
  type FansBand,
} from "./model";

/**
 * The page's copy.
 *
 * Two kinds of string live on this screen, and they are resolved differently on
 * purpose:
 *
 *   - **Strings the `blocks` bundle already carries** (达人, 粉丝, 互动率, 爆款率,
 *     近30天更新, 来源, 逾期 N 天, the follow-up kinds and outcomes) are read with
 *     the typed selector at the call site or in the tables below. They are shared
 *     with the ledger and the cockpit, and one wording has to serve all three.
 *   - **Strings this page introduces** (合作意向, 报价, 最近跟进, the nine intent
 *     labels, …) are listed here as `key → English` pairs and resolved through
 *     `t` with the English as `defaultValue`. The keys ship with this batch's
 *     locale merge as a single JSON handover for all eight bundles, so this file
 *     must not write them itself — and until that merge lands the bundle's type
 *     surface does not know them. Resolving by key keeps the page correct before
 *     the merge (English default) and translated after it, and a key that is
 *     dropped in review renders its English text instead of a raw key.
 *
 * Nothing else in the page reads a literal: a string the reader sees comes from
 * one of these two.
 */
const COPY = {
  /** The disabled 导入 button's tooltip. */
  import_unavailable: [
    "sales_creators.import_unavailable",
    "Creators are mirrored from the upstream creator database; there is nothing to paste here.",
  ],
  search_label: [
    "sales_creators.search_label",
    "Search name, Douyin ID, sec_uid or source keyword",
  ],

  filter_label: ["sales_creators.filter_label", "Filter creators"],
  filter_intent: ["sales_creators.filter_intent", "Cooperation"],
  filter_lead_status: ["sales_creators.filter_lead_status", "Lead status"],
  filter_band: ["sales_creators.filter_band", "Followers"],
  filter_region: ["sales_creators.filter_region", "Region"],
  filter_any: ["sales_creators.filter_any", "Any"],
  filter_clear: ["sales_creators.filter_clear", "Clear filters"],
  filter_no_regions: ["sales_creators.filter_no_regions", "No region recorded yet"],

  sort_label: ["sales_creators.sort_label", "Sort"],

  column_intent: ["sales_creators.column_intent", "Cooperation"],
  column_quote: ["sales_creators.column_quote", "Quote"],
  column_last_follow: ["sales_creators.column_last_follow", "Last contact"],
  column_next_follow: ["sales_creators.column_next_follow", "Next contact"],

  row_actions: ["sales_creators.row_actions", "Creator actions"],
  row_record: ["sales_creators.row_record", "Log a follow-up"],
  row_set_intent: ["sales_creators.row_set_intent", "Set cooperation stage"],
  row_set_intent_readonly: [
    "sales_creators.row_set_intent_readonly",
    "Owned upstream — the 达人 sync sets this stage",
  ],
  row_copy_url: ["sales_creators.row_copy_url", "Copy profile link"],
  row_copy_url_done: ["sales_creators.row_copy_url_done", "Profile link copied"],
  row_copy_url_failed: [
    "sales_creators.row_copy_url_failed",
    "Couldn’t copy — check the clipboard permission",
  ],
  row_copy_url_missing: [
    "sales_creators.row_copy_url_missing",
    "This creator has no profile link",
  ],

  total_count: ["sales_creators.total_count", "{{loaded}} creators"],
  loaded_count: ["sales_creators.loaded_count", "{{matched}} of {{loaded}} creators match"],
  reading_count: ["sales_creators.reading_count", "Reading the ledger — {{loaded}} so far"],
  capped_note: [
    "sales_creators.capped_note",
    "Only the first {{first}} creators were read; filters and counts skip the rest.",
  ],

  empty_title: ["sales_creators.empty_title", "No creators yet"],
  empty_description: [
    "sales_creators.empty_description",
    "Creators arrive from the upstream creator database; they show up here once a sync has run.",
  ],
  no_matches_title: ["sales_creators.no_matches_title", "No creators match"],
  no_matches_description: [
    "sales_creators.no_matches_description",
    "Nothing matches what the toolbar is asking for. Clear it to see the whole ledger.",
  ],
  error_title: ["sales_creators.error_title", "Couldn’t load the creators"],
  error_description: [
    "sales_creators.error_description",
    "The ledger or the follow-up log didn’t answer. Check the connection, then try again.",
  ],
  error_retry: ["sales_creators.error_retry", "Retry"],

  sheet_douyin_id: ["sales_creators.sheet_douyin_id", "Douyin ID"],
  sheet_sec_uid: ["sales_creators.sheet_sec_uid", "sec_uid"],
  sheet_region: ["sales_creators.sheet_region", "Region"],
  sheet_tags: ["sales_creators.sheet_tags", "Tags"],
  sheet_no_tags: ["sales_creators.sheet_no_tags", "No tags"],
  sheet_followups: ["sales_creators.sheet_followups", "Recent follow-ups"],
  sheet_no_followups: ["sales_creators.sheet_no_followups", "No follow-up logged yet"],
  sheet_followups_failed: [
    "sales_creators.sheet_followups_failed",
    "The follow-up log didn’t load.",
  ],

  in_days: ["sales_creators.in_days", "in {{days}}d"],

  intent_not_contacted: ["sales_creators.intent.not_contacted", "Not contacted"],
  intent_pending_send: ["sales_creators.intent.pending_send", "To send"],
  intent_sent: ["sales_creators.intent.sent", "Sent"],
  intent_replied: ["sales_creators.intent.replied", "Replied"],
  intent_quoted: ["sales_creators.intent.quoted", "Quoted"],
  intent_sampling: ["sales_creators.intent.sampling", "Sampling"],
  intent_signed: ["sales_creators.intent.signed", "Signed"],
  intent_deal: ["sales_creators.intent.deal", "Closed"],
  intent_excluded: ["sales_creators.intent.excluded", "Excluded"],

  lead_new: ["sales_creators.lead_status.new", "New"],
  lead_contacted: ["sales_creators.lead_status.contacted", "Contacted"],
  lead_deal: ["sales_creators.lead_status.deal", "Closed"],
  lead_reject: ["sales_creators.lead_status.reject", "Rejected"],

  band_under_10k: ["sales_creators.band.under_10k", "Under 10k"],
  band_from_10k: ["sales_creators.band.from_10k", "10k – 100k"],
  band_from_100k: ["sales_creators.band.from_100k", "100k – 500k"],
  band_from_500k: ["sales_creators.band.from_500k", "500k and up"],
} as const satisfies Record<string, readonly [string, string]>;

export type CreatorCopyId = keyof typeof COPY;

/** Value of the `{{name}}`-style placeholders a copy entry can carry. */
export type CopyParams = Record<string, string | number>;

/**
 * The English default of every entry, for tests and for anything that needs the
 * string without a renderer.
 */
export type CreatorsCopy = (id: CreatorCopyId, params?: CopyParams) => string;

/**
 * `t` with a key the bundle's types do not know yet. The cast is the whole point
 * of this file: the keys are handed over as one JSON for the batch merge, and a
 * page that could only compile after that merge would not be reviewable on its
 * own.
 */
type StringKeyTranslate = (key: string, options: CopyParams & { defaultValue: string }) => string;

/** The page's copy, resolved against the `blocks` bundle once per render. */
export function useCreatorsCopy(): CreatorsCopy {
  const { t } = useT("blocks");
  return useMemo(() => {
    const translate = t as unknown as StringKeyTranslate;
    return (id, params) => {
      const [key, fallback] = COPY[id];
      return translate(key, { ...params, defaultValue: fallback });
    };
  }, [t]);
}

/**
 * The nine cooperation stages, labelled. A `Record` rather than a lookup function
 * so a stage added to `CREATOR_INTENTS` fails this file's `satisfies` instead of
 * rendering an empty badge.
 */
export function useIntentLabels(): Record<CreatorIntent, string> {
  const copy = useCreatorsCopy();
  return useMemo(
    () => ({
      not_contacted: copy("intent_not_contacted"),
      pending_send: copy("intent_pending_send"),
      sent: copy("intent_sent"),
      replied: copy("intent_replied"),
      quoted: copy("intent_quoted"),
      sampling: copy("intent_sampling"),
      signed: copy("intent_signed"),
      deal: copy("intent_deal"),
      excluded: copy("intent_excluded"),
    } satisfies Record<CreatorIntent, string>),
    [copy],
  );
}

/** The four funnel states the mirror copies from orange. */
export function useLeadStatusLabels(): Record<CreatorLeadStatus, string> {
  const copy = useCreatorsCopy();
  return useMemo(
    () => ({
      LEAD_NEW: copy("lead_new"),
      LEAD_CONTACTED: copy("lead_contacted"),
      LEAD_DEAL: copy("lead_deal"),
      LEAD_REJECT: copy("lead_reject"),
    } satisfies Record<CreatorLeadStatus, string>),
    [copy],
  );
}

/** The four follower bands, in 万 units. */
export function useBandLabels(): Record<FansBand, string> {
  const copy = useCreatorsCopy();
  return useMemo(
    () => ({
      under_10k: copy("band_under_10k"),
      from_10k: copy("band_from_10k"),
      from_100k: copy("band_from_100k"),
      from_500k: copy("band_from_500k"),
    } satisfies Record<FansBand, string>),
    [copy],
  );
}

/**
 * The four server orderings, labelled with the column they rank. `sort=recent` has
 * no column of its own (the table's last-updated column would be 最近跟进, a
 * different fact), so its label is the content-health one: "近30天更新".
 */
export function useSortLabels(): Record<CreatorListSort, string> {
  const { t } = useT("blocks");
  return useMemo(
    () => ({
      fans: t(($) => $.ledger.column.fans),
      engagement: t(($) => $.creator_health.engagement_rate),
      hit: t(($) => $.creator_health.hit_rate),
      recent: t(($) => $.creator_health.posts_last_30d),
    }),
    [t],
  );
}

/**
 * A content-health rate as the percentage the ledger prints: one decimal, no
 * thousands separator, `—` for a rate nobody could compute.
 *
 * Ungrouped on purpose — the live data holds 45.03 (= 4503 %), and "4,503.0 %"
 * reads as two numbers in a table cell. Nothing here clamps: the contract keeps a
 * broken rate visible (WORKBENCH-DATA-CONTRACT §2.3) and the cell says why.
 * `formatHealthRate` is the ledger's own rule (`views/blocks/ledger-table.tsx`);
 * this is the same function for the same column, so the two screens cannot drift.
 */
export function useHealthRateText(): (rate: number | null | undefined) => string {
  const { t } = useT("blocks");
  const locales = useLocale();
  return useMemo(() => {
    const percent = t(($) => $.unit.percent);
    const dash = t(($) => $.empty.value);
    const formatter = new Intl.NumberFormat(locales, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      useGrouping: false,
    });
    return (rate) => {
      if (rate === null || rate === undefined) return dash;
      return `${formatter.format(rate * 100)}${percent}`;
    };
  }, [t, locales]);
}

/** Below 100 % the rate is unremarkable; above it, the cell carries the reason. */
export const ANOMALY_THRESHOLD = 1;

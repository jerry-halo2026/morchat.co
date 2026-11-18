"use client";

import { useCallback } from "react";
import { useT } from "../../i18n";

/**
 * The studio's copy, and the one place its bundle keys are written down.
 *
 * Every string on the page lives in the `blocks` bundle under
 * `content_studio.*`. The table below is the English edition of those keys and
 * is passed as `defaultValue`, so a bundle that has not caught up shows the
 * English words rather than the raw path. The selector form
 * (`t(($) => $.content_studio.x)`) is not used here because the page also picks
 * copy by a derived key — the four count cells and the three week cells are
 * read from its own arrays — and one cast in this file beats a cast per call
 * site.
 */
const COPY = {
  /** Header row. The page's own name is the layout bundle's `nav.content_studio`
   * — the same key the left column's row reads, so the two cannot disagree. */
  new_ip: "New IP",

  /** The bar above the cards: this week's three questions. */
  week_label: "This week",
  week_publishing: "Publishing this week",
  week_shooting: "To shoot this week",
  week_backlog: "Ideas waiting",

  /** One IP card. */
  card_persona: "Persona",
  card_track: "Track",
  card_audience: "Audience",
  card_accounts: "Accounts",
  card_week_goal: "Weekly goal",
  card_week_goal_value: "{{count}} posts",
  card_no_goal: "No weekly goal",

  /** The card's four stage counts, in pipeline order. */
  count_topics: "Ideas",
  count_scripts: "Writing",
  count_shoots: "To shoot",
  count_publishing: "To publish",

  /** The left column's switcher. */
  scope_label: "IP",
  scope_all: "All IPs",

  /** States. */
  error_title: "Couldn't load the studio",
  error_description: "The IPs, topics, scripts or shoots did not load. Try again.",
  retry: "Retry",
  scope_empty_title: "No IP is in scope",
  scope_empty_description:
    "The IP this switcher remembers is gone. Show every IP to pick another.",
  scope_clear: "Show all IPs",
  empty_title: "No IP yet",
  empty_description:
    "An IP is one persona, its track and its audience. Every topic, script and shoot hangs off one.",

  /** The create dialog. */
  form_title: "New IP",
  form_description: "The persona first; its platform accounts can be attached afterwards.",
  form_name: "Name",
  form_persona: "Persona",
  form_track: "Track",
  form_audience: "Audience",
  form_week_goal: "Posts per week",
  form_save: "Create",
  form_cancel: "Cancel",
  form_name_required: "Give this IP a name.",
  form_failed: "The server refused this IP. Nothing was saved — try again.",
} as const;

export type StudioCopyKey = keyof typeof COPY;

export type StudioTranslate = (
  key: StudioCopyKey,
  vars?: Record<string, string | number>,
) => string;

export function useStudioCopy(): StudioTranslate {
  const { t } = useT("blocks");
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return useCallback<StudioTranslate>(
    (key, vars) => translate(`content_studio.${key}`, { defaultValue: COPY[key], ...vars }),
    [translate],
  );
}

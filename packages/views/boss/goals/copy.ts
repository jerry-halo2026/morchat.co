/**
 * The one place the goal page names its colours and formats its numbers.
 *
 * Tone → class lives here rather than in each component for the same reason the
 * thresholds live in `model.ts`: a bar, a badge and a figure that disagree about
 * what "at risk" looks like is the bug this file prevents. Numbers go through
 * `Intl` once, with the reader's locale, so the list and the detail cannot drift
 * into two different digit groupings.
 */

import type { GoalKeyResultStatus, GoalStatus } from "@morechat/core/types";
import type { TFunction } from "i18next";
import type { Tone } from "./model";

/** The bundle this page reads, so every helper takes the same `t`. */
export type BossT = TFunction<"boss">;

/** The filled part of a progress bar. */
export const TONE_FILL_CLASS: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-primary",
};

/** The same four states as text, for the numbers beside a bar. */
export const TONE_TEXT_CLASS: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  neutral: "text-muted-foreground",
};

/**
 * 目标的五个状态 as badges. Draft and cancelled share the quiet fill because both
 * are "not being worked on"; the word beside them is what differs.
 */
export const GOAL_STATUS_TONE: Record<GoalStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-brand/10 text-brand",
  paused: "bg-warning/15 text-warning",
  done: "bg-success/10 text-success",
  cancelled: "bg-muted text-muted-foreground",
};

/** The four key-result statuses as text colours. */
export const KEY_RESULT_STATUS_TONE: Record<GoalKeyResultStatus, string> = {
  on_track: "text-muted-foreground",
  at_risk: "text-warning",
  off_track: "text-destructive",
  done: "text-success",
};

/** A count, a percent or an amount: grouped for the reader's locale. */
export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/**
 * A status word, resolved through the bundle.
 *
 * A `switch` rather than a key map: the selector form is typed, so a map lookup
 * would need a cast, and a cast is exactly how an untranslated word gets shipped.
 */
export function goalStatusLabel(t: BossT, status: GoalStatus): string {
  switch (status) {
    case "draft":
      return t(($) => $.goals.status_draft);
    case "active":
      return t(($) => $.goals.status_active);
    case "paused":
      return t(($) => $.goals.status_paused);
    case "done":
      return t(($) => $.goals.status_done);
    case "cancelled":
      return t(($) => $.goals.status_cancelled);
  }
}

export function keyResultStatusLabel(t: BossT, status: GoalKeyResultStatus): string {
  switch (status) {
    case "on_track":
      return t(($) => $.goals.kr_status_on_track);
    case "at_risk":
      return t(($) => $.goals.kr_status_at_risk);
    case "off_track":
      return t(($) => $.goals.kr_status_off_track);
    case "done":
      return t(($) => $.goals.kr_status_done);
  }
}

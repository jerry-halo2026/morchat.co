/**
 * The one place this page names its colours and formats its numbers.
 *
 * Tone → class lives here rather than in each block for the same reason the
 * thresholds live in `model.ts`: a bar, a badge and a figure that disagree about
 * what "at risk" looks like is the bug this file prevents. Numbers go through
 * `Intl` once, with the reader's locale, so the four blocks cannot drift into
 * three different digit groupings — and money uses the workbench's existing
 * currency glyph (`blocks.unit.currency`) instead of a second `¥`.
 */

import type { MarketSignalCut } from "@morechat/core/types";
import type { Tone } from "./model";

/** The filled part of a progress bar, and the dot that opens a figure. */
export const TONE_FILL_CLASS: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  neutral: "bg-primary",
};

/** The same three states as text, for the numbers beside a bar. */
export const TONE_TEXT_CLASS: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  neutral: "text-muted-foreground",
};

/**
 * 分级 badges: hot reads as an alert, warm as something to watch, cold as a row
 * that happens to be there. Outline borders keep the three the same shape, so
 * the colour is what changes and the row does not jump.
 */
export const CUT_BADGE_CLASS: Record<MarketSignalCut, string> = {
  hot: "border-destructive/40 bg-destructive/10 text-destructive",
  warm: "border-warning/40 bg-warning/10 text-warning",
  cold: "border-border bg-muted text-muted-foreground",
};

/**
 * A count or a score: whole numbers, grouped for the reader's locale.
 *
 * Whole numbers because every figure here is a count of rows, a percent, or a
 * money total the ledgers already treat as integral (C9's one format).
 */
export function formatNumber(value: number, locales: string): string {
  return new Intl.NumberFormat(locales, { maximumFractionDigits: 0 }).format(value);
}

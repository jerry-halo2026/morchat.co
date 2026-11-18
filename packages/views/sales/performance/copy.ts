"use client";

import { useT } from "../../i18n";
import { PRESET_RANGE_KEYS, type PresetRangeKey, type RangeKey } from "./model";

/**
 * The performance page's copy surface: the range enum turned into words, in the
 * one place that knows which bundle key each token reads.
 *
 * Every string on the page lives in the `performance` bundle, so the selector
 * form is typed against `locales/en/performance.json` and a missing key is a
 * compile error rather than a raw path on screen. The page's own name is not
 * here: the header reads `layout.nav.sales_performance`, the key the left
 * column's row already uses.
 */
export function usePerformanceCopy() {
  const { t } = useT("performance");

  const rangeLabel = (key: RangeKey): string =>
    key === "month"
      ? t(($) => $.range_month)
      : key === "last_month"
        ? t(($) => $.range_last_month)
        : key === "quarter"
          ? t(($) => $.range_quarter)
          : t(($) => $.range_custom);

  return { t, rangeLabel };
}

/** The three presets, in the order the toolbar draws them. */
export const PRESET_OPTIONS: readonly PresetRangeKey[] = PRESET_RANGE_KEYS;

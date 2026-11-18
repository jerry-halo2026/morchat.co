"use client";

import { useMemo } from "react";
import { useT } from "../../i18n";
import type { MetricField, VideoCounterField } from "./model";

/**
 * The data page's copy, resolved where the keys are derived rather than written.
 *
 * Two tables print the same six measures under different wire names — a snapshot
 * row says `likes`, a mirrored work says `digg_count` — so the label of a measure
 * has to be looked up by field, not by call site. Everything else on the page
 * reads its key inline through `t($ => $.data.x)`.
 */

/** A snapshot measure's column header. */
export function useMetricLabels(): Record<MetricField, string> {
  const { t } = useT("publishing");
  return useMemo(
    () => ({
      play: t(($) => $.data.field_play),
      likes: t(($) => $.data.field_likes),
      comments: t(($) => $.data.field_comments),
      shares: t(($) => $.data.field_shares),
      clicks: t(($) => $.data.field_clicks),
      converts: t(($) => $.data.field_converts),
    }),
    [t],
  );
}

/**
 * A mirrored work's counters, under the reader's words. `digg_count` is a like
 * and `comment_count` a comment: the same measure the snapshot table shows, so
 * both surfaces print the same headers.
 */
export function useVideoLabels(): Record<VideoCounterField, string> {
  const { t } = useT("publishing");
  return useMemo(
    () => ({
      play_count: t(($) => $.data.field_play),
      digg_count: t(($) => $.data.field_likes),
      comment_count: t(($) => $.data.field_comments),
      share_count: t(($) => $.data.field_shares),
    }),
    [t],
  );
}

/**
 * The words that keep NULL and 0 apart on screen: a missing reading is named,
 * and a real zero carries the reason it is being highlighted.
 */
export function useFigureCopy(): { notCollected: string; zeroHint: string } {
  const { t } = useT("publishing");
  return useMemo(
    () => ({
      notCollected: t(($) => $.data.not_collected),
      zeroHint: t(($) => $.data.zero_hint),
    }),
    [t],
  );
}

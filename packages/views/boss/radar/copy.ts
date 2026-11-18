/**
 * The radar's colours and its enum words.
 *
 * Every label is a `switch`, not a key map: the selector form `t(($) => $.radar.x)`
 * is typed against the bundle, and a map lookup would need a cast — the exact door
 * an untranslated word ships through.
 */

import type {
  MarketSignalCategory,
  MarketSignalCut,
  MarketSignalSource,
  MarketSignalStatus,
  MarketSignalUrgency,
} from "@morechat/core/types";
import type { TFunction } from "i18next";

export type BossT = TFunction<"boss">;

/** 分级 badges: hot reads as an alert, warm as something to watch, cold as a row. */
export const CUT_BADGE_CLASS: Record<MarketSignalCut, string> = {
  hot: "border-destructive/40 bg-destructive/10 text-destructive",
  warm: "border-warning/40 bg-warning/10 text-warning",
  cold: "border-border bg-muted text-muted-foreground",
};

/** 紧急度 as text: only "high" is loud, because most signals are not urgent. */
export const URGENCY_TEXT_CLASS: Record<MarketSignalUrgency, string> = {
  high: "text-destructive",
  medium: "text-warning",
  low: "text-muted-foreground",
};

/** 状态 as text: converted is the quiet success state, dismissed is muted. */
export const STATUS_TEXT_CLASS: Record<MarketSignalStatus, string> = {
  new: "text-foreground",
  reviewing: "text-brand",
  converted: "text-success",
  dismissed: "text-muted-foreground line-through",
};

/** A relevance score, or the dash; the scale is 0–100 with no unit. */
export function formatScore(score: number | null, locale: string): string | null {
  if (score === null) return null;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(score);
}

export function categoryLabel(t: BossT, category: MarketSignalCategory): string {
  switch (category) {
    case "market":
      return t(($) => $.radar.category_market);
    case "competitor":
      return t(($) => $.radar.category_competitor);
    case "channel":
      return t(($) => $.radar.category_channel);
    case "product":
      return t(($) => $.radar.category_product);
    case "policy":
      return t(($) => $.radar.category_policy);
    case "other":
      return t(($) => $.radar.category_general);
  }
}

export function cutLabel(t: BossT, cut: MarketSignalCut): string {
  switch (cut) {
    case "hot":
      return t(($) => $.radar.cut_hot);
    case "warm":
      return t(($) => $.radar.cut_warm);
    case "cold":
      return t(($) => $.radar.cut_cold);
  }
}

export function urgencyLabel(t: BossT, urgency: MarketSignalUrgency): string {
  switch (urgency) {
    case "high":
      return t(($) => $.radar.urgency_high);
    case "medium":
      return t(($) => $.radar.urgency_medium);
    case "low":
      return t(($) => $.radar.urgency_low);
  }
}

export function statusLabel(t: BossT, status: MarketSignalStatus): string {
  switch (status) {
    case "new":
      return t(($) => $.radar.status_new);
    case "reviewing":
      return t(($) => $.radar.status_reviewing);
    case "converted":
      return t(($) => $.radar.status_converted);
    case "dismissed":
      return t(($) => $.radar.status_dismissed);
  }
}

export function sourceLabel(t: BossT, source: MarketSignalSource): string {
  switch (source) {
    case "manual":
      return t(($) => $.radar.source_manual);
    case "ai":
      return t(($) => $.radar.source_ai);
    case "import":
      return t(($) => $.radar.source_import);
  }
}

/**
 * What the radar page decides, without a DOM (`/{slug}/boss/radar`).
 *
 * Three rules, all of them from the contract (§13):
 *
 *   - **`converted` is not a status you can PATCH into.** It belongs to the
 *     convert endpoint, because it always carries the pointer that says what was
 *     created; a signal claiming to be converted with no `converted_*` would make
 *     the list unexplainable (§13.3). So `allowedTransitions` never offers it, and
 *     `canConvert` is the only door to it.
 *   - **Convert is one-way and idempotent.** A second convert is a 409, so a row
 *     that already carries a pointer, or that the server has marked converted, is
 *     drawn as done with its link, not with a disabled button that promises a
 *     retry.
 *   - **Cut, urgency, relevance and status are four different things.** Cut orders
 *     the queue, urgency decides who gets woken, relevance ranks inside a cut, and
 *     status is where the signal is in 观察 → 验证 → 采纳/放弃. They are never
 *     merged into one "importance" (§13.2).
 */

import type {
  MarketSignal,
  MarketSignalCategory,
  MarketSignalCut,
  MarketSignalStatus,
  MarketSignalUrgency,
} from "@morechat/core/types";

/** The endpoint's ceiling; the radar is read as one page of the queue. */
export const SIGNAL_SCAN_LIMIT = 200;

export const SIGNAL_STATUSES: readonly MarketSignalStatus[] = [
  "new",
  "reviewing",
  "converted",
  "dismissed",
];

export const SIGNAL_CATEGORIES: readonly MarketSignalCategory[] = [
  "market",
  "competitor",
  "channel",
  "product",
  "policy",
  "other",
];

export const SIGNAL_CUTS: readonly MarketSignalCut[] = ["hot", "warm", "cold"];

export const SIGNAL_URGENCIES: readonly MarketSignalUrgency[] = ["high", "medium", "low"];

export const OPEN_SIGNAL_STATUSES: readonly MarketSignalStatus[] = ["new", "reviewing"];

/**
 * The statuses a PATCH may write, in the order the row offers them.
 *
 * 观察 (new) → 验证 (reviewing) → 采纳 (convert) / 放弃 (dismissed). `converted` is
 * absent on purpose — it is the convert endpoint's — and `dismissed` is terminal
 * here: reopening a dropped signal would need a decision about the observation it
 * already produced, which is a new signal rather than a status flip.
 */
export function allowedTransitions(
  status: MarketSignalStatus,
): Exclude<MarketSignalStatus, "converted">[] {
  switch (status) {
    case "new":
      return ["reviewing", "dismissed"];
    case "reviewing":
      return ["dismissed"];
    case "converted":
    case "dismissed":
      return [];
  }
}

export interface SignalLanding {
  kind: "goal" | "issue";
  id: string;
}

/** Where a converted signal went, from the row itself. */
export function convertedTarget(signal: MarketSignal): SignalLanding | null {
  if (signal.converted_goal_id !== null) return { kind: "goal", id: signal.converted_goal_id };
  if (signal.converted_issue_id !== null) return { kind: "issue", id: signal.converted_issue_id };
  return null;
}

/**
 * Whether convert is still an option.
 *
 * Both the status and the pointer are checked: the pointer is what makes a second
 * convert a 409, and the status is what a concurrent convert leaves behind. A row
 * with either is drawn as converted, which is also what the front end uses to
 * disable the action before the refetch lands.
 */
export function canConvert(signal: MarketSignal): boolean {
  return signal.status !== "converted" && convertedTarget(signal) === null;
}

const CUT_RANK: Record<MarketSignalCut, number> = { hot: 0, warm: 1, cold: 2 };
const URGENCY_RANK: Record<MarketSignalUrgency, number> = { high: 0, medium: 1, low: 2 };
const STATUS_RANK: Record<MarketSignalStatus, number> = {
  new: 0,
  reviewing: 1,
  converted: 2,
  dismissed: 3,
};

/**
 * The queue order: open first, then cut, then urgency, then relevance, then newest.
 *
 * Cut outranks urgency because cut is "how close to our business", which is what
 * decides whether a signal is worth reading at all; urgency decides which of the
 * close ones to open now.
 */
export function sortSignals(signals: readonly MarketSignal[]): MarketSignal[] {
  return [...signals].sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    const byCut = CUT_RANK[a.cut] - CUT_RANK[b.cut];
    if (byCut !== 0) return byCut;
    const byUrgency = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (byUrgency !== 0) return byUrgency;
    const byScore = (b.score ?? -1) - (a.score ?? -1);
    if (byScore !== 0) return byScore;
    return b.created_at.localeCompare(a.created_at);
  });
}

export interface SignalFilters {
  query?: string;
  status?: MarketSignalStatus | "all";
  cut?: MarketSignalCut | "all";
  category?: MarketSignalCategory | "all";
  urgency?: MarketSignalUrgency | "all";
}

/**
 * The page's filters, applied to the one page it read.
 *
 * The endpoint filters `cut` / `status` / `category` server-side but has no
 * `urgency` or text parameter (§13.3), and one list that filters half on the
 * server and half here would disagree with itself after a page boundary. So the
 * page reads the newest 200 and narrows all five here, and says so when the window
 * is full.
 */
export function filterSignals(
  signals: readonly MarketSignal[],
  filters: SignalFilters,
): MarketSignal[] {
  const needle = (filters.query ?? "").trim().toLowerCase();
  return signals.filter((signal) => {
    if (filters.status && filters.status !== "all" && signal.status !== filters.status) return false;
    if (filters.cut && filters.cut !== "all" && signal.cut !== filters.cut) return false;
    if (filters.category && filters.category !== "all" && signal.category !== filters.category) {
      return false;
    }
    if (filters.urgency && filters.urgency !== "all" && signal.urgency !== filters.urgency) {
      return false;
    }
    if (needle === "") return true;
    const haystack = [signal.title, signal.summary ?? "", signal.note ?? "", signal.url ?? ""];
    return haystack.some((value) => value.toLowerCase().includes(needle));
  });
}

/** Whether any filter is narrowing the list, for the "no matches" state. */
export function hasActiveFilters(filters: SignalFilters): boolean {
  return (
    (filters.query ?? "").trim() !== "" ||
    (filters.status !== undefined && filters.status !== "all") ||
    (filters.cut !== undefined && filters.cut !== "all") ||
    (filters.category !== undefined && filters.category !== "all") ||
    (filters.urgency !== undefined && filters.urgency !== "all")
  );
}

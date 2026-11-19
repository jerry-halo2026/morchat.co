/**
 * What the 千川投放看板 states, computed once and drawn by its six blocks
 * (`/content/ads`).
 *
 * The whole page is a read of one settlement window (`basis`) over one calendar
 * range, and three rules from `WORKBENCH-API §25` are enforced here rather than
 * left to the components:
 *
 * 1. **One window, one amount.** `spend` / `gmv` / `refund` / `settle` belong to
 *    the `basis` the request carried. There is no total across windows in this
 *    file and there must never be one: 7 天结算额 and 90 天结算额 are two different
 *    measurements of the same money, so adding them counts it several times. The
 *    only arithmetic allowed between two amounts is a like-for-like 环比, where
 *    both sides come from the *same* basis (`previous` in the response).
 * 2. **Three states, no invented zero.** `amount: null` is "no rows to add"
 *    (`insufficient_data`); `0` with `empty: "zero"` is a real zero. The page
 *    prints 数据不足 / 0 / — and never substitutes one for another.
 * 3. **The unit is data.** Report amounts are 元; account balances are 分
 *    (`unit: "fen"`). {@link fenToYuan} is the only place a fen becomes a yuan —
 *    one call site, so a screen cannot show 1/100th of a balance twice.
 */

import type {
  AdsBasis,
  AdsMoney,
  AdsNumber,
  AdsSummary,
  AdsTotals,
} from "@morechat/core/types";
import { ADS_BASES } from "@morechat/core/types";

/** How a figure reads on screen. `missing` is the dash, not a zero. */
export type AmountState = "stated" | "insufficient" | "missing";

/**
 * 分 → 元. **The single conversion point on this page.**
 *
 * `1e5` fen is ¥1,000; the platform reports account balances in fen while the
 * report itself is in yuan, so the page has to convert exactly once, at the edge
 * where an account row becomes a figure. Nothing else divides by 100 — a second
 * call site is how a balance gets shown a hundred times too small.
 */
export function fenToYuan(fen: number | null): number | null {
  if (fen === null || Number.isNaN(fen)) return null;
  return Math.round(fen) / 100;
}

/**
 * Which of the three states a money figure is in.
 *
 * `insufficient_data` wins over "missing": the server said why it has no number,
 * and 数据不足 is that statement. A stated `0` stays `stated` — it is an answer.
 */
export function amountState(money: AdsMoney | null | undefined): AmountState {
  if (!money) return "missing";
  if (money.amount === null) {
    return money.empty === "insufficient_data" ? "insufficient" : "missing";
  }
  return "stated";
}

/** The same three states for a counter (`orders`). */
export function countState(count: AdsNumber | null | undefined): AmountState {
  if (!count) return "missing";
  if (count.value === null) {
    return count.empty === "insufficient_data" ? "insufficient" : "missing";
  }
  return "stated";
}

/**
 * 环比 against the previous, equal-length window of the **same** basis.
 *
 * `null` when either side is missing (nothing to compare) or when the previous
 * window is 0 (the ratio would be infinite, and "up ∞%" is not a reading). The
 * comparison is between two figures of one unit, which is why it is allowed at
 * all — the ban is on adding different bases, not on comparing equal ones.
 */
export function delta(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined || previous === 0) return null;
  return (current - previous) / previous;
}

/** The five figures of one window, in the order the strip draws them. */
export const TOTALS_ORDER = ["spend", "gmv", "orders", "refund", "settle"] as const;

export type TotalsKey = (typeof TOTALS_ORDER)[number];

/** Whether a figure in the strip is money or a count. `orders` is the count. */
export function isCount(key: TotalsKey): key is "orders" {
  return key === "orders";
}

/**
 * The figure behind one key, tagged with what it is.
 *
 * Tagged rather than cast: `orders` is an `AdsNumber` and the other four are
 * `AdsMoney`, so a renderer that reads the wrong one is a compile error instead
 * of an `undefined` on screen.
 */
export type AdsFigure =
  | { kind: "money"; money: AdsMoney }
  | { kind: "count"; count: AdsNumber };

export function figureOf(totals: AdsTotals, key: TotalsKey): AdsFigure | null {
  if (isCount(key)) return totals.orders ? { kind: "count", count: totals.orders } : null;
  const money = totals[key];
  return money ? { kind: "money", money } : null;
}

/** The plain number behind a figure — what a 环比 compares. */
export function figureNumber(totals: AdsTotals, key: TotalsKey): number | null {
  const figure = figureOf(totals, key);
  if (!figure) return null;
  return figure.kind === "count" ? figure.count.value : figure.money.amount;
}

/**
 * The windows the picker offers: the server's list when it sent one, the
 * contract's five otherwise. The page never invents a sixth — a window the
 * server does not aggregate has no figures to show.
 */
export function basisOptions(summary: AdsSummary | null | undefined): AdsBasis[] {
  const fromServer = summary?.basis_options ?? [];
  const known = fromServer.filter((value): value is AdsBasis =>
    (ADS_BASES as readonly string[]).includes(value),
  );
  return known.length > 0 ? known : [...ADS_BASES];
}

/** An unknown basis still has to print something: the raw platform value. */
export function basisLabelKey(basis: string): `basis_${string}` {
  return `basis_${basis}`;
}

/**
 * 素材 → 脚本 link. A material is attached to a content script by
 * `media_script_id`; until it is, the row says 未关联 and shows no id.
 */
export function materialScript(scriptId: string | null): string | null {
  if (!scriptId) return null;
  return scriptId.length > 8 ? scriptId.slice(0, 8) : scriptId;
}

/**
 * The range caption. The server echoes the window it actually sliced
 * (`from` / `to`), and that echo is what the page prints — a picker left empty
 * means "the server's own default", not "no range".
 */
export function rangeLabel(from: string, to: string): string {
  if (!from && !to) return "";
  return `${from || "…"} → ${to || "…"}`;
}

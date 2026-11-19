"use client";

import type { AdsMoney, AdsNumber } from "@morechat/core/types";
import { formatMoney } from "../../blocks/record-sheet";
import { useLocale, useT } from "../../i18n";
import { amountState, countState, delta, fenToYuan } from "./model";

/**
 * The four renderings every figure on this board uses.
 *
 * They exist so a number cannot be printed two ways, and so the three states the
 * contract defines are distinguishable on screen: a stated amount (with its
 * currency), a real `0`, 数据不足 for `insufficient_data`, and a dash for a figure
 * that simply is not there. Nothing here rounds, converts or totals — the only
 * unit change in the whole page is {@link fenToYuan}, applied by the account
 * table.
 */
export function AdsMoneyValue({ money }: { money: AdsMoney | null }) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const state = amountState(money);
  if (state === "insufficient") return <InsufficientText />;
  if (state === "missing" || !money || money.amount === null) return <DashText />;
  const currency = money.currency;
  const prefix =
    currency === "CNY" || currency === "USD" ? t(($) => $.unit.currency[currency]) : `${currency} `;
  return (
    <span data-slot="ads-money" className="tabular-nums">
      {formatMoney(money.amount, prefix, locales) ?? ""}
    </span>
  );
}

/** `orders`: a counter, so 0 is a real answer and never a dash. */
export function AdsCountValue({ count }: { count: AdsNumber | null }) {
  const locales = useLocale();
  const state = countState(count);
  if (state === "insufficient") return <InsufficientText />;
  if (state === "missing" || !count || count.value === null) return <DashText />;
  return (
    <span data-slot="ads-count" className="tabular-nums">
      {new Intl.NumberFormat(locales, { maximumFractionDigits: 0 }).format(count.value)}
    </span>
  );
}

/**
 * 环比: the signed change against the previous window **of the same basis**.
 *
 * `delta` returns null when either side is missing or the previous window is 0, and
 * the cell then says 没有可对比的数 instead of a made-up percentage. The sign is
 * part of the answer, so a fall is drawn as a fall.
 */
export function DeltaText({
  current,
  previous,
}: {
  current: number | null | undefined;
  previous: number | null | undefined;
}) {
  const { t } = useT("ads");
  const locales = useLocale();
  const ratio = delta(current, previous);
  if (ratio === null) {
    return (
      <span data-slot="ads-delta" className="text-caption text-muted-foreground">
        {t(($) => $.summary.no_previous)}
      </span>
    );
  }
  const percent = new Intl.NumberFormat(locales, {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(ratio);
  return (
    <span
      data-slot="ads-delta"
      data-direction={ratio >= 0 ? "up" : "down"}
      className={ratio >= 0 ? "text-caption text-success" : "text-caption text-destructive"}
    >
      {percent}
    </span>
  );
}

/** 数据不足: the board's one wording for "the server had no rows to add". */
export function InsufficientText() {
  const { t } = useT("ads");
  return (
    <span data-slot="ads-insufficient" className="text-caption text-muted-foreground">
      {t(($) => $.insufficient)}
    </span>
  );
}

/** 空值: the workbench's one dash, from `blocks.empty.value`. */
export function DashText() {
  const { t } = useT("blocks");
  return <span className="text-faint-foreground">{t(($) => $.empty.value)}</span>;
}

/** A plain number as money (no three-state wrapper): `—` when it is null. */
export function YuanText({
  amount,
  currency = "CNY",
}: {
  amount: number | null;
  currency?: string;
}) {
  const { t } = useT("blocks");
  const locales = useLocale();
  if (amount === null) return <DashText />;
  const prefix =
    currency === "CNY" || currency === "USD" ? t(($) => $.unit.currency[currency]) : `${currency} `;
  return (
    <span className="tabular-nums">{formatMoney(amount, prefix, locales) ?? ""}</span>
  );
}

/**
 * A platform balance: 分 in the response, 元 on screen.
 *
 * This is the page's only fen → yuan call site, and it goes through
 * `fenToYuan` so the division by 100 exists once in the codebase rather than in
 * every cell that happens to hold a balance.
 */
export function FenValue({ fen, currency = "CNY" }: { fen: number | null; currency?: string }) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const yuan = fenToYuan(fen);
  if (yuan === null) return <DashText />;
  const prefix =
    currency === "CNY" || currency === "USD" ? t(($) => $.unit.currency[currency]) : `${currency} `;
  return (
    <span data-slot="ads-fen" className="tabular-nums">
      {formatMoney(yuan, prefix, locales) ?? ""}
    </span>
  );
}

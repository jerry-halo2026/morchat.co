"use client";

import { useLocale, useT } from "../../i18n";
import { percentOf } from "./model";

/**
 * The four renderings every figure on the business page uses.
 *
 * They exist so the page cannot print one number two ways: money always carries
 * its currency glyph, a ratio is always converted at the 0–100 display scale
 * (docs/METRICS.md C3), days keep one decimal, and a missing figure always says
 * 数据不足 rather than falling back to 0. The glyphs come from the workbench's one
 * currency map (`blocks.unit.currency`), not from a second `¥`.
 *
 * Each carries `data-slot="figure-*"`, the same convention the UI primitives use,
 * so a figure can be found without matching the copy around it.
 */
export function MoneyText({
  amount,
  currency,
}: {
  amount: number | null;
  currency: string;
}) {
  const { t } = useT("blocks");
  const locales = useLocale();
  if (amount === null) return <MissingText />;
  const prefix =
    currency === "CNY" || currency === "USD" ? t(($) => $.unit.currency[currency]) : `${currency} `;
  return (
    <span data-slot="figure-money" className="tabular-nums">
      {`${prefix}${new Intl.NumberFormat(locales, { maximumFractionDigits: 2 }).format(amount)}`}
    </span>
  );
}

/** A 0–1 ratio at the display scale; the conversion lives in `percentOf`. */
export function PercentText({ ratio }: { ratio: number | null }) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const percent = percentOf(ratio);
  if (percent === null) return <MissingText />;
  return (
    <span data-slot="figure-percent" className="tabular-nums">
      {`${new Intl.NumberFormat(locales, {
        minimumFractionDigits: Number.isInteger(percent) ? 0 : 1,
        maximumFractionDigits: 1,
      }).format(percent)}${t(($) => $.unit.percent)}`}
    </span>
  );
}

/** Days, one decimal at most: an average of half a day is not 0. */
export function DaysText({ days }: { days: number | null }) {
  const { t } = useT("blocks");
  const locales = useLocale();
  if (days === null) return <MissingText />;
  return (
    <span data-slot="figure-days" className="tabular-nums">
      {`${new Intl.NumberFormat(locales, { maximumFractionDigits: 1 }).format(days)}${t(
        ($) => $.unit.days,
      )}`}
    </span>
  );
}

/** 数据不足: the page's one glyph-level way of saying "no number here". */
export function MissingText() {
  const { t } = useT("biz");
  return (
    <span data-slot="figure-missing" className="text-caption text-muted-foreground">
      {t(($) => $.insufficient)}
    </span>
  );
}

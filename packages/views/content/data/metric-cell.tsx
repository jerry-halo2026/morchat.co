"use client";

import { useMemo } from "react";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale } from "../../i18n";
import { useFigureCopy } from "./copy";
import { figureState } from "./model";

/**
 * One measured number, in one of three states — the page's central rule.
 *
 * A single "empty" treatment would be a mistake in both directions:
 *
 *   - printing `0` for a missing reading invents a collapse (two thirds of the
 *     mirrored works carry no like count at all, `WORKBENCH-DATA-CONTRACT` §2.1);
 *   - printing `—` for a real zero claims nothing was collected when the platform
 *     did report one.
 *
 * So the three states differ in **both** words and colour: a reading is the text
 * colour, a zero is highlighted with the reason on hover, and a reading nobody
 * has collected reads "not collected" in the muted colour. The `data-state`
 * attribute carries the same distinction to CSS and to tests, so the difference
 * is a property of the cell rather than of a class name.
 */
export function FigureCell({ value, slot }: { value: number | null; slot: string }) {
  const locale = useLocale();
  const { notCollected, zeroHint } = useFigureCopy();
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    [locale],
  );

  const state = figureState(value);
  if (state === "insufficient_data") {
    return (
      <span data-slot={slot} data-state={state} className="text-muted-foreground">
        {notCollected}
      </span>
    );
  }

  return (
    <span
      data-slot={slot}
      data-state={state}
      title={state === "zero" ? zeroHint : undefined}
      className={cn(
        "tabular-nums",
        state === "zero" ? "text-warning" : "text-foreground",
      )}
    >
      {formatter.format(value ?? 0)}
    </span>
  );
}

"use client";

import { useMemo } from "react";
import type { BdActivityKind, BdActivityOutcome } from "@morechat/core/types";
import { useT } from "../../i18n";

/**
 * The cockpit's two label tables, resolved from the `blocks` bundle.
 *
 * Every other string on the page is read with the bundle's typed selector at the
 * call site. These two cannot be: the kind and the outcome arrive as data, so the
 * label has to be looked up by a value the compiler does not see. Naming all five
 * kinds and all four outcomes here keeps the lookup a `Record` — a kind added to
 * the contract fails this file's `satisfies` instead of rendering an empty cell.
 */
export function useActivityLabels(): {
  kind: Record<BdActivityKind, string>;
  outcome: Record<BdActivityOutcome, string>;
} {
  const { t } = useT("blocks");
  return useMemo(
    () => ({
      kind: {
        dm: t(($) => $.sales_dashboard.kind_dm),
        call: t(($) => $.sales_dashboard.kind_call),
        meeting: t(($) => $.sales_dashboard.kind_meeting),
        email: t(($) => $.sales_dashboard.kind_email),
        note: t(($) => $.sales_dashboard.kind_note),
      } satisfies Record<BdActivityKind, string>,
      outcome: {
        no_reply: t(($) => $.sales_dashboard.outcome_no_reply),
        replied: t(($) => $.sales_dashboard.outcome_replied),
        advanced: t(($) => $.sales_dashboard.outcome_advanced),
        declined: t(($) => $.sales_dashboard.outcome_declined),
      } satisfies Record<BdActivityOutcome, string>,
    }),
    [t],
  );
}

/**
 * The outcomes the quick-log dialog offers, most useful first: a BD person
 * records "she answered" or "she moved" far more often than a refusal, and the
 * order is the form's default reading order.
 */
export const OUTCOME_OPTIONS: readonly BdActivityOutcome[] = [
  "replied",
  "advanced",
  "no_reply",
  "declined",
];

/**
 * The glyph in front of an amount. `crm` money is CNY in this workspace, but the
 * contract carries a currency per total, so the symbol follows the figure rather
 * than the UI language (docs/METRICS.md C9). An unlabelled currency prints its
 * code instead of the wrong symbol.
 */
export function useCurrencyPrefix(currency: string): string {
  const { t } = useT("blocks");
  switch (currency) {
    case "CNY":
      return t(($) => $.unit.currency.CNY);
    case "USD":
      return t(($) => $.unit.currency.USD);
    default:
      return `${currency} `;
  }
}

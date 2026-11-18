"use client";

import type { BdCampaignKind } from "@morechat/core/types";
import { useT } from "../../i18n";
import { CAMPAIGN_KINDS } from "./model";

/**
 * The batch page's copy surface: the `kind` enum turned into words, in the one
 * place that knows which bundle key each token reads.
 *
 * Every string on the page lives in the `sales` bundle under `campaigns.*`, so
 * the selector form is typed against `locales/en/sales.json` and a missing key
 * is a compile error rather than a raw path on screen. The page's own name is
 * not here: the header reads `layout.nav.sales_campaigns`, the key the left
 * column's row already uses.
 *
 * {@link kindOf} takes the **raw token** and degrades to it: the wire schema is
 * deliberately lenient, and a kind a newer server adds must print itself rather
 * than blank the row.
 */
export function useCampaignsCopy() {
  const { t } = useT("sales");

  const kindOf = (token: string): string => {
    const known: BdCampaignKind | undefined = CAMPAIGN_KINDS.find((entry) => entry === token);
    return known ? t(($) => $.campaigns.kind[known]) : token;
  };

  return { t, kindOf };
}

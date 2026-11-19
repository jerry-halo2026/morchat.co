"use client";

import type { CrmCollabStage, CrmSettlementKind } from "@morechat/core/types";
import { useT } from "../../i18n";
import { COLLAB_STAGES, SETTLEMENT_KINDS, type CollabWindow } from "./model";

/**
 * The collaboration page's copy surface: the two contract enums turned into
 * words, in the one place that knows which bundle key each token reads.
 *
 * Every string on the page lives in the `sales` bundle under `collabs.*`, so the
 * selector form is typed against `locales/en/sales.json` and a missing key is a
 * compile error rather than a raw path on screen. The page's own name is not
 * here: the header reads `layout.nav.sales_collabs`, the key the left column's
 * row already uses, so the two cannot disagree.
 *
 * Both label functions accept the **raw token** and degrade to it. The wire
 * schema is deliberately lenient (`types/workbench.ts`): a server that adds a
 * twelfth stage must not blank a row, so an unknown token prints itself instead
 * of an empty cell.
 */
export function useCollabsCopy() {
  const { t } = useT("sales");

  const stage = (token: string): string => {
    const known: CrmCollabStage | undefined = COLLAB_STAGES.find((entry) => entry === token);
    return known ? t(($) => $.collabs.stage[known]) : token;
  };

  const settlementKind = (token: string): string => {
    const known: CrmSettlementKind | undefined = SETTLEMENT_KINDS.find((entry) => entry === token);
    return known ? t(($) => $.collabs.kind[known]) : token;
  };

  const windowLabel = (value: CollabWindow): string =>
    value === "all"
      ? t(($) => $.collabs.window_all)
      : t(($) => $.collabs.window_days, { days: value });

  return { t, stage, settlementKind, windowLabel };
}

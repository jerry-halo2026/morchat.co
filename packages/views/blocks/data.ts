"use client";

/**
 * The workbench's ledger vocabulary.
 *
 * Only two things live here now that the core data layer exists: the ordered
 * domain list the page and the sidebar rows share, and the narrowing for a
 * `?domain=` query value. Rows, filters, envelopes and the query options all
 * come from `@morechat/core/{crm,creator}` — a second row shape in the view
 * layer is exactly the drift `docs/engineering/WORKBENCH-API.md` §5 prevents.
 *
 * The keys those options build are fixed by the same section:
 *   ["workbench", wsId, "overview" | "counts", departmentId ?? "all"]
 *   ["crm",       wsId, resource, filters]
 *   ["creator",   wsId, filters]
 */

import type {
  CrmBrief,
  CrmClient,
  CrmCollab,
  CrmSettlement,
  Creator,
} from "@morechat/core/types";

/** The five ledgers, in the order a deal moves through them. */
export const LEDGER_DOMAINS = [
  "creators",
  "clients",
  "briefs",
  "collabs",
  "settlements",
] as const;

export type LedgerDomain = (typeof LEDGER_DOMAINS)[number];

/** Narrows a `?domain=` query value. Anything else is not a ledger. */
export function isLedgerDomain(value: string | null): value is LedgerDomain {
  return value !== null && (LEDGER_DOMAINS as readonly string[]).includes(value);
}

/** The row type each ledger lists, as the core types define it. */
export interface LedgerRowByDomain {
  creators: Creator;
  clients: CrmClient;
  briefs: CrmBrief;
  collabs: CrmCollab;
  settlements: CrmSettlement;
}

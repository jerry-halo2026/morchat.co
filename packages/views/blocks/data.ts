"use client";

/**
 * The workbench's ledger vocabulary.
 *
 * Only three things live here now that the core data layer exists: the ordered
 * domain list the page and the sidebar rows share, the three read-out groups
 * that list is rendered in, and the narrowing for a `?domain=` query value.
 * Rows, filters, envelopes and the query options all come from
 * `@morechat/core/{crm,creator,hr,affiliate}` — a second row shape in the view
 * layer is exactly the drift `docs/engineering/WORKBENCH-API.md` §5 prevents.
 *
 * The keys those options build are fixed by the same section:
 *   ["workbench", wsId, "overview" | "counts", departmentId ?? "all"]
 *   ["crm",       wsId, resource, filters]
 *   ["creator",   wsId, filters]
 *   ["hr",        wsId, resource, filters]      // §10.6, B1
 *   ["affiliate", wsId, resource, filters]      // §11
 */

import type {
  AffiliateDaily,
  AffiliatePick,
  AffiliateProduct,
  AffiliateSettlement,
  CrmBrief,
  CrmClient,
  CrmCollab,
  CrmSettlement,
  Creator,
  HrCandidate,
  HrEmployeeProfile,
  HrInterview,
  HrJob,
} from "@morechat/core/types";

/**
 * The thirteen ledgers: the five a deal moves through (B0, `§2`), the four the
 * affiliate distribution business reports (B2, `§11`) and the four the hiring
 * pipeline moves through (B1, `§10.2`).
 *
 * The affiliate settlement ledger is `affiliate_settlements`, not
 * `settlements`: the plain name already belongs to a `crm_settlement` row, and
 * two ledgers behind one `?domain=` value would make the URL ambiguous.
 */
export const LEDGER_DOMAINS = [
  "creators",
  "clients",
  "briefs",
  "collabs",
  "settlements",
  "products",
  "picks",
  "daily",
  "affiliate_settlements",
  "jobs",
  "candidates",
  "interviews",
  "employees",
] as const;

export type LedgerDomain = (typeof LEDGER_DOMAINS)[number];

/**
 * The three read-out groups a ledger can belong to. They are the workbench's
 * three businesses, not three visual styles: commerce rows are money moving out
 * of and into the workspace through a signed deal, affiliate rows are the
 * platform's own 精选联盟 reports (商品 → 选品 → 日成交 → 平台结算单), and people
 * rows are who is being hired and who is on staff.
 *
 * The order is the order the page draws them in: the two money businesses
 * first, the staff ledgers last — the same order `§2`, `§11` and `§10` are
 * written in.
 */
export const LEDGER_GROUPS = ["commerce", "affiliate", "people"] as const;

export type LedgerGroup = (typeof LEDGER_GROUPS)[number];

const DOMAIN_GROUP: Record<LedgerDomain, LedgerGroup> = {
  creators: "commerce",
  clients: "commerce",
  briefs: "commerce",
  collabs: "commerce",
  settlements: "commerce",
  products: "affiliate",
  picks: "affiliate",
  daily: "affiliate",
  affiliate_settlements: "affiliate",
  jobs: "people",
  candidates: "people",
  interviews: "people",
  employees: "people",
};

/** Which group a ledger renders under. */
export function ledgerGroup(domain: LedgerDomain): LedgerGroup {
  return DOMAIN_GROUP[domain];
}

/** One group's ledgers, in the order the contract lists them. */
export function ledgerDomainsIn(group: LedgerGroup): readonly LedgerDomain[] {
  return LEDGER_DOMAINS.filter((domain) => DOMAIN_GROUP[domain] === group);
}

/** The four B1 ledgers, for the places that treat hiring as one block. */
export const HR_LEDGER_DOMAINS = ["jobs", "candidates", "interviews", "employees"] as const;

export type HrLedgerDomain = (typeof HR_LEDGER_DOMAINS)[number];

/** The four B2 ledgers, for the places that treat 精选联盟 as one block. */
export const AFFILIATE_LEDGER_DOMAINS = [
  "products",
  "picks",
  "daily",
  "affiliate_settlements",
] as const;

export type AffiliateLedgerDomain = (typeof AFFILIATE_LEDGER_DOMAINS)[number];

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
  products: AffiliateProduct;
  picks: AffiliatePick;
  daily: AffiliateDaily;
  affiliate_settlements: AffiliateSettlement;
  jobs: HrJob;
  candidates: HrCandidate;
  interviews: HrInterview;
  employees: HrEmployeeProfile;
}

/**
 * The `/counts` fields the B1 ledgers read (`§3`, extended by `§10`).
 *
 * All four are absent from the payload today: the server half of B1 adds them to
 * the same response the B0 rows already come in, and until it does a ledger row
 * draws without a number rather than inventing a zero.
 */
export type HrCountField = "jobs" | "candidates" | "interviews" | "employees";

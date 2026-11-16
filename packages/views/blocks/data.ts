"use client";

/**
 * The workbench's ledger vocabulary.
 *
 * Only three things live here now that the core data layer exists: the ordered
 * domain list the page and the sidebar rows share, the two read-out groups that
 * list is rendered in, and the narrowing for a `?domain=` query value. Rows,
 * filters, envelopes and the query options all come from
 * `@morechat/core/{crm,creator,hr}` — a second row shape in the view layer is
 * exactly the drift `docs/engineering/WORKBENCH-API.md` §5 prevents.
 *
 * The keys those options build are fixed by the same section:
 *   ["workbench", wsId, "overview" | "counts", departmentId ?? "all"]
 *   ["crm",       wsId, resource, filters]
 *   ["creator",   wsId, filters]
 *   ["hr",        wsId, resource, filters]      // §10.6, B1
 */

import type {
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
 * The nine ledgers: the five a deal moves through (B0, `§2`) and the four the
 * hiring pipeline moves through (B1, `§10.2`).
 */
export const LEDGER_DOMAINS = [
  "creators",
  "clients",
  "briefs",
  "collabs",
  "settlements",
  "jobs",
  "candidates",
  "interviews",
  "employees",
] as const;

export type LedgerDomain = (typeof LEDGER_DOMAINS)[number];

/**
 * The two read-out groups a ledger can belong to. They are the workbench's two
 * businesses, not two visual styles: commerce rows are money moving out of and
 * into the workspace, people rows are who is being hired and who is on staff.
 * `docs/engineering/WORKBENCH-API.md` §10 keeps B1's four ledgers in `people`
 * so a reader of the overview sees the split without learning it from JSON.
 */
export const LEDGER_GROUPS = ["commerce", "people"] as const;

export type LedgerGroup = (typeof LEDGER_GROUPS)[number];

const DOMAIN_GROUP: Record<LedgerDomain, LedgerGroup> = {
  creators: "commerce",
  clients: "commerce",
  briefs: "commerce",
  collabs: "commerce",
  settlements: "commerce",
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

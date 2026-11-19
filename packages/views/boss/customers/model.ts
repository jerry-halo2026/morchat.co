/**
 * What the customer page states, computed once and drawn by the table and the
 * drawer (`/boss/customers`).
 *
 * The chain the page is about is `crm_client → crm_brief → crm_collab`, and the
 * one thing this file exists to get right is **ownership**: a brief belongs to
 * the client whose `client_id` it carries, a collab belongs to the brief named by
 * its `brief_id`, and neither may be attached to a neighbour. Every grouping here
 * filters on those two columns rather than on array order, so a client's drawer
 * cannot show a brief that belongs to someone else — the failure mode that makes
 * a customer page lie.
 *
 * `crm_client` has no status column (WORKBENCH-API.md §2), so the 状态 the table
 * prints is derived from the chain under it and nothing else: no brief yet, in
 * progress, won, or closed. The ladder is written down in {@link clientStage} so
 * the table and the drawer cannot disagree about what a client is.
 *
 * Kept DOM-free so both rules are pinned by plain unit assertions.
 */

import type { CrmBrief, CrmClient, CrmCollab, CrmCollabStage } from "@morechat/core/types";

/** Where a customer stands, derived from the briefs and collabs under it. */
export const CLIENT_STAGES = ["none", "active", "won", "closed"] as const;

export type ClientStage = (typeof CLIENT_STAGES)[number];

/** Stages that mean the collaboration was agreed and cannot be lost any more. */
const WON_STAGES: readonly CrmCollabStage[] = ["accepted", "settled"];

/** Stages that take a collaboration out of the running. */
const DEAD_STAGES: readonly CrmCollabStage[] = ["cancelled"];

/** The briefs this client asked for, newest first. */
export function briefsOfClient(
  briefs: readonly CrmBrief[],
  clientId: string,
): CrmBrief[] {
  return briefs
    .filter((brief) => brief.client_id === clientId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** The collaborations run for one brief. */
export function collabsOfBrief(
  collabs: readonly CrmCollab[],
  briefId: string,
): CrmCollab[] {
  return collabs
    .filter((collab) => collab.brief_id === briefId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * The collaborations under a set of briefs — the set is what keeps another
 * client's work out of this client's drawer.
 */
export function collabsOfBriefs(
  collabs: readonly CrmCollab[],
  briefIds: ReadonlySet<string>,
): CrmCollab[] {
  return collabs
    .filter((collab) => briefIds.has(collab.brief_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * 状态: won beats closed beats in progress; a client with no brief has not
 * started. Checked in that order, because a settled collaboration outlives the
 * brief being closed and a closed brief with a live collab is still in progress.
 */
export function clientStage(
  briefs: readonly CrmBrief[],
  collabs: readonly CrmCollab[],
): ClientStage {
  if (briefs.length === 0) return "none";
  if (collabs.some((collab) => WON_STAGES.includes(collab.stage))) return "won";
  const live =
    briefs.some((brief) => brief.status !== "closed") ||
    collabs.some((collab) => !DEAD_STAGES.includes(collab.stage));
  return live ? "active" : "closed";
}

/** One row of the table: the client plus the slice of the chain under it. */
export interface ClientRow {
  client: CrmClient;
  briefs: CrmBrief[];
  /** Only the collabs whose brief belongs to this client. */
  collabs: CrmCollab[];
  stage: ClientStage;
}

/**
 * The table's rows, filtered by the search box and ordered by the one fact that
 * is always there: when the client was last touched.
 *
 * The search runs over the fields the row prints and nothing else, so a match
 * always explains itself on screen; the client ledger returns every row (no
 * cursor, no server-side `q` needed for a list this size).
 */
export function clientRows(
  clients: readonly CrmClient[],
  briefs: readonly CrmBrief[],
  collabs: readonly CrmCollab[],
  search = "",
): ClientRow[] {
  const needle = search.trim().toLowerCase();
  return clients
    .filter((client) => matchesSearch(client, needle))
    .map((client) => {
      const own = briefsOfClient(briefs, client.id);
      const under = collabsOfBriefs(collabs, new Set(own.map((brief) => brief.id)));
      return { client, briefs: own, collabs: under, stage: clientStage(own, under) };
    })
    .sort((a, b) => b.client.updated_at.localeCompare(a.client.updated_at));
}

/** A case-insensitive hit on any field the row prints. */
function matchesSearch(client: CrmClient, needle: string): boolean {
  if (!needle) return true;
  return [
    client.name,
    client.brand,
    client.industry,
    client.contact_name,
    client.contact_channel,
  ].some((field) => !!field && field.toLowerCase().includes(needle));
}

/**
 * The budget a brief states, or `null` when it states none.
 *
 * `crm_brief` has no currency column (WORKBENCH-API.md §3.1): a budget is read
 * as CNY, which is why this returns a number and not an amount-plus-currency.
 * One side alone is a real answer (a floor with no ceiling), so the two are
 * carried separately and the cell prints whichever exist.
 */
export function briefBudget(brief: CrmBrief): { min: number | null; max: number | null } {
  return { min: brief.budget_min_amount, max: brief.budget_max_amount };
}

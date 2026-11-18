import type {
  BdCampaign,
  BdCampaignKind,
  CreateBdCampaignRequest,
  UpdateBdCampaignRequest,
} from "@morechat/core/types";
// Money is formatted by the sales space's one helper (`quotes/model`): same
// currency symbol, same grouping, same two decimals as the collaboration page.
import { dayOfTimestamp, formatMoney, roundMoney } from "../quotes/model";

/**
 * The collection batch ledger's arithmetic, kept out of the components.
 *
 * **A batch is a fact about how a set of creators was found**, not a grouping of
 * creators (`WORKBENCH-API.md` §20.2): `kind` (search / comment / manual), the
 * keyword that was searched, the budget, the window it ran in, and a cached
 * `creator_count`. "Which creators are in this batch" is the next batch's
 * many-to-many — deliberately not modelled here and not offered as an entry
 * point, because a page that half-built it would be a second truth source for a
 * creator's source fields (§20.6 keeps `creator.source_*` as the record).
 *
 * Four rules the numbers follow:
 *
 *   - **`creator_count` 0 is a real zero.** The column is `NOT NULL DEFAULT 0`
 *     and a new batch genuinely has nobody attached yet, so unlike every money
 *     column this one prints `0` rather than an empty marker (§20.2).
 *   - **A missing budget prints nothing.** `budget_amount` is nullable, so
 *     "nobody set a budget" must not read as "the budget is ¥0".
 *   - **Days are calendar days.** `started_on` / `ended_on` are `DATE` columns,
 *     printed as stored: parsing `YYYY-MM-DD` into an instant would shift them a
 *     day either side of the zone they were written in.
 *   - **The window must not run backwards.** `ended_on < started_on` is a 400 on
 *     the server (§20.4), so {@link formError} refuses it in the form first.
 */

/** Every kind the contract allows, in the order the picker offers them. */
export const CAMPAIGN_KINDS: readonly BdCampaignKind[] = ["search", "comment", "manual"];

/** The currencies the form offers; the same three the quote sheet does. */
export const CURRENCIES = ["CNY", "USD", "EUR"] as const;

/** A kind the contract knows, or `null` for one a newer server sent. */
export function parseKind(value: string): BdCampaignKind | null {
  const found = CAMPAIGN_KINDS.find((kind) => kind === value);
  return found ?? null;
}

/** A `YYYY-MM-DD` column printed as stored. */
export function dayText(value: string | null): string | null {
  if (!value) return null;
  return value.length > 10 ? value.slice(0, 10) : value;
}

/** An instant read as the day it fell on here — `updated_at` is one. */
export function instantDayText(value: string | null): string | null {
  return dayOfTimestamp(value);
}

/** A budget as text, or `null` when nobody set one. */
export function budgetText(
  amount: number | null,
  currency: string,
  locale: string,
): string | null {
  return amount === null || !Number.isFinite(amount)
    ? null
    : formatMoney(amount, currency, locale);
}

/** The two ends of the batch's window, each `null` when it is open. */
export function windowEnds(
  row: Pick<BdCampaign, "started_on" | "ended_on">,
): { from: string | null; to: string | null } {
  return { from: dayText(row.started_on), to: dayText(row.ended_on) };
}

/**
 * The order the page reads rows in, mirroring the endpoint's own
 * (`coalesce(started_on, created_at::date) DESC, created_at DESC, id DESC`,
 * §20.3) so a refetch never reorders what the reader was looking at.
 *
 * A batch with no window sorts by the day it was created — "not started" is not
 * "started at the beginning of time".
 */
export function sortCampaigns(rows: readonly BdCampaign[]): BdCampaign[] {
  const startDay = (row: BdCampaign) => dayText(row.started_on) ?? dayText(row.created_at) ?? "";
  return [...rows].sort((a, b) => {
    const dayDiff = startDay(a) < startDay(b) ? 1 : startDay(a) > startDay(b) ? -1 : 0;
    if (dayDiff !== 0) return dayDiff;
    const created = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (!Number.isNaN(created) && created !== 0) return created;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}

// --- The form ---------------------------------------------------------------

/** Everything the create/edit form holds, as typed. */
export interface CampaignForm {
  name: string;
  kind: BdCampaignKind;
  keyword: string;
  /** The 预算 field. */
  budget: string;
  currency: string;
  /** `YYYY-MM-DD`, or `""` for an open end. */
  startedOn: string;
  endedOn: string;
}

/** A stored row as the form opens on it; `null` for a new batch. */
export function campaignForm(row: BdCampaign | null): CampaignForm {
  if (!row) {
    return {
      name: "",
      kind: "manual",
      keyword: "",
      budget: "",
      currency: "CNY",
      startedOn: "",
      endedOn: "",
    };
  }
  return {
    name: row.name,
    kind: row.kind,
    keyword: row.source_keyword ?? "",
    budget: row.budget_amount === null ? "" : String(row.budget_amount),
    currency: row.currency,
    startedOn: row.started_on ?? "",
    endedOn: row.ended_on ?? "",
  };
}

/** A money field read the way the server reads it: empty clears, junk is refused. */
export function parseMoneyField(
  value: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false };
  return { ok: true, value: roundMoney(amount) };
}

/** What is wrong with the form, or `null` when it can be sent. */
export type CampaignFormError = "name" | "amount" | "window";

export function formError(form: CampaignForm): CampaignFormError | null {
  if (form.name.trim() === "") return "name";
  if (!parseMoneyField(form.budget).ok) return "amount";
  if (form.startedOn !== "" && form.endedOn !== "" && form.endedOn < form.startedOn) {
    return "window";
  }
  return null;
}

/**
 * The fields both writes share. `creator_count` is **not** among them: it is a
 * cached size the server keeps, and letting this form type it would make the
 * number a claim instead of a count (§20.2).
 */
export interface CampaignFields {
  name: string;
  kind: BdCampaignKind;
  budget_amount: number | null;
  currency: string;
  started_on: string | null;
  ended_on: string | null;
  source_keyword: string | null;
}

export function campaignFields(form: CampaignForm): CampaignFields {
  const budget = parseMoneyField(form.budget);
  const keyword = form.keyword.trim();
  return {
    name: form.name.trim(),
    kind: form.kind,
    budget_amount: budget.ok ? budget.value : null,
    currency: form.currency,
    // An emptied day is an open end, not "keep the old one".
    started_on: form.startedOn === "" ? null : form.startedOn,
    ended_on: form.endedOn === "" ? null : form.endedOn,
    source_keyword: keyword === "" ? null : keyword,
  };
}

/** `POST /bd/campaigns` — the name is required and unique per workspace (409). */
export function createCampaignRequest(form: CampaignForm): CreateBdCampaignRequest {
  return campaignFields(form);
}

/** `PATCH /bd/campaigns/{id}` — a rename onto an existing name also answers 409. */
export function updateCampaignRequest(form: CampaignForm): UpdateBdCampaignRequest {
  return campaignFields(form);
}

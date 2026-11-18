import type {
  CreateCrmCollabRequest,
  CreateCrmSettlementRequest,
  CrmCollab,
  CrmCollabStage,
  CrmSettlement,
  CrmSettlementKind,
  UpdateCrmCollabRequest,
} from "@morechat/core/types";
// The sales space formats money in one place: `quotes/model` owns the Intl
// configuration (currency symbol, two decimals, grouping) and the 0–1 →
// percentage rule. This page reuses both rather than starting a second one.
import {
  dayOfTimestamp,
  formatCommission,
  formatMoney,
  roundMoney,
  shiftDay,
} from "../quotes/model";

/**
 * The collaboration ledger's arithmetic, kept out of the components so every
 * rule below can be read — and tested — without a renderer.
 *
 * **A collaboration is `crm_collab`, not a new order table** (`WORKBENCH-API.md`
 * §20.1): one creator × one brief, carrying the stage, the two amounts, the
 * three cost fields, the commission and the two fulfilment columns this page
 * exists to show (`publish_url`, `settled_on`).
 *
 * Five rules the numbers follow:
 *
 *   - **No number is filled in.** A null amount prints an empty marker, never
 *     `0`: "nobody quoted" and "the quote is worth zero" are different
 *     statements (`docs/METRICS.md` §1 rule 3). {@link sumMoney} carries the same
 *     three states the cockpit's money block uses — `amount: null` with `empty:
 *     "insufficient_data"` means no row had a number to add.
 *   - **`commission_rate` is a 0–1 ratio** and the table shows a percentage;
 *     {@link commissionText} is the only place the multiplication happens, via
 *     `quotes/model.formatCommission`.
 *   - **`settled_on` is a calendar day**, printed as stored: parsing
 *     `YYYY-MM-DD` into an instant would move it a day either side of the zone
 *     it was written in. `updated_at` and `paid_at` are the opposite — real
 *     instants, so they are read in the viewer's zone.
 *   - **The stage set is the contract's, not this file's.** {@link COLLAB_STAGES}
 *     lists the eleven stages in pipeline order and {@link stageRank} orders by
 *     it; a stage the server adds later sorts last and prints its own token
 *     instead of blanking the row (`types/workbench.ts` keeps the wire schema
 *     lenient on purpose).
 *   - **`paid_at` is the only thing that makes a settlement received.** The four
 *     kinds are a label, not a state; {@link isReceived} reads `paid_at` and
 *     nothing else.
 */

/** Every stage the contract allows, in pipeline order (§20.2). */
export const COLLAB_STAGES: readonly CrmCollabStage[] = [
  "inquiry",
  "quoted",
  "negotiating",
  "confirmed",
  "sampling",
  "script_review",
  "scheduled",
  "published",
  "accepted",
  "settled",
  "cancelled",
];

/** Every settlement kind the contract allows (§20.2). */
export const SETTLEMENT_KINDS: readonly CrmSettlementKind[] = [
  "prepay",
  "final",
  "platform_fee",
  "tax",
];

/** A stage token the contract knows, or `null` for one a newer server sent. */
export function parseStage(value: string): CrmCollabStage | null {
  const found = COLLAB_STAGES.find((stage) => stage === value);
  return found ?? null;
}

/** A settlement kind the contract knows, or `null`. */
export function parseSettlementKind(value: string): CrmSettlementKind | null {
  const found = SETTLEMENT_KINDS.find((kind) => kind === value);
  return found ?? null;
}

/**
 * Where a stage sits in the pipeline. An unknown token sorts after every known
 * stage (`COLLAB_STAGES.length`) instead of landing at the top of the board.
 */
export function stageRank(stage: string): number {
  const index = COLLAB_STAGES.findIndex((known) => known === stage);
  return index === -1 ? COLLAB_STAGES.length : index;
}

// --- Money ------------------------------------------------------------------

/**
 * A sum and what it means, in the three states the cockpit's money block uses
 * (`BdPipelineMoney`, `WORKBENCH-API.md` §20.3):
 *
 *   - `amount: null` + `insufficient_data` — no row carried a number, so nothing
 *     was added. This is the state that must not become `0`.
 *   - `amount: 0` + `zero` — rows exist and they add up to zero.
 *   - `amount: n` + `zero` — a real total. `empty` names which *empty* outcome
 *     the figure would take; a figure that exists is never `insufficient_data`.
 *
 * `currency` travels even when `amount` is null, so the cell can be labelled
 * while it is empty.
 */
export interface MoneySum {
  amount: number | null;
  currency: string;
  empty: "zero" | "insufficient_data";
}

/** Σ of the numbers that are there, `insufficient_data` when none are. */
export function sumMoney(values: readonly (number | null)[], currency: string): MoneySum {
  let total = 0;
  let counted = 0;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    total += value;
    counted += 1;
  }
  if (counted === 0) return { amount: null, currency, empty: "insufficient_data" };
  return { amount: roundMoney(total), currency, empty: "zero" };
}

/**
 * One amount as text, or `null` when there is no amount.
 *
 * The null is the point: the caller draws its own empty marker, so a missing
 * figure can never render as a confident zero.
 */
export function amountText(
  amount: number | null,
  currency: string,
  locale: string,
): string | null {
  return amount === null || !Number.isFinite(amount)
    ? null
    : formatMoney(amount, currency, locale);
}

/** A {@link MoneySum} as text, `null` while it holds no figure. */
export function sumText(sum: MoneySum, locale: string): string | null {
  return amountText(sum.amount, sum.currency, locale);
}

/**
 * The three cost fields, in the order the column names them: 合作费, 样品费,
 * 平台费. Each slot keeps its own `null` so the cell can print an empty marker
 * where the sample cost would be, instead of a shorter string that reads as if
 * the platform fee were the sample.
 */
export function feeAmounts(
  row: Pick<CrmCollab, "creator_fee" | "sample_cost" | "platform_fee">,
): (number | null)[] {
  return [row.creator_fee, row.sample_cost, row.platform_fee];
}

/** The commission as the table prints it: `0.2` → `"20.0%"`, `null` → nothing. */
export function commissionText(rate: number | null): string | null {
  const percent = formatCommission(rate);
  return percent === null ? null : `${percent}%`;
}

// --- Days -------------------------------------------------------------------

/**
 * A `YYYY-MM-DD` column printed as stored. `settled_on` is a calendar day, and
 * `new Date("2026-11-18")` is UTC midnight — printing it through a formatter
 * would show the 17th to anyone west of Greenwich.
 */
export function dayText(value: string | null): string | null {
  if (!value) return null;
  return value.length > 10 ? value.slice(0, 10) : value;
}

/** `updated_at` / `paid_at` are instants, read as the day they fell on *here*. */
export function instantDayText(value: string | null): string | null {
  return dayOfTimestamp(value);
}

/** The page's three window options, in days; `all` is no window at all. */
export const WINDOW_DAYS = [7, 30, 90] as const;

export type CollabWindow = "all" | (typeof WINDOW_DAYS)[number];

/** A window option read back from the toolbar's value, `all` for anything else. */
export function parseWindow(value: string): CollabWindow {
  const found = WINDOW_DAYS.find((days) => String(days) === value);
  return found ?? "all";
}

/**
 * Whether a row's `updated_at` falls inside the last `days` local days, today
 * included. `all` keeps everything, and a row with no timestamp cannot be placed
 * in a window — dropping it silently would be worse than keeping it, so it stays.
 *
 * The window runs over `updated_at` because `GET /crm/collabs` has no date
 * parameter (§3): `stage` and `creator_id` narrow the request, and a date range
 * narrows the page it returned.
 */
export function inWindow(
  updatedAt: string | null,
  days: CollabWindow,
  today: string,
): boolean {
  if (days === "all") return true;
  const day = dayOfTimestamp(updatedAt);
  if (day === null) return true;
  return day >= shiftDay(today, -(days - 1)) && day <= today;
}

export function filterByWindow<T extends { updated_at: string }>(
  rows: readonly T[],
  days: CollabWindow,
  today: string,
): T[] {
  if (days === "all") return [...rows];
  return rows.filter((row) => inWindow(row.updated_at, days, today));
}

// --- Grouping ---------------------------------------------------------------

/**
 * One stage band: the rows sitting in it, and what they are worth.
 *
 * The band is the folded view of the eleven stages: only stages that hold a row
 * get a band, so twelve collaborations read as twelve rows under three headings
 * rather than eleven empty columns.
 */
export interface StageBand<T> {
  /** The raw token from the row, so a stage the contract adds still bands. */
  stage: string;
  rows: T[];
  /** Σ `final_amount` over the band; `null` when no row closed an amount. */
  total: MoneySum;
}

/** What a row has to carry to be banded and ordered — nothing else is read. */
export interface CollabRow {
  id: string;
  stage: string;
  final_amount: number | null;
  currency: string;
  updated_at: string;
}

/** Newest first, id as the tie-break so two rows never swap between renders. */
export function sortByUpdated<T extends { id: string; updated_at: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const diff = Date.parse(b.updated_at) - Date.parse(a.updated_at);
    if (!Number.isNaN(diff) && diff !== 0) return diff;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}

/**
 * Rows banded by stage, in pipeline order, each band newest-first.
 *
 * `stage` is read as a plain string, not the contract's union: the wire schema is
 * lenient on purpose (`types/workbench.ts`), so a token a newer server adds must
 * band like any other instead of vanishing from the board.
 *
 * The band's `total` is the currency of the band's first row: mixed-currency
 * totals are known debt (§20.6 — the server aggregates the dominant currency
 * only), and adding CNY to USD here would invent a number the workspace cannot
 * explain.
 */
export function groupByStage<T extends CollabRow>(rows: readonly T[]): StageBand<T>[] {
  const bands = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = bands.get(row.stage);
    if (bucket) bucket.push(row);
    else bands.set(row.stage, [row]);
  }
  return [...bands.entries()]
    .sort(([a], [b]) => {
      const diff = stageRank(a) - stageRank(b);
      if (diff !== 0) return diff;
      return a < b ? -1 : a > b ? 1 : 0;
    })
    .map(([stage, bandRows]) => ({
      stage,
      rows: sortByUpdated(bandRows),
      total: sumMoney(
        bandRows.map((row) => row.final_amount),
        bandRows[0]?.currency ?? "CNY",
      ),
    }));
}

// --- The drawer -------------------------------------------------------------

/** Everything the drawer holds, as typed. */
export interface CollabForm {
  stage: CrmCollabStage;
  /** The 报价金额 field. */
  quote: string;
  /** The 成交金额 field. */
  final: string;
  publishUrl: string;
  /** `YYYY-MM-DD`, or `""` for "not settled yet". */
  settledOn: string;
}

/** The row as the drawer opens on it. */
export function collabForm(
  row: Pick<
    CrmCollab,
    "stage" | "quote_amount" | "final_amount" | "publish_url" | "settled_on"
  >,
): CollabForm {
  return {
    stage: row.stage,
    quote: row.quote_amount === null ? "" : String(row.quote_amount),
    final: row.final_amount === null ? "" : String(row.final_amount),
    publishUrl: row.publish_url ?? "",
    settledOn: row.settled_on ?? "",
  };
}

/** The drawer's opening state for a collaboration that does not exist yet. */
export const EMPTY_COLLAB_FORM: CollabForm = {
  stage: "inquiry",
  quote: "",
  final: "",
  publishUrl: "",
  settledOn: "",
};

/**
 * A money field read the way the server reads it: empty clears the column,
 * anything that is not a number of 0 or more is refused before the request.
 *
 * `null` and `"nonsense"` are different answers — one is a cleared amount, the
 * other is a typo the reader has to see.
 */
export function parseMoneyField(
  value: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false };
  return { ok: true, value: roundMoney(amount) };
}

/** Whether either amount field holds something the server would refuse. */
export function invalidAmounts(form: CollabForm): boolean {
  return !parseMoneyField(form.quote).ok || !parseMoneyField(form.final).ok;
}

/** `PATCH /crm/collabs/{id}`: the fields this drawer owns, and nothing else. */
export function collabFields(form: CollabForm): UpdateCrmCollabRequest {
  const quote = parseMoneyField(form.quote);
  const final = parseMoneyField(form.final);
  const publishUrl = form.publishUrl.trim();
  return {
    stage: form.stage,
    quote_amount: quote.ok ? quote.value : null,
    final_amount: final.ok ? final.value : null,
    // An emptied field clears the column: `null` is "not filled in", not "keep
    // the old link".
    publish_url: publishUrl === "" ? null : publishUrl,
    settled_on: form.settledOn === "" ? null : form.settledOn,
  };
}

/** `POST /crm/collabs`: who the collaboration joins, plus the drawer's fields. */
export function createCollabRequest(
  briefId: string,
  creatorId: string,
  form: CollabForm,
): CreateCrmCollabRequest {
  return { brief_id: briefId, creator_id: creatorId, ...collabFields(form) };
}

// --- Settlements ------------------------------------------------------------

/** `paid_at` is the only proof the money moved (§20.2). */
export function isReceived(row: Pick<CrmSettlement, "paid_at">): boolean {
  return row.paid_at !== null;
}

/** What the drawer's settlement section sums, in the same three states. */
export interface SettlementTotals {
  received: MoneySum;
  owed: MoneySum;
}

export function settlementTotals(
  rows: readonly CrmSettlement[],
  currency: string,
): SettlementTotals {
  return {
    received: sumMoney(
      rows.filter(isReceived).map((row) => row.amount),
      currency,
    ),
    owed: sumMoney(
      rows.filter((row) => !isReceived(row)).map((row) => row.amount),
      currency,
    ),
  };
}

/** The add-a-settlement form, as typed. */
export interface SettlementForm {
  kind: CrmSettlementKind;
  amount: string;
  /** `YYYY-MM-DD`; empty while the money has not arrived. */
  paidOn: string;
}

export const EMPTY_SETTLEMENT_FORM: SettlementForm = {
  kind: "prepay",
  amount: "",
  paidOn: "",
};

/**
 * `POST /crm/settlements`. `paid_at` is a timestamp column, so the day the
 * reader typed becomes that day's instant at local noon: noon is the one hour
 * that survives every UTC offset, so reading the instant back in the zone it was
 * written in always returns the same calendar day — a midnight instant west of
 * Greenwich would print the day before.
 */
export function settlementRequest(
  collabId: string,
  currency: string,
  form: SettlementForm,
): CreateCrmSettlementRequest | null {
  const amount = parseMoneyField(form.amount);
  if (!amount.ok || amount.value === null) return null;
  return {
    collab_id: collabId,
    kind: form.kind,
    amount: amount.value,
    currency,
    paid_at: paidAtFromDay(form.paidOn),
  };
}

/** The calendar day `day` as the local noon instant, or `null` when it is not a day. */
export function paidAtFromDay(day: string): string | null {
  if (day === "") return null;
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return null;
  return new Date(year, month - 1, date, 12, 0, 0, 0).toISOString();
}

/**
 * The `PATCH /crm/settlements/{id}` a row action sends — the same instant rule as
 * {@link settlementRequest}, so a mark and a create cannot disagree about which
 * day the money arrived on.
 *
 * `day: null` is 撤销到账, and it travels as an **empty string, not `null`**. The
 * handler reads a nullable field through `applyTimestampPatch`, which treats an
 * absent *or* null `paid_at` as "keep what is stored" (`workbench_types.go`), so
 * `{"paid_at": null}` would be a silent no-op; `workbenchTimestampValue("")` is
 * the one value it turns into SQL NULL, and the statement assigns the argument
 * straight to the column (`workbench_crm.sql`, `paid_at = sqlc.narg(…::date)`), so
 * the column really clears. A day that is not a day answers `null` instead of a
 * patch, so a malformed value can never silently clear an arrival that was
 * already recorded.
 */
export function receiptPatch(day: string | null): { paid_at: string } | null {
  if (day === null) return { paid_at: "" };
  const paidAt = paidAtFromDay(day);
  return paidAt === null ? null : { paid_at: paidAt };
}

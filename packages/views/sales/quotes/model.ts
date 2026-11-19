import type { BdQuote, BdQuoteStatus, CreateBdQuoteRequest } from "@morechat/core/types";

/**
 * The quote ledger's arithmetic, kept out of the components so every rule below
 * can be read — and tested — without a renderer.
 *
 * Four rules the numbers follow:
 *
 *   - **`commission_rate` is a 0–1 ratio and the field is 0–100.** 20% is stored
 *     as `0.2` (`WORKBENCH-DATA-CONTRACT` §3, and the server answers 400 for
 *     `20`). {@link percentToRate} is the only place the division happens and
 *     {@link rateToPercent} the only place the multiplication does, so a screen
 *     cannot ship a rate that was divided twice or not at all.
 *   - **`valid_until` is a calendar day, compared as a day.** It is `YYYY-MM-DD`
 *     on the wire and the server refuses a day before `quoted_at`'s day with
 *     400 — not a warning. The form runs the same comparison before the request
 *     ({@link isBeforeQuoteDay}) so the refusal is shown in place.
 *   - **A stored `expired` and a late `sent` are two different facts.** The first
 *     is the server's decision about an offer; the second is an offer nobody has
 *     answered yet. {@link quoteValidity} names them apart; the table prints two
 *     different words for them.
 *   - **A number nobody entered is `null`, never 0.** A quote with no 坑位费 is a
 *     pure-commission deal and prints `—`; a commission of `0` is a real 0%.
 */

/** Every status the contract allows, in pipeline order. */
export const QUOTE_STATUSES: readonly BdQuoteStatus[] = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
];

/**
 * One 明细行 as this page writes it. The column is `items JSONB` on the wire and
 * `unknown[]` in the type, so the shape lives here and the table and the form
 * both read it through {@link parseQuoteItems}.
 */
export interface QuoteItem {
  name: string;
  spec: string;
  unit: string;
  /** Unit price, in `quote.currency`. */
  price: number;
  qty: number;
}

/** The same line while it is being typed: every field a string. */
export interface QuoteLine {
  /** Stable React key; not sent anywhere. */
  key: string;
  name: string;
  spec: string;
  unit: string;
  price: string;
  qty: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * The lines behind `items`, with anything that is not an object dropped and a
 * missing field degraded to `""` / `0`. A hand-edited row is not a reason to
 * blank the column: the rest of the lines still read.
 */
export function parseQuoteItems(raw: readonly unknown[]): QuoteItem[] {
  const items: QuoteItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    items.push({
      name: text(record.name),
      spec: text(record.spec),
      unit: text(record.unit),
      price: finiteNumber(record.price) ?? 0,
      qty: finiteNumber(record.qty) ?? 0,
    });
  }
  return items;
}

/** To the cent: a 明细 is money, and 0.1 + 0.2 must print 0.30. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Money in the reader's locale, with the currency's own symbol (`¥8,000`) —
 * the figure carries its currency, so a CNY quote and a USD quote cannot be read
 * as the same number (`docs/METRICS.md` C9). A currency `Intl` refuses prints its
 * code instead of throwing away the amount.
 */
export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount)}`;
  }
}

/** One line's money: price × quantity. */
export function lineTotal(item: QuoteItem): number {
  return roundMoney(item.price * item.qty);
}

/** The 小计 under the lines: Σ price × quantity. */
export function itemsSubtotal(items: readonly QuoteItem[]): number {
  return roundMoney(items.reduce((sum, item) => sum + lineTotal(item), 0));
}

/**
 * What the 明细 column prints after the count: the first line's name and its
 * spec, or `null` when there is nothing to summarise. Kept to one line here so
 * the column can truncate instead of deciding what to drop.
 */
export function firstItemSummary(quote: Pick<BdQuote, "items">): string | null {
  const [first] = parseQuoteItems(quote.items);
  if (!first) return null;
  const name = first.name.trim();
  const spec = first.spec.trim();
  if (name && spec) return `${name} · ${spec}`;
  return name || spec || null;
}

// --- 佣金率: 0–1 stored, 0–100 displayed -----------------------------------

/** The stored ratio as the percentage the field shows: `0.2` → `20`. */
export function rateToPercent(rate: number): number {
  return Math.round(rate * 1000) / 10;
}

/**
 * The percentage the field holds as the ratio the server stores: `20` → `0.2`.
 *
 * One decimal of a percent is the finest step the field accepts, so `20.04`
 * becomes `0.2` rather than a rate nothing on screen can show. Out-of-range input
 * is clamped here and refused by {@link parsePercent} before it ever gets this
 * far.
 */
export function percentToRate(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round(clamped * 10) / 10 / 100;
}

/** The table's one-decimal percentage without its sign: `0.2` → `"20.0"`. */
export function formatCommission(rate: number | null): string | null {
  return rate === null ? null : rateToPercent(rate).toFixed(1);
}

/** Reads the percentage field: `null` when it is empty or not 0–100. */
export function parsePercent(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const percent = Number(trimmed);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return Math.round(percent * 10) / 10;
}

// --- Money and quantity fields ---------------------------------------------

/** Reads a money field: `null` when empty, negative or unparsable. */
export function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return roundMoney(amount);
}

/** Reads a quantity: `null` when empty, negative or fractional. */
export function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const qty = Number(trimmed);
  if (!Number.isFinite(qty) || qty < 0) return null;
  return Math.round(qty);
}

/** A line's price × quantity while it is still being typed. */
export function lineSubtotal(line: QuoteLine): number {
  return roundMoney((parseAmount(line.price) ?? 0) * (parseQuantity(line.qty) ?? 0));
}

/** The 小计 under the form's lines, over the values typed so far. */
export function linesSubtotal(lines: readonly QuoteLine[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + lineSubtotal(line), 0));
}

/** The lines that still say something; a blank row is not saved. */
export function linesToItems(lines: readonly QuoteLine[]): QuoteItem[] {
  return lines
    .map((line) => ({
      name: line.name.trim(),
      spec: line.spec.trim(),
      unit: line.unit.trim(),
      price: parseAmount(line.price) ?? 0,
      qty: parseQuantity(line.qty) ?? 0,
    }))
    .filter((item) => item.name !== "" || item.price > 0 || item.qty > 0);
}

let lineSeq = 0;

/** One line of the form: a blank row, or a stored line made editable again. */
export function newLine(item?: Partial<QuoteItem>): QuoteLine {
  lineSeq += 1;
  return {
    key: `line-${lineSeq}`,
    name: item?.name ?? "",
    spec: item?.spec ?? "",
    unit: item?.unit ?? "",
    price: item?.price === undefined ? "" : String(item.price),
    qty: item?.qty === undefined ? "" : String(item.qty),
  };
}

// --- Days -------------------------------------------------------------------

/** `YYYY-MM-DD` of the local calendar day `value` falls on. */
export function localDayOf(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The calendar day a timestamp falls on, in the reader's own time zone — the day
 * rule the server applies to `valid_until` versus `quoted_at`.
 */
export function dayOfTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return localDayOf(at);
}

/** `day` shifted by whole days, still `YYYY-MM-DD`. */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return localDayOf(new Date(year, month - 1, date + days));
}

/** The date a new quote opens on: two weeks of validity, the desk's default. */
export const DEFAULT_VALID_DAYS = 14;

export function defaultValidUntil(now: Date): string {
  return shiftDay(localDayOf(now), DEFAULT_VALID_DAYS);
}

/** The server's 400 rule, run before the request: a day before the quote's day. */
export function isBeforeQuoteDay(validUntil: string | null, quoteDay: string): boolean {
  if (!validUntil) return false;
  return validUntil < quoteDay;
}

// --- How an offer stands ----------------------------------------------------

/**
 * What the 有效期至 cell has to say:
 *
 *   - `none`    — no date on the row; nothing to compare.
 *   - `valid`   — the day has not passed, or the offer is already answered
 *                 (`accepted` / `rejected` keep their status; a closed deal
 *                 cannot "expire").
 *   - `expired` — the server marked the row `expired`, or an un-answered draft
 *                 whose day has passed. Both are dead offers.
 *   - `overdue` — 超期未回: still `sent`, and the day has passed. The offer was
 *                 made and nobody answered; this is the row that needs a call.
 */
export type QuoteValidity = "none" | "valid" | "expired" | "overdue";

export function quoteValidity(
  quote: Pick<BdQuote, "status" | "valid_until">,
  today: string,
): QuoteValidity {
  const day = quote.valid_until;
  if (!day) return "none";
  if (quote.status === "expired") return "expired";
  const passed = day < today;
  if (!passed) return "valid";
  if (quote.status === "sent") return "overdue";
  if (quote.status === "accepted" || quote.status === "rejected") return "valid";
  return "expired";
}

// --- List order and search --------------------------------------------------

/** The toolbar's two orders: newest first, or the nearest expiry first. */
export type QuotesSort = "created" | "valid_until";

export const QUOTES_SORTS: readonly QuotesSort[] = ["created", "valid_until"];

/**
 * The two orders the page offers.
 *
 * `created` is `created_at DESC` with the id as the tie-break, so two quotes
 * typed in the same minute never swap places between renders. `valid_until` is
 * ascending — the offer that dies first is the one to chase — and a row with no
 * date goes last: "no expiry" is not "expires immediately".
 */
export function sortQuotes(rows: readonly BdQuote[], sort: QuotesSort): BdQuote[] {
  const byCreated = (a: BdQuote, b: BdQuote) => {
    const diff = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  };
  const ordered = [...rows];
  if (sort === "created") return ordered.sort(byCreated);
  return ordered.sort((a, b) => {
    if (a.valid_until === b.valid_until) return byCreated(a, b);
    if (!a.valid_until) return 1;
    if (!b.valid_until) return -1;
    return a.valid_until < b.valid_until ? -1 : 1;
  });
}

/** The name of the creator a quote belongs to, or `null` when the ledger did not
 *  return them (the list endpoint carries `creator_id` only). */
export function creatorNameOf(
  quote: Pick<BdQuote, "creator_id">,
  names: ReadonlyMap<string, string>,
): string | null {
  return names.get(quote.creator_id) ?? null;
}

/**
 * The search box: a case-insensitive substring of the creator's name. A quote
 * whose creator the ledger did not return matches nothing but an empty query —
 * there is no name to match against, and matching the id instead would answer a
 * search the reader did not type.
 */
export function searchQuotes(
  rows: readonly BdQuote[],
  names: ReadonlyMap<string, string>,
  query: string,
): BdQuote[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return [...rows];
  return rows.filter((row) => {
    const name = creatorNameOf(row, names);
    return name !== null && name.toLocaleLowerCase().includes(needle);
  });
}

// --- The request ------------------------------------------------------------

/**
 * The sheet's fields, as typed: everything a quote carries except its creator.
 *
 * Kept apart from {@link QuoteForm} so the drawer can hold *one* object of fields
 * and replace it whole when the server answers `409 stale_write` with the row it
 * holds (`quoteFormValues`) — overwriting five separate states one by one is how
 * a refresh ends up showing half of each writer's edit.
 */
export interface QuoteFormValues {
  /** The 坑位费 field, as typed. */
  fee: string;
  currency: string;
  /** The 佣金率 field, 0–100. */
  percent: string;
  /** `YYYY-MM-DD`. */
  validUntil: string;
  note: string;
  lines: readonly QuoteLine[];
}

/** Everything the form holds, before it becomes a request. */
export interface QuoteForm extends QuoteFormValues {
  creatorId: string;
}

/** A stored row as the drawer's fields: the 409 refresh and the opening state. */
export function quoteFormValues(quote: BdQuote): QuoteFormValues {
  const stored = parseQuoteItems(quote.items);
  return {
    fee: quote.fee_amount == null ? "" : String(quote.fee_amount),
    currency: quote.currency,
    percent: quote.commission_rate == null ? "" : String(rateToPercent(quote.commission_rate)),
    validUntil: quote.valid_until ?? "",
    note: quote.note ?? "",
    lines: stored.length > 0 ? stored.map((item) => newLine(item)) : [newLine()],
  };
}

/** The drawer's fields for a quote that does not exist yet. */
export function newQuoteFormValues(now: Date): QuoteFormValues {
  return {
    fee: "",
    currency: "CNY",
    percent: "",
    validUntil: defaultValidUntil(now),
    note: "",
    lines: [newLine()],
  };
}

/**
 * The fields both writes share: 坑位费 (`null` when blank — pure commission),
 * the rate (`null` when blank), the currency, the day, the note and the lines.
 * `creator_id` is not one of them: it is create-only, and the server answers 400
 * for it on a PATCH.
 */
export interface QuoteFields {
  fee_amount: number | null;
  commission_rate: number | null;
  currency: string;
  valid_until: string | null;
  note: string | null;
  items: QuoteItem[];
}

export function quoteFields(form: QuoteFormValues): QuoteFields {
  const note = form.note.trim();
  return {
    fee_amount: parseAmount(form.fee),
    commission_rate: (() => {
      const percent = parsePercent(form.percent);
      return percent === null ? null : percentToRate(percent);
    })(),
    currency: form.currency,
    valid_until: form.validUntil || null,
    note: note === "" ? null : note,
    items: linesToItems(form.lines),
  };
}

/**
 * `POST /bd/quotes`. `quoted_at` is the moment the offer left: a `draft` has not
 * been sent, so it carries none (and the server's `valid_until >= quoted_at` rule
 * has nothing to compare until it is sent).
 */
export function createQuoteRequest(
  form: QuoteForm,
  status: Extract<BdQuoteStatus, "draft" | "sent">,
  now: Date,
): CreateBdQuoteRequest {
  return {
    creator_id: form.creatorId,
    status,
    quoted_at: status === "sent" ? now.toISOString() : null,
    ...quoteFields(form),
  };
}

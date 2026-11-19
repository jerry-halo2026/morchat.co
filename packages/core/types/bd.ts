/**
 * BD pipeline (docs/engineering/WORKBENCH-API.md §20,
 * docs/engineering/WORKBENCH-DATA-CONTRACT.md §3).
 *
 * ```
 * creator ── creator_activity   who talked to them, when, what came of it
 *         ── creator_quote      what we offered (坑位费 + 佣金率), and the answer
 *
 * creator_campaign               where a batch of creators came from
 *
 * crm_collab                     the collaboration itself — reused, not duplicated
 * ```
 *
 * **There is no `BdOrder` type and no `/bd/orders` route.** A collaboration is
 * `CrmCollab` (§20.1): one creator × one brief, already carrying stage, amounts,
 * commission and the issue it hangs off. The contract originally listed a fourth
 * table for it; two tables for the same fact is how this project ended up with
 * two definitions of gross margin once already, so the two facts `crm_collab` was
 * missing (`publish_url`, `settled_on`) are columns on it instead.
 *
 * Four rules the types encode:
 *
 *   - **`commission_rate` is a 0–1 ratio.** 20% is `0.2`; the server answers 400
 *     for `20`, and the display layer is the only place that multiplies by 100
 *     (contract §0 rule 1).
 *   - **NULL is a state, not a missing value.** An activity with no `outcome` is a
 *     note with no result yet (`no_reply` is a different fact), and a quote with
 *     no `quoted_at` has not been sent.
 *   - **`creator_id` is create-only.** A follow-up or a quote that changes person
 *     is a different record; `PATCH` answers 400 rather than moving somebody
 *     else's history.
 *   - **Every cockpit number is three-state.** `value: null` +
 *     `empty: "insufficient_data"` means "no rows to compute from", which is a
 *     different statement from a settled zero — the same rule the overview strip
 *     and the money block already follow (docs/METRICS.md §1 rule 3).
 */

/** How the conversation happened. */
export type BdActivityKind = "dm" | "call" | "meeting" | "email" | "note";

/**
 * What came of it. `null` on a row means "not recorded yet" — a note with no
 * result — and is deliberately not folded into `no_reply`.
 */
export type BdActivityOutcome = "no_reply" | "replied" | "declined" | "advanced";

/** Where an offer stands. Only a non-`draft` quote counts as "quoted". */
export type BdQuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

/** How a batch of creators was collected. */
export type BdCampaignKind = "search" | "comment" | "manual";

/** One follow-up with one creator. */
export interface BdActivity {
  id: string;
  workspace_id: string;
  creator_id: string;
  kind: BdActivityKind;
  /** When the conversation happened, not when the row was typed. */
  happened_at: string;
  /** What was said / learned. Never empty. */
  summary: string;
  /** `null` = a note with no result yet; not `no_reply`. */
  outcome: BdActivityOutcome | null;
  /** When to follow up again; `null` schedules nothing. */
  next_follow_at: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** One offer to one creator. */
export interface BdQuote {
  id: string;
  workspace_id: string;
  creator_id: string;
  /** The brief this offer answers; `null` when the quote predates the written brief. */
  brief_id: string | null;
  status: BdQuoteStatus;
  /** `null` on a draft: nothing was sent, so there is no offer date. */
  quoted_at: string | null;
  /** Calendar day `YYYY-MM-DD`; never before `quoted_at`'s day (server 400). */
  valid_until: string | null;
  /** 坑位费. `null` when the deal is pure commission. */
  fee_amount: number | null;
  /** 0–1: 20% is 0.2. */
  commission_rate: number | null;
  currency: string;
  /** Line-item breakdown; `[]` means "no breakdown yet", never null. */
  items: unknown[];
  note: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** One collection batch. */
export interface BdCampaign {
  id: string;
  workspace_id: string;
  name: string;
  kind: BdCampaignKind;
  budget_amount: number | null;
  currency: string;
  started_on: string | null;
  ended_on: string | null;
  source_keyword: string | null;
  /** Cached size of the batch; `0` for a batch nobody has attached creators to. */
  creator_count: number;
  note: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BdActivityListResponse {
  activities: BdActivity[];
  /** This page's row count, not the workspace total. */
  total: number;
}

export interface BdQuoteListResponse {
  quotes: BdQuote[];
  total: number;
}

export interface BdCampaignListResponse {
  campaigns: BdCampaign[];
  total: number;
}

export interface BdActivityListFilters {
  creator_id?: string;
  kind?: BdActivityKind | string;
  /** Inclusive `happened_at` window, RFC 3339 or `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  limit?: number;
}

export interface BdQuoteListFilters {
  creator_id?: string;
  status?: BdQuoteStatus | string;
  limit?: number;
}

export interface BdCampaignListFilters {
  kind?: BdCampaignKind | string;
  limit?: number;
}

/**
 * `POST /bd/activities`. `creator_id`, `kind`, `happened_at` and `summary` are
 * required; `outcome` and `next_follow_at` are optional because a note has no
 * result and schedules nothing.
 */
export interface CreateBdActivityRequest {
  creator_id: string;
  kind: BdActivityKind;
  happened_at: string;
  summary: string;
  outcome?: BdActivityOutcome | null;
  next_follow_at?: string | null;
  owner_member_id?: string;
}

/** `PATCH /bd/activities/{id}` — `creator_id` is absent: the server 400s it. */
export interface UpdateBdActivityRequest {
  kind?: BdActivityKind;
  happened_at?: string;
  summary?: string;
  /** `null` clears the result, turning the row back into a note. */
  outcome?: BdActivityOutcome | null;
  /** `null` clears the scheduled follow-up. */
  next_follow_at?: string | null;
  owner_member_id?: string | null;
}

/** `POST /bd/quotes`. A quote defaults to `status: "draft"` and currency CNY. */
export interface CreateBdQuoteRequest {
  creator_id: string;
  brief_id?: string | null;
  status?: BdQuoteStatus;
  quoted_at?: string | null;
  valid_until?: string | null;
  fee_amount?: number | null;
  /** 0–1; the server 400s anything outside it. */
  commission_rate?: number | null;
  currency?: string;
  items?: unknown[];
  note?: string | null;
  owner_member_id?: string;
}

/** `PATCH /bd/quotes/{id}` — `creator_id` is absent: the server 400s it. */
export interface UpdateBdQuoteRequest {
  brief_id?: string | null;
  status?: BdQuoteStatus;
  quoted_at?: string | null;
  valid_until?: string | null;
  fee_amount?: number | null;
  commission_rate?: number | null;
  currency?: string;
  items?: unknown[];
  note?: string | null;
  owner_member_id?: string | null;
}

/** `POST /bd/campaigns`. `name` is required and unique per workspace (409). */
export interface CreateBdCampaignRequest {
  name: string;
  kind?: BdCampaignKind;
  budget_amount?: number | null;
  currency?: string;
  started_on?: string | null;
  ended_on?: string | null;
  source_keyword?: string | null;
  creator_count?: number;
  note?: string | null;
  owner_member_id?: string;
}

export interface UpdateBdCampaignRequest {
  name?: string;
  kind?: BdCampaignKind;
  budget_amount?: number | null;
  currency?: string;
  started_on?: string | null;
  ended_on?: string | null;
  source_keyword?: string | null;
  creator_count?: number;
  note?: string | null;
  owner_member_id?: string | null;
}

// --- Cockpit (`GET /api/workbench/bd/pipeline`) -----------------------------
//
// One request, four blocks. Counter and amount carry the same three states the
// overview strip uses, so a surface can draw a gap without inventing a zero.

/** Which contract outcome a number's `empty` names. */
export type BdPipelineEmptyState = "zero" | "insufficient_data";

/**
 * One cockpit number. `value: null` means "not measurable from the rows that
 * exist"; `sample_count` is how many rows were behind it (`0` when null).
 */
export interface BdPipelineNumber {
  value: number | null;
  sample_count: number;
  empty: BdPipelineEmptyState;
}

/**
 * An amount plus its currency. `amount: null` with `empty: "insufficient_data"`
 * means nothing was summed — not that the total is 0. `currency` is present even
 * then, so the figure can be labelled while it is empty.
 */
export interface BdPipelineMoney {
  amount: number | null;
  currency: string;
  sample_count: number;
  empty: BdPipelineEmptyState;
}

export interface BdPipelineCreatorsBlock {
  /** Live creators in the workspace. */
  total: BdPipelineNumber;
  /** Creators with a follow-up that has a non-null outcome. */
  contacted: BdPipelineNumber;
  /** Creators any of whose follow-ups went forward (`replied` / `advanced`). */
  replied: BdPipelineNumber;
  /** Creators with a quote that left `draft`. */
  quoted: BdPipelineNumber;
  /** `creator.cooperation_intent = 'signed'`. */
  signed: BdPipelineNumber;
  /** `creator.cooperation_intent = 'deal'`. */
  deal: BdPipelineNumber;
}

export interface BdPipelineQuotesBlock {
  /** `sent` — an answer is outstanding. */
  open: BdPipelineNumber;
  accepted: BdPipelineNumber;
  rejected: BdPipelineNumber;
  /** Σ 坑位费 of the workspace's dominant currency. */
  total_fee: BdPipelineMoney;
}

export interface BdPipelineOrdersBlock {
  /**
   * Started and not settled: every `crm_collab` stage except inquiry / quoted /
   * negotiating / settled / cancelled. `published` and `accepted` are inside it —
   * the money has not cleared yet.
   */
  open: BdPipelineNumber;
  /** Live (`published`) or accepted (`accepted`). Overlaps `open` on purpose. */
  delivered: BdPipelineNumber;
  /** `stage = 'settled'`. */
  settled: BdPipelineNumber;
  total_amount: BdPipelineMoney;
  /** Σ settled money that actually cleared (`paid_at` is set). */
  paid_amount: BdPipelineMoney;
}

export interface BdPipelineFollowupsBlock {
  /** Newest follow-up's `next_follow_at` falls on today. */
  due_today: BdPipelineNumber;
  /** Newest follow-up's `next_follow_at` is already past. */
  overdue: BdPipelineNumber;
}

export interface BdPipeline {
  creators: BdPipelineCreatorsBlock;
  quotes: BdPipelineQuotesBlock;
  orders: BdPipelineOrdersBlock;
  followups: BdPipelineFollowupsBlock;
}

// --- Performance over a range (`GET /api/workbench/bd/performance`) ---------
//
// §22. Where the cockpit answers "where do the ledgers stand today", this answers
// "what did the window produce": every fact buckets by its own date (a
// collaboration is signed on `confirmed_at` and delivered on `published_at`), so
// the same collaboration can appear in two blocks with two amounts. That is the
// report, not double counting.
//
// Three rules the types encode:
//
//   - **One currency per response.** `currency` names the currency every amount
//     is in (the window's dominant one); rows in another currency are excluded from
//     the counts too, so a count and the money beside it describe the same rows.
//   - **Money with no rows is null.** `amount: null` + `empty: "insufficient_data"`
//     — never a confident 0.00. Counts are always numbers.
//   - **`empty` is the window's own state**: `zero` when the interval holds at
//     least one fact, `insufficient_data` when it holds none.

/** The fact set one bucket (a member, a month, the whole window) carries. */
export interface BdPerformanceTotals {
  signed_count: number;
  /** Σ `final_amount` of the collaborations confirmed in the bucket; null when none. */
  signed_amount: number | null;
  /** Collaborations published in the bucket. */
  delivered_count: number;
  /** Settlements whose `paid_at` falls in the bucket. */
  collected_count: number;
  /** Σ settlement money that actually moved in the bucket; null when none. */
  collected_amount: number | null;
  /** Offers sent in the bucket (`status <> 'draft'`). */
  quote_sent: number;
  quote_accepted: number;
  /** Σ 坑位费 of the offers *sent* in the bucket; null when none. */
  quote_amount: number | null;
  followups: number;
  replied: number;
  meetings: number;
}

export interface BdPerformanceMemberRow extends BdPerformanceTotals {
  member_id: string;
  /** Display name; empty when the member row is gone (the id is the identity). */
  name: string;
  /** `quote_accepted / quote_sent` on the 0–1 scale; null when nothing was sent. */
  win_rate: number | null;
}

export interface BdPerformanceMonthRow extends BdPerformanceTotals {
  /** `YYYY-MM`, in the session's time zone (UTC in production). */
  month: string;
  win_rate: number | null;
}

export interface BdPerformanceSignedBlock {
  count: BdPipelineNumber;
  amount: BdPipelineMoney;
}

/** A count + amount pair: 交付 and 回款. */
export interface BdPerformanceVolumeBlock {
  count: BdPipelineNumber;
  amount: BdPipelineMoney;
}

export interface BdPerformanceQuotesBlock {
  sent: BdPipelineNumber;
  accepted: BdPipelineNumber;
  /** `accepted / sent` (0–1); null when the window holds no sent offer. */
  win_rate: BdPipelineNumber;
  /** Σ 坑位费 of the sent offers. */
  amount: BdPipelineMoney;
}

export interface BdPerformanceFollowupsBlock {
  /** Follow-ups logged in the window (条数). */
  count: BdPipelineNumber;
  /** Their `outcome` is `replied` / `advanced`. */
  replied: BdPipelineNumber;
  /** Their `kind` is `meeting`. */
  meetings: BdPipelineNumber;
}

/**
 * 精选联盟 commission, split by who received it: `agency` landed in our 机构号,
 * `creator` was paid by the platform straight to the 达人. Adding the two would
 * count the business twice. `settled` is the part whose `paid_at` falls inside the
 * window — money that arrived, not money a statement promised.
 */
export interface BdPerformanceAffiliateBlock {
  agency: BdPipelineMoney;
  creator: BdPipelineMoney;
  settled: BdPipelineMoney;
}

export interface BdPerformance {
  /** The window actually used, after the server applied its defaults. */
  from: string;
  to: string;
  /** The one currency every amount is in (the window's dominant one). */
  currency: string;
  /** The window's own state: `zero` with facts, `insufficient_data` without. */
  empty: BdPipelineEmptyState;
  signed: BdPerformanceSignedBlock;
  delivered: BdPerformanceVolumeBlock;
  collected: BdPerformanceVolumeBlock;
  quotes: BdPerformanceQuotesBlock;
  followups: BdPerformanceFollowupsBlock;
  affiliate: BdPerformanceAffiliateBlock;
  /** One row per member with facts in the window, most signed first. */
  by_member: BdPerformanceMemberRow[];
  /** One row per month present in the window, oldest first. */
  by_month: BdPerformanceMonthRow[];
}

export interface BdPerformanceFilters {
  /** Inclusive `YYYY-MM-DD`; defaults to the first of the month `to` falls in. */
  from?: string;
  /** Inclusive `YYYY-MM-DD`; defaults to today. */
  to?: string;
}

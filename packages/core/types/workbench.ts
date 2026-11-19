/**
 * Workbench wire types (docs/engineering/WORKBENCH-API.md 搂2 and 搂10).
 *
 * B0's seven ledger tables 鈥?creators (the supply side), their posts and per-day
 * post snapshots (the evidence side), and the four CRM ledgers (client 鈫?brief 鈫?
 * collab 鈫?settlement) 鈥?plus B1's five HR records (job 鈫?candidate 鈫?interview
 * 鈫?scorecard, and the employee profile a hire creates). Every field here is
 * what the server puts on the wire, snake_case and flat; nothing is denormalized,
 * because the ledger screens read rows and resolve labels at render time.
 *
 * Money is `number`, not a string: the server converts `NUMERIC(14,2)` columns
 * to JSON numbers, and `currency` travels next to it so the UI never guesses.
 *
 * The string-literal enum types below are what the current migration allows.
 * Schemas stay lenient (`z.string()`) so a server that adds a stage or a source
 * still parses: an unknown value must degrade to a default case in the UI, never
 * blank the whole ledger row.
 */

// The overwrite attribution (§26.3) belongs to the review module — it is the
// review gate's vocabulary, not the ledgers' — but a PATCH's body carries it, so
// the request types name it from there. One-way import: `review.ts` knows nothing
// about a collaboration.
import type { OverwriteReason } from "./review";

export type CreatorKind = "owned" | "external";

/** Where a post row came from. `manual` is the only writer today. */
export type CreatorPostSource = "manual" | "csv" | "api";

export type CrmBriefDeliverableType = "short_video" | "post" | "live";

export type CrmBriefStatus = "draft" | "open" | "matching" | "closed";

export type CrmCollabStage =
  | "inquiry"
  | "quoted"
  | "negotiating"
  | "confirmed"
  | "sampling"
  | "script_review"
  | "scheduled"
  | "published"
  | "accepted"
  | "settled"
  | "cancelled";

export type CrmSettlementMode = "flat" | "cps" | "cpa" | "barter";

export type CrmSettlementKind = "prepay" | "final" | "platform_fee" | "tax";

export interface Creator {
  id: string;
  workspace_id: string;
  /** `owned` = an account this workspace runs; `external` = a partner. */
  kind: CreatorKind;
  display_name: string;
  platform: string;
  handle: string;
  url: string | null;
  fans: number;
  fans_d7: number;
  avg_play: number;
  /**
   * Content health: (average likes + comments + shares) / followers, 0鈥?
   * (docs/METRICS.md C3), on the *latest snapshot* when the row came from the
   * list endpoint 鈥?the ledger's 浜掑姩鐜?column. `GET /creators/{id}` still
   * reports the legacy manually entered `creator.engagement_rate` column.
   *
   * Never clamped: 45.03 (= 4503 %) is real upstream data and means the follower
   * count disagrees with the works. Null means "not computable", not 0.
   */
  engagement_rate: number | null;
  category: string | null;
  audience_note: string | null;
  region: string | null;
  price_note: string | null;
  /** Manual 1鈥? rating; null until someone sets one. */
  score: number | null;
  risk_flag: boolean;
  blacklist_reason: string | null;
  /** The member who owns this relationship. `member` role may edit only these. */
  owner_member_id: string | null;
  /** Bridge to the media/IP project, when one was created for this creator. */
  media_ip_project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;

  /**
   * Mirrored from the orange 杈句汉 database (docs/engineering/ORANGE-SYNC.md).
   *
   * These are upstream-owned: a sync rewrites them, so a local edit is lost.
   * `sec_uid` doubles as the mirror identity 鈥?`source_system` + `source_id`
   * name the upstream row, and both are null on a creator someone typed in.
   */
  sec_uid: string | null;
  douyin_id: string | null;
  dy_uid: string | null;
  /** Upstream display follower count verbatim ("2.6涓?), next to the parsed `fans`. */
  fans_display: string | null;
  quote_min: number | null;
  quote_max: number | null;
  /** orange outreach stage, verbatim Chinese (鏈帴瑙?鈥?宸叉垚鍗?/ 宸茬绾?/ 鎺掗櫎). */
  cooperation_intent: string | null;
  /** orange funnel state: LEAD_NEW | LEAD_CONTACTED | LEAD_DEAL | LEAD_REJECT. */
  lead_status: string | null;
  last_dm_at: string | null;
  likes_total: number | null;
  following_count: number | null;
  verify_type: string | null;
  tags: CreatorTag[];
  source_type: string | null;
  source_keyword: string | null;
  source_rank: number | null;
  source_system: string | null;
  source_id: string | null;

  /**
   * The rest of the newest snapshot (WORKBENCH-DATA-CONTRACT 搂2.3), joined onto
   * the list response only. Optional so a `GET /creators/{id}` row 鈥?and every
   * fixture written before the ledger carried health 鈥?still parses; every one
   * of them is null for a creator nobody has sampled yet.
   */
  hit_rate?: number | null;
  posts_last_30d?: number | null;
  videos_with_stats?: number | null;
  /** Calendar day `YYYY-MM-DD` of the joined snapshot. */
  metric_captured_on?: string | null;
}

/**
 * One upstream creator tag, copied verbatim from orange's `tags` jsonb array.
 * The vocabulary is orange's: renaming a tag there rewrites it here on the next
 * sync, so nothing should key off the name.
 */
export interface CreatorTag {
  id: string;
  name: string;
  color: string | null;
}

export interface CreatorPost {
  id: string;
  workspace_id: string;
  creator_id: string;
  collab_id: string | null;
  content_issue_id: string | null;
  /**
   * The affiliate product this post promoted, when it ran a 灏忛粍杞?
   * (docs/engineering/WORKBENCH-API.md 搂11). Null for a post that was not a
   * product placement, and for rows imported before the column existed.
   */
  product_id: string | null;
  /** The pick (product 脳 creator plan) the post belongs to, when known. */
  pick_id: string | null;
  /**
   * The script version this post was published from (migration 733,
   * docs/engineering/WORKBENCH-API.md 搂12). Null for a post that ran no plan,
   * and for rows published before the link existed.
   */
  media_script_id: string | null;
  platform: string;
  title: string | null;
  url: string;
  /** ISO timestamp; a post without a publish time has nothing to report. */
  published_at: string;
  source: CreatorPostSource;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * One day's snapshot of one post. `(post_id, captured_on)` is unique, so the
 * write endpoint upserts. Every measure is nullable: a platform that only
 * reports likes must not look like it reported zero plays.
 */
export interface CreatorPostMetric {
  id: string;
  workspace_id: string;
  post_id: string;
  /** Calendar day `YYYY-MM-DD`. */
  captured_on: string;
  play: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  converts: number | null;
  gmv_amount: number | null;
  currency: string;
  source: string;
  created_at: string;
  updated_at: string;
}

/**
 * One 鎶栭煶 work, mirrored from the orange 杈句汉 database
 * (docs/engineering/WORKBENCH-DATA-CONTRACT.md 搂2.1). One row per aweme.
 *
 * The three counters are nullable, and NULL means "not collected yet" 鈥?not 0.
 * 8612 of the 12449 mirrored works sit in that state, so a UI that treats NULL as
 * zero would invent engagement for two thirds of the library.
 *
 * `play_count` is nullable for the same reason: roughly a quarter of the mirrored
 * rows carry a value, and a missing one is missing rather than zero.
 */
export interface CreatorVideo {
  id: string;
  workspace_id: string;
  creator_id: string;
  aweme_id: string;
  desc_text: string | null;
  /** Parsed from `desc_text` (`#璇濋`), de-duplicated, in first-seen order. */
  topics: string[];
  /** Publish time; null on works whose publish date was never captured. */
  create_time: string | null;
  duration_ms: number | null;
  digg_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  /** Plays, when the platform reported them. Null is "not collected". */
  play_count: number | null;
  cover_url: string | null;
  video_url: string | null;
  /** When the three counters were read off the platform. */
  stats_collected_at: string | null;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * Why a snapshot has no value. `no_stats` = not one work carries a likes count;
 * `sample_below_10` = too few sampled works for a hit rate; `no_followers` = no
 * follower count to divide by. Null when every metric was computable.
 */
export type CreatorMetricSampleNote = "no_stats" | "sample_below_10" | "no_followers";

/**
 * One day's content health for one creator (WORKBENCH-DATA-CONTRACT 搂2.2/搂2.3).
 *
 * `engagement_rate` and `hit_rate` are stored on the 0鈥? scale and are NOT
 * clamped: the live data contains 45.03 (= 4503 %), which means that creator's
 * follower count disagrees with their works. A reader should see the flag, so the
 * UI multiplies by 100 for display and leaves the value alone.
 */
export interface CreatorMetric {
  id: string;
  workspace_id: string;
  creator_id: string;
  /** Calendar day `YYYY-MM-DD`. */
  captured_on: string;
  video_count: number | null;
  /** Works whose likes count was collected 鈥?the sample behind every metric. */
  videos_with_stats: number | null;
  posts_last_30d: number | null;
  avg_digg: number | null;
  avg_comment: number | null;
  avg_share: number | null;
  engagement_rate: number | null;
  hit_rate: number | null;
  /** Null when every metric was computable. */
  sample_note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One row of the health board: a creator and its latest snapshot, flattened.
 *
 * The snapshot fields are null for a creator that has never been sampled, and
 * such a creator is still in the list 鈥?"no data yet" is a state the reader has
 * to be able to see.
 */
export interface CreatorHealth {
  id: string;
  display_name: string;
  fans: number;
  engagement_rate: number | null;
  hit_rate: number | null;
  posts_last_30d: number | null;
  videos_with_stats: number | null;
  /** The day the snapshot is from; null when there is no snapshot. */
  captured_on: string | null;
}

/** A paying client. Creators and clients are different actors (METRICS.md C6). */
export interface CrmClient {  id: string;
  workspace_id: string;
  name: string;
  brand: string | null;
  industry: string | null;
  contact_name: string | null;
  contact_channel: string | null;
  contract_entity: string | null;
  payment_terms: string | null;
  credit_note: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/** A client's request: what to deliver, for how much, by when. */
export interface CrmBrief {
  id: string;
  workspace_id: string;
  client_id: string;
  title: string;
  category: string | null;
  budget_min_amount: number | null;
  budget_max_amount: number | null;
  target_audience: string | null;
  deliverable_type: CrmBriefDeliverableType | null;
  platforms: string[];
  /** Calendar days `YYYY-MM-DD`. */
  schedule_from: string | null;
  schedule_to: string | null;
  kpi_play: number | null;
  kpi_gmv_amount: number | null;
  status: CrmBriefStatus;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * Who is doing a workbench row (docs/engineering/COLLAB-MODEL.md §1, migration
 * 821). `member` is a human seat, `agent` is an agent; it is **not** the owner —
 * `owner_member_id` is always a human and answers "who is accountable for the
 * deal", not "who is on it".
 */
export type WorkbenchAssigneeType = "member" | "agent";

/**
 * The newest audit event about one ledger row, folded into the row a GET
 * returns (COLLAB-MODEL §2). `action` is the dot-separated verb the trail uses
 * (`crm_collab.stage_changed`), `type` is `member | agent | system`, and `at` is
 * when it happened — not when the row was last written, which a note edit moves.
 */
export interface WorkbenchLastActor {
  type: string;
  id: string | null;
  action: string;
  at: string;
}

/**
 * A ledger row's discussion (COLLAB-MODEL §5). The discussion is an issue —
 * `POST /api/workbench/{ledger}/{id}/thread` mints it once and answers the same one
 * afterwards — and this is what a list row knows about it: how big it is, what the
 * newest line says, and whether it is still there.
 *
 * `state: "gone"` is the one case a reader must not turn into a 404: the issue was
 * deleted and the ledger row still points at it. The row is still a row (its money,
 * its stage), so the screen says 讨论已归档 and keeps going.
 */
export interface WorkbenchThread {
  issue_id: string;
  number: number;
  title: string;
  status: string;
  state: "linked" | "gone";
  comment_count: number;
  last_comment_at: string | null;
  last_comment_preview: string | null;
}

/** One brief matched to one creator, with its own funnel position and money. */
export interface CrmCollab {
  id: string;
  workspace_id: string;
  brief_id: string;
  creator_id: string;
  stage: CrmCollabStage;
  quote_amount: number | null;
  final_amount: number | null;
  /** 0鈥? success probability; null means "use the stage default". */
  prob: number | null;
  creator_fee: number | null;
  sample_cost: number | null;
  platform_fee: number | null;
  currency: string;
  settlement_mode: CrmSettlementMode | null;
  commission_rate: number | null;
  sample_required: boolean;
  script_required: boolean;
  scheduled_at: string | null;
  confirmed_at: string | null;
  published_at: string | null;
  accepted_at: string | null;
  issue_id: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /**
   * Where the collaboration went live (WORKBENCH-API 搂20.2, migration 810).
   * `null` until something was published 鈥?`published_at` says when, this says
   * where.
   */
  publish_url: string | null;
  /**
   * Calendar day (`YYYY-MM-DD`) the collaboration was settled. `null` while
   * unpaid; the individual money movements live in `CrmSettlement`.
   */
  settled_on: string | null;
  /**
   * Who is doing the work (a member or an agent); `null` = unassigned. Optional
   * because a server that predates migration 821 omits the pair — absence means
   * the same thing the column's NULL does, not "unknown".
   */
  assignee_type?: WorkbenchAssigneeType | null;
  assignee_id?: string | null;
  /**
   * Optimistic-concurrency counter: bumped on every write. A PATCH that names a
   * different `expected_revision` answers `409 stale_write` with the current row
   * instead of overwriting it. Absent on a pre-821 server, where every write is
   * unguarded.
   */
  revision?: number;
  /** The newest audit event about this row; absent before its first audited write. */
  last_actor?: WorkbenchLastActor | null;
  /**
   * This collaboration's discussion, when it has one. Absent on a server that
   * predates B4-3, and `null` on a row nobody has opened a thread on.
   */
  thread?: WorkbenchThread | null;
}

/** One money movement against a collab. `paid_at` null = still owed. */
export interface CrmSettlement {
  id: string;
  workspace_id: string;
  collab_id: string;
  kind: CrmSettlementKind;
  amount: number;
  currency: string;
  due_at: string | null;
  paid_at: string | null;
  invoice_no: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /**
   * Who is chasing the money. A settlement has no owner column of its own — its
   * owner is the collaboration's — so this pair is the only "whose is this" it
   * carries. Optional for the same reason as `CrmCollab.assignee_type`.
   */
  assignee_type?: WorkbenchAssigneeType | null;
  assignee_id?: string | null;
  /** See `CrmCollab.revision`. */
  revision?: number;
  last_actor?: WorkbenchLastActor | null;
}

/** Sidebar counts. `collabs_open` excludes settled/cancelled, matching the
 *  pipeline metric's stage filter; `settlements_pending` is unpaid rows. */
export interface WorkbenchCountsResponse {
  creators: number;
  clients: number;
  briefs: number;
  collabs_open: number;
  settlements_pending: number;
  /**
   * Recruiting ledgers. Optional because a server that predates B1 omits them,
   * and a missing count must render as "no number yet" rather than a confident
   * zero 鈥?the same rule `emptyRule` applies to metrics.
   */
  jobs?: number;
  candidates?: number;
  interviews?: number;
  employees?: number;
}

// --- Money block (`GET /api/workbench/finance`) ----------------------------
//
// Five figures for one calendar month over the ledgers above, plus the month
// entry that supplies the two inputs the ledgers cannot (migration 707)
// (docs/engineering/WORKBENCH-API.md 搂3, docs/METRICS.md 搂2). Each figure travels
// in the same three-state shape the metric strip uses, so the client renders "not
// measurable" the same way on both surfaces: `value: null` says the rows behind
// the figure are missing, which is a different statement from a zero
// (docs/METRICS.md 搂1 rule 3). The two figures with a cost side also say which
// cost set they used, so a hint can name it instead of implying one.

/** Which contract outcome a block's `empty` names. */
export type WorkbenchFinanceEmptyState = "zero" | "insufficient_data";

/**
 * Which cost side a money figure was computed against.
 *
 * `entered` 鈥?the month's own entry (`ops_finance_month`, migration 707) carries
 * the cost; `settled_collabs` 鈥?no entry, so the fees of the collaborations
 * settled this month are the fallback; `none` 鈥?neither exists, so the figure has
 * no cost side at all and the client says so instead of naming a number.
 */
export type WorkbenchFinanceCostBasis = "entered" | "settled_collabs" | "none";

export interface WorkbenchFinanceBlock {
  value: number | null;
  /**
   * Rows the figure was computed from (for a ratio: the denominator). `0` next to
   * `value: 0` is a true zero 鈥?no money moved 鈥?not a missing measurement.
   */
  sample_count: number;
  empty: WorkbenchFinanceEmptyState;
}

/** A figure with a cost side: the metric entry plus the cost set behind it. */
export interface WorkbenchFinanceCostBlock extends WorkbenchFinanceBlock {
  basis: WorkbenchFinanceCostBasis;
}

export interface WorkbenchFinanceResponse {
  /**
   * The calendar month every figure describes, `YYYY-MM`, and the unit they are
   * in: the window's dominant currency (`bd/performance` applies the same rule,
   * because adding CNY to USD produces a number in neither). `currency` is
   * optional so hand-built fixtures stay valid; the server always sends it and
   * the schema defaults it to `CNY`.
   */
  window: { month: string; currency?: string };
  /** Contract value confirmed this month, in `window.currency`. Renewals included (C10). */
  signed: WorkbenchFinanceBlock;
  /** Settlement money that actually cleared this month, in `window.currency`. */
  collected: WorkbenchFinanceBlock;
  /**
   * (collected 鈭?cost) / collected at the 0鈥? storage scale (C3); the UI
   * multiplies by 100. Null until both sides of the division exist 鈥?`basis` says
   * which cost side was used.
   */
  gross_margin: WorkbenchFinanceCostBlock;
  /** Mean age, in days, of the settlements still unpaid. */
  receivable_days: WorkbenchFinanceBlock;
  /**
   * Opening cash + collected 鈭?the month's cost, in `window.currency`. Null until
   * the month has an opening balance, which no ledger row can supply.
   */
  cash_floor: WorkbenchFinanceCostBlock;
}

export interface WorkbenchFinanceFilters {
  /** Aggregate dimension only; never an access boundary (搂3). */
  department_id?: string | null;
  /**
   * The calendar month (`YYYY-MM`) to aggregate; omitted means the current
   * month. A month with no rows answers `insufficient_data`, never 0.
   */
  month?: string;
}

/**
 * One month's own money entry (`ops_finance_month`, migration 707): the inputs
 * the money block cannot derive from the ledgers. A null amount is "not
 * recorded", which the UI renders as `鈥擿, never as 0.
 */
export interface WorkbenchFinanceMonth {
  id: string;
  workspace_id: string;
  /** The month as its first day, `YYYY-MM-DD` (C7: a date, never a label). */
  month: string;
  cash_open: number | null;
  fixed_cost: number | null;
  variable_cost: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** `GET /api/workbench/finance/months` 鈥?every entered month, newest first. */
export interface WorkbenchFinanceMonthListResponse {
  months: WorkbenchFinanceMonth[];
  total: number;
}

/**
 * `PUT /api/workbench/finance/months`. PUT replaces the month, so an omitted
 * amount is stored as "not recorded" rather than merged with the previous write.
 */
export interface UpsertWorkbenchFinanceMonthRequest {
  /** `YYYY-MM-DD`, the first day of the month. */
  month: string;
  cash_open?: number | null;
  fixed_cost?: number | null;
  variable_cost?: number | null;
  note?: string | null;
}

// --- List envelopes -------------------------------------------------------
// Lists page from the server, so every envelope carries `total` (the count the
// current filters match, not the page length). Creator lists page by cursor and
// carry the next one; the other ledgers page by limit today.

export interface CreatorListResponse {
  creators: Creator[];
  total: number;
  next_cursor: string | null;
}

export interface CreatorPostListResponse {
  posts: CreatorPost[];
  total: number;
}

export interface CreatorPostMetricListResponse {
  metrics: CreatorPostMetric[];
  total: number;
}

/** The health board. `total` is this page's row count, like the creator list. */
export interface CreatorHealthListResponse {
  creators: CreatorHealth[];
  total: number;
  next_cursor: string | null;
}

/** One creator's health: the newest snapshot plus the 30-day trend. */
export interface CreatorHealthDetailResponse {
  creator_id: string;
  latest: CreatorMetric | null;
  recent: CreatorMetric[];
}

export interface CrmClientListResponse {
  clients: CrmClient[];
  total: number;
}

export interface CrmBriefListResponse {
  briefs: CrmBrief[];
  total: number;
}

export interface CrmCollabListResponse {
  collabs: CrmCollab[];
  total: number;
}

export interface CrmSettlementListResponse {
  settlements: CrmSettlement[];
  total: number;
}

// --- Filters --------------------------------------------------------------
// Filter objects are what query keys carry, so they stay plain and small; the
// list endpoints ignore keys they do not know.

export interface CreatorListFilters {
  kind?: CreatorKind;
  /** Server-side text match over display name / handle. */
  q?: string;
  limit?: number;
  cursor?: string;
  /**
   * The ledger's ordering (WORKBENCH-API 搂3). `fans` is the default; the three
   * content sorts put creators with no snapshot last. Everything is descending,
   * with followers as the second key, so the order is total.
   */
  sort?: CreatorListSort;
  /** Aggregate dimension only; never an access boundary. */
  department_id?: string | null;
}

/**
 * The creator ledger's `?sort=` values. `fans` is the opening order: the only
 * ranking that means something before any work has been sampled. `recent` is
 * works posted in the last 30 days.
 */
export type CreatorListSort = "fans" | "engagement" | "hit" | "recent";

export interface CreatorVideoListResponse {
  videos: CreatorVideo[];
  total: number;
}

export interface CreatorPostListFilters {
  creator_id?: string;
  /** Inclusive calendar day `YYYY-MM-DD`. */
  from?: string;
  to?: string;
}

/**
 * The health board's ordering. `fans` (the default) is the only ranking that
 * means something before any content has been sampled; the two metric sorts put
 * creators with no snapshot last.
 */
export type CreatorHealthSort = "fans" | "engagement" | "hit";

export interface CreatorHealthListFilters {
  sort?: CreatorHealthSort;
  limit?: number;
  cursor?: string;
}

export interface CrmClientListFilters {
  q?: string;
}

export interface CrmBriefListFilters {
  status?: CrmBriefStatus;
  client_id?: string;
}

export interface CrmCollabListFilters {
  stage?: CrmCollabStage;
  brief_id?: string;
  creator_id?: string;
  /**
   * `?assignee=` (COLLAB-MODEL §4): `me` for the caller's own queue — resolved by
   * the server against the *actor*, which may be an agent — or a member/agent id.
   * A member id and an agent id are both uuids, so a concrete id filters on the id
   * alone; `me` is the only form that also fixes the type.
   */
  assignee?: string;
}

export interface CrmSettlementListFilters {
  collab_id?: string;
  /** `true` = only paid rows, `false` = only unpaid. */
  paid?: boolean;
  /** See `CrmCollabListFilters.assignee`. */
  assignee?: string;
}

// --- Write requests -------------------------------------------------------
// Create takes the fields the server requires; update is a partial of everything
// writable, and `null` clears a nullable column.

export type CreateCreatorRequest = Pick<
  Creator,
  "kind" | "display_name" | "platform" | "handle"
> &
  Partial<
    Pick<
      Creator,
      | "url"
      | "fans"
      | "fans_d7"
      | "avg_play"
      | "engagement_rate"
      | "category"
      | "audience_note"
      | "region"
      | "price_note"
      | "score"
      | "risk_flag"
      | "blacklist_reason"
      | "owner_member_id"
      | "media_ip_project_id"
    >
  >;

export type UpdateCreatorRequest = Partial<
  Pick<
    Creator,
    | "kind"
    | "display_name"
    | "platform"
    | "handle"
    | "url"
    | "fans"
    | "fans_d7"
    | "avg_play"
    | "engagement_rate"
    | "category"
    | "audience_note"
    | "region"
    | "price_note"
    | "score"
    | "risk_flag"
    | "blacklist_reason"
    | "owner_member_id"
    | "media_ip_project_id"
  >
>;

export type CreateCreatorPostRequest = Pick<
  CreatorPost,
  "creator_id" | "platform" | "url" | "published_at"
> &
  Partial<
    Pick<
    CreatorPost,
    | "collab_id"
    | "content_issue_id"
    | "title"
    | "source"
    | "product_id"
    | "pick_id"
    | "media_script_id"
  >
  >;

export type UpdateCreatorPostRequest = Partial<
  Pick<
    CreatorPost,
    | "collab_id"
    | "content_issue_id"
    | "platform"
    | "title"
    | "url"
    | "published_at"
    | "source"
    | "product_id"
    | "pick_id"
  >
>;

/** Upsert keyed by `(post_id, captured_on)`: the day is part of the body. */
export type UpsertCreatorPostMetricRequest = Pick<CreatorPostMetric, "captured_on"> &
  Partial<
    Pick<
      CreatorPostMetric,
      | "play"
      | "likes"
      | "comments"
      | "shares"
      | "clicks"
      | "converts"
      | "gmv_amount"
      | "currency"
      | "source"
    >
  >;

export type CreateCrmClientRequest = Pick<CrmClient, "name"> &
  Partial<
    Pick<
      CrmClient,
      | "brand"
      | "industry"
      | "contact_name"
      | "contact_channel"
      | "contract_entity"
      | "payment_terms"
      | "credit_note"
      | "owner_member_id"
    >
  >;

export type UpdateCrmClientRequest = Partial<
  Pick<
    CrmClient,
    | "name"
    | "brand"
    | "industry"
    | "contact_name"
    | "contact_channel"
    | "contract_entity"
    | "payment_terms"
    | "credit_note"
    | "owner_member_id"
  >
>;

export type CreateCrmBriefRequest = Pick<CrmBrief, "client_id" | "title"> &
  Partial<
    Pick<
      CrmBrief,
      | "category"
      | "budget_min_amount"
      | "budget_max_amount"
      | "target_audience"
      | "deliverable_type"
      | "platforms"
      | "schedule_from"
      | "schedule_to"
      | "kpi_play"
      | "kpi_gmv_amount"
      | "status"
      | "owner_member_id"
    >
  >;

export type UpdateCrmBriefRequest = Partial<
  Pick<
    CrmBrief,
    | "client_id"
    | "title"
    | "category"
    | "budget_min_amount"
    | "budget_max_amount"
    | "target_audience"
    | "deliverable_type"
    | "platforms"
    | "schedule_from"
    | "schedule_to"
    | "kpi_play"
    | "kpi_gmv_amount"
    | "status"
    | "owner_member_id"
  >
>;

export type CreateCrmCollabRequest = Pick<CrmCollab, "brief_id" | "creator_id"> &
  Partial<
    Pick<
      CrmCollab,
      | "stage"
      | "quote_amount"
      | "final_amount"
      | "prob"
      | "creator_fee"
      | "sample_cost"
      | "platform_fee"
      | "currency"
      | "settlement_mode"
      | "commission_rate"
      | "sample_required"
      | "script_required"
      | "scheduled_at"
      | "issue_id"
      | "owner_member_id"
      // Fulfilment (WORKBENCH-API 搂20.2): the link to what went live, and the
      // calendar day the money was settled. Both optional on create.
      | "publish_url"
      | "settled_on"
      // Assignment (COLLAB-MODEL §1): omitted = the owner, which is what the
      // server's default does.
      | "assignee_type"
      | "assignee_id"
    >
  >;

/**
 * Stage changes also write `confirmed_at` / `published_at` / `accepted_at`
 * server-side, so those timestamps are not client-writable.
 *
 * Clearing (WORKBENCH-API §3.4): `publish_url`, `settled_on`, `creator_fee`,
 * `sample_cost` and `platform_fee` keep the stored value when omitted, clear it to
 * NULL on `null`, and also clear on `""` — the latter only for clients written
 * before that section. A `null` still counts as touching the field, so it needs
 * `crm.amount` and an agent is refused it (`forbidden_agent_money`).
 */
export type UpdateCrmCollabRequest = Partial<
  Pick<
    CrmCollab,
    | "stage"
    | "quote_amount"
    | "final_amount"
    | "prob"
    | "creator_fee"
    | "sample_cost"
    | "platform_fee"
    | "currency"
    | "settlement_mode"
    | "commission_rate"
    | "sample_required"
    | "script_required"
    | "scheduled_at"
    | "issue_id"
    | "owner_member_id"
    // Fulfilment (WORKBENCH-API 搂20.2): the link to what went live, and the
    // calendar day the money was settled.
    | "publish_url"
    | "settled_on"
    // Assignment and concurrency (COLLAB-MODEL §1/§3).
    | "assignee_type"
    | "assignee_id"
  >
> & {
  /**
   * The revision this reader last saw. A mismatch is `409 stale_write` with the
   * current row; omitting it skips the check (old clients). It is not a column,
   * so it sits outside the `Pick`.
   */
  expected_revision?: number;
  /**
   * Why a person is replacing an agent's value (§26.3). The server answers 400
   * `overwrite_reason_required` when the row's last business change was an
   * agent's; this answer is what makes the overwrite rate mean something.
   */
  overwrite_reason?: OverwriteReason;
};

export type CreateCrmSettlementRequest = Pick<CrmSettlement, "collab_id" | "kind" | "amount"> &
  Partial<
    Pick<
      CrmSettlement,
      "currency" | "due_at" | "paid_at" | "invoice_no" | "note" | "assignee_type" | "assignee_id"
    >
  >;

/**
 * `paid_at`, `note` and `invoice_no` follow WORKBENCH-API §3.4: omitted keeps the
 * stored value, `null` clears it to NULL (`""` clears too, for older clients only).
 * `paid_at` is what decides whether a row counts as collected, so a PATCH that
 * meant to undo an arrival must send `null` — omitting it is a no-op.
 */
export type UpdateCrmSettlementRequest = Partial<
  Pick<
    CrmSettlement,
    | "kind"
    | "amount"
    | "currency"
    | "due_at"
    | "paid_at"
    | "invoice_no"
    | "note"
    | "assignee_type"
    | "assignee_id"
  >
> & {
  /** See `UpdateCrmCollabRequest.expected_revision`. */
  expected_revision?: number;
  /** See `UpdateCrmCollabRequest.overwrite_reason`. */
  overwrite_reason?: OverwriteReason;
};

// --- HR (docs/engineering/WORKBENCH-API.md 搂10) ---------------------------
//
// Five personnel records, same wire rules as the ledgers above: flat snake_case,
// money as a JSON number with `currency` beside it, soft delete via
// `archived_at`. The chain is job 鈫?candidate 鈫?interview 鈫?scorecard, plus the
// employee profile a hire creates.
//
// Exceptions to "everything is a column": `ability` (6 dimensions), `disc`
// (four axes), the scorecard's `dimensions` and the requisition's `keywords`
// are JSONB, because they are only displayed, fed to the AI context, or scored
// against 鈥?never joined on or used as a constraint key (搂10.2). Everything a
// metric needs is a real column.

export type HrJobStatus = "draft" | "open" | "paused" | "closed";

export type HrCandidateStage =
  | "screening"
  | "test"
  | "interview"
  | "scored"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn";

export type HrInterviewMode = "onsite" | "video" | "phone";

export type HrInterviewStatus = "scheduled" | "done" | "cancelled" | "no_show";

export type HrScorecardVerdict = "strong_yes" | "yes" | "no" | "strong_no";

/**
 * Ability matrix and DISC profile as they travel: dimension name 鈫?score.
 * `ability` is the 1鈥?0 six-dimension matrix, `disc` the 0鈥?0 d/i/s/c axes.
 * Both are open maps, not closed unions, because the dimension set is a product
 * decision the server can extend without a client release.
 */
export type HrAbilityScores = Record<string, number>;

export type HrDiscScores = Record<string, number>;

/**
 * One scorecard's per-dimension scores: dimension name 鈫?0鈥?. An open map
 * because the dimension set comes from the template the AI generates for the
 * role, not from a fixed column list (搂10.2). A dimension the reviewer did not
 * rate is simply absent 鈥?different from a stored 0.
 */
export type HrScorecardDimensions = Record<string, number>;

/**
 * An opening. `headcount` is a plan, not a count of hired candidates.
 *
 * `edu` / `years` / `city` / `keywords` are what `match_score` is computed
 * against, and `jd` is the prompt the AI drafts the posting and interview
 * questions from 鈥?both are free text on purpose: "3-5 骞? and "鏈浠ヤ笂" are
 * what a recruiter typed, not a vocabulary the schema can constrain.
 */
export interface HrJob {
  id: string;
  workspace_id: string;
  title: string;
  /** Aggregate dimension only, never an access boundary (same as 搂3). */
  department_id: string | null;
  level: string | null;
  headcount: number;
  status: HrJobStatus;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  requirements: string | null;
  /** Required education, free text ("鏈", "纭曞＋鎴栧悓绛夌粡楠?). */
  edu: string | null;
  /** Required experience, free text ("3-5 骞?). */
  years: string | null;
  city: string | null;
  /** Long-form description; the AI generation input. */
  jd: string | null;
  /** The 鎬ユ嫑 flag the funnel pins. */
  urgent: boolean;
  /** JSONB string array; always present, possibly empty. */
  keywords: string[];
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * A person in the pipeline for one job. One candidate row belongs to one job 鈥?
 * the same person applying twice is two rows (搂10.2 `UNIQUE (workspace_id,
 * job_id, lower(name), coalesce(phone,''))`).
 */
export interface HrCandidate {
  id: string;
  workspace_id: string;
  job_id: string;
  name: string;
  stage: HrCandidateStage;
  source: string | null;
  phone: string | null;
  email: string | null;
  resume_attachment_id: string | null;
  /** SMALLINT 0鈥?00; null = never scored. */
  match_score: number | null;
  /** NUMERIC(5,2) 0鈥?00 subscores for the three screening rounds. */
  score_resume: number | null;
  score_test: number | null;
  score_interview: number | null;
  expected_salary: number | null;
  offer_salary: number | null;
  currency: string;
  owner_member_id: string | null;
  /**
   * The candidate's own education, free text and the same vocabulary as
   * `HrJob.edu` ("鏈", "纭曞＋"): the education dimension of the match score is a
   * normalised comparison against what the requisition asks for, not a ladder.
   */
  edu: string | null;
  /** Years of experience, one decimal (`NUMERIC(4,1)`); the experience dimension
   *  compares it against the range parsed out of `HrJob.years`. */
  years_experience: number | null;
  /**
   * The r茅sum茅 body 鈥?pasted, or produced by the attachment parser. `null` means
   * "no r茅sum茅 on file", which is a different answer from an empty string: the
   * keyword dimension skips on `null` and scores 0 on text that matches nothing.
   */
  resume_text: string | null;
  /** Server-stamped when the candidate reaches `stage = "hired"`. */
  hired_at: string | null;
  rejected_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/** One scheduled round. `(interviewer_member_id, scheduled_at)` is exclusive. */
export interface HrInterview {
  id: string;
  workspace_id: string;
  candidate_id: string;
  round: number;
  scheduled_at: string;
  duration_minutes: number;
  /** Optional pointer: set when an internal member sits in. */
  interviewer_member_id: string | null;
  /**
   * Who runs the round. Usually an outside person, so this is a recorded name
   * rather than a reference; empty only for rows from before the column existed
   * whose member could not be resolved. The server fills it from the member when
   * the request carries only `interviewer_member_id`.
   */
  interviewer_name: string;
  /** Null while nobody has picked a channel; the column allows NULL. */
  mode: HrInterviewMode | null;
  status: HrInterviewStatus;
  /** Bumped by the server on every reschedule (搂10.3). */
  rescheduled_count: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * One reviewer's verdict on one interview. `(interview_id,
 * reviewer_member_id)` is unique, so this is an upsert-shaped ledger even
 * though the routes are plain CRUD.
 */
export interface HrScorecard {
  id: string;
  workspace_id: string;
  interview_id: string;
  reviewer_member_id: string | null;
  /** Legacy columns: 0鈥? per dimension, read-only. New code writes `dimensions`. */
  score_skill: number | null;
  score_experience: number | null;
  score_culture: number | null;
  score_potential: number | null;
  /**
   * NUMERIC(5,2) on the dimension scale (0鈥?). The server fills it with the mean
   * of `dimensions` when the client sends the map without a total.
   */
  weighted_score: number | null;
  /** The current shape: dimension name 鈫?0鈥?. Always an object, possibly empty. */
  dimensions: HrScorecardDimensions;
  verdict: HrScorecardVerdict | null;
  comment: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * The HR file of a workspace member: one row per member (搂10.2 `UNIQUE
 * (workspace_id, member_id)`). Created or updated by the hire transition.
 */
export interface HrEmployeeProfile {
  id: string;
  workspace_id: string;
  member_id: string;
  department_id: string | null;
  job_title: string | null;
  grade: string | null;
  /** Calendar days `YYYY-MM-DD`. */
  hire_date: string | null;
  regular_date: string | null;
  contract_end: string | null;
  /** The day the person actually left; set when an offboarding reaches done. */
  leave_date: string | null;
  ability: HrAbilityScores;
  disc: HrDiscScores;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

// --- HR list envelopes (搂3.1 applies to 搂10.3 unchanged) -------------------
// `total` is the page's row count, not a workspace-wide count.

export interface HrJobListResponse {
  jobs: HrJob[];
  total: number;
}

export interface HrCandidateListResponse {
  candidates: HrCandidate[];
  total: number;
}

export interface HrInterviewListResponse {
  interviews: HrInterview[];
  total: number;
}

export interface HrScorecardListResponse {
  scorecards: HrScorecard[];
  total: number;
}

export interface HrEmployeeProfileListResponse {
  employees: HrEmployeeProfile[];
  total: number;
}

// --- HR filters -----------------------------------------------------------
// 搂10.3 names the routes but not their query strings, so these carry only what
// 搂10.2 makes filterable on real columns (the foreign keys, plus the status /
// stage enums the boards group by). List endpoints ignore keys they do not
// know, so an unchanged key set never narrows a page to nothing.

export interface HrJobListFilters {
  status?: HrJobStatus;
  department_id?: string | null;
}

export interface HrCandidateListFilters {
  job_id?: string;
  stage?: HrCandidateStage;
}

export interface HrInterviewListFilters {
  candidate_id?: string;
  status?: HrInterviewStatus;
}

export interface HrScorecardListFilters {
  interview_id?: string;
}

export interface HrEmployeeProfileListFilters {
  department_id?: string | null;
}

// --- HR write requests ----------------------------------------------------

export type CreateHrJobRequest = Pick<HrJob, "title"> &
  Partial<
    Pick<
      HrJob,
      | "department_id"
      | "level"
      | "headcount"
      | "status"
      | "salary_min"
      | "salary_max"
      | "currency"
      | "requirements"
      | "edu"
      | "years"
      | "city"
      | "jd"
      | "urgent"
      | "keywords"
      | "owner_member_id"
    >
  >;

export type UpdateHrJobRequest = Partial<
  Pick<
    HrJob,
    | "title"
    | "department_id"
    | "level"
    | "headcount"
    | "status"
    | "salary_min"
    | "salary_max"
    | "currency"
    | "requirements"
    | "edu"
    | "years"
    | "city"
    | "jd"
    | "urgent"
    | "keywords"
    | "owner_member_id"
  >
>;

/** `hired_at` is server-stamped by the hire transition, so it is not writable
 *  here even though `stage` is. */
export type CreateHrCandidateRequest = Pick<HrCandidate, "job_id" | "name"> &
  Partial<
    Pick<
      HrCandidate,
      | "stage"
      | "source"
      | "phone"
      | "email"
      | "resume_attachment_id"
      | "match_score"
      | "score_resume"
      | "score_test"
      | "score_interview"
      | "expected_salary"
      | "offer_salary"
      | "currency"
      | "owner_member_id"
      | "rejected_reason"
      | "edu"
      | "years_experience"
      | "resume_text"
    >
  >;

export type UpdateHrCandidateRequest = Partial<
  Pick<
    HrCandidate,
    | "job_id"
    | "name"
    | "stage"
    | "source"
    | "phone"
    | "email"
    | "resume_attachment_id"
    | "match_score"
    | "score_resume"
    | "score_test"
    | "score_interview"
    | "expected_salary"
    | "offer_salary"
    | "currency"
    | "owner_member_id"
    | "rejected_reason"
    | "edu"
    | "years_experience"
    | "resume_text"
  >
>;

/** `rescheduled_count` is server-managed: a PATCH that moves `scheduled_at`
 *  increments it, and a client-supplied value would overwrite the audit count.
 *  `interviewer_name` is optional on the wire 鈥?a body that carries only
 *  `interviewer_member_id` has the name filled in from that member 鈥?but the
 *  server answers 400 when neither is present. */
export type CreateHrInterviewRequest = Pick<HrInterview, "candidate_id" | "scheduled_at"> &
  Partial<
    Pick<
      HrInterview,
      | "round"
      | "duration_minutes"
      | "interviewer_member_id"
      | "interviewer_name"
      | "mode"
      | "status"
      | "note"
    >
  >;

export type UpdateHrInterviewRequest = Partial<
  Pick<
    HrInterview,
    | "candidate_id"
    | "round"
    | "scheduled_at"
    | "duration_minutes"
    | "interviewer_member_id"
    | "interviewer_name"
    | "mode"
    | "status"
    | "note"
  >
>;

export type CreateHrScorecardRequest = Pick<HrScorecard, "interview_id"> &
  Partial<
    Pick<
      HrScorecard,
      | "reviewer_member_id"
      | "score_skill"
      | "score_experience"
      | "score_culture"
      | "score_potential"
      | "weighted_score"
      | "dimensions"
      | "verdict"
      | "comment"
    >
  >;

export type UpdateHrScorecardRequest = Partial<
  Pick<
    HrScorecard,
    | "interview_id"
    | "reviewer_member_id"
    | "score_skill"
    | "score_experience"
    | "score_culture"
    | "score_potential"
    | "weighted_score"
    | "dimensions"
    | "verdict"
    | "comment"
  >
>;

export type CreateHrEmployeeProfileRequest = Pick<HrEmployeeProfile, "member_id"> &
  Partial<
    Pick<
      HrEmployeeProfile,
      | "department_id"
      | "job_title"
      | "grade"
      | "hire_date"
      | "regular_date"
      | "contract_end"
      | "ability"
      | "disc"
      | "owner_member_id"
    >
  >;

export type UpdateHrEmployeeProfileRequest = Partial<
  Pick<
    HrEmployeeProfile,
    | "member_id"
    | "department_id"
    | "job_title"
    | "grade"
    | "hire_date"
    | "regular_date"
    | "contract_end"
    | "ability"
    | "disc"
    | "owner_member_id"
  >
>;

/**
 * `POST /candidates/{candidateId}/hire` takes the profile the same transaction
 * creates or updates, which is exactly a profile create body: the route names
 * the candidate, the body names the member it becomes.
 */
export type HireHrCandidateRequest = CreateHrEmployeeProfileRequest;

/**
 * What hiring returns: the updated candidate and the profile the same
 * transaction created or updated. Both halves are needed 鈥?the caller routes to
 * the employee record, and the candidate row alone cannot name it.
 */
export interface HireHrCandidateResponse {
  candidate: HrCandidate;
  employee_profile: HrEmployeeProfile;
}

// --- Affiliate distribution (docs/engineering/WORKBENCH-API.md 搂11) --------
//
// 绮鹃€夎仈鐩?鍒嗛攢, a different business shape from the CRM ledgers above: the fact
// is 鍟嗗搧 脳 杈句汉 脳 鏃ユ湡, and the money arrives as a periodic platform statement.
// Four records:
//
//   - `AffiliateProduct` 鈥?a SKU a client lists, with the commission it pays;
//   - `AffiliatePick` 鈥?a creator promoting that SKU (the platform's 鎺ㄥ箍璁″垝);
//   - `AffiliateDaily` 鈥?the platform report's numbers for one pick on one day;
//   - `AffiliateSettlement` 鈥?the statement the platform issues for a period.
//
// Same wire rules as the rest of this file: flat snake_case, money as JSON
// numbers with `currency` beside them, and rates at the 0鈥? storage scale (C3) 鈥?
// `commission_rate` 0.2 is 20 %, and `refund_rate` in the summary is 0.05 for
// 5 %. Schemas stay lenient on the enums so a new platform state degrades one
// row's presentation instead of blanking the ledger.
//
// `affiliate_daily` and `affiliate_settlement` are NOT derivable from each other:
// the daily row is what the platform reports per day, the settlement is what it
// pays per cycle (with its own tech-service fee and rounding). Neither is
// computed from the other on the server, so neither can be computed on the client.

export type AffiliateProductStatus = "on_shelf" | "off_shelf" | "ended";

/**
 * Whose SKU a product is (725).
 *
 * `own_brand` 鈥?鑷惀鍝佺墝鍟嗗搧: ours, no client, and the commission it pays is our
 * revenue. `client_brand` 鈥?浠ｅ崠: a client's SKU, the commission is that client's
 * cost and our income is the 鎷涘晢鏈嶅姟璐?on the pick. 姣涘埄 is only meaningful
 * inside one of the two, so the label travels with every product row.
 */
export type AffiliateOwnership = "own_brand" | "client_brand";

export type AffiliatePickStatus = "active" | "paused" | "ended";

/**
 * Whose pocket a statement's commission reached (727).
 *
 * `agency` 鈥?it landed in our 鏈烘瀯鍙? so it is revenue we received (and out of
 * which a 鑷湁杈句汉's split is paid). `creator` 鈥?the platform paid the creator
 * directly, so the GMV is ours to count but the commission is not our income.
 * The two are never added together.
 */
export type AffiliateSettlementRecipient = "agency" | "creator";

export type AffiliateSettlementStatus = "pending" | "paid" | "failed";

/** A 鑱旂洘鍟嗗搧: the SKU, its shelf price and the commission it pays. */
export interface AffiliateProduct {
  id: string;
  workspace_id: string;
  /** Whose SKU it is: `own_brand` (ours) or `client_brand` (a client's). */
  ownership: AffiliateOwnership;
  /**
   * The seller 鈥?a `CrmClient` 鈥?for a `client_brand` product, and null for an
   * `own_brand` one (we list our own SKU, so there is nobody to charge).
   */
  client_id: string | null;
  /** `douyin`, `kuaishou`, 鈥?Free text; the first half of the product identity. */
  platform: string;
  /** The platform's own product id; unique per platform while the row is live. */
  platform_product_id: string;
  title: string;
  category: string | null;
  /** On-shelf price, CNY. Null when the platform did not report one. */
  price: number | null;
  currency: string;
  /** 0鈥? (C3): 0.2 is a 20 % commission. Null means "not set yet". */
  commission_rate: number | null;
  /** The 娲诲姩浣ｉ噾 this rate belongs to; null is the plain plan, not "unnamed". */
  activity: string | null;
  status: AffiliateProductStatus;
  /** The row's owner; a `member` may edit only the rows it owns. */
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * A 閫夊搧: one creator promoting one product. This is the row the platform
 * attributes orders to, and the parent of every daily fact.
 */
export interface AffiliatePick {
  id: string;
  workspace_id: string;
  product_id: string;
  creator_id: string;
  /**
   * The pick's own rate (瀹氬悜璁″垝). Null means the product's default applies 鈥?
   * which is a different statement from an agreed zero.
   */
  commission_rate: number | null;
  /**
   * 0鈥? (C3): our cut of the commission for a 鑷湁杈句汉 whose settlement runs
   * through our 鏈烘瀯鍙? Null means "not an internal split" 鈥?an 澶栭儴杈句汉 the
   * platform pays directly 鈥?so it is also the marker the summary reads.
   *
   * It is NOT `commission_rate`: that one is the platform's cut of the GMV, this
   * one is our cut of that commission.
   */
  agency_share_rate: number | null;
  /** 鎷涘晢鏈嶅姟璐?/ 鍧戜綅璐?we invoice for the placement, CNY. Null = no fee. */
  service_fee_amount: number | null;
  /** When the creator added the product to their plan (ISO timestamp). */
  bound_at: string;
  status: AffiliatePickStatus;
  note: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * One day of one pick, exactly as the platform report gives it.
 *
 * `refund_amount` is its own measure and is NOT netted out of `gmv_amount`: a
 * refund can land on a different day than the sale, and the platform reports
 * both side by side. `settled_commission` is the part of `est_commission` that
 * has cleared; the gap between them is the cash lag, so both are stored.
 */
export interface AffiliateDaily {
  id: string;
  workspace_id: string;
  pick_id: string;
  /** Calendar day `YYYY-MM-DD`. */
  stat_date: string;
  gmv_amount: number;
  order_count: number;
  refund_amount: number;
  est_commission: number;
  settled_commission: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

/**
 * One platform settlement statement for a period. `net_amount` is the platform's
 * own arithmetic (`gross 鈭?tech_service_fee 鈭?refund_deduction`), stored as sent
 * and never recomputed: a server that "fixed" it would hide the discrepancy the
 * operator needs to see. There is no delete route 鈥?a wrong statement is
 * corrected by PATCH.
 */
export interface AffiliateSettlement {
  id: string;
  workspace_id: string;
  /** The statement period, `YYYY-MM-DD` at both ends. */
  period_start: string;
  period_end: string;
  gross_commission: number;
  /** 鎶€鏈湇鍔¤垂, the platform's cut (~10 %). */
  tech_service_fee: number;
  refund_deduction: number;
  net_amount: number;
  currency: string;
  status: AffiliateSettlementStatus;
  /** Whose pocket the commission reached (727); `agency` by default. */
  settled_to: AffiliateSettlementRecipient;
  paid_at: string | null;
  /** The platform's statement number; null when the import did not carry it. */
  external_no: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** `GET /api/workbench/affiliate/products` 鈥?`total` is the page's row count. */
export interface AffiliateProductListResponse {
  products: AffiliateProduct[];
  total: number;
}

export interface AffiliatePickListResponse {
  picks: AffiliatePick[];
  total: number;
}

/**
 * `GET/PUT /api/workbench/affiliate/daily`. `daily` is the resource name and is
 * already a mass noun, so it does not take a plural `s`.
 */
export interface AffiliateDailyListResponse {
  daily: AffiliateDaily[];
  total: number;
}

export interface AffiliateSettlementListResponse {
  settlements: AffiliateSettlement[];
  total: number;
}

// --- Affiliate filters ----------------------------------------------------
// Same convention as the ledgers above: plain objects, because they are part of
// the query key, and unknown keys are ignored by the server.

export interface AffiliateProductListFilters {
  client_id?: string;
  status?: AffiliateProductStatus;
  platform?: string;
  limit?: number;
  cursor?: string;
}

export interface AffiliatePickListFilters {
  product_id?: string;
  creator_id?: string;
  status?: AffiliatePickStatus;
  limit?: number;
  cursor?: string;
}

export interface AffiliateDailyListFilters {
  pick_id?: string;
  /** Inclusive calendar days `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  limit?: number;
}

export interface AffiliateSettlementListFilters {
  status?: AffiliateSettlementStatus;
  /** Overlap window: a statement straddling the boundary still matches. */
  from?: string;
  to?: string;
  limit?: number;
}

// --- Affiliate write requests ---------------------------------------------

/**
 * `POST /api/workbench/affiliate/products`.
 *
 * `client_id` is optional because a 鑷惀 SKU has no seller; `ownership` defaults
 * to `client_brand` server-side, which is what every product created before 725
 * meant. The two must agree 鈥?a client-brand product names a client, an
 * own-brand one does not 鈥?and the server refuses the mismatch with a 400.
 */
export type CreateAffiliateProductRequest = Pick<
  AffiliateProduct,
  "platform" | "platform_product_id" | "title"
> &
  Partial<
    Pick<
      AffiliateProduct,
      | "client_id"
      | "ownership"
      | "category"
      | "price"
      | "currency"
      | "commission_rate"
      | "activity"
      | "status"
      | "owner_member_id"
    >
  >;

export type UpdateAffiliateProductRequest = Partial<
  Pick<
    AffiliateProduct,
    | "client_id"
    | "ownership"
    | "platform"
    | "platform_product_id"
    | "title"
    | "category"
    | "price"
    | "currency"
    | "commission_rate"
    | "activity"
    | "status"
    | "owner_member_id"
  >
>;

export type CreateAffiliatePickRequest = Pick<AffiliatePick, "product_id" | "creator_id"> &
  Partial<
    Pick<
      AffiliatePick,
      | "commission_rate"
      | "agency_share_rate"
      | "service_fee_amount"
      | "bound_at"
      | "status"
      | "note"
      | "owner_member_id"
    >
  >;

export type UpdateAffiliatePickRequest = Partial<
  Pick<
    AffiliatePick,
    | "product_id"
    | "creator_id"
    | "commission_rate"
    | "agency_share_rate"
    | "service_fee_amount"
    | "bound_at"
    | "status"
    | "note"
    | "owner_member_id"
  >
>;

/**
 * `PUT /api/workbench/affiliate/daily` 鈥?the whole reported day, keyed by
 * `(pick_id, stat_date)`. The body replaces the day: an omitted measure is
 * stored as 0, not merged with the previous value.
 */
export type UpsertAffiliateDailyRequest = Pick<AffiliateDaily, "pick_id" | "stat_date"> &
  Partial<
    Pick<
      AffiliateDaily,
      | "gmv_amount"
      | "order_count"
      | "refund_amount"
      | "est_commission"
      | "settled_commission"
      | "currency"
    >
  >;

/** `net_amount` is required: a statement that cannot name its net is not one. */
export type CreateAffiliateSettlementRequest = Pick<
  AffiliateSettlement,
  "period_start" | "period_end" | "net_amount"
> &
  Partial<
    Pick<
      AffiliateSettlement,
      | "gross_commission"
      | "tech_service_fee"
      | "refund_deduction"
      | "currency"
      | "status"
      | "settled_to"
      | "paid_at"
      | "external_no"
      | "note"
    >
  >;

export type UpdateAffiliateSettlementRequest = Partial<
  Pick<
    AffiliateSettlement,
    | "period_start"
    | "period_end"
    | "gross_commission"
    | "tech_service_fee"
    | "refund_deduction"
    | "net_amount"
    | "currency"
    | "status"
    | "settled_to"
    | "paid_at"
    | "external_no"
    | "note"
  >
>;

/**
 * `GET /api/workbench/affiliate/summary` 鈥?one month of the affiliate ledger.
 *
 * Every entry is the same three-state block the metric strip uses, so
 * `value: null` + `empty: "insufficient_data"` reads as "no report was imported"
 * on this surface too, never as a zero. The two counts are true zeros on an
 * empty month; the money blocks are gaps. `refund_rate` is 0鈥? (C3).
 *
 * The income side is three blocks, not one, because the business has two pockets
 * (725鈥?27). `gmv` counts every pick whatever happened to the commission;
 * `commission_agency` is what actually reached us (agency-settled commission plus
 * the 鎷涘晢鏈嶅姟璐?we invoiced); `commission_creator` is what the platform paid
 * creators directly 鈥?real GMV, not our revenue; `agency_share_income` is our cut
 * of the internal creators' cleared commission. Adding the first two incomes
 * together would report money we never received.
 */
export interface AffiliateSummaryResponse {
  /** The calendar month the figures describe, `YYYY-MM`. */
  window: { month: string };
  gmv: WorkbenchFinanceBlock;
  commission_est: WorkbenchFinanceBlock;
  commission_settled: WorkbenchFinanceBlock;
  /** Commission that reached our 鏈烘瀯鍙?+ 鎷涘晢鏈嶅姟璐?鈥?money we received. */
  commission_agency: WorkbenchFinanceBlock;
  /** Commission the platform paid creators directly 鈥?GMV, not our income. */
  commission_creator: WorkbenchFinanceBlock;
  /** Our cut of internal creators' cleared commission (0鈥? rate 脳 settled). */
  agency_share_income: WorkbenchFinanceBlock;
  refund_rate: WorkbenchFinanceBlock;
  tech_fee: WorkbenchFinanceBlock;
  pick_count: WorkbenchFinanceBlock;
  active_creator_count: WorkbenchFinanceBlock;
}

export interface AffiliateSummaryFilters {
  /** `YYYY-MM`; the server's current month when omitted. */
  month?: string | null;
  /** Aggregate dimension only; never an access boundary (搂3). */
  department_id?: string | null;
}

// --- Batch CSV import (`POST /api/workbench/import`, WORKBENCH-API §23) ------
//
// One endpoint, three kinds. The request body is the CSV text itself and the query
// carries `kind` plus `dry_run` (default 1 = preview). The response shape is the
// same for a preview and a real import; only `committed` differs, which is what
// makes the preview trustworthy: the server validates both paths with one code path.
//
//   - `rows[].action` is `create` for a row that would be (or was) written and
//     `skip` for a duplicate already in the ledger — a duplicate is not an error.
//   - `errors[]` names the line, the column and a stable reason code; the file is
//     rejected whole when any row errors (`committed: 0`), so the list is complete.
//   - `preview` holds the values the server derived (resolved creator id, parsed
//     amounts, normalised currency), not a copy of the file's cells.

export type ImportKind = "quotes" | "activities" | "collabs";

export type ImportRowAction = "create" | "skip";

/** One parsed row: where it came from, what the server would do, and with what. */
export interface ImportRow {
  /** 1-based line in the file, header included (`2` is the first data row). */
  line: number;
  action: ImportRowAction;
  preview: Record<string, unknown>;
}

/**
 * One row that cannot be imported. `column` is the canonical column name (empty for
 * a whole-row problem such as a wrong cell count), `reason` a stable code — see
 * WORKBENCH-API §23.3 for the list.
 */
export interface ImportError {
  line: number;
  column: string;
  reason: string;
}

export interface ImportPreviewResponse {
  kind: ImportKind;
  /** Data rows read (header excluded), including the ones that errored. */
  parsed: number;
  /** Rows that would be written: `create` rows, duplicates excluded. */
  accepted: number;
  /** Rows actually written — always 0 on a dry run and on a rejected batch. */
  committed: number;
  rows: ImportRow[];
  errors: ImportError[];
}

// --- Capabilities (`GET /api/workbench/capabilities`, WORKBENCH-API §24) -----
//
// The product layer's own vocabulary, resolved server-side from role → job-title
// template → department default → read-only fallback. The client does not compute
// this; it reads the set and hides what it cannot do. The strings are the wire values
// (§24.1), so a typo here is a capability that never matches.

export type WorkbenchCapability =
  | "crm.read"
  | "crm.write"
  | "crm.amount"
  | "crm.settle"
  | "media.read"
  | "media.write"
  | "media.publish"
  | "hr.read"
  | "hr.write"
  | "boss.read"
  | "ads.read"
  | "review.accept"
  | "agent.delegate";

/**
 * Which resolution step answered, for diagnostics: `role` (owner/admin), `template`
 * (the member's job title), `department` (the built-in default for their department)
 * or `fallback` (reads only). It is what makes "why can't I edit this?" answerable
 * without reading the server logs.
 */
export type WorkbenchCapabilitySource = "role" | "template" | "department" | "fallback";

/** `workspace.settings.workbench_visibility` (§24.4). */
export type WorkbenchVisibility = "transparent" | "department";

export interface WorkbenchCapabilitiesResponse {
  capabilities: WorkbenchCapability[];
  source: WorkbenchCapabilitySource;
  /** The caller's platform role — `member | admin | owner`, verbatim. */
  role: string;
  visibility: WorkbenchVisibility;
}

/**
 * One job title's capability set. `PUT /role-templates/{jobTitle}` replaces the whole
 * set; unknown capability strings are dropped server-side, so a response never
 * carries one this build cannot render.
 */
export interface WorkbenchRoleTemplate {
  id: string;
  workspace_id: string;
  job_title: string;
  capabilities: WorkbenchCapability[];
  created_at: string;
  updated_at: string;
}

export interface WorkbenchRoleTemplateListResponse {
  templates: WorkbenchRoleTemplate[];
  total: number;
}

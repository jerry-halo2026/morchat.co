/**
 * Workbench ledger wire types (docs/engineering/WORKBENCH-API.md §2).
 *
 * Seven tables, seven record types: creators (the supply side), their posts and
 * per-day post snapshots (the evidence side), and the four CRM ledgers
 * (client → brief → collab → settlement). Every field here is what the server
 * puts on the wire, snake_case and flat; nothing is denormalized, because the
 * ledger screens read rows and resolve labels at render time.
 *
 * Money is `number`, not a string: the server converts `NUMERIC(14,2)` columns
 * to JSON numbers, and `currency` travels next to it so the UI never guesses.
 *
 * The string-literal enum types below are what the current migration allows.
 * Schemas stay lenient (`z.string()`) so a server that adds a stage or a source
 * still parses: an unknown value must degrade to a default case in the UI, never
 * blank the whole ledger row.
 */

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
  /** 0–1 (docs/METRICS.md C3); display multiplies by 100. */
  engagement_rate: number | null;
  category: string | null;
  audience_note: string | null;
  region: string | null;
  price_note: string | null;
  /** Manual 1–5 rating; null until someone sets one. */
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
}

export interface CreatorPost {
  id: string;
  workspace_id: string;
  creator_id: string;
  collab_id: string | null;
  content_issue_id: string | null;
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

/** A paying client. Creators and clients are different actors (METRICS.md C6). */
export interface CrmClient {
  id: string;
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

/** One brief matched to one creator, with its own funnel position and money. */
export interface CrmCollab {
  id: string;
  workspace_id: string;
  brief_id: string;
  creator_id: string;
  stage: CrmCollabStage;
  quote_amount: number | null;
  final_amount: number | null;
  /** 0–1 success probability; null means "use the stage default". */
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
}

/** Sidebar counts. `collabs_open` excludes settled/cancelled, matching the
 *  pipeline metric's stage filter; `settlements_pending` is unpaid rows. */
export interface WorkbenchCountsResponse {
  creators: number;
  clients: number;
  briefs: number;
  collabs_open: number;
  settlements_pending: number;
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
  /** Aggregate dimension only; never an access boundary. */
  department_id?: string | null;
}

export interface CreatorPostListFilters {
  creator_id?: string;
  /** Inclusive calendar day `YYYY-MM-DD`. */
  from?: string;
  to?: string;
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
}

export interface CrmSettlementListFilters {
  collab_id?: string;
  /** `true` = only paid rows, `false` = only unpaid. */
  paid?: boolean;
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
  Partial<Pick<CreatorPost, "collab_id" | "content_issue_id" | "title" | "source">>;

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
    >
  >;

/** Stage changes also write `confirmed_at` / `published_at` / `accepted_at`
 *  server-side, so those timestamps are not client-writable. */
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
  >
>;

export type CreateCrmSettlementRequest = Pick<CrmSettlement, "collab_id" | "kind" | "amount"> &
  Partial<
    Pick<CrmSettlement, "currency" | "due_at" | "paid_at" | "invoice_no" | "note">
  >;

export type UpdateCrmSettlementRequest = Partial<
  Pick<
    CrmSettlement,
    "kind" | "amount" | "currency" | "due_at" | "paid_at" | "invoice_no" | "note"
  >
>;

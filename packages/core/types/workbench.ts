/**
 * Workbench wire types (docs/engineering/WORKBENCH-API.md §2 and §10).
 *
 * B0's seven ledger tables — creators (the supply side), their posts and per-day
 * post snapshots (the evidence side), and the four CRM ledgers (client → brief →
 * collab → settlement) — plus B1's five HR records (job → candidate → interview
 * → scorecard, and the employee profile a hire creates). Every field here is
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
  /**
   * Recruiting ledgers. Optional because a server that predates B1 omits them,
   * and a missing count must render as "no number yet" rather than a confident
   * zero — the same rule `emptyRule` applies to metrics.
   */
  jobs?: number;
  candidates?: number;
  interviews?: number;
  employees?: number;
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

// --- HR (docs/engineering/WORKBENCH-API.md §10) ---------------------------
//
// Five personnel records, same wire rules as the ledgers above: flat snake_case,
// money as a JSON number with `currency` beside it, soft delete via
// `archived_at`. The chain is job → candidate → interview → scorecard, plus the
// employee profile a hire creates.
//
// Exceptions to "everything is a column": `ability` (6 dimensions), `disc`
// (four axes), the scorecard's `dimensions` and the requisition's `keywords`
// are JSONB, because they are only displayed, fed to the AI context, or scored
// against — never joined on or used as a constraint key (§10.2). Everything a
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
 * Ability matrix and DISC profile as they travel: dimension name → score.
 * `ability` is the 1–10 six-dimension matrix, `disc` the 0–10 d/i/s/c axes.
 * Both are open maps, not closed unions, because the dimension set is a product
 * decision the server can extend without a client release.
 */
export type HrAbilityScores = Record<string, number>;

export type HrDiscScores = Record<string, number>;

/**
 * One scorecard's per-dimension scores: dimension name → 0–5. An open map
 * because the dimension set comes from the template the AI generates for the
 * role, not from a fixed column list (§10.2). A dimension the reviewer did not
 * rate is simply absent — different from a stored 0.
 */
export type HrScorecardDimensions = Record<string, number>;

/**
 * An opening. `headcount` is a plan, not a count of hired candidates.
 *
 * `edu` / `years` / `city` / `keywords` are what `match_score` is computed
 * against, and `jd` is the prompt the AI drafts the posting and interview
 * questions from — both are free text on purpose: "3-5 年" and "本科以上" are
 * what a recruiter typed, not a vocabulary the schema can constrain.
 */
export interface HrJob {
  id: string;
  workspace_id: string;
  title: string;
  /** Aggregate dimension only, never an access boundary (same as §3). */
  department_id: string | null;
  level: string | null;
  headcount: number;
  status: HrJobStatus;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  requirements: string | null;
  /** Required education, free text ("本科", "硕士或同等经验"). */
  edu: string | null;
  /** Required experience, free text ("3-5 年"). */
  years: string | null;
  city: string | null;
  /** Long-form description; the AI generation input. */
  jd: string | null;
  /** The 急招 flag the funnel pins. */
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
 * A person in the pipeline for one job. One candidate row belongs to one job —
 * the same person applying twice is two rows (§10.2 `UNIQUE (workspace_id,
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
  /** SMALLINT 0–100; null = never scored. */
  match_score: number | null;
  /** NUMERIC(5,2) 0–100 subscores for the three screening rounds. */
  score_resume: number | null;
  score_test: number | null;
  score_interview: number | null;
  expected_salary: number | null;
  offer_salary: number | null;
  currency: string;
  owner_member_id: string | null;
  /**
   * The candidate's own education, free text and the same vocabulary as
   * `HrJob.edu` ("本科", "硕士"): the education dimension of the match score is a
   * normalised comparison against what the requisition asks for, not a ladder.
   */
  edu: string | null;
  /** Years of experience, one decimal (`NUMERIC(4,1)`); the experience dimension
   *  compares it against the range parsed out of `HrJob.years`. */
  years_experience: number | null;
  /**
   * The résumé body — pasted, or produced by the attachment parser. `null` means
   * "no résumé on file", which is a different answer from an empty string: the
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
  /** Bumped by the server on every reschedule (§10.3). */
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
  /** Legacy columns: 0–5 per dimension, read-only. New code writes `dimensions`. */
  score_skill: number | null;
  score_experience: number | null;
  score_culture: number | null;
  score_potential: number | null;
  /**
   * NUMERIC(5,2) on the dimension scale (0–5). The server fills it with the mean
   * of `dimensions` when the client sends the map without a total.
   */
  weighted_score: number | null;
  /** The current shape: dimension name → 0–5. Always an object, possibly empty. */
  dimensions: HrScorecardDimensions;
  verdict: HrScorecardVerdict | null;
  comment: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * The HR file of a workspace member: one row per member (§10.2 `UNIQUE
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
  ability: HrAbilityScores;
  disc: HrDiscScores;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

// --- HR list envelopes (§3.1 applies to §10.3 unchanged) -------------------
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
// §10.3 names the routes but not their query strings, so these carry only what
// §10.2 makes filterable on real columns (the foreign keys, plus the status /
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
 *  `interviewer_name` is optional on the wire — a body that carries only
 *  `interviewer_member_id` has the name filled in from that member — but the
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
 * transaction created or updated. Both halves are needed — the caller routes to
 * the employee record, and the candidate row alone cannot name it.
 */
export interface HireHrCandidateResponse {
  candidate: HrCandidate;
  employee_profile: HrEmployeeProfile;
}

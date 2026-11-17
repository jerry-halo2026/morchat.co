/**
 * General manager workbench types (docs/engineering/WORKBENCH-API.md §13).
 *
 * Two domains, one file:
 *
 *   目标 (OKR):  goal → key result → department package     `Goal*`
 *   雷达信号:    market signal → goal | issue                `MarketSignal*`
 *
 * The shape that matters: a goal always arrives with its key results and its
 * packages attached, in `position` order, so a board renders a whole cycle with
 * one read. `GoalKeyResult.current` is a stored number — written by whoever
 * recorded the figure — not something the client recomputes from `target`, and
 * `current > target` is a valid over-achievement rather than a bug.
 *
 * The task side lives on the issue: `issue.goal_id` points at a goal, and this
 * module only reads that link from the goal's side (`GoalDetail.issues`). The
 * issue response itself does not carry `goal_id` yet (see §13.7).
 */

export type GoalStatus = "draft" | "active" | "paused" | "done" | "cancelled";

export type GoalPriority = "P0" | "P1" | "P2";

export type GoalKeyResultStatus = "on_track" | "at_risk" | "off_track" | "done";

export type MarketSignalCategory =
  | "market"
  | "competitor"
  | "channel"
  | "product"
  | "policy"
  | "other";

export type MarketSignalSource = "manual" | "ai" | "import";

/** 分级: hot / warm / cold. */
export type MarketSignalCut = "hot" | "warm" | "cold";

export type MarketSignalUrgency = "high" | "medium" | "low";

export type MarketSignalStatus = "new" | "reviewing" | "converted" | "dismissed";

/** What a signal converts into. */
export type MarketSignalConvertTarget = "goal" | "issue";

/**
 * One measurable result under a goal.
 *
 * `target` is nullable: a result whose number is not decided yet still belongs to
 * the goal, and 0 would be a claim it is already missed. `current` never exceeds
 * anything — over-achievement is a real quarter.
 */
export interface GoalKeyResult {
  id: string;
  workspace_id: string;
  goal_id: string;
  title: string;
  target: number | null;
  /** The recorded figure. Stored, not derived; may exceed `target`. */
  current: number;
  /** `%`, `万元`, `个`, … — displayed next to the number, never converted. */
  unit: string | null;
  position: number;
  status: GoalKeyResultStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * One goal split for one department. `owner_member_id` is who that split answers
 * to; it is not the write gate — the goal's owner is.
 */
export interface GoalPackage {
  id: string;
  workspace_id: string;
  goal_id: string;
  department_id: string;
  title: string;
  owner_member_id: string | null;
  status: GoalStatus;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/** An objective for one cycle, with the two child lists always embedded. */
export interface Goal {
  id: string;
  workspace_id: string;
  /** `2026Q4`, `2026-11`, `2026H2` — free text, compared for equality. */
  cycle: string;
  title: string;
  description: string | null;
  owner_member_id: string;
  /** Null for a company-level objective that belongs to no single department. */
  department_id: string | null;
  status: GoalStatus;
  /** `YYYY-MM-DD`. */
  due_date: string | null;
  priority: GoalPriority;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  key_results: GoalKeyResult[];
  packages: GoalPackage[];
}

/** One task under a goal: a projection of the issue, not the whole issue row. */
export interface GoalIssue {
  id: string;
  number: number;
  title: string;
  status: string;
  goal_id: string | null;
}

/** `GET /goals/{id}`: the goal plus the issues attached to it. */
export interface GoalDetail extends Goal {
  issues: GoalIssue[];
}

export interface GoalListResponse {
  goals: Goal[];
  /** This page's row count, not the workspace total (contract §3.1). */
  total: number;
}

export interface GoalListFilters {
  cycle?: string;
  status?: GoalStatus | string;
  limit?: number;
}

export interface CreateGoalRequest {
  /** Omitted means "the current quarter" as the server computes it. */
  cycle?: string;
  title: string;
  description?: string;
  owner_member_id?: string;
  department_id?: string;
  status?: GoalStatus;
  due_date?: string;
  priority?: GoalPriority;
}

/** Every field optional: an omitted one keeps its stored value. */
export type UpdateGoalRequest = Partial<CreateGoalRequest>;

export interface CreateGoalKeyResultRequest {
  title: string;
  /** Must be zero or positive; omit it while the number is undecided. */
  target?: number;
  current?: number;
  unit?: string;
  position?: number;
  status?: GoalKeyResultStatus;
}

export type UpdateGoalKeyResultRequest = Partial<CreateGoalKeyResultRequest>;

export interface CreateGoalPackageRequest {
  department_id: string;
  title: string;
  owner_member_id?: string;
  status?: GoalStatus;
  position?: number;
}

export type UpdateGoalPackageRequest = Partial<CreateGoalPackageRequest>;

export interface AttachGoalIssueRequest {
  issue_id: string;
}

/**
 * One radar signal. Both landing pointers are nullable at once: an unprocessed
 * signal is the normal state, and the radar exists to show the ones still open.
 */
export interface MarketSignal {
  id: string;
  workspace_id: string;
  title: string;
  category: MarketSignalCategory;
  source: MarketSignalSource;
  url: string | null;
  summary: string | null;
  cut: MarketSignalCut;
  /** 0–100 relevance; null when nobody scored it. */
  score: number | null;
  urgency: MarketSignalUrgency;
  status: MarketSignalStatus;
  converted_goal_id: string | null;
  converted_issue_id: string | null;
  note: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface MarketSignalListResponse {
  signals: MarketSignal[];
  total: number;
}

export interface MarketSignalListFilters {
  cut?: MarketSignalCut | string;
  status?: MarketSignalStatus | string;
  category?: MarketSignalCategory | string;
  limit?: number;
}

export interface CreateMarketSignalRequest {
  title: string;
  category?: MarketSignalCategory;
  source?: MarketSignalSource;
  url?: string;
  summary?: string;
  cut?: MarketSignalCut;
  score?: number;
  urgency?: MarketSignalUrgency;
  /** `converted` is not settable here — POST …/convert owns it. */
  status?: Exclude<MarketSignalStatus, "converted">;
  note?: string;
  owner_member_id?: string;
}

export type UpdateMarketSignalRequest = Partial<CreateMarketSignalRequest>;

/**
 * `POST /signals/{id}/convert`. `cycle` / `department_id` shape the goal target;
 * `project_id` places the issue target. Fields the chosen target does not use are
 * ignored by the server.
 */
export interface ConvertMarketSignalRequest {
  target: MarketSignalConvertTarget;
  cycle?: string;
  department_id?: string;
  project_id?: string;
}

/** Exactly one of `goal` / `issue` is present, matching the target that was sent. */
export interface MarketSignalConvertResponse {
  signal: MarketSignal;
  goal?: Goal;
  issue?: GoalIssue;
}

/**
 * Employee rewards and disciplines (docs/engineering/WORKBENCH-API.md §17).
 *
 * The roster's 奖惩 tab was the last empty "table pending" state in HR: a 奖励 or
 * a 处分 had no storage at all, so "who was recognised, who was reprimanded, when
 * and why" lived in chat history. This module is the model of the list that
 * replaced it.
 *
 * ```
 * hr_employee_profile  (the person)
 *       ↓ POST /hr/rewards   (月度之星 +500 / 迟到 — a fact with a reason)
 * HrEmployeeReward[]    one row per decision, ordered decided_on DESC
 * ```
 *
 * Three rules the types encode:
 *
 *   - **`amount` is stored positive; `kind` carries the direction.** A fine is a
 *     `discipline` of 500, never -500 — the server rejects a negative amount, so
 *     no reader ever has to remember a sign convention.
 *   - **`amount` is nullable.** A 通报表扬 has no money attached; null is not 0.
 *   - **`employee_id` and `kind` are not editable.** `UpdateHrEmployeeRewardRequest`
 *     omits both: a row that stops describing the same person, or turns a fine
 *     into a bonus, is a different record — delete and re-add.
 */

/**
 * Which segment of the 奖惩 tab the row belongs to. A closed pair because that is
 * the split the page shows; the free text a person needs is `category` and
 * `reason`. (The response schema keeps an unknown string rather than folding it
 * into one of the two — relabelling somebody's record on screen is worse than
 * rendering a value this build does not know.)
 */
export type HrEmployeeRewardKind = "reward" | "discipline";

/** One recorded reward or discipline. */
export interface HrEmployeeReward {
  id: string;
  workspace_id: string;
  /** The `HrEmployeeProfile` this row is about. */
  employee_id: string;
  kind: HrEmployeeRewardKind;
  /** Free-text label ("月度之星" / "迟到"); null when nobody labelled it. */
  category: string | null;
  /** What happened. Never empty: the server rejects a blank reason. */
  reason: string;
  /** 奖金 / 罚金, always >= 0 (JSON number, §3.1). null = no money attached. */
  amount: number | null;
  /** `CNY` and friends; always set (the column is NOT NULL, default CNY). */
  currency: string;
  /** Calendar day `YYYY-MM-DD`: when the call was made, not when it was typed. */
  decided_on: string;
  note: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface HrEmployeeRewardListResponse {
  rewards: HrEmployeeReward[];
  /** This page's row count, not the workspace total (§3.1). */
  total: number;
}

export interface HrEmployeeRewardListFilters {
  employee_id?: string;
  kind?: HrEmployeeRewardKind | string;
  /** Inclusive `decided_on` window, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  limit?: number;
}

/**
 * `POST /hr/rewards`. `employee_id`, `kind`, `reason` and `decided_on` are
 * required; the rest are optional because a 通报表扬 has no money and a quick
 * entry has no label yet.
 *
 * There is no `owner_member_id`: the row belongs to the employee profile's owner,
 * so writing to somebody else's file is a 403 rather than a reassignment.
 */
export interface CreateHrEmployeeRewardRequest {
  employee_id: string;
  kind: HrEmployeeRewardKind;
  reason: string;
  decided_on: string;
  category?: string;
  /** Always >= 0; `kind` says which direction. */
  amount?: number;
  currency?: string;
  note?: string;
}

/**
 * `PATCH /hr/rewards/{id}` — the six descriptive columns.
 *
 * `employee_id` and `kind` are absent on purpose: the server answers 400 for
 * either, so widening this type is a contract change, not a convenience.
 * `amount: null` clears the money; `currency` cannot be cleared (the column is
 * NOT NULL) — null keeps the stored code.
 */
export interface UpdateHrEmployeeRewardRequest {
  category?: string | null;
  reason?: string;
  amount?: number | null;
  currency?: string;
  decided_on?: string;
  note?: string | null;
}

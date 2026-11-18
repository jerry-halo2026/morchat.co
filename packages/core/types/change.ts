/**
 * Employee file change stream (docs/engineering/WORKBENCH-API.md §16).
 *
 * The roster's 异动 tab used to be an empty "table pending" state because nothing
 * recorded a change: probation confirmation, renewal, transfer, grade change and
 * salary adjustment were all plain PATCHes of the employee profile, so after a
 * write nobody could say what the record said before. This module is the model of
 * the list that replaced it.
 *
 * ```
 * hr_employee_profile  (the person)
 *      ↓ PATCH /employees   (department_id / job_title / grade /
 *      ↓                     contract_end / regular_date moved)
 * HrEmployeeChange[]     append-only: one row per change, ordered effective_on DESC
 *      ↑ POST /hr/changes  (the manual entry: 薪资, 入职补录)
 * ```
 *
 * Three rules the types encode:
 *
 *   - **Append-only.** `PATCH /hr/changes/{id}` accepts `note` and nothing else —
 *     that is why `UpdateHrEmployeeChangeRequest` has one field. A wrong fact is
 *     corrected by recording another row.
 *   - **`from_*` / `to_*` are a snapshot, not pointers.** Every pair is nullable,
 *     and a NULL means "this change was not about that field" (`(none)` in the
 *     generated note) rather than "unchanged".
 *   - **`kind` names one milestone, `note` names all of them.** A PATCH can move a
 *     grade and a contract end at once; the row carries the higher-priority kind
 *     and the note lists every moved field.
 */

/**
 * What kind of change this was. A closed enum because "what kinds of change happen
 * here" is a question the page groups by; the free text lives in `note`.
 */
export type HrEmployeeChangeKind =
  | "hire"
  | "regularize"
  | "renew"
  | "move"
  | "promote"
  | "grade"
  | "salary"
  | "leave"
  | "other";

/** One recorded change. */
export interface HrEmployeeChange {
  id: string;
  workspace_id: string;
  /** The `HrEmployeeProfile` this event is about. */
  employee_id: string;
  kind: HrEmployeeChangeKind;
  /** Calendar day `YYYY-MM-DD`: when the change took effect, not when it was typed. */
  effective_on: string;
  from_department_id: string | null;
  to_department_id: string | null;
  from_job_title: string | null;
  to_job_title: string | null;
  from_grade: string | null;
  to_grade: string | null;
  from_contract_end: string | null;
  to_contract_end: string | null;
  /** Salary adjustments only; amounts are JSON numbers (§3.1). */
  from_amount: number | null;
  to_amount: number | null;
  /** `CNY` and friends; empty when the entry is not about money. */
  currency: string;
  note: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
}

export interface HrEmployeeChangeListResponse {
  changes: HrEmployeeChange[];
  /** This page's row count, not the workspace total (§3.1). */
  total: number;
}

export interface HrEmployeeChangeListFilters {
  employee_id?: string;
  kind?: HrEmployeeChangeKind | string;
  /** Inclusive `effective_on` window, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  limit?: number;
}

/**
 * `POST /hr/changes` — the manual entry. `employee_id`, `kind` and `effective_on`
 * are required; every from/to pair is optional because a salary adjustment says
 * nothing about a department. There is no `owner_member_id`: the row belongs to
 * the employee profile's owner.
 */
export interface CreateHrEmployeeChangeRequest {
  employee_id: string;
  kind: HrEmployeeChangeKind;
  effective_on: string;
  from_department_id?: string;
  to_department_id?: string;
  from_job_title?: string;
  to_job_title?: string;
  from_grade?: string;
  to_grade?: string;
  from_contract_end?: string;
  to_contract_end?: string;
  from_amount?: number;
  to_amount?: number;
  currency?: string;
  note?: string;
}

/**
 * `PATCH /hr/changes/{id}` — `note` is the only editable field. The server
 * answers 400 for any other key, so widening this type is a contract change, not
 * a convenience.
 */
export interface UpdateHrEmployeeChangeRequest {
  note?: string | null;
}

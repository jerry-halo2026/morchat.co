/**
 * Offboarding management (docs/engineering/WORKBENCH-API.md §15).
 *
 * The HR workbench's 离职管理 page had no server side at all: the plan lived in
 * component state, the handover checklist was an array literal, and nothing
 * survived a reload. This module is the model of what replaced it — one record per
 * person leaving, walked through the four segments the page already used.
 *
 * ```
 * hr_employee_profile  (the person; `leave_date` is the fact they are gone)
 *      ↓ 发起离职
 * HrOffboarding.status: apply → handover → done      (+ cancelled as the way out)
 *      ↓ handover[] ticked one entry at a time
 * leave_date ← last_day  (written by the `done` transition, one transaction)
 * ```
 *
 * Three rules the types encode:
 *
 *   - **`status` is a state machine, not a field.** Only `advance` (forward one
 *     step) and `cancel` (out) move it; a PATCH that carries a different status is
 *     a 400, and a create always starts in `apply`. So there is no
 *     `UpdateHrOffboardingRequest["status"]` here.
 *   - **`last_day` is the plan, `leave_date` is the fact.** The record owns the
 *     plan; the employee row owns the fact, written from it when the record
 *     reaches `done`. Editing a done record's `last_day` rewrites the fact.
 *   - **`handover` is a checklist, not a child table.** Entry keys are unique
 *     within the list and generated server-side when a client only sends labels;
 *     the routes address entries by index, and every one of them answers the whole
 *     record (deleting entry 3 renumbers the rest).
 */

import type { HrEmployeeProfile } from "./workbench";

/** The page's four segments, in the order it walked them. */
export type HrOffboardingStatus = "apply" | "handover" | "done" | "cancelled";

/**
 * Why the employment ended. `reason` keeps the free text a person typed; this
 * enum is what a departure report groups by, which is why it is not nullable.
 */
export type HrOffboardingKind = "voluntary" | "involuntary" | "contract_end" | "other";

/**
 * One handover checklist entry.
 *
 * `key` is a stable name, unique inside the list — the server assigns `ho-<n>`
 * when a client sends only a label, so an entry stays addressable after a
 * reorder. The routes themselves address by index.
 */
export interface HrHandoverItem {
  key: string;
  label: string;
  done: boolean;
  note: string;
}

/** One person's exit record. */
export interface HrOffboarding {
  id: string;
  workspace_id: string;
  /** The `HrEmployeeProfile` this record is about. */
  employee_id: string;
  status: HrOffboardingStatus;
  /** Calendar day `YYYY-MM-DD`: the planned last day, required. */
  last_day: string;
  /** Free text. Null until somebody writes down why. */
  reason: string | null;
  kind: HrOffboardingKind;
  /** The checklist. Always an array, never null. */
  handover: HrHandoverItem[];
  /** 离职证明已开. */
  cert_done: boolean;
  note: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface HrOffboardingListResponse {
  offboardings: HrOffboarding[];
  /** This page's row count, not the workspace total (contract §3.1). */
  total: number;
}

export interface HrOffboardingListFilters {
  /** One segment, or omitted for every live record. */
  status?: HrOffboardingStatus | string;
  employee_id?: string;
  limit?: number;
}

export interface CreateHrOffboardingRequest {
  employee_id: string;
  last_day: string;
  reason?: string;
  /** Defaults to `voluntary`. */
  kind?: HrOffboardingKind;
  /** Omit to start empty; the whole array is replaced when sent. */
  handover?: HrHandoverItem[];
  cert_done?: boolean;
  note?: string;
  owner_member_id?: string;
}

/**
 * Every field optional: an omitted one keeps its stored value. `status` is
 * deliberately absent — it moves through `advance`/`cancel` — and `employee_id`
 * may only be echoed back (changing it is a 400, because it would re-point whose
 * exit this is).
 */
export type UpdateHrOffboardingRequest = Partial<CreateHrOffboardingRequest>;

/**
 * `PATCH /offboardings/{id}/handover/{index}` — the tick. `label` is not editable:
 * renaming an entry changes what the record says was handed over.
 */
export interface UpdateHrHandoverItemRequest {
  done?: boolean;
  note?: string;
}

/**
 * The employee file as the `done` transition leaves it: the profile every other
 * HR route answers, plus `leave_date` — the day they actually left, which is the
 * column this record writes.
 */
export interface HrOffboardingEmployee extends HrEmployeeProfile {
  leave_date: string | null;
}

/**
 * `POST /offboardings/{id}/advance` — `apply → handover → done`.
 *
 * `employee` is null until the record reaches `done`: the earlier step does not
 * touch the employee file, and a client that always received a profile would have
 * to guess whether its `leave_date` is current.
 */
export interface HrOffboardingAdvanceResponse {
  offboarding: HrOffboarding;
  employee: HrOffboardingEmployee | null;
}

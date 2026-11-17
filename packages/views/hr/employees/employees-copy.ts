"use client";

import { useCallback } from "react";
import { useT } from "../../i18n";

/**
 * The roster's copy, and the one place its bundle keys are written down.
 *
 * Every string the roster draws lives in the `layout` bundle under
 * `hr.employees.*`, next to the three entries the page shell already used
 * (`empty_title`, `empty_description`, `action`). The table below is the English
 * edition of those keys: it is passed as `defaultValue`, so a bundle that does
 * not carry a key yet — the eight locales are merged separately from this
 * directory — shows the English words instead of the raw path.
 *
 * The selector form (`t(($) => $.hr.employees.x)`) cannot be used for the new
 * keys until they land in the locale JSON files: that JSON is the type of the
 * selector, and an unknown path is a compile error. One cast here keeps that
 * compile-time gap in a single place instead of forty call sites, and the union
 * below still catches a key that is spelled one way in the table and another in
 * the page.
 */
const COPY = {
  /** Search field: what the four text columns answer to. */
  search: "Search name, role or ID",
  no_matches_title: "No employee matches",
  no_matches_query: "Nothing matches “{{query}}”.",
  error_title: "Couldn’t load employees",
  error_description: "The roster did not load. Try again.",
  error_retry: "Retry",

  column_name: "Name",
  column_department: "Department",
  column_job_title: "Role",
  column_grade: "Grade",
  column_hire_date: "Hired",
  column_status: "Status",
  column_contact: "Contact",

  status_probation: "Probation",
  status_regular: "On staff",
  status_pending_leave: "Leaving",
  status_left: "Left",

  filter_department: "Department",
  filter_status: "Status",
  filter_any_department: "Any department",
  filter_any_status: "Any status",

  // 新增员工 reuses the shell's own `hr.employees.action`, so it is not listed.
  action_import: "Import",
  action_export: "Export",
  export_filename: "employees",

  row_edit: "Edit",
  row_regularize: "Confirm as regular",
  row_renew: "Renew contract",
  row_move: "Change department",
  row_delete: "Remove",

  tab_profile: "Profile",
  tab_contract: "Contract",
  tab_rewards: "Rewards & discipline",
  tab_history: "Changes",

  section_basic: "Basic",
  section_ability: "Ability",
  section_disc: "Personality",
  ability_empty: "No ability scores yet",
  disc_empty: "No DISC profile yet",

  field_department: "Department",
  field_job_title: "Role",
  field_grade: "Grade",
  field_hire_date: "Hired",
  field_regular_date: "Confirmed",
  field_contract_end: "Contract ends",
  field_email: "Email",

  disc_d: "Dominance",
  disc_i: "Influence",
  disc_s: "Steadiness",
  disc_c: "Conscientiousness",

  contract_none: "No contract on file",
  contract_expired: "Expired {{days}} days ago",
  contract_due_today: "Ends today",
  contract_remaining: "{{days}} days left",
  contract_soon: "Renew within 60 days",

  rewards_empty_title: "No table yet",
  rewards_empty_description:
    "Rewards and discipline wait on hr_employee_reward; nothing can be recorded until that table exists.",
  history_empty_title: "No table yet",
  history_empty_description:
    "Transfers, promotions and renewals wait on hr_employee_change; this page will list them once the table exists.",

  edit_title: "Edit employee",
  save: "Save",
  cancel: "Cancel",
  write_failed: "Couldn’t save the change.",

  regularize_title: "Confirm as regular",
  regularize_description: "Sets the confirmation date to {{date}}.",
  regularize_confirm: "Confirm",

  renew_title: "Renew contract",
  renew_description: "Current end date: {{date}}.",
  renew_label: "New end date",
  renew_confirm: "Renew",

  move_title: "Change department",
  move_description: "Moves the employee out of {{from}}.",
  move_label: "Department",
  move_confirm: "Move",

  delete_title: "Remove employee",
  delete_description: "The profile is archived. The workspace member is not deleted.",
  delete_confirm: "Remove",
} as const;

export type EmployeesCopyKey = keyof typeof COPY;

export type EmployeesTranslate = (
  key: EmployeesCopyKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * `t` for the roster's own keys. See the note above the table for why the
 * namespace's typed selector stops at the bundle's current contents.
 *
 * The returned function is stable across renders (it only depends on `t`), so a
 * `useMemo` over column definitions keyed on it does not rebuild every frame.
 */
export function useEmployeesCopy(): EmployeesTranslate {
  const { t } = useT("layout");
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return useCallback<EmployeesTranslate>(
    (key, vars) => translate(`hr.employees.${key}`, { defaultValue: COPY[key], ...vars }),
    [translate],
  );
}

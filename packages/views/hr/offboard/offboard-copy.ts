"use client";

import { useCallback } from "react";
import type { HrOffboardingKind, HrOffboardingStatus } from "@morechat/core/types";
import { useT } from "../../i18n";
import type { OffboardSegment } from "./offboard-model";

/**
 * The offboarding page's copy, and the one place its bundle keys are written
 * down.
 *
 * Every string the page draws lives in the `layout` bundle under
 * `hr.offboard.*`. The three entries the page shell already had
 * (`empty_title`, `empty_description`, `action`) are read through the typed
 * selector in `offboard-page.tsx`; the table below is the English edition of
 * everything this page adds, passed as `defaultValue`, so a bundle that does not
 * carry a key yet — the eight locales are merged separately from this directory
 * — shows the English words instead of the raw path.
 *
 * The selector form (`t(($) => $.hr.offboard.x)`) cannot be used for these keys
 * until they land in `locales/{locale}/layout.json`: that JSON is the type of the
 * selector, and an unknown path is a compile error. One cast here keeps that
 * compile-time gap in a single place, and `OffboardCopyKey` still catches a key
 * spelled one way in the table and another in the page — including the status
 * and departure-type bridges at the bottom, which are exhaustive over the wire
 * enums, so a new status cannot be drawn without a label.
 */
const COPY = {
  /** The segments' names: the page's three readings of the same list. */
  segment_label: "Departure stage",
  segment_apply: "Requested",
  segment_handover: "Handing over",
  segment_done: "Finished",

  list_label: "Offboardings",

  column_employee: "Employee",
  column_kind: "Departure type",
  column_last_day: "Last day",
  column_handover: "Handover",
  column_cert: "Certificate",
  column_status: "Status",

  status_apply: "Requested",
  status_handover: "Handing over",
  status_done: "Finished",
  status_cancelled: "Cancelled",

  kind_voluntary: "Voluntary",
  kind_involuntary: "Involuntary",
  kind_contract_end: "Contract ended",
  kind_other: "Other",

  /** 交接进度: the ticked entries over the whole checklist. */
  handover_progress: "{{done}}/{{total}}",
  cert_issued: "Issued",
  cert_missing: "Not issued",

  empty_segment_title: "Nothing at this stage",
  error_title: "Couldn’t load offboardings",
  error_description: "The departure list did not arrive. Try again.",
  error_retry: "Retry",

  action_export: "Export",
  export_filename: "offboardings",

  section_details: "Details",
  section_handover: "Handover checklist",
  field_last_day: "Last day",
  field_kind: "Departure type",
  field_reason: "Reason",
  field_note: "Note",
  field_cert: "Certificate issued",
  save: "Save",
  write_failed: "The server refused this change.",
  sheet_readonly: "Read only — an owner or admin can change this record.",

  handover_empty: "No item on the checklist yet.",
  handover_add_placeholder: "What still has to be handed over?",
  handover_add: "Add",
  handover_item_note: "Note for this item",
  handover_remove: "Remove this item",
  handover_sealed: "The checklist is closed once the record is finished.",

  exit_recorded_title: "Exit recorded",
  done_leave_date: "Left on {{date}}",
  done_recorded: "The employee file records this as their leave date.",
  cancelled_note: "This offboarding was cancelled. Its checklist no longer accepts changes.",

  action_advance: "Move to handover",
  action_complete: "Finish offboarding",
  action_cancel: "Cancel offboarding",

  confirm_incomplete_title: "Handover is not complete",
  confirm_incomplete_description:
    "{{count}} items are still open. Finishing closes the checklist and writes the last day into the employee file; the record keeps what was left open.",
  confirm_incomplete_confirm: "Finish anyway",
  confirm_incomplete_cancel: "Back to the checklist",

  create_title: "Start an offboarding",
  create_employee: "Employee",
  create_employee_placeholder: "Pick an employee",
  create_last_day: "Last day",
  create_kind: "Departure type",
  create_reason: "Reason",
  create_reason_placeholder: "Why they are leaving",
  create_submit: "Start",
  create_cancel: "Cancel",
  create_conflict: "This employee already has an offboarding on file.",
  create_failed: "The server refused this record.",
  create_empty: "Everyone on staff already has an offboarding on file.",

  expand_show: "Show more",
  expand_hide: "Show less",
} as const;

export type OffboardCopyKey = keyof typeof COPY;

/** The English edition, for the bundle merge and for `defaultValue`. */
export const OFFBOARD_COPY: Readonly<Record<OffboardCopyKey, string>> = COPY;

/**
 * The three enum bridges. Each is exhaustive over its wire enum, so a status,
 * a segment or a departure type the server adds is a compile error here rather
 * than a cell reading `undefined` on screen.
 */
export const SEGMENT_COPY_KEYS: Readonly<Record<OffboardSegment, OffboardCopyKey>> = {
  apply: "segment_apply",
  handover: "segment_handover",
  done: "segment_done",
};

export const STATUS_COPY_KEYS: Readonly<Record<HrOffboardingStatus, OffboardCopyKey>> = {
  apply: "status_apply",
  handover: "status_handover",
  done: "status_done",
  cancelled: "status_cancelled",
};

export const KIND_COPY_KEYS: Readonly<Record<HrOffboardingKind, OffboardCopyKey>> = {
  voluntary: "kind_voluntary",
  involuntary: "kind_involuntary",
  contract_end: "kind_contract_end",
  other: "kind_other",
};

export type OffboardTranslate = (
  key: OffboardCopyKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * `t` for the page's own keys. See the note above the table for why the
 * namespace's typed selector stops at the bundle's current contents.
 *
 * The returned function is stable across renders (it only depends on `t`), so a
 * `useMemo` over column definitions keyed on it does not rebuild every frame.
 */
export function useOffboardCopy(): OffboardTranslate {
  const { t } = useT("layout");
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return useCallback<OffboardTranslate>(
    (key, vars) => translate(`hr.offboard.${key}`, { defaultValue: COPY[key], ...vars }),
    [translate],
  );
}

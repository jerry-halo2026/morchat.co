"use client";

import { useCallback } from "react";
import { useT } from "../../i18n";

/**
 * The screening page's copy, and the one place its bundle keys are written down.
 *
 * Every string the page draws lives in the `layout` bundle under
 * `hr.resumes.*`, next to the three entries the page shell already used
 * (`empty_title`, `empty_description`, `action`). The table below is the English
 * edition of those keys: it is passed as `defaultValue`, so a bundle that does
 * not carry a key yet — the eight locales are merged separately from this
 * directory — shows the English words instead of the raw path.
 *
 * The selector form (`t(($) => $.hr.resumes.x)`) cannot be used for the new keys
 * until they land in the locale JSON files: that JSON is the type of the
 * selector, and an unknown path is a compile error. One cast here keeps that
 * compile-time gap in a single place instead of twenty call sites, and the key
 * union below still catches a key spelled one way in the table and another in
 * the page.
 */
const COPY = {
  /** The strip above the two columns: how much reading is left in this role. */
  pending_hint: "{{count}} waiting for screening",
  list_label: "Candidates",
  /** The role picker's accessible name; the trigger shows the role's title. */
  filter_job: "Role",
  sort_label: "Sort",
  sort_queue: "Queue",
  sort_match: "Best match",

  /** A row nobody has scored: "not scored" is not a score of zero. */
  score_none: "Not scored",
  /** Empty cell: a row has no source, no expectation, no attachment. */
  empty_value: "—",
  select_row: "Select {{name}}",
  /** " yrs" beside the education in the preview header. */
  years: "{{count}} yr",

  action_approve: "Approve",
  action_reject: "Reject",
  action_undo: "Undo",
  action_cancel: "Cancel",

  batch_selected: "{{count}} selected",
  /** Why the batch approve button is unavailable: nothing it would act on. */
  batch_approve_none: "None of the selected candidates is waiting for screening",
  write_failed: "The server refused this change. Nothing was saved.",
  batch_failed: "{{count}} candidates were not updated.",

  error_title: "Couldn’t load applications",
  error_description: "The screening queue did not arrive. Try again.",
  error_retry: "Retry",

  export_filename: "hr-resumes",
} as const;

export type ResumesCopyKey = keyof typeof COPY;

export type ResumesTranslate = (
  key: ResumesCopyKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * `t` for the screening page's own keys. See the note above the table for why
 * the namespace's typed selector stops at the bundle's current contents.
 */
export function useResumesCopy(): ResumesTranslate {
  const { t } = useT("layout");
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return useCallback<ResumesTranslate>(
    (key, vars) => translate(`hr.resumes.${key}`, { defaultValue: COPY[key], ...vars }),
    [translate],
  );
}

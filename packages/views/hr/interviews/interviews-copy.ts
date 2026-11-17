"use client";

import type { HrInterviewMode, HrInterviewStatus, HrScorecardVerdict } from "@morechat/core/types";
import { useT } from "../../i18n";

/**
 * The interview page's copy, and the one place its bundle keys are written down.
 *
 * Every string the page adds lives in the `layout` bundle under
 * `hr.interviews.*`, beside the four entries the page skeleton already used
 * (`empty_title`, `empty_description`, `action`, and the nav row's name). The
 * table below is the English edition of those keys: it is passed as
 * `defaultValue`, so a bundle that does not carry a key yet — the eight locales
 * are merged separately from this directory — shows the English words instead of
 * the raw path.
 *
 * The selector form (`t(($) => $.hr.interviews.x)`) cannot be used for the new
 * keys until they land in `locales/{locale}/layout.json`: the bundle's JSON is
 * the type of that form, and an unknown path is a compile error. One cast here
 * keeps that gap in a single place instead of sixty call sites, and
 * `InterviewsCopyKey` still catches a key spelled one way in the table and
 * another in the page — including the enum bridges at the bottom, which are
 * exhaustive over the wire enums, so a new interview status cannot be drawn
 * without a label.
 */
const COPY = {
  view_label: "View",
  view_week: "Week",
  view_list: "List",
  export: "Export",
  week_empty: "No interviews this week",
  week_label: "Interview week",
  list_label: "Interviews",

  error_title: "Couldn't load interviews",
  error_description: "The interview calendar did not arrive. Try again.",
  error_retry: "Retry",

  /** One line on a calendar chip: `{{name}}` of `{{round}}`. */
  event: "{{name}} · {{round}}",
  round: "Round {{round}}",
  duration: "{{minutes}} min",

  column_candidate: "Candidate",
  column_round: "Round",
  column_time: "Time",
  column_duration: "Duration",
  column_interviewer: "Interviewer",
  column_mode: "Mode",
  column_status: "Status",

  mode_onsite: "Onsite",
  mode_video: "Video",
  mode_phone: "Phone",
  mode_none: "Not set",

  status_scheduled: "Scheduled",
  status_done: "Done",
  status_cancelled: "Cancelled",
  status_no_show: "No show",

  form_create_title: "Schedule interview",
  form_create_description: "A candidate, a round, a time and who runs it.",
  form_edit_title: "Move this interview",
  form_edit_description: "The candidate stays; only the slot changes.",
  form_candidate: "Candidate",
  form_candidate_placeholder: "Pick a candidate",
  form_no_candidates: "Add a candidate first — an interview belongs to one.",
  form_round: "Round",
  form_date: "Date",
  form_time: "Time",
  form_duration: "Duration",
  form_interviewer: "Interviewer",
  form_interviewer_placeholder: "Pick a member",
  form_interviewer_name: "Interviewer name",
  form_interviewer_name_placeholder: "Someone from outside the workspace",
  form_mode: "Mode",
  form_mode_placeholder: "Not decided",
  form_note: "Note",
  form_note_placeholder: "What to prepare, or who else sits in",
  form_save: "Save",
  form_saving: "Saving",
  form_cancel: "Cancel",
  form_conflict: "This interviewer already has an interview at this time.",
  form_failed: "The server refused this interview. Try again.",

  detail_when: "When",
  detail_duration: "Duration",
  detail_interviewer: "Interviewer",
  detail_mode: "Mode",
  detail_status: "Status",
  detail_note: "Note",
  detail_no_note: "No note",
  detail_rescheduled: "Rescheduled {{count}}×",
  detail_edit: "Move",
  detail_delete: "Delete",

  delete_title: "Delete this interview?",
  delete_description: "The slot frees up for someone else. Its scorecards stay.",
  delete_confirm: "Delete",
  delete_cancel: "Keep",
  delete_failed: "The server refused to delete this interview.",

  score_title: "Scorecard",
  score_description: "Four dimensions, 0–5. Skill carries 40 of the whole.",
  score_empty: "Nobody has scored this interview yet.",
  score_skill: "Skill",
  score_experience: "Experience",
  score_culture: "Culture fit",
  score_potential: "Potential",
  score_unrated: "Not rated",
  score_weighted: "Weighted",
  score_verdict: "Verdict",
  score_verdict_placeholder: "Pick a verdict",
  score_comment: "Comment",
  score_comment_placeholder: "Strengths, doubts, what the next round should probe",
  score_save: "Save score",
  score_saving: "Saving",
  score_failed: "The server refused this score.",

  verdict_strong_yes: "Strong yes",
  verdict_yes: "Yes",
  verdict_no: "No",
  verdict_strong_no: "Strong no",
} as const;

export type InterviewsCopyKey = keyof typeof COPY;

/** The English edition, for the bundle merge and for `defaultValue`. */
export const INTERVIEWS_COPY: Readonly<Record<InterviewsCopyKey, string>> = COPY;

/** The wire enums, each with the key that names it on screen. */
export const VIEW_KEYS: Readonly<Record<"week" | "list", InterviewsCopyKey>> = {
  week: "view_week",
  list: "view_list",
};

export const MODE_KEYS: Readonly<Record<HrInterviewMode | "none", InterviewsCopyKey>> = {
  onsite: "mode_onsite",
  video: "mode_video",
  phone: "mode_phone",
  none: "mode_none",
};

export const STATUS_KEYS: Readonly<Record<HrInterviewStatus, InterviewsCopyKey>> = {
  scheduled: "status_scheduled",
  done: "status_done",
  cancelled: "status_cancelled",
  no_show: "status_no_show",
};

export const VERDICT_KEYS: Readonly<Record<HrScorecardVerdict, InterviewsCopyKey>> = {
  strong_yes: "verdict_strong_yes",
  yes: "verdict_yes",
  no: "verdict_no",
  strong_no: "verdict_strong_no",
};

export type InterviewsTranslate = (
  key: InterviewsCopyKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * `t` for the page's own keys. See the note above the table for why the
 * namespace's typed selector stops at the bundle's current contents.
 */
export function useInterviewsCopy(): InterviewsTranslate {
  const { t } = useT("layout");
  const translate = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  return (key, vars) => translate(`hr.interviews.${key}`, { defaultValue: COPY[key], ...vars });
}

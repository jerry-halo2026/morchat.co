"use client";

import { useCallback } from "react";
import { useT } from "../../i18n";

/**
 * The interview-guide page's copy, and the one place its bundle keys are written
 * down.
 *
 * Every string the page adds lives in the `layout` bundle under `hr.guide.*`.
 * The three entries the page shell already had (`empty_title`,
 * `empty_description`, `action`) were carried over from the page this one
 * replaces and are read through the typed selector in `guide-page.tsx`; the
 * table below is the English edition of the rest, passed as `defaultValue`, so a
 * bundle that does not carry a key yet — the eight locales are merged separately
 * from this directory — shows the English words instead of the raw path.
 *
 * The selector form (`t(($) => $.hr.guide.x)`) cannot be used for these keys
 * until they land in `locales/{locale}/layout.json`: that JSON is the type of the
 * selector, and an unknown path is a compile error. One cast here keeps that
 * compile-time gap in a single place, and `GuideCopyKey` still catches a key
 * spelled one way in the table and another in the page — including the enum
 * bridges at the bottom, which are exhaustive over the wire enums, so a new
 * dimension or status cannot be drawn without a label.
 */
const COPY = {
  round: "Round {{round}}",

  status_draft: "Draft",
  status_ready: "Ready",
  status_used: "Used",

  dimension_skill: "Skill",
  dimension_experience: "Experience",
  dimension_culture: "Culture fit",
  dimension_potential: "Potential",
  dimension_risk: "Red flag",

  column_candidate: "Candidate",
  column_round: "Round",
  column_status: "Status",
  column_questions: "Questions",
  column_asked: "Asked",
  column_updated: "Updated",

  list_label: "Interview guides",
  empty_pick: "Pick a candidate to start an outline.",

  error_title: "Couldn't load interview guides",
  error_description: "The outlines did not arrive. Try again.",
  error_retry: "Retry",

  create_title: "New interview guide",
  create_candidate: "Candidate",
  create_candidate_placeholder: "Pick a candidate",
  create_round: "Round",
  create_cancel: "Cancel",
  create_submit: "Create",
  create_conflict: "This candidate already has an outline for this round.",
  create_failed: "The server refused this outline.",

  editor_details_show: "Show what it verifies",
  editor_details_hide: "Hide details",
  editor_move_up: "Move up",
  editor_move_down: "Move down",
  editor_remove: "Remove this question",
  editor_intent: "What it verifies",
  editor_signals: "Strong answer",
  editor_red_flags: "Red flags",
  editor_empty: "No question yet. Draft a set, pick from the bank, or write your own.",
  editor_generate: "Draft from JD and résumé",
  editor_generating: "Drafting",
  editor_generate_failed: "The draft did not come back. Try again.",
  editor_source_template: "Template skeleton — edit before you use it",
  editor_source_ai: "Drafted by a model — review before you use it",
  editor_bank_title: "From the question bank",
  editor_bank_scope: "Bank scope",
  editor_bank_all: "Every question",
  editor_bank_job: "This role",
  editor_bank_dimension: "Dimension",
  editor_bank_any_dimension: "Any dimension",
  editor_bank_placeholder: "Add a question from the bank",
  editor_bank_empty: "No question in the bank matches",
  editor_bank_duplicate: "That question is already in this outline.",
  editor_custom_title: "Write your own",
  editor_custom_dimension: "Dimension",
  editor_custom_question: "Question",
  editor_custom_question_placeholder: "What do you want to hear about?",
  editor_custom_add: "Add question",
  editor_custom_store: "Also save it to the question bank",
  editor_custom_failed: "The question was not added.",

  save: "Save",
  saving: "Saving",
  save_failed: "The server refused this outline.",
  cancel: "Close",

  delete: "Delete outline",
  delete_title: "Delete this outline?",
  delete_description: "The questions and the notes from the round go with it.",
  delete_confirm: "Delete",
  delete_cancel: "Keep",
  delete_failed: "The server refused to delete this outline.",

  run_start: "Start the interview",
  run_label: "Interview in progress",
  run_progress: "{{current}} / {{total}}",
  run_asked: "Asked",
  run_note: "What they said",
  run_note_placeholder: "Their words, close to what they said",
  run_score: "Score",
  run_unrated: "Not scored",
  run_prev: "Previous",
  run_next: "Next",
  run_finish: "Finish and save",
  run_finished: "Saved. Fill the scorecard next.",
  run_failed: "The server refused the saved outline.",
  run_exit: "Leave the interview",
  run_empty: "This outline has no question yet.",
} as const;

export type GuideCopyKey = keyof typeof COPY;

/** The English edition, for the bundle merge and for `defaultValue`. */
export const GUIDE_COPY: Readonly<Record<GuideCopyKey, string>> = COPY;

export type GuideTranslate = (
  key: GuideCopyKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * `t` for the page's own keys. See the note above the table for why the
 * namespace's typed selector stops at the bundle's current contents.
 */
export function useGuideCopy(): GuideTranslate {
  const { t } = useT("layout");
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return useCallback<GuideTranslate>(
    (key, vars) => translate(`hr.guide.${key}`, { defaultValue: COPY[key], ...vars }),
    [translate],
  );
}

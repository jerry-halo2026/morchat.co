"use client";

import { useCallback } from "react";
import type {
  HrCandidateStage,
  HrQuestionDimension,
  HrScorecardVerdict,
} from "@morechat/core/types";
import { useT } from "../../i18n";

/**
 * The 综合成绩 page's copy, and the one place its bundle keys are written down.
 *
 * Every string the page adds lives in the `layout` bundle under `hr.scores.*`,
 * beside the three entries the page shell already had (`empty_title`,
 * `empty_description`, `action`) — those three are read through the typed
 * selector in `scores-page.tsx`, and the nav row's own name
 * (`nav.hr_scores`) is the page title.
 *
 * The table below is the English edition of the rest, passed as `defaultValue`,
 * so a bundle that does not carry a key yet — the eight locales are merged
 * separately from this directory — shows the English words instead of the raw
 * path. The selector form cannot be used for these keys until they land in
 * `locales/{locale}/layout.json`: that JSON is the type of the selector, and an
 * unknown path is a compile error. One cast here keeps that gap in a single
 * place, and `ScoresCopyKey` still catches a key spelled one way in the table and
 * another in the page — including the enum bridges at the bottom, which are
 * exhaustive over the wire enums, so a new stage, dimension or verdict cannot be
 * drawn without a label.
 *
 * The dimension and verdict words repeat `hr.interviews.*`'s instead of reaching
 * into another page's keys: a bundle path is a page's own vocabulary, and the
 * guide page made the same call for the same four dimensions. The merge that
 * lands this table can point either path at one string.
 *
 * One stale word is worth knowing about: `nav.hr_scores` says "Scorecard", which
 * is what this route was called before the written test was cut. The page keeps
 * reading it — a page title that disagrees with the navigation row is worse than
 * an old word — and the merge should retitle that key to "Combined scores".
 */
const COPY = {
  list_label: "Combined scores",
  job_filter_label: "Role",
  job_filter_any: "Every role",
  export: "Export",
  export_filename: "combined-scores",

  error_title: "Couldn’t load scores",
  error_description: "The scorecards did not arrive. Try again.",
  error_retry: "Retry",

  no_matches_title: "No candidate in this role",

  unscored: "Nobody has been scored yet — every row below is waiting on its first scorecard.",

  column_candidate: "Candidate",
  column_stage: "Stage",
  column_resume: "Résumé",
  column_match: "Match",
  column_interview: "Interview avg",
  column_guide: "Guide avg",
  column_combined: "Combined",
  column_verdict: "Verdict",
  column_rounds: "Rounds",

  /**
   * The `—` cell's tooltip: what the combined score is still waiting on. Two
   * cases, because "no scorecard" and "nothing at all" are different answers.
   */
  combined_gap_interview: "No interview score yet — the combined score starts with a scorecard.",
  combined_gap_all: "No interview score and no guide score yet.",

  stage_screening: "Screening",
  stage_test: "Test",
  stage_interview: "Interview",
  stage_scored: "Scored",
  stage_offer: "Offer",
  stage_hired: "Hired",
  stage_rejected: "Rejected",
  stage_withdrawn: "Withdrawn",

  verdict_strong_yes: "Strong yes",
  verdict_yes: "Yes",
  verdict_no: "No",
  verdict_strong_no: "Strong no",

  dimension_skill: "Skill",
  dimension_experience: "Experience",
  dimension_culture: "Culture fit",
  dimension_potential: "Potential",
  dimension_risk: "Red flag",

  section_summary: "Summary",
  radar_label: "Scorecard dimension averages",
  radar_empty: "No scorecard yet",
  summary_combined: "Combined",
  summary_interview: "Interview avg",
  summary_guide: "Guide avg",
  summary_weights: "Interview 70% · guide 30%",

  section_interviews: "Interviews",
  interviews_empty: "No round booked for this candidate yet.",
  round: "Round {{round}}",
  weighted: "Weighted",

  section_guide: "Guide scores",
  guide_empty: "No question has been scored in this candidate’s guides.",

  expand_show: "Show more",
  expand_hide: "Show less",

  sheet_readonly: "Read only — offers are sent from the recruiting board.",
} as const;

export type ScoresCopyKey = keyof typeof COPY;

/** The English edition, for the bundle merge and for `defaultValue`. */
export const SCORES_COPY: Readonly<Record<ScoresCopyKey, string>> = COPY;

export type ScoresTranslate = (
  key: ScoresCopyKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * `t` for the page's own keys. See the note above the table for why the
 * namespace's typed selector stops at the bundle's current contents.
 *
 * The returned function is stable across renders (it depends only on `t`), so it
 * may key a `useMemo` without rebuilding it every frame.
 */
export function useScoresCopy(): ScoresTranslate {
  const { t } = useT("layout");
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return useCallback<ScoresTranslate>(
    (key, vars) => translate(`hr.scores.${key}`, { defaultValue: COPY[key], ...vars }),
    [translate],
  );
}

/** Every stage the pipeline allows, so a badge cannot be drawn without a word. */
export const STAGE_KEYS: Readonly<Record<HrCandidateStage, ScoresCopyKey>> = {
  screening: "stage_screening",
  test: "stage_test",
  interview: "stage_interview",
  scored: "stage_scored",
  offer: "stage_offer",
  hired: "stage_hired",
  rejected: "stage_rejected",
  withdrawn: "stage_withdrawn",
};

export const VERDICT_KEYS: Readonly<Record<HrScorecardVerdict, ScoresCopyKey>> = {
  strong_yes: "verdict_strong_yes",
  yes: "verdict_yes",
  no: "verdict_no",
  strong_no: "verdict_strong_no",
};

/** The five question dimensions the guide groups by. */
export const DIMENSION_KEYS: Readonly<Record<HrQuestionDimension, ScoresCopyKey>> = {
  skill: "dimension_skill",
  experience: "dimension_experience",
  culture: "dimension_culture",
  potential: "dimension_potential",
  risk: "dimension_risk",
};

"use client";

import { useCallback } from "react";
import { useT } from "../../i18n";

/**
 * The analysis page's copy, and the one place its bundle keys are written down.
 *
 * Every string the page draws lives in the `layout` bundle under
 * `hr.analysis.*`, next to the three entries the page shell already used
 * (`empty_title`, `empty_description`, `action`). The table below is the English
 * edition of those keys: it is passed as `defaultValue`, so a bundle that does
 * not carry a key yet — the eight locales are merged separately from this
 * directory — shows the English words instead of the raw path.
 *
 * The selector form (`t(($) => $.hr.analysis.x)`) cannot be used for the new
 * keys until they land in the locale JSON files: that JSON is the type of the
 * selector, and an unknown path is a compile error. One cast here keeps that
 * compile-time gap in a single place instead of thirty call sites, and the union
 * below still catches a key spelled one way in the table and another in the page.
 *
 * The captions are the page's real content, not decoration: each one states the
 * 口径 of the numbers above it, which is the part of this page a reader is most
 * likely to take the wrong way.
 */
const COPY = {
  /** Header controls. */
  filter_department: "Department",
  scope_all: "All departments",
  scope_unassigned: "Unassigned",
  range_label: "Time range",
  range_3m: "3 months",
  range_6m: "6 months",
  range_12m: "12 months",

  /** The top strip. */
  kpi_headcount: "On staff",
  kpi_probation: "On probation",
  kpi_hires: "Joined (last {{months}} months)",
  kpi_turnover: "Turnover (last {{months}} months)",
  caption_kpis:
    "On staff = a hire date and no leave date; probation = on staff without a confirmation date. Turnover = departures in the window ÷ people on staff at the window start, and — when that base is 0.",

  /** The four charts, each with the reading its numbers were computed by. */
  chart_department: "Headcount by department",
  caption_department:
    "People on staff today, grouped by department, unassigned included. Follows the department filter; a name too long for the axis is cut short, hover it for the whole one.",
  chart_funnel: "Hiring funnel",
  caption_funnel:
    "Candidates whose current stage is at or past each step. Screened is everyone still in the pipeline, so a step can never be taller than the one above it. Rejected and withdrawn are left out: their stage no longer says how far they got.",
  chart_monthly: "Joins and departures by month",
  caption_monthly:
    "One bucket per month of the window: joins read the hire date, departures the leave date, so someone who joined and left inside it appears in both.",
  chart_tenure: "Tenure",
  caption_tenure:
    "Whole months from the hire date to today, for people on staff now. Exactly 3 months, 1 year or 5 years moves up a band, and the last band is 5 years and over.",

  /** Series names, stage names, tenure bands. */
  series_people: "People",
  series_hires: "Joined",
  series_departures: "Left",

  stage_screening: "Screening",
  stage_test: "Test",
  stage_interview: "Interview",
  stage_scored: "Scored",
  stage_offer: "Offer",
  stage_hired: "Hired",

  tenure_under_3m: "Under 3 months",
  tenure_m3_1y: "3–12 months",
  tenure_y1_3y: "1–3 years",
  tenure_y3_5y: "3–5 years",
  tenure_over_5y: "5 years and over",

  /** States. `empty_title` is the shell's own key, kept word for word. */
  empty_title: "No numbers to analyse yet",
  empty_body:
    "Headcount, the hiring funnel, monthly joins and departures, and tenure all read from the roster. Add an employee and this page fills in.",
  error_title: "Couldn’t load analytics",
  error_description: "The HR data did not load. Try again.",
  error_retry: "Retry",
  chart_empty: "Nothing to count here yet",
} as const;

export type AnalysisCopyKey = keyof typeof COPY;

export type AnalysisTranslate = (
  key: AnalysisCopyKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * `t` for the analysis page's own keys. See the note above the table for why the
 * namespace's typed selector stops at the bundle's current contents.
 *
 * The returned function is stable across renders (it only depends on `t`), so a
 * `useMemo` over the chart rows keyed on it does not rebuild every frame.
 */
export function useAnalysisCopy(): AnalysisTranslate {
  const { t } = useT("layout");
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return useCallback<AnalysisTranslate>(
    (key, vars) => translate(`hr.analysis.${key}`, { defaultValue: COPY[key], ...vars }),
    [translate],
  );
}

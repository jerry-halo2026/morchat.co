import type {
  Department,
  HrCandidate,
  HrEmployeeProfile,
  HrJob,
} from "@morechat/core/types";

/**
 * 人事分析: the four readings this page draws, as pure functions.
 *
 * The page aggregates on itself instead of through `packages/core` because
 * these are *its* charts, not the workbench metric contract: no other page
 * computes "headcount by department" or "tenure bands", so nothing here can
 * disagree with a number drawn somewhere else. Every reading below states its
 * 口径 in the comment above it, and the page repeats the same sentence under
 * the chart — this is the part of the page that is easiest to misread.
 *
 * The 口径, once, at the top:
 *
 *   在职      `hire_date` present and `leave_date` empty. A leave date, even a
 *             future one, takes the profile out: the rule is "no leave date",
 *             and the offboarding page stamps it on the day they actually go.
 *   试用期    on staff and `regular_date` empty.
 *   入职/离职  `hire_date` / `leave_date` themselves, inside the window — a
 *             person who joined and left inside it appears in both counts.
 *   离职率    期间内离职人数 ÷ 期初在职人数, `null` (the page's `—`) when that
 *             base is 0 rather than a division by zero dressed up as 0%.
 *   司龄      今天 − `hire_date`, in whole months; the bands are half-open, so
 *             exactly 3 / 12 / 60 months move up a band.
 *
 * Everything is a reading of rows the queries already returned: no fetch, no
 * store, no clock of its own (`now` is passed in), so `analysis-model.test.ts`
 * can pin the arithmetic and the page only draws it.
 *
 * One contract limit to keep in mind: `hr_employee_profile` and `hr_candidate`
 * lists are single pages (`limit` 50 by default, 200 at most) and the API client
 * sends no `limit`, so every count is over the rows that actually arrived. A
 * workspace large enough to page past that would need a server-side aggregate;
 * nothing here can tell that it happened.
 */

/** The three windows the header's toggle offers, in months. */
export const ANALYSIS_RANGES = [3, 6, 12] as const;

export type AnalysisRange = (typeof ANALYSIS_RANGES)[number];

/** Twelve months is the page's default: a year of hiring is a full cycle. */
export const DEFAULT_RANGE: AnalysisRange = 12;

/**
 * Scope sentinel for "these people have no department".
 *
 * A department scope is a department id, `null` for the whole workspace, or
 * this string for the unassigned bucket — `null` cannot mean both "everything"
 * and "nobody's department", and the picker offers both.
 */
export const UNASSIGNED_DEPARTMENT = "__unassigned";

export type DepartmentScope = string | null;

/** The window a reading is taken over: the clock, and how many months back. */
export interface AnalysisWindow {
  /** The clock one render was computed with (the page memoises one `Date`). */
  now: Date;
  /** Window length in months: 3, 6 or 12. */
  months: number;
}

/** Every reading this page draws, in the order the page assembles them. */
export interface AnalysisOptions extends AnalysisWindow {
  scope: DepartmentScope;
}

/** A civil calendar day. `hire_date` / `leave_date` are stored as `YYYY-MM-DD`. */
export interface CivilDay {
  year: number;
  /** 1–12, not the 0-based `Date.getMonth()`. */
  month: number;
  day: number;
}

/**
 * The calendar day a stored date names, or `null`.
 *
 * The first ten characters are read, so a full ISO timestamp (`hired_at`) works
 * as well as a bare `YYYY-MM-DD`. Out-of-range months and days are rejected; an
 * impossible day such as `2026-02-31` is not re-validated, because it is only
 * ever compared with another day and never used to do date arithmetic.
 */
export function parseDay(value: string | null | undefined): CivilDay | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Days since the epoch, for comparison only. */
function dayOrdinal(day: CivilDay): number {
  return Date.UTC(day.year, day.month - 1, day.day) / 86_400_000;
}

/** The reader's local calendar day for an instant. */
function civilDayOf(instant: Date): CivilDay {
  return {
    year: instant.getFullYear(),
    month: instant.getMonth() + 1,
    day: instant.getDate(),
  };
}

/**
 * The first day of the month `months - 1` back from `now`'s month: the window's
 * start, and the first bucket of the monthly chart.
 *
 * Month-aligned rather than "today minus N months" so the KPI counts and the
 * twelve bars describe the same span — two starts a few weeks apart would let
 * the strip and the chart disagree about the same person.
 */
export function windowStart(now: Date, months: number): CivilDay {
  const today = civilDayOf(now);
  const index = today.year * 12 + (today.month - 1) - (Math.max(1, months) - 1);
  return { year: Math.floor(index / 12), month: (index % 12) + 1, day: 1 };
}

/** One bucket of the monthly chart: a calendar month, oldest first. */
export interface AnalysisMonth {
  /** `YYYY-MM`, the bucket's stable key across a year boundary. */
  key: string;
  year: number;
  /** 1–12. */
  month: number;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The window's months, oldest first, ending with `now`'s month. */
export function windowMonths(now: Date, months: number): AnalysisMonth[] {
  const today = civilDayOf(now);
  const end = today.year * 12 + (today.month - 1);
  const count = Math.max(1, months);
  const out: AnalysisMonth[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const index = end - offset;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    out.push({ key: monthKey(year, month), year, month });
  }
  return out;
}

/** Whether a profile's department falls inside the scope. */
export function matchesScope(
  departmentId: string | null,
  scope: DepartmentScope,
): boolean {
  if (scope === null) return true;
  if (scope === UNASSIGNED_DEPARTMENT) return departmentId === null;
  return departmentId === scope;
}

/** 在职: a hire date and no leave date. */
export function isWorking(profile: HrEmployeeProfile): boolean {
  return parseDay(profile.hire_date) !== null && parseDay(profile.leave_date) === null;
}

/** 试用期: on staff, and no confirmation date yet. */
export function isOnProbation(profile: HrEmployeeProfile): boolean {
  return isWorking(profile) && !profile.regular_date;
}

/** The page's top strip: four numbers over one window and one scope. */
export interface AnalysisKpis {
  headcount: number;
  probation: number;
  /** Hire dates inside the window. */
  hires: number;
  /** Leave dates inside the window. */
  departures: number;
  /** The turnover denominator: on staff at the window start. */
  base: number;
  /** `departures / base`, or `null` when the base is 0. */
  turnover: number | null;
}

/**
 * The four KPI readings.
 *
 * The turnover base — 期初在职 — is everyone hired on or before the window start
 * who had not already left before it (`leave_date` empty or on/after the start),
 * so every departure counted in the numerator had a place in the denominator.
 * A workspace where nobody was on staff at the start has no turnover rate: the
 * rate is `null`, and the page prints `—` instead of a 0% that would read as
 * "nobody left".
 */
export function buildKpis(
  employees: readonly HrEmployeeProfile[],
  { now, months, scope }: AnalysisOptions,
): AnalysisKpis {
  const start = dayOrdinal(windowStart(now, months));
  const today = dayOrdinal(civilDayOf(now));

  let headcount = 0;
  let probation = 0;
  let hires = 0;
  let departures = 0;
  let base = 0;

  for (const profile of employees) {
    if (!matchesScope(profile.department_id, scope)) continue;
    const hire = parseDay(profile.hire_date);
    const leave = parseDay(profile.leave_date);
    const hireDay = hire ? dayOrdinal(hire) : null;
    const leaveDay = leave ? dayOrdinal(leave) : null;

    if (hireDay !== null && leaveDay === null) {
      headcount += 1;
      if (!profile.regular_date) probation += 1;
    }
    if (hireDay !== null && hireDay >= start && hireDay <= today) hires += 1;
    if (leaveDay !== null && leaveDay >= start && leaveDay <= today) departures += 1;
    if (
      hireDay !== null &&
      hireDay <= start &&
      (leaveDay === null || leaveDay >= start)
    ) {
      base += 1;
    }
  }

  return {
    headcount,
    probation,
    hires,
    departures,
    base,
    turnover: base === 0 ? null : departures / base,
  };
}

/** One bar of 部门人数. `departmentId` is `null` for the unassigned bucket. */
export interface DepartmentSlice {
  departmentId: string | null;
  /** The department's name; `null` when the profile has no department. */
  name: string | null;
  count: number;
}

/**
 * 部门人数 over the profiles on staff today.
 *
 * Grouped by `department_id`, with the unassigned bucket included (the chart is
 * the one place it is visible). A `department_id` that no longer resolves to a
 * `department` row is folded into the unassigned bucket rather than dropped: an
 * orphaned id is a missing name, not a missing person.
 *
 * Largest first, then by name, so the chart reads top-down as a ranking and two
 * equal departments keep a stable order.
 */
export function departmentSlices(
  employees: readonly HrEmployeeProfile[],
  departments: readonly Department[],
  scope: DepartmentScope,
): DepartmentSlice[] {
  const names = new Map<string, string>();
  for (const department of departments) names.set(department.id, department.name);

  const counts = new Map<string | null, number>();
  for (const profile of employees) {
    if (!isWorking(profile)) continue;
    const id = profile.department_id;
    const key = id !== null && names.has(id) ? id : null;
    if (!matchesScope(key, scope)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const slices: DepartmentSlice[] = [];
  for (const [departmentId, count] of counts) {
    slices.push({
      departmentId,
      name: departmentId === null ? null : (names.get(departmentId) ?? null),
      count,
    });
  }
  slices.sort(
    (a, b) =>
      b.count - a.count ||
      (a.departmentId === null ? 1 : 0) - (b.departmentId === null ? 1 : 0) ||
      (a.name ?? "").localeCompare(b.name ?? ""),
  );
  return slices;
}

/**
 * The funnel's six forward steps, in order.
 *
 * `rejected` and `withdrawn` are not among them: a candidate who left the
 * pipeline no longer says how far they got, and counting them at their last
 * known step is a guess.
 */
export const FUNNEL_STAGES = [
  "screening",
  "test",
  "interview",
  "scored",
  "offer",
  "hired",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** One step of 招聘漏斗: how many candidates reached it. */
export interface FunnelRow {
  stage: FunnelStage;
  count: number;
}

/**
 * 招聘漏斗, cumulative: each step counts the candidates whose *current* stage is
 * at or past it.
 *
 * Raw per-stage counts would not be a funnel — one candidate standing in
 * `interview` was also screened, so per-stage counting can print a step larger
 * than the one above it and a step below it that is smaller. "Reached at least
 * this step" is monotone by construction, which is what the shape is for; the
 * page states the reading under the chart.
 *
 * The department scope is reached through the candidate's job (`hr_candidate`
 * carries no department of its own), so a candidate whose job is not in the
 * loaded job page counts as unassigned.
 */
export function funnelCounts(
  candidates: readonly HrCandidate[],
  jobs: readonly HrJob[],
  scope: DepartmentScope,
): FunnelRow[] {
  const jobDepartment = new Map<string, string | null>();
  for (const job of jobs) jobDepartment.set(job.id, job.department_id);

  const reached = new Map<FunnelStage, number>();
  for (const stage of FUNNEL_STAGES) reached.set(stage, 0);

  for (const candidate of candidates) {
    if (!matchesScope(jobDepartment.get(candidate.job_id) ?? null, scope)) continue;
    const index = FUNNEL_STAGES.indexOf(candidate.stage as FunnelStage);
    if (index < 0) continue;
    for (let step = 0; step <= index; step += 1) {
      const stage = FUNNEL_STAGES[step];
      if (!stage) continue;
      reached.set(stage, (reached.get(stage) ?? 0) + 1);
    }
  }

  return FUNNEL_STAGES.map((stage) => ({ stage, count: reached.get(stage) ?? 0 }));
}

/** One month of 每月入离职. */
export interface MonthlyPoint extends AnalysisMonth {
  hires: number;
  departures: number;
}

/**
 * 每月入离职: one bucket per window month, oldest first.
 *
 * Hires read `hire_date`, departures read `leave_date`; both are counted whoever
 * they are, so a person who joined and left inside the window shows up in both
 * series. Dates after today are ignored (a hire date can be pre-boarding).
 */
export function monthlySeries(
  employees: readonly HrEmployeeProfile[],
  { now, months, scope }: AnalysisOptions,
): MonthlyPoint[] {
  const buckets = windowMonths(now, months);
  const points: MonthlyPoint[] = buckets.map((bucket) => ({
    ...bucket,
    hires: 0,
    departures: 0,
  }));
  const slots = new Map<string, number>();
  buckets.forEach((bucket, index) => slots.set(bucket.key, index));
  const today = dayOrdinal(civilDayOf(now));

  for (const profile of employees) {
    if (!matchesScope(profile.department_id, scope)) continue;
    for (const [field, stored] of [
      ["hires", profile.hire_date],
      ["departures", profile.leave_date],
    ] as const) {
      const day = parseDay(stored);
      if (!day || dayOrdinal(day) > today) continue;
      const slot = slots.get(monthKey(day.year, day.month));
      if (slot === undefined) continue;
      const point = points[slot];
      if (!point) continue;
      point[field] += 1;
    }
  }

  return points;
}

/**
 * The 司龄 bands, oldest last. Half-open ranges, so a boundary lands in the
 * band above it: exactly 3 months is `m3_1y`, exactly 5 years is `over_5y`.
 */
export const TENURE_BUCKETS = [
  "under_3m",
  "m3_1y",
  "y1_3y",
  "y3_5y",
  "over_5y",
] as const;

export type TenureBucket = (typeof TENURE_BUCKETS)[number];

/** One band of 司龄分布. */
export interface TenureSlice {
  bucket: TenureBucket;
  count: number;
}

/**
 * Whole months from `from` to `to`.
 *
 * Calendar months, not 30-day blocks: the day-of-month decides whether the last
 * month has completed, so 03-15 → 06-14 is two months and 03-15 → 06-15 is
 * three. Negative when `from` is in the future (a pre-boarding hire date).
 */
export function monthsBetween(from: CivilDay, to: CivilDay): number {
  const months = (to.year - from.year) * 12 + (to.month - from.month);
  return to.day < from.day ? months - 1 : months;
}

/** The band a tenure in months falls in. */
export function tenureBucket(months: number): TenureBucket {
  if (months < 3) return "under_3m";
  if (months < 12) return "m3_1y";
  if (months < 36) return "y1_3y";
  if (months < 60) return "y3_5y";
  return "over_5y";
}

/**
 * 司龄分布 over the profiles on staff today, every band present.
 *
 * All five bands are returned even at zero: the distribution is read as a
 * shape, and a missing band would silently move the others. A profile with no
 * `hire_date` has no tenure to place.
 */
export function tenureSlices(
  employees: readonly HrEmployeeProfile[],
  { now, scope }: AnalysisOptions,
): TenureSlice[] {
  const today = civilDayOf(now);
  const counts = new Map<TenureBucket, number>();
  for (const bucket of TENURE_BUCKETS) counts.set(bucket, 0);

  for (const profile of employees) {
    if (!isWorking(profile)) continue;
    if (!matchesScope(profile.department_id, scope)) continue;
    const hire = parseDay(profile.hire_date);
    if (!hire) continue;
    const bucket = tenureBucket(monthsBetween(hire, today));
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  return TENURE_BUCKETS.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));
}

/** Whether any bar on a chart is worth drawing — the per-chart `—` test. */
export function hasAnyCount(rows: readonly { count: number }[]): boolean {
  return rows.some((row) => row.count > 0);
}

/** Whether any month of the flow chart holds a join or a departure. */
export function hasAnyMovement(rows: readonly MonthlyPoint[]): boolean {
  return rows.some((row) => row.hires > 0 || row.departures > 0);
}

/**
 * A 0–1 rate as the reader's percentage at one decimal.
 *
 * `null` stays `null`: the caller prints the page's `—`, never `0%` — "nobody
 * was on staff to leave" and "nobody left" are different answers.
 */
export function formatRate(rate: number | null, locale: string): string | null {
  if (rate === null) return null;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(rate);
}

/** A month tick label ("Mar", "3月") in the reader's locale. */
export function monthLabel(month: number, locale: string): string {
  // A fixed day keeps the label from drifting with the reader's time zone.
  const instant = new Date(Date.UTC(2024, month - 1, 1));
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
    instant,
  );
}

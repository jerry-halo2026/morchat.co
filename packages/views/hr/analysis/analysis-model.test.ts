// @vitest-environment node

import { describe, expect, it } from "vitest";
import type {
  Department,
  HrCandidate,
  HrCandidateStage,
  HrEmployeeProfile,
  HrJob,
} from "@morechat/core/types";
import {
  UNASSIGNED_DEPARTMENT,
  buildKpis,
  departmentSlices,
  formatRate,
  funnelCounts,
  hasAnyCount,
  hasAnyMovement,
  isOnProbation,
  isWorking,
  monthLabel,
  monthsBetween,
  monthlySeries,
  tenureBucket,
  tenureSlices,
  windowMonths,
  windowStart,
} from "./analysis-model";

/**
 * 人事分析 arithmetic, one reading at a time.
 *
 * The clock is passed in everywhere, so every case below is pinned to the same
 * day (18 November 2026) and reads the same twelve-month window (December 2025
 * → November 2026) whatever the machine's date is. Dates are built with the
 * local `Date` constructor because the model reads `hire_date` as a calendar
 * day, not an instant.
 */

const WS = "ws-hr";
const NOW = new Date(2026, 10, 18);
const WINDOW = { now: NOW, months: 12, scope: null } as const;

function employee(
  over: Partial<HrEmployeeProfile> & { id: string },
): HrEmployeeProfile {
  return {
    workspace_id: WS,
    member_id: `member-${over.id}`,
    department_id: null,
    job_title: null,
    grade: null,
    hire_date: "2024-01-01",
    regular_date: "2024-04-01",
    contract_end: null,
    leave_date: null,
    ability: {},
    disc: {},
    owner_member_id: null,
    created_by: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    archived_at: null,
    ...over,
  };
}

function department(id: string, name: string): Department {
  return {
    id,
    workspace_id: WS,
    name,
    lead_user_id: null,
    system_key: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

function job(over: Partial<HrJob> & { id: string }): HrJob {
  return {
    workspace_id: WS,
    title: over.id,
    department_id: null,
    level: null,
    headcount: 1,
    status: "open",
    salary_min: null,
    salary_max: null,
    currency: "CNY",
    requirements: null,
    edu: null,
    years: null,
    city: null,
    jd: null,
    urgent: false,
    keywords: [],
    owner_member_id: null,
    created_by: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    archived_at: null,
    ...over,
  };
}

function candidate(
  over: Partial<HrCandidate> & { id: string; job_id: string; stage: HrCandidateStage },
): HrCandidate {
  return {
    workspace_id: WS,
    name: over.id,
    source: null,
    phone: null,
    email: null,
    resume_attachment_id: null,
    match_score: null,
    score_resume: null,
    score_test: null,
    score_interview: null,
    expected_salary: null,
    offer_salary: null,
    currency: "CNY",
    owner_member_id: null,
    edu: null,
    years_experience: null,
    resume_text: null,
    hired_at: null,
    rejected_reason: null,
    created_by: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    archived_at: null,
    ...over,
  };
}

const DESIGN = department("dep-design", "Design");
const ENGINEERING = department("dep-eng", "Engineering");
const DEPARTMENTS = [DESIGN, ENGINEERING];

describe("在职 and 试用期", () => {
  it("counts a leave date, even a future one, as not on staff", () => {
    expect(isWorking(employee({ id: "a" }))).toBe(true);
    expect(isWorking(employee({ id: "b", leave_date: "2026-10-01" }))).toBe(false);
    expect(isWorking(employee({ id: "c", leave_date: "2027-03-01" }))).toBe(false);
    // No hire date is no employment: the profile has not started.
    expect(isWorking(employee({ id: "d", hire_date: null }))).toBe(false);
  });

  it("puts a working profile without a confirmation date on probation", () => {
    expect(isOnProbation(employee({ id: "a", regular_date: null }))).toBe(true);
    expect(isOnProbation(employee({ id: "b", regular_date: "2026-02-01" }))).toBe(false);
    // Someone who already left is not on probation, whatever the date says.
    expect(
      isOnProbation(employee({ id: "c", regular_date: null, leave_date: "2026-09-30" })),
    ).toBe(false);
  });
});

describe("windowStart / windowMonths", () => {
  it("starts on the first day of the month eleven months back", () => {
    expect(windowStart(NOW, 12)).toEqual({ year: 2025, month: 12, day: 1 });
    expect(windowStart(NOW, 3)).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it("lists the window oldest first, across the year boundary", () => {
    const months = windowMonths(NOW, 3);
    expect(months.map((month) => month.key)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    const year = windowMonths(NOW, 12);
    expect(year).toHaveLength(12);
    expect(year[0]?.key).toBe("2025-12");
    expect(year[11]?.key).toBe("2026-11");
    // January of the new year is in the middle, not at the edge.
    expect(year[1]).toEqual({ key: "2026-01", year: 2026, month: 1 });
  });
});

describe("部门人数", () => {
  it("groups the staff by department, unassigned included, largest first", () => {
    const slices = departmentSlices(
      [
        employee({ id: "a", department_id: DESIGN.id }),
        employee({ id: "b", department_id: DESIGN.id }),
        employee({ id: "c", department_id: ENGINEERING.id }),
        employee({ id: "d", department_id: null }),
        // A department id that no longer resolves is a missing name, not a
        // missing person: it joins the unassigned bucket.
        employee({ id: "e", department_id: "dep-gone" }),
        // Someone who left is not headcount.
        employee({ id: "f", department_id: DESIGN.id, leave_date: "2026-05-01" }),
      ],
      DEPARTMENTS,
      null,
    );

    expect(slices).toEqual([
      { departmentId: DESIGN.id, name: "Design", count: 2 },
      { departmentId: null, name: null, count: 2 },
      { departmentId: ENGINEERING.id, name: "Engineering", count: 1 },
    ]);
  });

  it("narrows to one department, and to the unassigned bucket", () => {
    const rows = [
      employee({ id: "a", department_id: DESIGN.id }),
      employee({ id: "b", department_id: ENGINEERING.id }),
      employee({ id: "c", department_id: null }),
    ];

    expect(departmentSlices(rows, DEPARTMENTS, DESIGN.id)).toEqual([
      { departmentId: DESIGN.id, name: "Design", count: 1 },
    ]);
    expect(departmentSlices(rows, DEPARTMENTS, UNASSIGNED_DEPARTMENT)).toEqual([
      { departmentId: null, name: null, count: 1 },
    ]);
    // What the page's per-chart dash keys on: a scope with nobody in it draws
    // no bar, and no bar is the `—` state rather than an empty axis.
    expect(hasAnyCount(departmentSlices(rows, DEPARTMENTS, "dep-nobody"))).toBe(false);
    expect(hasAnyCount(departmentSlices(rows, DEPARTMENTS, null))).toBe(true);
  });
});

describe("招聘漏斗", () => {
  it("is cumulative over the forward stages and drops the closed ones", () => {
    const rows = funnelCounts(
      [
        candidate({ id: "c1", job_id: "job-1", stage: "screening" }),
        candidate({ id: "c2", job_id: "job-1", stage: "interview" }),
        candidate({ id: "c3", job_id: "job-1", stage: "hired" }),
        // Closed stages no longer say how far the person got.
        candidate({ id: "c4", job_id: "job-1", stage: "rejected" }),
        candidate({ id: "c5", job_id: "job-1", stage: "withdrawn" }),
      ],
      [job({ id: "job-1", department_id: DESIGN.id })],
      null,
    );

    // screening 3 → test 2 → interview 2 → scored 1 → offer 1 → hired 1:
    // every step is at most the one above it, which is the whole point.
    expect(rows.map((row) => row.count)).toEqual([3, 2, 2, 1, 1, 1]);
  });

  it("follows the department scope through the candidate's job", () => {
    const candidates = [
      candidate({ id: "c1", job_id: "job-design", stage: "offer" }),
      candidate({ id: "c2", job_id: "job-eng", stage: "screening" }),
      // A candidate whose job is not in the loaded page reads as unassigned.
      candidate({ id: "c3", job_id: "job-missing", stage: "screening" }),
    ];
    const jobs = [
      job({ id: "job-design", department_id: DESIGN.id }),
      job({ id: "job-eng", department_id: ENGINEERING.id }),
    ];

    expect(funnelCounts(candidates, jobs, DESIGN.id).map((row) => row.count)).toEqual([
      1, 1, 1, 1, 1, 0,
    ]);
    expect(
      funnelCounts(candidates, jobs, UNASSIGNED_DEPARTMENT).map((row) => row.count),
    ).toEqual([1, 0, 0, 0, 0, 0]);
  });
});

describe("每月入离职", () => {
  it("counts joins by hire date and departures by leave date", () => {
    const points = monthlySeries(
      [
        employee({ id: "a", hire_date: "2026-01-04" }),
        employee({ id: "b", hire_date: "2026-01-28" }),
        employee({ id: "c", hire_date: "2025-12-31" }),
        employee({ id: "d", hire_date: "2023-02-01", leave_date: "2026-03-15" }),
        // A pre-boarding hire date has not happened yet.
        employee({ id: "e", hire_date: "2026-12-01", leave_date: null }),
        // Outside the window entirely.
        employee({ id: "f", hire_date: "2024-06-01", leave_date: "2025-11-30" }),
      ],
      WINDOW,
    );

    const byKey = new Map(points.map((point) => [point.key, point]));
    expect(byKey.get("2025-12")).toMatchObject({ hires: 1, departures: 0 });
    expect(byKey.get("2026-01")).toMatchObject({ hires: 2, departures: 0 });
    expect(byKey.get("2026-03")).toMatchObject({ hires: 0, departures: 1 });
    expect(byKey.get("2026-11")).toMatchObject({ hires: 0, departures: 0 });
    expect(points).toHaveLength(12);
    // Nothing counts a date outside the window: December's future hire is out.
    expect(points.reduce((sum, point) => sum + point.hires, 0)).toBe(3);
    expect(hasAnyMovement(points)).toBe(true);
    expect(hasAnyMovement(monthlySeries([], WINDOW))).toBe(false);
  });

  it("crosses the year boundary and keeps one bucket per month", () => {
    const points = monthlySeries(
      [
        employee({ id: "a", hire_date: "2025-12-02" }),
        employee({ id: "b", hire_date: "2026-01-02" }),
      ],
      { now: new Date(2026, 1, 10), months: 3, scope: null },
    );

    expect(points.map((point) => point.key)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(points.map((point) => point.hires)).toEqual([1, 1, 0]);
  });
});

describe("司龄", () => {
  it("counts whole calendar months, and lands boundaries in the band above", () => {
    const hire = { year: 2026, month: 8, day: 18 };
    expect(monthsBetween(hire, { year: 2026, month: 11, day: 17 })).toBe(2);
    expect(monthsBetween(hire, { year: 2026, month: 11, day: 18 })).toBe(3);

    expect(tenureBucket(2)).toBe("under_3m");
    // Exactly 3 months is the top of the first band already.
    expect(tenureBucket(3)).toBe("m3_1y");
    expect(tenureBucket(11)).toBe("m3_1y");
    // Exactly 1 year.
    expect(tenureBucket(12)).toBe("y1_3y");
    expect(tenureBucket(35)).toBe("y1_3y");
    expect(tenureBucket(36)).toBe("y3_5y");
    expect(tenureBucket(59)).toBe("y3_5y");
    // Exactly 5 years: the last band is "5 years and over".
    expect(tenureBucket(60)).toBe("over_5y");
  });

  it("places the staff on hire date and leaves the departed out", () => {
    const slices = tenureSlices(
      [
        employee({ id: "a", hire_date: "2026-10-01" }), // ~1 month
        employee({ id: "b", hire_date: "2026-07-01" }), // ~4 months
        employee({ id: "c", hire_date: "2024-11-18" }), // exactly 2 years
        employee({ id: "d", hire_date: "2021-11-18" }), // exactly 5 years
        employee({ id: "e", hire_date: "2019-01-01", leave_date: "2026-01-01" }),
      ],
      { now: NOW, months: 12, scope: null },
    );

    expect(slices.map((slice) => slice.count)).toEqual([1, 1, 1, 0, 1]);
    expect(slices.map((slice) => slice.bucket)).toEqual([
      "under_3m",
      "m3_1y",
      "y1_3y",
      "y3_5y",
      "over_5y",
    ]);
  });
});

describe("离职率", () => {
  it("divides the departures by the people on staff at the window start", () => {
    const kpis = buildKpis(
      [
        // On staff before the window, still here: in the base.
        employee({ id: "a", hire_date: "2023-01-01" }),
        // On staff before the window, left inside it: base and departure.
        employee({ id: "b", hire_date: "2023-01-01", leave_date: "2026-02-01" }),
        // Hired inside the window: a join, never in the base.
        employee({ id: "c", hire_date: "2026-04-01" }),
        // Hired and left before the window opened.
        employee({ id: "d", hire_date: "2022-01-01", leave_date: "2025-06-01" }),
      ],
      WINDOW,
    );

    expect(kpis.base).toBe(2);
    expect(kpis.departures).toBe(1);
    expect(kpis.headcount).toBe(2);
    expect(kpis.hires).toBe(1);
    expect(kpis.turnover).toBe(0.5);
  });

  it("has no rate when nobody was on staff at the start", () => {
    const kpis = buildKpis(
      // Hired after the window opened: a join, and nothing else.
      [employee({ id: "a", hire_date: "2026-10-01" })],
      { now: NOW, months: 3, scope: null },
    );

    expect(kpis.base).toBe(0);
    // Not 0%: an empty base is "no reading", which the page prints as —.
    expect(kpis.turnover).toBeNull();
    expect(formatRate(kpis.turnover, "en")).toBeNull();
  });

  it("reads the strip under one department scope", () => {
    const rows = [
      employee({ id: "a", department_id: DESIGN.id, regular_date: null }),
      employee({ id: "b", department_id: DESIGN.id }),
      employee({ id: "c", department_id: ENGINEERING.id }),
    ];

    const design = buildKpis(rows, { ...WINDOW, scope: DESIGN.id });
    expect(design.headcount).toBe(2);
    expect(design.probation).toBe(1);
    expect(buildKpis(rows, WINDOW).headcount).toBe(3);
  });

  it("formats a rate as a percentage and keeps an empty reading empty", () => {
    expect(formatRate(0.125, "en")).toBe("12.5%");
    expect(formatRate(0, "en")).toBe("0%");
    expect(formatRate(null, "en")).toBeNull();
  });
});

describe("labels", () => {
  it("names a month in the reader's locale", () => {
    expect(monthLabel(3, "en")).toBe("Mar");
    expect(monthLabel(1, "en")).toBe("Jan");
  });
});

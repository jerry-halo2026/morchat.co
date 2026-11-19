import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  hrCandidateListOptions,
  hrEmployeeListOptions,
  hrJobListOptions,
} from "@morechat/core/hr/queries";
import { departmentListOptions } from "@morechat/core/workspace/queries";
import type {
  Department,
  HrCandidate,
  HrCandidateStage,
  HrEmployeeProfile,
  HrJob,
} from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { HrAnalysisPage } from "./analysis-page";

/**
 * 人事分析 on screen: the four numbers, the four charts and their captions, and
 * the two states the page is most likely to be read in — nobody on file, and a
 * chart with nothing to count.
 *
 * The page's own copy lives in `analysis-copy.ts` and reaches the screen as
 * `defaultValue` until the eight bundles carry it, so the English words this
 * suite asserts are the table's — the same strings the merge has to translate.
 * `nav.hr_analysis` and `empty_title` come from the real bundle.
 *
 * Every date is expressed relative to today, because the page reads its own
 * clock: a fixture written as a fixed day would drift out of the twelve-month
 * window and turn these assertions into calendar arithmetic.
 */

const WS = "ws-analysis";

vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-analysis" }));

/** A calendar day `offset` days from today, as the HR columns store it. */
function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DESIGN = "dep-design";
const ENGINEERING = "dep-eng";

const DEPARTMENTS: Department[] = [
  {
    id: DESIGN,
    workspace_id: WS,
    name: "Design",
    lead_user_id: null,
    system_key: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: ENGINEERING,
    workspace_id: WS,
    name: "Engineering",
    lead_user_id: null,
    system_key: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

const JOBS: HrJob[] = [
  {
    id: "job-design",
    workspace_id: WS,
    title: "Product designer",
    department_id: DESIGN,
    level: null,
    headcount: 2,
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
  },
];

function profile(
  over: Partial<HrEmployeeProfile> & { id: string },
): HrEmployeeProfile {
  return {
    workspace_id: WS,
    member_id: `member-${over.id}`,
    department_id: null,
    job_title: null,
    grade: null,
    hire_date: day(-400),
    regular_date: day(-300),
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

function candidate(
  over: Partial<HrCandidate> & { id: string; stage: HrCandidateStage },
): HrCandidate {
  return {
    workspace_id: WS,
    job_id: "job-design",
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

/**
 * Four people: one inside probation, one in Design for years, one in Design for
 * more than five, and one who left three weeks ago — the last of those makes
 * the turnover reading non-zero and keeps it out of headcount.
 */
function roster(): HrEmployeeProfile[] {
  return [
    profile({ id: "emp-fresh", hire_date: day(-30), regular_date: null }),
    profile({ id: "emp-design", department_id: DESIGN, hire_date: day(-800) }),
    profile({ id: "emp-veteran", department_id: DESIGN, hire_date: day(-2000) }),
    profile({
      id: "emp-left",
      department_id: ENGINEERING,
      hire_date: day(-1000),
      leave_date: day(-20),
    }),
  ];
}

function pipeline(): HrCandidate[] {
  return [
    candidate({ id: "cand-1", stage: "interview" }),
    candidate({ id: "cand-2", stage: "screening", job_id: "job-gone" }),
    candidate({ id: "cand-3", stage: "rejected" }),
  ];
}

function renderPage({
  employees = roster(),
  candidates = pipeline(),
  jobs = JOBS,
}: {
  employees?: HrEmployeeProfile[];
  candidates?: HrCandidate[];
  jobs?: HrJob[];
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(hrEmployeeListOptions(WS).queryKey, {
    employees,
    total: employees.length,
  });
  queryClient.setQueryData(hrCandidateListOptions(WS).queryKey, {
    candidates,
    total: candidates.length,
  });
  queryClient.setQueryData(hrJobListOptions(WS).queryKey, {
    jobs,
    total: jobs.length,
  });
  queryClient.setQueryData(departmentListOptions(WS).queryKey, DEPARTMENTS);

  return renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <HrAnalysisPage />
    </QueryClientProvider>,
  );
}

/** A KPI tile's number, read out of the cell its label sits in. */
function kpiValue(label: string): string {
  const cell = screen.getByText(label).parentElement;
  return (cell?.textContent ?? "").replace(label, "").trim();
}

/** The card a chart title heads. */
function chartCard(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const card = heading.closest("section");
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe("HrAnalysisPage", () => {
  it("shows the first-run state when nobody is on file", () => {
    renderPage({ employees: [], candidates: [], jobs: [] });

    expect(
      screen.getByRole("heading", { name: "No numbers to analyse yet", level: 2 }),
    ).toBeInTheDocument();
    // Four charts of nothing would read as four failed loads, so none is drawn.
    expect(screen.queryByRole("heading", { name: "Tenure" })).toBeNull();
  });

  it("reports headcount, probation, joins and turnover for the window", () => {
    renderPage();

    expect(kpiValue("On staff")).toBe("3");
    expect(kpiValue("On probation")).toBe("1");
    expect(kpiValue("Joined (last 12 months)")).toBe("1");
    // One of the three people on staff at the window start has left: 1 / 3.
    expect(kpiValue("Turnover (last 12 months)")).toBe("33.3%");
  });

  it("draws the four charts, each with the reading it was computed by", () => {
    renderPage();

    for (const title of [
      "Headcount by department",
      "Hiring funnel",
      "Joins and departures by month",
      "Tenure",
    ]) {
      expect(screen.getByRole("heading", { name: title, level: 2 })).toBeInTheDocument();
    }

    // The captions are the page's 口径 and stay visible under every chart.
    const funnel = chartCard("Hiring funnel");
    expect(
      within(funnel).getByText(/current stage is at or past each step/),
    ).toBeInTheDocument();
    expect(
      within(chartCard("Tenure")).getByText(/Exactly 3 months, 1 year or 5 years/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/departures in the window ÷ people on staff at the window start/),
    ).toBeInTheDocument();
  });

  it("prints a dash inside a chart that has nothing to count", () => {
    renderPage({ candidates: [], jobs: [] });

    // Nobody in the pipeline: the funnel says so in place of an empty axis.
    expect(within(chartCard("Hiring funnel")).getByText("—")).toBeInTheDocument();
    // The charts with data still draw.
    expect(within(chartCard("Headcount by department")).queryByText("—")).toBeNull();
  });

  it("narrows every reading to the department picked in the header", async () => {
    renderPage();

    expect(screen.getByRole("img", { name: /Design: 2, Unassigned: 1/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "Department" }));
    await userEvent.click(await screen.findByRole("option", { name: "Design" }));

    // The department chart now holds one bar, and Engineering is nowhere.
    expect(screen.getByRole("img", { name: "Design: 2" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Engineering/ })).toBeNull();
    expect(screen.queryByRole("img", { name: /Unassigned/ })).toBeNull();
    // …and the strip is scoped with it: two of the three are in Design.
    expect(kpiValue("On staff")).toBe("2");
  });

  it("relabels the window's numbers when the range changes", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "3 months" }));

    expect(screen.getByText("Turnover (last 3 months)")).toBeInTheDocument();
    expect(screen.queryByText("Turnover (last 12 months)")).toBeNull();
    // The three-month window starts after all but the newest join.
    expect(kpiValue("Joined (last 3 months)")).toBe("1");
  });

  it("shows the page-level error state, and retries from it", async () => {
    // Nothing seeded: the four queries run for real and fail, which is the
    // state a broken HR read puts the page in.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderWithI18n(
      <QueryClientProvider client={queryClient}>
        <HrAnalysisPage />
      </QueryClientProvider>,
    );

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Couldn’t load analytics")).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    // An error is not an empty workspace: the first-run copy must not appear.
    expect(screen.queryByText("No numbers to analyse yet")).toBeNull();
  });
});

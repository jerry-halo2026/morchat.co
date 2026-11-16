import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { NavigationProvider, type NavigationAdapter } from "../navigation";
import { renderWithI18n } from "../test/i18n";
import { LedgerTable } from "./ledger-table";
import type {
  HrCandidate,
  HrEmployeeProfile,
  HrInterview,
  HrJob,
} from "@morechat/core/types";

// The four B1 ledgers (`docs/engineering/WORKBENCH-API.md` §10.2). Each fixture
// is the table's own row shape, so a column that stops matching a field breaks
// the test rather than silently drawing a placeholder.

const JOB: HrJob = {
  id: "job-1-0000-0000-0000-000000000001",
  workspace_id: "ws-1",
  title: "Senior video editor",
  department_id: null,
  level: "P5",
  headcount: 2,
  status: "open",
  salary_min: 18000,
  salary_max: 24000,
  currency: "CNY",
  requirements: null,
  owner_member_id: null,
  created_by: null,
  created_at: "2026-01-04T09:00:00Z",
  updated_at: "2026-01-04T09:00:00Z",
  archived_at: null,
};

const CANDIDATE: HrCandidate = {
  id: "cand-1-0000-0000-0000-000000000001",
  workspace_id: "ws-1",
  job_id: "job-1-0000-0000-0000-000000000001",
  name: "Lin Wei",
  stage: "interview",
  source: null,
  phone: null,
  email: null,
  resume_attachment_id: null,
  match_score: 82,
  score_resume: null,
  score_test: null,
  score_interview: null,
  expected_salary: 21000,
  offer_salary: null,
  currency: "CNY",
  owner_member_id: null,
  hired_at: null,
  rejected_reason: null,
  created_by: null,
  created_at: "2026-01-05T09:00:00Z",
  updated_at: "2026-01-05T09:00:00Z",
  archived_at: null,
};

const INTERVIEW: HrInterview = {
  id: "int-1-0000-0000-0000-000000000001",
  workspace_id: "ws-1",
  candidate_id: "cand-1-0000-0000-0000-000000000001",
  round: 2,
  scheduled_at: "2026-02-10T06:30:00Z",
  duration_minutes: 45,
  interviewer_member_id: "memb-1-0000-0000-0000-000000000001",
  mode: "video",
  status: "scheduled",
  rescheduled_count: 1,
  note: null,
  created_by: null,
  created_at: "2026-02-01T09:00:00Z",
  updated_at: "2026-02-03T09:00:00Z",
  archived_at: null,
};

const EMPLOYEE: HrEmployeeProfile = {
  id: "emp-1-0000-0000-0000-000000000001",
  workspace_id: "ws-1",
  member_id: "memb-2-0000-0000-0000-000000000002",
  department_id: null,
  job_title: "Producer",
  grade: "P4",
  hire_date: "2024-03-01",
  regular_date: "2024-06-01",
  contract_end: "2027-03-01",
  ability: {},
  disc: {},
  owner_member_id: null,
  created_by: null,
  created_at: "2024-03-01T09:00:00Z",
  updated_at: "2024-03-01T09:00:00Z",
  archived_at: null,
};

function adapter(): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/acme/overview",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

afterEach(cleanup);

describe("LedgerTable · B1 columns", () => {
  it("draws the job ledger's columns from the contract's hr_job fields", () => {
    renderWithI18n(
      <NavigationProvider value={adapter()}>
        <LedgerTable domain="jobs" rows={[JOB]} />
      </NavigationProvider>,
    );
    const grid = screen.getByRole("grid", { name: "Jobs" });
    for (const header of ["Job", "Level", "Headcount", "Status", "Salary range"]) {
      expect(within(grid).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(within(grid).getByText("Senior video editor")).toBeInTheDocument();
    expect(within(grid).getByText("P5")).toBeInTheDocument();
    // The enum is copy, not the raw column value.
    expect(within(grid).getByText("Open")).toBeInTheDocument();
    expect(within(grid).queryByText("open")).toBeNull();
  });

  it("draws a candidate's stage, match score and expected salary", () => {
    renderWithI18n(
      <NavigationProvider value={adapter()}>
        <LedgerTable domain="candidates" rows={[CANDIDATE]} />
      </NavigationProvider>,
    );
    const grid = screen.getByRole("grid", { name: "Candidates" });
    for (const header of ["Candidate", "Applied for", "Stage", "Match", "Expected salary"]) {
      expect(within(grid).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(within(grid).getByText("Lin Wei")).toBeInTheDocument();
    expect(within(grid).getByText("Interview")).toBeInTheDocument();
    expect(within(grid).getByText("82")).toBeInTheDocument();
    // The cross-table job is not joined yet, so it reads as the id's short form.
    expect(within(grid).getByText("job-1-00")).toBeInTheDocument();
  });

  it("draws an interview's round, interviewer, mode and status", () => {
    renderWithI18n(
      <NavigationProvider value={adapter()}>
        <LedgerTable domain="interviews" rows={[INTERVIEW]} />
      </NavigationProvider>,
    );
    const grid = screen.getByRole("grid", { name: "Interviews" });
    for (const header of ["Candidate", "Round", "Time", "Mode", "Interviewer", "Status"]) {
      expect(within(grid).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(within(grid).getByText("2")).toBeInTheDocument();
    expect(within(grid).getByText("Video")).toBeInTheDocument();
    expect(within(grid).getByText("Scheduled")).toBeInTheDocument();
    expect(within(grid).getByText("cand-1-0")).toBeInTheDocument();
    expect(within(grid).getByText("memb-1-0")).toBeInTheDocument();
  });

  it("draws an employee's profile dates as calendar days", () => {
    renderWithI18n(
      <NavigationProvider value={adapter()}>
        <LedgerTable domain="employees" rows={[EMPLOYEE]} />
      </NavigationProvider>,
    );
    const grid = screen.getByRole("grid", { name: "Employees" });
    for (const header of [
      "Member",
      "Job title",
      "Grade",
      "Hired",
      "Regularized",
      "Contract ends",
    ]) {
      expect(within(grid).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(within(grid).getByText("Producer")).toBeInTheDocument();
    expect(within(grid).getByText("P4")).toBeInTheDocument();
    // A `YYYY-MM-DD` column is parsed as a local day: 1 Mar 2024 stays 1 Mar.
    expect(within(grid).getByText(/Mar 1, 2024/)).toBeInTheDocument();
    expect(within(grid).getByText(/Jun 1, 2024/)).toBeInTheDocument();
    expect(within(grid).getByText(/Mar 1, 2027/)).toBeInTheDocument();
  });

  it("names the emptying ledger with its own domain, not the commerce one", () => {
    renderWithI18n(
      <NavigationProvider value={adapter()}>
        <LedgerTable domain="candidates" rows={[]} />
      </NavigationProvider>,
    );
    expect(screen.getByText("No Candidates yet")).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { NavigationProvider, type NavigationAdapter } from "../navigation";
import { renderWithI18n } from "../test/i18n";
import { LedgerTable } from "./ledger-table";
import type {
  AffiliateDaily,
  AffiliatePick,
  AffiliateProduct,
  AffiliateSettlement,
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
  edu: null,
  years: null,
  city: null,
  jd: null,
  urgent: false,
  keywords: [],
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
  // Migration 705: the candidate-side match inputs (fixture data only).
  edu: null,
  years_experience: null,
  resume_text: null,
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
  interviewer_name: "Lin Yi",
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
    // The interviewer is a recorded name, not an account: the ledger shows the
    // name the row carries instead of a uuid prefix.
    expect(within(grid).getByText("Lin Yi")).toBeInTheDocument();
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

// The four B2 ledgers (`docs/engineering/WORKBENCH-API.md` §11). Same rule as
// the suites above: a fixture is the row shape itself, so a column that stops
// matching a field breaks the test instead of drawing a placeholder. Rates are
// stored 0–1 (C3) and drawn as percentages; a null rate or fee is "—", because
// "not agreed" is not the same statement as zero.

const PRODUCT: AffiliateProduct = {
  id: "prod-1-0000-0000-0000-000000000001",
  workspace_id: "ws-1",
  ownership: "own_brand",
  client_id: null,
  platform: "douyin",
  platform_product_id: "3801234567890",
  title: "便携榨汁杯",
  category: null,
  price: 39.9,
  currency: "CNY",
  commission_rate: 0.2,
  activity: null,
  status: "on_shelf",
  owner_member_id: null,
  created_by: null,
  created_at: "2026-02-01T09:00:00Z",
  updated_at: "2026-02-01T09:00:00Z",
  archived_at: null,
};

const PICK: AffiliatePick = {
  id: "pick-1-0000-0000-0000-000000000001",
  workspace_id: "ws-1",
  product_id: "prod-1-0000-0000-0000-000000000001",
  creator_id: "creator-1-0000-0000-0000-000000000001",
  commission_rate: 0.155,
  // Null is "not an internal split", not a zero share.
  agency_share_rate: null,
  service_fee_amount: 2000,
  bound_at: "2026-02-03T09:00:00Z",
  status: "active",
  note: null,
  owner_member_id: null,
  created_by: null,
  created_at: "2026-02-03T09:00:00Z",
  updated_at: "2026-02-03T09:00:00Z",
  archived_at: null,
};

const DAILY: AffiliateDaily = {
  id: "daily-1-0000-0000-0000-00000000001",
  workspace_id: "ws-1",
  pick_id: "pick-1-0000-0000-0000-000000000001",
  stat_date: "2026-03-01",
  gmv_amount: 12800,
  order_count: 64,
  refund_amount: 320,
  est_commission: 1536,
  settled_commission: 0,
  currency: "CNY",
  created_at: "2026-03-02T01:00:00Z",
  updated_at: "2026-03-02T01:00:00Z",
};

const STATEMENT: AffiliateSettlement = {
  id: "stmt-1-0000-0000-0000-000000000001",
  workspace_id: "ws-1",
  period_start: "2026-03-01",
  period_end: "2026-03-31",
  gross_commission: 1000,
  tech_service_fee: 100,
  refund_deduction: 50,
  net_amount: 850,
  currency: "CNY",
  status: "pending",
  settled_to: "agency",
  paid_at: null,
  external_no: "ST-2026-03",
  note: null,
  created_by: null,
  created_at: "2026-04-01T09:00:00Z",
  updated_at: "2026-04-01T09:00:00Z",
};

describe("LedgerTable · B2 columns", () => {
  it("draws the product ledger's title, ownership, platform pair and rate", () => {
    renderWithI18n(
      <NavigationProvider value={adapter()}>
        <LedgerTable wsId="ws-1" domain="products" rows={[PRODUCT]} />
      </NavigationProvider>,
    );
    const grid = screen.getByRole("grid", { name: "Products" });
    for (const header of [
      "Product",
      "Ownership",
      "Platform / product id",
      "Commission rate",
      "Status",
    ]) {
      expect(within(grid).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(within(grid).getByText("便携榨汁杯")).toBeInTheDocument();
    // The enum is copy, not the raw column value.
    expect(within(grid).getByText("Own brand")).toBeInTheDocument();
    expect(within(grid).getByText("douyin")).toBeInTheDocument();
    // The platform id is drawn as its short form: the prefix is what tells two
    // rows apart, and nobody reads forty digits out loud.
    expect(within(grid).getByText("38012345")).toBeInTheDocument();
    // 0.2 is stored as a rate (C3) and read as a percentage, one decimal.
    expect(within(grid).getByText("20.0%")).toBeInTheDocument();
    expect(within(grid).getByText("On shelf")).toBeInTheDocument();
    // The ledger's own entry row comes with the columns.
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("draws a pick's product, creator, rates and fee, with — for an unset share", () => {
    renderWithI18n(
      <NavigationProvider value={adapter()}>
        <LedgerTable
          wsId="ws-1"
          domain="picks"
          rows={[PICK]}
          productTitles={{ [PICK.product_id]: "便携榨汁杯" }}
          creatorNames={{ [PICK.creator_id]: "林小满" }}
        />
      </NavigationProvider>,
    );
    const grid = screen.getByRole("grid", { name: "Picks" });
    for (const header of [
      "Product",
      "Creator",
      "Pick rate",
      "Agency share",
      "Service fee",
      "Status",
    ]) {
      expect(within(grid).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(within(grid).getByText("便携榨汁杯")).toBeInTheDocument();
    expect(within(grid).getByText("林小满")).toBeInTheDocument();
    // 0.155 is 15.55 %, shown to one decimal like every other rate.
    expect(within(grid).getByText("15.5%")).toBeInTheDocument();
    expect(grid).toHaveTextContent("¥2000");
    expect(within(grid).getByText("Active")).toBeInTheDocument();
    expect(within(grid).getByText("—")).toBeInTheDocument();
  });

  it("draws a day's pick as 商品 × 达人 and its five measures", () => {
    renderWithI18n(
      <NavigationProvider value={adapter()}>
        <LedgerTable
          wsId="ws-1"
          domain="daily"
          rows={[DAILY]}
          pickLabels={{ [DAILY.pick_id]: "便携榨汁杯 × 林小满" }}
        />
      </NavigationProvider>,
    );
    const grid = screen.getByRole("grid", { name: "Daily sales" });
    for (const header of [
      "Pick",
      "Date",
      "GMV",
      "Orders",
      "Refund",
      "Estimated commission",
      "Settled commission",
    ]) {
      expect(within(grid).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(within(grid).getByText("便携榨汁杯 × 林小满")).toBeInTheDocument();
    // A `YYYY-MM-DD` column is a local calendar day, not an instant.
    expect(within(grid).getByText(/Mar 1, 2026/)).toBeInTheDocument();
    expect(grid).toHaveTextContent("¥12800");
    expect(grid).toHaveTextContent("64");
    expect(grid).toHaveTextContent("¥320");
    expect(grid).toHaveTextContent("¥1536");
    // The daily report is the one affiliate ledger that also takes a paste.
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("draws a statement's period, its three deductions and the net", () => {
    renderWithI18n(
      <NavigationProvider value={adapter()}>
        <LedgerTable wsId="ws-1" domain="affiliate_settlements" rows={[STATEMENT]} />
      </NavigationProvider>,
    );
    const grid = screen.getByRole("grid", { name: "Statements" });
    for (const header of [
      "Period",
      "Gross commission",
      "Tech service fee",
      "Refund deduction",
      "Net amount",
      "Settled to",
      "Status",
    ]) {
      expect(within(grid).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(within(grid).getByText(/Mar 1, 2026/)).toBeInTheDocument();
    expect(within(grid).getByText(/Mar 31, 2026/)).toBeInTheDocument();
    expect(grid).toHaveTextContent("¥1000");
    expect(grid).toHaveTextContent("¥100");
    expect(grid).toHaveTextContent("¥50");
    expect(grid).toHaveTextContent("¥850");
    expect(within(grid).getByText("Agency")).toBeInTheDocument();
    expect(within(grid).getByText("Pending")).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hrCandidateListOptions, hrJobListOptions } from "@morechat/core/hr/queries";
import { departmentListOptions, memberListOptions } from "@morechat/core/workspace/queries";
import type {
  Department,
  HrCandidate,
  HrEmployeeProfile,
  HrInterview,
  HrJob,
  MemberWithUser,
} from "@morechat/core/types";
import { renderWithI18n } from "../test/i18n";
import en from "../locales/en/blocks.json";
import { RecordSheet, formatMoney, formatStamp, type RecordTarget } from "./record-sheet";

// The sheet is the row with every column the contract lists. This suite checks
// two things only: each of the four entities draws its own fields, and a field
// without a value draws the ledger's dash rather than an empty cell. Formatting
// is checked through the exported formatters, so a timestamp assertion does not
// depend on the zone the suite happens to run in.

const WS = "ws-1";
/** The glyph the bundle carries, so the assertion names the bundle's prefix
 *  rather than a lookalike character typed into this file. */
const CNY = en.unit.currency.CNY;

const MEMBER: MemberWithUser = {
  id: "memb-1-0000-0000-0000-000000000001",
  workspace_id: WS,
  user_id: "user-1",
  role: "member",
  created_at: "2026-01-01T09:00:00Z",
  name: "Zhao Min",
  email: "zhao@example.com",
  avatar_url: null,
  department_id: null,
};

const DEPARTMENT: Department = {
  id: "dept-content",
  workspace_id: WS,
  name: "Content",
  lead_user_id: null,
  system_key: null,
  created_at: "2026-01-01T09:00:00Z",
  updated_at: "2026-01-01T09:00:00Z",
};

const JOB: HrJob = {
  id: "job-1-0000-0000-0000-000000000001",
  workspace_id: WS,
  title: "Senior video editor",
  department_id: DEPARTMENT.id,
  level: "P5",
  headcount: 2,
  status: "open",
  salary_min: 18000,
  salary_max: 24000,
  currency: "CNY",
  requirements: "Three years of long-form editing",
  edu: null,
  years: null,
  city: null,
  jd: null,
  urgent: false,
  keywords: [],
  owner_member_id: MEMBER.id,
  created_by: null,
  created_at: "2026-01-04T09:00:00Z",
  updated_at: "2026-01-04T09:00:00Z",
  archived_at: null,
};

const CANDIDATE: HrCandidate = {
  id: "cand-1-0000-0000-0000-000000000001",
  workspace_id: WS,
  job_id: JOB.id,
  name: "Lin Wei",
  stage: "interview",
  source: "Referral",
  phone: null,
  email: "lin@example.com",
  resume_attachment_id: null,
  match_score: 82,
  score_resume: 88.5,
  score_test: null,
  score_interview: null,
  expected_salary: 21000,
  offer_salary: null,
  currency: "CNY",
  owner_member_id: null,
  edu: "本科",
  years_experience: 4.5,
  resume_text: "负责短视频剪辑与拍摄，熟悉 Premiere 调色",
  hired_at: null,
  rejected_reason: null,
  created_by: null,
  created_at: "2026-01-05T09:00:00Z",
  updated_at: "2026-01-05T09:00:00Z",
  archived_at: null,
};

const INTERVIEW: HrInterview = {
  id: "int-1-0000-0000-0000-000000000001",
  workspace_id: WS,
  candidate_id: CANDIDATE.id,
  round: 2,
  scheduled_at: "2026-02-10T06:30:00Z",
  duration_minutes: 45,
  interviewer_member_id: MEMBER.id,
  interviewer_name: "Zhao Min",
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
  workspace_id: WS,
  member_id: MEMBER.id,
  department_id: DEPARTMENT.id,
  job_title: "Producer",
  grade: "P4",
  hire_date: "2024-03-01",
  regular_date: null,
  contract_end: "2027-03-01",
  ability: {},
  disc: {},
  owner_member_id: null,
  created_by: null,
  created_at: "2024-03-01T09:00:00Z",
  updated_at: "2024-03-01T09:00:00Z",
  archived_at: null,
};

afterEach(cleanup);

function renderSheet(target: RecordTarget) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // The cross-table names come from the lists the ledger behind the sheet has
  // already read, so seeding them keeps the assertions about fields.
  qc.setQueryData(memberListOptions(WS).queryKey, [MEMBER]);
  qc.setQueryData(departmentListOptions(WS).queryKey, [DEPARTMENT]);
  qc.setQueryData(hrJobListOptions(WS).queryKey, { jobs: [JOB], total: 1 });
  qc.setQueryData(hrCandidateListOptions(WS).queryKey, { candidates: [CANDIDATE], total: 1 });
  return renderWithI18n(
    <QueryClientProvider client={qc}>
      <RecordSheet {...target} wsId={WS} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("RecordSheet · one field list per entity", () => {
  it("draws a job's own columns, resolving its department and owner", () => {
    renderSheet({ domain: "jobs", record: JOB });

    // The heading is the opening, and the same value is its Title field.
    expect(screen.getAllByText("Senior video editor")).toHaveLength(2);
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("P5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    // The band is two amounts under the row's currency, not the raw numbers.
    expect(screen.getByText(formatMoney(18000, CNY, "en")!)).toBeInTheDocument();
    expect(screen.getByText(formatMoney(24000, CNY, "en")!)).toBeInTheDocument();
    expect(screen.getByText("CNY")).toBeInTheDocument();
    expect(screen.getByText("Three years of long-form editing")).toBeInTheDocument();
    expect(screen.getByText("Zhao Min")).toBeInTheDocument();
    expect(screen.getByText(formatStamp(JOB.created_at)!)).toBeInTheDocument();
  });

  it("draws a candidate's pipeline fields and its job's title", () => {
    renderSheet({ domain: "candidates", record: CANDIDATE });

    // Heading and the Name field both carry the candidate's name.
    expect(screen.getAllByText("Lin Wei")).toHaveLength(2);
    // The row carries `job_id`; the sheet names the opening.
    expect(screen.getByText("Senior video editor")).toBeInTheDocument();
    expect(screen.getByText("Interview")).toBeInTheDocument();
    expect(screen.getByText("Referral")).toBeInTheDocument();
    expect(screen.getByText("lin@example.com")).toBeInTheDocument();
    // Migration 705: the candidate's own degree, years and résumé body are on the
    // sheet beside the scores they feed.
    expect(screen.getByText("本科")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("负责短视频剪辑与拍摄，熟悉 Premiere 调色")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("88.5")).toBeInTheDocument();
    expect(screen.getByText(formatMoney(21000, CNY, "en")!)).toBeInTheDocument();
    expect(screen.getByText(formatStamp(CANDIDATE.created_at)!)).toBeInTheDocument();
  });

  it("named an interview by its candidate and round, then its own columns", () => {
    renderSheet({ domain: "interviews", record: INTERVIEW });

    expect(screen.getByText("Lin Wei · Round 2")).toBeInTheDocument();
    expect(screen.getByText(formatStamp(INTERVIEW.scheduled_at)!)).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("Zhao Min")).toBeInTheDocument();
    expect(screen.getByText("Video")).toBeInTheDocument();
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("draws an employee file with its dates as calendar days", () => {
    renderSheet({ domain: "employees", record: EMPLOYEE });

    // Heading and the Member field both carry the member's name.
    expect(screen.getAllByText("Zhao Min")).toHaveLength(2);
    expect(screen.getByText("Producer")).toBeInTheDocument();
    expect(screen.getByText("P4")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    // A `YYYY-MM-DD` column is not turned into an instant: the day cannot shift.
    expect(screen.getByText("2024-03-01")).toBeInTheDocument();
    expect(screen.getByText("2027-03-01")).toBeInTheDocument();
  });
});

describe("RecordSheet · empty fields", () => {
  it("draws the ledger's dash for every value the row does not have", () => {
    renderSheet({ domain: "candidates", record: CANDIDATE });

    // phone, score_test, score_interview, offer_salary, hired_at,
    // rejected_reason — six empty columns on this row.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(6);
    // An empty field is a value, not a missing label.
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("Offer salary")).toBeInTheDocument();
  });
});

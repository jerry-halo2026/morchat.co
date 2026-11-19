import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hrJobListOptions } from "@morechat/core/hr/queries";
import { memberListOptions } from "@morechat/core/workspace/queries";
import type { HrCandidate, HrEmployeeProfile, HrJob, MemberWithUser } from "@morechat/core/types";
import { renderWithI18n } from "../test/i18n";
import { HireDialog } from "./hire-dialog";

// The dialog is the ledger's side of `POST /candidates/{id}/hire`
// (`WORKBENCH-API.md` §10.3): it collects the profile the server writes in the
// same transaction, spends exactly one request, and keeps the typed values when
// that request fails. Everything else — `hired_at`, the stage, the profile
// upsert — is the server's, so nothing here asserts on it.

const WS = "ws-1";

const api = vi.hoisted(() => ({
  hireHrCandidate: vi.fn(
    async (): Promise<{ candidate: unknown; employee_profile: unknown }> => ({
      candidate: {},
      employee_profile: {},
    }),
  ),
  listMembers: vi.fn(async () => [] as unknown[]),
  listHrJobs: vi.fn(async () => ({ jobs: [], total: 0 })),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

const JOB: HrJob = {
  id: "job-ops",
  workspace_id: WS,
  title: "运营",
  department_id: null,
  level: null,
  headcount: 1,
  status: "open",
  salary_min: null,
  salary_max: null,
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
  id: "cand-1",
  workspace_id: WS,
  job_id: JOB.id,
  name: "Lin Wei",
  stage: "offer",
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

const MEMBER: MemberWithUser = {
  id: "member-1",
  workspace_id: WS,
  user_id: "user-1",
  role: "member",
  created_at: "2026-01-01T09:00:00Z",
  name: "Zhao Min",
  email: "zhao@example.com",
  avatar_url: null,
  department_id: null,
};

const HIRED: HrEmployeeProfile = {
  id: "employee-1",
  workspace_id: WS,
  member_id: MEMBER.id,
  department_id: null,
  job_title: JOB.title,
  grade: null,
  hire_date: "2026-03-02",
  regular_date: null,
  contract_end: null,
  leave_date: null,
  ability: {},
  disc: {},
  owner_member_id: null,
  created_by: null,
  created_at: "2026-03-02T09:00:00Z",
  updated_at: "2026-03-02T09:00:00Z",
  archived_at: null,
};

beforeEach(() => {
  api.hireHrCandidate.mockClear();
  api.listMembers.mockClear();
  api.listHrJobs.mockClear();
});

afterEach(cleanup);

function renderDialog(members: MemberWithUser[] = [MEMBER]) {
  const onOpenChange = vi.fn();
  const onHired = vi.fn();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // The two references the form reads are the ledgers' own cache entries; seeding
  // them keeps the assertions about the request rather than about fetching.
  qc.setQueryData(memberListOptions(WS).queryKey, members);
  qc.setQueryData(hrJobListOptions(WS).queryKey, { jobs: [JOB], total: 1 });
  renderWithI18n(
    <QueryClientProvider client={qc}>
      <HireDialog
        wsId={WS}
        candidate={CANDIDATE}
        open
        onOpenChange={onOpenChange}
        onHired={onHired}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, onHired };
}

async function pickMember(name = MEMBER.name) {
  await userEvent.click(screen.getByRole("combobox", { name: "Member" }));
  await userEvent.click(await screen.findByRole("option", { name }));
}

describe("HireDialog · form", () => {
  it("defaults the position to the candidate's job and the date to today", () => {
    renderDialog();
    expect(screen.getByLabelText<HTMLInputElement>("Position").value).toBe(JOB.title);
    expect(screen.getByLabelText<HTMLInputElement>("Hire date").value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getByLabelText<HTMLInputElement>("Grade").value).toBe("");
  });

  it("cannot submit before a member is chosen", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Hire" })).toBeDisabled();
    expect(api.hireHrCandidate).not.toHaveBeenCalled();
  });

  it("explains that a member has to be invited first and blocks the submit", () => {
    renderDialog([]);
    expect(screen.getByText(/Invite a member first/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hire" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Member" })).toBeDisabled();
  });
});

describe("HireDialog · writing the hire", () => {
  it("hires the candidate into the chosen member with the typed profile", async () => {
    renderDialog();
    await pickMember();
    fireEvent.change(screen.getByLabelText("Hire date"), { target: { value: "2026-03-02" } });

    await userEvent.click(screen.getByRole("button", { name: "Hire" }));

    await waitFor(() => expect(api.hireHrCandidate).toHaveBeenCalledTimes(1));
    // The route names the candidate; the body is the profile the same
    // transaction writes. Grade was left empty, so it is not sent at all.
    expect(api.hireHrCandidate).toHaveBeenCalledWith("cand-1", {
      member_id: MEMBER.id,
      hire_date: "2026-03-02",
      job_title: JOB.title,
    });
  });

  it("sends an edited position and a grade when the user fills them in", async () => {
    renderDialog();
    await pickMember();
    fireEvent.change(screen.getByLabelText("Position"), { target: { value: "资深运营" } });
    fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "P6" } });

    await userEvent.click(screen.getByRole("button", { name: "Hire" }));

    await waitFor(() => expect(api.hireHrCandidate).toHaveBeenCalledTimes(1));
    expect(api.hireHrCandidate).toHaveBeenCalledWith("cand-1", {
      member_id: MEMBER.id,
      hire_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      job_title: "资深运营",
      grade: "P6",
    });
  });

  it("reports the hire once the server confirms and closes the dialog", async () => {
    api.hireHrCandidate.mockResolvedValueOnce({ candidate: CANDIDATE, employee_profile: HIRED });
    const { onOpenChange, onHired } = renderDialog();
    await pickMember();

    await userEvent.click(screen.getByRole("button", { name: "Hire" }));

    await waitFor(() => expect(onHired).toHaveBeenCalledTimes(1));
    // The response carries the profile the transaction created or updated; the
    // candidate row alone cannot name it, so the whole envelope is handed over.
    expect(onHired).toHaveBeenCalledWith({ candidate: CANDIDATE, employee_profile: HIRED });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog and its values when the server rejects the hire", async () => {
    api.hireHrCandidate.mockRejectedValueOnce(new Error("409 conflict"));
    const { onOpenChange, onHired } = renderDialog();
    await pickMember();

    await userEvent.click(screen.getByRole("button", { name: "Hire" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/The server refused this hire/);
    expect(onHired).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // The transaction wrote both tables or neither, so the retry is the form
    // itself: what was typed is still there.
    expect(screen.getByLabelText<HTMLInputElement>("Position").value).toBe(JOB.title);
    expect(screen.getByRole("button", { name: "Hire" })).toBeEnabled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  hrCandidateListOptions,
  hrInterviewListOptions,
  hrScorecardListOptions,
} from "@morechat/core/hr/queries";
import { memberListOptions } from "@morechat/core/workspace/queries";
import type { HrCandidate, HrInterview, MemberWithUser } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { HrInterviewsPage } from "./interviews-page";

/**
 * The interview page, end to end over its two readings (`WORKBENCH-API.md`
 * §10.3): the week grid a slot is picked from, the list a round is scanned in,
 * the arrange form including the exclusive-slot 409, the sheet an interview
 * opens into, and the one state a reader without write access gets.
 *
 * The page's own copy lives in `interviews-copy.ts` and reaches the screen as
 * `defaultValue` until the eight bundles carry it, so the English words this
 * suite asserts are the table's — the same strings the merge has to translate.
 * The keys the page shell already used (`nav.hr_interviews`, `empty_title`,
 * `empty_description`, `action`) come from the real bundle.
 */

const WS = "ws-1";

const api = vi.hoisted(() => {
  class ApiError extends Error {
    readonly status: number;
    readonly statusText: string;
    constructor(message: string, status: number, statusText: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.statusText = statusText;
    }
  }
  return {
    ApiError,
    api: {
      createHrInterview: vi.fn(),
      updateHrInterview: vi.fn(),
      deleteHrInterview: vi.fn(),
      createHrScorecard: vi.fn(),
      updateHrScorecard: vi.fn(),
      listHrInterviews: vi.fn(async () => ({ interviews: [], total: 0 })),
      listHrCandidates: vi.fn(async () => ({ candidates: [], total: 0 })),
      listHrScorecards: vi.fn(async () => ({ scorecards: [], total: 0 })),
      listMembers: vi.fn(async () => []),
    },
  };
});

vi.mock("@morechat/core/api", () => ({ api: api.api, ApiError: api.ApiError }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

const viewer = vi.hoisted(() => ({
  role: "admin" as "owner" | "admin" | "member" | null,
}));

vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: "user-1",
    role: viewer.role,
    member: null,
    isLoading: false,
  }),
}));

/** A local wall-clock instant today, as the iso string the server stores. */
function todayAt(hour: number, minute: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).toISOString();
}

const CANDIDATE: HrCandidate = {
  id: "cand-1",
  workspace_id: WS,
  job_id: "job-1",
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

/** A candidate with nothing on the books: arranging for them is a first round. */
const CANDIDATE_NO_ROUNDS: HrCandidate = {
  ...CANDIDATE,
  id: "cand-2",
  name: "Zhang Yu",
  stage: "screening",
};

const MEMBER: MemberWithUser = {
  id: "member-1",
  workspace_id: WS,
  user_id: "user-1",
  role: "admin",
  created_at: "2026-01-01T09:00:00Z",
  name: "Zhao Min",
  email: "zhao@example.com",
  avatar_url: null,
  department_id: null,
};

function interview(overrides: Partial<HrInterview> & Pick<HrInterview, "id">): HrInterview {
  return {
    workspace_id: WS,
    candidate_id: CANDIDATE.id,
    round: 1,
    scheduled_at: todayAt(14, 30),
    duration_minutes: 60,
    interviewer_member_id: null,
    interviewer_name: "Zhao Min",
    mode: "onsite",
    status: "scheduled",
    rescheduled_count: 0,
    note: null,
    created_by: null,
    created_at: "2026-01-06T09:00:00Z",
    updated_at: "2026-01-06T09:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

// Three slots on one day, all inside this week whatever day the suite runs on.
const ROWS: HrInterview[] = [
  interview({ id: "iv-1", round: 1, scheduled_at: todayAt(14, 30) }),
  interview({ id: "iv-2", round: 2, scheduled_at: todayAt(16, 0), interviewer_name: "Wang Lei" }),
  interview({ id: "iv-3", round: 3, scheduled_at: todayAt(17, 30), status: "done" }),
];

function adapter(): NavigationAdapter {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    pathname: "/acme/hr/interviews",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderPage(rows: readonly HrInterview[] = ROWS) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(hrInterviewListOptions(WS).queryKey, {
    interviews: [...rows],
    total: rows.length,
  });
  qc.setQueryData(hrCandidateListOptions(WS).queryKey, {
    candidates: [CANDIDATE, CANDIDATE_NO_ROUNDS],
    total: 2,
  });
  qc.setQueryData(memberListOptions(WS).queryKey, [MEMBER]);
  for (const row of rows) {
    qc.setQueryData(hrScorecardListOptions(WS, { interview_id: row.id }).queryKey, {
      scorecards: [],
      total: 0,
    });
  }
  return renderWithI18n(
    <QueryClientProvider client={qc}>
      <NavigationProvider value={adapter()}>
        <HrInterviewsPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  viewer.role = "admin";
  api.api.createHrInterview.mockReset();
  api.api.updateHrInterview.mockReset();
  api.api.deleteHrInterview.mockReset();
});

afterEach(cleanup);

describe("HrInterviewsPage · the two readings", () => {
  it("draws the week's interviews as events on the hour they start", () => {
    const { container } = renderPage();
    const grid = screen.getByRole("grid", { name: "Interview week" });
    expect(grid.querySelectorAll("[data-event-id]")).toHaveLength(3);

    // The week view is a wall clock: the chip carries the local start time and
    // the candidate, and it sits in the hour cell that time falls in.
    const first = container.querySelector<HTMLElement>('[data-event-id="iv-1"]');
    expect(first).not.toBeNull();
    expect(first).toHaveTextContent("14:30");
    expect(first).toHaveTextContent("Lin Wei");
    expect(first?.closest("[data-hour-cell]")?.getAttribute("data-hour-cell")).toMatch(/T14$/);
  });

  it("switches to the list and draws the same three rows as a table", async () => {
    const { container } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "List" }));

    const grid = screen.getByRole("grid", { name: "Interviews" });
    expect(container.querySelectorAll("[data-row-id]")).toHaveLength(3);
    for (const header of [
      "Candidate",
      "Round",
      "Time",
      "Duration",
      "Interviewer",
      "Mode",
      "Status",
    ]) {
      expect(within(grid).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    // The enum columns are copy, not the wire value.
    expect(within(grid).getAllByText("Onsite")).toHaveLength(3);
    expect(within(grid).getAllByText("Scheduled")).toHaveLength(2);
    expect(within(grid).getByText("Done")).toBeInTheDocument();
    expect(within(grid).getAllByText("60 min")).toHaveLength(3);
  });
});

describe("HrInterviewsPage · arranging one", () => {
  it("sends the picked candidate, slot and interviewer name", async () => {
    api.api.createHrInterview.mockResolvedValueOnce(interview({ id: "iv-new" }));
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Schedule interview" }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.click(within(dialog).getByRole("combobox", { name: "Candidate" }));
    await userEvent.click(await screen.findByRole("option", { name: "Zhang Yu" }));
    fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: "2026-03-02" } });
    fireEvent.change(within(dialog).getByLabelText("Time"), { target: { value: "15:00" } });
    fireEvent.change(within(dialog).getByLabelText("Interviewer name"), {
      target: { value: "Zhao Min" },
    });

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.api.createHrInterview).toHaveBeenCalledTimes(1));
    expect(api.api.createHrInterview).toHaveBeenCalledWith({
      candidate_id: CANDIDATE_NO_ROUNDS.id,
      // Nothing else on file for this candidate, so the form proposes round 1.
      round: 1,
      // A picked day and time are a wall clock, built in the reader's zone.
      scheduled_at: new Date(2026, 2, 2, 15, 0).toISOString(),
      duration_minutes: 60,
      // A name alone is a complete answer: outside interviewers have no account.
      interviewer_member_id: null,
      interviewer_name: "Zhao Min",
      mode: null,
      note: null,
    });
  });

  it("keeps the form and says so when the slot is already taken", async () => {
    api.api.createHrInterview.mockRejectedValueOnce(
      new api.ApiError("interview already scheduled", 409, "Conflict"),
    );
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Schedule interview" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Candidate" }));
    await userEvent.click(await screen.findByRole("option", { name: "Zhang Yu" }));
    fireEvent.change(within(dialog).getByLabelText("Interviewer name"), {
      target: { value: "Zhao Min" },
    });

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This interviewer already has an interview at this time.",
    );
    // The form stays open with what was typed: the fix is another time or
    // another interviewer, and clearing the form would throw that work away.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByLabelText<HTMLInputElement>("Interviewer name").value).toBe(
      "Zhao Min",
    );
  });
});

describe("HrInterviewsPage · reading one", () => {
  it("opens the interview's sheet from its event", async () => {
    const { container } = renderPage();
    const chip = container.querySelector<HTMLElement>('[data-event-id="iv-2"]');
    if (!chip) throw new Error("no event for iv-2");

    await userEvent.click(chip);

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(/Lin Wei · Round 2/)).toBeInTheDocument();
    expect(within(sheet).getByText("Wang Lei")).toBeInTheDocument();
    // The score entry is the sheet's other half: four weighted dimensions.
    expect(within(sheet).getByRole("region", { name: "Scorecard" })).toBeInTheDocument();
    expect(within(sheet).getByRole("combobox", { name: "Skill" })).toBeInTheDocument();
  });
});

describe("HrInterviewsPage · write access", () => {
  it("offers no way to schedule to a reader who cannot write", () => {
    viewer.role = null;
    renderPage();
    expect(screen.queryByRole("button", { name: "Schedule interview" })).toBeNull();
    // The calendar is still a readable document.
    expect(screen.getByRole("grid", { name: "Interview week" })).toBeInTheDocument();
  });
});

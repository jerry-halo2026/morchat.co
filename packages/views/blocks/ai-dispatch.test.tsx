import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { agentListOptions } from "@morechat/core/workspace/queries";
import type { Agent, CreateIssueRequest, HrCandidate, HrJob } from "@morechat/core/types";
import { renderWithI18n } from "../test/i18n";
import { AiDispatchButton } from "./ai-dispatch";

// The button's whole contract is the issue it writes: a workspace agent is the
// assignee, and the description carries the fields an agent needs to start. The
// API is mocked at `@morechat/core/api`, so the assertions are about the request
// the real mutation sends rather than about a stand-in hook.

const WS = "ws-1";

const api = vi.hoisted(() => ({
  createIssue: vi.fn(async (_data: CreateIssueRequest) => ({
    id: "issue-1",
    parent_issue_id: null,
  })),
  listAgents: vi.fn(async () => [] as unknown[]),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

// Only the three fields the button reads; the rest of an `Agent` is the agents
// area's business.
const AGENT = {
  id: "agent-1",
  workspace_id: WS,
  name: "Mika",
  archived_at: null,
} as Agent;

const ARCHIVED = {
  id: "agent-0",
  workspace_id: WS,
  name: "Retired",
  archived_at: "2026-01-01T00:00:00Z",
} as Agent;

const JOB: HrJob = {
  id: "job-1",
  workspace_id: WS,
  title: "Senior video editor",
  department_id: null,
  level: "P5",
  headcount: 1,
  status: "open",
  salary_min: 18000,
  salary_max: 24000,
  currency: "CNY",
  requirements: null,
  edu: "本科",
  years: "3-5 年",
  city: null,
  jd: null,
  urgent: false,
  keywords: ["剪辑", "短视频"],
  owner_member_id: null,
  created_by: null,
  created_at: "2026-01-04T09:00:00Z",
  updated_at: "2026-01-04T09:00:00Z",
  archived_at: null,
};

const CANDIDATE: HrCandidate = {
  id: "cand-1",
  workspace_id: WS,
  job_id: JOB.id,
  name: "Lin Wei",
  stage: "interview",
  source: "Referral",
  phone: null,
  email: null,
  resume_attachment_id: null,
  match_score: null,
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

beforeEach(() => {
  api.createIssue.mockClear();
  api.listAgents.mockClear();
});

afterEach(cleanup);

function renderButton(agents: Agent[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // The agent list is the team strip's cache entry; seeding it keeps the
  // assertions about the request rather than about fetching.
  qc.setQueryData(agentListOptions(WS).queryKey, agents);
  return renderWithI18n(
    <QueryClientProvider client={qc}>
      <AiDispatchButton candidate={CANDIDATE} job={JOB} wsId={WS} />
    </QueryClientProvider>,
  );
}

describe("AiDispatchButton · no agent", () => {
  it("disables the button and names the missing step", async () => {
    renderButton([]);

    const button = screen.getByRole("button", { name: "Brief with an agent" });
    expect(button).toBeDisabled();
    // The workspace has no actor to assign to, so the button explains what is
    // missing instead of offering a dispatch that cannot work.
    expect(screen.getByText(/No agent yet/)).toBeInTheDocument();

    await userEvent.click(button);
    expect(api.createIssue).not.toHaveBeenCalled();
  });

  it("skips an archived agent, which cannot run", () => {
    // `include_archived` puts retired agents in the same list; assigning to one
    // would create an issue nobody picks up.
    renderButton([ARCHIVED]);
    expect(screen.getByRole("button", { name: "Brief with an agent" })).toBeDisabled();
  });
});

describe("AiDispatchButton · dispatching", () => {
  it("creates the issue for the workspace's agent with the candidate's brief", async () => {
    renderButton([AGENT]);

    await userEvent.click(screen.getByRole("button", { name: "Brief with an agent" }));

    await waitFor(() => expect(api.createIssue).toHaveBeenCalledTimes(1));
    const payload = api.createIssue.mock.calls[0]?.[0];
    expect(payload?.title).toBe("Brief candidate: Lin Wei");
    expect(payload?.assignee_type).toBe("agent");
    expect(payload?.assignee_id).toBe(AGENT.id);
    // The description is what the agent reads first: the role, the fields the
    // ledger knows, and the instruction the brief exists for.
    const description = payload?.description ?? "";
    expect(description).toContain("Senior video editor");
    expect(description).toContain("Interview");
    expect(description).toContain("21000");
    expect(description).toContain("剪辑");
    expect(description).toContain("Write a brief card");
    expect(description).toContain("interview questions");

    expect(await screen.findByText("Assigned to Mika")).toBeInTheDocument();
  });

  it("keeps the button and reports the failure", async () => {
    api.createIssue.mockRejectedValueOnce(new Error("403"));
    renderButton([AGENT]);

    await userEvent.click(screen.getByRole("button", { name: "Brief with an agent" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/issue wasn’t created/);
    // Nothing was optimistic, so a retry is the same click.
    expect(screen.getByRole("button", { name: "Brief with an agent" })).toBeEnabled();
    expect(screen.queryByText(/Assigned to/)).toBeNull();
  });
});

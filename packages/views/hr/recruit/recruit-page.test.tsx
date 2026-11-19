import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DragEndEvent } from "@dnd-kit/core";
import type { HrCandidate, HrJob } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { HrRecruitPage } from "./recruit-page";

// dnd-kit's pointer sensor needs layout (jsdom reports every rect as 0×0), so the
// gesture itself is not simulated: the wrapper below keeps the real context,
// sensors and draggables and records the `onDragEnd` a pointer release would
// call. Everything after that — the board's optimistic move, the page's PATCH —
// is the real code.
const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as ((event: DragEndEvent) => unknown) | undefined,
}));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    DndContext: (props: Parameters<typeof actual.DndContext>[0]) => {
      dnd.onDragEnd = props.onDragEnd as typeof dnd.onDragEnd;
      return createElement(actual.DndContext, props);
    },
  };
});

const WS = "ws-1";

// The page reads through the real query hooks and the real mutations, so what is
// mocked is the API boundary: every assertion below is about the request the page
// actually makes (`PATCH` candidate with a stage), not about a stub's return.
const api = vi.hoisted(() => ({
  listHrJobs: vi.fn(),
  listHrCandidates: vi.fn(),
  listHrInterviews: vi.fn(),
  listMembers: vi.fn(async () => [] as unknown[]),
  updateHrCandidate: vi.fn(),
  deleteHrCandidate: vi.fn(),
  hireHrCandidate: vi.fn(),
  getAttachment: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The candidate sheet links to the attachment preview route, which resolves a
// workspace slug this suite does not mount.
vi.mock("@morechat/core/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@morechat/core/paths")>();
  return {
    ...actual,
    useWorkspacePaths: () => ({
      attachmentPreview: (id: string) => `/acme/attachments/${id}/preview`,
    }),
  };
});

// Who the reader is in the workspace: the one input that decides whether the
// board writes at all.
const member = vi.hoisted(() => ({
  userId: "user-1",
  role: "member" as "owner" | "admin" | "member" | null,
}));

vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: member.userId,
    role: member.role,
    member: null,
    isLoading: false,
  }),
}));

const JOB: HrJob = {
  id: "job-1",
  workspace_id: WS,
  title: "Senior video editor",
  department_id: null,
  level: "P5",
  headcount: 2,
  status: "open",
  salary_min: 18000,
  salary_max: 24000,
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
  created_at: "2026-01-04T09:00:00Z",
  updated_at: "2026-01-04T09:00:00Z",
  archived_at: null,
};

function candidate(overrides: Partial<HrCandidate> & Pick<HrCandidate, "id" | "name" | "stage">): HrCandidate {
  return {
    workspace_id: WS,
    job_id: JOB.id,
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
    created_at: "2026-01-05T09:00:00Z",
    updated_at: "2026-01-05T09:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

const ADA = candidate({ id: "cand-1", name: "Ada Lin", stage: "screening", match_score: 82 });
const BO = candidate({ id: "cand-2", name: "Bo Chen", stage: "interview" });
const CAI = candidate({
  id: "cand-3",
  name: "Cai Wu",
  stage: "offer",
  expected_salary: 21000,
  source: "Referral",
  resume_text: "Ten years editing short-form video.",
});
const DAI = candidate({ id: "cand-4", name: "Dai Zhou", stage: "rejected" });

function adapter(): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/acme/hr/recruit",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <NavigationProvider value={adapter()}>
        <HrRecruitPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

function dropEvent(activeId: string, overId: string): DragEndEvent {
  return { active: { id: activeId }, over: { id: overId } } as unknown as DragEndEvent;
}

function column(stage: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-kanban-column="${stage}"]`);
  if (!element) throw new Error(`no column "${stage}"`);
  return element;
}

beforeEach(() => {
  member.role = "member";
  member.userId = "user-1";
  api.listHrJobs.mockResolvedValue({ jobs: [JOB], total: 1 });
  api.listHrCandidates.mockResolvedValue({ candidates: [ADA, BO, CAI, DAI], total: 4 });
  api.listHrInterviews.mockResolvedValue({ interviews: [], total: 0 });
  api.updateHrCandidate.mockImplementation(async (id: string, data: { stage?: string }) =>
    candidate({ id, name: "candidate", stage: (data.stage ?? "screening") as HrCandidate["stage"] }),
  );
  api.getAttachment.mockResolvedValue({ id: "att-1", filename: "cv.pdf" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HrRecruitPage", () => {
  it("draws the empty state when the workspace has no role to hire for", async () => {
    api.listHrJobs.mockResolvedValue({ jobs: [], total: 0 });

    renderPage();

    expect(await screen.findByText("No open roles yet")).toBeInTheDocument();
    // The one action on an empty board is the page's create — offered in the
    // header and again in the empty state, which is the page's one solid button.
    expect(screen.getAllByRole("button", { name: "New role" }).length).toBeGreaterThan(0);
    // No board: there is nothing to file.
    expect(document.querySelector("[data-kanban-board]")).toBeNull();
  });

  it("draws the six live stages as columns and files each candidate by stage", async () => {
    const { container } = renderPage();

    await screen.findByText("Ada Lin");

    const stages = [...container.querySelectorAll<HTMLElement>("[data-kanban-column]")].map(
      (element) => element.getAttribute("data-kanban-column"),
    );
    expect(stages).toEqual(["screening", "test", "interview", "scored", "offer", "hired"]);

    expect(within(column("screening")).getByText("Ada Lin")).toBeInTheDocument();
    expect(within(column("interview")).getByText("Bo Chen")).toBeInTheDocument();
    expect(within(column("offer")).getByText("Cai Wu")).toBeInTheDocument();
    // The two closed stages are folded counts beside the board, not columns.
    expect(container.querySelector('[data-kanban-column="rejected"]')).toBeNull();
    expect(container.querySelector('[data-kanban-column="withdrawn"]')).toBeNull();
    expect(screen.getByRole("button", { name: /Rejected/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /Withdrawn/ })).toHaveTextContent("0");
  });

  it("patches the dropped candidate's stage when a card lands in another column", async () => {
    renderPage();
    await screen.findByText("Bo Chen");

    act(() => {
      dnd.onDragEnd?.(dropEvent("cand-2", "offer"));
    });

    await waitFor(() => {
      expect(api.updateHrCandidate).toHaveBeenCalledTimes(1);
    });
    expect(api.updateHrCandidate).toHaveBeenCalledWith("cand-2", { stage: "offer" });
  });

  it("opens the candidate sheet on a card click and switches between its four tabs", async () => {
    renderPage();
    await screen.findByText("Cai Wu");

    fireEvent.click(screen.getByText("Cai Wu"));

    const tabs = await screen.findAllByRole("tab");
    expect(tabs).toHaveLength(4);
    // The sheet opens on the profile tab, whose fields are the row's own columns.
    expect(screen.getByLabelText("Name")).toHaveValue("Cai Wu");

    const resumeTab = tabs[1];
    if (!resumeTab) throw new Error("no resume tab");
    fireEvent.click(resumeTab);
    expect(await screen.findByText("Ten years editing short-form video.")).toBeInTheDocument();

    const interviewTab = tabs[2];
    if (!interviewTab) throw new Error("no interviews tab");
    fireEvent.click(interviewTab);
    await waitFor(() => {
      expect(api.listHrInterviews).toHaveBeenCalledWith({ candidate_id: "cand-3" });
    });
  });

  it("keeps the board read-only for a reader without write access", async () => {
    member.role = null;

    renderPage();
    await screen.findByText("Bo Chen");

    expect(document.querySelector("[data-recruit-board]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    // The cards are drawn and openable, but a drop moves nothing.
    act(() => {
      dnd.onDragEnd?.(dropEvent("cand-2", "offer"));
    });
    expect(api.updateHrCandidate).not.toHaveBeenCalled();
  });
});

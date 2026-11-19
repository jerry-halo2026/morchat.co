import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HrCandidate, HrJob } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { HrResumesPage } from "./resumes-page";

const WS = "ws-1";

// The page reads through the real query hooks and the real mutation, so what is
// mocked is the API boundary: every assertion below is about the request the
// page actually makes (a PATCH with a stage), not about a stub's return.
const api = vi.hoisted(() => ({
  listHrJobs: vi.fn(),
  listHrCandidates: vi.fn(),
  updateHrCandidate: vi.fn(),
  getAttachment: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The preview links to the attachment route, which resolves a workspace slug
// this suite does not mount.
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
// page writes at all.
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

function candidate(
  overrides: Partial<HrCandidate> & Pick<HrCandidate, "id" | "name" | "stage">,
): HrCandidate {
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

const ADA = candidate({
  id: "cand-1",
  name: "Ada Lin",
  stage: "screening",
  match_score: 82,
  source: "Referral",
  resume_text: "Eight years cutting short-form video for consumer brands.",
});
const BO = candidate({
  id: "cand-2",
  name: "Bo Chen",
  stage: "screening",
  match_score: 64,
  source: "Job board",
  resume_text: "Documentary editor moving into brand work.",
});

function adapter(): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/acme/hr/resumes",
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
        <HrResumesPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

/** The left column's keydown host: the column, not one row, handles the arrows. */
function list(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-slot="resume-list"]');
  if (!element) throw new Error("no candidate list");
  return element;
}

function preview(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-slot="resume-preview"]');
  if (!element) throw new Error("no résumé preview");
  return element;
}

/** The first candidate's résumé body; it appears only in the preview column. */
const ADA_RESUME = "Eight years cutting short-form video for consumer brands.";
const BO_RESUME = "Documentary editor moving into brand work.";

/**
 * The queue has loaded. The name is not the signal — it is on the card and in
 * the preview header both — so the wait is on a body that only the preview
 * draws.
 */
async function waitForQueue(): Promise<void> {
  await screen.findByText(ADA_RESUME);
}

beforeEach(() => {
  member.role = "member";
  member.userId = "user-1";
  api.listHrJobs.mockResolvedValue({ jobs: [JOB], total: 1 });
  api.listHrCandidates.mockResolvedValue({ candidates: [ADA, BO], total: 2 });
  api.updateHrCandidate.mockImplementation(async (id: string, data: { stage?: string }) =>
    candidate({ id, name: "candidate", stage: (data.stage ?? "screening") as HrCandidate["stage"] }),
  );
  api.getAttachment.mockResolvedValue({ id: "att-1", filename: "ada-cv.pdf" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HrResumesPage", () => {
  it("draws the empty state when the role has no application", async () => {
    api.listHrCandidates.mockResolvedValue({ candidates: [], total: 0 });

    renderPage();

    expect(await screen.findByText("No applications yet")).toBeInTheDocument();
    // Nothing to read: neither column is drawn, and no queue is announced.
    expect(document.querySelector('[data-slot="resume-list"]')).toBeNull();
    expect(document.querySelector('[data-slot="resume-preview"]')).toBeNull();
  });

  it("draws the queue and the résumé side by side, with the first candidate selected", async () => {
    renderPage();

    await waitForQueue();

    expect(list()).toBeInTheDocument();
    expect(preview()).toBeInTheDocument();
    // The default selection is the first row, and its résumé is what the right
    // column shows — the page never opens on an empty detail pane.
    expect(within(list()).getByRole("button", { name: /Ada Lin/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(preview()).getByText(ADA_RESUME)).toBeInTheDocument();
    // The strip above the two columns counts what is still unread.
    expect(screen.getByRole("status")).toHaveTextContent("2 waiting for screening");
  });

  it("moves the selection down the list on ↓ and follows it with the preview", async () => {
    renderPage();
    await waitForQueue();

    fireEvent.keyDown(list(), { key: "ArrowDown" });

    await waitFor(() => {
      expect(within(list()).getByRole("button", { name: /Bo Chen/ })).toHaveAttribute(
        "aria-current",
        "true",
      );
    });
    // The right column reads the row that just became selected.
    expect(within(preview()).getByText(BO_RESUME)).toBeInTheDocument();
    expect(within(preview()).queryByText(ADA_RESUME)).toBeNull();

    // ↑ walks back, and stops at the top rather than wrapping.
    fireEvent.keyDown(list(), { key: "ArrowUp" });
    fireEvent.keyDown(list(), { key: "ArrowUp" });
    expect(within(list()).getByRole("button", { name: /Ada Lin/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("sends a stage PATCH when a candidate is approved", async () => {
    renderPage();
    await waitForQueue();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(api.updateHrCandidate).toHaveBeenCalledTimes(1);
    });
    expect(api.updateHrCandidate).toHaveBeenCalledWith("cand-1", { stage: "test" });
  });

  it("rejects with the reason typed into the prompt", async () => {
    renderPage();
    await waitForQueue();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    // The prompt replaces the bar's buttons with a reason field and a confirm.
    const reason = await screen.findByRole("textbox", { name: "Reason rejected" });
    fireEvent.change(reason, { target: { value: "Portfolio is off-brief" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(api.updateHrCandidate).toHaveBeenCalledTimes(1);
    });
    expect(api.updateHrCandidate).toHaveBeenCalledWith("cand-1", {
      stage: "rejected",
      rejected_reason: "Portfolio is off-brief",
    });
  });

  it("counts the ticked candidates in the batch bar", async () => {
    renderPage();
    await waitForQueue();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Ada Lin" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Bo Chen" }));

    const bar = document.querySelector<HTMLElement>('[data-slot="resume-actions"]');
    expect(bar).not.toBeNull();
    expect(within(bar as HTMLElement).getByText("2 selected")).toBeInTheDocument();
    // The batch bar is the same bar as the single row's: the per-row name is
    // replaced by the count, and 通过/淘汰 now act on the selection.
    expect(within(bar as HTMLElement).getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(within(bar as HTMLElement).getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("patches every ticked candidate one by one", async () => {
    renderPage();
    await waitForQueue();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Ada Lin" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Bo Chen" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(api.updateHrCandidate).toHaveBeenCalledTimes(2);
    });
    // One PATCH per row, not one bulk request: each candidate is its own
    // decision, so a failure on one leaves the other where it landed.
    expect(api.updateHrCandidate).toHaveBeenNthCalledWith(1, "cand-1", { stage: "test" });
    expect(api.updateHrCandidate).toHaveBeenNthCalledWith(2, "cand-2", { stage: "test" });
  });

  it("offers no 通过 or 淘汰 to a reader without write access", async () => {
    member.role = null;

    renderPage();
    await waitForQueue();

    // The queue is still drawn and still readable…
    expect(within(list()).getByRole("button", { name: /Ada Lin/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    // …and the arrows still move the selection…
    fireEvent.keyDown(list(), { key: "ArrowDown" });
    await waitFor(() => {
      expect(within(preview()).getByText(BO_RESUME)).toBeInTheDocument();
    });

    // …but nothing writes, and no batch exists to write with.
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(document.querySelector('[data-slot="resume-actions"]')).toBeNull();
    expect(api.updateHrCandidate).not.toHaveBeenCalled();
  });
});

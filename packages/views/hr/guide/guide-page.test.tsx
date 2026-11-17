import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hrCandidateListOptions } from "@morechat/core/hr/queries";
import { hrGuideListOptions, hrQuestionListOptions } from "@morechat/core/guide";
import type { HrCandidate, HrGuideItem, HrInterviewGuide } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { HrGuidePage } from "./guide-page";

/**
 * The interview-guide page (`WORKBENCH-API.md` §14): the list of prepared
 * rounds, the sheet an outline is written in, and the one-question-at-a-time
 * view the interviewer holds.
 *
 * The page's own copy lives in `guide-copy.ts` and reaches the screen as
 * `defaultValue` until the eight bundles carry it, so the English words this
 * suite asserts are that table's — the same strings the merge has to translate.
 * The keys the page also reads from the bundle (`nav.hr_guide`,
 * `hr.guide.empty_title`, `hr.guide.action`) come from the real locales.
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
      listHrInterviewGuides: vi.fn(async () => ({ guides: [], total: 0 })),
      listHrCandidates: vi.fn(async () => ({ candidates: [], total: 0 })),
      listHrQuestions: vi.fn(async () => ({ questions: [], total: 0 })),
      createHrInterviewGuide: vi.fn(),
      updateHrInterviewGuide: vi.fn(),
      deleteHrInterviewGuide: vi.fn(),
      generateHrInterviewGuide: vi.fn(),
      createHrQuestion: vi.fn(),
    },
  };
});

vi.mock("@morechat/core/api", () => ({ api: api.api, ApiError: api.ApiError }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Who the reader is: the one input that decides whether the page writes at all.
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

function candidate(id: string, name: string): HrCandidate {
  return {
    id,
    workspace_id: WS,
    job_id: "job-1",
    name,
    stage: "interview",
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
  };
}

const LIN = candidate("cand-1", "Lin Wei");
const ZHANG = candidate("cand-2", "Zhang Yu");

function item(question: string, overrides: Partial<HrGuideItem> = {}): HrGuideItem {
  return {
    question_id: null,
    dimension: "skill",
    question,
    intent: "",
    signals: "",
    red_flags: "",
    asked: false,
    note: "",
    score: null,
    ...overrides,
  };
}

function guide(overrides: Partial<HrInterviewGuide> = {}): HrInterviewGuide {
  return {
    id: "g-1",
    workspace_id: WS,
    interview_id: null,
    candidate_id: LIN.id,
    job_id: null,
    round: 1,
    status: "draft",
    items: [],
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-02-01T09:00:00Z",
    updated_at: "2026-02-01T09:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function adapter(): NavigationAdapter {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    pathname: "/acme/hr/guide",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

/**
 * The page reads through the real query hooks, so the suite seeds the cache the
 * real hook would have filled: one key shape, both halves of the screen.
 */
function renderPage(rows: readonly HrInterviewGuide[] = []) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(hrGuideListOptions(WS).queryKey, { guides: [...rows], total: rows.length });
  qc.setQueryData(hrCandidateListOptions(WS).queryKey, {
    candidates: [LIN, ZHANG],
    total: 2,
  });
  // The picker's unfiltered read: a guide with no requisition reads every
  // question, which is the key the sheet opens on.
  qc.setQueryData(hrQuestionListOptions(WS, {}).queryKey, { questions: [], total: 0 });
  return renderWithI18n(
    <QueryClientProvider client={qc}>
      <NavigationProvider value={adapter()}>
        <HrGuidePage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

/** The questions the outline currently holds, in the order it will be asked. */
function askedOrder(): string[] {
  return Array.from(document.querySelectorAll('[data-slot="guide-item-question"]')).map(
    (node) => node.textContent ?? "",
  );
}

async function openEditor(name: string) {
  await userEvent.click(screen.getByText(name));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  viewer.role = "admin";
  api.api.generateHrInterviewGuide.mockReset();
  api.api.updateHrInterviewGuide.mockReset();
  api.api.createHrInterviewGuide.mockReset();
  api.api.deleteHrInterviewGuide.mockReset();
  api.api.createHrQuestion.mockReset();
});

afterEach(cleanup);

describe("HrGuidePage · the list", () => {
  it("asks for a candidate when nothing has been prepared", async () => {
    renderPage();
    expect(
      await screen.findByText("Pick a candidate to start an outline."),
    ).toBeInTheDocument();
    // A first run offers the page's one action — in the header and again in the
    // empty state — and nothing is listed.
    expect(screen.getAllByRole("button", { name: "New guide" }).length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-row-id]")).toHaveLength(0);
  });

  it("draws one row per prepared round", async () => {
    renderPage([
      guide({ id: "g-1", items: [item("Q1"), item("Q2", { asked: true })], status: "ready" }),
      guide({ id: "g-2", candidate_id: ZHANG.id, round: 2, items: [item("Q3")] }),
    ]);

    expect(await screen.findAllByText("Lin Wei")).not.toHaveLength(0);
    const rows = document.querySelectorAll("[data-row-id]");
    expect(rows).toHaveLength(2);

    const first = rows[0] as HTMLElement;
    expect(within(first).getByText("Lin Wei")).toBeInTheDocument();
    expect(within(first).getByText("Ready")).toBeInTheDocument();
    // 题数 and 已问 are counted from the snapshot, not stored separately.
    expect(within(first).getByText("2")).toBeInTheDocument();
    expect(within(first).getByText("1/2")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("Zhang Yu")).toBeInTheDocument();
  });
});

describe("HrGuidePage · writing an outline", () => {
  it("drafts from the candidate and fills the editor with what came back", async () => {
    api.api.generateHrInterviewGuide.mockResolvedValueOnce({
      candidate_id: LIN.id,
      round: 1,
      job_id: null,
      source: "template",
      items: [item("How do you scope a week?"), item("Tell me about a launch."), item("What went wrong?")],
      total: 3,
    });
    renderPage([guide()]);

    const sheet = await openEditor("Lin Wei");
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Draft from JD and résumé" }),
    );

    // The request names the person and the round; nothing is written yet.
    expect(api.api.generateHrInterviewGuide).toHaveBeenCalledWith({
      candidate_id: LIN.id,
      round: 1,
    });
    expect(api.api.createHrInterviewGuide).not.toHaveBeenCalled();
    expect(api.api.updateHrInterviewGuide).not.toHaveBeenCalled();

    // The editor's own count says how many the draft put on screen.
    await waitFor(() =>
      expect(sheet.querySelector('[data-slot="guide-item-count"]')).toHaveTextContent("3"),
    );
    expect(askedOrder()).toEqual([
      "How do you scope a week?",
      "Tell me about a launch.",
      "What went wrong?",
    ]);
    // The draft says which generator wrote it: the template skeleton is not AI.
    expect(within(sheet).getByText(/Template skeleton/)).toBeInTheDocument();
  });

  it("moves a question up and down the round", async () => {
    renderPage([guide({ items: [item("Q1"), item("Q2"), item("Q3")] })]);

    const sheet = await openEditor("Lin Wei");
    const items = sheet.querySelectorAll('[data-slot="guide-item"]');
    expect(items).toHaveLength(3);

    // The middle question moves up: order is the round's, so it edits the array.
    await userEvent.click(
      within(items[1] as HTMLElement).getByRole("button", { name: "Move up" }),
    );
    expect(askedOrder()).toEqual(["Q2", "Q1", "Q3"]);

    const moved = sheet.querySelectorAll('[data-slot="guide-item"]');
    await userEvent.click(
      within(moved[0] as HTMLElement).getByRole("button", { name: "Move down" }),
    );
    expect(askedOrder()).toEqual(["Q1", "Q2", "Q3"]);
  });

  it("saves the whole snapshot in one PATCH, in the order on screen", async () => {
    api.api.updateHrInterviewGuide.mockResolvedValueOnce(guide());
    renderPage([guide({ items: [item("Q1", { question_id: "q-1" }), item("Q2")] })]);

    const sheet = await openEditor("Lin Wei");
    const items = sheet.querySelectorAll('[data-slot="guide-item"]');
    await userEvent.click(
      within(items[1] as HTMLElement).getByRole("button", { name: "Move up" }),
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.api.updateHrInterviewGuide).toHaveBeenCalledTimes(1));
    expect(api.api.updateHrInterviewGuide).toHaveBeenCalledWith("g-1", {
      items: [item("Q2"), item("Q1", { question_id: "q-1" })],
      status: "draft",
    });
  });
});

describe("HrGuidePage · the round itself", () => {
  it("shows one question at a time, and ticking asked moves to the next", async () => {
    renderPage([
      guide({
        status: "ready",
        items: [item("Q1", { intent: "Scope" }), item("Q2")],
      }),
    ]);

    const sheet = await openEditor("Lin Wei");
    await userEvent.click(within(sheet).getByRole("button", { name: "Start the interview" }));

    // The card stream takes the page over: one question, at reading size.
    const cards = document.querySelectorAll('[data-slot="guide-run-question"]');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Q1");
    expect(document.querySelector('[data-slot="guide-run-progress"]')).toHaveTextContent("1 / 2");

    await userEvent.click(screen.getByRole("checkbox", { name: "Asked" }));

    expect(document.querySelectorAll('[data-slot="guide-run-question"]')).toHaveLength(1);
    expect(document.querySelector('[data-slot="guide-run-question"]')).toHaveTextContent("Q2");
    expect(document.querySelector('[data-slot="guide-run-progress"]')).toHaveTextContent("2 / 2");
  });
});

describe("HrGuidePage · write access", () => {
  it("offers no drafting or saving to a reader who cannot write", async () => {
    viewer.role = null;
    renderPage([guide({ items: [item("Q1")] })]);

    expect(screen.queryByRole("button", { name: "New guide" })).toBeNull();

    const sheet = await openEditor("Lin Wei");
    expect(within(sheet).queryByRole("button", { name: "Draft from JD and résumé" })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Save" })).toBeNull();
    // The outline is still readable: its questions are drawn.
    expect(within(sheet).getByText("Q1")).toBeInTheDocument();
  });
});

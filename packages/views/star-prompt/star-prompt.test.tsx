import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setApiInstance, type ApiClient } from "@morechat/core/api";
import { I18nProvider } from "@morechat/core/i18n/react";
import { useSessionPromptStore } from "@morechat/core/session-prompt";
import {
  claimStarPromptShowing,
  markStarPromptStarred,
  useStarPromptStore,
} from "@morechat/core/star-prompt";
import type { User } from "@morechat/core/types";
import enCommon from "../locales/en/common.json";
import enLayout from "../locales/en/layout.json";
import enOnboarding from "../locales/en/onboarding.json";
import { SourceBackfillModal } from "../onboarding/source-backfill-modal";
import { STAR_PROMPT_DELAY_MS, StarPrompt } from "./star-prompt";

const stores = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { create } = require("zustand") as typeof import("zustand");
  return {
    auth: create<{ user: Partial<User> | null }>(() => ({ user: null })),
    chat: create<{ isOpen: boolean; floatingChatEnabled: boolean }>(() => ({
      isOpen: false,
      floatingChatEnabled: true,
    })),
  };
});

vi.mock("@morechat/core/auth", () => ({ useAuthStore: stores.auth }));
vi.mock("@morechat/core/chat", () => ({ useChatStore: stores.chat }));
vi.mock("@morechat/core/paths", async () => {
  const actual = await vi.importActual<typeof import("@morechat/core/paths")>("@morechat/core/paths");
  return {
    ...actual,
    useWorkspacePaths: () => ({ chat: () => "/acme/chat" }),
    useCurrentWorkspace: () => workspace.current,
  };
});
vi.mock("@morechat/core/onboarding", async () => {
  const actual = await vi.importActual<typeof import("@morechat/core/onboarding")>("@morechat/core/onboarding");
  return {
    ...actual,
    // The real call refreshes /api/me; the answer landing on the user is what matters here.
    saveQuestionnaire: vi.fn(async (questionnaire: Record<string, unknown>) => {
      const user = stores.auth.getState().user;
      stores.auth.setState({ user: { ...user, onboarding_questionnaire: questionnaire } });
    }),
  };
});
vi.mock("../navigation", () => ({ useNavigation: () => ({ pathname: "/acme/issues" }) }));
vi.mock("@morechat/core/star-prompt", async () => {
  const actual = await vi.importActual<typeof import("@morechat/core/star-prompt")>(
    "@morechat/core/star-prompt",
  );
  return {
    ...actual,
    claimStarPromptShowing: vi.fn(),
    markStarPromptStarred: vi.fn(() => Promise.resolve()),
  };
});

const DAY_MS = 24 * 60 * 60 * 1000;
const workspace = vi.hoisted(() => ({
  current: { id: "ws-1", slug: "acme" } as { id: string; slug: string } | null,
}));
const listIssues = vi.fn();
let qc: QueryClient;

function eligibleUser(): Partial<User> {
  return {
    id: "u1",
    created_at: new Date(Date.now() - 10 * DAY_MS).toISOString(),
    // Already answered the source survey, so it does not claim the session.
    onboarded_at: "2026-01-01T00:00:00Z",
    onboarding_questionnaire: { source: ["friend"] },
    star_prompt_shown_count: 0,
    star_prompt_last_shown_at: null,
    star_prompt_starred_at: null,
  };
}

function renderPrompt(children: ReactNode = <StarPrompt />) {
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider
        locale="en"
        resources={{ en: { common: enCommon, layout: enLayout, onboarding: enOnboarding } }}
      >
        {children}
      </I18nProvider>
    </QueryClientProvider>,
  );
}

async function agentFinishesIssue() {
  act(() => {
    useStarPromptStore.getState().reportAgentIssueDone({ wsId: "ws-1", agentId: "agent-1", issueId: "i1" });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STAR_PROMPT_DELAY_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  listIssues.mockResolvedValue({ issues: [], total: 4 });
  setApiInstance({
    listIssues,
    listAgents: vi.fn().mockResolvedValue([{ id: "agent-1", name: "Lambda" }]),
  } as unknown as ApiClient);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  vi.mocked(claimStarPromptShowing).mockResolvedValue(true);
  stores.auth.setState({ user: eligibleUser() });
  stores.chat.setState({ isOpen: false });
  useStarPromptStore.setState({ moment: null });
  useSessionPromptStore.setState({ prompted: false });
  workspace.current = { id: "ws-1", slug: "acme" };
});

afterEach(() => {
  window.localStorage.removeItem("multica.source_backfill.dismiss.u1");
  qc.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("StarPrompt", () => {
  it("celebrates the agent a moment after it finishes enough issues", async () => {
    renderPrompt();
    await agentFinishesIssue();

    expect(await screen.findByText("Lambda has completed 4 issues")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Star morechat.co on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/jerry-halo2026/morchat.co",
    );
    expect(listIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        status_categories: ["done"],
        assignee_filters: [{ type: "agent", id: "agent-1" }],
      }),
    );
  });

  it("retires the prompt when the user clicks through to GitHub", async () => {
    renderPrompt();
    await agentFinishesIssue();
    fireEvent.click(await screen.findByRole("link", { name: "Star morechat.co on GitHub" }));

    expect(markStarPromptStarred).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Lambda has completed 4 issues")).not.toBeInTheDocument();
  });

  it("closes on Not now without retiring the prompt", async () => {
    renderPrompt();
    await agentFinishesIssue();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));

    expect(screen.queryByText("Lambda has completed 4 issues")).not.toBeInTheDocument();
    expect(markStarPromptStarred).not.toHaveBeenCalled();
  });

  it("stays hidden until the agent has finished three issues", async () => {
    listIssues.mockResolvedValue({ issues: [], total: 2 });
    renderPrompt();
    await agentFinishesIssue();

    expect(claimStarPromptShowing).not.toHaveBeenCalled();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("stays hidden when the server refuses the showing", async () => {
    vi.mocked(claimStarPromptShowing).mockResolvedValue(false);
    renderPrompt();
    await agentFinishesIssue();

    expect(claimStarPromptShowing).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Lambda has completed 4 issues")).not.toBeInTheDocument();
  });

  it("asks at most once per session", async () => {
    renderPrompt();
    await agentFinishesIssue();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await agentFinishesIssue();

    expect(claimStarPromptShowing).toHaveBeenCalledTimes(1);
  });

  it("yields to the source survey when it is still owed", async () => {
    stores.auth.setState({ user: { ...eligibleUser(), onboarding_questionnaire: {} } });
    renderPrompt();
    await agentFinishesIssue();

    expect(listIssues).not.toHaveBeenCalled();
  });

  it("skips the moment while the user is typing", async () => {
    renderPrompt();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    await agentFinishesIssue();
    input.remove();

    expect(listIssues).not.toHaveBeenCalled();
  });

  it("waits quietly while the workspace is still resolving", async () => {
    workspace.current = null;
    renderPrompt();
    await agentFinishesIssue();

    expect(listIssues).not.toHaveBeenCalled();
    expect(claimStarPromptShowing).not.toHaveBeenCalled();
  });
});

describe("StarPrompt after the source survey", () => {
  it.each([
    [
      "answering",
      async () => {
        fireEvent.click(await screen.findByText("Friends or colleagues"));
        fireEvent.click(screen.getByRole("button", { name: "Submit" }));
      },
    ],
    ["skipping", async () => fireEvent.click(await screen.findByRole("button", { name: "Skip" }))],
    ["closing", async () => fireEvent.click(await screen.findByRole("button", { name: "Close" }))],
  ])("does not ask again in the session after %s the survey", async (_name, finishSurvey) => {
    stores.auth.setState({ user: { ...eligibleUser(), onboarding_questionnaire: { source: [] } } });
    renderPrompt(
      <>
        <SourceBackfillModal />
        <StarPrompt />
      </>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("How did you hear about morechat.co?")).toBeInTheDocument();

    await finishSurvey();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await agentFinishesIssue();

    expect(claimStarPromptShowing).not.toHaveBeenCalled();
  });
});

describe("StarPrompt for a workspace that finishes work in custom done statuses", () => {
  // Mirrors the server: three issues sit in a custom done-category status, so
  // only a category query finds them and an exact `done` query finds none.
  function customDoneIssues() {
    listIssues.mockImplementation(async (params: { status_categories?: string[] }) => ({
      issues: [],
      total: params.status_categories?.includes("done") ? 3 : 0,
    }));
  }

  function renderSession() {
    return renderPrompt(
      <>
        <SourceBackfillModal />
        <StarPrompt />
      </>,
    );
  }

  it.each([
    ["answering", async () => {
      fireEvent.click(await screen.findByText("Friends or colleagues"));
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    }],
    ["skipping", async () => fireEvent.click(await screen.findByRole("button", { name: "Skip" }))],
  ])("asks for the survey first, then for a star only in a later session after %s it", async (_name, finishSurvey) => {
    customDoneIssues();
    stores.auth.setState({ user: { ...eligibleUser(), onboarding_questionnaire: { source: [] } } });

    const first = renderSession();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("How did you hear about morechat.co?")).toBeInTheDocument();
    await finishSurvey();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await agentFinishesIssue();
    expect(claimStarPromptShowing).not.toHaveBeenCalled();
    first.unmount();

    // A new app session: fresh module state and caches, same signed-in user.
    useSessionPromptStore.setState({ prompted: false });
    qc.clear();
    renderSession();
    await agentFinishesIssue();

    expect(await screen.findByText("Lambda has completed 3 issues")).toBeInTheDocument();
    expect(screen.queryByText("How did you hear about morechat.co?")).not.toBeInTheDocument();
  });
});

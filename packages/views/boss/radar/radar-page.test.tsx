import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import type { MarketSignal } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { BossRadarPage } from "../boss-radar-page";

/**
 * 市场雷达 (`/{slug}/boss/radar`).
 *
 * The row is where the contract lives: three status moves, one convert that is
 * offered exactly once, and a landing link once it has been taken. The suite drives
 * the row menu the way a reader does and asserts the requests, so "the button is
 * there" is never mistaken for "the write happens".
 */

const WS = "ws-1";

const api = vi.hoisted(() => ({
  listMarketSignals: vi.fn(),
  createMarketSignal: vi.fn(),
  updateMarketSignal: vi.fn(),
  deleteMarketSignal: vi.fn(),
  convertMarketSignal: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: "user-1",
    role: "admin",
    member: null,
    isLoading: false,
  }),
}));

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id: "s-1",
    workspace_id: WS,
    title: "Cross-border sellers need weekend support",
    category: "market",
    source: "manual",
    url: null,
    summary: null,
    cut: "hot",
    score: 88,
    urgency: "high",
    status: "new",
    converted_goal_id: null,
    converted_issue_id: null,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function adapter(): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/acme/boss/radar",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <NavigationProvider value={adapter()}>
        <WorkspaceSlugProvider slug="acme">
          <BossRadarPage />
        </WorkspaceSlugProvider>
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

async function openRowMenu(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Signal actions" }));
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.listMarketSignals.mockResolvedValue({ signals: [signal()], total: 1 });
});

afterEach(() => {
  cleanup();
});

describe("BossRadarPage", () => {
  it("draws the queue with its cut, category, urgency and source", async () => {
    renderPage();

    expect(
      await screen.findByText("Cross-border sellers need weekend support"),
    ).toBeInTheDocument();
    expect(screen.getByText("Hot")).toBeInTheDocument();
    expect(screen.getByText("Market")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
  });

  it("links a converted signal to where it landed", async () => {
    api.listMarketSignals.mockResolvedValue({
      signals: [signal({ status: "converted", converted_goal_id: "goal-9" })],
      total: 1,
    });
    renderPage();

    const link = await screen.findByRole("link", { name: "Converted" });
    expect(link).toHaveAttribute("href", "/acme/boss/goals?goal=goal-9");
  });

  it("converts to a goal once and then shows the objective it created", async () => {
    api.convertMarketSignal.mockResolvedValue({
      signal: signal({ status: "converted", converted_goal_id: "goal-9" }),
      goal: { id: "goal-9", title: "Weekend support desk" },
    });
    renderPage();

    await openRowMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "To a goal" }));

    await waitFor(() =>
      expect(api.convertMarketSignal).toHaveBeenCalledWith("s-1", { target: "goal" }),
    );
    const link = await screen.findByRole("link", { name: "Weekend support desk" });
    expect(link).toHaveAttribute("href", "/acme/boss/goals?goal=goal-9");

    // A second click cannot create a second objective: the action is gone.
    await openRowMenu();
    const again = await screen.findByRole("menuitem", { name: "To a goal" });
    fireEvent.click(again);
    expect(api.convertMarketSignal).toHaveBeenCalledTimes(1);
  });

  it("converts to a task and links to the issue", async () => {
    api.convertMarketSignal.mockResolvedValue({
      signal: signal({ status: "converted", converted_issue_id: "issue-9" }),
      issue: { id: "issue-9", number: 21, title: "Draft the weekend rota" },
    });
    renderPage();

    await openRowMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "To a task" }));

    await waitFor(() =>
      expect(api.convertMarketSignal).toHaveBeenCalledWith("s-1", { target: "issue" }),
    );
    const link = await screen.findByRole("link", { name: "Draft the weekend rota" });
    expect(link).toHaveAttribute("href", "/acme/issues/issue-9");
  });

  it("moves a signal through 观察 → 验证 with a PATCH of its status", async () => {
    api.updateMarketSignal.mockResolvedValue(signal({ status: "reviewing" }));
    renderPage();

    await openRowMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Start reviewing" }));

    await waitFor(() =>
      expect(api.updateMarketSignal).toHaveBeenCalledWith("s-1", { status: "reviewing" }),
    );
  });

  it("logs a signal with the four enums and no status field", async () => {
    api.listMarketSignals.mockResolvedValue({ signals: [], total: 0 });
    api.createMarketSignal.mockResolvedValue(signal());
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Log a signal" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Rival cut its slot fee" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.createMarketSignal).toHaveBeenCalledWith({
        title: "Rival cut its slot fee",
        category: "market",
        cut: "warm",
        urgency: "medium",
        source: "manual",
        score: undefined,
        url: undefined,
        summary: undefined,
        note: undefined,
      }),
    );
  });
});

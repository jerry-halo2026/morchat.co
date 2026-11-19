import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import type { Department, Goal, GoalDetail, MemberWithUser } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { BossGoalsPage } from "../boss-goals-page";

/**
 * 目标拆解 (`/{slug}/boss/goals`).
 *
 * The suite answers the API at `@morechat/core/api`, so every assertion is about
 * what the page sends as much as what it draws: the manual `current` write and the
 * create-goal payload are the two places this page can be wrong without looking
 * wrong.
 *
 * The list and the detail are separate blocks, which is what the last test pins:
 * a failing detail read leaves the list standing.
 */

const WS = "ws-1";

const api = vi.hoisted(() => ({
  listGoals: vi.fn(),
  getGoal: vi.fn(),
  listMembers: vi.fn(),
  listDepartments: vi.fn(),
  listIssues: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  createGoalKeyResult: vi.fn(),
  updateGoalKeyResult: vi.fn(),
  deleteGoalKeyResult: vi.fn(),
  createGoalPackage: vi.fn(),
  updateGoalPackage: vi.fn(),
  deleteGoalPackage: vi.fn(),
  attachGoalIssue: vi.fn(),
  detachGoalIssue: vi.fn(),
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

function member(id: string, name: string): MemberWithUser {
  return {
    id,
    workspace_id: WS,
    user_id: `user-${id}`,
    role: "member",
    created_at: "2026-01-01T00:00:00Z",
    name,
    email: `${id}@acme.test`,
    avatar_url: null,
    department_id: "dept-design",
  };
}

const departments: Department[] = [
  {
    id: "dept-design",
    workspace_id: WS,
    name: "Design",
    lead_user_id: null,
    system_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    workspace_id: WS,
    cycle: "2026Q4",
    title: "Grow the creator bench",
    description: null,
    owner_member_id: "member-1",
    department_id: null,
    status: "active",
    due_date: "2026-12-31",
    priority: "P1",
    created_by: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    archived_at: null,
    key_results: [
      {
        id: "kr-1",
        workspace_id: WS,
        goal_id: "goal-1",
        title: "Signed deals",
        target: 30,
        current: 12,
        unit: "deals",
        position: 0,
        status: "on_track",
        created_by: null,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
        archived_at: null,
      },
    ],
    packages: [
      {
        id: "pkg-1",
        workspace_id: WS,
        goal_id: "goal-1",
        department_id: "dept-design",
        title: "Signed deals — design",
        owner_member_id: "member-1",
        status: "active",
        position: 0,
        created_by: null,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
        archived_at: null,
      },
    ],
    ...overrides,
  };
}

function detail(base: Goal, overrides: Partial<GoalDetail> = {}): GoalDetail {
  return {
    ...base,
    issues: [
      {
        id: "issue-1",
        number: 12,
        title: "Draft the brief",
        status: "in_progress",
        goal_id: base.id,
      },
    ],
    ...overrides,
  };
}

function adapter(): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/acme/boss/goals",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderPage(search = "") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const navigation = adapter();
  navigation.searchParams = new URLSearchParams(search);
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <NavigationProvider value={navigation}>
        <WorkspaceSlugProvider slug="acme">
          <BossGoalsPage />
        </WorkspaceSlugProvider>
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.listMembers.mockResolvedValue([member("member-1", "Lin Wei")]);
  api.listDepartments.mockResolvedValue({ departments });
  api.listIssues.mockResolvedValue({ issues: [], total: 0 });
  api.createGoal.mockResolvedValue(goal());
  api.updateGoalKeyResult.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

describe("BossGoalsPage", () => {
  it("says what to do when there is no goal and no goal selected", async () => {
    api.listGoals.mockResolvedValue({ goals: [], total: 0 });
    renderPage();

    expect(await screen.findByText("No goal yet")).toBeInTheDocument();
    expect(screen.getByText("Pick a goal to see its key results.")).toBeInTheDocument();
  });

  it("lists a cycle's goals and opens the one that was clicked", async () => {
    const low = goal({ id: "goal-2", title: "Open the second studio", priority: "P2" });
    const high = goal({ id: "goal-1", title: "Grow the creator bench", priority: "P0" });
    api.listGoals.mockResolvedValue({ goals: [low, high], total: 2 });
    api.getGoal.mockImplementation(async (id: string) => detail(id === "goal-1" ? high : low));

    const { container } = renderPage();

    // P0 first: the list is read top-down, so the priority decides the order.
    const row = await screen.findByText("Grow the creator bench");
    const listText = container.textContent ?? "";
    expect(listText.indexOf("Grow the creator bench")).toBeLessThan(
      listText.indexOf("Open the second studio"),
    );

    fireEvent.click(row);

    expect(await screen.findByText("Signed deals")).toBeInTheDocument();
    expect(screen.getByText("12 / 30 deals")).toBeInTheDocument();
    // The product ruling is on the page, next to the numbers it applies to.
    expect(
      screen.getByText(/Progress is recorded by hand: finishing a task does not write it back/),
    ).toBeInTheDocument();
    // Packages resolve their department, attached tasks keep their identity.
    expect(screen.getByText("Design")).toBeInTheDocument();
    expect(screen.getByText("Draft the brief")).toBeInTheDocument();
    expect(container.textContent).toContain("40%");
  });

  it("records a key result's current figure as a PATCH of that figure", async () => {
    const base = goal();
    api.listGoals.mockResolvedValue({ goals: [base], total: 1 });
    api.getGoal.mockResolvedValue(detail(base));

    renderPage("?goal=goal-1");

    const input = await screen.findByLabelText("Record current");
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Record current" }));

    await waitFor(() =>
      expect(api.updateGoalKeyResult).toHaveBeenCalledWith("goal-1", "kr-1", { current: 20 }),
    );
  });

  it("creates a goal with only the fields that were filled in", async () => {
    api.listGoals.mockResolvedValue({ goals: [], total: 0 });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "New goal" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Sign ten new creators" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.createGoal).toHaveBeenCalledWith({
        title: "Sign ten new creators",
        cycle: undefined,
        owner_member_id: undefined,
        priority: "P1",
        status: "draft",
        due_date: undefined,
      }),
    );
  });

  it("keeps the list when the detail read fails", async () => {
    const base = goal();
    api.listGoals.mockResolvedValue({ goals: [base], total: 1 });
    api.getGoal.mockRejectedValue(new Error("detail endpoint is down"));

    renderPage("?goal=goal-1");

    expect(await screen.findByText("This block didn’t load.")).toBeInTheDocument();
    // The list is a different block and keeps its row.
    expect(screen.getByText("Grow the creator bench")).toBeInTheDocument();
  });
});

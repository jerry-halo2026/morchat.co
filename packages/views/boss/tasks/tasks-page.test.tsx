import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import type { Goal, GoalDetail, Issue, MemberWithUser } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { BossTasksPage } from "../boss-tasks-page";

/**
 * 任务派发 (`/{slug}/boss/tasks`).
 *
 * The page is one goal block per objective, plus one page of the issue list for
 * the two columns the goal detail does not carry. The suite pins three things a
 * reader can get wrong: which goal a task is filed under, that a goal with no task
 * says so instead of disappearing, and that a row opens the task's own page.
 */

const WS = "ws-1";

const api = vi.hoisted(() => ({
  listGoals: vi.fn(),
  getGoal: vi.fn(),
  listIssues: vi.fn(),
  listMembers: vi.fn(),
}));

const openCreateIssue = vi.hoisted(() => vi.fn());

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/issues/stores", () => ({
  openCreateIssueWithPreference: openCreateIssue,
}));
// The status catalog is a query of its own; the label helper only needs `entryOf`,
// and the built-in keys resolve through the `issues` bundle without it.
vi.mock("@morechat/core/issue-statuses/hooks", () => ({
  useIssueStatuses: () => ({ entryOf: () => undefined }),
}));
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
    department_id: null,
  };
}

function goal(id: string, title: string, overrides: Partial<Goal> = {}): Goal {
  return {
    id,
    workspace_id: WS,
    cycle: "2026Q4",
    title,
    description: null,
    owner_member_id: "member-1",
    department_id: null,
    status: "active",
    due_date: null,
    priority: "P1",
    created_by: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    archived_at: null,
    key_results: [],
    packages: [],
    ...overrides,
  };
}

function detail(base: Goal, issues: GoalDetail["issues"]): GoalDetail {
  return { ...base, issues };
}

function issue(id: string, identifier: string, title: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    workspace_id: WS,
    number: 12,
    identifier,
    title,
    description: null,
    status: "in_progress",
    priority: "medium",
    assignee_type: "member",
    assignee_id: "member-2",
    creator_type: "member",
    creator_id: "member-1",
    parent_issue_id: null,
    project_id: null,
    position: 0,
    stage: null,
    start_date: null,
    due_date: null,
    metadata: {},
    properties: {},
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    ...overrides,
  };
}

function adapter(): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/acme/boss/tasks",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const navigation = adapter();
  const result = renderWithI18n(
    <QueryClientProvider client={client}>
      <NavigationProvider value={navigation}>
        <WorkspaceSlugProvider slug="acme">
          <BossTasksPage />
        </WorkspaceSlugProvider>
      </NavigationProvider>
    </QueryClientProvider>,
  );
  return { ...result, navigation };
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  openCreateIssue.mockReset();
  api.listMembers.mockResolvedValue([member("member-1", "Lin Wei"), member("member-2", "Zhou Min")]);
  api.listIssues.mockResolvedValue({ issues: [], total: 0 });
  api.getGoal.mockResolvedValue(detail(goal("goal-1", "Grow the creator bench"), []));
});

afterEach(() => {
  cleanup();
});

describe("BossTasksPage", () => {
  it("files each task under its goal and says which goal has none", async () => {
    const first = goal("goal-1", "Grow the creator bench");
    const second = goal("goal-2", "Open the second studio");
    api.listGoals.mockResolvedValue({ goals: [first, second], total: 2 });
    api.getGoal.mockImplementation(async (id: string) =>
      id === "goal-1"
        ? detail(first, [
            { id: "issue-1", number: 11, title: "Draft the brief", status: "in_progress", goal_id: "goal-1" },
            { id: "issue-2", number: 12, title: "Call the studio", status: "todo", goal_id: "goal-1" },
          ])
        : detail(second, []),
    );
    api.listIssues.mockResolvedValue({
      issues: [issue("issue-1", "MUL-11", "Draft the brief")],
      total: 1,
    });

    renderPage();

    expect(await screen.findByText("Draft the brief")).toBeInTheDocument();
    expect(screen.getByText("Call the studio")).toBeInTheDocument();
    // The join resolved the owner; the task it could not see keeps only its title.
    expect(screen.getByText("Zhou Min")).toBeInTheDocument();
    // A goal with nothing moving it stays on the page, with a sentence.
    expect(screen.getByText("No task under this goal yet.")).toBeInTheDocument();
    // Both goals' headings are drawn, in the goal board's order.
    expect(screen.getByText("Grow the creator bench")).toBeInTheDocument();
    expect(screen.getByText("Open the second studio")).toBeInTheDocument();
  });

  it("opens the task's own page when a row is clicked", async () => {
    const only = goal("goal-1", "Grow the creator bench");
    api.listGoals.mockResolvedValue({ goals: [only], total: 1 });
    api.getGoal.mockResolvedValue(
      detail(only, [
        { id: "issue-1", number: 11, title: "Draft the brief", status: "todo", goal_id: "goal-1" },
      ]),
    );

    const { navigation } = renderPage();

    fireEvent.click(await screen.findByText("Draft the brief"));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/acme/issues/issue-1"));
  });

  it("opens the workspace's own issue creation flow for 派发任务", async () => {
    api.listGoals.mockResolvedValue({ goals: [goal("goal-1", "Grow the creator bench")], total: 1 });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Dispatch a task" }));

    expect(openCreateIssue).toHaveBeenCalledTimes(1);
  });

  it("points at the goal page when there is no goal to group by", async () => {
    api.listGoals.mockResolvedValue({ goals: [], total: 0 });

    renderPage();

    expect(await screen.findByText("No goal yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New goal" })).toHaveAttribute(
      "href",
      "/acme/boss/goals",
    );
  });
});

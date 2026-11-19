import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import type {
  BdPipeline,
  BdPipelineMoney,
  BdPipelineNumber,
  Department,
  HrEmployeeProfile,
  MarketSignal,
  MemberWithUser,
  WorkbenchFinanceMonth,
} from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { BossHomePage } from "../boss-home-page";
import { keyResultProgress, openSignals, moneySummary, teamSummary } from "./model";

// Every block reads its own query, so this suite answers `useQuery` per key
// instead of faking the API: it can then make one block fail while the other
// three keep their data, which is the isolation this page is built on.
type QueryState = { data: unknown; isPending?: boolean; isError?: boolean };

const fixtures = vi.hoisted(() => {
  const state: Record<string, QueryState> = {};
  return { state };
});

const refetch = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (options: { queryKey: unknown[]; enabled?: boolean }) => {
      const key = options.queryKey;
      const id = idFor(key);
      const entry = fixtures.state[id] ?? { data: undefined };
      return {
        data: entry.data,
        isPending: entry.isPending ?? false,
        isError: entry.isError ?? false,
        refetch,
      };
    },
  };
});

function idFor(key: unknown[]): string {
  if (key[0] === "goal" && key[2] === "goals") return "goals";
  if (key[0] === "goal" && key[2] === "signals") return "signals";
  if (key[0] === "workspaces" && key[2] === "members") return "members";
  if (key[0] === "workspaces" && key[2] === "departments") return "departments";
  if (key[0] === "hr" && key[2] === "employees") return "employees";
  if (key[0] === "bd" && key[2] === "pipeline") return "pipeline";
  if (key[0] === "workbench" && key[2] === "finance") return "finance";
  if (key[0] === "workbench" && key[2] === "finance_months") return "financeMonths";
  return "unknown";
}

vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

function adapter(): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/acme/boss",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderPage() {
  return renderWithI18n(
    <NavigationProvider value={adapter()}>
      <WorkspaceSlugProvider slug="acme">
        <BossHomePage />
      </WorkspaceSlugProvider>
    </NavigationProvider>,
  );
}

// --- fixtures -------------------------------------------------------------

function member(id: string, name: string, departmentId: string | null): MemberWithUser {
  return {
    id,
    workspace_id: "ws-1",
    user_id: `user-${id}`,
    role: "member",
    created_at: "2026-01-01T00:00:00Z",
    name,
    email: `${id}@acme.test`,
    avatar_url: null,
    department_id: departmentId,
  };
}

function employee(
  id: string,
  hire: string | null,
  leave: string | null,
): HrEmployeeProfile {
  return {
    id,
    workspace_id: "ws-1",
    member_id: `member-${id}`,
    department_id: null,
    job_title: null,
    grade: null,
    hire_date: hire,
    regular_date: null,
    contract_end: null,
    leave_date: leave,
    ability: {},
    disc: {},
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
  };
}

function signal(
  id: string,
  title: string,
  cut: MarketSignal["cut"],
  score: number | null,
  status: MarketSignal["status"],
  createdAt: string,
): MarketSignal {
  return {
    id,
    workspace_id: "ws-1",
    title,
    category: "market",
    source: "manual",
    url: null,
    summary: null,
    cut,
    score,
    urgency: "high",
    status,
    converted_goal_id: null,
    converted_issue_id: null,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: createdAt,
    updated_at: createdAt,
    archived_at: null,
  };
}

const departments: Department[] = [
  {
    id: "dept-design",
    workspace_id: "ws-1",
    name: "Design",
    lead_user_id: null,
    system_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "dept-ops",
    workspace_id: "ws-1",
    name: "Ops",
    lead_user_id: null,
    system_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

// The money block reads the month-window figures, not the cumulative pipeline
// totals; the helper keeps the shape `moneySummary` consumes.
function moneyFigures(signed: number | null, collected: number | null) {
  return { signed, collected };
}

function pipeline(signed: number | null, paid: number | null): BdPipeline {
  const money = (amount: number | null): BdPipelineMoney => ({
    amount,
    currency: "CNY",
    sample_count: amount === null ? 0 : 3,
    empty: amount === null ? "insufficient_data" : "zero",
  });
  const number = (value: number | null): BdPipelineNumber => ({
    value,
    sample_count: value === null ? 0 : 3,
    empty: value === null ? "insufficient_data" : "zero",
  });
  return {
    creators: {
      total: number(5),
      contacted: number(4),
      replied: number(2),
      quoted: number(1),
      signed: number(1),
      deal: number(1),
    },
    quotes: { open: number(1), accepted: number(1), rejected: number(0), total_fee: money(0) },
    orders: {
      open: number(1),
      delivered: number(1),
      settled: number(1),
      total_amount: money(signed),
      paid_amount: money(paid),
    },
    followups: { due_today: number(0), overdue: number(1) },
  };
}

/** A money figure in the shape `/workbench/finance` returns. */
function block(amount: number | null) {
  return {
    value: amount,
    sample_count: amount === null ? 0 : 2,
    empty: amount === null ? "insufficient_data" : "zero",
  };
}

/**
 * The money block reads four things from here: the month its cost entry is keyed
 * by, and the two month-window figures the margin subtracts from.
 */
const finance = {
  window: { month: "2026-11" },
  signed: block(9000),
  collected: block(5000),
};

/**
 * Baseline: every block has data. Tests replace the entry they are about, so a
 * change in one block is never read as a change in another.
 */
function seed(overrides: Record<string, QueryState> = {}) {
  for (const key of Object.keys(fixtures.state)) delete fixtures.state[key];
  fixtures.state.goals = { data: { goals: [], total: 0 } };
  fixtures.state.signals = { data: { signals: [], total: 0 } };
  fixtures.state.members = { data: [] };
  fixtures.state.departments = { data: departments };
  fixtures.state.employees = { data: { employees: [], total: 0 } };
  fixtures.state.pipeline = { data: pipeline(null, null) };
  fixtures.state.finance = { data: finance };
  fixtures.state.financeMonths = { data: { months: [], total: 0 } };
  Object.assign(fixtures.state, overrides);
}

beforeEach(() => {
  // The team block compares HR dates against the local calendar month, so the
  // clock is pinned to a month the fixtures name. Only `Date` is faked: real
  // timers keep Testing Library and React flushing normally.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 15, 10, 0, 0) });
  seed();
});

afterEach(() => {
  cleanup();
  refetch.mockClear();
  vi.useRealTimers();
});

describe("BossHomePage", () => {
  it("offers the goal page when the cycle has no active goal", () => {
    renderPage();

    expect(screen.getByText("No active goal yet")).toBeInTheDocument();
    // Both empty blocks link out to the page that fills them.
    expect(screen.getByRole("link", { name: "Create a goal" })).toHaveAttribute(
      "href",
      "/acme/boss/goals",
    );
    expect(screen.getByRole("link", { name: "Open the radar" })).toHaveAttribute(
      "href",
      "/acme/boss/radar",
    );
  });

  it("draws one progress bar per key result with its own achievement colour", () => {
    fixtures.state.goals = {
      data: {
        total: 1,
        goals: [
          {
            id: "goal-1",
            workspace_id: "ws-1",
            cycle: "2026Q4",
            title: "Grow the creator bench",
            description: null,
            owner_member_id: "member-1",
            department_id: null,
            status: "active",
            due_date: null,
            priority: "P0",
            created_by: null,
            created_at: "2026-10-01T00:00:00Z",
            updated_at: "2026-10-01T00:00:00Z",
            archived_at: null,
            packages: [],
            key_results: [
              {
                id: "kr-1",
                workspace_id: "ws-1",
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
              {
                id: "kr-2",
                workspace_id: "ws-1",
                goal_id: "goal-1",
                title: "Launches",
                target: 5,
                current: 5,
                unit: null,
                position: 1,
                status: "done",
                created_by: null,
                created_at: "2026-10-01T00:00:00Z",
                updated_at: "2026-10-01T00:00:00Z",
                archived_at: null,
              },
            ],
          },
        ],
      },
    };
    fixtures.state.members = { data: [member("member-1", "Lin Wei", "dept-design")] };
    const { container } = renderPage();

    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    // 12/30 is under half → warning; 5/5 is met → success.
    expect(bars[0]!).toHaveAttribute("aria-valuenow", "40");
    expect(bars[0]!.querySelector("[data-tone]")).toHaveAttribute("data-tone", "warning");
    expect(screen.getByText("12 / 30 deals")).toBeInTheDocument();
    expect(bars[1]!).toHaveAttribute("aria-valuenow", "100");
    expect(bars[1]!.querySelector("[data-tone]")).toHaveAttribute("data-tone", "success");
    expect(screen.getByText("5 / 5")).toBeInTheDocument();
    // The owner resolves through the member list; the cycle is the goal's own.
    expect(screen.getByText("Lin Wei")).toBeInTheDocument();
    expect(screen.getByText("2026Q4")).toBeInTheDocument();
    expect(container).toHaveTextContent("Grow the creator bench");
  });

  it("orders open signals by cut and badges each one with its tone", () => {
    fixtures.state.signals = {
      data: {
        total: 5,
        signals: [
          signal("s-cold", "Cold signal", "cold", 90, "new", "2026-11-14T00:00:00Z"),
          signal("s-hot", "Hot signal", "hot", 40, "reviewing", "2026-11-10T00:00:00Z"),
          signal("s-warm", "Warm signal", "warm", 70, "new", "2026-11-12T00:00:00Z"),
          // Closed and converted signals are not the radar's open queue.
          signal("s-done", "Dismissed signal", "hot", 99, "dismissed", "2026-11-15T00:00:00Z"),
          signal("s-conv", "Converted signal", "hot", 99, "converted", "2026-11-15T00:00:00Z"),
        ],
      },
    };
    const { container } = renderPage();

    // A cold signal with the best score still sorts behind a hot one: cut is the
    // order the radar is read in, score only breaks ties.
    const text = container.textContent ?? "";
    expect(text.indexOf("Hot signal")).toBeLessThan(text.indexOf("Warm signal"));
    expect(text.indexOf("Warm signal")).toBeLessThan(text.indexOf("Cold signal"));
    expect(screen.queryByText("Dismissed signal")).toBeNull();
    expect(screen.queryByText("Converted signal")).toBeNull();

    // No goals in this fixture, so the only tone-bearing elements are badges.
    const tones = [...container.querySelectorAll("[data-tone]")].map((node) =>
      node.getAttribute("data-tone"),
    );
    expect(tones).toEqual(["hot", "warm", "cold"]);
  });

  it("states the four team numbers and the largest departments", () => {
    fixtures.state.members = {
      data: [
        member("m-1", "Lin Wei", "dept-design"),
        member("m-2", "Zhou Min", "dept-design"),
        member("m-3", "Qiao", "dept-ops"),
        member("m-4", "He Yuan", null),
      ],
    };
    fixtures.state.employees = {
      data: {
        total: 3,
        employees: [
          employee("e-1", "2026-11-03", null),
          employee("e-2", "2026-11-09", null),
          employee("e-3", "2025-04-01", "2026-11-07"),
        ],
      },
    };
    renderPage();

    expect(statValue("Members")).toBe("4");
    expect(statValue("With HR file")).toBe("3");
    expect(statValue("Joined this month")).toBe("2");
    expect(statValue("Left this month")).toBe("1");
    // Largest first, and the unassigned member is counted rather than dropped.
    expect(screen.getByText("Design")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("Ops")).toBeInTheDocument();
  });

  it("prints the dash for a margin whose cost side is missing", () => {
    // Month-window figures (the money block), not the cumulative pipeline: both
    // sides of the margin must describe November.
    fixtures.state.finance = {
      data: { ...finance, signed: block(9000), collected: block(5000) },
    };
    // The month entry exists nowhere: no cost was entered for November.
    fixtures.state.financeMonths = { data: { months: [], total: 0 } };
    renderPage();

    expect(statValue("Signed")).toBe("¥9,000");
    expect(statValue("Collected")).toBe("¥5,000");
    expect(statValue("Cost this month")).toBe("—");
    expect(statValue("Gross margin")).toBe("—");
    // The reason, not a number: a margin over one known figure is not a margin.
    // Both the cost cell and the margin cell name the one missing input, rather
    // than the margin claiming it needs something else.
    expect(screen.getAllByText("This month’s cost is not entered.")).toHaveLength(2);
  });

  it("keeps the other blocks when one block fails", () => {
    fixtures.state.goals = { data: undefined, isError: true };
    fixtures.state.members = { data: [member("m-1", "Lin Wei", "dept-design")] };
    fixtures.state.employees = {
      data: { total: 1, employees: [employee("e-1", "2026-11-03", null)] },
    };
    renderPage();

    // One bar, inside the block that failed.
    expect(screen.getAllByText("This block didn’t load.")).toHaveLength(1);
    // Every block keeps its heading, and the healthy ones keep their numbers.
    expect(screen.getByText("This cycle’s goals")).toBeInTheDocument();
    expect(screen.getByText("Radar signals")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Money")).toBeInTheDocument();
    expect(statValue("Members")).toBe("1");
    expect(statValue("Joined this month")).toBe("1");
  });
});

/**
 * A figure's value, found through its own label rather than by bare digits:
 * the money cells put the reason for a dash under it, in the same `<dd>`.
 */
function statValue(label: string): string | null {
  const term = screen.getByText(label);
  const definition = term.parentElement?.querySelector("dd");
  const value = definition?.querySelector("span");
  return (value?.textContent ?? definition?.textContent) ?? null;
}

// --- the thresholds, pinned without a DOM --------------------------------

describe("overview model", () => {
  it("switches the achievement colour at the target and at half of it", () => {
    expect(keyResultProgress({ current: 30, target: 30 }).tone).toBe("success");
    expect(keyResultProgress({ current: 31, target: 30 }).percent).toBe(100);
    expect(keyResultProgress({ current: 14, target: 30 })).toMatchObject({
      percent: 47,
      tone: "warning",
    });
    expect(keyResultProgress({ current: 15, target: 30 })).toMatchObject({
      percent: 50,
      tone: "neutral",
    });
    // 0 of 0 is met, and it must not divide by zero to get there.
    expect(keyResultProgress({ current: 0, target: 0 })).toMatchObject({
      percent: 100,
      tone: "success",
    });
    expect(keyResultProgress({ current: 7, target: null })).toMatchObject({
      percent: 0,
      tone: "neutral",
      measured: false,
    });
  });

  it("keeps only the open signals, hot first", () => {
    const rows = openSignals(
      [
        signal("a", "cold", "cold", null, "new", "2026-11-14T00:00:00Z"),
        signal("b", "hot-unscored", "hot", null, "new", "2026-11-13T00:00:00Z"),
        signal("c", "hot-scored", "hot", 88, "reviewing", "2026-11-01T00:00:00Z"),
        signal("d", "closed", "hot", 100, "dismissed", "2026-11-15T00:00:00Z"),
      ],
      5,
    );
    expect(rows.map((row) => row.title)).toEqual(["hot-scored", "hot-unscored", "cold"]);
  });

  it("counts a month from HR dates and leaves the margin null without a cost", () => {
    const summary = teamSummary(
      [member("m-1", "A", null), member("m-2", "B", null)],
      [employee("e-1", "2026-11-03", "2026-11-30"), employee("e-2", "2026-10-01", "2026-10-30")],
      "2026-11",
    );
    expect(summary).toEqual({
      members: 2,
      withProfile: 2,
      joinedThisMonth: 1,
      leftThisMonth: 1,
    });
    // A failed HR read is not an empty one.
    expect(teamSummary([], null, "2026-11").withProfile).toBeNull();

    expect(moneySummary(moneyFigures(9000, 5000), null, "2026-11").margin).toBeNull();
    const entry: WorkbenchFinanceMonth = {
      id: "month-1",
      workspace_id: "ws-1",
      month: "2026-11-01",
      cash_open: null,
      fixed_cost: 1000,
      variable_cost: 500,
      note: null,
      created_by: null,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    };
    expect(moneySummary(moneyFigures(9000, 5000), entry, "2026-11").margin).toBe(3500);
  });
});

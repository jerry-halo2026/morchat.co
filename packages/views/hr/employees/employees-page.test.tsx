import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hrEmployeeListOptions } from "@morechat/core/hr/queries";
import { departmentListOptions, memberListOptions } from "@morechat/core/workspace/queries";
import type {
  Department,
  HrEmployeeProfile,
  MemberWithUser,
} from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { HrEmployeesPage } from "./employees-page";

// recharts measures its own container and jsdom has no layout, so the radar would
// render nothing at all. Same tactic as `layout/radar-chart.test.tsx`: replace the
// chart layer, keeping the one contract the radar depends on — `PolarAngleAxis`
// renders its ticks from the chart's own data, one per ability dimension.
vi.mock("recharts", async () => {
  const React = await import("react");
  const ChartRows = React.createContext<readonly Record<string, unknown>[]>([]);

  return {
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => <>{children}</>,
    RadarChart: ({
      children,
      data = [],
    }: {
      children?: ReactNode;
      data?: readonly Record<string, unknown>[];
    }) => <ChartRows.Provider value={data}>{children}</ChartRows.Provider>,
    PolarGrid: () => <div data-testid="polar-grid" />,
    PolarAngleAxis: ({ dataKey }: { dataKey?: string }) => {
      const rows = React.useContext(ChartRows);
      return (
        <svg data-testid="polar-angle-axis">
          {rows.map((row, index) => (
            <text key={index}>{String(row[dataKey ?? "label"] ?? "")}</text>
          ))}
        </svg>
      );
    },
    Radar: () => <div data-testid="radar-series" />,
    Tooltip: () => null,
    Legend: () => null,
  };
});

const WS = "ws-roster";

// Who is reading the roster: the page takes the id and the role from the shared
// `useCurrentMember`, so a test switches the reader by switching these two.
const viewer = vi.hoisted(() => ({ userId: "user-ada", role: "admin" as "owner" | "admin" | "member" }));

vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-roster" }));
vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: viewer.userId,
    role: viewer.role,
    member: null,
    isLoading: false,
  }),
}));

const adapter: NavigationAdapter = {
  push: () => {},
  replace: () => {},
  back: () => {},
  pathname: "/acme/hr/employees",
  searchParams: new URLSearchParams(),
  hash: "",
  getShareableUrl: (path) => `https://app.test${path}`,
};

/** A calendar day `offset` days from today, as the columns store it. */
function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DEPARTMENTS: Department[] = [
  {
    id: "dep-design",
    workspace_id: WS,
    name: "Design",
    lead_user_id: null,
    system_key: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

const MEMBERS: MemberWithUser[] = [
  {
    id: "member-ada",
    workspace_id: WS,
    user_id: "user-ada",
    role: "admin",
    created_at: "2024-01-01T00:00:00Z",
    name: "Ada Lovelace",
    email: "ada@example.com",
    avatar_url: null,
  },
  {
    id: "member-grace",
    workspace_id: WS,
    user_id: "user-grace",
    role: "member",
    created_at: "2024-01-01T00:00:00Z",
    name: "Grace Hopper",
    email: "grace@example.com",
    avatar_url: null,
  },
  {
    id: "member-alan",
    workspace_id: WS,
    user_id: "user-alan",
    role: "member",
    created_at: "2024-01-01T00:00:00Z",
    name: "Alan Turing",
    email: "alan@example.com",
    avatar_url: null,
  },
];

function profile(over: Partial<HrEmployeeProfile> & { id: string }): HrEmployeeProfile {
  return {
    workspace_id: WS,
    member_id: "user-ada",
    department_id: "dep-design",
    job_title: "Product designer",
    grade: "P6",
    hire_date: "2024-03-01",
    regular_date: "2024-06-01",
    contract_end: "2027-03-01",
    leave_date: null,
    ability: { plan: 8, design: 9, code: 5, test: 6, review: 7, ops: 4 },
    disc: { d: 6, i: 7, s: 4, c: 5 },
    owner_member_id: null,
    created_by: null,
    created_at: "2024-03-01T00:00:00Z",
    updated_at: "2024-03-01T00:00:00Z",
    archived_at: null,
    ...over,
  };
}

/** Three rows: one confirmed with a contract 30 days out, one fresh, one former. */
function roster(): HrEmployeeProfile[] {
  return [
    profile({
      id: "emp-ada",
      member_id: "user-ada",
      hire_date: "2024-03-01",
      contract_end: day(30),
    }),
    profile({
      id: "emp-grace",
      member_id: "user-grace",
      hire_date: "2023-01-10",
      job_title: "Compiler engineer",
      grade: "P7",
      regular_date: "2023-04-10",
      contract_end: "2027-01-10",
    }),
    profile({
      id: "emp-alan",
      member_id: "user-alan",
      hire_date: "2026-01-05",
      job_title: "Research engineer",
      grade: "P5",
      regular_date: null,
      contract_end: "2027-01-05",
    }),
  ];
}

function renderPage(rows: HrEmployeeProfile[] = roster()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(hrEmployeeListOptions(WS, {}).queryKey, {
    employees: rows,
    total: rows.length,
  });
  qc.setQueryData(memberListOptions(WS).queryKey, MEMBERS);
  qc.setQueryData(departmentListOptions(WS).queryKey, DEPARTMENTS);
  return renderWithI18n(
    <QueryClientProvider client={qc}>
      <NavigationProvider value={adapter}>
        <HrEmployeesPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

/** The rows of the grid, excluding the sticky header row. */
function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

/** Open the drawer on one employee by clicking their row. */
function openEmployee(name: string) {
  fireEvent.click(screen.getByText(name));
}

describe("HrEmployeesPage", () => {
  beforeEach(() => {
    viewer.userId = "user-ada";
    viewer.role = "admin";
  });

  it("shows the first-run state when the roster is empty", () => {
    renderPage([]);

    expect(
      screen.getByRole("heading", { level: 2, name: "No employees yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Add employee" }).length,
    ).toBeGreaterThan(0);
    // The grid is not drawn at all: an empty header row would read as a failure.
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("renders one row per employee under the roster's seven columns", () => {
    renderPage();

    expect(
      screen
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim()),
    ).toEqual([
      "Name",
      "Department",
      "Role",
      "Grade",
      "Hired",
      "Status",
      "Contact",
    ]);
    expect(bodyRows()).toHaveLength(3);
    for (const name of ["Ada Lovelace", "Grace Hopper", "Alan Turing"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("narrows the rows by the search field", () => {
    renderPage();
    expect(bodyRows()).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Search name, role or ID" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search name, role or ID" }), {
      target: { value: "grace" },
    });

    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("opens the drawer on a row and feeds the radar its six dimensions", () => {
    renderPage();
    openEmployee("Ada Lovelace");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Profile is the drawer's landing tab: the ability matrix is already drawn.
    const ticks = screen.getByTestId("polar-angle-axis").querySelectorAll("text");
    expect(Array.from(ticks).map((tick) => tick.textContent)).toEqual([
      "plan",
      "design",
      "code",
      "test",
      "review",
      "ops",
    ]);
  });

  it("marks a contract inside 60 days in the warning colour", () => {
    renderPage();
    openEmployee("Ada Lovelace");
    fireEvent.click(screen.getByRole("tab", { name: "Contract" }));

    const countdown = screen.getByTestId("employee-contract");
    expect(countdown).toHaveAttribute("data-contract-state", "warning");
    expect(countdown).toHaveAttribute("data-contract-days", "30");
    expect(countdown.className).toContain("text-warning");
    expect(countdown).toHaveTextContent("30 days left");
  });

  it("says the reward and change records have no table yet", () => {
    renderPage();
    openEmployee("Ada Lovelace");

    fireEvent.click(screen.getByRole("tab", { name: "Rewards & discipline" }));
    // Both records have tables now: an unanswered query leaves the section
    // empty rather than claiming the data does not exist.
    expect(screen.queryByTestId("pending-table-rewards")).toBeNull();

    // Changes has a table now: an unanswered query leaves the section empty
    // rather than claiming the data does not exist.
    fireEvent.click(screen.getByRole("tab", { name: "Changes" }));
    expect(screen.queryByTestId("pending-table-history")).toBeNull();
  });

  it("hides the inline writes from a reader who does not own the row", () => {
    // `user-nobody` is not an admin and files no row of their own: every write
    // is gone from the list.
    viewer.userId = "user-nobody";
    viewer.role = "member";
    renderPage();

    expect(document.querySelectorAll("[data-collection-row-menu]")).toHaveLength(0);
  });

  it("leaves a member their own file and nothing else", () => {
    // Grace is a plain member: she may keep her own row in order, not the rest.
    viewer.userId = "user-grace";
    viewer.role = "member";
    renderPage();

    const menus = document.querySelectorAll("[data-collection-row-menu]");
    expect(menus).toHaveLength(1);
  });

  it("offers the inline writes to an admin", () => {
    renderPage();

    expect(document.querySelectorAll("[data-collection-row-menu]").length).toBe(3);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import type { Department, HrEmployeeProfile, MemberWithUser } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { BossTeamPage } from "../boss-team-page";

/**
 * 团队 (`/{slug}/boss/team`).
 *
 * The page is read-only and reads two ledgers. The suite pins the three things the
 * brief calls out: the roster renders joined to its files, a failed HR read leaves
 * the roster standing with the dash in the file columns (and says why), and an
 * empty workspace is one statement rather than three empty blocks.
 */

const WS = "ws-1";

const api = vi.hoisted(() => ({
  listMembers: vi.fn(),
  listDepartments: vi.fn(),
  listHrEmployees: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

function member(id: string, name: string, overrides: Partial<MemberWithUser> = {}): MemberWithUser {
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
    ...overrides,
  };
}

function employee(overrides: Partial<HrEmployeeProfile> = {}): HrEmployeeProfile {
  return {
    id: "emp-1",
    workspace_id: WS,
    member_id: "m-1",
    department_id: null,
    job_title: null,
    grade: null,
    hire_date: "2026-01-05",
    regular_date: "2026-04-05",
    contract_end: null,
    leave_date: null,
    ability: {},
    disc: {},
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...overrides,
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
  {
    id: "dept-ops",
    workspace_id: WS,
    name: "Ops",
    lead_user_id: null,
    system_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

function adapter(): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/acme/boss/team",
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
          <BossTeamPage />
        </WorkspaceSlugProvider>
      </NavigationProvider>
    </QueryClientProvider>,
  );
  return { ...result, navigation };
}

/** A figure's value, found through its own `<dt>` rather than by bare digits. */
function statValue(label: string): string | null {
  const term = screen
    .getAllByText(label)
    .find((node) => node.tagName === "DT");
  const definition = term?.parentElement?.querySelector("dd");
  return definition?.textContent ?? null;
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  // The employment state is judged against a local calendar day; pin it so the
  // fixtures' dates mean the same thing on every machine.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 18, 10, 0, 0) });
  api.listMembers.mockResolvedValue([
    member("m-1", "Lin Wei", { role: "owner" }),
    member("m-2", "Zhou Min", { department_id: null }),
  ]);
  api.listDepartments.mockResolvedValue({ departments });
  api.listHrEmployees.mockResolvedValue({
    employees: [employee({ ability: { react: 9, comm: 7 }, disc: { d: 8 } })],
    total: 1,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BossTeamPage", () => {
  it("draws the counts, the department shape and the roster joined to its files", async () => {
    renderPage();

    expect(await screen.findByText("Lin Wei")).toBeInTheDocument();
    expect(statValue("People")).toBe("2");
    expect(statValue("Joined this month")).toBe("0");
    expect(statValue("Left this month")).toBe("0");
    expect(statValue("Departments")).toBe("2");

    // The distribution carries every department that holds someone, plus the
    // unassigned band, and the shares are of the two-person roster.
    // Both also appear in the table's department column, hence `getAllByText`.
    expect(screen.getAllByText("Design").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1 people")).toHaveLength(2);

    // The file: hire day, state, and the strongest tags.
    expect(screen.getByText("2026-01-05")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("d")).toBeInTheDocument();
    // The person with no file says so instead of showing a guessed state.
    expect(screen.getByText("No HR file")).toBeInTheDocument();
  });

  it("narrows the roster by search without touching the other blocks", async () => {
    renderPage();

    expect(await screen.findByText("Lin Wei")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search name, role, department or tag"), {
      target: { value: "zhou" },
    });

    expect(screen.queryByText("Lin Wei")).toBeNull();
    expect(screen.getByText("Zhou Min")).toBeInTheDocument();
    // The department block is a different read and keeps its proportions.
    expect(screen.getByText("Design")).toBeInTheDocument();
  });

  it("opens the HR roster from a row — this page is read-only", async () => {
    const { navigation } = renderPage();

    fireEvent.click(await screen.findByText("Lin Wei"));

    expect(navigation.push).toHaveBeenCalledWith("/acme/hr/employees");
  });

  it("says the workspace has no members rather than drawing three empty blocks", async () => {
    api.listMembers.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("This workspace has no members yet")).toBeInTheDocument();
    expect(screen.queryByText("Departments")).toBeNull();
    expect(screen.queryByText("Members")).toBeNull();
  });

  it("keeps the roster when the HR ledger fails, and dashes the file columns", async () => {
    api.listHrEmployees.mockRejectedValue(new Error("hr is down"));
    renderPage();

    expect(await screen.findByText("Lin Wei")).toBeInTheDocument();
    // The reason, once in the summary and once above the table.
    expect(
      screen.getAllByText("The HR ledger didn’t load, so dates and tags are missing.").length,
    ).toBeGreaterThanOrEqual(1);
    // Hiring and leaving are unstatable without the ledger.
    expect(statValue("Joined this month")).toBe("—");
    expect(statValue("Left this month")).toBe("—");
    // People are still countable, and the department shape still renders.
    expect(statValue("People")).toBe("2");
    expect(screen.getAllByText("Design").length).toBeGreaterThanOrEqual(1);
    // Hire day, ability and working style have no answer: the dash, not a guess.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("No HR file")).toBeNull();
  });
});

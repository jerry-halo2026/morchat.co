import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hrEmployeeListOptions } from "@morechat/core/hr/queries";
import { hrOffboardingListOptions } from "@morechat/core/hr";
import { memberListOptions } from "@morechat/core/workspace/queries";
import type {
  HrEmployeeProfile,
  HrHandoverItem,
  HrOffboarding,
  MemberWithUser,
} from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { OFFBOARD_PAGE_LIMIT } from "./offboard-model";
import { HrOffboardPage } from "./offboard-page";

/**
 * 离职管理, over the four segments it is really about (`WORKBENCH-API.md` §15):
 * the three-segment view, the drawer with its handover checklist, the closes
 * that need permission, the confirmation an unfinished checklist earns, and the
 * leave date the `done` transition wrote.
 *
 * The page's own copy lives in `offboard-copy.ts` and reaches the screen as
 * `defaultValue` until the eight bundles carry it, so the English words asserted
 * here are the table's — the same strings the merge has to translate. The three
 * keys the page shell already used (`nav.hr_offboard`, `empty_title`,
 * `empty_description`, `action`) come from the real bundle.
 */

const WS = "ws-offboard";

const api = vi.hoisted(() => {
  class ApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return {
    ApiError,
    api: {
      // The three reads the page starts with are typed here rather than left to
      // inference: `[]` would infer `never[]`, and every per-test `setQueryData`
      // below would then have to fight it.
      listHrOffboardings: vi.fn(
        async (): Promise<{ offboardings: HrOffboarding[]; total: number }> => ({
          offboardings: [],
          total: 0,
        }),
      ),
      listHrEmployees: vi.fn(
        async (): Promise<{ employees: HrEmployeeProfile[]; total: number }> => ({
          employees: [],
          total: 0,
        }),
      ),
      listMembers: vi.fn(async (): Promise<MemberWithUser[]> => []),
      createHrOffboarding: vi.fn(),
      updateHrOffboarding: vi.fn(),
      deleteHrOffboarding: vi.fn(),
      advanceHrOffboarding: vi.fn(),
      cancelHrOffboarding: vi.fn(),
      appendHrOffboardingHandoverItem: vi.fn(),
      updateHrOffboardingHandoverItem: vi.fn(),
      deleteHrOffboardingHandoverItem: vi.fn(),
    },
  };
});

vi.mock("@morechat/core/api", () => ({ api: api.api, ApiError: api.ApiError }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-offboard" }));

// Who is reading: `advance` / `cancel` are owner/admin routes, so switching
// this is how the suite reads the page as an operator or as a member.
const viewer = vi.hoisted(() => ({ role: "owner" as "owner" | "admin" | "member" | null }));

vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: "user-ada",
    role: viewer.role,
    member: null,
    isLoading: false,
  }),
}));

const MEMBERS: MemberWithUser[] = [
  {
    id: "member-ada",
    workspace_id: WS,
    user_id: "user-ada",
    role: "owner",
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

function employee(
  over: Partial<HrEmployeeProfile> & { id: string },
): HrEmployeeProfile {
  return {
    workspace_id: WS,
    member_id: "member-ada",
    department_id: null,
    job_title: "Product designer",
    grade: "P6",
    hire_date: "2024-03-01",
    regular_date: "2024-06-01",
    contract_end: "2027-03-01",
    leave_date: null,
    ability: {},
    disc: {},
    owner_member_id: null,
    created_by: null,
    created_at: "2024-03-01T00:00:00Z",
    updated_at: "2024-03-01T00:00:00Z",
    archived_at: null,
    ...over,
  };
}

const EMPLOYEES: HrEmployeeProfile[] = [
  employee({ id: "emp-ada", member_id: "member-ada" }),
  employee({ id: "emp-grace", member_id: "member-grace", job_title: "Compiler engineer" }),
  employee({
    id: "emp-alan",
    member_id: "member-alan",
    job_title: "Research engineer",
    // The fact the `done` transition wrote; the sheet reads it from here.
    leave_date: "2026-03-31",
  }),
  employee({ id: "emp-free", member_id: "member-free", job_title: "Nobody yet" }),
];

function item(key: string, label: string, done = false, note = ""): HrHandoverItem {
  return { key, label, done, note };
}

function record(over: Partial<HrOffboarding> & { id: string }): HrOffboarding {
  return {
    workspace_id: WS,
    employee_id: "emp-ada",
    status: "apply",
    last_day: "2026-12-01",
    reason: "Moving abroad",
    kind: "voluntary",
    handover: [],
    cert_done: false,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-05T09:00:00Z",
    updated_at: "2026-01-05T09:00:00Z",
    archived_at: null,
    ...over,
  };
}

/** Three records, one per segment; the drawer's checklist is the apply one's. */
const RECORDS: HrOffboarding[] = [
  record({
    id: "ob-apply",
    employee_id: "emp-ada",
    status: "apply",
    last_day: "2026-12-01",
    handover: [item("ho-1", "Laptop"), item("ho-2", "Access cards", true)],
  }),
  record({
    id: "ob-handover",
    employee_id: "emp-grace",
    status: "handover",
    last_day: "2026-11-20",
    kind: "contract_end",
    handover: [item("ho-1", "Design files"), item("ho-2", "Customer handover")],
  }),
  record({
    id: "ob-done",
    employee_id: "emp-alan",
    status: "done",
    last_day: "2026-03-31",
    kind: "involuntary",
    cert_done: true,
    handover: [item("ho-1", "Research notes", true, "Archived in the wiki")],
  }),
];

function adapter(): NavigationAdapter {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    pathname: "/acme/hr/offboard",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderPage(records: readonly HrOffboarding[] = RECORDS) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const listKey = hrOffboardingListOptions(WS, { limit: OFFBOARD_PAGE_LIMIT }).queryKey;
  qc.setQueryData(listKey, { offboardings: [...records], total: records.length });
  qc.setQueryData(hrEmployeeListOptions(WS, {}).queryKey, {
    employees: EMPLOYEES,
    total: EMPLOYEES.length,
  });
  qc.setQueryData(memberListOptions(WS).queryKey, MEMBERS);

  // A write invalidates the list, so the refetch has to answer the same rows the
  // suite seeded; otherwise the page would empty itself after one tick.
  api.api.listHrOffboardings.mockResolvedValue({
    offboardings: [...records],
    total: records.length,
  });
  api.api.listHrEmployees.mockResolvedValue({
    employees: EMPLOYEES,
    total: EMPLOYEES.length,
  });
  api.api.listMembers.mockResolvedValue(MEMBERS);

  return renderWithI18n(
    <QueryClientProvider client={qc}>
      <NavigationProvider value={adapter()}>
        <HrOffboardPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

/** The list's body rows, excluding the sticky header row. */
function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

/** Open one record's drawer by clicking its person. */
async function openRecord(name: string) {
  fireEvent.click(screen.getByText(name));
  return await screen.findByRole("dialog");
}

/** The drawer's checklist list, so a checkbox count does not include the cert. */
function checklist(sheet: HTMLElement): HTMLElement {
  const section = sheet.querySelector<HTMLElement>('[data-slot="offboard-handover"]');
  if (!section) throw new Error("no handover section");
  return section;
}

beforeEach(() => {
  viewer.role = "owner";
  api.api.updateHrOffboardingHandoverItem.mockReset();
  api.api.updateHrOffboardingHandoverItem.mockResolvedValue(RECORDS[0]);
  api.api.advanceHrOffboarding.mockReset();
  api.api.cancelHrOffboarding.mockReset();
  api.api.createHrOffboarding.mockReset();
});

afterEach(cleanup);

describe("HrOffboardPage · the list", () => {
  it("offers its one action when nobody is leaving", () => {
    renderPage([]);

    expect(
      screen.getByRole("heading", { level: 2, name: "No one is offboarding" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Start offboarding" }).length,
    ).toBeGreaterThan(0);
    // An empty header row would read as a list that failed to load.
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("reads the same list as three segments, one record each", async () => {
    renderPage();

    // 申请中 is the landing segment: the queue that needs an answer.
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Handing over" }));
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Finished" }));
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Alan Turing")).toBeInTheDocument();
    // 已完成 holds both outcomes; the status column says which.
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(within(bodyRows()[0]!).getByText("Finished")).toBeInTheDocument();
  });

  it("tells the three stages apart once more records arrive", () => {
    renderPage([
      ...RECORDS,
      record({
        id: "ob-cancelled",
        employee_id: "emp-free",
        status: "cancelled",
        last_day: "2026-02-01",
        handover: [],
      }),
    ]);

    expect(bodyRows()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Finished" }));
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});

describe("HrOffboardPage · the drawer", () => {
  it("opens on a row with one row per handover item", async () => {
    renderPage();
    const sheet = await openRecord("Ada Lovelace");

    expect(within(sheet).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(checklist(sheet)).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(sheet).getByTestId("offboard-handover-progress")).toHaveTextContent("1/2");
  });

  it("writes a tick straight to the entry it belongs to", async () => {
    renderPage();
    const sheet = await openRecord("Ada Lovelace");

    fireEvent.click(within(checklist(sheet)).getByRole("checkbox", { name: "Laptop" }));

    await waitFor(() =>
      expect(api.api.updateHrOffboardingHandoverItem).toHaveBeenCalledTimes(1),
    );
    // Index, not key: the route addresses checklist entries by position.
    expect(api.api.updateHrOffboardingHandoverItem).toHaveBeenCalledWith("ob-apply", 0, {
      done: true,
    });
  });
});

describe("HrOffboardPage · closing an exit", () => {
  it("gives an owner the moves and a member only the record", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Handing over" }));
    let sheet = await openRecord("Grace Hopper");
    expect(within(sheet).getByRole("button", { name: "Finish offboarding" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Cancel offboarding" })).toBeInTheDocument();
    cleanup();

    viewer.role = "member";
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Handing over" }));
    sheet = await openRecord("Grace Hopper");
    expect(within(sheet).queryByRole("button", { name: "Finish offboarding" })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Cancel offboarding" })).toBeNull();
    // Nor can they start one, or edit the fields above the checklist.
    expect(screen.queryByRole("button", { name: "Start offboarding" })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(sheet).getByText(/Read only/)).toBeInTheDocument();
  });

  it("asks before finishing an unfinished handover and says what that means", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Handing over" }));
    const sheet = await openRecord("Grace Hopper");

    fireEvent.click(within(sheet).getByRole("button", { name: "Finish offboarding" }));

    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Handover is not complete");
    // Both checklist entries are still open, and the dialog says so.
    expect(confirm).toHaveTextContent("2 items are still open");
    expect(confirm).toHaveTextContent("employee file");
    // Nothing was written: the confirmation is the decision, not a formality.
    expect(api.api.advanceHrOffboarding).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole("button", { name: "Finish anyway" }));
    await waitFor(() =>
      expect(api.api.advanceHrOffboarding).toHaveBeenCalledWith("ob-handover"),
    );
  });

  it("shows the leave date a finished record wrote into the employee file", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Finished" }));
    const sheet = await openRecord("Alan Turing");

    const recorded = within(sheet).getByTestId("offboard-leave-date");
    expect(recorded).toHaveTextContent("Left on 2026-03-31");
    expect(recorded).toHaveTextContent("records this as their leave date");
    // The checklist of a finished record is a document: no tick, no removal.
    expect(within(checklist(sheet)).queryByRole("button", { name: "Remove this item" })).toBeNull();
    const sealedTick = within(checklist(sheet)).getByRole("checkbox", {
      name: "Research notes",
    });
    expect(sealedTick).toHaveAttribute("aria-disabled", "true");
  });
});

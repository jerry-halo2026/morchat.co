import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import type {
  CrmBrief,
  CrmClient,
  CrmCollab,
  CrmCollabStage,
  MemberWithUser,
} from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { BossCustomersPage } from "../boss-customers-page";

/**
 * 客户商机 (`/{slug}/boss/customers`) — the chain 客户 → 需求单 → 合作单, read on the
 * table and written through the two dialogs.
 *
 * Copy comes from the real `biz` bundle (the English edition), so the assertions
 * are the strings the eight translations have to carry.
 */

const WS = "ws-1";

const api = vi.hoisted(() => ({
  listCrmClients: vi.fn(),
  listCrmBriefs: vi.fn(),
  listCrmCollabs: vi.fn(),
  listMembers: vi.fn(),
  listCreators: vi.fn(),
  createCrmClient: vi.fn(),
  updateCrmClient: vi.fn(),
  createCrmBrief: vi.fn(),
  updateCrmBrief: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Who the reader is: the one input that decides whether the page writes at all.
const viewer = vi.hoisted(() => ({ role: "admin" as "owner" | "admin" | "member" | null }));

vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({ userId: "user-1", role: viewer.role, member: null, isLoading: false }),
}));

function client(id: string, overrides: Partial<CrmClient> = {}): CrmClient {
  return {
    id,
    workspace_id: WS,
    name: `客户 ${id}`,
    brand: null,
    industry: null,
    contact_name: null,
    contact_channel: null,
    contract_entity: null,
    payment_terms: null,
    credit_note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-10T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function brief(id: string, clientId: string, overrides: Partial<CrmBrief> = {}): CrmBrief {
  return {
    id,
    workspace_id: WS,
    client_id: clientId,
    title: `需求 ${id}`,
    category: null,
    budget_min_amount: null,
    budget_max_amount: null,
    target_audience: null,
    deliverable_type: null,
    platforms: [],
    schedule_from: null,
    schedule_to: null,
    kpi_play: null,
    kpi_gmv_amount: null,
    status: "open",
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-02T02:00:00Z",
    updated_at: "2026-11-02T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function collab(id: string, briefId: string, stage: CrmCollabStage): CrmCollab {
  return {
    id,
    workspace_id: WS,
    brief_id: briefId,
    creator_id: "creator-1",
    stage,
    quote_amount: null,
    final_amount: 8000,
    prob: null,
    creator_fee: null,
    sample_cost: null,
    platform_fee: null,
    currency: "CNY",
    settlement_mode: null,
    commission_rate: null,
    sample_required: false,
    script_required: false,
    scheduled_at: null,
    confirmed_at: null,
    published_at: null,
    accepted_at: null,
    issue_id: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-03T02:00:00Z",
    updated_at: "2026-11-03T02:00:00Z",
    archived_at: null,
    publish_url: null,
    settled_on: null,
  };
}

function member(id: string, userId: string, name: string): MemberWithUser {
  return {
    id,
    workspace_id: WS,
    user_id: userId,
    role: "member",
    created_at: "2026-01-01T00:00:00Z",
    name,
    email: `${userId}@acme.test`,
    avatar_url: null,
    department_id: null,
  };
}

const push = vi.fn();

function adapter(): NavigationAdapter {
  return {
    push,
    replace: () => {},
    back: () => {},
    pathname: "/acme/boss/customers",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <NavigationProvider value={adapter()}>
        <WorkspaceSlugProvider slug="acme">
          <BossCustomersPage />
        </WorkspaceSlugProvider>
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

/** The rows of the grid, without the sticky header row. */
function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

function serve(clients: readonly CrmClient[], briefs: readonly CrmBrief[], collabs: readonly CrmCollab[]) {
  api.listCrmClients.mockResolvedValue({ clients: [...clients], total: clients.length });
  api.listCrmBriefs.mockResolvedValue({ briefs: [...briefs], total: briefs.length });
  api.listCrmCollabs.mockResolvedValue({ collabs: [...collabs], total: collabs.length });
}

beforeEach(() => {
  viewer.role = "admin";
  push.mockClear();
  serve([], [], []);
  api.listMembers.mockResolvedValue([member("m-1", "user-7", "李敏")]);
  api.listCreators.mockResolvedValue({ creators: [], total: 0, next_cursor: null });
  api.createCrmClient.mockResolvedValue(client("c-new"));
  api.updateCrmClient.mockResolvedValue(client("c-1"));
  api.createCrmBrief.mockResolvedValue(brief("b-new", "c-1"));
  api.updateCrmBrief.mockResolvedValue(brief("b-1", "c-1"));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BossCustomersPage · 空态", () => {
  it("says there is no customer yet instead of drawing an empty grid", async () => {
    renderPage();

    expect(await screen.findByText("No customers yet")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByRole("button", { name: "New customer" })).toBeInTheDocument();
  });
});

describe("BossCustomersPage · 表格", () => {
  it("draws the chain and the derived status per customer", async () => {
    serve(
      [
        client("c-1", { name: "海川跨境", industry: "跨境电商", owner_member_id: "user-7" }),
        client("c-2", { name: "岸上咖啡", updated_at: "2026-11-11T02:00:00Z" }),
      ],
      [brief("b-1", "c-1", { status: "open" }), brief("b-2", "c-2", { status: "closed" })],
      [collab("k-2", "b-2", "settled")],
    );
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    const [newest, oldest] = bodyRows();

    // Newest touch first: 岸上咖啡 was updated a day later.
    expect(newest).toHaveTextContent("岸上咖啡");
    // A settled collaboration makes the client 已成交, whatever the brief says.
    expect(newest).toHaveTextContent("Won");
    expect(newest).toHaveTextContent("1");

    expect(oldest).toHaveTextContent("海川跨境");
    expect(oldest).toHaveTextContent("跨境电商");
    expect(oldest).toHaveTextContent("李敏");
    // An open brief with nothing running is 跟进中, not won.
    expect(oldest).toHaveTextContent("In progress");
    expect(oldest).not.toHaveTextContent("Won");
  });

  it("searches the printed fields and offers a way back", async () => {
    serve([client("c-1", { name: "海川跨境" }), client("c-2", { name: "岸上咖啡" })], [], []);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    await userEvent.type(screen.getByLabelText("Search customers"), "咖啡");

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(bodyRows()[0]).toHaveTextContent("岸上咖啡");

    await userEvent.clear(screen.getByLabelText("Search customers"));
    await userEvent.type(screen.getByLabelText("Search customers"), "没有这个人");
    expect(await screen.findByText("No customer matches that search.")).toBeInTheDocument();
  });
});

describe("BossCustomersPage · 写客户", () => {
  it("sends the five fields, with empty ones as null", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "New customer" }));
    await userEvent.type(screen.getByLabelText("Customer name"), "海川跨境");
    await userEvent.type(screen.getByLabelText("Channel"), "官网咨询");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createCrmClient).toHaveBeenCalledTimes(1));
    expect(api.createCrmClient.mock.calls[0]![0]).toEqual({
      name: "海川跨境",
      brand: null,
      industry: null,
      contact_name: null,
      contact_channel: "官网咨询",
    });
  });

  it("refuses a customer without a name and sends nothing", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "New customer" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("A customer needs a name.")).toBeInTheDocument();
    expect(api.createCrmClient).not.toHaveBeenCalled();
  });
});

describe("BossCustomersPage · 抽屉里的两层", () => {
  it("shows the customer's brief and its collaboration, and opens the collab page", async () => {
    serve(
      [client("c-1", { name: "海川跨境" })],
      [brief("b-1", "c-1", { title: "双十一短视频", budget_min_amount: 5000, budget_max_amount: 8000 })],
      [collab("k-1", "b-1", "confirmed")],
    );
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    fireEvent.click(within(bodyRows()[0]!).getByText("海川跨境"));

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("双十一短视频")).toBeInTheDocument();
    // The brief's money is CNY (no currency column), the collab's own row too.
    expect(within(sheet).getByText("¥5,000 – ¥8,000")).toBeInTheDocument();
    expect(within(sheet).getByText("Confirmed")).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole("button", { name: /Open collaborations/ }));
    expect(push).toHaveBeenCalledWith("/acme/sales/collabs");
  });

  it("sends a new brief for the customer the drawer is showing", async () => {
    serve([client("c-1", { name: "海川跨境" })], [], []);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    fireEvent.click(within(bodyRows()[0]!).getByText("海川跨境"));

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("This customer has no brief yet.")).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole("button", { name: /New brief/ }));
    await userEvent.type(screen.getByLabelText("Brief title"), "双十一短视频");
    await userEvent.type(screen.getByLabelText("Budget from"), "5000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createCrmBrief).toHaveBeenCalledTimes(1));
    expect(api.createCrmBrief.mock.calls[0]![0]).toEqual({
      client_id: "c-1",
      title: "双十一短视频",
      status: "draft",
      budget_min_amount: 5000,
      budget_max_amount: null,
      deliverable_type: null,
    });
  });
});

describe("BossCustomersPage · 只读", () => {
  it("offers no create control to a reader who is not a member", async () => {
    viewer.role = null;
    serve([client("c-1", { name: "海川跨境" })], [], []);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "New customer" })).toBeNull();
  });
});

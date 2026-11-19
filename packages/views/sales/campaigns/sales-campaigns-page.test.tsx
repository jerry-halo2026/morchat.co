import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { BdCampaign, MemberWithUser } from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { SalesCampaignsPage } from "../sales-campaigns-page";

/**
 * 采集批次 (`/{slug}/sales/campaigns`) — how a set of creators was found.
 *
 * The assertions are about the sentences the page makes: a batch with no budget
 * prints an empty marker, a batch with no creators prints a real `0`, the window
 * keeps both ends, the kind filter runs on the server, and the form sends exactly
 * the seven fields it owns — never the cached `creator_count`, which no entry
 * point on this page is allowed to type.
 *
 * The clock is pinned to 2026-11-18 (only `Date` is faked, so Testing Library's
 * timers still run): 更新时间 is an instant read as a local day.
 */

const WS = "ws-1";
const NOW = new Date(2026, 10, 18, 15, 0, 0);

const api = vi.hoisted(() => ({
  listBdCampaigns: vi.fn(),
  listMembers: vi.fn(),
  createBdCampaign: vi.fn(),
  updateBdCampaign: vi.fn(),
  deleteBdCampaign: vi.fn(),
}));

const viewer = vi.hoisted(() => ({
  role: "admin" as "owner" | "admin" | "member" | null,
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({ userId: "user-1", role: viewer.role, member: null, isLoading: false }),
}));
vi.mock("../../navigation", () => ({
  AppLink: ({
    children,
    href,
    ...props
  }: { children: ReactNode; href: string } & React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useNavigation: () => ({
    pathname: "/acme/sales/campaigns",
    push: () => {},
    getShareableUrl: (href: string) => href,
  }),
  useIntentNavigate: () => () => {},
  useRowLink: () => () => ({
    onClick: (event: React.MouseEvent) => {
      event.preventDefault();
    },
    onAuxClick: () => {},
    onMouseEnter: () => {},
  }),
}));

function campaign(overrides: Partial<BdCampaign> & Pick<BdCampaign, "id">): BdCampaign {
  return {
    workspace_id: WS,
    name: "Autumn search",
    kind: "search",
    budget_amount: null,
    currency: "CNY",
    started_on: null,
    ended_on: null,
    source_keyword: null,
    creator_count: 0,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-10T02:00:00Z",
    ...overrides,
  };
}

const MEMBER: MemberWithUser = {
  id: "member-1",
  workspace_id: WS,
  user_id: "user-9",
  role: "member",
  created_at: "2026-01-01T00:00:00Z",
  name: "Zhao Min",
  email: "zhao@example.test",
  avatar_url: null,
};

function serve(rows: readonly BdCampaign[]) {
  api.listBdCampaigns.mockResolvedValue({ campaigns: [...rows], total: rows.length });
  api.listMembers.mockResolvedValue([MEMBER]);
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <SalesCampaignsPage />
    </QueryClientProvider>,
  );
}

/** The rows of the grid, header excluded. */
function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  viewer.role = "admin";
  serve([]);
  api.createBdCampaign.mockResolvedValue(campaign({ id: "campaign-new" }));
  api.updateBdCampaign.mockResolvedValue(campaign({ id: "campaign-1" }));
  api.deleteBdCampaign.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SalesCampaignsPage · 空", () => {
  it("says there are no batches and what a batch records", async () => {
    renderPage();

    expect(await screen.findByText("No collection batches yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A batch records how a set of creators was found: a keyword search, a comment section, or a hand-kept list.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Campaigns" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New batch" })).toBeInTheDocument();
    // No kind filter is invented on the wire.
    expect(api.listBdCampaigns).toHaveBeenCalledWith({ kind: undefined });
  });
});

describe("SalesCampaignsPage · 表格", () => {
  it("draws the eight columns, a real zero and an empty budget", async () => {
    serve([
      campaign({
        id: "campaign-1",
        name: "Autumn search",
        kind: "comment",
        source_keyword: "护肤",
        budget_amount: 5000,
        started_on: "2026-10-01",
        ended_on: "2026-10-31",
        creator_count: 128,
        owner_member_id: "member-1",
        updated_at: "2026-11-17T02:00:00Z",
      }),
      campaign({
        id: "campaign-2",
        name: "Winter manual",
        kind: "manual",
        budget_amount: null,
        creator_count: 0,
        updated_at: "2026-11-16T02:00:00Z",
      }),
    ]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(
      within(screen.getByRole("grid")).getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual([
      "Name",
      "Kind",
      "Keyword",
      "Budget",
      "Window",
      "Creators",
      "Owner",
      "Updated",
    ]);

    // Rows are ordered by window start (`coalesce(started_on, created_at)` DESC),
    // so this test reads them by name rather than by position.
    const rowOf = (name: string) => bodyRows().find((row) => row.textContent?.includes(name))!;

    const first = rowOf("Autumn search");
    const second = rowOf("Winter manual");
    expect(first).toHaveTextContent("Autumn search");
    expect(first).toHaveTextContent("Comments");
    expect(first).toHaveTextContent("护肤");
    expect(first).toHaveTextContent("¥5,000");
    expect(first).toHaveTextContent("2026-10-01");
    expect(first).toHaveTextContent("2026-10-31");
    expect(first).toHaveTextContent("128");
    expect(first).toHaveTextContent("Zhao Min");
    expect(first).toHaveTextContent("2026-11-17");

    // Nobody set a budget → an empty marker. Nobody is in the batch → a real 0,
    // because the column is `NOT NULL DEFAULT 0`.
    expect(second).toHaveTextContent("Winter manual");
    expect(second).toHaveTextContent("Manual list");
    expect(second).toHaveTextContent("—");
    expect(second).not.toHaveTextContent("¥0");
    expect(within(second).getAllByRole("gridcell")[5]).toHaveTextContent("0");
  });
});

describe("SalesCampaignsPage · 筛选", () => {
  it("asks the server for one kind", async () => {
    serve([campaign({ id: "campaign-1" })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await userEvent.click(screen.getByRole("combobox", { name: "Kind" }));
    await userEvent.click(await screen.findByRole("option", { name: "Manual list" }));

    await waitFor(() =>
      expect(api.listBdCampaigns).toHaveBeenLastCalledWith({ kind: "manual" }),
    );
  });
});

describe("SalesCampaignsPage · 新建", () => {
  it("sends the seven batch fields and never a creator count", async () => {
    serve([]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "New batch" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Winter search " } });
    await userEvent.click(screen.getByRole("combobox", { name: "Kind" }));
    await userEvent.click(await screen.findByRole("option", { name: "Keyword search" }));
    fireEvent.change(screen.getByLabelText("Keyword"), { target: { value: "护肤" } });
    fireEvent.change(screen.getByLabelText("Budget"), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-11-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createBdCampaign).toHaveBeenCalledTimes(1));
    expect(api.createBdCampaign.mock.calls[0]![0]).toEqual({
      name: "Winter search",
      kind: "search",
      budget_amount: 5000,
      currency: "CNY",
      started_on: "2026-11-01",
      ended_on: null,
      source_keyword: "护肤",
    });
  });

  it("refuses a backwards window without sending anything", async () => {
    serve([]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "New batch" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Winter" } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-11-10" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-11-09" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("The end day is before the start day.")).toBeInTheDocument();
    expect(api.createBdCampaign).not.toHaveBeenCalled();
  });

  it("refuses an unnamed batch", async () => {
    serve([]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "New batch" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Give the batch a name.")).toBeInTheDocument();
    expect(api.createBdCampaign).not.toHaveBeenCalled();
  });
});

describe("SalesCampaignsPage · 编辑", () => {
  it("patches the row it opened", async () => {
    serve([campaign({ id: "campaign-1", name: "Autumn search" })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await userEvent.click(within(bodyRows()[0]!).getByText("Autumn search"));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Autumn v2" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.updateBdCampaign).toHaveBeenCalledWith("campaign-1", {
        name: "Autumn v2",
        kind: "search",
        budget_amount: null,
        currency: "CNY",
        started_on: null,
        ended_on: null,
        source_keyword: null,
      }),
    );
  });
});

describe("SalesCampaignsPage · 删除", () => {
  it("asks first, then soft-deletes the row", async () => {
    serve([campaign({ id: "campaign-1", name: "Autumn search" })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await userEvent.click(within(bodyRows()[0]!).getByRole("button", { name: "Batch actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(await screen.findByText("Delete this batch?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.deleteBdCampaign).toHaveBeenCalledWith("campaign-1"));
  });
});

describe("SalesCampaignsPage · 无写权限", () => {
  it("draws the ledger without the create action or the row menu", async () => {
    viewer.role = null;
    serve([campaign({ id: "campaign-1" })]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "New batch" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Batch actions" })).toBeNull();
  });
});

describe("SalesCampaignsPage · 错误", () => {
  it("states the failure once and retries it", async () => {
    api.listBdCampaigns.mockRejectedValue(new Error("boom"));
    api.listMembers.mockResolvedValue([MEMBER]);
    renderPage();

    expect(await screen.findByText("Couldn't load batches")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();

    serve([campaign({ id: "campaign-1" })]);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
  });
});

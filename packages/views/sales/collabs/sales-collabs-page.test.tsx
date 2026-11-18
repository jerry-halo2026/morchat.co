import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CrmBrief, CrmClient, CrmCollab, CrmSettlement, Creator } from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { SalesCollabsPage } from "../sales-collabs-page";

/**
 * 合作单 (`/{slug}/sales/collabs`) — one creator × one brief, its money, its
 * fulfilment link, and the settlements behind it.
 *
 * Every assertion below is about a sentence being true on screen rather than a
 * control existing: a null amount prints the shared empty marker and never ¥0; a
 * band's Σ is empty when no row in it closed an amount; the drawer sends exactly
 * the four fields it owns; and `paid_at` — not the settlement kind — decides
 * whether a row reads 已到账.
 *
 * The clock is pinned to 2026-11-18 (only `Date` is faked, so Testing Library's
 * timers still run): the 更新时间 window and every instant cell are local-day
 * comparisons.
 */

const WS = "ws-1";
const NOW = new Date(2026, 10, 18, 15, 0, 0);

const api = vi.hoisted(() => ({
  listCrmCollabs: vi.fn(),
  listCrmBriefs: vi.fn(),
  listCrmClients: vi.fn(),
  listCrmSettlements: vi.fn(),
  listCreators: vi.fn(),
  createCrmCollab: vi.fn(),
  updateCrmCollab: vi.fn(),
  deleteCrmCollab: vi.fn(),
  createCrmSettlement: vi.fn(),
  updateCrmSettlement: vi.fn(),
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
    pathname: "/acme/sales/collabs",
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

function collab(overrides: Partial<CrmCollab> & Pick<CrmCollab, "id">): CrmCollab {
  return {
    workspace_id: WS,
    brief_id: "brief-1",
    creator_id: "creator-1",
    stage: "confirmed",
    quote_amount: null,
    final_amount: null,
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
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-10T02:00:00Z",
    archived_at: null,
    publish_url: null,
    settled_on: null,
    ...overrides,
  };
}

function creator(id: string, name: string): Creator {
  return {
    id,
    workspace_id: WS,
    kind: "external",
    display_name: name,
    platform: "douyin",
    handle: id,
    url: null,
    fans: 1000,
    fans_d7: 0,
    avg_play: 0,
    engagement_rate: null,
    category: null,
    audience_note: null,
    region: null,
    price_note: null,
    score: null,
    risk_flag: false,
    blacklist_reason: null,
    owner_member_id: null,
    media_ip_project_id: null,
    created_by: null,
    created_at: "2026-10-01T02:00:00Z",
    updated_at: "2026-10-01T02:00:00Z",
    archived_at: null,
    sec_uid: null,
    douyin_id: null,
    dy_uid: null,
    fans_display: null,
    quote_min: null,
    quote_max: null,
    cooperation_intent: null,
    lead_status: null,
    last_dm_at: null,
    likes_total: null,
    following_count: null,
    verify_type: null,
    tags: [],
    source_type: null,
    source_keyword: null,
    source_rank: null,
    source_system: null,
    source_id: null,
  };
}

function brief(id: string, title: string, clientId: string): CrmBrief {
  return {
    id,
    workspace_id: WS,
    client_id: clientId,
    title,
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
    created_at: "2026-10-01T02:00:00Z",
    updated_at: "2026-10-01T02:00:00Z",
    archived_at: null,
  };
}

function client(id: string, name: string): CrmClient {
  return {
    id,
    workspace_id: WS,
    name,
    brand: null,
    industry: null,
    contact_name: null,
    contact_channel: null,
    contract_entity: null,
    payment_terms: null,
    credit_note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-10-01T02:00:00Z",
    updated_at: "2026-10-01T02:00:00Z",
    archived_at: null,
  };
}

let settlementSeq = 0;

function settlement(overrides: Partial<CrmSettlement> = {}): CrmSettlement {
  settlementSeq += 1;
  return {
    id: `settlement-${settlementSeq}`,
    workspace_id: WS,
    collab_id: "collab-1",
    kind: "prepay",
    amount: 3000,
    currency: "CNY",
    due_at: null,
    paid_at: null,
    invoice_no: null,
    note: null,
    created_by: null,
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

/**
 * What the settlement query answers *now*. A row action writes through the
 * server, so the "after" list is served by mutating this and letting the
 * invalidation reread it — the page never patches the ledger itself.
 */
let servedSettlements: CrmSettlement[] = [];

function setSettlements(next: readonly CrmSettlement[]) {
  servedSettlements = [...next];
}

function serve(rows: readonly CrmCollab[], settlements: readonly CrmSettlement[] = []) {
  api.listCrmCollabs.mockResolvedValue({ collabs: [...rows], total: rows.length });
  setSettlements(settlements);
  api.listCrmSettlements.mockImplementation(async () => ({
    settlements: [...servedSettlements],
    total: servedSettlements.length,
  }));
  api.listCreators.mockResolvedValue({
    creators: [creator("creator-1", "Lin Wei"), creator("creator-2", "Zhang Yu")],
    total: 2,
    next_cursor: null,
  });
  api.listCrmBriefs.mockResolvedValue({
    briefs: [brief("brief-1", "Autumn skincare", "client-1")],
    total: 1,
  });
  api.listCrmClients.mockResolvedValue({
    clients: [client("client-1", "Harbor")],
    total: 1,
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <SalesCollabsPage />
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
  api.updateCrmCollab.mockResolvedValue(collab({ id: "collab-1" }));
  api.createCrmCollab.mockResolvedValue(collab({ id: "collab-new" }));
  api.deleteCrmCollab.mockResolvedValue(undefined);
  api.createCrmSettlement.mockResolvedValue(settlement());
  api.updateCrmSettlement.mockResolvedValue(settlement({ id: "s-1" }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SalesCollabsPage · 空", () => {
  it("says there are no collaborations and where one starts", async () => {
    renderPage();

    expect(await screen.findByText("No collaborations yet")).toBeInTheDocument();
    expect(
      screen.getByText("A collaboration is one creator on one brief. Start one from a brief."),
    ).toBeInTheDocument();
    // The header and its one action stay: an empty ledger is a page, not a blank screen.
    expect(screen.getByRole("heading", { name: "Collabs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New collaboration" })).toBeInTheDocument();
    // No request invented a filter: the endpoint is asked for the whole ledger.
    expect(api.listCrmCollabs).toHaveBeenCalledWith({ stage: undefined, creator_id: undefined });
  });
});

describe("SalesCollabsPage · 表格", () => {
  it("draws the ten columns, the stage bands and their sums", async () => {
    serve([
      collab({
        id: "c-1",
        stage: "published",
        quote_amount: 8000,
        final_amount: 9000,
        creator_fee: 9000,
        sample_cost: 200,
        platform_fee: 50,
        commission_rate: 0.2,
        publish_url: "https://example.test/v/1",
        settled_on: "2026-11-17",
        updated_at: "2026-11-17T02:00:00Z",
      }),
      collab({ id: "c-2", stage: "settled", final_amount: 4000, creator_id: "creator-2" }),
    ]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(
      within(screen.getByRole("grid")).getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual([
      "Creator",
      "Brief",
      "Stage",
      "Quoted",
      "Closed",
      "Fee · sample · platform",
      "Commission",
      "Live link",
      "Settled on",
      "Updated",
    ]);

    const [first] = bodyRows();
    expect(first).toHaveTextContent("Lin Wei");
    expect(first).toHaveTextContent("Autumn skincare");
    expect(first).toHaveTextContent("Harbor");
    expect(first).toHaveTextContent("Published");
    expect(first).toHaveTextContent("¥8,000");
    expect(first).toHaveTextContent("¥9,000");
    // Three slots, one column: 合作费 · 样品费 · 平台费.
    expect(first).toHaveTextContent("¥9,000·¥200·¥50");
    expect(first).toHaveTextContent("20.0%");
    expect(first).toHaveTextContent("https://example.test/v/1");
    expect(first).toHaveTextContent("2026-11-17");

    // Two stages → two bands, in pipeline order, each with its own closed total.
    // The band's sum lives in its `actions` slot, which carries the stage as a hook.
    expect(
      document.querySelector('[data-group-total="published"]'),
    ).toHaveTextContent("¥9,000");
    expect(
      document.querySelector('[data-group-total="settled"]'),
    ).toHaveTextContent("¥4,000");
  });

  it("prints an empty marker instead of ¥0, and an empty band sum", async () => {
    serve([
      collab({
        id: "c-1",
        stage: "inquiry",
        quote_amount: null,
        final_amount: null,
        updated_at: "2026-11-12T02:00:00Z",
      }),
      collab({
        id: "c-2",
        stage: "inquiry",
        final_amount: 0,
        updated_at: "2026-11-11T02:00:00Z",
      }),
    ]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    const [quoted, closed] = bodyRows();

    // Four empty slots on the first row: quoted, closed, fee, commission,
    // link, settled day — six dashes, and never a ¥0.
    expect(within(quoted!).getAllByText("—").length).toBeGreaterThanOrEqual(5);
    expect(quoted).not.toHaveTextContent("¥0");

    // A row that really closed at zero prints ¥0 — that one is not unknown.
    expect(closed).toHaveTextContent("¥0");
  });
});

describe("SalesCollabsPage · 筛选", () => {
  it("asks the server for one stage when the stage filter changes", async () => {
    serve([collab({ id: "c-1" })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await userEvent.click(screen.getByRole("combobox", { name: "Stage" }));
    await userEvent.click(await screen.findByRole("option", { name: "Settled" }));

    await waitFor(() =>
      expect(api.listCrmCollabs).toHaveBeenLastCalledWith({
        stage: "settled",
        creator_id: undefined,
      }),
    );
  });
});

describe("SalesCollabsPage · 抽屉", () => {
  it("saves the stage, the amounts, the link and the settled day", async () => {
    serve([
      collab({ id: "collab-1", stage: "published", quote_amount: 8000, final_amount: null }),
    ]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(within(bodyRows()[0]!).getByText("Lin Wei"));
    expect(await screen.findByRole("heading", { name: "Lin Wei" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "Stage" }));
    await userEvent.click(await screen.findByRole("option", { name: "Accepted" }));
    fireEvent.change(screen.getByLabelText("Closed amount"), { target: { value: "9500" } });
    fireEvent.change(screen.getByLabelText("Live link"), {
      target: { value: "https://example.test/v/2" },
    });
    fireEvent.change(screen.getByLabelText("Settled on"), { target: { value: "2026-11-18" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.updateCrmCollab).toHaveBeenCalledWith("collab-1", {
        stage: "accepted",
        quote_amount: 8000,
        final_amount: 9500,
        publish_url: "https://example.test/v/2",
        settled_on: "2026-11-18",
      }),
    );
  });

  it("refuses a bad amount without sending anything", async () => {
    serve([collab({ id: "collab-1", quote_amount: 8000 })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(within(bodyRows()[0]!).getByText("Lin Wei"));
    fireEvent.change(await screen.findByLabelText("Quoted amount"), {
      target: { value: "-5" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter an amount of 0 or more.")).toBeInTheDocument();
    expect(api.updateCrmCollab).not.toHaveBeenCalled();
  });
});

describe("SalesCollabsPage · 结算", () => {
  it("lists the movements and marks 已到账 only when paid_at is set", async () => {
    serve(
      [collab({ id: "collab-1" })],
      [
        settlement({
          id: "s-paid",
          kind: "prepay",
          amount: 3000,
          paid_at: new Date(2026, 10, 10, 9).toISOString(),
        }),
        settlement({ id: "s-owed", kind: "final", amount: 6000, paid_at: null }),
      ],
    );
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(within(bodyRows()[0]!).getByText("Lin Wei"));
    expect(await screen.findByText("Prepayment")).toBeInTheDocument();
    expect(await screen.findByText("Final payment")).toBeInTheDocument();
    // The word is on two rows, each tagged with the fact that decided it.
    expect(document.querySelector('[data-received="yes"]')).toHaveTextContent(
      "Received · 2026-11-10",
    );
    expect(document.querySelector('[data-received="no"]')).toHaveTextContent("Not received");
    // The section reads the ledger through this collaboration's own filter.
    expect(api.listCrmSettlements).toHaveBeenCalledWith({ collab_id: "collab-1" });
  });

  it("adds a settlement for this collaboration", async () => {
    serve([collab({ id: "collab-1" })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(within(bodyRows()[0]!).getByText("Lin Wei"));
    fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "3000" } });
    fireEvent.change(screen.getByLabelText("Received on"), {
      target: { value: "2026-11-18" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Record a settlement" }));

    await waitFor(() =>
      expect(api.createCrmSettlement).toHaveBeenCalledWith({
        collab_id: "collab-1",
        kind: "prepay",
        amount: 3000,
        currency: "CNY",
        paid_at: new Date(2026, 10, 18, 12).toISOString(),
      }),
    );
  });
});

describe("SalesCollabsPage · 结算到账", () => {
  it("marks an unpaid row received with today's local-noon instant", async () => {
    serve(
      [collab({ id: "collab-1" })],
      [settlement({ id: "s-1", kind: "prepay", amount: 3000, paid_at: null })],
    );
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(within(bodyRows()[0]!).getByText("Lin Wei"));
    await userEvent.click(await screen.findByRole("button", { name: "Mark received" }));

    await waitFor(() =>
      expect(api.updateCrmSettlement).toHaveBeenCalledWith("s-1", {
        // The same instant rule the add form uses: that day, at local noon.
        paid_at: new Date(2026, 10, 18, 12).toISOString(),
      }),
    );
  });

  it("undoes an arrival by clearing paid_at", async () => {    serve(
      [collab({ id: "collab-1" })],
      [
        settlement({
          id: "s-1",
          kind: "prepay",
          amount: 3000,
          paid_at: new Date(2026, 10, 10, 9).toISOString(),
        }),
      ],
    );
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(within(bodyRows()[0]!).getByText("Lin Wei"));
    await userEvent.click(await screen.findByRole("button", { name: "Undo receipt" }));

    await waitFor(() =>
      // An empty day, not `null`: the handler reads null as "keep the stored
      // value" and would leave the row received.
      expect(api.updateCrmSettlement).toHaveBeenCalledWith("s-1", { paid_at: "" }),
    );
  });

  it("moves the money from owed to received when a row is marked", async () => {
    const paid = settlement({
      id: "s-paid",
      kind: "prepay",
      amount: 3000,
      paid_at: new Date(2026, 10, 10, 9).toISOString(),
    });
    const owed = settlement({ id: "s-owed", kind: "final", amount: 6000, paid_at: null });
    serve([collab({ id: "collab-1" })], [paid, owed]);
    // The server's answer: both rows have arrived now.
    api.updateCrmSettlement.mockImplementation(async () => {
      const arrived = { ...owed, paid_at: new Date(2026, 10, 18, 12).toISOString() };
      setSettlements([paid, arrived]);
      return arrived;
    });
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(within(bodyRows()[0]!).getByText("Lin Wei"));
    const received = () => document.querySelector('[data-settlement-total="received"]');
    const stillOwed = () => document.querySelector('[data-settlement-total="owed"]');

    await waitFor(() => expect(received()).toHaveTextContent("¥3,000"));
    expect(stillOwed()).toHaveTextContent("¥6,000");

    // Only the unpaid row offers the action, so its name is unambiguous.
    await userEvent.click(screen.getByRole("button", { name: "Mark received" }));

    // The totals are reread from the ledger, not patched by hand: the sum of the
    // two arrivals, and nothing left owed.
    await waitFor(() => expect(received()).toHaveTextContent("¥9,000"));
    expect(stillOwed()).toHaveTextContent("—");
  });
});

describe("SalesCollabsPage · 撤销合作单", () => {
  it("asks once, names the settlements it takes with it, then deletes the row", async () => {
    serve([]);
    // The ledger answers with the row once, then without it: the deletion has to
    // invalidate `crmKeys` for the page to reread, not patch the list itself.
    let reads = 0;
    api.listCrmCollabs.mockImplementation(async () => {
      reads += 1;
      const rows = reads === 1 ? [collab({ id: "collab-1" })] : [];
      return { collabs: rows, total: rows.length };
    });
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(within(bodyRows()[0]!).getByText("Lin Wei"));
    expect(await screen.findByRole("heading", { name: "Lin Wei" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Revoke collaboration" }));

    expect(await screen.findByText("Revoke this collaboration?")).toBeInTheDocument();
    // The confirmation has to say the money goes with the row.
    expect(
      screen.getByText(/the settlement records recorded against it are archived with it/),
    ).toBeInTheDocument();
    // Nothing is written until the second click.
    expect(api.deleteCrmCollab).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(api.deleteCrmCollab).toHaveBeenCalledWith("collab-1"));
    // The drawer closes on the server's answer, and the ledger is reread.
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Lin Wei" })).toBeNull());
    expect(await screen.findByText("No collaborations yet")).toBeInTheDocument();
    expect(reads).toBeGreaterThan(1);
  });

  it("stays open and says why when the server refuses", async () => {
    api.deleteCrmCollab.mockRejectedValue(new Error("settlements are still linked"));
    serve([collab({ id: "collab-1" })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(within(bodyRows()[0]!).getByText("Lin Wei"));
    await userEvent.click(await screen.findByRole("button", { name: "Revoke collaboration" }));
    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("settlements are still linked");
    // The dialog is still the open layer, and the row it is about is still there:
    // nothing was removed optimistically.
    expect(screen.getByText("Revoke this collaboration?")).toBeInTheDocument();
    expect(api.deleteCrmCollab).toHaveBeenCalledTimes(1);

    // Dismissing the dialog returns to the drawer it was opened from.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("heading", { name: "Lin Wei" })).toBeInTheDocument();

    // And the row is still in the ledger behind it: nothing was removed
    // optimistically. (The page is aria-hidden while the drawer is up, so the
    // grid is read after closing it.)
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
  });
});

describe("SalesCollabsPage · 无写权限", () => {
  it("draws the ledger without the create action or the drawer", async () => {
    viewer.role = null;
    serve([collab({ id: "collab-1" })]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "New collaboration" })).toBeNull();

    fireEvent.click(within(bodyRows()[0]!).getByText("Lin Wei"));
    expect(screen.queryByRole("heading", { name: "Lin Wei" })).toBeNull();
  });
});

describe("SalesCollabsPage · 错误", () => {
  it("states the failure once and retries it", async () => {
    api.listCrmCollabs.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByText("Couldn't load collaborations")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();

    serve([collab({ id: "collab-1" })]);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
  });
});

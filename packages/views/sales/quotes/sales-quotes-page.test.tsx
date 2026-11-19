import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BdQuote, Creator } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { SalesQuotesPage } from "../sales-quotes-page";

/**
 * 报价 (`/{slug}/sales/quotes`) — the price offered to a creator, and whether it
 * still stands.
 *
 * The page's copy reaches the screen through `quotes/copy.ts` as `defaultValue`
 * until the eight bundles carry it, so the English words asserted here are that
 * table's — the same strings the merge has to translate. The one key the page
 * also reads from a bundle (`layout.nav.sales_quotes`) comes from the real
 * locales.
 *
 * The clock is pinned to 2026-11-18 (only `Date` is faked, so Testing Library's
 * timers still run): 已过期 / 超期未回 are calendar-day comparisons, the part of
 * the page easiest to get wrong, and 新建 opens on 2026-12-02.
 */

const WS = "ws-1";
const NOW = new Date(2026, 10, 18, 15, 0, 0);

const api = vi.hoisted(() => ({
  listBdQuotes: vi.fn(),
  listCreators: vi.fn(),
  createBdQuote: vi.fn(),
  updateBdQuote: vi.fn(),
  deleteBdQuote: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Who the reader is: the one input that decides whether the page writes at all.
const viewer = vi.hoisted(() => ({
  role: "admin" as "owner" | "admin" | "member" | null,
}));

vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: "user-1",
    role: viewer.role,
    member: null,
    isLoading: false,
  }),
}));

function creator(id: string, displayName: string): Creator {
  return {
    id,
    workspace_id: WS,
    kind: "external",
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
    display_name: displayName,
  };
}

let quoteSeq = 0;

function quote(overrides: Partial<BdQuote> = {}): BdQuote {
  quoteSeq += 1;
  return {
    id: `q-${quoteSeq}`,
    workspace_id: WS,
    creator_id: "c-1",
    brief_id: null,
    status: "sent",
    quoted_at: "2026-11-10T02:00:00Z",
    valid_until: "2026-12-02",
    fee_amount: 8000,
    commission_rate: 0.2,
    currency: "CNY",
    items: [{ name: "短视频 1 条", spec: "60s 口播", unit: "条", price: 8000, qty: 1 }],
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-10T02:00:00Z",
    updated_at: "2026-11-10T02:00:00Z",
    ...overrides,
  };
}

function adapter(): NavigationAdapter {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    pathname: "/acme/sales/quotes",
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
        <SalesQuotesPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

/** The rows of the grid, without the sticky header row. */
function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

/** Open the creator picker and choose one, the way the sheet is used. */
async function pickCreator(name: RegExp) {
  await userEvent.click(screen.getByRole("button", { name: "Creator" }));
  await userEvent.click(await screen.findByRole("option", { name }));
}

function serve(rows: readonly BdQuote[], creators: readonly Creator[]) {
  api.listBdQuotes.mockResolvedValue({ quotes: [...rows], total: rows.length });
  api.listCreators.mockResolvedValue({
    creators: [...creators],
    total: creators.length,
    next_cursor: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  viewer.role = "admin";
  serve([], []);
  api.createBdQuote.mockResolvedValue(quote());
  api.updateBdQuote.mockResolvedValue(quote());
  api.deleteBdQuote.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SalesQuotesPage · 空", () => {
  it("says the ledger is empty instead of drawing an empty grid", async () => {
    renderPage();

    expect(await screen.findByText("No quotes yet")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
    // The way out is the header's one action, not a second button in the state.
    expect(screen.getByRole("button", { name: "New quote" })).toBeInTheDocument();
    // A batch of quotes is how the desk starts a month, so the import is here too.
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeInTheDocument();
  });
});

describe("SalesQuotesPage · 表格", () => {
  it("draws one row per quote and prints the stored ratio as a percentage", async () => {
    serve(
      [
        // Distinct creation days: the newest-first order is the one asserted.
        quote({
          id: "q-a",
          creator_id: "c-1",
          fee_amount: 8000,
          commission_rate: 0.2,
          created_at: "2026-11-11T02:00:00Z",
        }),
        quote({
          id: "q-b",
          creator_id: "c-2",
          status: "draft",
          fee_amount: null,
          commission_rate: null,
          valid_until: null,
          items: [],
          created_at: "2026-11-10T02:00:00Z",
        }),
      ],
      [creator("c-1", "Lin Wei"), creator("c-2", "Zhang Yu")],
    );
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    const [first, second] = bodyRows();

    // 0.2 stored, 20.0% shown — one decimal, and never 0.2%.
    expect(first).toHaveTextContent("Lin Wei");
    expect(first).toHaveTextContent("20.0%");
    expect(first).toHaveTextContent("¥8,000");
    expect(first).toHaveTextContent("1 line");
    expect(first).toHaveTextContent("短视频 1 条 · 60s 口播");

    // A pure-commission draft: no fee, no rate, no expiry, no breakdown — four
    // dashes, and never a ¥0 that would claim the fee was free.
    expect(second).toHaveTextContent("Zhang Yu");
    expect(second).toHaveTextContent("Draft");
    expect(second).not.toHaveTextContent("¥0");
    expect(within(second!).getAllByText("—")).toHaveLength(4);
  });
});

describe("SalesQuotesPage · 过期的两种说法", () => {
  it("tells a stored expired row from a sent row whose day has passed", async () => {
    serve(
      [
        // Distinct creation days, so the newest-first order is the one asserted.
        quote({
          id: "q-expired",
          status: "expired",
          valid_until: "2026-11-01",
          created_at: "2026-11-03T02:00:00Z",
        }),
        quote({
          id: "q-overdue",
          status: "sent",
          valid_until: "2026-11-17",
          created_at: "2026-11-02T02:00:00Z",
        }),
        quote({
          id: "q-open",
          status: "sent",
          valid_until: "2026-11-18",
          created_at: "2026-11-01T02:00:00Z",
        }),
      ],
      [creator("c-1", "Lin Wei")],
    );
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    const [expired, overdue, open] = bodyRows();

    const expiredMarker = within(expired!).getByText("Expired", {
      selector: "[data-validity]",
    });
    expect(expiredMarker).toBeInTheDocument();
    expect(expiredMarker).toHaveClass("text-destructive");

    // 超期未回: still sent, day behind us — the row that needs a call.
    expect(within(overdue!).getByText("Past due")).toBeInTheDocument();
    // Today is not late: the day has to be behind us.
    expect(within(open!).queryByText("Past due")).toBeNull();
    expect(within(open!).getByText("2026-11-18")).toBeInTheDocument();
  });
});

describe("SalesQuotesPage · 日期拦截", () => {
  it("refuses a valid-until day before the quote day without sending anything", async () => {
    serve([], [creator("c-1", "Lin Wei")]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "New quote" }));
    await pickCreator(/Lin Wei/);
    fireEvent.change(screen.getByLabelText("Valid until"), { target: { value: "2026-11-17" } });
    await userEvent.click(screen.getByRole("button", { name: "Save and send" }));

    expect(
      await screen.findByText(/The valid-until day is before the quote day/),
    ).toBeInTheDocument();
    expect(api.createBdQuote).not.toHaveBeenCalled();
  });
});

describe("SalesQuotesPage · 佣金率换算", () => {
  it("sends 0.2 for a 20% field, never 20", async () => {
    serve([], [creator("c-1", "Lin Wei")]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "New quote" }));
    await pickCreator(/Lin Wei/);
    await userEvent.type(screen.getByLabelText("Slot fee"), "8000");
    await userEvent.type(screen.getByLabelText("Commission"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => expect(api.createBdQuote).toHaveBeenCalledTimes(1));
    const payload = api.createBdQuote.mock.calls[0]![0];
    expect(payload.creator_id).toBe("c-1");
    expect(payload.commission_rate).toBe(0.2);
    expect(payload.fee_amount).toBe(8000);
    expect(payload.status).toBe("draft");
    // A draft has not been sent: the date rule has nothing to compare it to.
    expect(payload.quoted_at).toBeNull();
    expect(payload.valid_until).toBe("2026-12-02");
  });
});

describe("SalesQuotesPage · 明细", () => {
  it("adds the line totals into the subtotal under the rows", async () => {
    serve([], [creator("c-1", "Lin Wei")]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "New quote" }));
    await userEvent.click(screen.getByRole("button", { name: "Add line" }));
    await userEvent.type(screen.getByLabelText("Line 1 price"), "3000");
    await userEvent.type(screen.getByLabelText("Line 1 qty"), "1");
    await userEvent.type(screen.getByLabelText("Line 2 price"), "1200");
    await userEvent.type(screen.getByLabelText("Line 2 qty"), "2");

    // 3000 × 1 + 1200 × 2 = 5400. The sheet is a portal, so it is read from the
    // document rather than the render container.
    const subtotal = document.querySelector('[data-slot="quotes-subtotal"]');
    expect(subtotal).toHaveTextContent("5,400");
  });

  it("keeps the typed lines in the request and drops an untouched row", async () => {
    serve([], [creator("c-1", "Lin Wei")]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "New quote" }));
    await pickCreator(/Lin Wei/);
    await userEvent.type(screen.getByLabelText("Line 1 name"), "探店 1 条");
    await userEvent.type(screen.getByLabelText("Line 1 price"), "5000");
    await userEvent.type(screen.getByLabelText("Line 1 qty"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => expect(api.createBdQuote).toHaveBeenCalledTimes(1));
    expect(api.createBdQuote.mock.calls[0]![0].items).toEqual([
      { name: "探店 1 条", spec: "", unit: "", price: 5000, qty: 1 },
    ]);
  });
});

describe("SalesQuotesPage · 行内动作", () => {
  it("marks a quote accepted with a PATCH of its status", async () => {
    serve([quote({ id: "q-1" })], [creator("c-1", "Lin Wei")]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    await userEvent.click(within(bodyRows()[0]!).getByRole("button", { name: "Quote actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Mark accepted" }));

    await waitFor(() =>
      expect(api.updateBdQuote).toHaveBeenCalledWith("q-1", { status: "accepted" }),
    );
  });
});

describe("SalesQuotesPage · 加载与错误", () => {
  it("draws the grid's skeleton while the ledger is on its way", async () => {
    api.listBdQuotes.mockImplementation(() => new Promise(() => {}));
    renderPage();

    const grid = await screen.findByRole("grid", { name: "Quotes" });
    expect(grid).toHaveAttribute("aria-busy", "true");
    expect(bodyRows()).toHaveLength(0);
  });

  it("states the failure once for the page and retries it", async () => {
    api.listBdQuotes.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByText("Couldn't load quotes")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();

    api.listBdQuotes.mockResolvedValue({ quotes: [], total: 0 });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No quotes yet")).toBeInTheDocument();
  });
});

describe("SalesQuotesPage · 长文本", () => {
  it("truncates a long name and a long note, keeping both whole on hover", async () => {
    const longName = `${"长".repeat(40)}昵称`;
    const longNote = `${"备".repeat(80)}注`;
    serve([quote({ id: "q-1", note: longNote })], [creator("c-1", longName)]);
    renderPage();

    const cell = await screen.findByText(longName);
    expect(cell).toHaveAttribute("title", longName);
    expect(cell).toHaveClass("truncate");

    const note = screen.getByText(longNote);
    expect(note).toHaveAttribute("title", longNote);
    expect(note).toHaveClass("truncate");
  });
});

describe("SalesQuotesPage · 无写权限", () => {
  it("draws the ledger but neither the create action nor the row actions", async () => {
    viewer.role = null;
    serve([quote({ id: "q-1" })], [creator("c-1", "Lin Wei")]);
    renderPage();

    expect(await screen.findByText("Lin Wei")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New quote" })).toBeNull();
    // The batch import is a write too, and goes with it.
    expect(screen.queryByRole("button", { name: "Import CSV" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Quote actions" })).toBeNull();
  });
});

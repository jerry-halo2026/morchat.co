import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BdQuote, Creator } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { ApiError, StaleWriteError } from "@morechat/core/api";
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

// The real module is kept for `StaleWriteError` / `isStaleWrite`: the mutation
// hooks in `@morechat/core/bd` judge a 409 with the same function this page does,
// so replacing the whole module would replace the rule under test.
vi.mock("@morechat/core/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@morechat/core/api")>()),
  api,
}));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

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

function adapter(params: Record<string, string> = {}): NavigationAdapter {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    pathname: "/acme/sales/quotes",
    searchParams: new URLSearchParams(params),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderPage(params?: Record<string, string>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // The page's own cache, so a test can read the row a 409 wrote into it.
  queryClient = client;
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <NavigationProvider value={adapter(params)}>
        <SalesQuotesPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

/** The QueryClient of the last rendered page. */
let queryClient: QueryClient;

/** The rows of the grid, without the sticky header row. */
function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

/** Open the creator picker and choose one, the way the sheet is used. */
async function pickCreator(name: RegExp) {
  await userEvent.click(screen.getByRole("button", { name: "Creator" }));
  await userEvent.click(await screen.findByRole("option", { name }));
}

/**
 * What the ledger answers *now*. A row action writes through the server, so a
 * `409`'s reread has to see the other writer's row, not the one the page first
 * read; the page never patches the list itself.
 */
let servedQuotes: BdQuote[] = [];

function setServed(next: readonly BdQuote[]) {
  servedQuotes = [...next];
}

function serve(rows: readonly BdQuote[], creators: readonly Creator[]) {
  setServed(rows);
  api.listBdQuotes.mockImplementation(async () => ({
    quotes: [...servedQuotes],
    total: servedQuotes.length,
  }));
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

describe("SalesQuotesPage · 行内动作 · 并发 (§3)", () => {
  /** Open the one row's menu and press one of its items. */
  async function press(label: string) {
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    await userEvent.click(within(bodyRows()[0]!).getByRole("button", { name: "Quote actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: label }));
  }

  /** The row the page's cache holds for `id` — what a 409 wrote or the reread brought. */
  function cachedQuote(id: string): BdQuote | undefined {
    return queryClient
      .getQueriesData<{ quotes: BdQuote[] }>({ queryKey: ["bd", WS, "quotes"] })
      .flatMap(([, data]) => data?.quotes ?? [])
      .find((row) => row.id === id);
  }

  it("marks accepted with the revision it read, and takes the server's row on a 409", async () => {
    serve([quote({ id: "q-1", status: "sent", revision: 3 })], [creator("c-1", "Lin Wei")]);
    // Somebody else answered the offer while this menu was open.
    const current = quote({ id: "q-1", status: "rejected", revision: 4 });
    api.updateBdQuote.mockImplementationOnce(async () => {
      setServed([current]);
      throw new StaleWriteError("conflict", current);
    });
    renderPage();
    await press("Mark accepted");

    // 别人刚改过，已为你刷新.
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/Someone else just changed this/)),
    );
    // The guard travelled with the write, and the write was not sent again.
    expect(api.updateBdQuote).toHaveBeenCalledTimes(1);
    expect(api.updateBdQuote.mock.calls[0]![1]).toEqual({
      status: "accepted",
      expected_revision: 3,
    });
    // The server's row is what the page holds and draws now.
    expect(cachedQuote("q-1")).toMatchObject({ status: "rejected", revision: 4 });
    await waitFor(() =>
      expect(document.querySelector('[data-status="rejected"]')).not.toBeNull(),
    );

    // An answered quote offers no second decision: the row state moved with the refresh.
    await userEvent.click(within(bodyRows()[0]!).getByRole("button", { name: "Quote actions" }));
    expect(await screen.findByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Mark accepted" })).toBeNull();
  });

  it("marks rejected with the revision it read, and takes the server's row on a 409", async () => {
    serve([quote({ id: "q-1", status: "sent", revision: 7 })], [creator("c-1", "Lin Wei")]);
    const current = quote({ id: "q-1", status: "accepted", revision: 8 });
    api.updateBdQuote.mockImplementationOnce(async () => {
      setServed([current]);
      throw new StaleWriteError("conflict", current);
    });
    renderPage();
    await press("Mark rejected");

    await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
    expect(api.updateBdQuote).toHaveBeenCalledTimes(1);
    expect(api.updateBdQuote.mock.calls[0]![1]).toEqual({
      status: "rejected",
      expected_revision: 7,
    });
    expect(cachedQuote("q-1")).toMatchObject({ status: "accepted", revision: 8 });
    await waitFor(() =>
      expect(document.querySelector('[data-status="accepted"]')).not.toBeNull(),
    );
  });

  it("deletes once, and on a 409 keeps the row and shows the server's copy", async () => {
    serve([quote({ id: "q-1", status: "sent", revision: 2 })], [creator("c-1", "Lin Wei")]);
    const current = quote({ id: "q-1", status: "accepted", revision: 3 });
    api.deleteBdQuote.mockImplementationOnce(async () => {
      setServed([current]);
      throw new StaleWriteError("conflict", current);
    });
    renderPage();
    await press("Delete");
    // The confirmation asks once; a refusal closes it rather than leaving the same
    // click loaded for a second press.
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
    expect(api.deleteBdQuote).toHaveBeenCalledTimes(1);
    expect(api.deleteBdQuote).toHaveBeenCalledWith("q-1");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    // Nothing left the ledger: the row is still there, reading the server's answer.
    expect(bodyRows()).toHaveLength(1);
    expect(cachedQuote("q-1")).toMatchObject({ status: "accepted", revision: 3 });
    expect(document.querySelector('[data-status="accepted"]')).not.toBeNull();
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

describe("SalesQuotesPage · 深链 ?quote=", () => {
  it("scrolls to the linked row and marks it, so the notice lands somewhere", async () => {
    serve(
      [
        quote({ id: "q-new", created_at: "2026-11-11T02:00:00Z" }),
        quote({ id: "q-old", creator_id: "c-2", created_at: "2026-11-10T02:00:00Z" }),
      ],
      [creator("c-1", "Lin Wei"), creator("c-2", "Zhang Yu")],
    );
    // jsdom has no layout; the row that is scrolled is the fact under test.
    const scrolled: Element[] = [];
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(function (this: Element) {
        scrolled.push(this);
      });

    renderPage({ quote: "q-old" });

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    const target = bodyRows().find((row) => row.getAttribute("data-row-id") === "q-old")!;
    await waitFor(() => expect(target).toHaveClass("ring-ring/50"));
    expect(scrolled).toContain(target);
    // The other row is not marked: one link, one row.
    const other = bodyRows().find((row) => row.getAttribute("data-row-id") === "q-new")!;
    expect(other).not.toHaveClass("ring-ring/50");

    scrollIntoView.mockRestore();
  });

  it("says the linked row is not in the current results instead of staying silent", async () => {
    serve([quote({ id: "q-1" })], [creator("c-1", "Lin Wei")]);
    renderPage({ quote: "q-elsewhere" });

    expect(await screen.findByRole("status")).toHaveTextContent(
      /That row isn't in the current results/,
    );
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(bodyRows()[0]).not.toHaveClass("ring-ring/50");
  });
});

describe("SalesQuotesPage · 并发 (§3)", () => {
  /** Open the edit drawer on the one row the test served. */
  async function openDrawer() {
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    fireEvent.click(within(bodyRows()[0]!).getByText("Lin Wei"));
    await screen.findByRole("heading", { name: "Edit quote" });
  }

  it("sends the revision it read with the edit", async () => {
    serve([quote({ id: "q-1", revision: 4, fee_amount: 8000 })], [creator("c-1", "Lin Wei")]);
    renderPage();
    await openDrawer();

    fireEvent.change(screen.getByLabelText("Slot fee"), { target: { value: "9000" } });
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => expect(api.updateBdQuote).toHaveBeenCalledTimes(1));
    const [id, body] = api.updateBdQuote.mock.calls[0]!;
    expect(id).toBe("q-1");
    // The row this drawer opened on says revision 4; the PATCH says the same.
    expect(body.expected_revision).toBe(4);
    expect(body.fee_amount).toBe(9000);
  });

  it("shows the server's row on a 409 instead of resending its own body", async () => {
    serve([quote({ id: "q-1", revision: 4, fee_amount: 8000 })], [creator("c-1", "Lin Wei")]);
    // Somebody else raised the fee while this drawer was open.
    const current = quote({
      id: "q-1",
      revision: 5,
      fee_amount: 5000,
      note: "the other writer's note",
    });
    api.updateBdQuote.mockRejectedValueOnce(new StaleWriteError("conflict", current));
    renderPage();
    await openDrawer();

    fireEvent.change(screen.getByLabelText("Slot fee"), { target: { value: "9000" } });
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /Someone else just changed this/,
    );
    // The form is the server's row now — not 9000, not a replay.
    expect(screen.getByLabelText("Slot fee")).toHaveValue("5000");
    expect(screen.getByLabelText("Note")).toHaveValue("the other writer's note");
    expect(api.updateBdQuote).toHaveBeenCalledTimes(1);

    // And the next save is guarded by the revision the refresh brought in.
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(api.updateBdQuote).toHaveBeenCalledTimes(2));
    expect(api.updateBdQuote.mock.calls[1]![1].expected_revision).toBe(5);
  });

  it("judges the stale write before the overwrite reason", async () => {
    serve([quote({ id: "q-1", revision: 4 })], [creator("c-1", "Lin Wei")]);
    api.updateBdQuote.mockRejectedValueOnce(
      new StaleWriteError("conflict", quote({ id: "q-1", revision: 5, fee_amount: 5000 })),
    );
    renderPage();
    await openDrawer();

    fireEvent.change(screen.getByLabelText("Slot fee"), { target: { value: "9000" } });
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    // A 409 is a refresh, never §26.3's question.
    await screen.findByRole("status");
    expect(screen.queryByText("Why are you changing this?")).toBeNull();

    // …and a 400 that does ask the question refreshes nothing: the figure the
    // reader typed is still theirs, and the refresh notice is gone.
    api.updateBdQuote.mockRejectedValueOnce(
      new ApiError("overwrite_reason_required", 400, "Bad Request", {
        error: "overwrite_reason_required",
      }),
    );
    fireEvent.change(screen.getByLabelText("Slot fee"), { target: { value: "7000" } });
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    expect(await screen.findByText("Why are you changing this?")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Slot fee")).toHaveValue("7000");
  });
});

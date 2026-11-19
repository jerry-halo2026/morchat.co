import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  AffiliateSummaryResponse,
  WorkbenchFinanceMonth,
  WorkbenchFinanceResponse,
} from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { BossBizPage } from "../boss-biz-page";

/**
 * 经营数据 (`/{slug}/boss/biz`) — the month picker, the month's six figures, the
 * six-month trend, the cost entry and the affiliate blocks.
 *
 * The behaviours under test are the ones the page exists for: picking a month
 * re-reads every block for it, a past month shows its own money instead of 数据不足,
 * a month with no data says which input is missing, the cost dialog writes the
 * month that is on screen, and the affiliate blocks are never added together.
 */

const WS = "ws-1";
/** What the browser clock says; the "current" (parameter-less) read answers for it. */
const CURRENT_MONTH = "2026-11";

const api = vi.hoisted(() => ({
  getWorkbenchFinance: vi.fn(),
  listWorkbenchFinanceMonths: vi.fn(),
  getAffiliateSummary: vi.fn(),
  upsertWorkbenchFinanceMonth: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** A month whose aggregate answered but has nothing behind it. */
function blank(month: string): WorkbenchFinanceResponse {
  const gap = { value: null, sample_count: 0, empty: "insufficient_data" as const };
  return {
    window: { month },
    signed: gap,
    collected: gap,
    gross_margin: { ...gap, basis: "none" },
    receivable_days: gap,
    cash_floor: { ...gap, basis: "none" },
  };
}

function finance(
  month: string,
  figures: { signed?: number | null; collected?: number | null; cash?: number | null },
): WorkbenchFinanceResponse {
  const stated = (value: number | null) =>
    value === null
      ? { value: null, sample_count: 0, empty: "insufficient_data" as const }
      : { value, sample_count: 1, empty: "zero" as const };
  return {
    window: { month },
    signed: stated(figures.signed ?? null),
    collected: stated(figures.collected ?? null),
    gross_margin: { value: 0.66, sample_count: 1, empty: "zero", basis: "entered" },
    receivable_days: { value: 12.5, sample_count: 2, empty: "zero" },
    cash_floor: { ...stated(figures.cash ?? null), basis: "entered" },
  };
}

function month(overrides: Partial<WorkbenchFinanceMonth> = {}): WorkbenchFinanceMonth {
  return {
    id: "m-1",
    workspace_id: WS,
    month: `${CURRENT_MONTH}-01`,
    cash_open: 900,
    fixed_cost: 600,
    variable_cost: 400,
    note: null,
    created_by: null,
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    ...overrides,
  };
}

function summary(overrides: Partial<AffiliateSummaryResponse> = {}): AffiliateSummaryResponse {
  const block = (value: number | null) =>
    value === null
      ? { value: null, sample_count: 0, empty: "insufficient_data" as const }
      : { value, sample_count: 1, empty: "zero" as const };
  return {
    window: { month: CURRENT_MONTH },
    gmv: block(2000),
    commission_est: block(400),
    commission_settled: block(160),
    commission_agency: block(440),
    commission_creator: block(60),
    agency_share_income: block(40),
    refund_rate: block(0.05),
    tech_fee: block(null),
    pick_count: block(1),
    active_creator_count: block(1),
    ...overrides,
  };
}

function adapter(): NavigationAdapter {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    pathname: "/acme/boss/biz",
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
        <BossBizPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

/** One block, by its heading — the page draws four of them. */
function block(title: RegExp): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const section = heading.closest("section");
  if (!section) throw new Error("block not found");
  return section as HTMLElement;
}

/**
 * The block once its read has answered: the heading is on screen while the block
 * is still a skeleton, so each assertion waits for a string the block itself
 * renders first.
 */
async function blockWhen(title: RegExp, text: string): Promise<HTMLElement> {
  await waitFor(
    () => expect(within(block(title)).getAllByText(text).length).toBeGreaterThan(0),
    // The first render of this page compiles four blocks and answers eight reads;
    // the default 1s window is too short for the first test in the file.
    { timeout: 8000 },
  );
  return block(title);
}

/** Choose a month in the header's picker, the way a reader does. */
async function pickMonth(label: string) {
  // Base UI's select trigger is the combobox, named by the picker's aria-label.
  await userEvent.click(screen.getByRole("combobox", { name: "Month" }));
  await userEvent.click(await screen.findByRole("option", { name: label }));
}

/**
 * The finance endpoint answers per month: the key of the map is the `?month=`
 * value, `"current"` is the parameter-less read.
 */
function serveFinances(map: Record<string, WorkbenchFinanceResponse>) {
  api.getWorkbenchFinance.mockImplementation((params?: { month?: string | null }) => {
    const key = params?.month ?? "current";
    if (key === "missing") return Promise.reject(new Error("boom"));
    return Promise.resolve(map[key] ?? blank(params?.month ?? CURRENT_MONTH));
  });
}

function serveAffiliate(money = summary()) {
  api.getAffiliateSummary.mockResolvedValue(money);
}

const MONEY = { selector: "[data-slot=figure-money]" } as const;
const MISSING = { selector: "[data-slot=figure-missing]" } as const;
const UNRECORDED = { selector: "[data-slot=figure-unrecorded]" } as const;

/**
 * The entered months. `GET /finance/months` answers one row when a month is asked
 * for and the whole history when it is not — the trend reads the history, the cost
 * block reads one row.
 */
const ENTRIES: Record<string, WorkbenchFinanceMonth> = {
  [CURRENT_MONTH]: month(),
  "2026-10": month({
    id: "m-10",
    month: "2026-10-01",
    cash_open: 700,
    fixed_cost: 500,
    variable_cost: 300,
  }),
  // An entry whose amounts were never filled in: 数据不足, not a zero.
  "2026-08": month({
    id: "m-08",
    month: "2026-08-01",
    cash_open: null,
    fixed_cost: null,
    variable_cost: null,
  }),
};

beforeEach(() => {
  // The current month: a full entry, real money. 2026-09 answered with nothing.
  serveFinances({
    current: finance(CURRENT_MONTH, { signed: 5000, collected: 3000, cash: 2600 }),
    "2026-10": finance("2026-10", { signed: 4000, collected: 2500, cash: 1800 }),
    "2026-09": blank("2026-09"),
  });
  api.listWorkbenchFinanceMonths.mockImplementation((params?: { month?: string | null }) => {
    if (params?.month) {
      const entry = ENTRIES[params.month];
      return Promise.resolve({ months: entry ? [entry] : [], total: entry ? 1 : 0 });
    }
    return Promise.resolve({
      months: Object.values(ENTRIES),
      total: Object.keys(ENTRIES).length,
    });
  });
  api.upsertWorkbenchFinanceMonth.mockResolvedValue(month());
  serveAffiliate();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BossBizPage · 本月", () => {
  it("omits the month for 本月 and prints the answered month's figures", async () => {
    renderPage();

    const thisMonth = await blockWhen(/^Month$/, "¥5,000");
    expect(within(thisMonth).getAllByText("¥5,000", MONEY)).toHaveLength(1);
    expect(within(thisMonth).getAllByText("¥3,000", MONEY)).toHaveLength(1);
    // 600 + 400 from the month's own entry.
    expect(within(thisMonth).getAllByText("¥1,000", MONEY)).toHaveLength(1);
    // 已回款 − 成本: the overview's own margin, in money and not as a ratio.
    expect(within(thisMonth).getAllByText("¥2,000", MONEY)).toHaveLength(1);
    // The block's count is the month the server sliced.
    expect(within(thisMonth).getByText(CURRENT_MONTH)).toBeInTheDocument();

    // No `?month=` for 本月: the contract's default read.
    expect(api.getWorkbenchFinance).toHaveBeenCalledWith({ department_id: null });
    // The affiliate summary is the one read with no per-month fan-out, so it says
    // plainly whether a month was sent.
    expect(api.getAffiliateSummary).toHaveBeenCalledWith({ month: null, department_id: null });
  });
});

describe("BossBizPage · 切月", () => {
  it("re-reads the finance aggregate for the chosen month", async () => {
    renderPage();
    await blockWhen(/^Month$/, "¥5,000");

    await pickMonth("2026-10");

    await waitFor(() =>
      expect(api.getWorkbenchFinance).toHaveBeenCalledWith({
        department_id: null,
        month: "2026-10",
      }),
    );
  });

  it("shows a past month's own money instead of 数据不足", async () => {
    renderPage();
    await blockWhen(/^Month$/, "¥5,000");

    await pickMonth("2026-10");

    const october = await blockWhen(/^Month$/, "¥4,000");
    expect(within(october).getByText("2026-10")).toBeInTheDocument();
    expect(within(october).getAllByText("¥4,000", MONEY)).toHaveLength(1);
    expect(within(october).getAllByText("¥2,500", MONEY)).toHaveLength(1);
    // 500 + 300 from October's entry, and 2500 − 800 keeps its margin.
    expect(within(october).getAllByText("¥800", MONEY)).toHaveLength(1);
    expect(within(october).getAllByText("¥1,700", MONEY)).toHaveLength(1);

    // The trend follows the picker: its window now ends at October and October's
    // row carries the same numbers.
    const trend = await blockWhen(/^Monthly trend$/, "2026-05");
    const row = trend.querySelector('[data-month="2026-10"]') as HTMLElement;
    expect(within(row).getAllByText("¥4,000", MONEY)).toHaveLength(1);
    expect(trend.querySelector('[data-month="2026-11"]')).toBeNull();
  });

  it("reads the affiliate summary for the same month", async () => {
    renderPage();
    await blockWhen(/^Month$/, "¥5,000");

    await pickMonth("2026-10");

    await waitFor(() =>
      expect(api.getAffiliateSummary).toHaveBeenCalledWith({
        month: "2026-10",
        department_id: null,
      }),
    );
  });
});

describe("BossBizPage · 缺月", () => {
  it("says 没成交 when the month answered without money", async () => {
    renderPage();
    await blockWhen(/^Month$/, "¥5,000");

    await pickMonth("2026-09");

    const september = await blockWhen(/^Month$/, "Not enough data");
    expect(within(september).getAllByText("Not enough data", MISSING).length).toBeGreaterThan(0);
    // The two absences are named apart: nothing cleared, and no cost was entered.
    expect(
      within(september).getByText(/No money cleared this month/),
    ).toBeInTheDocument();
    expect(within(september).queryAllByText("¥0", MONEY)).toHaveLength(0);
  });

  it("marks a month nobody entered as 未录入, not as a zero", async () => {
    renderPage();

    const trend = await blockWhen(/^Monthly trend$/, "2026-06");
    // 2026-06, 07 and 09 have no `ops_finance_month` row at all.
    expect(within(trend).getAllByText("Not entered", UNRECORDED)).toHaveLength(3);
    // 2026-08 has a row whose amounts are blank: the same cell says 数据不足.
    const august = trend.querySelector('[data-month="2026-08"]') as HTMLElement;
    expect(august.querySelector('[data-cost-state="insufficient"]')).not.toBeNull();
    const september = trend.querySelector('[data-month="2026-09"]') as HTMLElement;
    expect(september.querySelector('[data-cost-state="unrecorded"]')).not.toBeNull();
    expect(within(trend).queryAllByText("¥0", MONEY)).toHaveLength(0);
  });
});

describe("BossBizPage · 成本录入", () => {
  it("opens the dialog on the selected month, prefilled from that month's row", async () => {
    renderPage();
    await blockWhen(/^Month$/, "¥5,000");

    await pickMonth("2026-10");
    const cost = await blockWhen(/^Cost detail$/, "Fixed cost");

    const enter = within(cost).getAllByRole("button", { name: /enter cost/i })[0]!;
    await userEvent.click(enter);
    // The dialog names the month it will write, and it is the one on screen.
    expect(await screen.findByText("Enter 2026-10 cost")).toBeInTheDocument();
    // …and it prefills October's stored row, not November's.
    await waitFor(() => expect(screen.getByLabelText("Fixed cost")).toHaveValue(500));
    expect(screen.getByLabelText("Opening cash")).toHaveValue(700);

    await userEvent.clear(screen.getByLabelText("Fixed cost"));
    await userEvent.type(screen.getByLabelText("Fixed cost"), "1200");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.upsertWorkbenchFinanceMonth).toHaveBeenCalledTimes(1));
    // PUT replaces the month, so the untouched halves go back as they were.
    expect(api.upsertWorkbenchFinanceMonth.mock.calls[0]![0]).toEqual({
      month: "2026-10-01",
      cash_open: 700,
      fixed_cost: 1200,
      variable_cost: 300,
      note: null,
    });
  });

  it("writes the selected month even when nothing was entered for it", async () => {
    renderPage();
    await blockWhen(/^Month$/, "¥5,000");

    await pickMonth("2026-09");
    const cost = await blockWhen(/^Cost detail$/, "No cost or cash entered");
    expect(within(cost).getByText("No cost or cash entered")).toBeInTheDocument();

    // The empty state carries its own entry button; the block header carries the
    // other. Either opens the same dialog on the same month.
    await userEvent.click(
      within(cost).getAllByRole("button", { name: /enter cost/i })[0]!,
    );
    expect(await screen.findByText("Enter 2026-09 cost")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Fixed cost"), "1200");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.upsertWorkbenchFinanceMonth).toHaveBeenCalledTimes(1));
    // A field left blank is "not recorded", so it goes out as null and the server
    // stores NULL rather than 0.
    expect(api.upsertWorkbenchFinanceMonth.mock.calls[0]![0]).toEqual({
      month: "2026-09-01",
      cash_open: null,
      fixed_cost: 1200,
      variable_cost: null,
      note: null,
    });
  });
});

describe("BossBizPage · 联盟收入", () => {
  it("prints the three income blocks separately and never their sum", async () => {
    renderPage();

    const affiliate = await blockWhen(/^Affiliate income$/, "¥440");
    expect(within(affiliate).getByText("Agency commission")).toBeInTheDocument();
    expect(within(affiliate).getByText("Creator commission")).toBeInTheDocument();
    expect(within(affiliate).getByText("Settled commission")).toBeInTheDocument();
    expect(within(affiliate).getAllByText("¥60", MONEY)).toHaveLength(1);
    // 440 + 60 would report income that never reached us.
    expect(within(affiliate).queryAllByText("¥500", MONEY)).toHaveLength(0);
    expect(
      within(affiliate).getAllByText("5%", { selector: "[data-slot=figure-percent]" }),
    ).toHaveLength(1);
  });

  it("keeps a block with no rows at 数据不足", async () => {
    serveAffiliate(
      summary({ commission_agency: { value: null, sample_count: 0, empty: "insufficient_data" } }),
    );
    renderPage();

    const affiliate = await blockWhen(/^Affiliate income$/, "¥60");
    expect(within(affiliate).getAllByText("Not enough data", MISSING)).toHaveLength(1);
  });
});

describe("BossBizPage · 服务端不认这个月", () => {
  it("says so instead of printing one month under another's label", async () => {
    // A server that ignores `?month=` answers with its own current month.
    api.getWorkbenchFinance.mockResolvedValue(
      finance(CURRENT_MONTH, { signed: 5000, collected: 3000, cash: 2600 }),
    );
    renderPage();
    await blockWhen(/^Month$/, "¥5,000");

    await pickMonth("2026-10");

    expect(
      await screen.findByText("The server answered for 2026-11, not 2026-10."),
    ).toBeInTheDocument();
    // The numbers still describe the month the server actually sliced.
    const monthBlock = await blockWhen(/^Month$/, "¥5,000");
    expect(within(monthBlock).getByText(CURRENT_MONTH)).toBeInTheDocument();
  });
});

describe("BossBizPage · 块级错误隔离", () => {
  it("draws a failing block as an error and keeps the rest of the page", async () => {
    api.getWorkbenchFinance.mockRejectedValue(new Error("boom"));
    api.listWorkbenchFinanceMonths.mockResolvedValue({ months: [], total: 0 });
    api.getAffiliateSummary.mockResolvedValue(summary());
    renderPage();

    expect((await screen.findAllByText("This block didn’t load.")).length).toBeGreaterThan(0);
    // Every block keeps its heading: one dead endpoint did not take the page down.
    expect(screen.getByRole("heading", { name: /^Month$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Monthly trend$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Affiliate income$/ })).toBeInTheDocument();
  });
});

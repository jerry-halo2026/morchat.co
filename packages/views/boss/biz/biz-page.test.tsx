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
 * 经营数据 (`/{slug}/boss/biz`) — the month's six figures, the six-month trend, the
 * cost entry and the affiliate blocks.
 *
 * Three rules are what the page exists for: a figure with nothing behind it says
 * 数据不足 / 未录入 instead of 0, the affiliate blocks are never added together, and
 * the cost write really sends `PUT /finance/months`. Figures are found by their
 * `data-slot` (not by their copy) so a word-for-word assertion cannot accidentally
 * match the tile that wraps them.
 */

const WS = "ws-1";

const api = vi.hoisted(() => ({
  getWorkbenchFinance: vi.fn(),
  listWorkbenchFinanceMonths: vi.fn(),
  getAffiliateSummary: vi.fn(),
  upsertWorkbenchFinanceMonth: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function finance(overrides: Partial<WorkbenchFinanceResponse> = {}): WorkbenchFinanceResponse {
  return {
    window: { month: "2026-11" },
    signed: { value: 5000, sample_count: 2, empty: "zero" },
    collected: { value: 3000, sample_count: 1, empty: "zero" },
    gross_margin: { value: 0.66, sample_count: 1, empty: "zero", basis: "entered" },
    receivable_days: { value: 12.5, sample_count: 2, empty: "zero" },
    cash_floor: { value: 2600, sample_count: 1, empty: "zero", basis: "entered" },
    ...overrides,
  };
}

function month(overrides: Partial<WorkbenchFinanceMonth> = {}): WorkbenchFinanceMonth {
  return {
    id: "m-1",
    workspace_id: WS,
    month: "2026-11-01",
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
    window: { month: "2026-11" },
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
    // The first render of this page compiles four blocks and answers three queries;
    // the default 1s window is too short for the first test in the file.
    { timeout: 8000 },
  );
  return block(title);
}

function serve(figures: WorkbenchFinanceResponse, months: WorkbenchFinanceMonth[], money = summary()) {
  api.getWorkbenchFinance.mockResolvedValue(figures);
  api.listWorkbenchFinanceMonths.mockResolvedValue({ months: [...months], total: months.length });
  api.getAffiliateSummary.mockResolvedValue(money);
}

/** The figures themselves, not the tiles that wrap them. */
const MONEY = { selector: "[data-slot=figure-money]" } as const;
const MISSING = { selector: "[data-slot=figure-missing]" } as const;
const UNRECORDED = { selector: "[data-slot=figure-unrecorded]" } as const;

beforeEach(() => {
  serve(finance(), [month()]);
  api.upsertWorkbenchFinanceMonth.mockResolvedValue(month());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BossBizPage · 本月", () => {
  it("prints signed, collected, cost and the margin between the last two", async () => {
    renderPage();

    const thisMonth = await blockWhen(/^This month$/, "¥5,000");
    expect(within(thisMonth).getAllByText("¥5,000", MONEY)).toHaveLength(1);
    expect(within(thisMonth).getAllByText("¥3,000", MONEY)).toHaveLength(1);
    // 600 + 400 from the month's own entry.
    expect(within(thisMonth).getAllByText("¥1,000", MONEY)).toHaveLength(1);
    // 已回款 − 成本: the overview's own margin, in money and not as a ratio.
    expect(within(thisMonth).getAllByText("¥2,000", MONEY)).toHaveLength(1);
    expect(within(thisMonth).getAllByText("¥2,600", MONEY)).toHaveLength(1);
    expect(within(thisMonth).getAllByText("12.5d", { selector: "[data-slot=figure-days]" })).toHaveLength(
      1,
    );
  });

  it("says 数据不足 for a figure the server could not compute", async () => {
    serve(
      finance({
        collected: { value: null, sample_count: 0, empty: "insufficient_data" },
        cash_floor: { value: null, sample_count: 0, empty: "insufficient_data", basis: "none" },
      }),
      [month()],
    );
    renderPage();

    const thisMonth = await blockWhen(/^This month$/, "12.5d");
    // No money cleared: the collected tile, the margin it would feed and the cash
    // floor are three gaps, and none of them is a ¥0.
    expect(within(thisMonth).getAllByText("Not enough data", MISSING)).toHaveLength(3);
    expect(within(thisMonth).queryAllByText("¥0", MONEY)).toHaveLength(0);
  });
});

describe("BossBizPage · 月度趋势", () => {
  it("draws six months, marking the empty ones instead of zeroing them", async () => {
    serve(finance(), [
      month(),
      // A recorded month whose amounts were never filled in.
      month({
        id: "m-10",
        month: "2026-10-01",
        cash_open: null,
        fixed_cost: null,
        variable_cost: null,
      }),
    ]);
    renderPage();

    const trend = await blockWhen(/^Monthly trend$/, "2026-06");
    for (const label of ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]) {
      expect(within(trend).getByText(label)).toBeInTheDocument();
    }
    // 2026-06 … 2026-09 have no entry row at all: 未录入, not a 0.
    expect(within(trend).getAllByText("Not entered", UNRECORDED)).toHaveLength(4);
    // 2026-10 has a row with blank amounts, so its cost is 数据不足 — a different
    // absence from the month that was never touched.
    const october = trend.querySelector('[data-month="2026-10"]') as HTMLElement;
    expect(october.querySelector('[data-cost-state="insufficient"]')).not.toBeNull();
    const september = trend.querySelector('[data-month="2026-09"]') as HTMLElement;
    expect(september.querySelector('[data-cost-state="unrecorded"]')).not.toBeNull();
    // Only the aggregated month states revenue; the rest leave it as 数据不足.
    expect(within(trend).getAllByText("¥5,000", MONEY)).toHaveLength(1);
    expect(within(trend).queryAllByText("¥0", MONEY)).toHaveLength(0);
  });
});

describe("BossBizPage · 本月成本", () => {
  it("lists the two cost lines, the total and the opening cash", async () => {
    renderPage();

    const cost = await blockWhen(/cost$/i, "Fixed cost");
    expect(within(cost).getByText("Variable cost")).toBeInTheDocument();
    expect(within(cost).getByText("Total cost")).toBeInTheDocument();
    expect(within(cost).getAllByText("¥1,000", MONEY)).toHaveLength(1);
    expect(within(cost).getAllByText("¥900", MONEY)).toHaveLength(1);
  });

  it("says the month is not entered, and sends the whole entry when it is", async () => {
    serve(finance(), []);
    renderPage();

    const cost = await blockWhen(/cost$/i, "No cost or cash entered for this month");
    const enter = within(cost).getAllByRole("button", { name: /enter cost/i })[0]!;
    await userEvent.click(enter);
    await userEvent.type(await screen.findByLabelText("Fixed cost"), "1200");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.upsertWorkbenchFinanceMonth).toHaveBeenCalledTimes(1));
    // PUT replaces the month: a field left blank is "not recorded", so it goes out
    // as null and the server stores NULL rather than 0.
    expect(api.upsertWorkbenchFinanceMonth.mock.calls[0]![0]).toEqual({
      month: "2026-11-01",
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
    expect(within(affiliate).getAllByText("¥440", MONEY)).toHaveLength(1);
    expect(within(affiliate).getAllByText("¥60", MONEY)).toHaveLength(1);
    expect(within(affiliate).getAllByText("¥160", MONEY)).toHaveLength(1);
    // 440 + 60 would report income that never reached us.
    expect(within(affiliate).queryAllByText("¥500", MONEY)).toHaveLength(0);
    // The refund rate is stored 0–1 and printed at the 0–100 scale.
    expect(
      within(affiliate).getAllByText("5%", { selector: "[data-slot=figure-percent]" }),
    ).toHaveLength(1);
  });

  it("keeps a block with no rows at 数据不足", async () => {
    serve(
      finance(),
      [month()],
      summary({ commission_agency: { value: null, sample_count: 0, empty: "insufficient_data" } }),
    );
    renderPage();

    const affiliate = await blockWhen(/^Affiliate income$/, "¥60");
    expect(within(affiliate).getAllByText("Not enough data", MISSING)).toHaveLength(1);
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
    expect(screen.getByRole("heading", { name: /^This month$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Monthly trend$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Affiliate income$/ })).toBeInTheDocument();
  });
});

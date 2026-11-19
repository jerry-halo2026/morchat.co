import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type {
  BdPerformance,
  BdPerformanceMemberRow,
  BdPerformanceMonthRow,
  BdPipelineMoney,
  BdPipelineNumber,
  MemberWithUser,
} from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { SalesPerformancePage } from "../sales-performance-page";

/**
 * 业绩 (`/{slug}/sales/performance`) — one window, one currency, four blocks and
 * two dimension tables.
 *
 * The assertions are the sentences the page has to get right: the currency is
 * named once and never mixed, a rate prints as a percentage, a figure that is not
 * there prints the empty marker while a measured zero prints `0`, and an empty
 * window is its own page instead of four zeros.
 *
 * The clock is pinned to 2026-11-18 (only `Date` is faked, so Testing Library's
 * timers still run): 本月 is 2026-11-01…11-18 and 上月 is 2026-10-01…10-31.
 */

const WS = "ws-1";
const NOW = new Date(2026, 10, 18, 15, 0, 0);

const api = vi.hoisted(() => ({
  getBdPerformance: vi.fn(),
  listMembers: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
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
    pathname: "/acme/sales/performance",
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

function number(value: number | null, empty: "zero" | "insufficient_data" = "zero"): BdPipelineNumber {
  return { value, sample_count: value === null ? 0 : 1, empty };
}

function money(amount: number | null, currency = "CNY"): BdPipelineMoney {
  return {
    amount,
    currency,
    sample_count: amount === null ? 0 : 1,
    empty: amount === null ? "insufficient_data" : "zero",
  };
}

function memberRow(
  overrides: Partial<BdPerformanceMemberRow> & Pick<BdPerformanceMemberRow, "member_id">,
): BdPerformanceMemberRow {
  return {
    name: "",
    win_rate: null,
    signed_count: 0,
    signed_amount: null,
    delivered_count: 0,
    collected_count: 0,
    collected_amount: null,
    quote_sent: 0,
    quote_accepted: 0,
    quote_amount: null,
    followups: 0,
    replied: 0,
    meetings: 0,
    ...overrides,
  };
}

function monthRow(month: string, overrides: Partial<BdPerformanceMonthRow> = {}): BdPerformanceMonthRow {
  return {
    month,
    win_rate: null,
    signed_count: 0,
    signed_amount: null,
    delivered_count: 0,
    collected_count: 0,
    collected_amount: null,
    quote_sent: 0,
    quote_accepted: 0,
    quote_amount: null,
    followups: 0,
    replied: 0,
    meetings: 0,
    ...overrides,
  };
}

function report(overrides: Partial<BdPerformance> = {}): BdPerformance {
  return {
    from: "2026-11-01",
    to: "2026-11-18",
    currency: "CNY",
    empty: "zero",
    signed: { count: number(2), amount: money(30000) },
    delivered: { count: number(1), amount: money(30000) },
    collected: { count: number(1), amount: money(9000) },
    quotes: {
      sent: number(3),
      accepted: number(2),
      win_rate: number(0.6666),
      amount: money(12000),
    },
    followups: { count: number(5), replied: number(3), meetings: number(1) },
    affiliate: { agency: money(800), creator: money(1200), settled: money(600) },
    by_member: [
      memberRow({
        member_id: "member-1",
        name: "Lin Wei",
        win_rate: 0.5,
        signed_count: 2,
        signed_amount: 30000,
        collected_amount: 9000,
        quote_sent: 2,
        quote_accepted: 1,
        followups: 3,
      }),
      memberRow({
        member_id: "6b1d0f1e-0000-4000-8000-000000000000",
        name: "",
        signed_count: 1,
        signed_amount: null,
        quote_sent: 1,
        followups: 2,
      }),
    ],
    by_month: [
      monthRow("2026-11", { signed_count: 2, signed_amount: 30000 }),
      monthRow("2026-10", { signed_count: 1 }),
    ],
    ...overrides,
  };
}

const MEMBER: MemberWithUser = {
  id: "6b1d0f1e-0000-4000-8000-000000000000",
  workspace_id: WS,
  user_id: "user-9",
  role: "member",
  created_at: "2026-01-01T00:00:00Z",
  name: "Zhao Min",
  email: "zhao@example.test",
  avatar_url: null,
};

function serve(value: BdPerformance) {
  api.getBdPerformance.mockResolvedValue(value);
  api.listMembers.mockResolvedValue([MEMBER]);
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <SalesPerformancePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  serve(report());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SalesPerformancePage · 四组数字", () => {
  it("draws the window it asked for, the one currency and every block", async () => {
    renderPage();

    expect(await screen.findByText("2026-11-01 – 2026-11-18")).toBeInTheDocument();
    expect(
      screen.getByText("Only CNY is counted; rows in another currency are left out."),
    ).toBeInTheDocument();
    // The window is sent explicitly, so the caption and the request agree.
    expect(api.getBdPerformance).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-18" });

    // 成交: five figures, 未回款 derived from the two the response carries.
    const deals = screen.getByRole("region", { name: "Deals" });
    expect(within(deals).getByText("Signed")).toBeInTheDocument();
    expect(within(deals).getByText("¥30,000")).toBeInTheDocument();
    // ¥21,000 is 签约额 − 回款额: the one figure the endpoint does not send.
    expect(within(deals).getByText("¥21,000")).toBeInTheDocument();

    // 报价: the rate is 0–1 on the wire and a percentage on screen.
    const quotes = screen.getByRole("region", { name: "Quotes" });
    expect(within(quotes).getByText("66.7%")).toBeInTheDocument();
    expect(within(quotes).getByText("¥12,000")).toBeInTheDocument();

    // 过程 and 联盟 read the same currency, printed once above the blocks.
    const activity = screen.getByRole("region", { name: "Activity" });
    expect(within(activity).getByText("Follow-ups")).toBeInTheDocument();
    expect(within(activity).getByText("5")).toBeInTheDocument();
    const affiliate = screen.getByRole("region", { name: "Affiliate" });
    expect(within(affiliate).getByText("¥800")).toBeInTheDocument();
    expect(within(affiliate).getByText("¥1,200")).toBeInTheDocument();
    expect(screen.queryByText("$")).toBeNull();
  });

  it("prints an empty marker where a figure is missing and a real 0 where it is not", async () => {
    serve(
      report({
        quotes: {
          sent: number(0),
          accepted: number(0),
          win_rate: number(null, "insufficient_data"),
          amount: money(null),
        },
        collected: { count: number(0), amount: money(null) },
      }),
    );
    renderPage();

    // A rate nothing was sent for is unknown: every dash carries the reason.
    const dashes = await screen.findAllByTitle("No data for this range");
    expect(dashes.length).toBeGreaterThan(0);
    expect(dashes[0]).toHaveTextContent("—");
    expect(dashes[0]).toHaveClass("text-faint-foreground");
    // Counts are measured: 0 offers sent is a real zero, and the quote block's
    // amount never becomes ¥0.
    expect(screen.queryByText("¥0")).toBeNull();
  });
});

describe("SalesPerformancePage · 两张维度表", () => {
  it("names members from the directory and totals the rows it shows", async () => {
    renderPage();

    const memberTable = await screen.findByRole("grid", { name: "By member" });
    await waitFor(() => expect(within(memberTable).getAllByRole("row").length).toBeGreaterThan(1));

    expect(within(memberTable).getByText("Lin Wei")).toBeInTheDocument();
    // The row carried no name of its own, so the directory supplied it.
    expect(within(memberTable).getByText("Zhao Min")).toBeInTheDocument();
    // 合计 is the sum of the two lines above it.
    const total = within(memberTable).getByText("Total").closest('[data-row-id="__total__"]');
    expect(total).toHaveTextContent("3");
    expect(total).toHaveTextContent("¥30,000");

    const monthTable = screen.getByRole("grid", { name: "By month" });
    expect(within(monthTable).getByText("2026-10")).toBeInTheDocument();
    expect(within(monthTable).getByText("2026-11")).toBeInTheDocument();
  });
});

describe("SalesPerformancePage · 换区间", () => {
  it("asks for 上月's own days", async () => {
    renderPage();
    await screen.findByText("2026-11-01 – 2026-11-18");

    await userEvent.click(screen.getByRole("button", { name: "Last month" }));

    await waitFor(() =>
      expect(api.getBdPerformance).toHaveBeenLastCalledWith({
        from: "2026-10-01",
        to: "2026-10-31",
      }),
    );
  });

  it("refuses a backwards custom window instead of sending it", async () => {
    renderPage();
    await screen.findByText("2026-11-01 – 2026-11-18");

    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    // 自定义 opens on 本月, so choosing it is a valid window of its own.
    const from = await screen.findByLabelText("From");
    const to = screen.getByLabelText("To");
    fireEvent.change(from, { target: { value: "2026-11-18" } });
    fireEvent.change(to, { target: { value: "2026-11-01" } });

    expect(await screen.findByText("The end day is before the start day.")).toBeInTheDocument();
    // The backwards window never reaches the wire.
    for (const call of api.getBdPerformance.mock.calls) {
      const filters = call[0] as { from?: string; to?: string };
      expect(filters.from! <= filters.to!).toBe(true);
    }
  });
});

describe("SalesPerformancePage · 空区间", () => {
  it("says the range holds nothing instead of drawing four zeros", async () => {
    serve(
      report({
        empty: "insufficient_data",
        signed: { count: number(0), amount: money(null) },
        delivered: { count: number(0), amount: money(null) },
        collected: { count: number(0), amount: money(null) },
        quotes: {
          sent: number(0),
          accepted: number(0),
          win_rate: number(null, "insufficient_data"),
          amount: money(null),
        },
        followups: { count: number(0), replied: number(0), meetings: number(0) },
        affiliate: { agency: money(null), creator: money(null), settled: money(null) },
        by_member: [],
        by_month: [],
      }),
    );
    renderPage();

    expect(await screen.findByText("Nothing in this range")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No collaboration, settlement, quote or follow-up is dated inside these days. Widen the range.",
      ),
    ).toBeInTheDocument();
    // The blocks are not drawn at all — no four zeros, no empty tables.
    expect(screen.queryByText("Deals")).toBeNull();
    expect(screen.queryByRole("grid")).toBeNull();
  });
});

describe("SalesPerformancePage · 错误与加载", () => {
  it("states the failure once and retries it", async () => {
    api.getBdPerformance.mockRejectedValue(new Error("boom"));
    api.listMembers.mockResolvedValue([MEMBER]);
    renderPage();

    expect(await screen.findByText("Couldn't load the report")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();

    serve(report());
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("2026-11-01 – 2026-11-18")).toBeInTheDocument();
  });

  it("draws a placeholder while the report is on its way", async () => {
    api.getBdPerformance.mockImplementation(() => new Promise(() => {}));
    api.listMembers.mockResolvedValue([MEMBER]);
    renderPage();

    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).not.toBeNull());
    expect(screen.queryByRole("grid")).toBeNull();
  });
});

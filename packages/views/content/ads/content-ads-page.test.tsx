import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  AdsAccount,
  AdsMaterial,
  AdsPlan,
  AdsReconRow,
  AdsSummary,
  AdsTotals,
  AdsViolation,
} from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { ContentAdsPage } from "../content-ads-page";

/**
 * 千川投放看板 (`/{slug}/content/ads`).
 *
 * The behaviours under test are the contract's three rules plus the two the page
 * adds: switching the settlement window or the days re-reads with the new
 * parameters, a failed block leaves the other five readable, the three amount
 * states stay distinguishable, and a platform balance is divided by 100 exactly
 * once.
 */

const api = vi.hoisted(() => ({
  getAdsSummary: vi.fn(),
  listAdsAccounts: vi.fn(),
  listAdsPlans: vi.fn(),
  listAdsMaterials: vi.fn(),
  listAdsViolations: vi.fn(),
  listAdsRecon: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function money(amount: number | null, empty: "zero" | "insufficient_data" = "zero") {
  return { amount, currency: "CNY", sample_count: amount === null ? 0 : 1, empty };
}

function count(value: number | null) {
  return { value, sample_count: value === null ? 0 : 1, empty: "zero" as const };
}

function totals(overrides: Partial<AdsTotals> = {}): AdsTotals {
  return {
    spend: money(1000),
    gmv: money(4000),
    refund: money(120),
    settle: money(3200),
    orders: count(12),
    ...overrides,
  };
}

function summary(basis: AdsSummary["basis"], overrides: Partial<AdsSummary> = {}): AdsSummary {
  return {
    from: "2026-11-01",
    to: "2026-11-19",
    basis,
    currency: "CNY",
    empty: "zero",
    totals: totals(),
    previous: totals(),
    basis_options: ["settle_1h", "settle_7d", "settle_14d", "settle_30d", "settle_90d"],
    ...overrides,
  };
}

function account(overrides: Partial<AdsAccount> = {}): AdsAccount {
  return {
    account_id: "acc-1",
    account_name: "杭州海川",
    currency: "CNY",
    unit: "fen",
    balance: 123450,
    cash: 100000,
    valid_grant: 0,
    captured_at: "2026-11-19T01:00:00Z",
    spend_to_date: 8000,
    ...overrides,
  };
}

function plan(overrides: Partial<AdsPlan> = {}): AdsPlan {
  return {
    plan_id: "plan-1",
    account_id: "acc-1",
    account_name: "杭州海川",
    name: "双十一短视频",
    marketing_goal: "VIDEO_AND_IMAGE",
    status: "delivery_ok",
    opt_status: "ENABLE",
    budget: 500,
    budget_mode: "BUDGET_MODE_DAY",
    roi2_goal: 1.8,
    smart_bid_type: "SMART_BID_CUSTOM",
    updated_at: "2026-11-18T02:00:00Z",
    ...overrides,
  };
}

function material(overrides: Partial<AdsMaterial> = {}): AdsMaterial {
  return {
    kind: "video",
    material_id: "mat-1",
    account_id: "acc-1",
    account_name: "杭州海川",
    filename: "口播A.mp4",
    video_id: "v-1",
    image_id: null,
    duration: 32.5,
    size_bytes: 1024,
    is_ai_create: false,
    is_inefficient: null,
    is_original: true,
    media_script_id: "3f2a9c11-8888-4c2b-9d1e-1a2b3c4d5e6f",
    captured_at: "2026-11-19T01:00:00Z",
    ...overrides,
  };
}

function violation(overrides: Partial<AdsViolation> = {}): AdsViolation {
  return {
    event_id: "ev-1",
    account_id: "acc-1",
    account_name: "杭州海川",
    ad_id: "ad-1",
    create_time: "2026-11-18T03:00:00Z",
    illegal_type: "虚假宣传",
    score: 85,
    status: "审核拒绝",
    reject_reason: "文案夸大",
    ...overrides,
  };
}

function recon(overrides: Partial<AdsReconRow> = {}): AdsReconRow {
  return {
    account_id: "acc-1",
    goal: "VIDEO_AND_IMAGE",
    account_name: "杭州海川",
    currency: "CNY",
    platform: totals({ spend: money(1000), gmv: money(4000), orders: count(12) }),
    ledger: totals({ spend: money(980), gmv: money(3900), orders: count(11) }),
    diff_cost: 20,
    diff_gmv: 100,
    diff_orders: 1,
    captured_at: "2026-11-19T01:00:00Z",
    ...overrides,
  };
}

function adapter(): NavigationAdapter {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    pathname: "/acme/content/ads",
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
        <ContentAdsPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

function block(title: RegExp): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const section = heading.closest("section");
  if (!section) throw new Error("block not found");
  return section as HTMLElement;
}

async function blockWhen(title: RegExp, text: string): Promise<HTMLElement> {
  await waitFor(
    () => expect(within(block(title)).getAllByText(text).length).toBeGreaterThan(0),
    { timeout: 8000 },
  );
  return block(title);
}

const MONEY = { selector: "[data-slot=ads-money]" } as const;

beforeEach(() => {
  api.getAdsSummary.mockImplementation((filters?: { basis?: string }) =>
    Promise.resolve(summary((filters?.basis ?? "settle_7d") as AdsSummary["basis"])),
  );
  api.listAdsAccounts.mockResolvedValue({ accounts: [account()], total: 1 });
  api.listAdsPlans.mockResolvedValue({ plans: [plan()], total: 1 });
  api.listAdsMaterials.mockResolvedValue({
    materials: [material(), material({ material_id: "mat-2", media_script_id: null })],
    total: 2,
  });
  api.listAdsViolations.mockResolvedValue({ violations: [violation()], total: 1 });
  api.listAdsRecon.mockResolvedValue({ recon: [recon()], total: 1 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ContentAdsPage · 口径", () => {
  it("asks for the default 7-day window and shows that window's five figures", async () => {
    renderPage();

    const strip = await blockWhen(/^Window$/, "¥1,000");
    expect(api.getAdsSummary).toHaveBeenCalledWith({ basis: "settle_7d" });
    expect(within(strip).getAllByText("¥1,000", MONEY)).toHaveLength(1);
    expect(within(strip).getAllByText("¥4,000", MONEY)).toHaveLength(1);
    expect(within(strip).getAllByText("¥3,200", MONEY)).toHaveLength(1);
    // The window cannot be added up, and the page says so.
    expect(within(strip).getByText(/never added together/)).toBeInTheDocument();
  });

  it("re-reads with the chosen basis and never with two of them", async () => {
    renderPage();
    await blockWhen(/^Window$/, "¥1,000");
    api.getAdsSummary.mockClear();

    await userEvent.click(screen.getByRole("combobox", { name: "Settlement window" }));
    await userEvent.click(await screen.findByRole("option", { name: "14 days" }));

    await waitFor(() =>
      expect(api.getAdsSummary).toHaveBeenCalledWith({ basis: "settle_14d" }),
    );
    // One request, one window: nothing asks for a combined figure.
    for (const call of api.getAdsSummary.mock.calls) {
      const filters = call[0] as { basis: string };
      expect(typeof filters.basis).toBe("string");
    }
    expect(api.getAdsSummary).toHaveBeenCalledTimes(1);
  });

  it("re-reads when a day changes, and omits the empty one", async () => {
    renderPage();
    await blockWhen(/^Window$/, "¥1,000");

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-05" } });

    await waitFor(() =>
      expect(api.getAdsSummary).toHaveBeenCalledWith({
        basis: "settle_7d",
        from: "2026-11-05",
      }),
    );
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-10" } });
    await waitFor(() =>
      expect(api.getAdsSummary).toHaveBeenCalledWith({
        basis: "settle_7d",
        from: "2026-11-05",
        to: "2026-11-10",
      }),
    );
  });
});

describe("ContentAdsPage · 三态", () => {
  it("prints 数据不足, a dash and a real 0 as three different things", async () => {
    api.getAdsSummary.mockResolvedValue(
      summary("settle_7d", {
        // The window has no facts at all, which is what `empty` states.
        empty: "insufficient_data",
        totals: {
          spend: money(null, "insufficient_data"),
          gmv: money(null, "zero"),
          refund: money(0),
          settle: money(3200),
          orders: count(0),
        },
        previous: {
          spend: money(null, "insufficient_data"),
          gmv: money(null, "zero"),
          refund: money(0),
          settle: money(3200),
          orders: count(0),
        },
      }),
    );
    renderPage();

    const strip = await blockWhen(/^Window$/, "¥3,200");
    // `insufficient_data` says 数据不足…
    expect(within(strip).getAllByText("Not enough data")).toHaveLength(1);
    // …a null the server did not call insufficient is a dash…
    expect(within(strip).getAllByText("—")).toHaveLength(1);
    // …and a stated zero is an answer, printed as one.
    expect(within(strip).getAllByText("¥0", MONEY)).toHaveLength(1);
    expect(within(strip).getAllByText("0", { selector: "[data-slot=ads-count]" })).toHaveLength(1);
    // The window itself has no facts, so the strip explains it.
    expect(within(strip).getByText("No ad fact in this window.")).toBeInTheDocument();
  });

  it("says 没有可对比的数 instead of inventing a percentage", async () => {
    api.getAdsSummary.mockResolvedValue(
      summary("settle_7d", { previous: { ...totals(), spend: money(0) } }),
    );
    renderPage();

    const strip = await blockWhen(/^Window$/, "¥1,000");
    // The previous window's spend is 0, so that one cell has no ratio.
    expect(within(strip).getAllByText("Nothing to compare").length).toBeGreaterThan(0);
  });
});

describe("ContentAdsPage · 分换算只有一处", () => {
  it("shows an account balance in yuan, and says the conversion once", async () => {
    renderPage();

    const accounts = await blockWhen(/^Accounts$/, "杭州海川");
    // 123450 分 → ¥1,234.5
    expect(within(accounts).getAllByText("¥1,234.5", { selector: "[data-slot=ads-fen]" })).toHaveLength(
      1,
    );
    // 100000 分 → ¥1,000, and a stated 0 grant stays ¥0 (not a dash).
    expect(within(accounts).getAllByText("¥1,000", { selector: "[data-slot=ads-fen]" })).toHaveLength(
      1,
    );
    expect(within(accounts).getByText("¥0")).toBeInTheDocument();
    // `spend_to_date` is already yuan and is not divided again.
    expect(within(accounts).getByText("¥8,000")).toBeInTheDocument();
    expect(within(accounts).getByText(/divides by 100 once/)).toBeInTheDocument();
  });
});

describe("ContentAdsPage · 素材与对账", () => {
  it("links a material to its script, and says 未关联 when there is none", async () => {
    renderPage();

    const materials = await blockWhen(/^Materials$/, "口播A.mp4");
    expect(within(materials).getByText("3f2a9c11")).toBeInTheDocument();
    expect(within(materials).getAllByText("Not linked")).toHaveLength(1);
  });

  it("shows platform, ledger and the three differences without a ratio", async () => {
    renderPage();

    const reconBlock = await blockWhen(/^Reconciliation$/, "杭州海川");
    const platform = reconBlock.querySelector('[data-side="platform"]') as HTMLElement;
    const ledger = reconBlock.querySelector('[data-side="ledger"]') as HTMLElement;
    const diff = reconBlock.querySelector('[data-side="diff"]') as HTMLElement;

    expect(within(platform).getAllByText("¥1,000", MONEY)).toHaveLength(1);
    expect(within(ledger).getAllByText("¥980", MONEY)).toHaveLength(1);
    expect(within(diff).getByText("¥20")).toBeInTheDocument();
    expect(within(diff).getByText("¥100")).toBeInTheDocument();
    // The order difference carries its sign: 12 on the platform, 11 in the ledger.
    expect(within(diff).getByText("+1")).toBeInTheDocument();
    // No percentage anywhere in this block: the differences are not ratios.
    expect(within(reconBlock).queryAllByText(/%/)).toHaveLength(0);
  });

  it("says 不可比 when a difference has no comparable pair", async () => {
    api.listAdsRecon.mockResolvedValue({
      recon: [recon({ diff_cost: null, diff_gmv: null, diff_orders: null })],
      total: 1,
    });
    renderPage();

    const reconBlock = await blockWhen(/^Reconciliation$/, "杭州海川");
    expect(within(reconBlock).getAllByText("Not comparable")).toHaveLength(3);
  });
});

describe("ContentAdsPage · 空态与错误隔离", () => {
  it("keeps five blocks readable when the plans read fails", async () => {
    api.listAdsPlans.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByText("This block didn’t load.")).toBeInTheDocument();
    const strip = await blockWhen(/^Window$/, "¥1,000");
    const accounts = await blockWhen(/^Accounts$/, "杭州海川");
    expect(strip).toBeInTheDocument();
    expect(accounts).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Reconciliation$/ })).toBeInTheDocument();
  });

  it("gives every list its own empty state", async () => {
    api.listAdsAccounts.mockResolvedValue({ accounts: [], total: 0 });
    api.listAdsPlans.mockResolvedValue({ plans: [], total: 0 });
    api.listAdsMaterials.mockResolvedValue({ materials: [], total: 0 });
    api.listAdsViolations.mockResolvedValue({ violations: [], total: 0 });
    api.listAdsRecon.mockResolvedValue({ recon: [], total: 0 });
    renderPage();

    expect(await screen.findByText("No ad account synced yet.")).toBeInTheDocument();
    expect(screen.getByText("No plan synced yet.")).toBeInTheDocument();
    expect(screen.getByText("No material synced yet.")).toBeInTheDocument();
    expect(screen.getByText("No violation recorded.")).toBeInTheDocument();
    expect(screen.getByText("Nothing to reconcile yet.")).toBeInTheDocument();
  });
});

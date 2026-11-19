import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import type { BdActivity, BdPipeline, Creator } from "@morechat/core/types";
import { renderWithI18n } from "../test/i18n";
import { SalesDashboardPage } from "./sales-dashboard-page";

/**
 * The 商务驾驶舱, end to end over the reads it draws: the three counts, the money
 * line's `—`, the follow-up queue's order and cap, the quick-log dialog's request,
 * the same queue without write access, and the timeline's empty state.
 *
 * The clock is pinned (only `Date` is faked, so Testing Library's timers still
 * run): 本月 means November 2026 in the fixtures, and 逾期 is a difference of local
 * calendar days, which is the part of the page that is easiest to get wrong.
 */

const WS = "ws-1";
const NOW = new Date(2026, 10, 18, 15, 0, 0);

const api = vi.hoisted(() => ({
  listCreators: vi.fn(),
  createBdActivity: vi.fn(),
}));

const state = vi.hoisted(() => ({
  pipeline: null as unknown,
  activities: [] as unknown[],
  creators: [] as unknown[],
  role: "admin" as "owner" | "admin" | "member" | null,
}));

vi.mock("@morechat/core/api", () => ({ api }));

vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: "user-1",
    role: state.role,
    member: null,
    isLoading: false,
  }),
}));

vi.mock("@morechat/core/bd/queries", () => ({
  bdPipelineOptions: () => ({
    queryKey: ["bd", "ws-1", "pipeline"],
    queryFn: async () => state.pipeline,
  }),
  bdActivityListOptions: () => ({
    queryKey: ["bd", "ws-1", "activities"],
    queryFn: async () => ({
      activities: state.activities,
      total: state.activities.length,
    }),
  }),
}));

vi.mock("@morechat/core/creator/queries", () => ({
  creatorKeys: { all: (wsId: string) => ["creator", wsId] as const },
}));

vi.mock("@morechat/core/bd/mutations", () => ({
  useCreateBdActivity: () => ({
    mutateAsync: api.createBdActivity,
    isPending: false,
  }),
}));

vi.mock("../navigation", () => ({
  AppLink: ({
    children,
    href,
    newTabTitle: _newTabTitle,
    ...props
  }: { children: ReactNode; href: string; newTabTitle?: string } & React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useNavigation: () => ({ pathname: "/acme/sales" }),
}));

/** One cockpit number in the shape `/bd/pipeline` returns. */
function number(value: number | null): BdPipeline["creators"]["total"] {
  return {
    value,
    sample_count: value === null ? 0 : 1,
    empty: value === null ? "insufficient_data" : "zero",
  };
}

function money(amount: number | null): BdPipeline["orders"]["total_amount"] {
  return {
    amount,
    currency: "CNY",
    sample_count: amount === null ? 0 : 2,
    empty: amount === null ? "insufficient_data" : "zero",
  };
}

function pipeline(overrides: {
  contacted?: number | null;
  signed?: number | null;
  paid?: number | null;
} = {}): BdPipeline {
  return {
    creators: {
      total: number(625),
      contacted: number(overrides.contacted === undefined ? 1420 : overrides.contacted),
      replied: number(0),
      quoted: number(0),
      signed: number(0),
      deal: number(0),
    },
    quotes: { open: number(0), accepted: number(0), rejected: number(0), total_fee: money(null) },
    orders: {
      open: number(0),
      delivered: number(0),
      settled: number(0),
      total_amount: money(218000),
      paid_amount: money(overrides.paid === undefined ? 63000 : overrides.paid),
    },
    followups: { due_today: number(0), overdue: number(0) },
  };
}

function creator(overrides: Partial<Creator> & Pick<Creator, "id" | "display_name">): Creator {
  return {
    workspace_id: WS,
    kind: "external",
    platform: "douyin",
    handle: overrides.id,
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
    ...overrides,
  };
}

let activitySeq = 0;

/** A follow-up row, due `daysLate` local days before `NOW`. */
function activity(
  creatorId: string,
  daysLate: number,
  overrides: Partial<BdActivity> = {},
): BdActivity {
  activitySeq += 1;
  const due = new Date(2026, 10, 18 - daysLate, 10, 0, 0);
  return {
    id: `activity-${activitySeq}`,
    workspace_id: WS,
    creator_id: creatorId,
    kind: "dm",
    happened_at: new Date(due.getTime() - 86_400_000).toISOString(),
    summary: `Said hello to ${creatorId}`,
    outcome: null,
    next_follow_at: due.toISOString(),
    owner_member_id: null,
    created_by: null,
    created_at: new Date(due.getTime() - 86_400_000).toISOString(),
    updated_at: new Date(due.getTime() - 86_400_000).toISOString(),
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <WorkspaceSlugProvider slug="acme">
        <SalesDashboardPage />
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
}

/** The 今日跟进 / 最近动态 regions, named by their bundle copy. */
const dueSection = () => screen.getByRole("region", { name: "Due today" });
const activitySection = () => screen.getByRole("region", { name: "Recent activity" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.role = "admin";
  state.pipeline = pipeline();
  state.activities = [];
  state.creators = [];
  api.listCreators.mockImplementation(async () => ({
    creators: state.creators,
    total: state.creators.length,
    next_cursor: null,
  }));
  api.createBdActivity.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SalesDashboardPage · the three counts", () => {
  it("draws 跟进中 from the cockpit and the two month figures from the ledger", async () => {
    state.creators = [
      // Created this month and signed this month: counts in both.
      creator({
        id: "c-1",
        display_name: "Lin",
        created_at: "2026-11-02T02:00:00Z",
        cooperation_intent: "signed",
        updated_at: "2026-11-05T02:00:00Z",
      }),
      // Created this month, not signed.
      creator({ id: "c-2", display_name: "Yu", created_at: "2026-11-10T02:00:00Z" }),
      // Last month on both counts.
      creator({
        id: "c-3",
        display_name: "Mo",
        created_at: "2026-10-30T02:00:00Z",
        cooperation_intent: "signed",
        updated_at: "2026-10-31T02:00:00Z",
      }),
      // Signed after the new month started, created long before it.
      creator({
        id: "c-4",
        display_name: "Qi",
        created_at: "2026-01-01T02:00:00Z",
        cooperation_intent: "deal",
        updated_at: "2026-11-03T02:00:00Z",
      }),
    ];
    renderPage();

    const following = (await screen.findByText("Following up")).parentElement!;
    expect(following).toHaveTextContent("1,420");
    const fresh = screen.getByText("Added this month").parentElement!;
    expect(fresh).toHaveTextContent("2");
    const signed = screen.getByText("Signed this month").parentElement!;
    expect(signed).toHaveTextContent("2");
  });
});

describe("SalesDashboardPage · the money line", () => {
  it("prints — for an amount nothing was summed into, never ¥0", async () => {
    state.pipeline = {
      ...pipeline(),
      orders: {
        open: number(0),
        delivered: number(0),
        settled: number(0),
        total_amount: money(null),
        paid_amount: money(null),
      },
    };
    renderPage();

    const signed = (await screen.findByText("Signed")).closest("p")!;
    expect(signed).toHaveTextContent("—");
    expect(signed).not.toHaveTextContent("¥0");
    expect(signed).toHaveTextContent("Collected");
  });
});

describe("SalesDashboardPage · 今日跟进", () => {
  it("lists the queue most overdue first, five rows and a count of the rest", async () => {
    state.creators = [
      creator({ id: "c-1", display_name: "A" }),
      creator({ id: "c-2", display_name: "B" }),
      creator({ id: "c-3", display_name: "C" }),
      creator({ id: "c-4", display_name: "D" }),
      creator({ id: "c-5", display_name: "E" }),
      creator({ id: "c-6", display_name: "F" }),
    ];
    state.activities = [
      activity("c-1", 3),
      activity("c-2", 1),
      activity("c-3", 5),
      activity("c-4", 0),
      activity("c-5", 2),
      activity("c-6", 9),
    ];
    renderPage();

    const rows = await within(await waitFor(dueSection)).findAllByRole("listitem");
    expect(rows).toHaveLength(5);
    // 9, 5, 3, 2, 1 days late — the row due today is the sixth and only shows up
    // in the link's count.
    expect(rows.map((row) => row.textContent?.slice(0, 1))).toEqual(["F", "C", "A", "E", "B"]);
    expect(within(dueSection()).getByRole("link")).toHaveTextContent("1 more →");
    expect(within(dueSection()).getByRole("link")).toHaveAttribute(
      "href",
      "/acme/sales/followups",
    );
  });

  it("says 今天 for a follow-up due later today instead of 逾期 0 天", async () => {
    state.creators = [creator({ id: "c-1", display_name: "A" })];
    state.activities = [activity("c-1", 0)];
    renderPage();

    const row = await within(await waitFor(dueSection)).findByRole("listitem");
    expect(row).toHaveTextContent("Today");
    expect(row).not.toHaveTextContent("0d late");
  });

  it("keeps only the newest follow-up per creator", async () => {
    state.creators = [
      creator({ id: "c-1", display_name: "A" }),
      creator({ id: "c-2", display_name: "B" }),
    ];
    const older = activity("c-1", 4, { happened_at: "2026-11-10T02:00:00Z" });
    const newer = activity("c-1", 0, { happened_at: "2026-11-17T02:00:00Z" });
    state.activities = [newer, older, activity("c-2", 1)];
    renderPage();

    const rows = await within(await waitFor(dueSection)).findAllByRole("listitem");
    // c-1's newest row is due today, so it sorts behind c-2 (a day late); the
    // older c-1 row is answered and must not appear as a second c-1.
    expect(rows.map((row) => row.textContent?.slice(0, 1))).toEqual(["B", "A"]);
  });
});

describe("SalesDashboardPage · 记", () => {
  it("opens the quick follow-up dialog and writes the row it asked for", async () => {
    state.creators = [creator({ id: "c-1", display_name: "Lin" })];
    state.activities = [activity("c-1", 2)];
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Log a follow-up with Lin" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "Result" }));
    await userEvent.click(await screen.findByRole("option", { name: "Replied" }));
    await userEvent.type(screen.getByLabelText("One line"), "Sent the rate card");
    fireEvent.change(screen.getByLabelText("Next follow-up"), {
      target: { value: "2026-11-20T09:30" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createBdActivity).toHaveBeenCalledTimes(1));
    expect(api.createBdActivity).toHaveBeenCalledWith({
      creator_id: "c-1",
      kind: "note",
      happened_at: NOW.toISOString(),
      summary: "Sent the rate card",
      outcome: "replied",
      next_follow_at: new Date(2026, 10, 20, 9, 30).toISOString(),
    });
  });

  it("does not offer the button to a reader without write access", async () => {
    state.role = null;
    state.creators = [creator({ id: "c-1", display_name: "Lin" })];
    state.activities = [activity("c-1", 2)];
    renderPage();

    const row = await within(await waitFor(dueSection)).findByRole("listitem");
    expect(row).toHaveTextContent("Lin");
    expect(within(row).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: /Log a follow-up with/ })).toBeNull();
  });
});

describe("SalesDashboardPage · 最近动态", () => {
  it("points at the ledger when nothing has been logged yet", async () => {
    renderPage();
    expect(
      await within(await waitFor(activitySection)).findByText(
        "No follow-ups recorded yet — pick a creator from the ledger to start.",
      ),
    ).toBeInTheDocument();
  });

  it("lists the newest rows with who, how and what came of it", async () => {
    state.creators = [creator({ id: "c-1", display_name: "Zheng Ting" })];
    state.activities = [
      activity("c-1", 1, {
        kind: "email",
        summary: "Mailed the draft contract",
        happened_at: new Date(2026, 10, 17, 9, 0, 0).toISOString(),
      }),
    ];
    renderPage();

    const row = await within(await waitFor(activitySection)).findByRole("listitem");
    expect(row).toHaveTextContent("Zheng Ting");
    expect(row).toHaveTextContent("Email");
    expect(row).toHaveTextContent("Mailed the draft contract");
    expect(row).toHaveTextContent("1d ago");
  });
});

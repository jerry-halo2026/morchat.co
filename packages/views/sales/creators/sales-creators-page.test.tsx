import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import type { BdActivity, Creator } from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { SalesCreatorsPage } from "../sales-creators-page";

/**
 * 达人台账, end to end over the two reads it draws.
 *
 * Seven behaviours, one per `describe`/`it`: the empty ledger, the eight columns in
 * their declared order, a cooperation stage narrowing the view, a column header
 * asking the server for a different order, a row opening its sheet with the follow-up
 * log inside, a reader without write access, and the dash a missing quote prints.
 *
 * Two facts about the contract shape the fixtures. The list endpoint has no parameter
 * for a cooperation stage, so the stage filter narrows the rows this page read rather
 * than the request (see `../creators/model.ts`); and the follow-up log is read as one
 * newest-first window for the table, plus one per-creator window for the sheet.
 *
 * The clock is pinned (only `Date` is faked, so Testing Library's timers still run):
 * 下次跟进 and 最近跟进 are differences of local calendar days, which is the part of the
 * page easiest to get wrong.
 */

const WS = "ws-1";
const NOW = new Date(2026, 10, 18, 15, 0, 0);

const api = vi.hoisted(() => ({
  listCreators: vi.fn(),
  listBdActivities: vi.fn(),
  createBdActivity: vi.fn(),
}));

const state = vi.hoisted(() => ({
  creators: [] as unknown[],
  activities: [] as unknown[],
  sheetActivities: [] as unknown[],
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

vi.mock("@morechat/core/creator/queries", () => ({
  creatorKeys: { all: (wsId: string) => ["creator", wsId] as const },
}));

vi.mock("../../navigation", () => ({
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
  useNavigation: () => ({
    pathname: "/acme/sales/creators",
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

/** One follow-up row, happened `daysAgo` local days before `NOW`. */
function activity(
  creatorId: string,
  daysAgo: number,
  overrides: Partial<BdActivity> = {},
): BdActivity {
  activitySeq += 1;
  const happened = new Date(2026, 10, 18 - daysAgo, 10, 0, 0);
  return {
    id: `activity-${activitySeq}`,
    workspace_id: WS,
    creator_id: creatorId,
    kind: "dm",
    happened_at: happened.toISOString(),
    summary: `Said hello to ${creatorId}`,
    outcome: null,
    next_follow_at: null,
    owner_member_id: null,
    created_by: null,
    created_at: happened.toISOString(),
    updated_at: happened.toISOString(),
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
        <SalesCreatorsPage />
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
}

const grid = () => screen.getByRole("grid", { name: "Creators" });

/** The table's rows, header excluded. */
const bodyRows = () => within(grid()).getAllByRole("row").slice(1);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.role = "admin";
  state.creators = [];
  state.activities = [];
  state.sheetActivities = [];
  api.listCreators.mockImplementation(async () => ({
    creators: state.creators,
    total: state.creators.length,
    next_cursor: null,
  }));
  api.listBdActivities.mockImplementation(
    async (filters: { creator_id?: string } = {}) => ({
      activities: filters.creator_id ? state.sheetActivities : state.activities,
      total: 0,
    }),
  );
  api.createBdActivity.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SalesCreatorsPage · 空态", () => {
  it("says the ledger is empty and where creators come from", async () => {
    renderPage();

    expect(await screen.findByText("No creators yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Creators arrive from the upstream creator database; they show up here once a sync has run.",
      ),
    ).toBeInTheDocument();
    // The header is still there: an empty ledger is a page, not a blank screen.
    expect(screen.getByRole("heading", { name: "Creators" })).toBeInTheDocument();
  });
});

describe("SalesCreatorsPage · the table", () => {
  it("draws one row per creator with the eight columns in their declared order", async () => {
    state.creators = [
      creator({
        id: "c-1",
        display_name: "Lin",
        douyin_id: "lin_dy",
        fans: 26_000,
        fans_display: "2.6万",
        engagement_rate: 0.061,
        hit_rate: 0.1234,
        cooperation_intent: "signed",
        quote_min: 1000,
        quote_max: 5000,
      }),
      creator({ id: "c-2", display_name: "Yu", douyin_id: "yu_dy", fans: 8000 }),
      creator({ id: "c-3", display_name: "Mo", douyin_id: "mo_dy", fans: 1200 }),
    ];
    state.activities = [activity("c-1", 2, { next_follow_at: new Date(2026, 10, 20, 9, 0, 0).toISOString() })];
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    expect(
      within(grid())
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "Creator",
      "Followers",
      "Engagement",
      "Hit rate",
      "Cooperation",
      "Quote",
      "Last contact",
      "Next contact",
    ]);

    const first = bodyRows()[0]!;
    // The ninth cell is the row's ⋮ slot, which is a gridcell too; the eight the
    // table declares come first, in the order the header named them.
    expect(
      within(first)
        .getAllByRole("gridcell")
        .slice(0, 8)
        .map((cell) => cell.textContent),
    ).toEqual([
      // 昵称 + 抖音号, then the follower string upstream sent, then the two rates.
      "Linlin_dy",
      "2.6万",
      "6.1%",
      "12.3%",
      "Signed",
      "1,000 – 5,000",
      "2d ago",
      "in 2d",
    ]);
  });

  it("keeps the number and says why when a rate is above 100 %", async () => {
    state.creators = [
      creator({ id: "c-1", display_name: "Lin", engagement_rate: 45.03, hit_rate: 0.47619 }),
    ];
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    const cell = within(bodyRows()[0]!).getByText("4503.0%");
    expect(cell).toHaveAttribute(
      "title",
      "Upstream data may be wrong: the follower count does not match the works",
    );
  });
});

describe("SalesCreatorsPage · the cooperation filter", () => {
  it("narrows the view to signed creators when 已签约 is chosen", async () => {
    state.creators = [
      creator({ id: "c-1", display_name: "Lin", cooperation_intent: "signed" }),
      creator({ id: "c-2", display_name: "Yu", cooperation_intent: "not_contacted" }),
      creator({ id: "c-3", display_name: "Mo", cooperation_intent: "quoted" }),
    ];
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(3));

    // `cooperation_intent` is not a parameter of GET /workbench/creators, so the
    // narrowing happens over the ledger this page read — the request keeps the
    // server's own filters (limit + sort) and nothing else is invented on the wire.
    expect(api.listCreators).toHaveBeenCalledWith({ limit: 200, sort: "fans", cursor: undefined });

    await userEvent.click(screen.getByRole("button", { name: "Filter creators" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Signed/ }));
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(within(bodyRows()[0]!).getByText("Lin")).toBeInTheDocument();
    expect(screen.queryByText("Yu")).toBeNull();
    // Asking the same thing twice over the wire: the filter is page state, so the
    // list request is not re-issued for it.
    expect(api.listCreators).toHaveBeenCalledTimes(1);
  });
});

describe("SalesCreatorsPage · ordering", () => {
  it("asks the server for engagement order when the 互动率 header is clicked", async () => {
    state.creators = [creator({ id: "c-1", display_name: "Lin" })];
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(within(grid()).getByRole("button", { name: "Engagement" }));

    await waitFor(() =>
      expect(api.listCreators).toHaveBeenLastCalledWith({
        limit: 200,
        sort: "engagement",
        cursor: undefined,
      }),
    );
    expect(
      within(grid()).getByRole("columnheader", { name: /Engagement/ }),
    ).toHaveAttribute("aria-sort", "descending");
  });
});

describe("SalesCreatorsPage · the sheet", () => {
  it("opens a creator's profile and its recent follow-ups when the row is clicked", async () => {
    state.creators = [creator({ id: "c-1", display_name: "Lin", douyin_id: "lin_dy", region: "杭州" })];
    state.sheetActivities = [
      activity("c-1", 3, {
        kind: "call",
        outcome: "replied",
        summary: "Sent the rate card",
      }),
    ];
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    fireEvent.click(within(bodyRows()[0]!).getByText("Lin"));

    expect(await screen.findByRole("heading", { name: "Lin" })).toBeInTheDocument();
    expect(await screen.findByText("Recent follow-ups")).toBeInTheDocument();
    expect(await screen.findByText("Sent the rate card")).toBeInTheDocument();
    // The log is read for this creator only, ten rows at a time.
    expect(api.listBdActivities).toHaveBeenCalledWith({ creator_id: "c-1", limit: 10 });
  });
});

describe("SalesCreatorsPage · write access", () => {
  it("does not render 记跟进 for a reader who is not a member", async () => {
    state.role = null;
    // A `sec_uid` is what gives the row a profile link to copy, so the read-only
    // action below is available to every reader.
    state.creators = [creator({ id: "c-1", display_name: "Lin", sec_uid: "sec-1" })];
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "Creator actions" }));

    expect(screen.queryByRole("menuitem", { name: "Log a follow-up" })).toBeNull();
    // The read-only action is still there: the menu states what it can do.
    expect(await screen.findByRole("menuitem", { name: "Copy profile link" })).toBeInTheDocument();
  });
});

describe("SalesCreatorsPage · the quote column", () => {
  it("prints a dash when the creator quoted nothing", async () => {
    state.creators = [
      creator({ id: "c-1", display_name: "Lin", quote_min: null, quote_max: null }),
      creator({ id: "c-2", display_name: "Yu", quote_min: 3000, quote_max: 3000 }),
    ];
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    const [lin, yu] = bodyRows();
    expect(within(lin!).getAllByRole("gridcell")[5]).toHaveTextContent("—");
    // A single figure is not a range: one number, printed once.
    expect(within(yu!).getAllByRole("gridcell")[5]).toHaveTextContent("3,000");
    expect(within(yu!).getAllByRole("gridcell")[5]).not.toHaveTextContent("–");
  });
});

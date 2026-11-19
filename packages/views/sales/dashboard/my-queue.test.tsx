import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BdActivity, BdQuote, Creator, CrmCollab } from "@morechat/core/types";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { MyWorkbenchQueue } from "./my-queue";

/**
 * 我的队列 (`sales/dashboard/my-queue`) — the cockpit's own-work tab, and its
 * discussion column.
 *
 * The properties worth pinning are the ones a screenshot cannot show:
 *
 *   - every tab asks the server for `assignee=me`, never filtering client-side
 *     (COLLAB-MODEL §4 — the server resolves `me` against the *actor*, which may be
 *     an agent, so a client-side filter would answer the wrong question);
 *   - a row with no thread offers to start one, and starting it is one POST;
 *   - a row whose discussion was deleted says so instead of dropping the row.
 */

const WS = "ws-1";

const api = vi.hoisted(() => ({
  listBdActivities: vi.fn(),
  listBdQuotes: vi.fn(),
  listCrmCollabs: vi.fn(),
  listCreators: vi.fn(),
  openCrmCollabThread: vi.fn(),
  openBdQuoteThread: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function adapter(): NavigationAdapter {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    pathname: "/acme/sales",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function creator(id: string, name: string): Creator {
  return {
    id,
    workspace_id: WS,
    kind: "external",
    platform: "douyin",
    handle: id,
    url: null,
    fans: 0,
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
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
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
    display_name: name,
  };
}

function activity(overrides: Partial<BdActivity> = {}): BdActivity {
  return {
    id: "act-1",
    workspace_id: WS,
    creator_id: "c-1",
    kind: "dm",
    happened_at: "2026-11-10T02:00:00Z",
    summary: "问了报价区间",
    outcome: null,
    next_follow_at: "2026-11-18T02:00:00Z",
    owner_member_id: "m-1",
    created_by: "m-1",
    created_at: "2026-11-10T02:00:00Z",
    updated_at: "2026-11-10T02:00:00Z",
    ...overrides,
  };
}

function quote(overrides: Partial<BdQuote> = {}): BdQuote {
  return {
    id: "q-1",
    workspace_id: WS,
    creator_id: "c-1",
    brief_id: null,
    status: "sent",
    quoted_at: "2026-11-10T02:00:00Z",
    valid_until: "2026-11-22",
    fee_amount: 8000,
    commission_rate: 0.2,
    currency: "CNY",
    items: [],
    note: null,
    owner_member_id: "m-1",
    created_by: "m-1",
    created_at: "2026-11-10T02:00:00Z",
    updated_at: "2026-11-10T02:00:00Z",
    ...overrides,
  };
}

function collab(overrides: Partial<CrmCollab> = {}): CrmCollab {
  return {
    id: "cl-1",
    workspace_id: WS,
    brief_id: "b-1",
    creator_id: "c-1",
    stage: "confirmed",
    quote_amount: 10000,
    final_amount: 9000,
    prob: null,
    creator_fee: 4000,
    sample_cost: 500,
    platform_fee: 500,
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
    owner_member_id: "m-1",
    created_by: "m-1",
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    archived_at: null,
    publish_url: null,
    settled_on: "2026-11-30",
    ...overrides,
  };
}

function renderQueue() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <WorkspaceSlugProvider slug="acme">
        <NavigationProvider value={adapter()}>
          <MyWorkbenchQueue />
        </NavigationProvider>
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
}

function serve(rows: {
  activities?: BdActivity[];
  quotes?: BdQuote[];
  collabs?: CrmCollab[];
}) {
  api.listBdActivities.mockResolvedValue({
    activities: rows.activities ?? [],
    total: (rows.activities ?? []).length,
  });
  api.listBdQuotes.mockResolvedValue({
    quotes: rows.quotes ?? [],
    total: (rows.quotes ?? []).length,
  });
  api.listCrmCollabs.mockResolvedValue({
    collabs: rows.collabs ?? [],
    total: (rows.collabs ?? []).length,
  });
  api.listCreators.mockResolvedValue({
    creators: [creator("c-1", "Lin Wei")],
    total: 1,
    next_cursor: null,
  });
}

beforeEach(() => {
  serve({});
  api.openCrmCollabThread.mockResolvedValue({
    issue_id: "issue-1",
    number: 12,
    title: "Cooperation · confirmed",
    status: "todo",
    state: "linked",
    comment_count: 0,
    last_comment_at: null,
    last_comment_preview: null,
  });
  api.openBdQuoteThread.mockResolvedValue({
    issue_id: "issue-2",
    number: 13,
    title: "Quote · sent",
    status: "todo",
    state: "linked",
    comment_count: 0,
    last_comment_at: null,
    last_comment_preview: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MyWorkbenchQueue · 队列参数", () => {
  it("asks every ledger for the caller's own rows, never filters client-side", async () => {
    serve({ activities: [activity()], quotes: [quote()], collabs: [collab()] });
    renderQueue();

    await waitFor(() => expect(api.listBdActivities).toHaveBeenCalled());
    await waitFor(() => expect(api.listBdQuotes).toHaveBeenCalled());
    await waitFor(() => expect(api.listCrmCollabs).toHaveBeenCalled());
    for (const fn of [api.listBdActivities, api.listBdQuotes, api.listCrmCollabs]) {
      expect(fn.mock.calls[0]?.[0]).toMatchObject({ assignee: "me" });
    }
    expect(await screen.findByText("Lin Wei")).toBeInTheDocument();
    // The follow-up's own due day is what makes the row actionable.
    expect(screen.getByText("Due 2026-11-18")).toBeInTheDocument();
  });
});

describe("MyWorkbenchQueue · 讨论列", () => {
  it("starts a discussion once, with one POST", async () => {
    serve({ quotes: [quote()] });
    renderQueue();

    await waitFor(() => expect(api.listBdQuotes).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Quotes" }));
    await userEvent.click(await screen.findByRole("button", { name: "Start a discussion" }));

    await waitFor(() => expect(api.openBdQuoteThread).toHaveBeenCalledWith("q-1"));
    expect(api.openBdQuoteThread).toHaveBeenCalledTimes(1);
  });

  it("shows the count and the newest line once a thread exists", async () => {
    serve({
      collabs: [
        collab({
          thread: {
            issue_id: "issue-9",
            number: 21,
            title: "Cooperation · confirmed",
            status: "todo",
            state: "linked",
            comment_count: 3,
            last_comment_at: "2026-11-19T02:00:00Z",
            last_comment_preview: "合同改一版",
          },
        }),
      ],
    });
    renderQueue();

    await userEvent.click(await screen.findByRole("button", { name: "Collaborations" }));
    const link = await screen.findByRole("link", { name: /3 replies/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("/issues/issue-9"));
    expect(within(link).getByText(/合同改一版/)).toBeInTheDocument();
  });

  it("keeps the row and says 已归档 when the discussion was deleted", async () => {
    serve({
      collabs: [
        collab({
          thread: {
            issue_id: "issue-gone",
            number: 0,
            title: "",
            status: "",
            state: "gone",
            comment_count: 0,
            last_comment_at: null,
            last_comment_preview: null,
          },
        }),
      ],
    });
    renderQueue();

    await userEvent.click(await screen.findByRole("button", { name: "Collaborations" }));
    expect(await screen.findByText("Discussion archived")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /replies/ })).toBeNull();
    // The row itself is still there — its money and stage did not go anywhere.
    expect(screen.getByText("Lin Wei")).toBeInTheDocument();
  });
});

describe("MyWorkbenchQueue · 状态", () => {
  it("says the queue is empty instead of drawing an empty list", async () => {
    renderQueue();
    expect(await screen.findByText("Nothing is assigned to you here.")).toBeInTheDocument();
  });

  it("states a failed read and retries it", async () => {
    api.listBdActivities.mockRejectedValue(new Error("boom"));
    renderQueue();

    expect(await screen.findByText("Couldn't read your queue")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();

    serve({ activities: [activity()] });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Due 2026-11-18")).toBeInTheDocument();
  });
});

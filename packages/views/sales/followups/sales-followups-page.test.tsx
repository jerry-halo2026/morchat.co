import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import { ApiError, StaleWriteError } from "@morechat/core/api";
import type { BdActivity, CreateBdActivityRequest, Creator } from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { SalesFollowupsPage } from "../sales-followups-page";

/**
 * 跟进页，端到端跑在它真正读的那两条查询上：`?limit=200` 的跟进台账（租户内的
 * 全部流水）和达人台账（名字）。
 *
 * 只有 `@morechat/core/api` 是被替换的：query options、mutation、缓存失效都是真
 * 的，所以"提交后这一行从今天到期里消失"是通过一次真实的 invalidate → refetch
 * 验证的，而不是断言某个 mock 被调用过。
 *
 * 时钟钉在 2026-11-18 15:00（只 fake `Date`，Testing Library 的定时器照常跑）：
 * 逾期是本地日历日之差，一天 23/25 小时的夏令时问题正好藏在这个差里。
 */

const WS = "ws-1";
const NOW = new Date(2026, 10, 18, 15, 0, 0);

const api = vi.hoisted(() => ({
  listBdActivities: vi.fn(),
  listCreators: vi.fn(),
  createBdActivity: vi.fn(),
  updateBdActivity: vi.fn(),
}));

const state = vi.hoisted(() => ({
  activities: [] as unknown[],
  creators: [] as unknown[],
  role: "admin" as "owner" | "admin" | "member" | null,
}));

/** What `?followup=` carries in this test — set before `renderPage`. */
const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));

// The real module is kept for `StaleWriteError` / `isStaleWrite`: the mutation
// hooks in `@morechat/core/bd` judge a 409 with the same function this page does.
vi.mock("@morechat/core/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@morechat/core/api")>()),
  api,
}));

vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: "user-1",
    role: state.role,
    member: null,
    isLoading: false,
  }),
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
  useNavigation: () => ({ pathname: "/acme/sales/followups", searchParams: nav.params }),
}));

function creator(id: string, displayName: string): Creator {
  return {
    id,
    workspace_id: WS,
    kind: "external",
    display_name: displayName,
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

let activitySeq = 0;

/** One follow-up: logged `daysAgo`, next call scheduled at local 10:00 `dueInDays` from today. */
function activity(
  creatorId: string,
  dueInDays: number,
  overrides: Partial<BdActivity> = {},
): BdActivity {
  activitySeq += 1;
  const happened = new Date(2026, 10, 18 - Math.max(1, -dueInDays + 1), 10, 0, 0);
  const due = new Date(2026, 10, 18 + dueInDays, 10, 0, 0);
  return {
    id: `activity-${activitySeq}`,
    workspace_id: WS,
    creator_id: creatorId,
    kind: "dm",
    happened_at: happened.toISOString(),
    summary: `Talked to ${creatorId}`,
    outcome: "replied",
    next_follow_at: due.toISOString(),
    owner_member_id: null,
    created_by: null,
    created_at: happened.toISOString(),
    updated_at: happened.toISOString(),
    ...overrides,
  };
}

function renderPage(params: Record<string, string> = {}) {
  nav.params = new URLSearchParams(params);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <WorkspaceSlugProvider slug="acme">
        <SalesFollowupsPage />
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
}

/** The list of rows, so assertions cannot pass on copy that happens to be elsewhere. */
const list = () => screen.getByRole("list");
const rowNames = () => within(list()).getAllByRole("article").map((row) => row.getAttribute("aria-label"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.role = "admin";
  state.activities = [];
  state.creators = [
    creator("creator-a", "Alice"),
    creator("creator-b", "Bella"),
    creator("creator-c", "Cara"),
  ];
  api.listBdActivities.mockImplementation(async () => ({
    activities: state.activities,
    total: state.activities.length,
  }));
  api.listCreators.mockImplementation(async () => ({
    creators: state.creators,
    total: state.creators.length,
    next_cursor: null,
  }));
  api.createBdActivity.mockImplementation(async (input: CreateBdActivityRequest) => {
    const stamp = new Date().toISOString();
    // The request already carries `happened_at`; the server stamps the rest.
    const created: BdActivity = {
      ...activity(input.creator_id, 5, { id: `created-${activitySeq}` }),
      ...input,
      outcome: input.outcome ?? null,
      next_follow_at: input.next_follow_at ?? null,
      created_at: stamp,
      updated_at: stamp,
    };
    // The newest row per creator is what the queue reads: appending it is what the
    // server does, and the page must drop the creator from 今天到期 on its own.
    state.activities = [created, ...state.activities];
    return created;
  });
  api.updateBdActivity.mockImplementation(
    async (id: string, patch: Partial<BdActivity>) => {
      const rows = state.activities as BdActivity[];
      state.activities = rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
      return (state.activities as BdActivity[]).find((row) => row.id === id);
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("SalesFollowupsPage", () => {
  it("switches the list between the three tabs", async () => {
    const user = userEvent.setup();
    state.activities = [
      // Alice: newest row is due today → 今天到期.
      activity("creator-a", 0, { id: "a-today" }),
      // Bella: newest row was due three days ago → 逾期.
      activity("creator-b", -3, { id: "b-late" }),
      // Cara: newest row schedules nothing → only 全部记录.
      activity("creator-c", 0, { id: "c-note", next_follow_at: null }),
    ];
    renderPage();

    await waitFor(() => expect(rowNames()).toEqual(["Alice"]));

    // The batch import sits beside 记一条: a month of follow-ups is typed in a file.
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Overdue" }));
    await waitFor(() => expect(rowNames()).toEqual(["Bella"]));

    await user.click(screen.getByRole("button", { name: "All records" }));
    await waitFor(() => expect(rowNames()).toEqual(["Alice", "Bella", "Cara"]));
  });

  it("prints 逾期 N 天 on overdue rows and orders them by days late", async () => {
    const user = userEvent.setup();
    state.activities = [
      activity("creator-a", -2, { id: "a-2" }),
      activity("creator-b", -5, { id: "b-5" }),
      activity("creator-c", -1, { id: "c-1" }),
    ];
    renderPage();

    await user.click(screen.getByRole("button", { name: "Overdue" }));

    await waitFor(() => expect(rowNames()).toEqual(["Bella", "Alice", "Cara"]));
    const rows = within(list()).getAllByRole("article");
    expect(within(rows[0]!).getByText("5d late")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("2d late")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("1d late")).toBeInTheDocument();
  });

  it("expands the inline form on 记一笔 and submits the three fields", async () => {
    const user = userEvent.setup();
    state.activities = [activity("creator-a", 0, { id: "a-today" })];
    renderPage();

    await waitFor(() => expect(rowNames()).toEqual(["Alice"]));
    await user.click(screen.getByRole("button", { name: "Log a follow-up with Alice" }));

    const form = screen.getByRole("form", { name: "Log a follow-up" });
    await user.click(within(form).getByRole("button", { name: "Advanced" }));
    fireEvent.change(within(form).getByLabelText("One line"), {
      target: { value: "She wants the brief by Friday" },
    });
    fireEvent.change(within(form).getByLabelText("Next follow-up"), {
      target: { value: "2026-11-21" },
    });
    await user.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createBdActivity).toHaveBeenCalledTimes(1));
    expect(api.createBdActivity).toHaveBeenCalledWith({
      creator_id: "creator-a",
      kind: "note",
      happened_at: NOW.toISOString(),
      summary: "She wants the brief by Friday",
      outcome: "advanced",
      // 2026-11-21 local midnight.
      next_follow_at: new Date(2026, 10, 21).toISOString(),
    });
  });

  it("drops the row from 今天到期 once the new follow-up becomes the newest", async () => {
    const user = userEvent.setup();
    state.activities = [activity("creator-a", 0, { id: "a-today" })];
    renderPage();

    await waitFor(() => expect(rowNames()).toEqual(["Alice"]));
    await user.click(screen.getByRole("button", { name: "Log a follow-up with Alice" }));
    const form = screen.getByRole("form", { name: "Log a follow-up" });
    await user.click(within(form).getByRole("button", { name: "Replied" }));
    fireEvent.change(within(form).getByLabelText("One line"), {
      target: { value: "Called, she is in" },
    });
    fireEvent.change(within(form).getByLabelText("Next follow-up"), {
      target: { value: "2026-11-25" },
    });
    await user.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Nobody to follow up today")).toBeInTheDocument());
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("sends 跳过 as a PATCH that moves next_follow_at to tomorrow", async () => {
    const user = userEvent.setup();
    state.activities = [activity("creator-a", -2, { id: "a-late" })];
    renderPage();

    await user.click(screen.getByRole("button", { name: "Overdue" }));
    await waitFor(() => expect(rowNames()).toEqual(["Alice"]));
    await user.click(
      screen.getByRole("button", { name: "Push Alice’s follow-up to tomorrow" }),
    );

    await waitFor(() => expect(api.updateBdActivity).toHaveBeenCalledTimes(1));
    const [id, patch] = api.updateBdActivity.mock.calls[0]!;
    expect(id).toBe("a-late");
    // The due time was 10:00; tomorrow keeps the clock and moves the day.
    expect(patch).toEqual({ next_follow_at: new Date(2026, 10, 19, 10, 0, 0).toISOString() });
  });

  it("renders no write controls without write access", async () => {
    state.role = null;
    state.activities = [activity("creator-a", 0, { id: "a-today" })];
    renderPage();

    await waitFor(() => expect(rowNames()).toEqual(["Alice"]));
    expect(screen.queryByRole("button", { name: "Log one" })).not.toBeInTheDocument();
    // The batch import is a write too: it is gone with the rest.
    expect(screen.queryByRole("button", { name: "Import CSV" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log a follow-up with Alice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Push Alice’s follow-up to tomorrow" }),
    ).not.toBeInTheDocument();

    // The list itself still reads.
    expect(within(list()).getByText("Talked to creator-a")).toBeInTheDocument();
  });

  it("gives each of the three empty tabs its own sentence", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Nobody to follow up today")).toBeInTheDocument(),
    );
    expect(screen.getByText("Pick a few creators from the creator page.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Overdue" }));
    expect(screen.getByText("Nothing overdue")).toBeInTheDocument();
    expect(screen.getByText("Keep it that way.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All records" }));
    expect(screen.getByText("No follow-ups yet")).toBeInTheDocument();
    expect(screen.getByText("Log the first one to start the record.")).toBeInTheDocument();
  });

  it("logs against the composer's first creator from 记一条", async () => {
    const user = userEvent.setup();
    state.activities = [activity("creator-b", 0, { id: "b-today" })];
    renderPage();

    await waitFor(() => expect(rowNames()).toEqual(["Bella"]));
    await user.click(screen.getByRole("button", { name: "Log one" }));

    const form = screen.getByRole("form", { name: "Log a follow-up" });
    // The picker only offers creators this page already knows (a follow-up follows
    // an existing relationship), and starts on the first of them.
    expect(within(form).getByRole("combobox", { name: "Creator" })).toBeInTheDocument();
    expect(within(form).getByText("Bella")).toBeInTheDocument();

    await user.click(within(form).getByRole("button", { name: "Replied" }));
    fireEvent.change(within(form).getByLabelText("One line"), {
      target: { value: "She confirmed the slot" },
    });
    await user.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createBdActivity).toHaveBeenCalledTimes(1));
    expect(api.createBdActivity.mock.calls[0]![0]).toMatchObject({
      creator_id: "creator-b",
      summary: "She confirmed the slot",
      outcome: "replied",
      next_follow_at: null,
    });
    // Saving closes the composer.
    await waitFor(() =>
      expect(screen.queryByRole("form", { name: "Log a follow-up" })).not.toBeInTheDocument(),
    );
  });

  it("clamps a long summary to two lines until it is expanded", async () => {
    const user = userEvent.setup();
    const long = `${"She asked about the fee sheet and the shoot window. ".repeat(4)}Done.`;
    state.activities = [activity("creator-a", 0, { id: "a-today", summary: long })];
    renderPage();

    await waitFor(() => expect(rowNames()).toEqual(["Alice"]));
    const row = within(list()).getAllByRole("article")[0]!;
    expect(within(row).getByText(long)).toHaveClass("line-clamp-2");

    await user.click(within(row).getByRole("button", { name: "More" }));
    expect(within(row).getByText(long)).not.toHaveClass("line-clamp-2");
    expect(within(row).getByRole("button", { name: "Less" })).toBeInTheDocument();
  });

  it("shows a page-level error with a retry that reads the ledger again", async () => {
    const user = userEvent.setup();
    api.listBdActivities.mockRejectedValueOnce(new Error("network down"));
    renderPage();

    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.getByText("Nobody to follow up today")).toBeInTheDocument(),
    );
  });
});

/** The one row carrying `id`, whichever tab is drawn. */
function rowById(id: string): HTMLElement | undefined {
  return within(list())
    .getAllByRole("article")
    .find((row) => row.getAttribute("data-row-id") === id);
}

describe("SalesFollowupsPage · 深链 ?followup=", () => {
  it("scrolls to the linked row and marks it", async () => {
    state.activities = [
      activity("creator-a", 0, { id: "a-today" }),
      activity("creator-b", 0, { id: "b-today" }),
    ];
    // jsdom has no layout; the row that is scrolled is the fact under test.
    const scrolled: Element[] = [];
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(function (this: Element) {
        scrolled.push(this);
      });

    renderPage({ followup: "b-today" });

    await waitFor(() => expect(rowNames()).toEqual(["Alice", "Bella"]));
    const target = rowById("b-today")!;
    await waitFor(() => expect(target).toHaveClass("ring-ring/50"));
    expect(scrolled).toContain(target);
    expect(rowById("a-today")).not.toHaveClass("ring-ring/50");

    scrollIntoView.mockRestore();
  });

  it("says the linked row is not in this queue", async () => {
    // The row exists in 全部记录 only, so the default 今天到期 tab cannot draw it.
    state.activities = [activity("creator-c", 0, { id: "c-note", next_follow_at: null })];
    renderPage({ followup: "c-note" });

    expect(await screen.findByRole("status")).toHaveTextContent(
      /That row isn't in the current results/,
    );
    // …and switching to the tab that holds it focuses it, like any deep link.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "All records" }));
    await waitFor(() => expect(rowNames()).toEqual(["Cara"]));
    await waitFor(() => expect(rowById("c-note")).toHaveClass("ring-ring/50"));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("SalesFollowupsPage · 并发 (§3)", () => {
  const SKIP = "Push Alice’s follow-up to tomorrow";

  it("sends the revision it read with 跳过", async () => {
    const user = userEvent.setup();
    state.activities = [activity("creator-a", -2, { id: "a-late", revision: 2 })];
    renderPage();

    await user.click(screen.getByRole("button", { name: "Overdue" }));
    await waitFor(() => expect(rowNames()).toEqual(["Alice"]));
    await user.click(screen.getByRole("button", { name: SKIP }));

    await waitFor(() => expect(api.updateBdActivity).toHaveBeenCalledTimes(1));
    expect(api.updateBdActivity.mock.calls[0]![1]).toEqual({
      next_follow_at: new Date(2026, 10, 19, 10, 0, 0).toISOString(),
      expected_revision: 2,
    });
  });

  it("takes the server's row on a 409 and moves its date next time", async () => {
    const user = userEvent.setup();
    state.activities = [activity("creator-a", -2, { id: "a-late", revision: 2 })];
    // Somebody else already pushed it to today, 09:00.
    const current = activity("creator-a", -2, {
      id: "a-late",
      revision: 5,
      next_follow_at: new Date(2026, 10, 18, 9, 0, 0).toISOString(),
    });
    api.updateBdActivity.mockRejectedValueOnce(new StaleWriteError("conflict", current));
    renderPage();

    await user.click(screen.getByRole("button", { name: "Overdue" }));
    await waitFor(() => expect(rowNames()).toEqual(["Alice"]));
    await user.click(screen.getByRole("button", { name: SKIP }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /Someone else just changed this/,
    );
    // Nothing was replayed: one request, one 409.
    expect(api.updateBdActivity).toHaveBeenCalledTimes(1);

    // The next press moves the date the *server* holds — tomorrow at their hour —
    // and is guarded by their revision.
    await user.click(screen.getByRole("button", { name: SKIP }));
    await waitFor(() => expect(api.updateBdActivity).toHaveBeenCalledTimes(2));
    expect(api.updateBdActivity.mock.calls[1]![1]).toEqual({
      next_follow_at: new Date(2026, 10, 19, 9, 0, 0).toISOString(),
      expected_revision: 5,
    });
  });

  it("judges the stale write before the overwrite reason", async () => {
    const user = userEvent.setup();
    state.activities = [activity("creator-a", -2, { id: "a-late", revision: 2 })];
    api.updateBdActivity.mockRejectedValueOnce(
      new StaleWriteError("conflict", activity("creator-a", -2, { id: "a-late", revision: 5 })),
    );
    renderPage();

    await user.click(screen.getByRole("button", { name: "Overdue" }));
    await waitFor(() => expect(rowNames()).toEqual(["Alice"]));
    await user.click(screen.getByRole("button", { name: SKIP }));

    // A 409 is a refresh, never §26.3's question.
    await screen.findByRole("status");
    expect(screen.queryByText("Why are you changing this?")).toBeNull();

    // The 400 that does ask it opens the dialog and drops the refresh notice.
    api.updateBdActivity.mockRejectedValueOnce(
      new ApiError("overwrite_reason_required", 400, "Bad Request", {
        error: "overwrite_reason_required",
      }),
    );
    await user.click(screen.getByRole("button", { name: SKIP }));

    expect(await screen.findByText("Why are you changing this?")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

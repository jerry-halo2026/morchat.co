import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Creator,
  CreatorPost,
  CreatorPostMetric,
  CreatorVideo,
} from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { ContentDataPage } from "../content-data-page";

/**
 * 数据复盘, over the two altitudes it reads.
 *
 * Three behaviours carry the page:
 *
 *   1. **NULL is not 0.** A cell prints "Not collected" for a missing reading, the
 *      number for a real one, and a *different* cell for a zero — the three
 *      states are asserted through `data-state`, because a screenshot cannot tell
 *      them apart once a class name drifts.
 *   2. **A measure no row answers for is not a column.** It is dropped and named
 *      in the sentence above the table.
 *   3. **The one write is an upsert keyed by day**, and a blank field travels as
 *      `null` so a manually corrected day cannot backfill zeros nobody read.
 */

const api = vi.hoisted(() => ({
  listCreatorPosts: vi.fn(),
  listCreators: vi.fn(),
  listCreatorPostMetrics: vi.fn(),
  listCreatorVideos: vi.fn(),
  upsertCreatorPostMetric: vi.fn(),
}));

const state = vi.hoisted(() => ({
  posts: [] as CreatorPost[],
  creators: [] as Creator[],
  metrics: [] as CreatorPostMetric[],
  videos: [] as CreatorVideo[],
}));

vi.mock("@morechat/core/api", () => ({ api }));

vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

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
    pathname: "/acme/content/data",
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

const WS = "ws-1";

// A row that takes a second to appear on a loaded box is slow, not broken: the
// one-second ceiling `waitFor` applies by default is too tight for a page that
// resolves two ledgers and a per-post series before it draws.
configure({ asyncUtilTimeout: 5_000 });

function post(overrides: Partial<CreatorPost> & Pick<CreatorPost, "id">): CreatorPost {
  return {
    workspace_id: WS,
    creator_id: "c-1",
    collab_id: null,
    content_issue_id: null,
    product_id: null,
    pick_id: null,
    media_script_id: null,
    platform: "douyin",
    title: "三个收纳误区",
    url: "https://www.douyin.com/video/7001",
    published_at: "2026-11-15T12:00:00Z",
    source: "manual",
    created_by: null,
    created_at: "2026-11-15T12:00:00Z",
    updated_at: "2026-11-15T12:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function metric(
  overrides: Partial<CreatorPostMetric> & Pick<CreatorPostMetric, "id" | "captured_on">,
): CreatorPostMetric {
  return {
    workspace_id: WS,
    post_id: "p-1",
    play: null,
    likes: null,
    comments: null,
    shares: null,
    clicks: null,
    converts: null,
    gmv_amount: null,
    currency: "CNY",
    source: "manual",
    created_at: "2026-11-18T02:00:00Z",
    updated_at: "2026-11-18T02:00:00Z",
    ...overrides,
  };
}

function video(overrides: Partial<CreatorVideo> & Pick<CreatorVideo, "id">): CreatorVideo {
  return {
    workspace_id: WS,
    creator_id: "c-1",
    aweme_id: overrides.id,
    desc_text: "今天聊三个收纳误区",
    topics: ["收纳"],
    create_time: "2026-11-10T09:00:00Z",
    duration_ms: null,
    digg_count: null,
    comment_count: null,
    share_count: null,
    play_count: null,
    cover_url: null,
    video_url: null,
    stats_collected_at: null,
    source_system: null,
    source_id: null,
    created_at: "2026-11-10T09:00:00Z",
    updated_at: "2026-11-10T09:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function creator(id: string, displayName: string): Creator {
  return {
    id,
    workspace_id: WS,
    kind: "owned",
    display_name: displayName,
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <ContentDataPage />
    </QueryClientProvider>,
  );
}

const seriesGrid = () => screen.getByRole("grid", { name: "Snapshots for this post" });
const videosGrid = () => screen.getByRole("grid", { name: "Recent works" });
const bodyRows = (grid: HTMLElement) =>
  within(grid)
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("gridcell").length > 0);
const cellsOf = (row: HTMLElement) => within(row).getAllByRole("gridcell");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 18, 9, 0, 0));
  state.posts = [post({ id: "p-1" })];
  state.creators = [creator("c-1", "Lin")];
  state.metrics = [];
  state.videos = [];
  api.listCreatorPosts.mockImplementation(async () => ({
    posts: state.posts,
    total: state.posts.length,
  }));
  api.listCreators.mockImplementation(async () => ({
    creators: state.creators,
    total: state.creators.length,
    next_cursor: null,
  }));
  api.listCreatorPostMetrics.mockImplementation(async () => ({
    metrics: state.metrics,
    total: state.metrics.length,
  }));
  api.listCreatorVideos.mockImplementation(async () => ({
    videos: state.videos,
    total: state.videos.length,
  }));
  api.upsertCreatorPostMetric.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ContentDataPage · the snapshot series", () => {
  it("keeps a missing reading, a zero and a number apart in one table", async () => {
    state.metrics = [
      metric({ id: "m-18", captured_on: "2026-11-18", play: 1500, likes: 0 }),
      metric({ id: "m-17", captured_on: "2026-11-17", play: 1200 }),
    ];
    renderPage();

    await waitFor(() => expect(bodyRows(seriesGrid())).toHaveLength(2));
    const [older, newer] = bodyRows(seriesGrid());

    // Oldest day first: the series reads left to right.
    expect(cellsOf(older!)[0]).toHaveTextContent("Nov 17, 2026");
    expect(cellsOf(newer!)[0]).toHaveTextContent("Nov 18, 2026");

    // A real reading.
    expect(cellsOf(older!)[1]).toHaveTextContent("1,200");
    expect(cellsOf(older!)[1]?.querySelector("[data-slot]")).toHaveAttribute(
      "data-state",
      "value",
    );

    // Nothing was collected for that day's likes: a word, not a zero.
    expect(cellsOf(older!)[2]).toHaveTextContent("Not collected");
    expect(cellsOf(older!)[2]?.querySelector("[data-slot]")).toHaveAttribute(
      "data-state",
      "insufficient_data",
    );

    // A zero the platform actually reported: a number, in its own state.
    expect(cellsOf(newer!)[2]).toHaveTextContent("0");
    expect(cellsOf(newer!)[2]?.querySelector("[data-slot]")).toHaveAttribute(
      "data-state",
      "zero",
    );
  });

  it("names the measures no snapshot answers for instead of drawing empty columns", async () => {
    state.metrics = [metric({ id: "m-18", captured_on: "2026-11-18", play: 1500 })];
    renderPage();

    expect(
      await screen.findByText(
        "Not reported by the platform: Likes · Comments · Shares · Clicks · Conversions",
      ),
    ).toBeInTheDocument();
    // …and the columns themselves are gone, not blank.
    expect(
      within(seriesGrid())
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Day", "Plays"]);
  });

  it("says the post has no snapshot yet rather than showing an empty grid", async () => {
    renderPage();

    expect(await screen.findByText("No snapshot for this post yet")).toBeInTheDocument();
    expect(
      screen.getByText("Add a day by hand, or wait for the next collection run."),
    ).toBeInTheDocument();
  });
});

describe("ContentDataPage · the manual snapshot", () => {
  it("upserts one day and sends a blank field as null, never as zero", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Add a day" }));

    const day = await screen.findByLabelText("Day");
    fireEvent.change(day, { target: { value: "2026-11-19" } });
    fireEvent.change(screen.getByLabelText("Plays"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Likes"), { target: { value: "0" } });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.upsertCreatorPostMetric).toHaveBeenCalledTimes(1));
    expect(api.upsertCreatorPostMetric).toHaveBeenCalledWith("p-1", {
      captured_on: "2026-11-19",
      play: 120,
      // A zero was typed, so a zero travels…
      likes: 0,
      // …and the untouched fields stay uncollected.
      comments: null,
      shares: null,
      clicks: null,
      converts: null,
    });
  });

  it("keeps the dialog open and says so when the snapshot is refused", async () => {
    api.upsertCreatorPostMetric.mockRejectedValueOnce(new Error("boom"));
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Add a day" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("The snapshot wasn’t saved. Try again."),
    ).toBeInTheDocument();
  });
});

describe("ContentDataPage · by creator", () => {
  it("shows the three states on a work's counters and names the counters it lacks", async () => {
    state.videos = [
      video({ id: "v-1", digg_count: 12 }),
      video({ id: "v-2", digg_count: 0 }),
      video({ id: "v-3", digg_count: null }),
    ];
    renderPage();

    await waitFor(() => expect(bodyRows(videosGrid())).toHaveLength(3));
    const rows = bodyRows(videosGrid());

    // Counters no work answers for (plays, comments, shares) are not columns.
    expect(
      within(videosGrid())
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Work", "Published", "Likes"]);
    expect(
      await screen.findByText("Not reported by the platform: Plays · Comments · Shares"),
    ).toBeInTheDocument();

    const states = rows.map((row) =>
      cellsOf(row)[2]?.querySelector("[data-slot]")?.getAttribute("data-state"),
    );
    expect(states).toEqual(["value", "zero", "insufficient_data"]);
    expect(cellsOf(rows[2]!)[2]).toHaveTextContent("Not collected");
  });

  it("reads the newest works of the selected creator", async () => {
    state.videos = [video({ id: "v-1", digg_count: 12 })];
    renderPage();

    await waitFor(() => expect(api.listCreatorVideos).toHaveBeenCalledWith("c-1", 20));
  });

  it("does not sit in a loading state when there is no creator to read", async () => {
    state.posts = [post({ id: "p-1" })];
    state.creators = [];
    state.metrics = [metric({ id: "m-18", captured_on: "2026-11-18", play: 1500 })];
    renderPage();

    // The per-post half still reads…
    await waitFor(() => expect(bodyRows(seriesGrid())).toHaveLength(1));
    // …and the works half states the absence instead of drawing skeletons for a
    // query that is disabled and will never run.
    expect(await screen.findByText("No post data yet")).toBeInTheDocument();
  });
});

describe("ContentDataPage · the page states", () => {
  it("says there is nothing collected yet when no post and no creator exists", async () => {
    state.posts = [];
    state.creators = [];
    renderPage();

    expect(await screen.findByText("No post data yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The first collection fills this page: one row per capture day, per post.",
      ),
    ).toBeInTheDocument();
  });

  it("offers a retry when a read fails", async () => {
    api.listCreatorPosts.mockRejectedValueOnce(new Error("boom"));
    renderPage();

    expect(await screen.findByText("Couldn’t load the data")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.listCreatorPosts).toHaveBeenCalledTimes(2));
  });
});

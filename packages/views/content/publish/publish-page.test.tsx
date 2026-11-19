import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Creator, CreatorPost, MediaScript } from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { ContentPublishPage } from "../content-publish-page";

/**
 * 发布排期, over the three reads and the two writes it owns.
 *
 * The behaviours under test are the ones this page is easy to get wrong on:
 *
 *   - the queue is folded into **local days**, and a script with no `publish_at`
 *     is a group of its own rather than a day;
 *   - only `approved` rows are shown and only that set is asked for;
 *   - a changed publish time is a **PATCH in place** (`inPlace: true`) — the
 *     default call would fork a new script version for what is a scheduling
 *     decision — and it is one request per edit, not one per keystroke;
 *   - "move to publishing" writes the **topic**, because the script statuses have
 *     no `publishing` stage;
 *   - the published table has no column for `media_script_id`, which the response
 *     does not carry yet.
 *
 * The clock is pinned (only `Date` is faked) so the "today" band and the day
 * labels are decidable; every instant in a fixture is built from a local
 * wall clock for the same reason.
 */

const api = vi.hoisted(() => ({
  listMediaScripts: vi.fn(),
  listCreatorPosts: vi.fn(),
  listCreators: vi.fn(),
  updateMediaScript: vi.fn(),
  updateMediaTopic: vi.fn(),
}));

const state = vi.hoisted(() => ({
  scripts: [] as MediaScript[],
  /**
   * The posts as the server sends them: `media_script_id` is on the wire
   * (`CreatorPostResponse`) but not yet on the `CreatorPost` type, so the fixture
   * carries it without pretending the type does.
   */
  posts: [] as (CreatorPost & { media_script_id?: string | null })[],
  creators: [] as Creator[],
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
    pathname: "/acme/content/publish",
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
// resolves three reads before it can draw its first row.
configure({ asyncUtilTimeout: 5_000 });

/** A local wall-clock instant, so a fixture states the day it means. */
function localAt(month: number, day: number, hour: number, minute = 0): string {
  return new Date(2026, month - 1, day, hour, minute, 0).toISOString();
}

/** The label the queue prints for a day, formatted the way the page formats it. */
function dayLabel(month: number, day: number): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(2026, month - 1, day));
}

function script(overrides: Partial<MediaScript> & Pick<MediaScript, "id">): MediaScript {
  return {
    workspace_id: WS,
    topic_id: `topic-${overrides.id}`,
    ip_id: null,
    version: 1,
    hook: null,
    body: null,
    cta: null,
    cover_note: null,
    tags: [],
    status: "approved",
    publish_at: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function post(
  overrides: Partial<CreatorPost & { media_script_id: string | null }> &
    Pick<CreatorPost, "id">,
): CreatorPost & { media_script_id: string | null } {
  return {
    workspace_id: WS,
    creator_id: "c-1",
    collab_id: null,
    content_issue_id: null,
    product_id: null,
    pick_id: null,
    platform: "douyin",
    title: "三个收纳误区",
    url: "https://www.douyin.com/video/7001",
    published_at: localAt(11, 15, 20),
    source: "manual",
    created_by: null,
    created_at: "2026-11-15T12:00:00Z",
    updated_at: "2026-11-15T12:00:00Z",
    archived_at: null,
    media_script_id: null,
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
      <ContentPublishPage />
    </QueryClientProvider>,
  );
}

const queueGrid = () => screen.getByRole("grid", { name: "To publish" });
const publishedGrid = () => screen.getByRole("grid", { name: "Published" });
/**
 * The data rows of a grid: the sticky header carries column headers, a day band
 * carries a row header, and only a row with cells is a row.
 */
const bodyRows = (grid: HTMLElement) =>
  within(grid)
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("gridcell").length > 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 18, 9, 0, 0));
  state.scripts = [];
  state.posts = [];
  state.creators = [];
  api.listMediaScripts.mockImplementation(async () => ({
    scripts: state.scripts,
    total: state.scripts.length,
  }));
  api.listCreatorPosts.mockImplementation(async () => ({
    posts: state.posts,
    total: state.posts.length,
  }));
  api.listCreators.mockImplementation(async () => ({
    creators: state.creators,
    total: state.creators.length,
    next_cursor: null,
  }));
  api.updateMediaScript.mockResolvedValue({});
  api.updateMediaTopic.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ContentPublishPage · the queue", () => {
  it("folds the approved scripts into local days and says where plays come from", async () => {
    state.scripts = [
      script({ id: "s-19", hook: "收纳的三个误区", publish_at: localAt(11, 19, 18) }),
      script({ id: "s-18", hook: "今天在家烤面包", publish_at: localAt(11, 18, 10) }),
      script({ id: "s-none", hook: "还没排期的脚本", updated_at: "2026-11-16T00:00:00Z" }),
    ];
    renderPage();

    await waitFor(() => expect(bodyRows(queueGrid())).toHaveLength(3));
    // A band's header is its day label, then the row count in its own span.
    expect(
      within(queueGrid())
        .getAllByRole("rowheader")
        .map((header) => header.querySelector("span")?.textContent),
    ).toEqual([`Today · ${dayLabel(11, 18)}`, dayLabel(11, 19), "No date yet"]);

    // Ordered by day, and the undated row is in the last band, not first.
    expect(bodyRows(queueGrid()).map((row) => row.textContent)).toEqual([
      "今天在家烤面包v1",
      "收纳的三个误区v1",
      "还没排期的脚本v1",
    ]);

    // The page states its one constraint once, above the queue.
    expect(
      screen.getByText(
        "Plays, likes and the rest come from the platform’s own collection — nothing is typed in here.",
      ),
    ).toBeInTheDocument();
  });

  it("asks the server for approved scripts only, and drops any other row it returns", async () => {
    state.scripts = [
      script({ id: "s-ok", hook: "通过的脚本" }),
      script({ id: "s-draft", hook: "还在草稿", status: "draft" }),
    ];
    renderPage();

    await waitFor(() => expect(bodyRows(queueGrid())).toHaveLength(1));
    expect(api.listMediaScripts).toHaveBeenCalledWith({ status: "approved", limit: 200 });
    expect(screen.queryByText("还在草稿")).toBeNull();
  });

  it("shows the two empty states instead of a blank page", async () => {
    renderPage();

    expect(await screen.findByText("No approved scripts")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A script waits here once its status is approved; the script page is where that happens.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("No published records yet")).toBeInTheDocument();
    // The header names the page even with nothing in it.
    expect(screen.getByRole("heading", { name: "Publishing" })).toBeInTheDocument();
  });
});

describe("ContentPublishPage · scheduling", () => {
  it("saves a new publish time in place, once, with the instant the field names", async () => {
    state.scripts = [script({ id: "s-1", hook: "收纳的三个误区", publish_at: localAt(11, 19, 18) })];
    renderPage();

    const field = await screen.findByLabelText("Publish time: 收纳的三个误区");
    expect(field).toHaveValue("2026-11-19T18:00");

    fireEvent.change(field, { target: { value: "2026-11-20T18:00" } });
    fireEvent.focusOut(field);

    await waitFor(() => expect(api.updateMediaScript).toHaveBeenCalledTimes(1));
    expect(api.updateMediaScript).toHaveBeenCalledWith(
      "s-1",
      // A scheduling change must not fork a script version: `inPlace` is the flag
      // that says "rewrite this row".
      { publish_at: new Date(2026, 10, 20, 18, 0, 0).toISOString() },
      true,
    );
  });

  it("does not send a request when the field still holds the stored time", async () => {
    state.scripts = [script({ id: "s-1", hook: "收纳的三个误区", publish_at: localAt(11, 19, 18) })];
    renderPage();

    const field = await screen.findByLabelText("Publish time: 收纳的三个误区");
    fireEvent.focusOut(field);

    expect(api.updateMediaScript).not.toHaveBeenCalled();
  });

  it("moves the script's topic to the publishing stage from the row menu", async () => {
    state.scripts = [
      script({ id: "s-1", topic_id: "topic-42", hook: "收纳的三个误区", publish_at: localAt(11, 19, 18) }),
    ];
    renderPage();

    await waitFor(() => expect(bodyRows(queueGrid())).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "Row actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Move to publishing" }));

    await waitFor(() => expect(api.updateMediaTopic).toHaveBeenCalledTimes(1));
    expect(api.updateMediaTopic).toHaveBeenCalledWith("topic-42", { status: "publishing" });
    // The script's own status is not part of that write: it has no such stage.
    expect(api.updateMediaScript).not.toHaveBeenCalled();
  });

  it("says so when the publish time is refused", async () => {
    state.scripts = [script({ id: "s-1", hook: "收纳的三个误区", publish_at: localAt(11, 19, 18) })];
    api.updateMediaScript.mockRejectedValueOnce(new Error("nope"));
    renderPage();

    const field = await screen.findByLabelText("Publish time: 收纳的三个误区");
    fireEvent.change(field, { target: { value: "2026-11-20T18:00" } });
    fireEvent.focusOut(field);

    expect(
      await screen.findByText("The publish time wasn’t saved. Try again."),
    ).toBeInTheDocument();
  });
});

describe("ContentPublishPage · the published side", () => {
  it("draws platform, title, link, time, creator and the linked script", async () => {
    state.creators = [creator("c-1", "Lin")];
    state.scripts = [script({ id: "script-1", hook: "收纳的三个误区", version: 2 })];
    state.posts = [post({ id: "p-1", creator_id: "c-1", media_script_id: "script-1" })];
    renderPage();

    await waitFor(() => expect(bodyRows(publishedGrid())).toHaveLength(1));

    expect(
      within(publishedGrid())
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Title", "Link", "Published", "Creator", "Linked script"]);

    const row = bodyRows(publishedGrid())[0];
    expect(row).toBeDefined();
    const cells = within(row!).getAllByRole("gridcell");
    expect(cells[0]).toHaveTextContent("三个收纳误区");
    expect(cells[0]).toHaveTextContent("douyin");
    // The link prints the host; the whole URL stays on the anchor.
    const link = within(cells[1]!).getByRole("link");
    expect(link).toHaveTextContent("www.douyin.com");
    expect(link).toHaveAttribute("href", "https://www.douyin.com/video/7001");
    expect(cells[3]).toHaveTextContent("Lin");
    // The script it came from: its version, then its opening line.
    expect(cells[4]).toHaveTextContent("v2 · 收纳的三个误区");
    expect(cells[4]?.querySelector("[data-slot]")).toHaveAttribute("data-state", "linked");
  });

  it("prints a dash for a post whose creator is not in the ledger", async () => {
    state.posts = [post({ id: "p-1", creator_id: "gone" })];
    renderPage();

    await waitFor(() => expect(bodyRows(publishedGrid())).toHaveLength(1));
    const row = bodyRows(publishedGrid())[0];
    expect(within(row!).getAllByRole("gridcell")[3]).toHaveTextContent("—");
  });

  it("says a post has no script instead of printing an empty cell", async () => {
    state.posts = [post({ id: "p-1", media_script_id: null })];
    renderPage();

    await waitFor(() => expect(bodyRows(publishedGrid())).toHaveLength(1));
    const cell = within(bodyRows(publishedGrid())[0]!).getAllByRole("gridcell")[4];
    expect(cell).toHaveTextContent("Not linked");
    expect(cell?.querySelector("[data-slot]")).toHaveAttribute("data-state", "unlinked");
  });

  it("falls back to the short id when the script is outside the list this page reads", async () => {
    // The mapping is built from the newest 200 scripts; an older version is not
    // in it, and the row still states which script it came from.
    state.scripts = [];
    state.posts = [
      post({ id: "p-1", media_script_id: "0192f3a4-5b6c-7d8e-9f00-112233445566" }),
    ];
    renderPage();

    await waitFor(() => expect(bodyRows(publishedGrid())).toHaveLength(1));
    const cell = within(bodyRows(publishedGrid())[0]!).getAllByRole("gridcell")[4];
    expect(cell).toHaveTextContent("0192f3a4");
    expect(cell?.querySelector("[data-slot]")).toHaveAttribute("data-state", "unresolved");
    // The whole id stays reachable on hover rather than being thrown away.
    expect(cell?.querySelector("[data-slot]")).toHaveAttribute(
      "title",
      "0192f3a4-5b6c-7d8e-9f00-112233445566",
    );
  });

  it("reads the whole script list once, so an archived or draft version can still be named", async () => {
    state.scripts = [script({ id: "script-1", status: "archived", hook: "收纳的三个误区" })];
    state.posts = [post({ id: "p-1", media_script_id: "script-1" })];
    renderPage();

    await waitFor(() => expect(bodyRows(publishedGrid())).toHaveLength(1));
    // Two reads: the queue's approved-only set, and the unfiltered map.
    expect(api.listMediaScripts).toHaveBeenCalledWith({ status: "approved", limit: 200 });
    expect(api.listMediaScripts).toHaveBeenCalledWith({ limit: 200 });
    const cell = within(bodyRows(publishedGrid())[0]!).getAllByRole("gridcell")[4];
    expect(cell).toHaveTextContent("v1 · 收纳的三个误区");
  });
});

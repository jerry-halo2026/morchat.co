import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MediaScript, MediaTopic } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { ContentScriptsPage } from "../content-scripts-page";

/**
 * 文案工坊 (`/{slug}/content/scripts`) — a topic's script, and the versions it took.
 *
 * The behaviour worth pinning is §12.4's: the list is grouped by topic with the
 * latest version marked, opening a version is a *read*, rewriting the copy is a
 * POST that mints the next version, and moving a version's status is a PATCH that
 * sends those fields alone. The last two assertions are the ones a regression
 * would break silently — a "save" that PATCHes the body would look identical on
 * screen and quietly overwrite history.
 *
 * The clock is pinned to 2026-11-18 because `publish_at` is printed on the
 * reader's calendar.
 */

const WS = "ws-1";
const NOW = new Date(2026, 10, 18, 15, 0, 0);

const api = vi.hoisted(() => ({
  listMediaScripts: vi.fn(),
  listMediaTopics: vi.fn(),
  listMembers: vi.fn(),
  createMediaScript: vi.fn(),
  updateMediaScript: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const viewer = vi.hoisted(() => ({
  role: "admin" as "owner" | "admin" | "member" | null,
}));

vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: "user-1",
    role: viewer.role,
    member: null,
    isLoading: false,
  }),
}));

let seq = 0;

function script(overrides: Partial<MediaScript> = {}): MediaScript {
  seq += 1;
  return {
    id: `s-${seq}`,
    workspace_id: WS,
    topic_id: "t-1",
    ip_id: null,
    version: 1,
    hook: null,
    body: null,
    cta: null,
    cover_note: null,
    tags: [],
    status: "draft",
    publish_at: null,
    owner_member_id: "m-1",
    created_by: "m-1",
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function topic(id: string, title: string): MediaTopic {
  return {
    id,
    workspace_id: WS,
    ip_id: "ip-1",
    title,
    source: "manual",
    scores: { pain: 0, save: 0, debate: 0, susp: 0, fit: 0 },
    status: "scripting",
    hot_id: null,
    note: null,
    owner_member_id: "m-1",
    created_by: "m-1",
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    archived_at: null,
  };
}

function adapter(): NavigationAdapter {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    pathname: "/acme/content/scripts",
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
        <ContentScriptsPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

function serve(scripts: readonly MediaScript[], topics: readonly MediaTopic[] = []) {
  api.listMediaScripts.mockResolvedValue({ scripts: [...scripts], total: scripts.length });
  api.listMediaTopics.mockResolvedValue({ topics: [...topics], total: topics.length });
  api.listMembers.mockResolvedValue([]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  viewer.role = "admin";
  serve([]);
  api.createMediaScript.mockImplementation((data: { topic_id: string }) =>
    Promise.resolve(script({ topic_id: data.topic_id, version: 3 })),
  );
  api.updateMediaScript.mockResolvedValue(script({ version: 2, status: "approved" }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ContentScriptsPage · 空", () => {
  it("says there is no script instead of drawing an empty grid", async () => {
    renderPage();

    expect(
      await screen.findByText("No script yet — pick a topic and start writing"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
    // The header action and the state's own action, which is the page's one write.
    expect(screen.getAllByRole("button", { name: "New script" })).toHaveLength(2);
  });

  it("cannot offer the create action while there is no topic to write from", async () => {
    renderPage();

    const create = await screen.findByRole("button", { name: "New script" });
    expect(create).toBeDisabled();
    expect(create).toHaveAttribute("title", "No topic to write from yet");
  });
});

describe("ContentScriptsPage · 按选题分组", () => {
  it("bands each topic, newest version first, and marks the latest", async () => {
    serve(
      [
        script({ id: "a1", topic_id: "t-1", version: 1, hook: "第一版钩子" }),
        script({ id: "a3", topic_id: "t-1", version: 3, hook: "第三版钩子" }),
        script({ id: "a2", topic_id: "t-1", version: 2, hook: "第二版钩子" }),
        script({ id: "b1", topic_id: "t-2", version: 1, hook: "另一条选题" }),
      ],
      [topic("t-1", "租房避坑三件事"), topic("t-2", "洗衣机怎么选")],
    );
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(4));

    expect(screen.getByText("租房避坑三件事")).toBeInTheDocument();
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    expect(screen.getByText("1 version")).toBeInTheDocument();

    // Each band's rows are that topic's versions, v3 → v1.
    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent("v3");
    expect(rows[1]).toHaveTextContent("v2");
    expect(rows[2]).toHaveTextContent("v1");
    expect(rows[3]).toHaveTextContent("v1");
    // Only the newest of each chain carries the badge.
    expect(within(rows[0]!).getByText("Latest")).toBeInTheDocument();
    expect(within(rows[1]!).queryByText("Latest")).toBeNull();
    expect(within(rows[3]!).getByText("Latest")).toBeInTheDocument();
    // The excerpt is the copy's first written line.
    expect(rows[0]).toHaveTextContent("第三版钩子");
  });

  it("says so when two live rows claim the same version number", async () => {
    serve(
      [
        script({ id: "dup-a", version: 2 }),
        script({ id: "dup-b", version: 2, created_at: "2026-11-02T02:00:00Z" }),
        script({ id: "v1", version: 1 }),
      ],
      [topic("t-1", "租房避坑三件事")],
    );
    renderPage();

    expect(await screen.findByText("v2 is claimed by two rows")).toBeInTheDocument();
  });
});

describe("ContentScriptsPage · 版本是只读的", () => {
  it("opens a version as a reader, with no text box over the stored copy", async () => {
    serve(
      [
        script({ id: "v2", version: 2, hook: "钩子", body: "存下来的正文", status: "review" }),
        script({ id: "v1", version: 1, hook: "旧钩子" }),
      ],
      [topic("t-1", "租房避坑三件事")],
    );
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    await userEvent.click(bodyRows()[0]!);

    expect(await screen.findByText("存下来的正文")).toBeInTheDocument();
    // Nothing editable over a saved version: the only way forward is a new one.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Write v3" })).toBeInTheDocument();
  });

  it("mints the next version with a POST instead of patching the old one", async () => {
    serve(
      [
        script({
          id: "v2",
          version: 2,
          hook: "钩子",
          body: "存下来的正文",
          tags: ["租房"],
          status: "review",
        }),
      ],
      [topic("t-1", "租房避坑三件事")],
    );
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    await userEvent.click(bodyRows()[0]!);
    await userEvent.click(await screen.findByRole("button", { name: "Write v3" }));

    const body = await screen.findByRole("textbox", { name: "Body" });
    expect(body).toHaveValue("存下来的正文");
    await userEvent.type(body, "，补一句");
    await userEvent.click(screen.getByRole("button", { name: "Save as v3" }));

    await waitFor(() => expect(api.createMediaScript).toHaveBeenCalledTimes(1));
    const payload = api.createMediaScript.mock.calls[0]![0];
    expect(payload.topic_id).toBe("t-1");
    expect(payload.body).toBe("存下来的正文，补一句");
    expect(payload.hook).toBe("钩子");
    expect(payload.tags).toEqual(["租房"]);
    // Same version chain, new row: the stored v2 is never rewritten.
    expect(payload.status).toBe("review");
    expect(api.updateMediaScript).not.toHaveBeenCalled();
  });

  it("moves a version's status in place with the two fields alone", async () => {
    serve([script({ id: "v2", version: 2, status: "review" })], [topic("t-1", "租房避坑三件事")]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    await userEvent.click(bodyRows()[0]!);
    await userEvent.click(await screen.findByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByRole("option", { name: "Approved" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.updateMediaScript).toHaveBeenCalledTimes(1));
    expect(api.updateMediaScript).toHaveBeenCalledWith(
      "v2",
      { status: "approved", publish_at: "" },
      false,
    );
    expect(api.createMediaScript).not.toHaveBeenCalled();
  });
});

describe("ContentScriptsPage · 加载与错误", () => {
  it("draws the grid's skeleton while the versions are on their way", async () => {
    api.listMediaScripts.mockImplementation(() => new Promise(() => {}));
    renderPage();

    const grid = await screen.findByRole("grid", { name: "Scripts" });
    expect(grid).toHaveAttribute("aria-busy", "true");
    expect(bodyRows()).toHaveLength(0);
  });

  it("states the failure once for the page and retries it", async () => {
    api.listMediaScripts.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByText("Couldn't load this page")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();

    serve([], [topic("t-1", "租房避坑三件事")]);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("No script yet — pick a topic and start writing"),
    ).toBeInTheDocument();
  });
});

describe("ContentScriptsPage · 无写权限", () => {
  it("draws the versions but no create action and no group action", async () => {
    viewer.role = null;
    serve([script({ id: "v1", version: 1 })], [topic("t-1", "租房避坑三件事")]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "New script" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Write v2" })).toBeNull();
  });
});

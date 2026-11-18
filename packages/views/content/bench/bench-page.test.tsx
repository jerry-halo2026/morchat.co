import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdoptMediaRequest,
  CreateMediaBenchRequest,
  MediaBench,
  MediaIP,
  MediaTopic,
} from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { ContentBenchPage } from "../content-bench-page";

/**
 * 对标拆解 (`/{slug}/content/bench`) — one row per captured peer account.
 *
 * The API is mocked at `@morechat/core/api`. What is asserted is what the two
 * loose columns mean on screen (`metrics` as stored, unknown key and all; a
 * missing follower count as "not collected") plus the writes: the create payload
 * with its parsed metrics, the adoption's landing place, and the confirmed
 * delete.
 */

const push = vi.fn();

const api = vi.hoisted(() => ({
  listMediaBench: vi.fn(),
  listMediaIPs: vi.fn(),
  createMediaBench: vi.fn(),
  updateMediaBench: vi.fn(),
  deleteMediaBench: vi.fn(),
  adoptMediaBench: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: "user-1",
    role: "owner" as const,
    member: null,
    isLoading: false,
  }),
}));
vi.mock("@morechat/core/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@morechat/core/paths")>();
  return {
    ...actual,
    useWorkspacePaths: () => ({
      content: {
        studio: () => "/acme/content",
        ips: () => "/acme/content/ips",
        hot: () => "/acme/content/hot",
        bench: () => "/acme/content/bench",
        topics: () => "/acme/content/topics",
        scripts: () => "/acme/content/scripts",
        shoots: () => "/acme/content/shoots",
        publish: () => "/acme/content/publish",
        data: () => "/acme/content/data",
      },
    }),
  };
});

function ip(id: string, name: string): MediaIP {
  return {
    id,
    workspace_id: "ws-1",
    name,
    persona: null,
    track: null,
    audience: null,
    color: null,
    week_goal: 0,
    status: "active",
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
  };
}

function bench(overrides: Partial<MediaBench> = {}): MediaBench {
  return {
    id: "b-1",
    workspace_id: "ws-1",
    ip_id: "ip-a",
    platform: "xiaohongshu",
    name: "厨房笔记",
    url: "https://www.xiaohongshu.com/user/profile/abc",
    follower_count: 128000,
    metrics: { plays: 52000, likes: 1200, favorites: 800, comments: 96, zhang: 40 },
    captured_on: "2026-11-18",
    note: "偏收藏型",
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-18T02:00:00Z",
    updated_at: "2026-11-18T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function topic(overrides: Partial<MediaTopic> = {}): MediaTopic {
  return {
    id: "t-new",
    workspace_id: "ws-1",
    ip_id: "ip-a",
    title: "厨房笔记",
    source: "bench",
    scores: { pain: 0, save: 0, debate: 0, susp: 0, fit: 0 },
    status: "pool",
    hot_id: null,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-18T03:00:00Z",
    updated_at: "2026-11-18T03:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function adapter(): NavigationAdapter {
  return {
    push,
    replace: () => {},
    back: () => {},
    pathname: "/acme/content/bench",
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
        <ContentBenchPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

function serve(rows: readonly MediaBench[]) {
  api.listMediaBench.mockResolvedValue({ bench: [...rows], total: rows.length });
  api.listMediaIPs.mockResolvedValue({
    ips: [ip("ip-a", "厨房号"), ip("ip-b", "户外实验室")],
    total: 2,
  });
}

beforeEach(() => {
  push.mockReset();
  serve([]);
  api.createMediaBench.mockResolvedValue(bench({ id: "b-new" }));
  api.updateMediaBench.mockResolvedValue(bench());
  api.deleteMediaBench.mockResolvedValue(undefined);
  api.adoptMediaBench.mockResolvedValue(topic());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ContentBenchPage · the teardown list", () => {
  it("says there is no sample yet and offers to record one", async () => {
    renderPage();

    expect(await screen.findByText("No benchmark account yet")).toBeInTheDocument();
    expect(
      screen.getByText("Record one account to read its numbers against an IP."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add benchmark" })).toHaveLength(2);
  });

  it("states an account's platform, profile, followers, metrics, day and IP", async () => {
    serve([bench()]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    const row = bodyRows()[0]!;
    expect(row).toHaveTextContent("厨房笔记");
    expect(row).toHaveTextContent("xiaohongshu");
    expect(row).toHaveTextContent("偏收藏型");
    expect(row).toHaveTextContent("128,000");
    expect(row).toHaveTextContent("2026-11-18");
    // The IP column names the persona, not its id.
    expect(row).toHaveTextContent("厨房号");
  });

  it("draws metrics as stored: the known keys by name, an unknown one raw", async () => {
    serve([bench()]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    const row = bodyRows()[0]!;
    expect(row).toHaveTextContent("Plays");
    expect(row).toHaveTextContent("52,000");
    expect(row).toHaveTextContent("Saves");
    expect(row).toHaveTextContent("zhang");
    expect(row).toHaveTextContent("40");
  });

  it("keeps a missing follower count and empty metrics as not collected", async () => {
    serve([bench({ follower_count: null, metrics: {} })]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(within(bodyRows()[0]!).getAllByText("Not collected")).toHaveLength(2);
  });

  it("opens the profile in a new tab with rel=noreferrer noopener", async () => {
    serve([bench()]);
    renderPage();

    const link = await screen.findByRole("link", { name: "www.xiaohongshu.com" });
    expect(link).toHaveAttribute("href", "https://www.xiaohongshu.com/user/profile/abc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
  });

  it("filters by IP through the server", async () => {
    serve([bench()]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await userEvent.click(screen.getByRole("combobox", { name: "IP" }));
    await userEvent.click(await screen.findByRole("option", { name: "户外实验室" }));

    await waitFor(() =>
      expect(api.listMediaBench).toHaveBeenLastCalledWith(
        expect.objectContaining({ ip_id: "ip-b", limit: 200 }),
      ),
    );
  });

  it("searches account names through the server", async () => {
    serve([bench()]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await userEvent.type(screen.getByLabelText("Search accounts"), "厨房");

    await waitFor(() =>
      expect(api.listMediaBench).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "厨房" }),
      ),
    );
  });

  it("shows a load failure with a retry", async () => {
    api.listMediaBench.mockRejectedValue(new Error("nope"));
    renderPage();

    expect(await screen.findByText("Couldn't load this list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("ContentBenchPage · writing", () => {
  it("records an account with its metrics parsed from the text", async () => {
    const user = userEvent.setup();
    renderPage();

    const [create] = await screen.findAllByRole("button", { name: "Add benchmark" });
    await user.click(create!);
    await user.type(await screen.findByLabelText("Account"), "厨房笔记");
    await user.type(screen.getByLabelText("Platform"), "xiaohongshu");
    await user.type(screen.getByLabelText("Followers"), "128000");
    await user.type(screen.getByLabelText("Metrics"), "plays: 52000{enter}zhang: 40");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createMediaBench).toHaveBeenCalledTimes(1));
    const payload = api.createMediaBench.mock.calls[0]![0] as CreateMediaBenchRequest;
    expect(payload).toMatchObject({
      name: "厨房笔记",
      platform: "xiaohongshu",
      follower_count: 128000,
      metrics: { plays: 52000, zhang: 40 },
    });
  });

  it("deletes an account only after the confirmation", async () => {
    const user = userEvent.setup();
    serve([bench()]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("leaves the teardown list");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.deleteMediaBench).toHaveBeenCalledWith("b-1"));
  });
});

describe("ContentBenchPage · adopting", () => {
  it("adopts against the account's own IP and links to the new topic", async () => {
    const user = userEvent.setup();
    serve([bench({ ip_id: "ip-a", name: "厨房笔记" })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Adopt as topic" }));
    // The dialog opens on the account's name and its own IP.
    expect(await screen.findByLabelText("Title")).toHaveValue("厨房笔记");
    await user.click(screen.getByRole("button", { name: "Add to the pool" }));

    await waitFor(() => expect(api.adoptMediaBench).toHaveBeenCalledTimes(1));
    const [id, payload] = api.adoptMediaBench.mock.calls[0]! as [string, AdoptMediaRequest];
    expect(id).toBe("b-1");
    expect(payload).toEqual({ ip_id: "ip-a" });

    await user.click(await screen.findByRole("button", { name: "Adopted" }));
    expect(push).toHaveBeenCalledWith("/acme/content/topics?ip=ip-a");
  });

  it("sends a rewritten headline", async () => {
    const user = userEvent.setup();
    serve([bench({ name: "厨房笔记" })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Adopt as topic" }));
    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.type(title, "一锅出三种吃法");
    await user.click(screen.getByRole("button", { name: "Add to the pool" }));

    await waitFor(() => expect(api.adoptMediaBench).toHaveBeenCalledTimes(1));
    expect(api.adoptMediaBench.mock.calls[0]![1]).toEqual({
      ip_id: "ip-a",
      title: "一锅出三种吃法",
    });
  });
});

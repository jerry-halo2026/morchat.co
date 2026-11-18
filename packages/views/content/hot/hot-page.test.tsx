import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdoptMediaRequest,
  CreateMediaHotRequest,
  MediaHot,
  MediaIP,
  MediaTopic,
  UpdateMediaHotRequest,
} from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { ContentHotPage } from "../content-hot-page";

/**
 * 热点雷达 (`/{slug}/content/hot`) — one band per capture day.
 *
 * The API is mocked at `@morechat/core/api`, so what is asserted here is the
 * three requests the page sends (a create with its payload, a delete, an
 * adoption that answers a topic) plus what it draws: the day bands, a missing
 * rank printing as "not collected", the source link's `rel`, and the adoption's
 * landing place.
 */

const push = vi.fn();

const api = vi.hoisted(() => ({
  listMediaHot: vi.fn(),
  listMediaIPs: vi.fn(),
  listMediaTopics: vi.fn(),
  createMediaHot: vi.fn(),
  updateMediaHot: vi.fn(),
  deleteMediaHot: vi.fn(),
  adoptMediaHot: vi.fn(),
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

function hot(overrides: Partial<MediaHot> = {}): MediaHot {
  return {
    id: "h-1",
    workspace_id: "ws-1",
    title: "打工人用 AI 写周报被领导发现",
    platform: "douyin",
    url: null,
    rank: 1,
    heat_value: 3200000,
    category: "职场",
    captured_on: "2026-11-18",
    source: "manual",
    note: null,
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
    id: "t-1",
    workspace_id: "ws-1",
    ip_id: "ip-a",
    title: "周报这件小事",
    source: "hot",
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
    pathname: "/acme/content/hot",
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
        <ContentHotPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

function serve(rows: readonly MediaHot[], topics: readonly MediaTopic[] = []) {
  api.listMediaHot.mockResolvedValue({ hot: [...rows], total: rows.length });
  api.listMediaIPs.mockResolvedValue({ ips: [ip("ip-a", "厨房笔记")], total: 1 });
  api.listMediaTopics.mockResolvedValue({ topics: [...topics], total: topics.length });
}

beforeEach(() => {
  push.mockReset();
  serve([]);
  api.createMediaHot.mockResolvedValue(hot({ id: "h-new" }));
  api.updateMediaHot.mockResolvedValue(hot());
  api.deleteMediaHot.mockResolvedValue(undefined);
  api.adoptMediaHot.mockResolvedValue(topic({ id: "t-new", ip_id: "ip-a" }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ContentHotPage · the radar", () => {
  it("says the radar is empty and offers to record one", async () => {
    renderPage();

    expect(await screen.findByText("No hotspot captured yet")).toBeInTheDocument();
    expect(screen.getByText("Add one by hand, or wait for an import.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add hotspot" })).toHaveLength(2);
  });

  it("bands the list by capture day, newest first, and orders a day by rank", async () => {
    serve([
      hot({ id: "h-old", captured_on: "2026-11-16", title: "旧热点", rank: 1 }),
      hot({ id: "h-2", captured_on: "2026-11-18", title: "第二名", rank: 2 }),
      hot({ id: "h-1", captured_on: "2026-11-18", title: "第一名", rank: 1 }),
    ]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    expect(screen.getByText("Wed, Nov 18")).toBeInTheDocument();
    expect(screen.getByText("Mon, Nov 16")).toBeInTheDocument();

    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent("第一名");
    expect(rows[1]).toHaveTextContent("第二名");
    expect(rows[2]).toHaveTextContent("旧热点");
  });

  it("prints a heat figure grouped, and a missing rank as not collected", async () => {
    serve([hot({ rank: null, heat_value: null, note: "领导当场抓住" })]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    const row = bodyRows()[0]!;
    // Both nullable columns say "not collected": rank and heat.
    expect(within(row).getAllByText("Not collected")).toHaveLength(2);
    expect(row).toHaveTextContent("职场");
    expect(row).toHaveTextContent("领导当场抓住");
  });

  it("groups a heat figure the reader's way", async () => {
    serve([hot({ rank: 2, heat_value: 3200000 })]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(bodyRows()[0]).toHaveTextContent("3,200,000");
  });

  it("links the headline out with rel=noreferrer noopener", async () => {
    serve([hot({ url: "https://www.douyin.com/hot/123", title: "热榜原文" })]);
    renderPage();

    const link = await screen.findByRole("link", { name: "热榜原文" });
    expect(link).toHaveAttribute("href", "https://www.douyin.com/hot/123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
  });

  it("asks the server for the day and the keyword that are set", async () => {
    serve([hot()]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await userEvent.type(screen.getByLabelText("Search hotspots"), "周报");

    await waitFor(() =>
      expect(api.listMediaHot).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "周报", limit: 200 }),
      ),
    );
  });

  it("shows a load failure with a retry", async () => {
    api.listMediaHot.mockRejectedValue(new Error("nope"));
    renderPage();

    expect(await screen.findByText("Couldn't load this list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("ContentHotPage · writing", () => {
  it("records a capture with the title, platform, figures and day it was given", async () => {
    const user = userEvent.setup();
    renderPage();

    const [create] = await screen.findAllByRole("button", { name: "Add hotspot" });
    await user.click(create!);
    await user.type(await screen.findByLabelText("Title"), "立冬吃饺子");
    await user.type(screen.getByLabelText("Platform"), "xiaohongshu");
    await user.type(screen.getByLabelText("Rank"), "3");
    await user.type(screen.getByLabelText("Heat"), "52000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createMediaHot).toHaveBeenCalledTimes(1));
    const payload = api.createMediaHot.mock.calls[0]![0] as CreateMediaHotRequest;
    expect(payload).toMatchObject({
      title: "立冬吃饺子",
      platform: "xiaohongshu",
      rank: 3,
      heat_value: 52000,
    });
    expect(payload.captured_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("clears a rank by emptying the box", async () => {
    const user = userEvent.setup();
    serve([hot({ rank: 4 })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Edit hotspot" }));
    const rank = await screen.findByLabelText("Rank");
    await user.clear(rank);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.updateMediaHot).toHaveBeenCalledTimes(1));
    const patch = api.updateMediaHot.mock.calls[0]![1] as UpdateMediaHotRequest;
    expect(patch).toEqual({ rank: null });
  });

  it("deletes a capture only after the confirmation", async () => {
    const user = userEvent.setup();
    serve([hot()]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.deleteMediaHot).toHaveBeenCalledWith("h-1"));
  });
});

describe("ContentHotPage · adopting", () => {
  it("adopts into the chosen IP and links to the topic it created", async () => {
    const user = userEvent.setup();
    serve([hot({ id: "h-1", title: "打工人用 AI 写周报被领导发现" })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Adopt as topic" }));
    const title = await screen.findByLabelText("Title");
    // The dialog opens on the capture's own headline.
    expect(title).toHaveValue("打工人用 AI 写周报被领导发现");
    await user.click(screen.getByRole("button", { name: "Add to the pool" }));

    await waitFor(() => expect(api.adoptMediaHot).toHaveBeenCalledTimes(1));
    const [, payload] = api.adoptMediaHot.mock.calls[0]! as [string, AdoptMediaRequest];
    expect(api.adoptMediaHot.mock.calls[0]![0]).toBe("h-1");
    // The title was not rewritten, so it is left to the endpoint's default.
    expect(payload).toEqual({ ip_id: "ip-a" });

    const adopted = await screen.findByRole("button", { name: "Adopted" });
    await user.click(adopted);
    expect(push).toHaveBeenCalledWith("/acme/content/topics?ip=ip-a");
  });

  it("sends a rewritten headline, and refuses to adopt the same row twice", async () => {
    const user = userEvent.setup();
    serve([hot({ id: "h-1", title: "周报被领导发现" })]);
    renderPage();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Adopt as topic" }));
    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.type(title, "周报这件小事");
    await user.click(screen.getByRole("button", { name: "Add to the pool" }));

    await waitFor(() => expect(api.adoptMediaHot).toHaveBeenCalledTimes(1));
    expect(api.adoptMediaHot.mock.calls[0]![1]).toEqual({
      ip_id: "ip-a",
      title: "周报这件小事",
    });

    // The row now points at the topic instead of offering to adopt again.
    expect(await screen.findByRole("button", { name: "Adopted" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adopt as topic" })).toBeNull();
  });

  it("recognises a capture the pool already adopted", async () => {
    serve(
      [hot({ id: "h-1" })],
      [topic({ id: "t-9", hot_id: "h-1", ip_id: "ip-b" })],
    );
    renderPage();

    const adopted = await screen.findByRole("button", { name: "Adopted" });
    expect(adopted).toHaveAttribute("title", "Open the topic");
    expect(screen.queryByRole("button", { name: "Adopt as topic" })).toBeNull();

    await userEvent.click(adopted);
    expect(push).toHaveBeenCalledWith("/acme/content/topics?ip=ip-b");
  });
});

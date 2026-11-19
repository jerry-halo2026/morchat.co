import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MediaScript, MediaShotList, MediaShoot, MediaTopic } from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { ContentShootsPage } from "../content-shoots-page";

/**
 * 拍摄排期 (`/{slug}/content/shoots`) — one week, one row per shoot.
 *
 * Three contract behaviours are pinned here because none of them is visible in a
 * screenshot:
 *
 * - the page asks the server for the week it is showing (`from`/`to`, inclusive);
 * - saving a shoot sends the shot list **whole**, renumbered, so a row taken off
 *   the table is a shot the server deletes (§12.5);
 * - a checklist tick is its own PATCH carrying that one key, because the server
 *   merges the tick map (§12.3) — sending the whole map would let a stale copy
 *   untick somebody else's box.
 *
 * The clock is pinned to a Wednesday (2026-11-18), so the week under test is
 * Monday 11-16 … Sunday 11-22.
 */

const WS = "ws-1";
const NOW = new Date(2026, 10, 18, 15, 0, 0);

const api = vi.hoisted(() => ({
  listMediaShoots: vi.fn(),
  getMediaShoot: vi.fn(),
  listMediaScripts: vi.fn(),
  listMediaTopics: vi.fn(),
  listMembers: vi.fn(),
  createMediaShoot: vi.fn(),
  updateMediaShoot: vi.fn(),
  deleteMediaShoot: vi.fn(),
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

function shotList(overrides: Partial<MediaShotList> = {}): MediaShotList {
  return {
    schema_version: "shotlist.v1",
    title: "租房避坑 · 分镜",
    duration_ms: 7000,
    aspect_ratio: "9:16",
    shots: [
      {
        index: 1,
        start_ms: 0,
        end_ms: 3000,
        shot_size: "medium",
        scene: "indoor",
        rhythm: "steady",
        text: "开场",
      },
      {
        index: 2,
        start_ms: 3000,
        end_ms: 7000,
        shot_size: "close-up",
        scene: "studio",
        rhythm: "fast-cut",
        text: "特写",
      },
    ],
    ...overrides,
  };
}

function shoot(overrides: Partial<MediaShoot> = {}): MediaShoot {
  return {
    id: "sh-1",
    workspace_id: WS,
    script_id: "sc-1",
    shoot_date: "2026-11-18",
    location: "老仓库",
    shots: shotList(),
    checklist: { 灯: true, 麦: false },
    status: "planned",
    owner_member_id: "m-1",
    created_by: "m-1",
    created_at: "2026-11-10T02:00:00Z",
    updated_at: "2026-11-10T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function script(id: string, version: number): MediaScript {
  return {
    id,
    workspace_id: WS,
    topic_id: "t-1",
    ip_id: null,
    version,
    hook: null,
    body: null,
    cta: null,
    cover_note: null,
    tags: [],
    status: "approved",
    publish_at: null,
    owner_member_id: "m-1",
    created_by: "m-1",
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    archived_at: null,
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
    status: "shooting",
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
    pathname: "/acme/content/shoots",
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
        <ContentShootsPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

function serve(shoots: readonly MediaShoot[]) {
  api.listMediaShoots.mockResolvedValue({ shoots: [...shoots], total: shoots.length });
  api.getMediaShoot.mockResolvedValue(shoots[0] ?? shoot());
  api.listMediaScripts.mockResolvedValue({ scripts: [script("sc-1", 3)], total: 1 });
  api.listMediaTopics.mockResolvedValue({
    topics: [topic("t-1", "租房避坑三件事")],
    total: 1,
  });
  api.listMembers.mockResolvedValue([]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  viewer.role = "admin";
  serve([]);
  api.createMediaShoot.mockResolvedValue(shoot());
  api.updateMediaShoot.mockResolvedValue(shoot());
  api.deleteMediaShoot.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ContentShootsPage · 一周", () => {
  it("opens on this week and asks the server for exactly those seven days", async () => {
    renderPage();

    expect(await screen.findByText("No shoot scheduled this week")).toBeInTheDocument();
    expect(screen.getByText("2026-11-16 – 2026-11-22")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.listMediaShoots).toHaveBeenCalledWith({
        from: "2026-11-16",
        to: "2026-11-22",
        limit: 200,
      }),
    );
  });

  it("walks to the next week and reads that window instead", async () => {
    renderPage();
    await screen.findByText("No shoot scheduled this week");

    await userEvent.click(screen.getByRole("button", { name: "Next week" }));

    expect(await screen.findByText("2026-11-23 – 2026-11-29")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.listMediaShoots).toHaveBeenLastCalledWith({
        from: "2026-11-23",
        to: "2026-11-29",
        limit: 200,
      }),
    );
  });

  it("bands the week by day and names each shoot by its script", async () => {
    serve([
      shoot({ id: "sh-1", shoot_date: "2026-11-18" }),
      shoot({ id: "sh-2", shoot_date: "2026-11-20", status: "editing", shots: {} }),
    ]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    // Two day bands: Wednesday and Friday, and no band for the empty days.
    expect(screen.getByText("Wed, Nov 18")).toBeInTheDocument();
    expect(screen.getByText("Fri, Nov 20")).toBeInTheDocument();
    expect(screen.queryByText("Thu, Nov 19")).toBeNull();

    const [first, second] = bodyRows();
    expect(first).toHaveTextContent("租房避坑三件事");
    expect(first).toHaveTextContent("2 shots");
    expect(first).toHaveTextContent("Planned");
    expect(first).toHaveTextContent("老仓库");
    // A shoot with no shot list says nothing about shots rather than "0 shots".
    expect(second).toHaveTextContent("Editing");
    expect(second).not.toHaveTextContent("0 shots");
  });
});

describe("ContentShootsPage · 镜头清单整份替换", () => {
  it("says that saving replaces the list, then sends the whole document", async () => {
    serve([shoot()]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    await userEvent.click(bodyRows()[0]!);

    expect(
      await screen.findByText(/Saving replaces the whole list/),
    ).toBeInTheDocument();
    // Both stored shots are on the table, in order.
    const list = document.querySelector('[data-slot="shot-rows"]');
    expect(list).not.toBeNull();
    expect(within(list as HTMLElement).getByLabelText("Frame 1")).toHaveValue("开场");
    expect(within(list as HTMLElement).getByLabelText("Frame 2")).toHaveValue("特写");

    // Drop the opening shot: the write must not mention it any more.
    await userEvent.click(screen.getByRole("button", { name: "Remove shot 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.updateMediaShoot).toHaveBeenCalledTimes(1));
    const payload = api.updateMediaShoot.mock.calls[0]![1];
    expect(payload.shoot_date).toBe("2026-11-18");
    expect(payload.shots.schema_version).toBe("shotlist.v1");
    expect(payload.shots.shots).toHaveLength(1);
    // Renumbered from 1 and laid end to end: the surviving shot starts at 0.
    expect(payload.shots.shots[0]).toMatchObject({
      index: 1,
      start_ms: 0,
      end_ms: 4000,
      shot_size: "close-up",
      scene: "studio",
      rhythm: "fast-cut",
      text: "特写",
    });
    expect(payload.shots.duration_ms).toBe(4000);
  });

  it("keeps the new order when a shot is moved up", async () => {
    serve([shoot()]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    await userEvent.click(bodyRows()[0]!);
    await screen.findByLabelText("Frame 2");

    await userEvent.click(screen.getByRole("button", { name: "Move shot 2 up" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.updateMediaShoot).toHaveBeenCalledTimes(1));
    const shots = api.updateMediaShoot.mock.calls[0]![1].shots.shots;
    expect(shots.map((item: { text?: string }) => item.text)).toEqual(["特写", "开场"]);
    expect(shots[0]).toMatchObject({ index: 1, start_ms: 0, end_ms: 4000 });
    expect(shots[1]).toMatchObject({ index: 2, start_ms: 4000, end_ms: 7000 });
  });

  it("cannot remove the last shot, so a save never writes an empty list", async () => {
    serve([shoot({ shots: shotList({ shots: [shotList().shots[0]!], duration_ms: 3000 }) })]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    await userEvent.click(bodyRows()[0]!);
    await screen.findByLabelText("Frame 1");

    expect(screen.getByRole("button", { name: "Remove shot 1" })).toBeDisabled();
  });
});

describe("ContentShootsPage · 开拍清单逐项", () => {
  it("patches the one ticked key", async () => {
    serve([shoot()]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    await userEvent.click(bodyRows()[0]!);
    await screen.findByLabelText("Frame 1");

    await userEvent.click(screen.getByRole("checkbox", { name: "麦" }));

    await waitFor(() => expect(api.updateMediaShoot).toHaveBeenCalledTimes(1));
    expect(api.updateMediaShoot).toHaveBeenCalledWith("sh-1", { checklist: { 麦: true } });
  });
});

describe("ContentShootsPage · 新建与删除", () => {
  it("creates a shoot from a script and a day, and nothing else", async () => {
    serve([]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "New shoot" }));
    // With nothing scheduled the empty state offers the same action, so the
    // sheet's own button is the last one to appear.
    const actions = await screen.findAllByRole("button", { name: "New shoot" });
    await userEvent.click(actions[actions.length - 1]!);

    await waitFor(() => expect(api.createMediaShoot).toHaveBeenCalledTimes(1));
    // The default day is today, on the reader's calendar.
    expect(api.createMediaShoot).toHaveBeenCalledWith({
      script_id: "sc-1",
      shoot_date: "2026-11-18",
      status: "planned",
    });
  });

  it("deletes a shoot only after the confirmation", async () => {
    serve([shoot()]);
    renderPage();

    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    await userEvent.click(bodyRows()[0]!);
    await screen.findByLabelText("Frame 1");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Delete this shoot?")).toBeInTheDocument();
    expect(api.deleteMediaShoot).not.toHaveBeenCalled();

    await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteMediaShoot).toHaveBeenCalledWith("sh-1"));
  });
});

describe("ContentShootsPage · 加载与错误", () => {
  it("draws the grid's skeleton while the week is on its way", async () => {
    api.listMediaShoots.mockImplementation(() => new Promise(() => {}));
    renderPage();

    const grid = await screen.findByRole("grid", { name: "Shooting & editing" });
    expect(grid).toHaveAttribute("aria-busy", "true");
    expect(bodyRows()).toHaveLength(0);
  });

  it("states the failure once and retries it", async () => {
    api.listMediaShoots.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByText("Couldn't load this page")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();

    serve([]);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No shoot scheduled this week")).toBeInTheDocument();
  });
});

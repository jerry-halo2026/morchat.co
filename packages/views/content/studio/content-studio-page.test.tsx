import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaIP, MediaScript, MediaShoot, MediaTopic } from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { ContentStudioPage } from "../content-studio-page";
import { setIpScope } from "../ip-scope";
import { ContentPanel } from "../panel";

/**
 * The studio page and the IP switcher it shares with the left column.
 *
 * The two are siblings in the real dashboard (the column is drawn beside the
 * page, not inside it), so the suite mounts them as such: a change made in the
 * column has to reach the page through the scope module, not through props.
 *
 * Fixtures are typed `Media*` rows, and the query options the page and the
 * column import are mocked at the module boundary with the list shapes the API
 * answers. The folding itself is `model.ts`, exercised through these tests
 * rather than through its own.
 */

const state = vi.hoisted(() => ({
  ips: [] as MediaIP[],
  topics: [] as MediaTopic[],
  scripts: [] as MediaScript[],
  shoots: [] as MediaShoot[],
  accounts: {} as Record<string, number>,
  role: "owner" as "owner" | "admin" | "member",
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

vi.mock("@morechat/core/media/mutations", () => ({
  useCreateMediaIP: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@morechat/core/media/queries", () => ({
  mediaIPListOptions: () => ({
    queryKey: ["media", "ws-1", "ips", {}],
    queryFn: async () => ({ ips: state.ips, total: state.ips.length }),
  }),
  mediaIPDetailOptions: (_wsId: string, id: string) => ({
    queryKey: ["media", "ws-1", "ips", { id }],
    queryFn: async () => {
      const found = state.ips.find((candidate) => candidate.id === id);
      if (!found) throw new Error("missing");
      return { ...found, accounts: accountsFor(id) };
    },
  }),
  mediaTopicListOptions: () => ({
    queryKey: ["media", "ws-1", "topics", {}],
    queryFn: async () => ({ topics: state.topics, total: state.topics.length }),
  }),
  mediaScriptListOptions: () => ({
    queryKey: ["media", "ws-1", "scripts", {}],
    queryFn: async () => ({ scripts: state.scripts, total: state.scripts.length }),
  }),
  mediaShootListOptions: () => ({
    queryKey: ["media", "ws-1", "shoots", {}],
    queryFn: async () => ({ shoots: state.shoots, total: state.shoots.length }),
  }),
}));

const paths = {
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
  settings: () => "/acme/settings",
};

vi.mock("@morechat/core/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@morechat/core/paths")>();
  return {
    ...actual,
    useWorkspacePaths: () => paths,
    useCurrentWorkspace: () => ({ id: "ws-1", name: "Acme Studio", slug: "acme" }),
  };
});

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
    pathname: "/acme/content",
    searchParams: new URLSearchParams(),
    hash: "",
  }),
}));

vi.mock("../../layout/use-panel-reader", () => ({ usePanelReader: () => null }));

function accountsFor(ipId: string) {
  const count = state.accounts[ipId] ?? 0;
  return Array.from({ length: count }, (_, index) => ({
    id: `${ipId}-account-${index}`,
    media_ip_id: ipId,
    kind: "owned",
    display_name: `Account ${index}`,
    platform: "douyin",
    handle: `handle-${index}`,
    url: null,
    fans: 0,
    avg_play: 0,
    owner_member_id: null,
    created_at: "2026-01-01T00:00:00Z",
  }));
}

function ip(id: string, name: string, extra: Partial<MediaIP> = {}): MediaIP {
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
    ...extra,
  };
}

function topic(id: string, ipId: string, status: MediaTopic["status"]): MediaTopic {
  return {
    id,
    workspace_id: "ws-1",
    ip_id: ipId,
    title: `Topic ${id}`,
    source: "manual",
    scores: { pain: 0, save: 0, debate: 0, susp: 0, fit: 0 },
    status,
    hot_id: null,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
  };
}

function script(
  id: string,
  topicId: string,
  status: MediaScript["status"],
  publishAt: string | null = null,
): MediaScript {
  return {
    id,
    workspace_id: "ws-1",
    topic_id: topicId,
    ip_id: null,
    version: 1,
    hook: null,
    body: null,
    cta: null,
    cover_note: null,
    tags: [],
    status,
    publish_at: publishAt,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
  };
}

function shoot(
  id: string,
  scriptId: string,
  shootDate: string,
  status: MediaShoot["status"],
): MediaShoot {
  return {
    id,
    workspace_id: "ws-1",
    script_id: scriptId,
    shoot_date: shootDate,
    location: null,
    shots: {},
    checklist: {},
    status,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");
const day = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Tuesday of this week at noon, so the fixture is inside whatever week runs. */
function midWeek(): Date {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1, 12);
}

function renderStudio({ panel = false }: { panel?: boolean } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <ContentStudioPage />
      {panel ? <ContentPanel /> : null}
    </QueryClientProvider>,
  );
}

/** The number in one of a card's four stage cells. */
function countOf(card: HTMLElement, key: string): string {
  return card.querySelector(`[data-count="${key}"] dd`)?.textContent?.trim() ?? "";
}

function weekCell(key: string): HTMLElement {
  const cell = document.querySelector(`[data-week-cell="${key}"]`);
  if (!cell) throw new Error(`no week cell ${key}`);
  return cell as HTMLElement;
}

beforeEach(() => {
  state.ips = [];
  state.topics = [];
  state.scripts = [];
  state.shoots = [];
  state.accounts = {};
  state.role = "owner";
  setIpScope(null);
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("ContentStudioPage", () => {
  it("offers the first IP when the studio has none", async () => {
    renderStudio();
    expect(await screen.findByText("No IP yet")).toBeInTheDocument();
    // The header row and the empty state offer the same action, so the page has
    // one wherever the reader looks.
    expect(screen.getAllByRole("button", { name: "New IP" })).toHaveLength(2);
  });

  it("draws one card per IP with its four stage counts", async () => {
    state.ips = [ip("ip-a", "Kitchen Notes"), ip("ip-b", "Outdoor Lab")];
    state.topics = [
      topic("t-1", "ip-a", "pool"),
      topic("t-2", "ip-a", "pool"),
      topic("t-3", "ip-a", "scripting"),
      topic("t-4", "ip-b", "pool"),
    ];
    // These scripts carry no IP of their own: each must read the IP of its topic.
    state.scripts = [
      script("s-1", "t-3", "draft"),
      script("s-2", "t-3", "approved"),
      script("s-3", "t-4", "review"),
    ];
    state.shoots = [shoot("sh-1", "s-1", "2026-01-05", "planned")];
    state.accounts = { "ip-a": 3 };

    renderStudio();

    const cardA = (await screen.findByRole("link", { name: /Kitchen Notes/ })) as HTMLElement;
    expect(countOf(cardA, "topics")).toBe("2");
    expect(countOf(cardA, "scripts")).toBe("1");
    expect(countOf(cardA, "publishing")).toBe("1");
    expect(countOf(cardA, "shoots")).toBe("1");
    // The account count is the detail read's, not the list's.
    expect(within(cardA).getByText("3")).toBeInTheDocument();

    const cardB = screen.getByRole("link", { name: /Outdoor Lab/ }) as HTMLElement;
    expect(countOf(cardB, "topics")).toBe("1");
    expect(countOf(cardB, "scripts")).toBe("1");
    expect(countOf(cardB, "publishing")).toBe("0");
    expect(countOf(cardB, "shoots")).toBe("0");
  });

  it("counts this week's publishing, this week's shoots and the whole backlog", async () => {
    const inside = midWeek();
    const outside = new Date(inside.getFullYear(), inside.getMonth(), inside.getDate() + 21);
    state.ips = [ip("ip-a", "Kitchen Notes")];
    state.topics = [
      topic("t-1", "ip-a", "pool"),
      topic("t-2", "ip-a", "pool"),
      topic("t-3", "ip-a", "pool"),
      topic("t-4", "ip-a", "scripting"),
    ];
    state.scripts = [
      script("s-1", "t-4", "approved", inside.toISOString()),
      script("s-2", "t-4", "approved", outside.toISOString()),
    ];
    state.shoots = [
      shoot("sh-1", "s-1", day(inside), "planned"),
      shoot("sh-2", "s-2", day(inside), "done"),
      shoot("sh-3", "s-2", day(outside), "planned"),
    ];

    renderStudio();

    await screen.findByRole("link", { name: /Kitchen Notes/ });
    // One script is scheduled inside the week; the other is three weeks out.
    expect(weekCell("publishing").textContent).toContain("1");
    // One shoot still has to happen this week; the finished one is not waiting.
    expect(weekCell("shooting").textContent).toContain("1");
    // The backlog is every pooled idea, not just this week's.
    expect(weekCell("backlog").textContent).toContain("3");
  });

  it("narrows the cards to the IP the left column switches to", async () => {
    state.ips = [ip("ip-a", "Kitchen Notes"), ip("ip-b", "Outdoor Lab")];
    state.topics = [topic("t-1", "ip-a", "pool"), topic("t-2", "ip-b", "pool")];

    renderStudio({ panel: true });

    expect(await screen.findByRole("link", { name: /Kitchen Notes/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Outdoor Lab/ })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("IP"));
    await user.click(await screen.findByRole("option", { name: "Outdoor Lab" }));

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /Kitchen Notes/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Outdoor Lab/ })).toBeInTheDocument();
    // The bar reads the same scope as the cards: one pooled idea, not two.
    expect(weekCell("backlog").textContent).toContain("1");
  });

  it("keeps the create action away from a reader who cannot write", async () => {
    state.role = "member";
    state.ips = [ip("ip-a", "Kitchen Notes")];

    renderStudio();

    await screen.findByRole("link", { name: /Kitchen Notes/ });
    expect(screen.queryByRole("button", { name: "New IP" })).not.toBeInTheDocument();
  });

  it("sends a card to that IP's topic pool", async () => {
    state.ips = [ip("ip-a", "Kitchen Notes")];

    renderStudio();

    const card = await screen.findByRole("link", { name: /Kitchen Notes/ });
    expect(card).toHaveAttribute("href", "/acme/content/topics?ip=ip-a");
  });
});

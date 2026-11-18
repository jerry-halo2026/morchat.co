import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CreateMediaTopicRequest,
  MediaIP,
  MediaTopic,
  MediaTopicListFilters,
  MemberWithUser,
  UpdateMediaTopicRequest,
} from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { ContentTopicsPage } from "../content-topics-page";
import { setIpScope } from "../ip-scope";

/**
 * The topic board, driven through the real query and mutation hooks.
 *
 * The API is mocked at `@morechat/core/api`, so these assertions are about the
 * three requests the board sends — a create with its whole score card, a status
 * move as one field, a delete — and about what it draws: the six pipeline
 * columns, the stored dimensions of a card (unknown key included), and who holds
 * it.
 */

const state = vi.hoisted(() => ({
  ips: [] as MediaIP[],
  topics: [] as MediaTopic[],
  members: [] as MemberWithUser[],
  role: "owner" as "owner" | "admin" | "member",
  search: "",
}));

const api = vi.hoisted(() => ({
  listMediaIPs: vi.fn(async () => ({ ips: [] as MediaIP[], total: 0 })),
  listMediaTopics: vi.fn(async () => ({ topics: [] as MediaTopic[], total: 0 })),
  getMediaTopic: vi.fn(async (_id: string) => ({}) as MediaTopic),
  listMembers: vi.fn(async (_wsId: string) => [] as MemberWithUser[]),
  createMediaTopic: vi.fn(async (data: CreateMediaTopicRequest) => ({ id: "t-new", ...data }) as MediaTopic),
  updateMediaTopic: vi.fn(async (id: string, data: UpdateMediaTopicRequest) => ({ id, ...data }) as MediaTopic),
  deleteMediaTopic: vi.fn(async () => undefined),
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
vi.mock("../../navigation", () => ({
  AppLink: ({ children, href }: { children?: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useNavigation: () => ({
    pathname: "/acme/content/topics",
    searchParams: new URLSearchParams(state.search),
    hash: "",
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
        topics: () => "/acme/content/topics",
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

function topic(id: string, extra: Partial<MediaTopic> = {}): MediaTopic {
  return {
    id,
    workspace_id: "ws-1",
    ip_id: "ip-a",
    title: `Topic ${id}`,
    source: "manual",
    scores: { pain: 0, save: 0, debate: 0, susp: 0, fit: 0 },
    status: "pool",
    hot_id: null,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: new Date().toISOString(),
    archived_at: null,
    ...extra,
  };
}

const MEMBER: MemberWithUser = {  id: "m-1",
  workspace_id: "ws-1",
  user_id: "user-1",
  role: "owner",
  created_at: "2026-01-01T00:00:00Z",
  name: "Ada",
  email: "ada@example.com",
  avatar_url: null,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <ContentTopicsPage />
    </QueryClientProvider>,
  );
}

function cardOf(topicId: string): HTMLElement {
  const card = document.querySelector(`[data-topic-card="${topicId}"]`);
  if (!card) throw new Error(`no card ${topicId}`);
  return card as HTMLElement;
}

function columnOf(status: string): HTMLElement {
  const column = document.querySelector(`[data-column="${status}"]`);
  if (!column) throw new Error(`no column ${status}`);
  return column as HTMLElement;
}

/**
 * A row whose score card carries a dimension this build does not know.
 *
 * `media_topic.scores` is JSONB and the wire schema keeps it loose, so another
 * surface (or an import) can store a key the five-dimension type does not name;
 * widening it here is how the test models that row.
 */
function topicWithRawScores(id: string, scores: Record<string, number>): MediaTopic {
  return { ...topic(id), scores: scores as unknown as MediaTopic["scores"] };
}

beforeEach(() => {
  state.ips = [ip("ip-a", "Kitchen Notes"), ip("ip-b", "Outdoor Lab")];
  state.topics = [];
  state.members = [MEMBER];
  state.role = "owner";
  state.search = "";
  setIpScope(null);
  sessionStorage.clear();

  api.listMediaIPs.mockReset();
  api.listMediaTopics.mockReset();
  api.getMediaTopic.mockReset();
  api.listMembers.mockReset();
  api.createMediaTopic.mockReset();
  api.updateMediaTopic.mockReset();
  api.deleteMediaTopic.mockReset();

  api.listMediaIPs.mockImplementation(async () => ({ ips: state.ips, total: state.ips.length }));
  api.listMediaTopics.mockImplementation(async (filters: MediaTopicListFilters = {}) => {
    const rows = filters.ip_id
      ? state.topics.filter((row) => row.ip_id === filters.ip_id)
      : state.topics;
    return { topics: rows, total: rows.length };
  });
  api.getMediaTopic.mockImplementation(async (id: string) => {
    const found = state.topics.find((row) => row.id === id);
    if (!found) throw new Error("missing");
    return found;
  });
  api.listMembers.mockImplementation(async () => state.members);
  api.createMediaTopic.mockImplementation(
    async (data: CreateMediaTopicRequest) => ({ ...topic("t-new"), ...data }) as MediaTopic,
  );
  api.updateMediaTopic.mockImplementation(
    async (id: string, data: UpdateMediaTopicRequest) => ({ ...topic(id), ...data }) as MediaTopic,
  );
  api.deleteMediaTopic.mockImplementation(async () => undefined);
});

afterEach(() => {
  cleanup();
});

describe("ContentTopicsPage", () => {
  it("shows the pool's empty state, with the way in", async () => {
    renderPage();

    expect(await screen.findByText("The topic pool is empty")).toBeInTheDocument();
    expect(
      screen.getByText("Adopt one from the hot radar or a benchmark, or add one by hand."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New topic" })).toHaveLength(2);
  });

  it("asks for an IP first when the studio has none", async () => {
    state.ips = [];
    renderPage();

    expect(await screen.findByText("No content IP yet")).toBeInTheDocument();
    expect(
      screen.getByText("Create a content IP first — a topic belongs to one."),
    ).toBeInTheDocument();
  });

  it("draws the six pipeline columns and puts each topic in its own", async () => {
    state.topics = [
      topic("t-pool", { status: "pool" }),
      topic("t-shot", { status: "shooting" }),
      topic("t-pool-2", { status: "pool" }),
    ];
    renderPage();

    await screen.findByText("Topic t-pool");
    for (const status of ["pool", "scripting", "shooting", "publishing", "done", "dropped"]) {
      expect(document.querySelector(`[data-column="${status}"]`)).not.toBeNull();
    }
    const pool = columnOf("pool");
    expect(within(pool).getAllByRole("button", { name: /Topic t-pool/ })).toHaveLength(2);
    expect(within(columnOf("shooting")).getByText("Topic t-shot")).toBeInTheDocument();
  });

  it("states a card's source, scores, owner and stage", async () => {
    state.topics = [
      topic("t-1", {
        title: "Meetings rot",
        source: "hot",
        hot_id: "hot-3",
        status: "scripting",
        owner_member_id: "m-1",
        scores: { pain: 80, save: 10, debate: 0, susp: 0, fit: 5 },
      }),
    ];
    renderPage();

    await screen.findByText("Meetings rot");
    const card = cardOf("t-1");
    expect(within(card).getByText("Hot")).toBeInTheDocument();
    expect(within(card).getByText("From the hot radar")).toBeInTheDocument();
    expect(card.querySelector('[data-score="pain"]')?.textContent).toBe("80");
    expect(card.querySelector('[data-score="total"]')?.textContent).toBe("95");
    expect(within(card).getByText("Ada")).toBeInTheDocument();
    expect(within(card).getByRole("combobox", { name: "Status" })).toHaveTextContent("Scripting");
  });

  it("keeps a stored dimension this build does not know, on the card", async () => {
    state.topics = [topicWithRawScores("t-1", { pain: 10, save: 0, debate: 0, susp: 0, fit: 0, zhang: 40 })];
    renderPage();

    await screen.findByText("Topic t-1");
    const card = cardOf("t-1");
    expect(card.querySelector('[data-score="zhang"]')?.textContent).toBe("40");
    // The total counts the five dimensions the pool ranks by, not the extra one.
    expect(card.querySelector('[data-score="total"]')?.textContent).toBe("10");
  });

  it("moves a topic by patching its status alone", async () => {
    const user = userEvent.setup();
    state.topics = [topic("t-1", { status: "pool" })];
    renderPage();

    await screen.findByText("Topic t-1");
    await user.click(within(cardOf("t-1")).getByRole("combobox", { name: "Status" }));
    await user.click(await screen.findByRole("option", { name: "Shooting" }));

    await waitFor(() => expect(api.updateMediaTopic).toHaveBeenCalledTimes(1));
    expect(api.updateMediaTopic).toHaveBeenCalledWith("t-1", { status: "shooting" });
  });

  it(
    "creates a topic with its IP, source and five scores",
    async () => {
      const user = userEvent.setup();
      renderPage();

      const [createAction] = await screen.findAllByRole("button", { name: "New topic" });
      if (!createAction) throw new Error("no create action");
      await user.click(createAction);
      await user.type(await screen.findByLabelText("Title"), "Rot");
      await user.type(screen.getByLabelText(/Pain/), "80");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(api.createMediaTopic).toHaveBeenCalledTimes(1));
      expect(api.createMediaTopic).toHaveBeenCalledWith({
        ip_id: "ip-a",
        title: "Rot",
        source: "manual",
        scores: { pain: 80, save: 0, debate: 0, susp: 0, fit: 0 },
      });
    },
    15_000,
  );

  it("deletes a topic only after the confirmation", async () => {
    const user = userEvent.setup();
    state.topics = [topic("t-1")];
    renderPage();

    await screen.findByText("Topic t-1");
    await user.click(within(cardOf("t-1")).getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.deleteMediaTopic).toHaveBeenCalledWith("t-1"));
  });

  it("filters the board to the IP in the address bar", async () => {
    state.search = "ip=ip-b";
    state.topics = [topic("t-a", { ip_id: "ip-a" }), topic("t-b", { ip_id: "ip-b" })];
    renderPage();

    await screen.findByText("Topic t-b");
    expect(api.listMediaTopics).toHaveBeenCalledWith(expect.objectContaining({ ip_id: "ip-b" }));
    expect(screen.queryByText("Topic t-a")).not.toBeInTheDocument();
  });

  it("follows the left column's switcher after it arrives", async () => {
    state.topics = [topic("t-a", { ip_id: "ip-a" }), topic("t-b", { ip_id: "ip-b" })];
    renderPage();

    await screen.findByText("Topic t-a");
    setIpScope("ip-b");

    // The board is re-read for the new scope, so the assertion waits for the
    // settled tree rather than for the first node that carried the title.
    await waitFor(() => expect(screen.getByText("Topic t-b")).toBeInTheDocument());
    expect(screen.queryByText("Topic t-a")).not.toBeInTheDocument();
  });

  it("shows a load failure with a retry", async () => {
    api.listMediaTopics.mockImplementation(async () => {
      throw new Error("nope");
    });
    renderPage();

    expect(await screen.findByText("Couldn't load the topics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CreateMediaIPRequest,
  Creator,
  MediaIP,
  MediaIPAccount,
  MediaIPDetail,
  MediaTopic,
  UpdateMediaIPRequest,
} from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { ContentIpsPage } from "../content-ips-page";
import { setIpScope } from "../ip-scope";

/**
 * The accounts page, driven through the real query and mutation hooks.
 *
 * `@morechat/core/api` is the only boundary mocked: what the assertions are about
 * is the requests the page sends (`POST /media/ips`, `POST
 * /media/ips/{id}/accounts`, `DELETE /media/ips/{id}`) and what it draws from the
 * rows it reads. The scope is the module the left column writes, so the narrowing
 * test goes through `setIpScope` rather than a prop.
 */

const state = vi.hoisted(() => ({
  ips: [] as MediaIP[],
  topics: [] as MediaTopic[],
  accounts: {} as Record<string, MediaIPAccount[]>,
  creators: [] as Creator[],
  role: "owner" as "owner" | "admin" | "member",
}));

const api = vi.hoisted(() => ({
  listMediaIPs: vi.fn(async () => ({ ips: [] as MediaIP[], total: 0 })),
  getMediaIP: vi.fn(async (_id: string) => ({}) as MediaIPDetail),
  listMediaTopics: vi.fn(async () => ({ topics: [] as MediaTopic[], total: 0 })),
  listCreators: vi.fn(async () => ({ creators: [] as Creator[], total: 0 })),
  createMediaIP: vi.fn(async (data: CreateMediaIPRequest) => ({ id: "ip-new", ...data }) as MediaIP),
  updateMediaIP: vi.fn(async (id: string, data: UpdateMediaIPRequest) => ({ id, ...data }) as MediaIP),
  deleteMediaIP: vi.fn(async () => undefined),
  attachMediaIPAccount: vi.fn(async () => ({}) as MediaIPAccount),
  detachMediaIPAccount: vi.fn(async () => undefined),
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

function account(id: string, ipId: string, name: string): MediaIPAccount {
  return {
    id,
    media_ip_id: ipId,
    kind: "owned",
    display_name: name,
    platform: "douyin",
    handle: `@${name.toLowerCase()}`,
    url: null,
    fans: 12000,
    avg_play: 0,
    owner_member_id: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function topic(id: string, ipId: string, extra: Partial<MediaTopic> = {}): MediaTopic {
  return {
    id,
    workspace_id: "ws-1",
    ip_id: ipId,
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

const CREATOR: Creator = {
  id: "creator-1",
  workspace_id: "ws-1",
  kind: "owned",
  display_name: "Nova",
  platform: "douyin",
  handle: "@nova",
  url: null,
  fans: 88000,
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <ContentIpsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.ips = [ip("ip-a", "Kitchen Notes"), ip("ip-b", "Outdoor Lab")];
  state.topics = [];
  state.accounts = {};
  state.creators = [CREATOR];
  state.role = "owner";
  setIpScope(null);
  sessionStorage.clear();
  api.listMediaIPs.mockReset();
  api.getMediaIP.mockReset();
  api.listMediaTopics.mockReset();
  api.listCreators.mockReset();
  api.createMediaIP.mockReset();
  api.updateMediaIP.mockReset();
  api.deleteMediaIP.mockReset();
  api.attachMediaIPAccount.mockReset();
  api.detachMediaIPAccount.mockReset();

  api.listMediaIPs.mockImplementation(async () => ({
    ips: state.ips,
    total: state.ips.length,
  }));
  api.getMediaIP.mockImplementation(async (id: string) => {
    const found = state.ips.find((candidate) => candidate.id === id);
    if (!found) throw new Error("missing");
    return { ...found, accounts: state.accounts[id] ?? [] };
  });
  api.listMediaTopics.mockImplementation(async () => ({
    topics: state.topics,
    total: state.topics.length,
  }));
  api.listCreators.mockImplementation(async () => ({
    creators: state.creators,
    total: state.creators.length,
  }));
  api.createMediaIP.mockImplementation(async (data: CreateMediaIPRequest) => ip("ip-new", data.name));
  api.updateMediaIP.mockImplementation(
    async (id: string, data: UpdateMediaIPRequest) => ip(id, data.name ?? "renamed", data),
  );
  api.deleteMediaIP.mockImplementation(async () => undefined);
  api.attachMediaIPAccount.mockImplementation(async () => account("c-1", "ip-a", "Nova"));
  api.detachMediaIPAccount.mockImplementation(async () => undefined);
});

afterEach(() => {
  cleanup();
});

describe("ContentIpsPage", () => {
  it("says what an IP is when there is none, and offers the first one", async () => {
    state.ips = [];
    renderPage();

    expect(await screen.findByText("No content IP yet")).toBeInTheDocument();
    expect(
      screen.getByText(/An IP is one persona, its track and its audience/),
    ).toBeInTheDocument();
    // The header and the empty state offer the same action.
    expect(screen.getAllByRole("button", { name: "New IP" })).toHaveLength(2);
  });

  it("draws one card per IP with its persona, tags and this week's goal", async () => {
    state.ips = [
      ip("ip-a", "Kitchen Notes", {
        persona: "An eight-year cook",
        track: "food",
        audience: "home cooks",
        week_goal: 5,
      }),
    ];
    state.accounts = { "ip-a": [account("c-1", "ip-a", "Kitchen"), account("c-2", "ip-a", "Notes")] };
    state.topics = [
      topic("t-1", "ip-a", { status: "done" }),
      topic("t-2", "ip-a", { status: "done" }),
      topic("t-3", "ip-a", { status: "pool" }),
    ];

    renderPage();

    const card = (await screen.findByText("Kitchen Notes")).closest("[data-ip-card]") as HTMLElement;
    expect(within(card).getByText("An eight-year cook")).toBeInTheDocument();
    expect(within(card).getByText("food")).toBeInTheDocument();
    expect(within(card).getByText("home cooks")).toBeInTheDocument();
    // Two finished topics against a goal of five, and two platform accounts.
    expect(card.querySelector('[data-card-stat="done"]')?.textContent).toContain("2/5");
    await waitFor(() =>
      expect(card.querySelector('[data-card-stat="accounts"]')?.textContent).toContain("2"),
    );
  });

  it("narrows the cards to the IP the left column switches to", async () => {
    renderPage();

    expect(await screen.findByText("Kitchen Notes")).toBeInTheDocument();
    expect(screen.getByText("Outdoor Lab")).toBeInTheDocument();

    setIpScope("ip-b");

    await waitFor(() => expect(screen.getByText("Outdoor Lab")).toBeInTheDocument());
    expect(screen.queryByText("Kitchen Notes")).not.toBeInTheDocument();
  });

  it(
    "creates an IP from the dialog, trim included",
    async () => {
      const user = userEvent.setup();
      renderPage();

      await screen.findByText("Kitchen Notes");
      const [createAction] = screen.getAllByRole("button", { name: "New IP" });
      if (!createAction) throw new Error("no create action");
      await user.click(createAction);
      await user.type(await screen.findByLabelText("Name"), "  Night  ");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(api.createMediaIP).toHaveBeenCalledTimes(1));
      // Only the name was typed, so only the name and the starting status are
      // sent; the field-by-field body is `ips/model.test.ts`'s job.
      expect(api.createMediaIP).toHaveBeenCalledWith({ name: "Night", status: "active" });
    },
    // Typing into the dialog re-renders it per keystroke; under a loaded CI shard
    // the default five seconds is not enough for the dialog's own mount.
    15_000,
  );

  it(
    "renames an IP with a patch that carries only the name",
    async () => {
      const user = userEvent.setup();
      renderPage();

      const card = (await screen.findByText("Kitchen Notes")).closest(
        "[data-ip-card]",
      ) as HTMLElement;
      await user.click(within(card).getByRole("button", { name: "Edit" }));

      const name = await screen.findByLabelText("Name");
      await user.clear(name);
      await user.type(name, "Notes 2");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(api.updateMediaIP).toHaveBeenCalledTimes(1));
      expect(api.updateMediaIP).toHaveBeenCalledWith("ip-a", { name: "Notes 2" });
    },
    15_000,
  );

  it("attaches a creator from the ledger and lists it", async () => {
    const user = userEvent.setup();
    state.accounts = {};
    renderPage();

    const card = (await screen.findByText("Kitchen Notes")).closest("[data-ip-card]") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Accounts" }));

    expect(await screen.findByText("No platform account is attached yet.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search the creator ledger"), "nov");
    // The picker waits for typing to settle before asking the ledger.
    await user.click(await screen.findByRole("button", { name: "Attach" }, { timeout: 5_000 }));

    await waitFor(() => expect(api.attachMediaIPAccount).toHaveBeenCalledTimes(1));
    expect(api.attachMediaIPAccount).toHaveBeenCalledWith("ip-a", { creator_id: "creator-1" });
  });

  it("detaches an account without touching the creator ledger", async () => {
    const user = userEvent.setup();
    state.accounts = { "ip-a": [account("c-1", "ip-a", "Kitchen")] };
    renderPage();

    const card = (await screen.findByText("Kitchen Notes")).closest("[data-ip-card]") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Accounts" }));

    await user.click(await screen.findByRole("button", { name: "Detach" }));

    await waitFor(() => expect(api.detachMediaIPAccount).toHaveBeenCalledTimes(1));
    expect(api.detachMediaIPAccount).toHaveBeenCalledWith("ip-a", "c-1");
  });

  it("deletes an IP only after the confirmation", async () => {
    const user = userEvent.setup();
    renderPage();

    const card = (await screen.findByText("Kitchen Notes")).closest("[data-ip-card]") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Kitchen Notes/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.deleteMediaIP).toHaveBeenCalledWith("ip-a"));
  });

  it("keeps the write actions away from a reader who is not on the row", async () => {
    state.role = "member";
    state.ips = [ip("ip-a", "Kitchen Notes", { owner_member_id: "user-9" })];
    renderPage();

    const card = (await screen.findByText("Kitchen Notes")).closest("[data-ip-card]") as HTMLElement;
    expect(within(card).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("shows a load failure with a retry", async () => {
    api.listMediaIPs.mockImplementation(async () => {
      throw new Error("nope");
    });
    renderPage();

    expect(await screen.findByText("Couldn't load the IPs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

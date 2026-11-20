import { useSyncExternalStore, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configStore } from "@morechat/core/config";
import { BILLING_WORKSPACE_SUBSCRIPTIONS_FLAG } from "@morechat/core/feature-flags";
import { renderWithI18n } from "../../test/i18n";

const mockCreateMember = vi.hoisted(() => vi.fn());
const mockUpdateMemberDepartment = vi.hoisted(() => vi.fn());
// The URL the settings router holds; `setSearch` stands in for navigation.
const url = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { search: "" };
  return {
    get: () => state.search,
    set: (search: string) => {
      state.search = search;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
const data = vi.hoisted(() => ({
  members: [] as Array<Record<string, unknown>>,
  invitations: [] as Array<Record<string, unknown>>,
  shareLinks: [] as Array<Record<string, unknown>>,
  departments: [] as Array<Record<string, unknown>>,
  summary: null as Record<string, unknown> | null,
}));

vi.mock("@tanstack/react-query", () => ({
  queryOptions: <T,>(opts: T) => opts,
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = JSON.stringify(opts.queryKey);
    if (key.includes("departments")) return { data: data.departments };
    if (key.includes("invitations")) return { data: data.invitations };
    if (key.includes("share-links")) return { data: data.shareLinks };
    if (key.includes("members")) return { data: data.members };
    return { data: data.summary };
  },
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    fetchQuery: vi.fn(),
  }),
}));
vi.mock("@morechat/core/billing", () => ({
  usePreviewWorkspaceSeatPurchase: () => ({ mutateAsync: vi.fn() }),
  usePurchaseWorkspaceSeats: () => ({ mutateAsync: vi.fn() }),
  workspaceSubscriptionSummaryOptions: (wsId: string) => ({
    queryKey: ["billing", wsId, "summary"],
  }),
}));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@morechat/core/paths", () => ({
  useCurrentWorkspace: () => ({ id: "ws-1", name: "Acme", slug: "acme" }),
}));
vi.mock("@morechat/core/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@morechat/core/api")>()),
  api: {
    createMember: mockCreateMember,
    updateMemberDepartment: mockUpdateMemberDepartment,
  },
}));
vi.mock("@morechat/core/auth", () => {
  const state = { user: { id: "user-1" } };
  const useAuthStore = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state },
  );
  return { useAuthStore };
});
vi.mock("../../common/actor-avatar", () => ({ ActorAvatar: () => <span /> }));
vi.mock("../../navigation", () => ({
  AppLink: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useOptionalNavigation: () => {
    const search = useSyncExternalStore(url.subscribe, url.get);
    const go = (href: string) => url.set(href.split("?")[1] ?? "");
    return {
      pathname: "/acme/settings",
      searchParams: new URLSearchParams(search),
      push: go,
      replace: go,
    };
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MembersTab } from "./members-tab";
import { toast } from "sonner";

const PLATFORM = "dept-platform";
const SALES = "dept-sales";

const departmentRow = (id: string, name: string) => ({
  id,
  workspace_id: "ws-1",
  name,
  lead_user_id: null,
  system_key: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
});

const member = (id: string, name: string, role: string) => ({
  id: `m-${id}`,
  user_id: id,
  workspace_id: "ws-1",
  role,
  name,
  email: `${name.toLowerCase().split(" ")[0]}@acme.dev`,
  avatar_url: null,
  created_at: "2025-01-08T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  url.set("tab=members");
  data.members = [
    member("user-1", "Ada Lovelace", "owner"),
    member("user-2", "Grace Hopper", "admin"),
    member("user-3", "Alan Turing", "member"),
  ];
  data.invitations = [
    {
      id: "inv-1",
      workspace_id: "ws-1",
      inviter_id: "user-1",
      invitee_email: "linus@acme.dev",
      invitee_user_id: null,
      role: "member",
      status: "pending",
      created_at: "2025-03-01T00:00:00Z",
      updated_at: "2025-03-01T00:00:00Z",
      expires_at: "2025-03-08T00:00:00Z",
    },
  ];
  data.shareLinks = [];
  data.departments = [];
  data.summary = null;
  configStore.getState().setFeatureFlags({});
});

describe("MembersTab", () => {
  it("lists members with their role and marks the current user", () => {
    renderWithI18n(<MembersTab />);

    expect(screen.getByRole("tab", { name: /Members\s*3/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions for Grace Hopper" })).toBeInTheDocument();
    // Nobody manages their own membership from this list.
    expect(screen.queryByRole("button", { name: "Actions for Ada Lovelace" })).toBeNull();
  });

  it("filters members by name or email", () => {
    renderWithI18n(<MembersTab />);
    const search = screen.getByRole("searchbox", { name: "Search name or email" });

    fireEvent.change(search, { target: { value: "grace@" } });
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.queryByText("Alan Turing")).toBeNull();

    fireEvent.change(search, { target: { value: "nobody" } });
    expect(screen.getByText("No members match this search.")).toBeInTheDocument();
  });

  it("shows which department each member is filed under", () => {
    data.departments = [departmentRow(PLATFORM, "Platform")];
    data.members = [
      { ...member("user-1", "Ada Lovelace", "owner"), department_id: PLATFORM },
      member("user-2", "Grace Hopper", "admin"),
    ];
    renderWithI18n(<MembersTab />);

    expect(screen.getAllByText("Platform").length).toBeGreaterThan(0);
    // Grace has no department: the column names the absence instead of going
    // blank, which is what the other rosters (boss/team) already do.
    expect(screen.getByText("Not assigned")).toBeInTheDocument();
  });

  it("offers department management even before any department exists", async () => {
    // The cold start this fixes: the invitation form hides its department field
    // until a department exists, so with zero departments there was no way in.
    data.departments = [];
    const user = userEvent.setup();
    renderWithI18n(<MembersTab />);

    const open = screen.getByRole("button", { name: "New department" });
    await user.click(open);

    expect(await screen.findByText("Manage departments")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("filters the member list by department", async () => {
    data.departments = [
      departmentRow(PLATFORM, "Platform"),
      departmentRow(SALES, "Sales"),
    ];
    data.members = [
      { ...member("user-1", "Ada Lovelace", "owner"), department_id: PLATFORM },
      { ...member("user-2", "Grace Hopper", "admin"), department_id: SALES },
      member("user-3", "Alan Turing", "member"),
    ];
    const user = userEvent.setup();
    renderWithI18n(<MembersTab />);

    await user.click(screen.getByRole("combobox", { name: "Filter by department" }));
    await user.click(await screen.findByRole("option", { name: "Sales" }));

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
    expect(screen.queryByText("Alan Turing")).toBeNull();
  });

  it("moves a member to another department and reports the projects it touched", async () => {
    const success = vi.mocked(toast.success);
    success.mockClear();
    data.departments = [departmentRow(PLATFORM, "Platform")];
    data.members = [
      member("user-1", "Ada Lovelace", "owner"),
      member("user-2", "Grace Hopper", "admin"),
    ];
    mockUpdateMemberDepartment.mockResolvedValue({
      department_id: PLATFORM,
      added_projects: ["p1", "p2"],
      removed_projects: ["p3"],
    });
    const user = userEvent.setup();
    renderWithI18n(<MembersTab />);

    await user.click(screen.getByRole("button", { name: "Actions for Grace Hopper" }));
    const submenu = await screen.findByRole("menuitem", { name: "Change department" });
    // The submenu opens on the keyboard/click path but keeps its content
    // pointer-inert in jsdom, so drive the items with fireEvent.
    fireEvent.click(submenu);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Platform" }));

    await waitFor(() =>
      expect(mockUpdateMemberDepartment).toHaveBeenCalledWith("ws-1", "m-user-2", {
        department_id: PLATFORM,
      }),
    );
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        "Department updated · 2 projects added, 1 removed",
      ),
    );
  });

  it("clears a member's department when no department is chosen", async () => {
    data.departments = [departmentRow(PLATFORM, "Platform")];
    data.members = [
      member("user-1", "Ada Lovelace", "owner"),
      { ...member("user-2", "Grace Hopper", "admin"), department_id: PLATFORM },
    ];
    mockUpdateMemberDepartment.mockResolvedValue({
      department_id: null,
      added_projects: [],
      removed_projects: ["p1"],
    });
    const user = userEvent.setup();
    renderWithI18n(<MembersTab />);

    await user.click(screen.getByRole("button", { name: "Actions for Grace Hopper" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Change department" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "No department" }));

    await waitFor(() =>
      expect(mockUpdateMemberDepartment).toHaveBeenCalledWith("ws-1", "m-user-2", {
        department_id: null,
      }),
    );
  });

  it("sends the invitation into the chosen department", async () => {
    data.departments = [departmentRow(PLATFORM, "Platform")];
    mockCreateMember.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithI18n(<MembersTab />);

    await user.click(screen.getByRole("button", { name: "Invite member" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite member" });
    await user.type(within(dialog).getByRole("textbox", { name: "Email" }), "new@acme.dev");
    await user.click(within(dialog).getByRole("combobox", { name: "Department" }));
    await user.click(await screen.findByRole("option", { name: "Platform" }));
    await user.click(within(dialog).getByRole("button", { name: "Invite" }));

    await waitFor(() =>
      expect(mockCreateMember).toHaveBeenCalledWith("ws-1", {
        email: "new@acme.dev",
        role: "member",
        department_id: PLATFORM,
      }),
    );
  });

  it("shows when each pending invitation was sent and expires", async () => {
    const user = userEvent.setup();
    renderWithI18n(<MembersTab />);

    await user.click(screen.getByRole("tab", { name: /Pending invitations\s*1/ }));
    expect(screen.getByText("linus@acme.dev")).toBeInTheDocument();
    expect(screen.getByText(/Sent .* · Expires /)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revoke invitation for linus@acme.dev" }),
    ).toBeInTheDocument();
  });

  it("keeps the open list in the URL and follows it while on the page", async () => {
    const user = userEvent.setup();
    renderWithI18n(<MembersTab />);

    await user.click(screen.getByRole("tab", { name: /Pending invitations\s*1/ }));
    expect(url.get()).toBe("tab=members&section=invitations");

    // A search result or back/forward changes the URL without remounting.
    act(() => url.set("tab=members&section=links"));
    expect(screen.getByRole("tab", { name: /Share links\s*0/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    act(() => url.set("tab=members"));
    expect(screen.getByRole("tab", { name: /Members\s*3/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("opens the tab a deep link names", () => {
    url.set("tab=members&section=links");
    renderWithI18n(<MembersTab />);
    expect(screen.getByRole("tab", { name: /Share links\s*0/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("No share links yet.")).toBeInTheDocument();
  });

  it("invites from a dialog and closes it once the invitation is sent", async () => {
    mockCreateMember.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithI18n(<MembersTab />);

    await user.click(screen.getByRole("button", { name: "Invite member" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite member" });
    await user.type(within(dialog).getByRole("textbox", { name: "Email" }), "new@acme.dev");
    await user.click(within(dialog).getByRole("button", { name: "Invite" }));

    await waitFor(() =>
      expect(mockCreateMember).toHaveBeenCalledWith("ws-1", {
        email: "new@acme.dev",
        role: "member",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the invite dialog open when sending fails", async () => {
    mockCreateMember.mockRejectedValue(new Error("nope"));
    const user = userEvent.setup();
    renderWithI18n(<MembersTab />);

    await user.click(screen.getByRole("button", { name: "Invite member" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite member" });
    await user.type(within(dialog).getByRole("textbox", { name: "Email" }), "new@acme.dev");
    await user.click(within(dialog).getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(mockCreateMember).toHaveBeenCalled());
    expect(screen.getByRole("dialog", { name: "Invite member" })).toBeInTheDocument();
  });

  it("links seat usage to billing when subscriptions are on", () => {
    configStore
      .getState()
      .setFeatureFlags({ [BILLING_WORKSPACE_SUBSCRIPTIONS_FLAG]: true });
    data.summary = { seatCapacity: { used: 3, reserved: 1, purchased: 5 } };
    renderWithI18n(<MembersTab />);

    expect(screen.getByText(/4 of 5 seats used/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage seats" })).toHaveAttribute(
      "href",
      "/acme/settings?tab=billing",
    );
  });

  it("gives members a read-only view without invite or share-link controls", () => {
    data.members = [
      member("user-1", "Ada Lovelace", "member"),
      member("user-2", "Grace Hopper", "owner"),
    ];
    renderWithI18n(<MembersTab />);

    expect(screen.getByRole("note")).toHaveTextContent("Ask Grace Hopper");
    expect(screen.queryByRole("button", { name: "Invite member" })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Share links/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Actions for/ })).toBeNull();
  });
});

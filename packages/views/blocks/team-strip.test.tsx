import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NavigationProvider, type NavigationAdapter } from "../navigation";
import { renderWithI18n } from "../test/i18n";
import { TeamStrip, buildTeamGroups, type TeamStripEvent } from "./team-strip";
import type { Agent, Department, MemberWithUser } from "@morechat/core/types";

const DEPARTMENTS: Department[] = [
  {
    id: "dept-ops",
    name: "Ops",
    workspace_id: "ws-1",
    lead_user_id: null,
    system_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "dept-growth",
    name: "Growth",
    workspace_id: "ws-1",
    lead_user_id: null,
    system_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const MEMBERS: MemberWithUser[] = [
  {
    id: "m-lead",
    workspace_id: "ws-1",
    user_id: "u-1",
    role: "owner",
    created_at: "2026-01-01T00:00:00Z",
    name: "Ada",
    email: "ada@example.test",
    avatar_url: null,
    department_id: "dept-ops",
  },
  {
    id: "m-loose",
    workspace_id: "ws-1",
    user_id: "u-2",
    role: "member",
    created_at: "2026-01-01T00:00:00Z",
    name: "Bo",
    email: "bo@example.test",
    avatar_url: null,
    department_id: null,
  },
];

function agent(id: string, name: string, ownerId: string | null): Agent {
  return {
    id,
    workspace_id: "ws-1",
    runtime_id: "rt-1",
    name,
    description: "",
    instructions: "",
    avatar_url: null,
    owner_id: ownerId,
  } as Agent;
}

const AGENTS: Agent[] = [
  agent("a-1", "Scribe", "m-lead"),
  agent("a-2", "Orphan", "someone-else"),
];

const presence = vi.hoisted(() => ({
  current: {
    byAgent: new Map([
      [
        "a-1",
        {
          availability: "online" as const,
          workload: "working" as const,
          runningCount: 2,
          queuedCount: 0,
          capacity: 4,
        },
      ],
    ]),
    loading: false,
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (options: { queryKey: unknown[] }) => {
      const key = options.queryKey;
      if (key[2] === "departments") return { data: DEPARTMENTS, isPending: false };
      if (key[2] === "members") return { data: MEMBERS, isPending: false };
      if (key[2] === "agents") return { data: AGENTS, isPending: false };
      return { data: undefined, isPending: false };
    },
  };
});

vi.mock("@morechat/core/agents/use-agent-presence", () => ({
  useWorkspacePresenceMap: () => presence.current,
}));

// Avatar URLs are resolved against the API host, which only the platform
// knows.
vi.mock("@morechat/core/api", () => ({
  api: { getBaseUrl: () => "https://api.test" },
}));

vi.mock("@morechat/core/paths", () => ({
  useWorkspacePaths: () => ({
    memberDetail: (id: string) => `/acme/members/${id}`,
    agentDetail: (id: string) => `/acme/agents/${id}`,
  }),
}));

function adapter(): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: "/acme/overview",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderStrip(onEvent: (event: TeamStripEvent) => void, departmentId: string | null = null) {
  return renderWithI18n(
    <NavigationProvider value={adapter()}>
      <TeamStrip wsId="ws-1" departmentId={departmentId} onEvent={onEvent} />
    </NavigationProvider>,
  );
}

afterEach(cleanup);

describe("buildTeamGroups", () => {
  it("puts an agent in its owner's band and orphans in the unassigned band", () => {
    const groups = buildTeamGroups(DEPARTMENTS, MEMBERS, AGENTS);
    const ops = groups.find((group) => group.departmentId === "dept-ops");
    const unassigned = groups.find((group) => group.departmentId === null);
    expect(ops?.members.map((member) => member.id)).toEqual(["m-lead"]);
    expect(ops?.agents.map((agent) => agent.id)).toEqual(["a-1"]);
    expect(unassigned?.members.map((member) => member.id)).toEqual(["m-loose"]);
    expect(unassigned?.agents.map((agent) => agent.id)).toEqual(["a-2"]);
  });

  it("drops a department band with nobody in it", () => {
    const groups = buildTeamGroups(DEPARTMENTS, MEMBERS, AGENTS);
    expect(groups.some((group) => group.departmentId === "dept-growth")).toBe(false);
  });
});

describe("TeamStrip", () => {
  it("groups people by department and shows an agent's presence and load", () => {
    const { container } = renderStrip(() => {});
    expect(screen.getByText("Ops")).toBeInTheDocument();
    expect(screen.getByText("No department")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ada/ })).toHaveAttribute(
      "href",
      "/acme/members/m-lead",
    );
    expect(screen.getByRole("link", { name: /Scribe/ })).toHaveAttribute(
      "href",
      "/acme/agents/a-1",
    );
    expect(container).toHaveTextContent("Working");
    expect(container).toHaveTextContent("2/4");
  });

  it("emits groupSelect from a department band", async () => {
    const onEvent = vi.fn();
    renderStrip(onEvent);
    await userEvent.click(screen.getByRole("button", { name: /^Ops/ }));
    expect(onEvent).toHaveBeenCalledWith({ kind: "groupSelect", departmentId: "dept-ops" });
  });

  it("marks the band the page is filtered to", () => {
    renderStrip(() => {}, "dept-ops");
    expect(screen.getByRole("button", { name: /^Ops/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /No department/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

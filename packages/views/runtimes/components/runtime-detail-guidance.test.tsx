// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AgentRuntime, RuntimeProfile } from "@morechat/core/types";
import { I18nProvider } from "@morechat/core/i18n/react";
import enCommon from "../../locales/en/common.json";
import enLayout from "../../locales/en/layout.json";
import enRuntimes from "../../locales/en/runtimes.json";
import enAgents from "../../locales/en/agents.json";

const TEST_RESOURCES = {
  en: { common: enCommon, layout: enLayout, runtimes: enRuntimes, agents: enAgents },
};

const mockCopyText = vi.hoisted(() => vi.fn(async () => true));
const mockQueryData = vi.hoisted(() => ({
  members: [] as Array<Record<string, unknown>>,
  profiles: [] as RuntimeProfile[],
}));

vi.mock("@morechat/ui/lib/clipboard", () => ({ copyText: mockCopyText }));

vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

// RuntimeDetail pulls the whole dashboard in behind these queries; the sections
// under test do not depend on any of them, so they resolve empty.
vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>(
      "@tanstack/react-query",
    );
  return {
    ...actual,
    useQuery: vi.fn((options: { queryKey?: readonly unknown[] }) => {
      const key = options?.queryKey;
      if (key?.[0] === "runtime-profiles") {
        return { data: mockQueryData.profiles, isLoading: false };
      }
      if (key?.[0] === "workspaces" && key?.[2] === "members") {
        return { data: mockQueryData.members, isLoading: false };
      }
      return { data: [], isLoading: false };
    }),
  };
});

vi.mock("@morechat/core/auth", () => ({
  useAuthStore: (sel: (s: { user: { id: string } }) => unknown) =>
    sel({ user: { id: "user-me" } }),
}));

vi.mock("@morechat/core/runtimes", async () => ({
  isRuntimeUsableForUser: (
    await vi.importActual<typeof import("@morechat/core/runtimes")>(
      "@morechat/core/runtimes",
    )
  ).isRuntimeUsableForUser,
  // The guidance is about the offline reason, not about time buckets, so the
  // derived health is pinned and left out of the assertions.
  deriveRuntimeHealth: () => "offline",
  runtimeDisplayName: (rt: { name: string; custom_name?: string | null }) =>
    rt.custom_name?.trim() || rt.name,
  runtimeDisplayLabel: (rt: { name: string; custom_name?: string | null }) =>
    rt.custom_name?.trim() || rt.name,
  runtimeProfileListOptions: (wsId: string) => ({
    queryKey: ["runtime-profiles", wsId],
  }),
  parseRuntimeProfileBoundConflict: () => null,
  useDeleteRuntimeProfile: () => ({
    mutate: vi.fn(),
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@morechat/core/agents", () => ({
  useWorkspacePresenceMap: () => ({ byAgent: new Map() }),
  AGENT_MAX_CONCURRENT_TASKS_MIN: 1,
  AGENT_MAX_CONCURRENT_TASKS_MAX: 50,
}));

vi.mock("@morechat/core/paths", () => ({
  useWorkspacePaths: () => ({
    runtimes: () => "/runtimes",
    agentDetail: () => "/agents",
  }),
}));

vi.mock("@morechat/core/runtimes/mutations", () => ({
  useUpdateRuntime: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeRuntimeWorkspaceAccess: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRuntime: () => ({ mutate: vi.fn(), isPending: false, mutateAsync: vi.fn() }),
  useUnbindAgentsAndDeleteRuntime: () => ({
    mutate: vi.fn(),
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("./provider-logo", () => ({ ProviderLogo: () => null }));
vi.mock("./usage-section", () => ({
  UsageSection: () => <div data-testid="usage-section" />,
}));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  HealthBadge: () => null,
}));
vi.mock("../../agents/presence", () => ({
  availabilityConfig: { offline: { dotClass: "", textClass: "" } },
  workloadConfig: { idle: { icon: () => null, textClass: "" } },
}));
vi.mock("../../common/actor-avatar", () => ({ ActorAvatar: () => null }));
vi.mock("../../navigation", () => ({
  AppLink: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useNavigation: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { RuntimeDetail } from "./runtime-detail";
import { DSH_PROFILE_INSTALL_COMMAND } from "./runtime-offline-guidance";

const MISSING_PROFILE_DETAIL =
  "the runtime profile is not installed; add the DSH runtime bundle to the `multica` profile with `dsh plugin`";

function makeRuntime(overrides: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    id: "rt-dsh",
    workspace_id: "ws-1",
    daemon_id: "daemon-1",
    name: "DeepSeek Harness (studio-mbp)",
    runtime_mode: "local",
    provider: "dsh",
    launch_header: "",
    status: "offline",
    device_info: "studio-mbp",
    metadata: {},
    owner_id: "user-me",
    visibility: "private",
    last_seen_at: "2026-11-11T10:00:00Z",
    created_at: "2026-11-11T09:00:00Z",
    updated_at: "2026-11-11T10:00:00Z",
    ...overrides,
  };
}

function renderDetail(
  runtime: AgentRuntime,
  props: Pick<
    ComponentProps<typeof RuntimeDetail>,
    "machineHref" | "machineLabel"
  > = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <QueryClientProvider client={qc}>
        <RuntimeDetail runtime={runtime} {...props} />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

function guidanceCard(name: string | RegExp) {
  return screen.queryByRole("region", { name });
}

describe("RuntimeDetail offline guidance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryData.members = [];
    mockQueryData.profiles = [];
  });

  it("turns a missing DSH bridge into readable copy and a copyable install command", async () => {
    renderDetail(
      makeRuntime({
        metadata: {
          offline_reason: { code: "dsh_profile", detail: MISSING_PROFILE_DETAIL },
        },
      }),
    );

    const card = guidanceCard("The built-in runtime bridge is missing");
    expect(card).not.toBeNull();
    expect(card).toHaveAttribute("data-guidance", "dsh_profile_missing");
    expect(card).toHaveTextContent("DeepSeek Harness is installed on this machine");
    expect(card).toHaveTextContent("Upgrade the desktop client");
    // The command is the daemon's own repair, not the raw reason string.
    expect(card).toHaveTextContent(DSH_PROFILE_INSTALL_COMMAND);
    expect(card).toHaveTextContent("Replace <bundle> with the bridge directory shipped inside the app");
    expect(card).toHaveTextContent(`Daemon reported: ${MISSING_PROFILE_DETAIL}`);

    fireEvent.click(screen.getByRole("button", { name: "Copy install command" }));
    await waitFor(() =>
      expect(mockCopyText).toHaveBeenCalledWith(DSH_PROFILE_INSTALL_COMMAND),
    );
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });

  it("turns a signed-out DSH into the sign-in instruction and the self-check command", () => {
    renderDetail(
      makeRuntime({
        metadata: {
          offline_reason: {
            code: "dsh_profile",
            detail: "dsh is not logged in; run `dsh login`",
          },
        },
      }),
    );

    const card = guidanceCard("DeepSeek Harness is not signed in");
    expect(card).not.toBeNull();
    expect(card).toHaveAttribute("data-guidance", "dsh_login");
    expect(card).toHaveTextContent(
      "Sign in to DeepSeek Harness on this computer, then restart the client",
    );
    expect(card).toHaveTextContent("dsh --version");
    // Nothing to install, so the bundle hint stays out of the login state.
    expect(card).not.toHaveTextContent("<bundle>");
    expect(
      screen.getByRole("button", { name: "Copy check command" }),
    ).toBeInTheDocument();
  });

  it("keeps the plain offline status for a reason it cannot explain", () => {
    renderDetail(
      makeRuntime({
        metadata: {
          offline_reason: {
            code: "not_executable",
            detail: "agent CLI is not executable",
          },
        },
      }),
    );

    expect(guidanceCard(/bridge|signed in/)).toBeNull();
    expect(screen.queryByText(/Daemon reported/)).toBeNull();
    // The page's existing status display still carries the raw state.
    expect(screen.getAllByText(/Offline/).length).toBeGreaterThan(0);
  });

  it("shows nothing for an online runtime carrying a stale reason", () => {
    renderDetail(
      makeRuntime({
        status: "online",
        metadata: {
          offline_reason: { code: "dsh_profile", detail: MISSING_PROFILE_DETAIL },
        },
      }),
    );

    expect(guidanceCard(/bridge/)).toBeNull();
  });
});

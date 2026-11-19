import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import { renderWithI18n } from "../test/i18n";
import { ContentPanel } from "./panel";

/**
 * The content column's wiring: the IP switcher, the page list in production
 * order, and the three badges that carry a queue size 鈥?the topic pool, the
 * scripts approved but not yet scheduled, and this week's shoots.
 *
 * All three read the same lists their pages read, so a badge can never count
 * something the page would not show. A badge is a queue, so it must not appear
 * before its list answers.
 */

vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: "user-1",
    role: "admin",
    isLoading: false,
    member: { id: "m-1", user_id: "user-1", name: "Ada Lin", avatar_url: null, role: "admin" },
  }),
}));
vi.mock("@morechat/core/workspace/avatar-url", () => ({
  resolvePublicFileUrl: (url: string | null | undefined) => url ?? null,
}));
// The IP switcher reads the IP list; the badges do not depend on it.
vi.mock("@morechat/core/media/queries", async () => {
  const options = (key: unknown[], payload: unknown) => ({
    queryKey: key,
    queryFn: async () => payload,
  });
  return {
    mediaIPListOptions: () => options(["media", "ws-1", "ips", {}], { ips: [], total: 0 }),
    mediaTopicListOptions: () => options(["media", "ws-1", "topics", {}], { topics: [], total: 7 }),
    mediaScriptListOptions: (_wsId: string, filters: { status?: string } = {}) =>
      options(["media", "ws-1", "scripts", filters], {
        scripts: [],
        total: filters.status === "approved" ? 4 : 0,
      }),
    mediaShootListOptions: () => options(["media", "ws-1", "shoots", {}], { shoots: [], total: 3 }),
  };
});

vi.mock("../navigation", () => ({
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
  useNavigation: () => ({ pathname: "/acme/content" }),
}));

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <WorkspaceSlugProvider slug="acme">
        <ContentPanel />
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
}

const links = () =>
  screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href) => href?.includes("/content"));

describe("ContentPanel", () => {
  it("lists the production line in the order work runs through it", () => {
    renderPanel();
    expect(links()).toEqual([
      "/acme/content",
      "/acme/content/ips",
      "/acme/content/hot",
      "/acme/content/bench",
      "/acme/content/topics",
      "/acme/content/scripts",
      "/acme/content/shoots",
      "/acme/content/publish",
      "/acme/content/data",
    ]);
  });

  it("badges the topic pool with the pool's own size", async () => {
    renderPanel();
    const row = screen.getByRole("link", { name: "Topic pool" });
    expect(await within(row).findByText("7")).toBeInTheDocument();
  });

  // Approved-but-unscheduled is the action this badge exists for; the mock
  // returns 4 only when the query really asks for `status=approved`.
  it("badges publish with the scripts waiting for a date", async () => {
    renderPanel();
    const row = screen.getByRole("link", { name: "Publishing" });
    expect(await within(row).findByText("4")).toBeInTheDocument();
  });

  it("badges shoots with this week's schedule", async () => {
    renderPanel();
    const row = screen.getByRole("link", { name: "Shooting & editing" });
    expect(await within(row).findByText("3")).toBeInTheDocument();
  });

  it("leaves the pages without a queue unbadged", () => {
    renderPanel();
    for (const name of ["IPs & accounts", "Hot radar", "Benchmarks", "Scripts", "Review"]) {
      const row = screen.queryByRole("link", { name });
      if (!row) continue;
      expect(within(row).queryAllByText(/^\d+$/)).toEqual([]);
    }
  });
});

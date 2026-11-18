import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import { renderWithI18n } from "../test/i18n";
import { SalesPanel } from "./panel";

/**
 * The sales column's wiring: the two groups, the brand's business line, and the
 * two badges that carry real numbers — the creator ledger's size and the
 * follow-ups already due. A badge is a queue, so it must not appear before its
 * list answers.
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
vi.mock("@morechat/core/hr/queries", () => ({
  hrEmployeeListOptions: () => ({
    queryKey: ["hr", "ws-1", "employees"],
    queryFn: async () => ({
      employees: [{ member_id: "user-1", job_title: "Sales lead", leave_date: null }],
      total: 1,
    }),
  }),
}));

const overdue = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const ahead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

vi.mock("@morechat/core/creator/queries", () => ({
  creatorListOptions: () => ({
    queryKey: ["creator", "ws-1", {}],
    queryFn: async () => ({ creators: [], total: 12 }),
  }),
}));
vi.mock("@morechat/core/bd/queries", () => ({
  bdActivityListOptions: () => ({
    queryKey: ["bd", "ws-1", "activities", {}],
    queryFn: async () => ({
      activities: [
        { id: "a-1", next_follow_at: overdue },
        { id: "a-2", next_follow_at: ahead },
        { id: "a-3", next_follow_at: null },
      ],
      total: 3,
    }),
  }),
}));

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
  useNavigation: () => ({ pathname: "/acme/sales" }),
}));

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <WorkspaceSlugProvider slug="acme">
        <SalesPanel />
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
}

const links = () =>
  screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href) => href?.includes("/sales"));

describe("SalesPanel", () => {
  it("names the space and its business", () => {
    renderPanel();
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.getByText("Creator BD")).toBeInTheDocument();
  });

  it("groups the pipeline before the campaigns", () => {
    renderPanel();
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Ops")).toBeInTheDocument();
    expect(links()).toEqual([
      "/acme/sales",
      "/acme/sales/creators",
      "/acme/sales/followups",
      "/acme/sales/quotes",
      "/acme/sales/collabs",
      "/acme/sales/campaigns",
      "/acme/sales/performance",
    ]);
  });

  it("badges the creator ledger with its own count", async () => {
    renderPanel();
    const row = screen.getByRole("link", { name: "Creators" });
    expect(await within(row).findByText("12")).toBeInTheDocument();
  });

  // One follow-up is already due; the one scheduled ahead is not late yet.
  it("flags the follow-ups that are already due", async () => {
    renderPanel();
    const row = screen.getByRole("link", { name: "Follow-ups" });
    expect(await within(row).findByText("1")).toBeInTheDocument();
  });
});

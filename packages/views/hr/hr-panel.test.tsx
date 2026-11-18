import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import { renderWithI18n } from "../test/i18n";
import { HrPanel } from "./hr-panel";

/**
 * The HR left column: its three groups in the order the department reads them,
 * and the two badges that mark the queues. The badge numbers come from the
 * lists, so a workspace whose lists have not answered gets rows without badges
 * rather than zeros.
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

// A day either side of today, so "today and later" means the same thing
// whatever the clock says when the suite runs.
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const INTERVIEWS = [
  { id: "i-1", scheduled_at: tomorrow, status: "scheduled" },
  { id: "i-2", scheduled_at: yesterday, status: "done" },
  { id: "i-3", scheduled_at: tomorrow, status: "cancelled" },
];

vi.mock("@morechat/core/hr/queries", () => ({
  hrCandidateListOptions: (_wsId: string, filters: { stage?: string } = {}) => ({
    queryKey: ["hr", "ws-1", "candidates", filters],
    queryFn: async () => ({
      candidates: [],
      total: filters.stage === "screening" ? 3 : 9,
    }),
  }),
  hrInterviewListOptions: (_wsId: string, filters: object = {}) => ({
    queryKey: ["hr", "ws-1", "interviews", filters],
    queryFn: async () => ({ interviews: INTERVIEWS, total: INTERVIEWS.length }),
  }),
  hrEmployeeListOptions: () => ({
    queryKey: ["hr", "ws-1", "employees"],
    queryFn: async () => ({
      employees: [{ member_id: "user-1", job_title: "HR lead", leave_date: null }],
      total: 1,
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
  useNavigation: () => ({ pathname: "/acme/hr/recruit" }),
}));

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <WorkspaceSlugProvider slug="acme">
        <HrPanel />
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
}

const groupTitles = () =>
  Array.from(document.querySelectorAll("div"), (node) => node.textContent).filter(
    (text) => text === "Hiring" || text === "People" || text === "Tools",
  );

describe("HrPanel", () => {
  it("names the three groups in the order the department runs them", () => {
    renderPanel();
    expect(groupTitles()).toEqual(["Hiring", "People", "Tools"]);
  });

  it("lists the nine pages in the registry's order", () => {
    renderPanel();
    expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.includes("/hr/"))
      .map((link) => link.getAttribute("href"))).toEqual([
      "/acme/hr/recruit",
      "/acme/hr/resumes",
      "/acme/hr/guide",
      "/acme/hr/interviews",
      "/acme/hr/scores",
      "/acme/hr/employees",
      "/acme/hr/offboard",
      "/acme/hr/files",
      "/acme/hr/analysis",
    ]);
  });

  it("marks the page on screen as current and no other", () => {
    renderPanel();
    expect(screen.getByRole("link", { name: "Recruiting" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Interviews" })).not.toHaveAttribute("aria-current");
  });

  // The queue that matters at 简历筛选 is the people waiting to be read, not the
  // whole candidate ledger.
  it("badges the screening row with the number waiting", async () => {
    renderPanel();
    const row = screen.getByRole("link", { name: "Resumes" });
    expect(await within(row).findByText("3")).toBeInTheDocument();
  });

  it("badges the interview row with the rounds still ahead", async () => {
    renderPanel();
    const row = screen.getByRole("link", { name: "Interviews" });
    // Two tomorrow, one of them cancelled; yesterday's is history.
    expect(await within(row).findByText("1")).toBeInTheDocument();
  });

  it("ends in a footer with Settings and the reader's post", async () => {
    renderPanel();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/acme/settings",
    );
    expect(await screen.findByText("Ada Lin")).toBeInTheDocument();
    expect(await screen.findByText("HR lead")).toBeInTheDocument();
  });
});

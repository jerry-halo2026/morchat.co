import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NavigationProvider, type NavigationAdapter } from "../navigation";
import { renderWithI18n } from "../test/i18n";
import { OverviewPage } from "./overview-page";
import type { WorkbenchOverviewResponse } from "@morechat/core/metrics/response";

const overview = vi.hoisted(() => ({
  current: {
    metrics: {
      "work.throughput.week": { value: 12, sample_count: 20, empty: "zero" },
      "work.overdue.count": { value: 0, sample_count: 0, empty: "zero" },
      "work.cycle_time.median": { value: null, sample_count: 0, empty: "insufficient_data" },
      "work.on_time.rate": { value: null, sample_count: 0, empty: "insufficient_data" },
      "work.wip.count": { value: 4, sample_count: 4, empty: "zero" },
      "crm.pipeline.weighted_amount": {
        value: null,
        sample_count: 0,
        empty: "insufficient_data",
      },
      // The B1 strip; one stated, one zero, two gaps, so the people group draws
      // every state the contract allows.
      "hr.candidates.active": { value: 3, sample_count: 3, empty: "zero" },
      "hr.time_to_hire.median": { value: null, sample_count: 0, empty: "insufficient_data" },
      "hr.scorecard.backlog": { value: 0, sample_count: 0, empty: "zero" },
      "hr.interview.on_time_rate": { value: 0.87, sample_count: 9, empty: "zero" },
    },
  } as WorkbenchOverviewResponse,
}));

// `/counts` is read straight from the core query options, so the fixture is the
// wire shape (`collabs_open`), not a view-layer rename. The four B1 counters are
// here too: a group total is only stated when the group has counts, and the
// people band's "· N items" is one of the things this suite pins.
const counts = vi.hoisted(() => ({
  current: {
    creators: 7,
    clients: 3,
    briefs: 5,
    collabs_open: 2,
    settlements_pending: 1,
    jobs: 4,
    candidates: 3,
    interviews: 2,
    employees: 1,
  },
}));

// Already narrowed by the pane's `select`, because a mocked `useQuery` returns
// what the pane reads: this is the shape `@morechat/core/hr/queries` hands back.
const hrRows = vi.hoisted(() => ({
  current: {
    candidates: [
      {
        id: "cand-1-0000-0000-0000-000000000001",
        workspace_id: "ws-1",
        job_id: "job-1-0000-0000-0000-000000000001",
        name: "Lin Wei",
        stage: "interview",
        source: null,
        phone: null,
        email: null,
        resume_attachment_id: null,
        match_score: 82,
        score_resume: null,
        score_test: null,
        score_interview: null,
        expected_salary: 21000,
        offer_salary: null,
        currency: "CNY",
        owner_member_id: null,
        hired_at: null,
        rejected_reason: null,
        created_by: null,
        created_at: "2026-01-05T09:00:00Z",
        updated_at: "2026-01-05T09:00:00Z",
        archived_at: null,
      },
    ],
  } as Record<string, unknown[]>,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (options: { queryKey: unknown[] }) => {
      const key = options.queryKey;
      if (key[0] === "workbench" && key[2] === "overview") {
        return { data: overview.current, isPending: false };
      }
      if (key[0] === "workbench" && key[2] === "counts") {
        return { data: counts.current, isPending: false };
      }
      if (key[0] === "hr") {
        return { data: hrRows.current[key[2] as string], isPending: false };
      }
      if (key[2] === "departments") {
        return {
          data: [
            { id: "dept-ops", name: "Ops" },
            { id: "dept-growth", name: "Growth" },
          ],
          isPending: false,
        };
      }
      return { data: undefined, isPending: false };
    },
  };
});

vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

// The view default is decided by the reader's role; the role comes from the
// workspace member list in production, so it is the one input this suite sets.
const member = vi.hoisted(() => ({
  current: { userId: "user-1", role: "member" as "owner" | "admin" | "member" },
}));

vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: member.current.userId,
    role: member.current.role,
    member: null,
    isLoading: false,
  }),
}));

vi.mock("@morechat/core/paths", () => ({
  useWorkspacePaths: () => ({
    overview: () => "/acme/overview",
    issues: () => "/acme/issues",
    memberDetail: (id: string) => `/acme/members/${id}`,
    agentDetail: (id: string) => `/acme/agents/${id}`,
  }),
}));

vi.mock("@morechat/core/agents/use-agent-presence", () => ({
  useWorkspacePresenceMap: () => ({ byAgent: new Map(), loading: false }),
}));

const replace = vi.fn();

function adapter(search: string): NavigationAdapter {
  return {
    push: vi.fn(),
    replace,
    back: vi.fn(),
    pathname: "/acme/overview",
    searchParams: new URLSearchParams(search),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderPage(search = "") {
  return renderWithI18n(
    <NavigationProvider value={adapter(search)}>
      <OverviewPage />
    </NavigationProvider>,
  );
}

beforeEach(() => {
  // Each test starts as a plain member who has not picked a view: the neutral
  // view is the baseline the rest of the suite was written against.
  member.current.role = "member";
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  replace.mockClear();
});

describe("OverviewPage", () => {
  it("draws the metric strip in the contract's three states", () => {
    const { container } = renderPage();
    // value / zero / gap, all in the one strip.
    expect(screen.getByText("Closed this week")).toBeInTheDocument();
    expect(container).toHaveTextContent("12");
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    // A measured zero prints its 0 and nothing else: the dash belongs to gaps,
    // and putting it under a zero said two contradictory things at once.
    expect(screen.queryByText("None yet")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.getByText("Median cycle time")).toBeInTheDocument();
    // The pipeline amount is a sales number, so the neutral view leaves it to
    // the sales view (and to the one that reads the whole business).
    expect(screen.queryByText("Weighted pipeline")).toBeNull();
  });

  it("draws the delivery and hiring strips into the same KPI grid", () => {
    const { container } = renderPage();
    // One grid rule for every strip on the page: phones one column, md two,
    // desktop four, five once xl has the room.
    const grids = [...container.querySelectorAll<HTMLElement>("[class*='xl:grid-cols-5']")];
    expect(grids).toHaveLength(2);
    for (const grid of grids) {
      expect(grid).toHaveClass("grid-cols-1", "md:grid-cols-2", "lg:grid-cols-4", "xl:grid-cols-5");
    }
  });

  it("closes the last row of a strip instead of leaving empty cells", () => {
    const { container } = renderPage();
    // Five delivery numbers fill the five-column row exactly, so no cell has to
    // be stretched: the closing card takes the leftover cell at the narrower
    // breakpoints only (5 in 4 columns leaves 3, so it spans 4).
    expect(container.querySelectorAll("[class*='xl:col-span-5']")).toHaveLength(0);
    const delivery = [...container.querySelectorAll<HTMLElement>("[class*='lg:col-span-4']")];
    expect(delivery).toHaveLength(1);
    expect(delivery[0]).toHaveClass("md:col-span-2");
    // Four hiring numbers in five columns leave one cell: the closing card takes two.
    expect(container.querySelectorAll("[class*='xl:col-span-2']")).toHaveLength(1);
  });

  it("lists all nine ledgers under their two groups, with the commerce counts", () => {
    renderPage();
    const section = screen.getByRole("region", { name: "Ledgers" });
    // The overview draws the same split the ledger tab does (§10: commerce vs
    // people), so the group is named once per band rather than per row.
    expect(within(section).getByRole("heading", { name: "Commerce" })).toBeInTheDocument();
    expect(within(section).getByRole("heading", { name: "People" })).toBeInTheDocument();
    // The band total says what it counts — rows entered, not money, not ledgers.
    expect(within(section).getByText("· 18 items")).toBeInTheDocument();
    expect(within(section).getByText("· 10 items")).toBeInTheDocument();
    for (const [label, count] of [
      ["Creators", "7"],
      ["Clients", "3"],
      ["Briefs", "5"],
      ["Collaborations", "2"],
      ["Settlements", "1"],
    ] as const) {
      const row = within(section).getByRole("link", { name: new RegExp(label) });
      expect(row).toHaveTextContent(count);
    }
    // The four B1 rows are destinations like the rest, whether or not `/counts`
    // has a number for them yet.
    for (const label of ["Jobs", "Candidates", "Interviews", "Employees"]) {
      expect(within(section).getByRole("link", { name: new RegExp(label) })).toHaveAttribute(
        "href",
        expect.stringContaining(`domain=${label.toLowerCase()}`),
      );
    }
  });

  it("keeps the tab in the URL", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: "Ledger" }));
    expect(replace).toHaveBeenCalledWith("/acme/overview?tab=ledger");
  });

  it("writes the chosen tab back to the overview tab as a bare URL", async () => {
    renderPage("?tab=team");
    await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(replace).toHaveBeenCalledWith("/acme/overview");
  });

  it("writes the department filter into ?dept=", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("combobox", { name: "Department" }));
    await userEvent.click(await screen.findByRole("option", { name: "Growth" }));
    expect(replace).toHaveBeenCalledWith("/acme/overview?dept=dept-growth");
  });

  it("clears ?dept= when the filter goes back to every department", async () => {
    renderPage("?dept=dept-growth");
    await userEvent.click(screen.getByRole("combobox", { name: "Department" }));
    await userEvent.click(await screen.findByRole("option", { name: "All departments" }));
    expect(replace).toHaveBeenCalledWith("/acme/overview");
  });

  it("opens a ledger tab from a gap card inside a narrowed view", async () => {
    // `?tab=overview` is explicit, so switching the view re-lays the overview
    // out without moving the reader off it.
    renderPage("?tab=overview");
    await userEvent.click(screen.getByRole("button", { name: "Sales" }));
    // The sales view draws its own six numbers, so several of them are gaps: the
    // pipeline amount comes first in contract order and its card is what opens
    // the ledger that fills it.
    const fill = screen.getAllByRole("button", { name: "Fill it in the ledger" });
    expect(fill.length).toBeGreaterThan(0);
    const first = fill[0];
    if (!first) throw new Error("no gap card in the sales strip");
    await userEvent.click(first);
    expect(replace).toHaveBeenLastCalledWith("/acme/overview?tab=ledger&domain=collabs");
  });

  it("renders the ledger tab's table for ?domain=", () => {
    renderPage("?tab=ledger&domain=settlements");
    expect(screen.getByRole("tab", { name: "Settlements" })).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "Settlements" })).toBeInTheDocument();
  });

  it("splits the ledger tab's switcher into the commerce and people groups", () => {
    renderPage("?tab=ledger&domain=jobs");
    const commerce = screen.getByRole("tablist", { name: "Commerce" });
    const people = screen.getByRole("tablist", { name: "People" });
    expect(within(commerce).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Creators",
      "Clients",
      "Briefs",
      "Collaborations",
      "Settlements",
    ]);
    expect(within(people).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Jobs",
      "Candidates",
      "Interviews",
      "Employees",
    ]);
    expect(within(people).getByRole("tab", { name: "Jobs" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("grid", { name: "Jobs" })).toBeInTheDocument();
  });

  it("writes a people ledger back as ?tab=ledger&domain=", async () => {
    renderPage("?tab=ledger&domain=jobs");
    await userEvent.click(screen.getByRole("tab", { name: "Interviews" }));
    expect(replace).toHaveBeenCalledWith("/acme/overview?tab=ledger&domain=interviews");
  });

  it("leads the people group with its four hiring numbers", () => {
    renderPage("?tab=ledger&domain=candidates");
    for (const label of [
      "Active candidates",
      "Time to hire",
      "Unscored interviews",
      "On-time interviews",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // A zero is still a zero (no glyph under it), and the missing number names
    // what actually has to be entered: time to hire reads the hire date, so it
    // asks for a hire rather than for more candidates.
    expect(screen.queryByText("None yet")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
    expect(
      screen.getByText(
        "Nobody has been hired through the ledger yet, so there is no hire date to measure against.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the hiring strip off the commerce ledgers", () => {
    renderPage("?tab=ledger&domain=creators");
    expect(screen.queryByText("Active candidates")).toBeNull();
  });

  it("sends a hiring gap card to the ledger that owns the rows", async () => {
    renderPage("?tab=ledger&domain=jobs");
    await userEvent.click(screen.getByRole("button", { name: "Fill it in the ledger" }));
    expect(replace).toHaveBeenCalledWith("/acme/overview?tab=ledger&domain=candidates");
  });

  it("reads a people ledger from the hr client, not the crm one", () => {
    renderPage("?tab=ledger&domain=candidates");
    const grid = screen.getByRole("grid", { name: "Candidates" });
    expect(within(grid).getByText("Lin Wei")).toBeInTheDocument();
    expect(within(grid).getByText("Interview")).toBeInTheDocument();
    expect(within(grid).getByText("82")).toBeInTheDocument();
  });

  it("puts the four hiring numbers above the ledger rows on the overview tab", () => {
    renderPage();
    const hiring = screen.getByRole("region", { name: "Hiring" });
    for (const label of [
      "Active candidates",
      "Time to hire",
      "Unscored interviews",
      "On-time interviews",
    ]) {
      // One strip, so one cell per number: the borrowing of the people group's
      // four ids must not draw a second copy.
      expect(screen.getAllByText(label)).toHaveLength(1);
      expect(within(hiring).getByText(label)).toBeInTheDocument();
    }
    // Same states as the ledger tab's copy of the strip: time to hire has no
    // hire date to read and says so, the backlog is a true zero.
    expect(
      within(hiring).getByText(
        "Nobody has been hired through the ledger yet, so there is no hire date to measure against.",
      ),
    ).toBeInTheDocument();
    // The band's title carries its own count, in the ledger groups' form.
    expect(within(hiring).getByText("· 4 items")).toBeInTheDocument();
  });

  it("does not draw the hiring numbers twice on the ledger tab", () => {
    // The overview panel is unmounted while the ledger tab is up, so the people
    // group's strip is the only one on screen — one group of four, not two.
    renderPage("?tab=ledger&domain=candidates");
    for (const label of [
      "Active candidates",
      "Time to hire",
      "Unscored interviews",
      "On-time interviews",
    ]) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
  });

  // ── Views ────────────────────────────────────────────────────────────────
  // Which slice of the workbench a reader sees. The view is a choice stored per
  // user; its only automatic input is the role, and it never overrides a tab
  // the URL already names.

  it("switches the four views from the header and shows the chosen one", async () => {
    const { container } = renderPage("?tab=overview");
    const switcher = screen.getByRole("group", { name: "View" });
    expect(within(switcher).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "All",
      "Sales",
      "People",
      "P&L",
    ]);
    expect(within(switcher).getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The department filter is a separate control and stays where it was.
    expect(container.querySelector("[role='combobox']")).toBeInTheDocument();
  });

  it("opens a workspace owner on the money tab", async () => {
    member.current.role = "owner";
    renderPage();
    // `finance` is the owner's default view, and that view lands on the money
    // block rather than the overview.
    const money = await screen.findByRole("tab", { name: "Money" });
    expect(money).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "Ledgers" })).toBeNull();
  });

  it("narrows the overview to the hiring numbers and the people ledgers", async () => {
    renderPage("?tab=overview");
    await userEvent.click(screen.getByRole("button", { name: "People" }));

    // The strip is the view's own numbers: the four hiring ones, and none of
    // the delivery or pipeline ones.
    expect(screen.getByText("Active candidates")).toBeInTheDocument();
    expect(screen.queryByText("Closed this week")).toBeNull();
    expect(screen.queryByText("Weighted pipeline")).toBeNull();
    expect(screen.queryByText("Median cycle time")).toBeNull();

    const section = screen.getByRole("region", { name: "Ledgers" });
    expect(within(section).getByRole("heading", { name: "People" })).toBeInTheDocument();
    expect(within(section).queryByRole("heading", { name: "Commerce" })).toBeNull();
    expect(within(section).queryByRole("link", { name: /Creators/ })).toBeNull();
    expect(within(section).getByRole("link", { name: /Candidates/ })).toBeInTheDocument();
  });

  it("narrows the overview to the money numbers in the sales view", async () => {
    renderPage("?tab=overview");
    await userEvent.click(screen.getByRole("button", { name: "Sales" }));
    expect(screen.getByText("Weighted pipeline")).toBeInTheDocument();
    // A salesperson is not handed the hiring strip, and not handed the people
    // ledgers either.
    expect(screen.queryByText("Active candidates")).toBeNull();
    const section = screen.getByRole("region", { name: "Ledgers" });
    expect(within(section).getByRole("heading", { name: "Commerce" })).toBeInTheDocument();
    expect(within(section).queryByRole("heading", { name: "People" })).toBeNull();
  });

  it("lands a narrowed view's ledger tab on its own first ledger", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "People" }));
    // No `?tab=` was in the URL, so the view's landing tab is written — and the
    // department filter (absent here) would have been carried through.
    expect(replace).toHaveBeenLastCalledWith("/acme/overview?tab=ledger&domain=jobs");
  });

  it("keeps the department filter when the view changes", async () => {
    renderPage("?dept=dept-growth");
    await userEvent.click(screen.getByRole("button", { name: "People" }));
    expect(replace).toHaveBeenLastCalledWith(
      "/acme/overview?dept=dept-growth&tab=ledger&domain=jobs",
    );
  });

  it("remembers the view a reader picks", async () => {
    renderPage("?tab=overview");
    await userEvent.click(screen.getByRole("button", { name: "Sales" }));
    expect(localStorage.getItem("workbench.view.user-1")).toBe("commerce");
  });

  it("opens on the remembered view", async () => {
    localStorage.setItem("workbench.view.user-1", "people");
    renderPage("?tab=overview");
    expect(await screen.findByText("Active candidates")).toBeInTheDocument();
    expect(screen.queryByText("Closed this week")).toBeNull();
  });

  it("lets an explicit ?tab= win over the view's own landing tab", async () => {
    member.current.role = "owner"; // would otherwise land on the money tab
    renderPage("?tab=ledger&domain=settlements");
    expect(await screen.findByRole("tab", { name: "Settlements" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("grid", { name: "Settlements" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Money" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("keeps a narrowed view's ledger switcher to its own group", async () => {
    localStorage.setItem("workbench.view.user-1", "people");
    renderPage("?tab=ledger&domain=candidates");
    // The reader's stored view is people, and the URL names a people ledger, so
    // only that group's switcher is drawn.
    const people = await screen.findByRole("tablist", { name: "People" });
    expect(within(people).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Jobs",
      "Candidates",
      "Interviews",
      "Employees",
    ]);
    expect(screen.queryByRole("tablist", { name: "Commerce" })).toBeNull();
  });

  it("falls back to the view's own first ledger when ?domain= is outside it", async () => {
    localStorage.setItem("workbench.view.user-1", "commerce");
    // A link carrying a hiring ledger reaches a reader whose view has no hiring
    // ledgers: rather than draw a table the switcher cannot reach, the view's
    // first ledger takes over.
    renderPage("?tab=ledger&domain=candidates");
    await screen.findByRole("tablist", { name: "Commerce" });
    expect(screen.getByRole("tab", { name: "Creators" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("grid", { name: "Creators" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "People" })).toBeNull();
  });
});

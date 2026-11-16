import { afterEach, describe, expect, it, vi } from "vitest";
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
// wire shape (`collabs_open`), not a view-layer rename.
const counts = vi.hoisted(() => ({
  current: { creators: 7, clients: 3, briefs: 5, collabs_open: 2, settlements_pending: 1 },
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
    expect(screen.getByText("None yet")).toBeInTheDocument();
    expect(screen.getByText("Median cycle time")).toBeInTheDocument();
    expect(screen.getByText("Weighted pipeline")).toBeInTheDocument();
  });

  it("lists all nine ledgers under their two groups, with the commerce counts", () => {
    renderPage();
    const section = screen.getByRole("region", { name: "Ledgers" });
    // The overview draws the same split the ledger tab does (§10: commerce vs
    // people), so the group is named once per band rather than per row.
    expect(within(section).getByRole("heading", { name: "Commerce" })).toBeInTheDocument();
    expect(within(section).getByRole("heading", { name: "People" })).toBeInTheDocument();
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

  it("opens a ledger tab from a gap card", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Fill it in the ledger" }));
    expect(replace).toHaveBeenCalledWith("/acme/overview?tab=ledger&domain=collabs");
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
    // A zero is still a zero, and the missing number names what actually has to
    // be entered: time to hire reads the hire date, so it asks for a hire
    // rather than for more candidates.
    expect(screen.getByText("None yet")).toBeInTheDocument();
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
});

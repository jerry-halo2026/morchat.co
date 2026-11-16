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
    },
  } as WorkbenchOverviewResponse,
}));

// `/counts` is read straight from the core query options, so the fixture is the
// wire shape (`collabs_open`), not a view-layer rename.
const counts = vi.hoisted(() => ({
  current: { creators: 7, clients: 3, briefs: 5, collabs_open: 2, settlements_pending: 1 },
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

  it("lists all five ledgers with their counts", () => {
    renderPage();
    const section = screen.getByRole("region", { name: "Ledgers" });
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
});

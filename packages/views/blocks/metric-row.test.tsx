import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NavigationProvider, type NavigationAdapter } from "../navigation";
import { renderWithI18n } from "../test/i18n";
import { MetricRow } from "./metric-row";
import type { WorkbenchOverviewResponse } from "@morechat/core/metrics/response";

// The strip is a contract renderer, so the fixture is the contract's own
// payload: one stated number, one true zero, two gaps.
const overview = vi.hoisted(() => ({
  current: {
    metrics: {
      "work.throughput.week": { value: 12, sample_count: 20, empty: "zero" },
      "work.overdue.count": { value: 0, sample_count: 0, empty: "zero" },
      "work.cycle_time.median": { value: null, sample_count: 0, empty: "insufficient_data" },
      "crm.pipeline.weighted_amount": {
        value: null,
        sample_count: 0,
        empty: "insufficient_data",
      },
    },
  } as WorkbenchOverviewResponse,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: () => ({ data: overview.current, isPending: false }),
  };
});

vi.mock("@morechat/core/paths", () => ({
  useWorkspacePaths: () => ({
    issues: () => "/acme/issues",
    overview: () => "/acme/overview",
  }),
}));

const METRICS = [
  "work.throughput.week",
  "work.overdue.count",
  "work.cycle_time.median",
  "crm.pipeline.weighted_amount",
] as const;

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

function renderRow(onFillGap: (id: string) => void = () => {}) {
  return renderWithI18n(
    <NavigationProvider value={adapter()}>
      <MetricRow
        wsId="ws-1"
        departmentId={null}
        metricIds={[...METRICS]}
        onFillGap={onFillGap as never}
      />
    </NavigationProvider>,
  );
}

afterEach(cleanup);

describe("MetricRow", () => {
  it("renders a stated number with the denominator the server measured", () => {
    const { container } = renderRow();
    expect(screen.getByText("Closed this week")).toBeInTheDocument();
    expect(container).toHaveTextContent("12");
    expect(screen.getByText("of 20 rows")).toBeInTheDocument();
  });

  it("renders a true zero as 0 alone, never as a gap and never with a dash", () => {
    renderRow();
    const label = screen.getByText("Overdue");
    const cell = label.parentElement;
    expect(cell).toHaveTextContent("0");
    // A measured zero is a figure. Printing the "no value" glyph under it said
    // two contradictory things at once, so the dash now belongs to gaps only.
    expect(cell).not.toHaveTextContent("—");
    // The zero cell is still a KPI tile: no gap copy leaked into it.
    expect(cell).not.toHaveTextContent("The issues behind this number");
  });

  it("draws into the shared KPI grid and closes the last row", () => {
    const { container } = renderRow();
    const grid = container.firstElementChild as HTMLElement;
    // The same column rule as every other strip on the workbench.
    expect(grid).toHaveClass("grid-cols-1", "md:grid-cols-2", "lg:grid-cols-4", "xl:grid-cols-5");
    // Four cards in five columns leave one cell; the closing card takes two.
    const closing = [...container.querySelectorAll<HTMLElement>("[class*='xl:col-span-2']")];
    expect(closing).toHaveLength(1);
  });

  it("renders insufficient_data as a gap card naming what to enter", () => {
    renderRow();
    expect(screen.getByText("Median cycle time")).toBeInTheDocument();
    expect(
      screen.getByText("The issues behind this number are missing a field it needs."),
    ).toBeInTheDocument();
    // Work metrics are filled on the issue, so the way out is the issue list.
    expect(screen.getByRole("link", { name: "Open issues" })).toHaveAttribute(
      "href",
      "/acme/issues",
    );
  });

  it("sends a ledger gap to the ledger that owns the rows", async () => {
    const onFillGap = vi.fn();
    renderRow(onFillGap);
    expect(screen.getByText("Weighted pipeline")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fill it in the ledger" }));
    expect(onFillGap).toHaveBeenCalledWith("crm.pipeline.weighted_amount");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithI18n } from "../test/i18n";
import { FinanceSection } from "./finance-section";
import type { WorkbenchFinanceResponse } from "@morechat/core/types";

// The block is a renderer of the server's three states, so the fixture is the
// money payload itself: two stated figures, one stated ratio, and the two figures
// whose rows are missing.
const figures = vi.hoisted(() => ({
  current: {
    window: { month: "2026-11" },
    signed: { value: 10000, sample_count: 1, empty: "zero" },
    collected: { value: 3000, sample_count: 1, empty: "zero" },
    gross_margin: { value: 0.6667, sample_count: 1, empty: "zero" },
    receivable_days: { value: 3.5, sample_count: 2, empty: "zero" },
    cash_floor: { value: null, sample_count: 0, empty: "insufficient_data" },
  } as WorkbenchFinanceResponse,
}));

// The all-gaps shape: what a degraded response (and the client's own fallback)
// hands the block when nothing is measurable.
const allGaps = vi.hoisted(() => ({
  current: {
    window: { month: "2026-11" },
    signed: { value: null, sample_count: 0, empty: "insufficient_data" },
    collected: { value: null, sample_count: 0, empty: "insufficient_data" },
    gross_margin: { value: null, sample_count: 0, empty: "insufficient_data" },
    receivable_days: { value: null, sample_count: 0, empty: "insufficient_data" },
    cash_floor: { value: null, sample_count: 0, empty: "insufficient_data" },
  } as WorkbenchFinanceResponse,
}));

const state = vi.hoisted(() => ({ useGaps: false }));

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: () => ({
      data: state.useGaps ? allGaps.current : figures.current,
      isPending: false,
      isError: false,
    }),
  };
});

function renderSection() {
  return renderWithI18n(<FinanceSection wsId="ws-1" departmentId={null} />);
}

afterEach(() => {
  cleanup();
  state.useGaps = false;
});

describe("FinanceSection", () => {
  it("prints the stated figures: money, the percent at the display scale, the age", () => {
    const { container } = renderSection();

    expect(screen.getByText("Signed this month")).toBeInTheDocument();
    // Money goes through the shared currency flow, so the amount reads with the
    // contract's own symbol (C9) rather than a local format.
    expect(container).toHaveTextContent("¥10000");
    expect(container).toHaveTextContent("¥3000");

    // The margin is stored 0–1 and shown 0–100 with no decimals (C3).
    expect(screen.getByText("Gross margin")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();

    // The month the figures describe is named once, above the grid.
    expect(screen.getByText("2026-11")).toBeInTheDocument();
  });

  it("renders the stating hints under the numbers", () => {
    renderSection();
    expect(screen.getByText("This month · renewals included")).toBeInTheDocument();
    expect(screen.getByText("This month, money that cleared")).toBeInTheDocument();
    expect(screen.getByText("This month · against settled cost")).toBeInTheDocument();
  });

  it("renders every unmeasurable figure as a dash, never a zero", () => {
    state.useGaps = true;
    const { container } = renderSection();

    // Five cells, five dashes: a figure with no rows behind it is not a 0.
    expect(screen.getAllByText("—")).toHaveLength(5);
    expect(container).not.toHaveTextContent("¥0");
    expect(container).not.toHaveTextContent("0%");

    // The gap cells name what is missing, which is what makes them actionable
    // rather than just empty.
    expect(
      screen.getByText(
        "No collaboration was settled this month, so the margin has no cost side to measure against.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Cost and cash entries are missing, so the cash floor cannot be worked out.",
      ),
    ).toBeInTheDocument();
  });
});

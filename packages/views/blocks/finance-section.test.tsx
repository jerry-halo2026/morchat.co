import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithI18n } from "../test/i18n";
import { FinanceSection } from "./finance-section";
import type { WorkbenchFinanceResponse } from "@morechat/core/types";

// The block is a renderer of the server's three states plus the cost set behind
// each figure, so the fixture is the money payload itself.
const apiMocks = vi.hoisted(() => ({
  getWorkbenchFinance: vi.fn(),
  listWorkbenchFinanceMonths: vi.fn(),
  upsertWorkbenchFinanceMonth: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api: apiMocks }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function figures(overrides: Partial<WorkbenchFinanceResponse> = {}): WorkbenchFinanceResponse {
  return {
    window: { month: "2026-11" },
    signed: { value: 10000, sample_count: 1, empty: "zero" },
    collected: { value: 3000, sample_count: 1, empty: "zero" },
    gross_margin: {
      value: 0.6667,
      sample_count: 1,
      empty: "zero",
      basis: "settled_collabs",
    },
    receivable_days: { value: 3.5, sample_count: 2, empty: "zero" },
    cash_floor: { value: 21500, sample_count: 1, empty: "zero", basis: "entered" },
    ...overrides,
  };
}

// The all-gaps shape: what a degraded response (and the client's own fallback)
// hands the block when nothing is measurable.
function allGaps(): WorkbenchFinanceResponse {
  const gap = { value: null, sample_count: 0, empty: "insufficient_data" as const };
  return {
    window: { month: "2026-11" },
    signed: gap,
    collected: gap,
    gross_margin: { ...gap, basis: "none" },
    receivable_days: gap,
    cash_floor: { ...gap, basis: "none" },
  };
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <FinanceSection wsId="ws-1" departmentId={null} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiMocks.getWorkbenchFinance.mockResolvedValue(figures());
  apiMocks.listWorkbenchFinanceMonths.mockResolvedValue({ months: [], total: 0 });
  apiMocks.upsertWorkbenchFinanceMonth.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FinanceSection", () => {
  it("prints the stated figures: money, the percent at the display scale, the age", async () => {
    const { container } = renderSection();

    expect(await screen.findByText("Signed this month")).toBeInTheDocument();
    // Money goes through the shared currency flow, so the amount reads with the
    // contract's own symbol (C9) rather than a local format.
    expect(container).toHaveTextContent("¥10000");
    expect(container).toHaveTextContent("¥3000");
    // The cash floor is stated now that the month has an opening balance.
    expect(container).toHaveTextContent("¥21500");

    // The margin is stored 0–1 and shown 0–100 with no decimals (C3).
    expect(screen.getByText("Gross margin")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();

    // The month the figures describe is named once, above the grid.
    expect(screen.getByText("2026-11")).toBeInTheDocument();
  });

  it("names the cost set behind each figure instead of implying one", async () => {
    renderSection();

    // Settled collaborations supplied the margin's cost side; the entered month
    // entry supplied the cash floor's.
    expect(await screen.findByText("Settled collaboration fees")).toBeInTheDocument();
    expect(screen.getByText("Entered cost")).toBeInTheDocument();
  });

  it("prints entered cost when the month entry carries the cost side", async () => {
    apiMocks.getWorkbenchFinance.mockResolvedValue(
      figures({
        gross_margin: { value: 0.8, sample_count: 1, empty: "zero", basis: "entered" },
        // No opening balance yet, so only the margin names a cost set here.
        cash_floor: { value: null, sample_count: 0, empty: "insufficient_data", basis: "none" },
      }),
    );
    renderSection();

    expect(await screen.findByText("Entered cost")).toBeInTheDocument();
    expect(screen.queryByText("Settled collaboration fees")).not.toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("says the cost side is missing when a stated figure ran without one", async () => {
    apiMocks.getWorkbenchFinance.mockResolvedValue(
      figures({
        // Opening cash entered, no cost bill: the floor is stated, and it is the
        // card that has to admit what it did not subtract.
        cash_floor: { value: 23000, sample_count: 1, empty: "zero", basis: "none" },
      }),
    );
    renderSection();

    expect(await screen.findByText("No cost entry yet")).toBeInTheDocument();
  });

  it("renders every unmeasurable figure as a dash, never a zero", async () => {
    apiMocks.getWorkbenchFinance.mockResolvedValue(allGaps());
    const { container } = renderSection();

    expect(await screen.findByText("Gross margin")).toBeInTheDocument();

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
        "No opening cash balance was entered for this month, so the cash floor cannot be worked out.",
      ),
    ).toBeInTheDocument();
  });

  it("points at the entry form when money came in but no cost was recorded", async () => {
    apiMocks.getWorkbenchFinance.mockResolvedValue(
      figures({
        gross_margin: { value: null, sample_count: 1, empty: "insufficient_data", basis: "none" },
        cash_floor: { value: null, sample_count: 0, empty: "insufficient_data", basis: "none" },
      }),
    );
    renderSection();

    // Collected money with no cost side is a missing entry, not an empty ledger.
    expect(
      await screen.findByText("No cost was entered for this month, so the margin has no cost side."),
    ).toBeInTheDocument();
  });

  it("opens the month's cost entry from the header button", async () => {
    renderSection();

    const button = await screen.findByRole("button", { name: "2026-11 · enter cost" });
    await userEvent.click(button);

    expect(await screen.findByText("Enter 2026-11 cost")).toBeInTheDocument();
    // The dialog reads the month it is about, so an existing entry can be edited.
    await waitFor(() =>
      expect(apiMocks.listWorkbenchFinanceMonths).toHaveBeenCalledWith({ month: "2026-11" }),
    );
  });
});

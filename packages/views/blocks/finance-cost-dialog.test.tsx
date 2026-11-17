import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { renderWithI18n } from "../test/i18n";
import { FinanceCostDialog } from "./finance-cost-dialog";

// The month entry dialog (migration 707). Three properties, and no more:
//   - an entry that records nothing is refused before the request;
//   - a save writes the month's first day and the amounts as typed, sending an
//     empty field as null rather than as 0;
//   - an existing entry pre-fills, so a second visit edits instead of overwriting
//     blind.

const apiMocks = vi.hoisted(() => ({
  getWorkbenchFinance: vi.fn(),
  listWorkbenchFinanceMonths: vi.fn(),
  upsertWorkbenchFinanceMonth: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api: apiMocks }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const view = renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <FinanceCostDialog wsId="ws-1" month="2026-11" open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { ...view, onOpenChange };
}

beforeEach(() => {
  apiMocks.listWorkbenchFinanceMonths.mockResolvedValue({ months: [], total: 0 });
  apiMocks.upsertWorkbenchFinanceMonth.mockResolvedValue({ id: "entry-1", month: "2026-11-01" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FinanceCostDialog", () => {
  it("refuses an entry that records no amount", async () => {
    const { onOpenChange } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Fill in at least one amount.");
    // Nothing was sent: an entry with no amount looks like a cost side of zero.
    expect(apiMocks.upsertWorkbenchFinanceMonth).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("saves the month's first day and the amounts as typed", async () => {
    const { onOpenChange } = renderDialog();

    await userEvent.type(screen.getByLabelText("Fixed cost"), "12000.5");
    await userEvent.type(screen.getByLabelText("Variable cost"), "3400");
    await userEvent.type(screen.getByLabelText("Note"), "rent");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiMocks.upsertWorkbenchFinanceMonth).toHaveBeenCalledTimes(1));
    expect(apiMocks.upsertWorkbenchFinanceMonth).toHaveBeenCalledWith({
      // C7: the wire form is a date, not a `YYYY-MM` label.
      month: "2026-11-01",
      // An untouched field is "not recorded", never 0.
      cash_open: null,
      fixed_cost: 12000.5,
      variable_cost: 3400,
      note: "rent",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith("This month's cost was saved.");
  });

  it("pre-fills the stored entry so a second visit edits it", async () => {
    apiMocks.listWorkbenchFinanceMonths.mockResolvedValue({
      months: [
        {
          id: "entry-1",
          workspace_id: "ws-1",
          month: "2026-11-01",
          cash_open: 50000,
          fixed_cost: null,
          variable_cost: 3400,
          note: "rent + payroll",
          created_by: null,
          created_at: "2026-11-17T00:00:00Z",
          updated_at: "2026-11-17T00:00:00Z",
        },
      ],
      total: 1,
    });

    const { onOpenChange } = renderDialog();

    await waitFor(() => expect(screen.getByLabelText("Opening cash")).toHaveValue(50000));
    expect(screen.getByLabelText("Fixed cost")).toHaveValue(null);
    expect(screen.getByLabelText("Variable cost")).toHaveValue(3400);
    expect(screen.getByLabelText("Note")).toHaveValue("rent + payroll");

    // The read is the month the dialog is about.
    expect(apiMocks.listWorkbenchFinanceMonths).toHaveBeenCalledWith({ month: "2026-11" });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiMocks.upsertWorkbenchFinanceMonth).toHaveBeenCalledTimes(1));
    expect(apiMocks.upsertWorkbenchFinanceMonth).toHaveBeenCalledWith({
      month: "2026-11-01",
      cash_open: 50000,
      // The stored null round-trips as null, not as a zero the reader never typed.
      fixed_cost: null,
      variable_cost: 3400,
      note: "rent + payroll",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open with its input when the write fails", async () => {
    apiMocks.upsertWorkbenchFinanceMonth.mockRejectedValue(new Error("month must be the first day"));
    const { onOpenChange } = renderDialog();

    await userEvent.type(screen.getByLabelText("Fixed cost"), "1000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't save this month's cost.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("month must be the first day");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

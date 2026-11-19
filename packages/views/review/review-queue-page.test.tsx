import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewQueueRow } from "@morechat/core/types";
import { renderWithI18n } from "../test/i18n";
import { BossReviewPage } from "./review-queue-page";

/**
 * The review queue page, driven through the real query and mutation hooks.
 *
 * `@morechat/core/api` is the only boundary mocked, so these assertions are about
 * the requests a verdict sends (accept → POST, reject → POST with a reason) and
 * about what the page refuses to do: accept nothing, reject without a reason, or
 * decide a row that is still in flight.
 */

const state = vi.hoisted(() => ({ rows: [] as ReviewQueueRow[] }));

const api = vi.hoisted(() => ({
  listReviewQueue: vi.fn(async () => ({ rows: [] as ReviewQueueRow[], total: 0 })),
  acceptReview: vi.fn(async (_domain: string, _id: string) => undefined),
  rejectReview: vi.fn(async (_domain: string, _id: string, _data: { reason: string }) => undefined),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

const paths = {
  boss: {
    home: () => "/acme/boss",
    goals: () => "/acme/boss/goals",
    tasks: () => "/acme/boss/tasks",
    radar: () => "/acme/boss/radar",
    customers: () => "/acme/boss/customers",
    biz: () => "/acme/boss/biz",
    team: () => "/acme/boss/team",
    review: () => "/acme/boss/review",
  },
};

vi.mock("@morechat/core/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@morechat/core/paths")>();
  return { ...actual, useWorkspacePaths: () => paths };
});

vi.mock("../../navigation", () => ({
  AppLink: ({ children, href }: { children?: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useNavigation: () => ({ pathname: "/acme/boss/review", searchParams: new URLSearchParams(), hash: "" }),
}));

function row(id: string, extra: Partial<ReviewQueueRow> = {}): ReviewQueueRow {
  return {
    domain: "collabs",
    id,
    review_state: "pending",
    actor_type: "agent",
    actor_id: "agent-1",
    agent_name: "Scout",
    actor_name: "Scout",
    summary: `Row ${id}`,
    changed_fields: ["stage", "final_amount"],
    amount: 12000,
    currency: "CNY",
    revision: 2,
    created_at: "2026-11-18T00:00:00Z",
    updated_at: "2026-11-18T00:00:00Z",
    ...extra,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <BossReviewPage />
    </QueryClientProvider>,
  );
}

function rowOf(key: string): HTMLElement {
  const found = document.querySelector(`[data-review-row="${key}"]`);
  if (!found) throw new Error(`no row ${key}`);
  return found as HTMLElement;
}

beforeEach(() => {
  state.rows = [row("1"), row("2"), row("3", { domain: "quotes" })];
  api.listReviewQueue.mockReset();
  api.acceptReview.mockReset();
  api.rejectReview.mockReset();
  api.listReviewQueue.mockImplementation(async (filters?: { domain?: string }) => {
    const rows = filters?.domain
      ? state.rows.filter((candidate) => candidate.domain === filters.domain)
      : state.rows;
    return { rows, total: rows.length };
  });
  api.acceptReview.mockImplementation(async () => undefined);
  api.rejectReview.mockImplementation(async () => undefined);
});

afterEach(() => {
  cleanup();
});

describe("BossReviewPage", () => {
  it("shows what the queue holds, and why a row is here", async () => {
    renderPage();

    await screen.findByText("Row 1");
    const first = rowOf("collabs:1");
    // Which ledger, who wrote it — the two facts a verdict depends on.
    expect(within(first).getByText("Collaborations")).toBeInTheDocument();
    expect(within(first).getByText("Agent")).toBeInTheDocument();
    expect(within(first).getByText("Scout")).toBeInTheDocument();
    expect(within(first).getByText("stage")).toBeInTheDocument();
    expect(within(first).getByText(/12,000|12,000/)).toBeInTheDocument();
  });

  it("accepts the row under the cursor when nothing is ticked", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Row 1");
    await user.click(within(rowOf("collabs:2")).getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(api.acceptReview).toHaveBeenCalledTimes(1));
    expect(api.acceptReview).toHaveBeenCalledWith("collabs", "2");
  });

  it("asks for a reason before it rejects, and sends it", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Row 1");
    await user.click(within(rowOf("collabs:1")).getByRole("button", { name: "Reject" }));

    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Reject" });
    // A rejection without a reason is not reviewable (§26.1).
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText("Reason"), "amount is wrong");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(api.rejectReview).toHaveBeenCalledTimes(1));
    expect(api.rejectReview).toHaveBeenCalledWith("collabs", "1", { reason: "amount is wrong" });
  });

  it("decides every ticked row, not just the cursor's", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Row 1");
    await user.click(within(rowOf("collabs:1")).getByRole("checkbox", { name: "Select this row" }));
    await user.click(within(rowOf("quotes:3")).getByRole("checkbox", { name: "Select this row" }));
    const [acceptAll] = screen.getAllByRole("button", { name: /^Accept/ });
    if (!acceptAll) throw new Error("no bulk accept");
    await user.click(acceptAll);

    await waitFor(() => expect(api.acceptReview).toHaveBeenCalledTimes(2));
    expect(api.acceptReview).toHaveBeenCalledWith("collabs", "1");
    expect(api.acceptReview).toHaveBeenCalledWith("quotes", "3");
  });

  it("works the queue from the keyboard: j/k move, x ticks, a accepts", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Row 1");
    // `j` moves the cursor onto the second row, `x` ticks it, `a` decides it.
    await user.keyboard("jx");
    await user.keyboard("a");

    await waitFor(() => expect(api.acceptReview).toHaveBeenCalledTimes(1));
    expect(api.acceptReview).toHaveBeenCalledWith("collabs", "2");
  });

  it("filters to one ledger and says so when that ledger is empty", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Row 1");
    await user.click(screen.getByRole("combobox", { name: "Ledger" }));
    await user.click(await screen.findByRole("option", { name: "Settlements" }));

    expect(await screen.findByText("No pending rows in this ledger.")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.listReviewQueue).toHaveBeenCalledWith(
        expect.objectContaining({ domain: "settlements" }),
      ),
    );
  });

  it("says nothing is waiting when the whole queue is empty", async () => {
    state.rows = [];
    renderPage();

    expect(await screen.findByText("Nothing is waiting for review")).toBeInTheDocument();
    expect(
      screen.getByText(/Rows written by an agent, or a person's edit of an amount/),
    ).toBeInTheDocument();
  });

  it("shows a load failure with a retry", async () => {
    api.listReviewQueue.mockImplementation(async () => {
      throw new Error("nope");
    });
    renderPage();

    expect(await screen.findByText("Couldn't load the review queue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("keeps the row when the server refuses the verdict", async () => {
    const user = userEvent.setup();
    api.acceptReview.mockImplementation(async () => {
      throw new Error("nope");
    });
    renderPage();

    await screen.findByText("Row 1");
    await user.click(within(rowOf("collabs:1")).getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(api.acceptReview).toHaveBeenCalledTimes(1));
    // Not optimistic: the row is still there, so the reader can try again.
    expect(screen.getByText("Row 1")).toBeInTheDocument();
  });
});

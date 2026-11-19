import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReviewQueueRow } from "@morechat/core/types";
import { renderWithI18n } from "../test/i18n";
import { ReviewQueueTable } from "./queue-table";

/**
 * The queue's three decision columns: who wrote the row, what their write touched,
 * and the money on it.
 *
 * Each of them has an empty state that means something specific, and the assertions
 * keep those states apart: a ledger without money shows a dash (not `0`), a trail
 * with no field detail says so (not a blank cell), and a row the server cannot
 * attribute says "Not recorded" rather than guessing "Member". The last case is the
 * one that matters most — an invented author turns a review into a rubber stamp.
 */

function row(id: string, extra: Partial<ReviewQueueRow> = {}): ReviewQueueRow {
  return {
    domain: "collabs",
    id,
    review_state: "pending",
    actor_type: "agent",
    actor_id: "agent-1",
    agent_name: "Scout",
    actor_name: null,
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

function renderTable(rows: ReviewQueueRow[]) {
  return renderWithI18n(
    <ReviewQueueTable
      rows={rows}
      cursor={-1}
      selection={new Set()}
      pendingKeys={new Set()}
      onSelect={() => undefined}
      onFocusRow={() => undefined}
      onAccept={() => undefined}
      onReject={() => undefined}
    />,
  );
}

function rowOf(key: string): HTMLElement {
  const found = document.querySelector(`[data-review-row="${key}"]`);
  if (!found) throw new Error(`no row ${key}`);
  return found as HTMLElement;
}

afterEach(() => {
  cleanup();
});

describe("ReviewQueueTable", () => {
  it("names the three decision columns", () => {
    renderTable([row("1")]);
    expect(screen.getByRole("columnheader", { name: "Written by" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "What changed" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeInTheDocument();
  });

  it("shows who wrote it, the fields it touched, and the amount with its currency", () => {
    renderTable([row("1")]);

    const first = rowOf("collabs:1");
    expect(within(first).getByText("Agent")).toBeInTheDocument();
    expect(within(first).getByText("Scout")).toBeInTheDocument();
    expect(within(first).getByText("stage")).toBeInTheDocument();
    expect(within(first).getByText("final_amount")).toBeInTheDocument();
    // The row's own number and its own code: no symbol, no conversion.
    expect(within(first).getByText("12,000 CNY")).toBeInTheDocument();
  });

  it("says a person wrote the row when a member did", () => {
    renderTable([
      row("2", {
        domain: "quotes",
        actor_type: "member",
        actor_id: "user-9",
        agent_name: null,
        actor_name: "Ada",
      }),
    ]);

    const memberRow = rowOf("quotes:2");
    expect(within(memberRow).getByText("Member")).toBeInTheDocument();
    expect(within(memberRow).getByText("Ada")).toBeInTheDocument();
  });

  it("says 'not recorded' rather than calling an unattributable row a member", () => {
    renderTable([
      row("3", { actor_type: "", actor_id: null, agent_name: null, actor_name: null }),
    ]);

    const unknown = rowOf("collabs:3");
    expect(within(unknown).getByText("Not recorded")).toBeInTheDocument();
    expect(within(unknown).queryByText("Member")).not.toBeInTheDocument();
    expect(within(unknown).queryByText("Agent")).not.toBeInTheDocument();
  });

  it("shows a dash for a ledger with no money, not zero", () => {
    renderTable([row("4", { domain: "activities", amount: null, currency: "CNY" })]);

    const followUp = rowOf("activities:4");
    expect(within(followUp).getByText("—")).toBeInTheDocument();
    expect(within(followUp).queryByText("0 CNY")).not.toBeInTheDocument();
  });

  it("says so when the server cannot name the fields that moved", () => {
    renderTable([row("5", { changed_fields: [] })]);

    const empty = rowOf("collabs:5");
    expect(within(empty).getByText("No field detail")).toBeInTheDocument();
  });

  it("keeps each row's money in its own currency instead of adding it up", () => {
    renderTable([
      row("6", { domain: "collabs", amount: 12000, currency: "CNY" }),
      row("7", { domain: "quotes", amount: 500, currency: "USD" }),
    ]);

    expect(within(rowOf("collabs:6")).getByText("12,000 CNY")).toBeInTheDocument();
    expect(within(rowOf("quotes:7")).getByText("500 USD")).toBeInTheDocument();
    // A total would be meaningless across currencies, so there is none.
    expect(screen.queryByText(/12,500/)).not.toBeInTheDocument();
  });
});

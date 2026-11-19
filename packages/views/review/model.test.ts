// @vitest-environment node
import { describe, expect, it } from "vitest";
import { REVIEW_REASON_MAX_LENGTH, type ReviewQueueRow } from "@morechat/core/types";
import {
  authorLabel,
  changedFields,
  cursorAfterRemoval,
  domainCopyKey,
  domainCounts,
  isKnownDomain,
  moveCursor,
  rowKey,
  toggleRow,
  trimmedReason,
  validateRejectReason,
  verdictTargets,
  withoutKeys,
  writtenByAgent,
} from "./model";

/**
 * The review queue's pure half.
 *
 * The three behaviours a page cannot get wrong: which rows a keyboard verdict
 * applies to (the selection wins, the cursor is the fallback), what counts as a
 * usable reject reason (§26.1's two refusals), and where the cursor lands after
 * rows leave — a queue that jumps to the top after every verdict is a queue
 * worked twice.
 */

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
    changed_fields: ["stage"],
    amount: 1000,
    currency: "CNY",
    revision: 1,
    created_at: "2026-11-18T00:00:00Z",
    updated_at: "2026-11-18T00:00:00Z",
    ...extra,
  };
}

describe("row identity", () => {
  it("keeps two ledgers' rows apart even when the ids collide", () => {
    expect(rowKey(row("1", { domain: "collabs" }))).toBe("collabs:1");
    expect(rowKey(row("1", { domain: "quotes" }))).not.toBe(rowKey(row("1", { domain: "collabs" })));
  });

  it("counts rows per ledger, and knows the ledgers it has words for", () => {
    const counts = domainCounts([row("1"), row("2"), row("3", { domain: "settlements" })]);
    expect(counts.get("collabs")).toBe(2);
    expect(counts.get("settlements")).toBe(1);
    expect(counts.get("quotes")).toBeUndefined();
    expect(isKnownDomain("activities")).toBe(true);
    expect(isKnownDomain("invoices")).toBe(false);
    expect(domainCopyKey("quotes")).toBe("domain_quotes");
    expect(domainCopyKey("invoices")).toBeNull();
  });
});

describe("the cursor", () => {
  it("clamps at both ends instead of wrapping", () => {
    expect(moveCursor(0, -1, 3)).toBe(0);
    expect(moveCursor(0, 1, 3)).toBe(1);
    expect(moveCursor(2, 1, 3)).toBe(2);
    expect(moveCursor(-1, 1, 0)).toBe(-1);
  });

  it("lands on a row that still exists after a verdict", () => {
    // Three rows, cursor on the second, one row decided: the cursor stays on the
    // row that took its place, not on the one that left.
    expect(cursorAfterRemoval(1, 1, 2)).toBe(0);
    expect(cursorAfterRemoval(2, 1, 2)).toBe(1);
    expect(cursorAfterRemoval(0, 1, 0)).toBe(-1);
  });
});

describe("what a verdict applies to", () => {
  const rows = [row("1"), row("2"), row("3")];

  it("uses the cursor when nothing is ticked", () => {
    expect(verdictTargets(rows, 1, new Set()).map((r) => r.id)).toEqual(["2"]);
  });

  it("uses the selection when something is ticked", () => {
    expect(verdictTargets(rows, 0, new Set(["collabs:3", "collabs:1"])).map((r) => r.id)).toEqual([
      "1",
      "3",
    ]);
  });

  it("answers nothing for an empty queue", () => {
    expect(verdictTargets([], 0, new Set())).toEqual([]);
  });

  it("toggles a row without touching the others", () => {
    const first = toggleRow(new Set(), "collabs:1");
    expect([...first]).toEqual(["collabs:1"]);
    expect([...toggleRow(first, "collabs:1")]).toEqual([]);
    expect([...toggleRow(first, "collabs:2")]).toEqual(["collabs:1", "collabs:2"]);
  });

  it("drops the decided rows from the list it is showing", () => {
    expect(withoutKeys(rows, new Set(["collabs:2"])).map((r) => r.id)).toEqual(["1", "3"]);
    expect(withoutKeys(rows, new Set())).toHaveLength(3);
  });
});

describe("the reject reason", () => {
  it("refuses an empty or blank reason", () => {
    expect(validateRejectReason("")).toBe("empty");
    expect(validateRejectReason("   ")).toBe("empty");
  });

  it("accepts a reason and refuses one past the cap", () => {
    expect(validateRejectReason("金额和合同不符")).toBeNull();
    expect(validateRejectReason("x".repeat(REVIEW_REASON_MAX_LENGTH))).toBeNull();
    expect(validateRejectReason("x".repeat(REVIEW_REASON_MAX_LENGTH + 1))).toBe("too_long");
  });

  it("trims before it is sent, because trailing spaces are not a reason", () => {
    expect(trimmedReason("  金额错了  ")).toBe("金额错了");
  });
});

describe("how a row reads", () => {
  it("tells an agent's write from a person's", () => {
    expect(writtenByAgent(row("1"))).toBe(true);
    expect(writtenByAgent(row("2", { actor_type: "member", agent_name: null }))).toBe(false);
  });

  it("names the agent, and falls back to the id rather than inventing one", () => {
    expect(authorLabel(row("1"))).toEqual({ kind: "agent", name: "Scout" });
    expect(authorLabel(row("2", { agent_name: null, actor_name: null }))).toEqual({
      kind: "agent",
      name: null,
    });
    expect(authorLabel(row("3", { actor_type: "member", actor_name: "Ada" }))).toEqual({
      kind: "member",
      name: "Ada",
    });
  });

  it("trims the changed-field list and keeps unknown names as sent", () => {
    expect(changedFields(row("1", { changed_fields: [" stage ", "stage", "", "custom_field"] }))).toEqual([
      "stage",
      "custom_field",
    ]);
  });
});

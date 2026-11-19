// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ImportPreviewResponse } from "./contract";
import { canCommit, errorRows, hasSource, importCounts, PREVIEW_ROW_LIMIT, previewRows, summarizePreview } from "./model";

/**
 * The import dialog's two rules, without a renderer.
 *
 * Both are about not asking the server a question the preview already answered:
 * a batch with one refused row is uncommittable (the real import is
 * all-or-nothing), and the confirm label counts rows that will be written rather
 * than lines that were read.
 */

function preview(overrides: Partial<ImportPreviewResponse> = {}): ImportPreviewResponse {
  return {
    kind: "quotes",
    parsed: 42,
    accepted: 40,
    committed: 0,
    rows: [],
    errors: [],
    ...overrides,
  };
}

describe("importCounts", () => {
  it("reports the four numbers the panel prints", () => {
    expect(importCounts(preview())).toEqual({
      parsed: 42,
      accepted: 40,
      skipped: 0,
      errors: 0,
    });
    expect(
      importCounts(
        preview({
          parsed: 10,
          accepted: 8,
          rows: [
            { line: 2, action: "create", preview: {} },
            { line: 5, action: "skip", preview: {} },
          ],
          errors: [
            { line: 3, column: "creator_handle", reason: "creator_not_found" },
            { line: 7, column: "fee_amount", reason: "invalid_value" },
          ],
        }),
      ),
    ).toEqual({ parsed: 10, accepted: 8, skipped: 1, errors: 2 });
  });
});

describe("canCommit", () => {
  it("refuses until a preview exists", () => {
    expect(canCommit(null)).toBe(false);
  });

  it("refuses a batch with one error row, however many rows are fine", () => {
    expect(
      canCommit(
        preview({ errors: [{ line: 7, column: "creator_handle", reason: "creator_not_found" }] }),
      ),
    ).toBe(false);
  });

  it("refuses an empty batch", () => {
    expect(canCommit(preview({ parsed: 0, accepted: 0 }))).toBe(false);
  });

  it("allows a clean preview", () => {
    expect(canCommit(preview())).toBe(true);
  });
});

describe("errorRows", () => {
  it("is empty without a preview", () => {
    expect(errorRows(null)).toEqual([]);
  });

  it("orders the rows by the line the reader sees in their spreadsheet", () => {
    const rows = errorRows(
      preview({
        errors: [
          { line: 9, column: "fee_amount", reason: "invalid_value" },
          { line: 2, column: "creator_handle", reason: "creator_not_found" },
        ],
      }),
    );
    expect(rows.map((row) => row.line)).toEqual([2, 9]);
  });
});

describe("hasSource", () => {
  it("treats whitespace as no source at all", () => {
    expect(hasSource("")).toBe(false);
    expect(hasSource("  \n ")).toBe(false);
    expect(hasSource("creator_handle,fee_amount\nlin,3000")).toBe(true);
  });
});

describe("the parsed rows", () => {
  it("draws the server's normalized values, not the file's cells", () => {
    expect(summarizePreview({ creator_id: "creator-1", fee_amount: 3000, currency: "CNY" })).toBe(
      "creator_id=creator-1 · fee_amount=3000 · currency=CNY",
    );
    // Objects and nulls are not one-cell values.
    expect(summarizePreview({ creator_id: "creator-1", items: [], note: null })).toBe(
      "creator_id=creator-1",
    );
  });

  it("cuts a long file at the preview limit and says so", () => {
    const rows = Array.from({ length: PREVIEW_ROW_LIMIT + 5 }, (_, index) => ({
      line: index + 2,
      action: "create" as const,
      preview: {},
    }));
    const view = previewRows(preview({ rows }));
    expect(view.rows).toHaveLength(PREVIEW_ROW_LIMIT);
    expect(view.truncated).toBe(true);

    const short = previewRows(preview({ rows: rows.slice(0, 3) }));
    expect(short.rows).toHaveLength(3);
    expect(short.truncated).toBe(false);

    expect(previewRows(null)).toEqual({ rows: [], truncated: false });
  });
});

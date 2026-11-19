import type { ImportError, ImportPreviewResponse, ImportRow } from "./contract";

/**
 * The import dialog's arithmetic, kept out of the component so the rules that
 * actually matter can be read and tested without a renderer.
 *
 *   - **A preview with one error cannot be committed.** The server's real import
 *     is all-or-nothing (`dry_run=0` rolls the whole batch back on the first bad
 *     row), so enabling the button and letting the request fail would be asking
 *     the reader to discover a refusal the preview already knew about.
 *   - **The three counts have to add up.** `parsed` counts data rows read,
 *     `accepted` the ones that would be written, and a duplicate is `skip` — not an
 *     error (`types/workbench.ts`). Without its own number a file with two
 *     duplicates reads "10 read, 8 accepted, 0 errors" and the two rows vanish
 *     unexplained, so the panel prints `skipped` too.
 */

/** The numbers the preview panel prints, from one response. */
export interface ImportCounts {
  parsed: number;
  /** Rows that would be written. */
  accepted: number;
  /** Duplicates already in the ledger — not errors, and not written either. */
  skipped: number;
  errors: number;
}

export function importCounts(preview: ImportPreviewResponse): ImportCounts {
  return {
    parsed: preview.parsed,
    accepted: preview.accepted,
    skipped: preview.rows.filter((row) => row.action === "skip").length,
    errors: preview.errors.length,
  };
}

/**
 * Whether the batch may be committed: something to write, and nothing refused.
 *
 * A preview with `accepted: 0` and no errors is a file whose every row already
 * exists — there is nothing to import either, and a button that sends an empty
 * batch would just come back with the same zeros.
 */
export function canCommit(preview: ImportPreviewResponse | null): boolean {
  if (preview === null) return false;
  return preview.errors.length === 0 && preview.accepted > 0;
}

/**
 * The error rows as the table draws them: line, column, reason.
 *
 * The server orders them by line already; sorting again keeps a batch whose
 * response was assembled out of order readable, and the line is the number the
 * reader sees in their spreadsheet.
 */
export function errorRows(preview: ImportPreviewResponse | null): ImportError[] {
  if (preview === null) return [];
  return [...preview.errors].sort((a, b) => a.line - b.line);
}

/**
 * Whether the two halves of the dialog hold anything to send.
 *
 * Whitespace-only pastes are empty: a textarea holding a newline is not a file
 * with no rows, and sending it would ask the server to say so.
 */
export function hasSource(csv: string): boolean {
  return csv.trim() !== "";
}

/**
 * How many parsed rows the preview lists. A 2000-row file is inside the
 * endpoint's limit, and drawing 2000 table rows inside a dialog would cost more
 * than it tells the reader; the counts above the table stay exact.
 */
export const PREVIEW_ROW_LIMIT = 20;

/**
 * The parsed rows to draw, and whether the list was cut.
 *
 * A row is the server's **normalized** version of a line — resolved `creator_id`,
 * numbers as numbers, upper-case currency — so it is shown as it arrived
 * (`WORKBENCH-API` §23.1: the preview exists so the reader confirms what will be
 * written, not what they typed).
 */
export function previewRows(preview: ImportPreviewResponse | null): {
  rows: ImportRow[];
  truncated: boolean;
} {
  if (preview === null) return { rows: [], truncated: false };
  return {
    rows: preview.rows.slice(0, PREVIEW_ROW_LIMIT),
    truncated: preview.rows.length > PREVIEW_ROW_LIMIT,
  };
}

/** Values that read as one cell: scalars only, keys in the server's own order. */
export function summarizePreview(preview: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(preview)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    parts.push(`${key}=${String(value)}`);
  }
  return parts.join(" · ");
}

/**
 * A picked file as text. One helper rather than an inline `await file.text()` so
 * the single place that touches the File API is named — and so a test can hand it
 * a stub.
 */
export async function readCsvFile(file: File): Promise<string> {
  return file.text();
}

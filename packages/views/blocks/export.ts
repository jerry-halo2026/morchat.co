/**
 * Turning a ledger into a file: the other half of `import.ts`.
 *
 * The workbench fills its ledgers from spreadsheets (`import.ts`) and has to be
 * able to hand the same shape back, so the export format is the import format —
 * a header row and cells, comma-separated, read by Excel. This module is the
 * whole of that translation: `toCsv` is a pure function of rows, columns and
 * options (tested in `export.test.ts` against strings alone), and `exportCsv`
 * is the one function that touches the DOM, because a download is a document
 * gesture. Nothing here reads a store, a query or a translation.
 *
 * Four rules show in the file itself:
 *
 * - **A column is a column.** `ExportColumn` is `CollectionColumn` with `cell`
 *   replaced by `value`: the ledger's own column definition (key + header) is
 *   the export's, and only the cell's rendering changes, because a file has no
 *   JSX. A ledger that exports therefore describes its columns once.
 * - **A null is an empty cell.** `null` (and `undefined`) write nothing at all,
 *   never the word "null": an empty cell is how a spreadsheet says "not
 *   recorded", and `import.ts` reads it back as absent.
 * - **Numbers are numbers.** A figure is written as `String(value)` — no
 *   thousands separators, no currency symbol, no locale decimal comma. A
 *   formatted display value would come back on reimport as a string the
 *   importer cannot read (`1,234.5` is two cells).
 * - **CRLF and a BOM.** Excel is the reader: it wants `\r\n` between records,
 *   and without a UTF-8 BOM it reads Chinese headers as mojibake.
 */

/**
 * One column of an exported file.
 *
 * `key` is the ledger column's key, `header` its (already translated) label,
 * and `value` the row's cell as text — the one thing `CollectionColumn.cell`
 * cannot supply, because a cell there is a React node.
 *
 * `value` also admits a boolean: a ledger column such as 风险 or 已转正 is a
 * flag, and a flag is written `true`/`false` rather than asked to become a
 * translated sentence first — copy belongs on screen, a file keeps the value.
 */
export interface ExportColumn<T> {
  key: string;
  header: string;
  value: (row: T) => string | number | boolean | null;
}

export interface ExportOptions {
  /** Field separator. A comma is the default; a tab is what Excel pastes. */
  delimiter?: "," | "\t";
  /** UTF-8 byte-order mark, `true` by default: without it Excel reads a
   *  Chinese header as mojibake rather than as the text it is. */
  bom?: boolean;
  /** The caller's file name; `.csv` is appended when it is missing. */
  filename: string;
}

/** Record separator. Excel writes CRLF, and reads a lone LF as one record too. */
const EOL = "\r\n";

const CSV_SUFFIX = ".csv";

/** No file name at all still has to produce a file. */
const FALLBACK_FILENAME = "export";

/**
 * A cell's text, from whatever the column's `value` returned.
 *
 * `null` and `undefined` are the empty cell; a number is written as-is (see the
 * module note on separators); a boolean is `true`/`false` rather than the
 * `1`/`0` some spreadsheets store and nobody can read back.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    // String(), not toLocaleString(): a locale format would insert the very
    // separators this file must not contain.
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * Whether a cell has to be wrapped in quotes.
 *
 * The delimiter, a quote, a line break or a leading/trailing space all change
 * what a reader sees if the cell is written bare — a trailing space is
 * invisible in the file and meaningful in the value (`import.ts` trims cells,
 * so a deliberate space has to survive the round trip as a quoted cell).
 */
function needsQuotes(text: string, delimiter: string): boolean {
  return (
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r") ||
    text !== text.trim()
  );
}

/** A cell as it appears in the file: quoted when it has to be, `"` doubled. */
function escapeCell(value: unknown, delimiter: string): string {
  const text = cellText(value);
  if (!needsQuotes(text, delimiter)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Rows and columns as CSV text.
 *
 * The header row is always written, even with no rows: the columns are what
 * the file is about, and a header-only file still says which ledger it came
 * from. Records are joined with CRLF and the text ends after the last record —
 * a trailing blank line reads as one more empty record in some tools.
 *
 * Pure: no DOM, no `Blob`, no clock. That is what lets the escaping rules be
 * tested in a node environment (`export.test.ts`).
 */
export function toCsv<T>(
  rows: readonly T[],
  columns: readonly ExportColumn<T>[],
  options?: ExportOptions,
): string {
  const delimiter = options?.delimiter ?? ",";
  const lines = [columns.map((column) => escapeCell(column.header, delimiter)).join(delimiter)];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row), delimiter)).join(delimiter));
  }
  const body = lines.join(EOL);
  // The BOM is not part of the text a reader compares: it is a byte-order
  // marker for the program that opens the file.
  return options?.bom === false ? body : `\uFEFF${body}`;
}

/**
 * The file name to download, with exactly one `.csv` suffix.
 *
 * The caller names the file (`candidates-2026-03-01`, or a translated ledger
 * name); this only guarantees the suffix, so a caller that already wrote
 * `.csv` does not get `.csv.csv`.
 */
export function exportFilename(filename: string): string {
  const trimmed = filename.trim();
  const base = trimmed === "" ? FALLBACK_FILENAME : trimmed;
  return base.toLowerCase().endsWith(CSV_SUFFIX) ? base : `${base}${CSV_SUFFIX}`;
}

/**
 * Writes the CSV as a download.
 *
 * The blob URL lives exactly as long as the click that consumes it: the anchor
 * is in the document when it is clicked (Firefox ignores a detached one) and
 * the object URL is revoked in the same task, because a revoked URL is a leak
 * held by the renderer until the page navigates away — and an Electron tab
 * stays open for days.
 */
export function exportCsv<T>(
  rows: readonly T[],
  columns: readonly ExportColumn<T>[],
  options: ExportOptions,
): void {
  const csv = toCsv(rows, columns, options);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportFilename(options.filename);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

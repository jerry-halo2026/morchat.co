"use client";

import { toast } from "sonner";
import { Button } from "@morechat/ui/components/ui/button";
import { Download } from "@morechat/ui/icons";
import { useT } from "../i18n";
import { exportCsv, type ExportColumn } from "./export";

export interface ExportButtonProps<T> {
  /** The rows on screen, as they are drawn: an export is what the ledger shows. */
  rows: readonly T[];
  /** The ledger's own columns, in the ledger's own order. */
  columns: readonly ExportColumn<T>[];
  /** File name without the extension; `export.ts` adds `.csv`. */
  filename: string;
  /** The button's words. Also its accessible name — the icon carries none. */
  label: string;
}

/**
 * The export entry of a ledger.
 *
 * One click and a file: unlike import there is nothing to confirm, because the
 * rows in hand are the rows the user is looking at — a sheet preview would only
 * redraw the ledger. The three states worth stating:
 *
 * - **No rows, no file.** The button is disabled rather than downloading an
 *   empty sheet, and its `title` says why — a disabled control with no reason
 *   reads as broken.
 * - **The label is the accessible name.** The icon is decorative
 *   (`aria-hidden` from `createIcon`), so `aria-label` repeats the visible words
 *   rather than leaving the button as an unlabelled glyph in a toolbar.
 * - **The count is reported.** A download leaves no trace on the page, so the
 *   toast carries how many rows went into the file; it is the only receipt the
 *   user gets.
 */
export function ExportButton<T>({ rows, columns, filename, label }: ExportButtonProps<T>) {
  const { t } = useT("blocks");
  const empty = rows.length === 0;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={empty}
      aria-label={label}
      title={empty ? t(($) => $.export.empty) : undefined}
      onClick={() => {
        exportCsv(rows, columns, { filename });
        toast.success(t(($) => $.export.done, { count: rows.length }));
      }}
    >
      <Download />
      {label}
    </Button>
  );
}

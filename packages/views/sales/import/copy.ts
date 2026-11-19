"use client";

import { useT } from "../../i18n";

/**
 * The import dialog's copy surface, and the one place a server **reason code**
 * becomes a sentence.
 *
 * The list is `WORKBENCH-API` §23.5 verbatim — the fifteen codes the endpoint
 * emits, each with the column it names. It is a lookup with a deliberate hole: a
 * code this client does not know is printed **as itself**, in its own monospace
 * cell, because the schema keeps `reason` a plain string to tolerate new codes
 * (`schemas.ts`). Replacing an unknown code with "invalid value" would tell the
 * reader something the server did not say.
 */
const REASONS = [
  { token: "missing_column", key: "reason_missing_column" },
  { token: "duplicate_column", key: "reason_duplicate_column" },
  { token: "column_count_mismatch", key: "reason_column_count_mismatch" },
  { token: "missing_value", key: "reason_missing_value" },
  { token: "creator_not_found", key: "reason_creator_not_found" },
  { token: "ambiguous_handle", key: "reason_ambiguous_handle" },
  { token: "invalid_uuid", key: "reason_invalid_uuid" },
  { token: "brief_not_found", key: "reason_brief_not_found" },
  { token: "invalid_amount", key: "reason_invalid_amount" },
  { token: "invalid_rate", key: "reason_invalid_rate" },
  { token: "invalid_date", key: "reason_invalid_date" },
  { token: "invalid_timestamp", key: "reason_invalid_timestamp" },
  { token: "invalid_enum", key: "reason_invalid_enum" },
  { token: "invalid_currency", key: "reason_invalid_currency" },
  // A cell over the column's TEXT cap (`workbenchTextLimits`): a row error, not a
  // file error, so it is fixed in the spreadsheet and re-sent like any other.
  { token: "text_too_long", key: "reason_text_too_long" },
] as const;

export function useImportCopy() {
  const { t } = useT("sales");

  const reason = (token: string): string => {
    const found = REASONS.find((entry) => entry.token === token);
    return found ? t(($) => $.import[found.key]) : token;
  };

  return { t, reason };
}

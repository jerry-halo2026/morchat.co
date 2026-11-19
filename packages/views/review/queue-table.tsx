"use client";

import { useState } from "react";
import type { ReviewQueueRow } from "@morechat/core/types";
import { Button } from "@morechat/ui/components/ui/button";
import { Checkbox } from "@morechat/ui/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morechat/ui/components/ui/table";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useTimeAgo } from "../i18n";
import { useReviewCopy } from "./copy";
import { authorLabel, changedFields, domainCopyKey, rowKey, writtenByAgent } from "./model";

/**
 * One row waiting for a verdict: which ledger, what it is, who wrote it, what
 * they touched, the money, and when.
 *
 * The author cell is the page's reason to exist, so it says the two things a
 * reviewer needs before deciding: **agent or person**, and the agent's name. A
 * row whose agent name the server could not resolve shows the id it does have
 * rather than the word "Agent" — "an agent" and "agent 4f2a…" are different
 * amounts of information, and hiding the difference is how a review queue turns
 * into a rubber stamp.
 *
 * The row is selectable three ways — click the checkbox, press `x` with the
 * cursor on it, or `j`/`k` to move the cursor — because a reviewer working a
 * queue of fifty does not want to reach for the mouse.
 */
export function ReviewQueueTableRow({
  row,
  cursor,
  selected,
  pending,
  onSelect,
  onFocus,
  onAccept,
  onReject,
}: {
  row: ReviewQueueRow;
  /** This row is under the keyboard cursor. */
  cursor: boolean;
  selected: boolean;
  /** A verdict on this row is in flight. */
  pending: boolean;
  onSelect: (checked: boolean) => void;
  onFocus: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const copy = useReviewCopy();
  const timeAgo = useTimeAgo();
  const locales = useLocale();
  const [expanded, setExpanded] = useState(false);

  const author = authorLabel(row);
  const fields = changedFields(row);
  // Amount and currency as stored: the row's own number, its own code, no
  // conversion and no cross-row total. A ledger without money answers `null`,
  // which is a dash — "no amount on this row", not "zero".
  const amount =
    row.amount === null
      ? copy("row_no_amount")
      : `${new Intl.NumberFormat(locales, { maximumFractionDigits: 2 }).format(row.amount)} ${
          row.currency || "CNY"
        }`;

  return (
    <TableRow
      data-review-row={rowKey(row)}
      aria-selected={selected}
      onMouseDown={onFocus}
      className={cn(
        "align-top",
        selected && "bg-surface-selected",
        cursor && "outline-2 -outline-offset-2 outline-ring/60",
      )}
    >
      <TableCell className="w-8">
        <Checkbox
          checked={selected}
          disabled={pending}
          aria-label={copy("row_select")}
          onCheckedChange={(checked) => onSelect(checked === true)}
        />
      </TableCell>
      <TableCell className="min-w-40 max-w-72">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex min-w-0 flex-col gap-0.5 text-left outline-none hover:underline focus-visible:underline"
          title={row.summary}
        >
          <span className="truncate text-body">{row.summary || row.id}</span>
          <span className="text-caption text-muted-foreground">
            {domainCopyKey(row.domain) ? copy(domainCopyKey(row.domain)!) : row.domain}
          </span>
        </button>
      </TableCell>
      <TableCell className="min-w-28">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className={cn(
              "w-fit rounded-xs px-1 text-micro leading-4",
              writtenByAgent(row)
                ? "bg-brand/10 text-brand"
                : "bg-muted text-muted-foreground",
            )}
          >
            {author.kind === "agent"
              ? copy("row_agent")
              : author.kind === "member"
                ? copy("row_member")
                : copy("row_unknown_author")}
          </span>
          <span className="truncate text-caption" title={author.name ?? row.actor_id ?? ""}>
            {author.name ?? row.actor_id ?? "—"}
          </span>
        </span>
      </TableCell>
      <TableCell className="min-w-32 max-w-64">
        {fields.length === 0 ? (
          <span className="text-caption text-muted-foreground">{copy("row_no_fields")}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {(expanded ? fields : fields.slice(0, 3)).map((field) => (
              <span
                key={field}
                className="max-w-full truncate rounded-xs bg-muted px-1 text-micro leading-4"
                title={field}
              >
                {field}
              </span>
            ))}
            {!expanded && fields.length > 3 ? (
              <span className="text-micro text-muted-foreground">+{fields.length - 3}</span>
            ) : null}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{amount}</TableCell>
      <TableCell className="whitespace-nowrap text-caption text-muted-foreground">
        <span title={row.updated_at}>{timeAgo(row.updated_at)}</span>
      </TableCell>
      <TableCell>
        <span className="flex items-center justify-end gap-1">
          <Button type="button" size="xs" variant="outline" disabled={pending} onClick={onAccept}>
            {copy("accept")}
          </Button>
          <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={onReject}>
            {copy("reject")}
          </Button>
        </span>
      </TableCell>
    </TableRow>
  );
}

/** The table's head row, written once so the page and its tests agree on order. */
export function ReviewQueueTableHead() {
  const copy = useReviewCopy();
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-8" />
        <TableHead>{copy("column_row")}</TableHead>
        <TableHead>{copy("column_author")}</TableHead>
        <TableHead>{copy("column_changed")}</TableHead>
        <TableHead className="text-right">{copy("column_amount")}</TableHead>
        <TableHead>{copy("column_updated")}</TableHead>
        <TableHead className="text-right">{copy("column_actions")}</TableHead>
      </TableRow>
    </TableHeader>
  );
}

/** The scrolling body: one table, no pagination — the server caps the read. */
export function ReviewQueueTable({
  rows,
  cursor,
  selection,
  pendingKeys,
  onSelect,
  onFocusRow,
  onAccept,
  onReject,
}: {
  rows: readonly ReviewQueueRow[];
  cursor: number;
  selection: ReadonlySet<string>;
  pendingKeys: ReadonlySet<string>;
  onSelect: (row: ReviewQueueRow, checked: boolean) => void;
  onFocusRow: (index: number) => void;
  onAccept: (row: ReviewQueueRow) => void;
  onReject: (row: ReviewQueueRow) => void;
}) {
  return (
    <Table>
      <ReviewQueueTableHead />
      <TableBody>
        {rows.map((row, index) => (
          <ReviewQueueTableRow
            key={rowKey(row)}
            row={row}
            cursor={index === cursor}
            selected={selection.has(rowKey(row))}
            pending={pendingKeys.has(rowKey(row))}
            onSelect={(checked) => onSelect(row, checked)}
            onFocus={() => onFocusRow(index)}
            onAccept={() => onAccept(row)}
            onReject={() => onReject(row)}
          />
        ))}
      </TableBody>
    </Table>
  );
}

"use client";

import { AppLink } from "../../navigation";

/**
 * The three questions this week asks, above the IP cards: what goes out, what
 * still has to be shot, and how much has piled up in the idea pool.
 *
 * One cell is a row count, not a date (`backlog`), which is what makes it the
 * odd one out — and why every cell carries its own label instead of the bar
 * carrying a legend. Each cell is a link to the page that answers it.
 *
 * `divide-*` is the same treatment the workbench KPI grid uses: rows on a phone,
 * columns once there is room, one hairline between neighbours either way.
 */
export interface WeekCell {
  key: "publishing" | "shooting" | "backlog";
  label: string;
  value: number;
  href: string;
}

export function StudioWeekBar({ label, cells }: { label: string; cells: readonly WeekCell[] }) {
  return (
    <section
      aria-label={label}
      className="grid grid-cols-1 divide-y rounded-lg border bg-card md:grid-cols-3 md:divide-x md:divide-y-0"
    >
      {cells.map((cell) => (
        <AppLink
          key={cell.key}
          href={cell.href}
          newTabTitle={cell.label}
          data-week-cell={cell.key}
          className="flex min-w-0 flex-col gap-1 rounded-lg p-4 outline-none transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="truncate text-caption text-muted-foreground">{cell.label}</span>
          <span className="text-display-sm font-semibold leading-none tabular-nums">
            {cell.value}
          </span>
        </AppLink>
      ))}
    </section>
  );
}

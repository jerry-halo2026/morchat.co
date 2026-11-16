"use client";

import type { ReactNode } from "react";
import { CircleDashed } from "@morechat/ui/icons";
import { AppLink } from "../navigation";
import { buttonVariants } from "@morechat/ui/components/ui/button";
import { cn } from "@morechat/ui/lib/utils";

interface GapCardProps {
  /** The number that cannot be stated yet. */
  title: string;
  /** What has to be entered for it to light up — the card's whole message. */
  needs: ReactNode;
  /** Names the entry point, e.g. "Go to the client list". */
  actionLabel: string;
  /**
   * The entry point. Exactly one of the two is given: `onAction` switches the
   * page to the ledger tab that owns the missing rows, `href` leaves for the
   * surface that does when the rows are not the ledgers' (delivery issues).
   * There is no third case — a gap card without a way in would be a dead end,
   * which is the one thing `docs/METRICS.md` rule 3 says this state must not be.
   */
  onAction?: () => void;
  href?: string;
  className?: string;
}

/**
 * The `insufficient_data` cell: says which number is missing, what to enter, and
 * where to enter it. It sits inside the KPI grid in place of a `KpiCard`, so it
 * keeps the tile's padding and none of its own border.
 */
export function GapCard({
  title,
  needs,
  actionLabel,
  onAction,
  href,
  className,
}: GapCardProps) {
  return (
    <div className={cn("flex flex-col gap-2 p-5", className)}>
      <div className="flex min-w-0 items-center gap-1.5 text-micro font-medium uppercase tracking-wider text-muted-foreground">
        <CircleDashed aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{title}</span>
      </div>
      <p className="text-caption text-muted-foreground">{needs}</p>
      {href ? (
        <AppLink href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1 self-start")}>
          {actionLabel}
        </AppLink>
      ) : (
        <button
          type="button"
          onClick={onAction}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1 self-start")}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

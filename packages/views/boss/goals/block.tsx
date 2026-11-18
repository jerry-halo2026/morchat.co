"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { useT } from "../../i18n";
import { ObjectSection } from "../../layout/object-page";

interface GoalBlockProps {
  title: ReactNode;
  /** A count beside the heading, only once there is something to count. */
  count?: ReactNode;
  action?: ReactNode;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  children: ReactNode;
}

/**
 * One block of the goal page: its heading, and its own three outcomes.
 *
 * The isolation lives here, the same way it does on the overview: the list and
 * the detail each read their own queries, so a failed read draws a bar inside
 * this block and the other keeps its rows. The retry asks this block's queries
 * again rather than reloading the page.
 *
 * The error and retry words are the overview's (`blocks.boss_home.error.*`): they
 * are the same statement about the same endpoint family, and a second identical
 * pair in this bundle would only be a second thing to translate.
 */
export function GoalBlock({
  title,
  count,
  action,
  isLoading,
  isError,
  onRetry,
  children,
}: GoalBlockProps) {
  const { t } = useT("blocks");
  return (
    <ObjectSection title={title} count={count} action={action}>
      {isError ? (
        <div
          role="status"
          className="flex min-h-13 items-center gap-2 rounded-lg border border-dashed border-destructive/40 py-2.5 pr-2.5 pl-3.5 text-destructive"
        >
          <AlertCircle aria-hidden="true" className="size-4.5 shrink-0" />
          <p className="min-w-0 flex-1 text-label">{t(($) => $.boss_home.error.block)}</p>
          {onRetry ? (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              {t(($) => $.boss_home.error.retry)}
            </Button>
          ) : null}
        </div>
      ) : isLoading ? (
        <GoalBlockSkeleton />
      ) : (
        children
      )}
    </ObjectSection>
  );
}

/** Three quiet rows, the shape of the list this block usually draws. */
function GoalBlockSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="space-y-2.5 rounded-lg border border-dashed border-input px-3.5 py-3"
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-1.5">
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="h-2 w-4/5" />
        </div>
      ))}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { useT } from "../../i18n";
import { ObjectSection } from "../../layout/object-page";

/**
 * One objective's tasks: its heading, and its own three outcomes.
 *
 * Each goal is its own block because each is its own detail read. A goal whose
 * detail failed draws a bar inside its own block and the other objectives keep
 * their rows — the page's job is to compose those blocks, not to own their state.
 *
 * The error and retry words are the overview's (`blocks.boss_home.error.*`).
 */
export function TaskBlock({
  title,
  count,
  isLoading,
  isError,
  onRetry,
  children,
}: {
  title: ReactNode;
  count?: ReactNode;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  const { t } = useT("blocks");
  return (
    <ObjectSection title={title} count={count}>
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
      ) : (
        children
      )}
    </ObjectSection>
  );
}

"use client";

import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { AlertCircle } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { ObjectSection } from "../../layout/object-page";

export interface AdsBlockProps {
  title: string;
  /** A count or a window label beside the heading, once there is one. */
  count?: ReactNode;
  action?: ReactNode;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  children: ReactNode;
}

/**
 * One block of 投放看板: its heading and its own three outcomes.
 *
 * The page is six reads of six endpoints, and the isolation lives here: a failed
 * read draws a bar inside its own block and nothing else, so a missing account
 * snapshot does not take the window's money off the screen. Loading and error are
 * this file's; empty is the block's own, because only it knows what "none" means
 * (no plan synced, no violation, no fact in the window).
 */
export function AdsBlock({
  title,
  count,
  action,
  isLoading,
  isError,
  onRetry,
  children,
}: AdsBlockProps) {
  const { t } = useT("ads");
  return (
    <ObjectSection title={title} count={count} action={action}>
      {isError ? (
        <div
          role="status"
          className="flex min-h-13 items-center gap-2 rounded-lg border border-dashed border-destructive/40 py-2.5 pr-2.5 pl-3.5 text-destructive"
        >
          <AlertCircle aria-hidden="true" className="size-4.5 shrink-0" />
          <p className="min-w-0 flex-1 text-label">{t(($) => $.block_error)}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {t(($) => $.retry)}
          </Button>
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

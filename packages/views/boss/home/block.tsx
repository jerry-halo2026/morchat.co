"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { useT } from "../../i18n";
import { ObjectSection } from "../../layout/object-page";

interface BossBlockProps {
  title: string;
  /** A count beside the heading, only once there is something to count. */
  count?: ReactNode;
  action?: ReactNode;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  children: ReactNode;
}

/**
 * One block of the overview: its heading, and its own three outcomes.
 *
 * The isolation the page is built on lives here. Each block reads its own
 * queries, so a failed read draws a bar inside this block and nothing else: the
 * other three keep their headings and their numbers, and the page never trades
 * a working strip for one dead endpoint. The error copy says the block did not
 * load rather than guessing why — the reason belongs to the network, not to a
 * summary — and the retry asks the block's own queries again.
 *
 * The five states the blocks share (empty, loading, error, partially missing,
 * truncated text) split between this shell and the block that knows its data:
 * this file owns loading and error, and empty/partial/truncated are drawn by the
 * block, because only it knows which half of itself is missing.
 */
export function BossBlock({
  title,
  count,
  action,
  isLoading,
  isError,
  onRetry,
  children,
}: BossBlockProps) {
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
        <BossBlockSkeleton />
      ) : (
        children
      )}
    </ObjectSection>
  );
}

/** Three quiet rows: the shape of every block on this page, so the page does
 *  not reflow from a spinner into a list. */
function BossBlockSkeleton() {
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

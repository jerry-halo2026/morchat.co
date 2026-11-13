"use client";

/**
 * The wait screen: this team's face, breathing.
 *
 * A spinner says "something is happening". The workspace's own character says
 * "this workspace is happening", which is the same information plus an identity -
 * and it costs nothing extra, because the character engine is already on the page.
 *
 * Falls back to a neutral face when there is no workspace yet (first paint, before
 * the workspace list resolves), so the screen never flashes a letter or a gap.
 */

import { AoraCharacter } from "@morechat/ui/components/common/aora-character";
import { cn } from "@morechat/ui/lib/utils";

/** Stable neutral identity: the same placeholder face on every cold start. */
const NEUTRAL_ID = "workspace-loading";

export interface WorkspaceFaceLoaderProps {
  /** The workspace being opened. Absent means "not resolved yet". */
  workspaceId?: string | null;
  /** A chosen spec, when the workspace has one. */
  spec?: string | null;
  /** Accessible label; the screen reader announces what is loading. */
  label?: string;
  sizePx?: number;
  className?: string;
}

export function WorkspaceFaceLoader({
  workspaceId,
  spec,
  label = "Loading",
  sizePx = 64,
  className,
}: WorkspaceFaceLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("flex min-h-40 items-center justify-center", className)}
      data-workspace-face-loader={workspaceId ?? "neutral"}
    >
      <AoraCharacter
        entityId={workspaceId ?? NEUTRAL_ID}
        spec={spec}
        sizePx={sizePx}
        live
        alt={label}
      />
    </div>
  );
}

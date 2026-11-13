"use client";

import { resolvePublicFileUrl } from "@morechat/core/workspace/avatar-url";
import { isAoraSpec } from "@morechat/ui/components/common/aora-avatar";
import { AoraCharacter } from "@morechat/ui/components/common/aora-character";
import { cn } from "@morechat/ui/lib/utils";

/**
 * Workspace identity: an Aora face, an uploaded picture, or a derived face.
 *
 * A workspace with no logo used to fall back to its first letter in a circle, which
 * reads as "unset" and looks like every other initial chip. A character carries the
 * identity the agents beside it do, and it is derived from the workspace id, so two
 * workspaces never look alike and the face is stable across sessions.
 *
 * No ring and no circle: Aora silhouettes are not round - a rice ball, a croissant,
 * a cloud - and a circular clip cuts their corners off.
 */

const sizeMap = {
  sm: { px: 20, class: "h-5 w-5" },
  md: { px: 28, class: "h-7 w-7" },
  lg: { px: 36, class: "h-9 w-9" },
  /** The rail slot: the workspace's identity, and the one live face in the shell. */
  rail: { px: 44, class: "h-11 w-11" },
} as const;

/** Below this an animated face is a couple of pixels of motion nobody can read. */
const LIVE_MIN_PX = 32;

interface WorkspaceAvatarProps {
  /**
   * Stable identity for the derived face. Without one the name seeds it, which keeps
   * older call sites working but makes the face change when a workspace is renamed.
   */
  id?: string;
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof sizeMap;
  /** Ask for the animated renderer where the size allows it. */
  live?: boolean;
  /** Track the pointer with the eyes. Needs `live`. */
  followPointer?: boolean;
  /** Face into the content instead of out of the window. */
  mirrored?: boolean;
  className?: string;
}

function WorkspaceAvatar({
  id,
  name,
  avatarUrl,
  size = "sm",
  live = false,
  followPointer = false,
  mirrored = false,
  className,
}: WorkspaceAvatarProps) {
  const rung = sizeMap[size];

  // Order matters. `resolvePublicFileUrl` passes anything that is not a site path
  // through unchanged, so an `aora:` spec would reach an <img> and render broken.
  // A character wins before a picture is even considered.
  const spec = isAoraSpec(avatarUrl) ? avatarUrl : null;

  if (!spec) {
    const resolvedUrl = resolvePublicFileUrl(avatarUrl);
    if (resolvedUrl) {
      return (
        <img
          src={resolvedUrl}
          alt={name}
          className={cn("inline-block shrink-0 object-cover", rung.class, className)}
        />
      );
    }
  }

  // No picture: either a chosen spec, or one derived from the id - which is what
  // makes a workspace recognisable before anyone has picked a face for it.
  return (
    <AoraCharacter
      entityId={id ?? name}
      spec={spec}
      sizePx={rung.px}
      live={live && rung.px >= LIVE_MIN_PX}
      followPointer={followPointer}
      mirrored={mirrored}
      name={name}
      className={cn("inline-block shrink-0", rung.class, className)}
    />
  );
}

export { LIVE_MIN_PX as WORKSPACE_AVATAR_LIVE_MIN_PX, WorkspaceAvatar, type WorkspaceAvatarProps };

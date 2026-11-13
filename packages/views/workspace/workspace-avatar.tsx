import { resolvePublicFileUrl } from "@morechat/core/workspace/avatar-url";
import { isAoraSpec } from "@morechat/ui/components/common/aora-avatar";
import { AoraCharacter } from "@morechat/ui/components/common/aora-character";
import { cn } from "@morechat/ui/lib/utils";

/**
 * Workspace identity: an Aora face, an uploaded picture, or nothing.
 *
 * A workspace used to fall back to its first letter in a circle. That reads as
 * "unset" and looks like every other initial chip; a character carries the same
 * identity the agents beside it do, and it is derived from the workspace id, so two
 * workspaces never look alike and the face is stable across sessions.
 *
 * No ring or circle: Aora silhouettes are not round - a rice ball, a croissant, a
 * cloud - and a circular clip cuts their corners off. The slot is a plain square that
 * lets the shape breathe.
 */

const sizeMap = {
  sm: { px: 20, class: "h-5 w-5" },
  md: { px: 28, class: "h-7 w-7" },
  lg: { px: 36, class: "h-9 w-9" },
} as const;

/** Below this an animated face is a couple of pixels of motion nobody can read. */
const LIVE_MIN_PX = 32;

interface WorkspaceAvatarProps {
  /** Stable identity for the derived face. Falling back to the name keeps legacy callers working. */
  id?: string;
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof sizeMap;
  /** Ask for the animated renderer where the size allows it. */
  live?: boolean;
  className?: string;
}

function WorkspaceAvatar({
  id,
  name,
  avatarUrl,
  size = "sm",
  live = false,
  className,
}: WorkspaceAvatarProps) {
  const resolvedUrl = resolvePublicFileUrl(avatarUrl);
  const rung = sizeMap[size];

  if (resolvedUrl) {
    return (
      <img
        src={resolvedUrl}
        alt={name}
        className={cn("inline-block shrink-0 object-cover", rung.class, className)}
      />
    );
  }

  // A stored spec wins; otherwise the id derives one, which is what keeps a
  // workspace recognisable before anyone has chosen a face for it.
  const spec = isAoraSpec(avatarUrl) ? avatarUrl : null;
  const entityId = id ?? name;

  return (
    <AoraCharacter
      entityId={entityId}
      spec={spec}
      sizePx={rung.px}
      live={live && rung.px >= LIVE_MIN_PX}
      name={name}
      className={cn("inline-block shrink-0", rung.class, className)}
    />
  );
}

export { LIVE_MIN_PX as WORKSPACE_AVATAR_LIVE_MIN_PX, WorkspaceAvatar, type WorkspaceAvatarProps };

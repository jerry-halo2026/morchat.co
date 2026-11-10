"use client";

import { useState, useEffect } from "react";
import { Bot, Users } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import {
  AGENT_AVATAR_PX,
  AVATAR_SIZE_PX,
  DEFAULT_AVATAR_SIZE,
  agentAvatarPx,
  type AvatarSize,
} from "@morechat/ui/lib/avatar-size";
import { parseAvatarEmoji } from "@morechat/ui/lib/avatar-emoji";
import { MorechatIcon } from "./morechat-icon";

interface ActorAvatarProps {
  name: string;
  initials: string;
  avatarUrl?: string | null;
  isAgent?: boolean;
  isSystem?: boolean;
  isSquad?: boolean;
  size?: AvatarSize;
  className?: string;
}

function ActorAvatar({
  name,
  initials,
  avatarUrl,
  isAgent,
  isSystem,
  isSquad,
  size = DEFAULT_AVATAR_SIZE,
  className,
}: ActorAvatarProps) {
  const [imgError, setImgError] = useState(false);
  // A control that fixes its own content size (e.g. a toolbar pill) sets
  // `--avatar-slot-size`; it wins over `size` so the avatar can't outgrow the
  // control. A CSS variable rather than React context: it follows the DOM, so
  // hover cards portaled out of the control keep their own avatar sizes.
  //
  // Agent avatars are the exception: the product standardised on 32px for every
  // agent (see `AGENT_AVATAR_PX`), so an agent slot can grow the control but
  // can never shrink the face below the standard. `max()` does that in CSS, so
  // a slot that asks for more (the 3rem identity avatar) still wins.
  const diameter = isAgent
    ? `max(${AGENT_AVATAR_PX}px, var(--avatar-slot-size, ${agentAvatarPx(size)}px))`
    : `var(--avatar-slot-size, ${AVATAR_SIZE_PX[size]}px)`;
  const scaled = (ratio: number) => `calc(${diameter} * ${ratio})`;
  const emoji = parseAvatarEmoji(avatarUrl);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  // Every actor — member, agent, squad, or system — renders as a circle. This
  // is the single source of truth for avatar shape; the upload editors mirror
  // it (packages/views/common/avatar-upload-control.tsx).
  return (
    <div
      data-slot="avatar"
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium overflow-hidden",
        (!avatarUrl || emoji || imgError) && "bg-muted text-muted-foreground",
        className,
        // rounded-full stays last so a call-site `className` can never override
        // the circle — avatar shape is a hard invariant, not a per-site choice.
        "rounded-full"
      )}
      style={{ width: diameter, height: diameter, fontSize: scaled(0.45) }}
    >
      {emoji ? (
        <span
          role="img"
          aria-label={name}
          className="select-none leading-none"
          style={{ fontSize: scaled(0.58) }}
        >
          {emoji}
        </span>
      ) : avatarUrl && !imgError ? (
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : isSystem ? (
        // `size` only sets the edge thickness; the slot decides the rendered size.
        <MorechatIcon shape="circle" size={AVATAR_SIZE_PX[size]} style={{ width: "100%", height: "100%" }} />
      ) : isAgent ? (
        <Bot style={{ width: scaled(0.55), height: scaled(0.55) }} />
      ) : isSquad ? (
        <Users style={{ width: scaled(0.55), height: scaled(0.55) }} />
      ) : (
        initials
      )}
    </div>
  );
}

export { ActorAvatar, type ActorAvatarProps };

"use client";

/**
 * Public entry point for generated agent avatars.
 *
 * The implementation lives in `lib/agent-bot/` (engine, identity contract,
 * render tiers); this file only exposes it through the package's
 * `./components/common/*` export, next to `actor-avatar.tsx`. `ActorAvatar`
 * itself is untouched: callers opt in by rendering `<CapAvatar>` and checking
 * for `null`, which is the signal that the avatar belongs to the old pipeline.
 */

export { CapAvatar } from "../../lib/agent-bot/CapAvatar";
export type { CapAvatarProps } from "../../lib/agent-bot/CapAvatar";
// Callers that already own the avatar value (e.g. ActorAvatar deciding between
// pipelines) need the marker check without reaching into lib/* internals.
export { parseCap, formatCap, capFor } from "../../lib/agent-bot/appearance";

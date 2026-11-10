/**
 * Semantic avatar size scale + the one product-standard agent size.
 *
 * Avatar consumers pick a role-based tier instead of a raw pixel number so the
 * same "role" (inline chip, list row, section header, hero) renders at one
 * consistent size everywhere.
 *
 * **Product standard (2026-11): every agent avatar is 32px.** `AGENT_AVATAR_PX`
 * is that standard and `agentAvatarPx()` is the only supported way to turn an
 * agent tier into a diameter. `xs` / `sm` / `md` / `lg` all resolve to 32 for
 * agents, so a stale `size="sm"` call site can never make one agent render
 * smaller than the next one in the same list. `xl` / `2xl` stay above the
 * standard for single-instance display (agent detail header, profile popover)
 * — a surface that shows exactly one agent at a time, never a list.
 *
 * The raw tiers keep their historical pixels for **non-agent** actors (human
 * members, squads, system), which are not part of the agent standard: a
 * member's initials circle keeps the diameter its surface has always used.
 * Tiers align to a 4px grid (Tailwind size-4/5/6/8/10/14).
 */
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

/**
 * Pixel diameter per tier for non-agent actors. `xs` (16) / `sm` (20) / `md`
 * (24) are **legacy / compatibility** rungs: agent avatars no longer use them
 * (see `AGENT_AVATAR_TIER_PX`), they survive for compact human chips and for
 * surfaces that were never part of the agent standard.
 */
export const AVATAR_SIZE_PX: Record<AvatarSize, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
  "2xl": 56,
};

/** The product standard agent-avatar diameter, in px. */
export const AGENT_AVATAR_PX = 32;

/** The tier that equals `AGENT_AVATAR_PX` — the default for every agent. */
export const AGENT_AVATAR_SIZE: AvatarSize = "lg";

/**
 * Agent tier map. Everything at or below the standard collapses onto 32px;
 * only `xl` (40) and `2xl` (56) go above it, and only for single-instance
 * display. Keeping the map here (instead of the engine) means a component can
 * honour `size` without knowing the avatar implementation.
 */
export const AGENT_AVATAR_TIER_PX: Record<AvatarSize, number> = {
  xs: AGENT_AVATAR_PX,
  sm: AGENT_AVATAR_PX,
  md: AGENT_AVATAR_PX,
  lg: AGENT_AVATAR_PX,
  xl: 40,
  "2xl": 56,
};

/**
 * Diameter for an agent avatar of this tier. Never returns anything below
 * `AGENT_AVATAR_PX`, so "16/20/24px agent avatar" is not expressible through
 * the semantic scale any more.
 */
export function agentAvatarPx(size: AvatarSize = AGENT_AVATAR_SIZE): number {
  return AGENT_AVATAR_TIER_PX[size] ?? AGENT_AVATAR_PX;
}

/** Default tier for avatars that don't specify a size. Matches the historical
 *  20px default of the base avatar so untyped call sites are unchanged. */
export const DEFAULT_AVATAR_SIZE: AvatarSize = "sm";

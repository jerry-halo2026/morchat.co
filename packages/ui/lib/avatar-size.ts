/**
 * Semantic avatar size scale — upstream's, not a product clamp.
 *
 * Avatar consumers pick a role-based tier instead of a raw pixel number so the
 * same "role" (inline chip, list row, comment author, section header, hero)
 * renders at one consistent diameter everywhere.
 *
 * **Sizing authority is the caller's slot.** A cap/agent avatar renders at the
 * diameter of the slot it is dropped into; there is no global "one standard"
 * px for agents. Where the slot is decided in CSS (`--avatar-slot-size`), the
 * CSS variable wins; where a call site picks a tier, `size="xs|sm|md|lg|xl|2xl"`
 * is exactly the upstream rung (16/20/24/32/40/56) and nothing rounds it up.
 *
 * Tiers align to a 4px grid (Tailwind size-4/5/6/8/10/14). `AVATAR_SLOT_PX` is
 * the one place that records the default slot diameters the product surfaces
 * use; a surface that "just renders a list row avatar" reads it instead of
 * inventing a number.
 */
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

/** Pixel diameter for each semantic avatar size (upstream table, unchanged). */
export const AVATAR_SIZE_PX: Record<AvatarSize, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
  "2xl": 56,
};

/** The surfaces that host an avatar, by the upstream slot they render at. */
export type AvatarSlot = "list" | "comment" | "detail" | "hero";

/**
 * Default slot diameters: list rows 20, comment authors 24, detail headers 40,
 * and the single-instance hero 56. These are *defaults for a slot*, not a clamp
 * — a surface may still pass any `AvatarSize` or a raw px number.
 */
export const AVATAR_SLOT_PX: Record<AvatarSlot, number> = {
  list: AVATAR_SIZE_PX.sm,
  comment: AVATAR_SIZE_PX.md,
  detail: AVATAR_SIZE_PX.xl,
  hero: AVATAR_SIZE_PX["2xl"],
};

/** Default tier for avatars that don't specify a size. Matches the historical
 *  20px default of the base avatar so untyped call sites are unchanged. */
export const DEFAULT_AVATAR_SIZE: AvatarSize = "sm";

/** Pixel diameter for a tier. Pure lookup: the caller's slot decides the size,
 *  so there is nothing here to clamp. */
export function avatarPx(size: AvatarSize = DEFAULT_AVATAR_SIZE): number {
  return AVATAR_SIZE_PX[size] ?? AVATAR_SIZE_PX[DEFAULT_AVATAR_SIZE];
}

/**
 * `cap-v1` identity contract — the single client-side owner of the generated
 * agent avatar identity.
 *
 * The arithmetic is frozen and bit-identical to the Go implementation and to
 * `testdata/cap-vectors.json` (Lead-frozen, read-only):
 *
 *   h  = 0; for c in agentId: h = (h*31 + cp(c)) % 17
 *   palette = palettes[h]
 *   h2 = (h*31 + runeLen(agentId)) % 10
 *   body = bodies[h2]
 *
 * `cp(c)` is the Unicode code point and `runeLen` counts code points (Go runes),
 * not UTF-16 units — JS string iteration (`for..of` / spread) is code-point
 * based, so it matches. All arithmetic stays in integers below 2^53.
 *
 * Persisted form: `cap:<bodyId>:<paletteId>`, e.g. `cap:pebble:rose`.
 */

import { BODY_IDS, type BodyId, isBodyId } from "./bodies";
import { PALETTES, type PaletteId, isPaletteId } from "./palettes";

/** Prefix of the generated-avatar value stored in `avatar_url`. */
export const CAP_SCHEME = "cap:";

const PALETTE_MODULUS = 17;
const BODY_MODULUS = 10;

export interface Cap {
  paletteId: PaletteId;
  bodyId: BodyId;
}

/**
 * Parses a persisted `cap:<bodyId>:<paletteId>` value.
 * Returns `null` for anything else — including `emoji:`, `http(s)://` and
 * storage paths — so the caller keeps ownership of non-generated avatars.
 */
export function parseCap(value?: string | null): { paletteId: PaletteId; bodyId: BodyId } | null {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw.startsWith(CAP_SCHEME)) return null;

  const rest = raw.slice(CAP_SCHEME.length);
  // Exactly two non-empty segments; a trailing ":" or extra segment is not a cap.
  const parts = rest.split(":");
  if (parts.length !== 2) return null;

  const [bodyId, paletteId] = parts;
  if (!isBodyId(bodyId) || !isPaletteId(paletteId)) return null;

  return { paletteId, bodyId };
}

/** Formats a cap as the persisted `cap:<bodyId>:<paletteId>` value. */
export function formatCap(p: { paletteId: string; bodyId: string }): string {
  return `${CAP_SCHEME}${p.bodyId}:${p.paletteId}`;
}

/**
 * Deterministic identity for an agent id. Stable across reloads, sessions and
 * clients; the same id always yields the same palette and body.
 */
export function capFor(agentId: string): { paletteId: PaletteId; bodyId: BodyId } {
  const id = typeof agentId === "string" ? agentId : "";

  let h = 0;
  let runeLen = 0;
  for (const ch of id) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) % PALETTE_MODULUS;
    runeLen += 1;
  }

  const h2 = (h * 31 + runeLen) % BODY_MODULUS;

  const palette = PALETTES[h] ?? PALETTES[0]!;
  const body = BODY_IDS[h2] ?? BODY_IDS[0];

  return { paletteId: palette.id, bodyId: body };
}

/**
 * Resolves the cap an avatar should render for, given the persisted
 * `avatar_url` and the agent id.
 *
 * - `cap:...` → that cap (invalid cap payloads fall back to the deterministic
 *   `capFor(agentId)` rather than rendering nothing).
 * - empty / null → `capFor(agentId)`.
 * - anything else (`emoji:`, `http(s)://`, storage path) → `null`: this module
 *   does not take over avatars it does not own.
 */
export function resolveCap(agentId: string, avatarUrl?: string | null): Cap | null {
  const parsed = parseCap(avatarUrl);
  if (parsed) return parsed;
  if (typeof avatarUrl === "string" && avatarUrl.trim() !== "") {
    return avatarUrl.trim().startsWith(CAP_SCHEME) ? capFor(agentId) : null;
  }
  return capFor(agentId);
}

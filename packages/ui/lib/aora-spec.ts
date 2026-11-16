/**
 * The avatar spec: one string that fully describes an Aora Bot character.
 *
 *   aora:<character>:<shape>:<color>:<face>:<style>:<seed>
 *
 * `character` is the cast name ("mochi", "byte", …). In the cast a member *is* a
 * shape plus a colour, so a derived avatar picks one character and takes both
 * from it; `face` and `style` are pinned so the roster reads as one family, and
 * become free choices once someone edits their own avatar.
 *
 * The encoders here and in server/internal/avatar/spec.go must agree byte for
 * byte: an avatar written by the server has to render identically in the web app
 * and the desktop app. testdata/aora-vectors.json pins that agreement.
 */

import { AORA_CAST_CHARACTERS } from "./aora-cast";

/** Every style the free editor may choose; derived avatars only ever use the first. */
export const STYLE_IDS = ["vector", "pixel", "kaomoji"] as const;
export type StyleId = (typeof STYLE_IDS)[number];

/** Derived faces are capsule eyes: one silhouette for the whole roster. */
export const DERIVED_FACE = "capsule";
export const DERIVED_STYLE: StyleId = "vector";

export interface AoraSpec {
  /** Cast name, e.g. "mochi". Empty only in specs written before derivation named one. */
  character: string;
  shape: string;
  color: string;
  face: string;
  style: string;
  seed: string;
}

const PREFIX = "aora:";
const FIELDS = 6;

/** FNV-1a over the UTF-8 bytes of the id: stable across platforms and languages. */
export function stableHash(id: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(id)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The avatar an entity gets when nobody chose one: fixed style and face, hashed character. */
export function deriveAoraSpec(entityId: string): AoraSpec {
  const hash = stableHash(entityId);
  const character = AORA_CAST_CHARACTERS[hash % AORA_CAST_CHARACTERS.length]!;
  return {
    character: character.id,
    shape: character.shape,
    color: character.color,
    face: DERIVED_FACE,
    style: DERIVED_STYLE,
    seed: (hash >>> 16).toString(16).padStart(4, "0"),
  };
}

export function encodeAoraSpec(spec: AoraSpec): string {
  return [
    PREFIX.slice(0, -1),
    spec.character,
    spec.shape,
    spec.color,
    spec.face,
    spec.style,
    spec.seed,
  ].join(":");
}

/** Returns null for anything that is not a well-formed spec, so callers fall back. */
export function decodeAoraSpec(value: string | null | undefined): AoraSpec | null {
  if (!value || !value.startsWith(PREFIX)) return null;
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== FIELDS) return null;
  const [character, shape, color, face, style, seed] = parts;
  // `character` stays optional: specs written before derivation named one carry ""
  // and still have to parse.
  if (!shape || !color || !face || !style || !seed) return null;
  if (!(STYLE_IDS as readonly string[]).includes(style)) return null;
  return { character: character!, shape, color, face, style, seed };
}

/** True when an entity has not chosen an avatar of its own. */
export function isDerivedAvatar(value: string | null | undefined): boolean {
  return decodeAoraSpec(value) === null;
}

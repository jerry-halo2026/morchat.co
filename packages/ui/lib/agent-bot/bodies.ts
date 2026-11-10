/**
 * Body half of the frozen `cap-v1` identity contract.
 *
 * Order is part of the contract (`capFor` picks `BODIES[h2]` with `h2 ∈ [0,10)`)
 * and each id is also the engine's shape name, so the mapping is a passthrough
 * today. The indirection exists so an in-house shape set can be swapped in
 * later by editing `BODY_TO_ENGINE_SHAPE` only — see `engine/PROVENANCE.md`.
 */

export const BODY_IDS = [
  "blob",
  "pebble",
  "egg",
  "squircle",
  "capsule",
  "hex",
  "cloud",
  "teardrop",
  "heart",
  "star6",
] as const;

export type BodyId = (typeof BODY_IDS)[number];

/**
 * bodyId → engine shape name (`SHAPES` from `engine/motion-engine.js`).
 * Same-name passthrough: the frozen body ids were chosen to match the engine's
 * shape names one-to-one, so no translation happens today.
 */
export const BODY_TO_ENGINE_SHAPE: Record<BodyId, string> = {
  blob: "blob",
  pebble: "pebble",
  egg: "egg",
  squircle: "squircle",
  capsule: "capsule",
  hex: "hex",
  cloud: "cloud",
  teardrop: "teardrop",
  heart: "heart",
  star6: "star6",
};

const BODY_ID_SET: ReadonlySet<string> = new Set<string>(BODY_IDS);

export function isBodyId(value: unknown): value is BodyId {
  return typeof value === "string" && BODY_ID_SET.has(value);
}

/** Engine shape name for a body id; falls back to `blob` for unknown input. */
export function engineShapeFor(bodyId: BodyId): string {
  return BODY_TO_ENGINE_SHAPE[bodyId] ?? BODY_TO_ENGINE_SHAPE.blob;
}

/** Deterministic default used when a persisted body id is unknown. */
export const DEFAULT_BODY: BodyId = BODY_IDS[0];

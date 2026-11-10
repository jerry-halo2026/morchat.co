/**
 * Render-layer helpers for generated agent avatars.
 *
 * Form: **a solid body plus eyes** — `palette.a` fills the body, `palette.b` is
 * the ink the eyes are drawn with. That is the reference implementation's shape
 * (`web/motion-engine.js`: `EYE_HALF` / `uniformEyes` / `matchEyeStroke` / the
 * eye pose), where the engine is handed a flat `background` colour and an `ink`
 * colour and paints a single-colour body with eyes cut into it. This package
 * previously painted `linear-gradient(180deg, a, b)` instead; the gradient was
 * our own drift, not the reference form, so the body is back to one colour.
 *
 * Three tiers, chosen by size (see `selectCapTier`):
 *
 * 1. **`css` (≤20px)** — one element, flat `backgroundColor`, per-body
 *    `border-radius` / `clip-path` approximation. No eyes: below ~21px a 2px dot
 *    is not an eye, it is noise. No JS, no timers. **Not an agent tier**: it
 *    survives only as the compatibility floor for a raw pixel caller.
 * 2. **`static` (21–31px)** — the same flat body plus one static SVG frame of
 *    the eyes (`capEyeFrame`). Also the fallback whenever the engine tier is
 *    gated off (quota, reduced motion, off-screen, `animated={false}`) — which
 *    is the normal state of a 32px avatar sitting in a list or a table row.
 * 3. **`animated` (≥32px)** — `engine/motion-engine.js` (`GrokBot`) with the
 *    same solid `background` and eye `ink`, so the eyes get gaze and blinks.
 *
 * **Product standard: 32px** (`CAP_STANDARD_PX`). 32px is also exactly where
 * the engine tier starts, so the tiers below it are no longer anything a product
 * surface should pick for an agent — the semantic scale in `avatar-size.ts`
 * collapses every small rung onto the standard and leaves `xl`/`2xl` for
 * single-instance display.
 */

import type { CSSProperties } from "react";

import { AGENT_AVATAR_PX } from "../avatar-size";
import { type BodyId, engineShapeFor } from "./bodies";
import { PALETTES, DEFAULT_PALETTE, paletteById, type Palette } from "./palettes";
import type { Cap } from "./appearance";

/** The product standard agent-avatar diameter: 32px, one size everywhere. */
export const CAP_STANDARD_PX = AGENT_AVATAR_PX;
/** At or below this diameter the pure-CSS layer is used (no eyes, no timers).
 *  Compatibility floor, not a product tier. */
export const CAP_CSS_MAX_PX = 20;
/** Largest diameter that still renders the static eye frame instead of the
 *  engine. `CAP_STANDARD_PX` sits exactly on the engine boundary. */
export const CAP_STATIC_MAX_PX = CAP_STANDARD_PX - 1;
/** At or above this diameter — and when animation is allowed — the engine runs. */
export const CAP_ANIMATED_MIN_PX = CAP_STANDARD_PX;

export type CapTier = "css" | "static" | "animated";

/**
 * Pure tier selection, kept free of DOM access so it is directly unit-testable.
 *
 * - `size <= 20`            → `"css"`      (flat body, no eyes, no timers)
 * - `size >= 32 && animated`→ `"animated"` (engine layer, eyes get gaze + blinks)
 * - otherwise               → `"static"`   (flat body + one static eye frame)
 */
export function selectCapTier(sizePx: number, animated = true): CapTier {
  const size = Number.isFinite(sizePx) ? sizePx : CAP_STANDARD_PX;
  if (size <= CAP_CSS_MAX_PX) return "css";
  if (animated && size >= CAP_ANIMATED_MIN_PX) return "animated";
  return "static";
}

/** Body silhouettes, approximated with one CSS primitive each. */
const BODY_ART: Record<BodyId, Pick<CSSProperties, "borderRadius" | "clipPath" | "transform">> = {
  blob: { borderRadius: "46% 54% 52% 48% / 50% 44% 56% 50%" },
  pebble: { borderRadius: "52% 48% 46% 54% / 56% 52% 48% 44%" },
  egg: { borderRadius: "50% / 62% 62% 38% 38%" },
  squircle: { borderRadius: "34%" },
  capsule: { borderRadius: "999px", transform: "scaleX(0.78)" },
  hex: { clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)" },
  cloud: { borderRadius: "50% 50% 44% 44% / 60% 60% 40% 40%" },
  teardrop: { borderRadius: "50% 50% 50% 0%", transform: "rotate(45deg)" },
  heart: {
    clipPath:
      "polygon(50% 100%, 2% 56%, 2% 30%, 14% 12%, 32% 8%, 50% 20%, 68% 8%, 86% 12%, 98% 30%, 98% 56%)",
  },
  star6: {
    clipPath:
      "polygon(50% 0%, 62.5% 28.4%, 93.3% 25%, 75% 50%, 93.3% 75%, 62.5% 71.6%, 50% 100%, 37.5% 71.6%, 6.7% 75%, 25% 50%, 6.7% 25%, 37.5% 28.4%)",
  },
};

const BODY_ART_FALLBACK = BODY_ART.blob;

function paletteOf(cap: Cap): Palette {
  return paletteById(cap.paletteId) ?? DEFAULT_PALETTE;
}

/** Body colour — `palette.a`, one flat colour, no gradient. */
export function capSolidColor(cap: Cap): string {
  return paletteOf(cap).a;
}

/** Eye colour — `palette.b`; this is the engine's `ink`. */
export function capInkColor(cap: Cap): string {
  return paletteOf(cap).b;
}

/**
 * The CSS-layer paint for one cap. Pure function of (cap, size) — no DOM, no
 * hooks, no engine import, so it is safe in SSR and in tests.
 *
 * Flat `backgroundColor`: the body is a solid colour and the eyes are a separate
 * layer on top, exactly like the reference engine's head fill + eye ink.
 */
export function capStaticStyle(cap: Cap, sizePx: number): CSSProperties {
  const size = Number.isFinite(sizePx) && sizePx > 0 ? Math.round(sizePx) : CAP_STANDARD_PX;
  const art = BODY_ART[cap.bodyId] ?? BODY_ART_FALLBACK;

  return {
    width: size,
    height: size,
    backgroundColor: capSolidColor(cap),
    // Flat fill, on purpose: the reference mark is a solid disc with eyes, and
    // any inner highlight or underside shading reads as an embossed button at
    // small sizes. Shape comes from orderRadius/clipPath alone.
  
    borderRadius: art.borderRadius,
    clipPath: art.clipPath,
    transform: art.transform,
    // The eye frame is absolutely positioned inside this box.
    position: "relative",
    flex: "0 0 auto",
  };
}

/**
 * Static eye frame ratios, in units of the cap diameter.
 *
 * `EYE_HALF` in the reference engine is 21 user units on a ~228-unit body, i.e.
 * an eye about 18% of the body wide. The static frame is drawn a touch larger
 * (20%) so the eyes still read on the smallest surface that hosts them (compact
 * chips). The product standard, 32px, is comfortably above that. Everything
 * else (two eyes, level with each other, slightly above the middle) follows the
 * reference face.
 */
const EYE_DIAMETER_RATIO = 0.2;
const EYE_GAP_RATIO = 0.28;
const EYE_CENTRE_Y_RATIO = 0.42;

export interface CapEye {
  /** Horizontal centre, in cap-diameter units (0 = left edge, 1 = right edge). */
  cx: number;
  /** Vertical centre, in cap-diameter units (0 = top edge, 1 = bottom edge). */
  cy: number;
  /** Radius, in cap-diameter units. */
  r: number;
}

export interface CapEyeFrame {
  /** Eye fill — `palette.b`. */
  fill: string;
  /** `viewBox` for the 0..1 unit square the eyes are expressed in. */
  viewBox: string;
  eyes: [CapEye, CapEye];
}

/**
 * The static frame of eyes, or `null` on the `css` tier where an eye dot would
 * be indistinguishable from an antialiasing artefact.
 *
 * Pure function of (cap, size): the caller renders it as an SVG layer over the
 * flat body, so eyes cost no engine, no timer and no second paint path.
 */
export function capEyeFrame(cap: Cap, sizePx: number): CapEyeFrame | null {
  const size = Number.isFinite(sizePx) && sizePx > 0 ? Math.round(sizePx) : CAP_STANDARD_PX;
  if (size <= CAP_CSS_MAX_PX) return null;

  const r = EYE_DIAMETER_RATIO / 2;
  const offset = EYE_GAP_RATIO / 2;
  return {
    fill: capInkColor(cap),
    viewBox: "0 0 100 100",
    eyes: [
      { cx: round((0.5 - offset) * 100), cy: round(EYE_CENTRE_Y_RATIO * 100), r: round(r * 100) },
      { cx: round((0.5 + offset) * 100), cy: round(EYE_CENTRE_Y_RATIO * 100), r: round(r * 100) },
    ],
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Stable engine seed derived from the agent id (engine default is `1`). */
export function capSeed(agentId: string): number {
  const id = typeof agentId === "string" ? agentId : "";
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 90_000) + 1_000;
}

/**
 * Face and pose settings transcribed from the reference implementation
 * (`web/bot-element.jsx` → `presentation('idle', shape)`).
 *
 * The engine's own defaults leave the face under-scaled and the head unturned,
 * which at 32–64px reads as two slits floating off-centre. These are the idle
 * values the reference itself uses, so the animated tier reproduces its face
 * instead of a near-miss.
 */
const REFERENCE_HOME_POSE = { turn: 17, tilt: -14, roll: 29 } as const;

const REFERENCE_IDLE_FACE = {
  size: 1,
  gap: 1,
  height: 1,
  eyeWidth: 1.2,
  eyeHeight: 1.16,
} as const;

/** Reference `SHAPE_SCALE`, restricted to the ten bodies this package ships. */
const REFERENCE_SHAPE_SCALE: Record<BodyId, number> = {
  blob: 0.92,
  pebble: 0.96,
  egg: 0.96,
  squircle: 0.84,
  capsule: 1,
  hex: 0.94,
  cloud: 1,
  teardrop: 1,
  heart: 1.1,
  star6: 1.08,
};

/**
 * Props handed to `GrokBot` by the animated tier. Kept in one place so engine
 * prop drift is a single-file fix (see `engine/PROVENANCE.md`).
 *
 * `background` is the flat body colour and `ink` is the eye colour — the
 * reference engine's own two-colour contract. `clock` is supplied by the caller
 * (it owns a rAF subscription).
 */
export function capEngineProps(cap: Cap, sizePx: number, agentId: string) {
  const palette = paletteOf(cap);
  const shapeScale = REFERENCE_SHAPE_SCALE[cap.bodyId] ?? 1;

  return {
    shape: engineShapeFor(cap.bodyId),
    size: Math.round(sizePx),
    state: "idle" as const,
    seed: capSeed(agentId),
    active: true,
    background: capSolidColor(cap),
    ink: palette.b,
    faceTune: { ...REFERENCE_IDLE_FACE },
    uniformEyes: true,
    eyeTopology: true,
    naturalLids: true,
    eyeScale: 0.92 / shapeScale,
    pose: { ...REFERENCE_HOME_POSE, scale: (shapeScale * 259) / 229 },
    poseHome: { ...REFERENCE_HOME_POSE },
  };
}

/** Palette order exported for tests/tools that assert the frozen 17. */
export const PALETTE_ORDER = PALETTES.map((palette) => palette.id);

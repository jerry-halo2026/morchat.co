"use client";

import { ALL_COLOR_IDS, FACE_STYLES, SHAPE_IDS, STYLE_IDS } from "@aora-bot/engine";
import type { CastId, ColorId, FaceStyle, ShapeId, StyleId } from "@aora-bot/engine";
import {
  CharacterMark,
  isCastId,
  useReducedMotion,
  useThemesReady,
} from "@aora-bot/react";
import "@aora-bot/react/styles.css";

import { AVATAR_SIZE_PX, DEFAULT_AVATAR_SIZE } from "@morechat/ui/lib/avatar-size";
import { cn } from "@morechat/ui/lib/utils";
import { AoraAvatar, isAoraSpec } from "./aora-avatar";

/**
 * Aora characters: live where it pays off, static where it does not.
 *
 * Two renderers, one contract:
 * - **Below 32px** a list of faces is forty animations nobody asked for, so
 *   this renders `<AoraAvatar>` — one cached `<img>` at `GET /avatar/<spec>`,
 *   zero JS per row.
 * - **At or above 32px** the face is a single instance someone is looking at,
 *   so it renders upstream's `CharacterMark` and breathes.
 *
 * The whole module is a client boundary on purpose: `@aora-bot/react` runs a
 * frame loop and touches `document`, so nothing here may be imported by a
 * server component. The static fallback lives in `aora-avatar.tsx`, which
 * stays renderable anywhere.
 */

/**
 * Smallest slot that gets a live character. Below this the engine's own detail
 * (blinks, belt, spring settle) is a pixel or two wide and the frame loop is
 * pure cost.
 */
export const AORA_LIVE_MIN_PX = 32;

const SHAPES = new Set<string>(SHAPE_IDS);
const COLORS = new Set<string>(ALL_COLOR_IDS);
const FACES = new Set<string>(FACE_STYLES);
const STYLES = new Set<string>(STYLE_IDS);

/** The six fields of `aora:<character>:<shape>:<color>:<face>:<style>:<seed>`. */
export interface AoraCharacterFields {
  character: string;
  shape: string;
  color: string;
  face: string;
  style: string;
  seed: string;
}

/**
 * Split a spec into render fields, or `null` when it is not one.
 *
 * Field *shape* only — which ids exist is asked of the engine id lists, and a
 * value none of them knows sends the slot back to the static renderer rather
 * than drawing a face the persisted spec does not describe. Encoding stays
 * owned by `packages/core/avatar/aora-spec.ts`; nothing here writes a spec.
 */
export function readAoraFields(spec: string | null | undefined): AoraCharacterFields | null {
  if (!isAoraSpec(spec)) return null;
  const [character, shape, color, face, style, seed] = spec.slice("aora:".length).split(":");
  if (!shape || !color || !face || !style || !seed) return null;
  if (!SHAPES.has(shape) || !COLORS.has(color)) return null;
  return { character: character ?? "", shape, color, face, style, seed };
}

/**
 * Whether a slot renders live.
 *
 * `live` is a request, not a command: a page-level flag may be passed down
 * through every avatar, and the size floor still wins, so a 20px list row
 * never turns into a frame loop.
 */
export function aoraRendersLive(live: boolean | undefined, sizePx: number): boolean {
  return live === true && sizePx >= AORA_LIVE_MIN_PX;
}

export interface AoraCharacterProps {
  /** Actor id; the static fallback derives its face from this. */
  entityId: string;
  /** Persisted spec. Empty, legacy or malformed values stay static. */
  spec?: string | null;
  /** Slot diameter in px. The upstream rungs are 20/24/40/56. */
  sizePx?: number;
  /** Ask for the animated renderer. Ignored below {@link AORA_LIVE_MIN_PX}. */
  live?: boolean;
  /** Entity name, used for the accessible label. */
  name?: string;
  /** Explicit accessible label, for surfaces whose label is not the name. */
  alt?: string;
  /** Track the pointer with its eyes. Only meaningful for a live face. */
  followPointer?: boolean;
  /**
   * Mirror the character horizontally.
   *
   * The shell puts content on the right, so a character drawn facing left looks like
   * it is staring at the edge of the window. Mirroring is a transform on the drawing,
   * not a different spec: the stored avatar stays what it is.
   */
  mirrored?: boolean;
  className?: string;
}

/**
 * One character.
 *
 * A live face needs a spec: without one there is nothing for the engine to
 * draw, and deriving it here would mean a second copy of the hash in the UI
 * package. Those slots keep the static route, which derives from the id
 * server-side.
 */
export function AoraCharacter({
  entityId,
  spec,
  sizePx = AVATAR_SIZE_PX[DEFAULT_AVATAR_SIZE],
  live,
  name,
  alt,
  followPointer = false,
  mirrored = false,
  className,
}: AoraCharacterProps) {
  // Subscribed rather than read at mount: a mid-session change to the OS
  // setting stops the loop without a remount.
  const reduced = useReducedMotion();
  const fields = readAoraFields(spec);
  const px = sizePx > 0 ? Math.round(sizePx) : AVATAR_SIZE_PX[DEFAULT_AVATAR_SIZE];

  // Hooks run unconditionally; the answer is ignored when the slot is static.
  const themesReady = useThemesReady({
    shape: fields?.shape ?? null,
    color: fields?.color ?? null,
    preset: fields?.character ?? null,
    style: fields?.style ?? null,
  });

  // A theme that is still loading is not a reason to draw nothing: the static image is
  // the same face and it is already correct.
  if (!aoraRendersLive(live, px) || !fields || !themesReady) {
    return (
      <AoraAvatar
        entityId={entityId}
        avatarUrl={spec}
        name={name}
        alt={alt}
        size={px}
        className={className}
      />
    );
  }

  return (
    <div
      data-slot="avatar"
      data-avatar-engine="aora"
      data-avatar-mode="live"
      role="img"
      aria-label={alt ?? name ?? ""}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        className,
        // Rounded last: the circle is a hard invariant, never a per-site choice.
        "rounded-full",
      )}
      style={{
        width: `var(--avatar-slot-size, ${px}px)`,
        height: `var(--avatar-slot-size, ${px}px)`,
      }}
    >
      <CharacterMark
        shape={fields.shape as ShapeId}
        color={fields.color as ColorId}
        face={FACES.has(fields.face) ? (fields.face as FaceStyle) : undefined}
        styleId={STYLES.has(fields.style) ? (fields.style as StyleId) : undefined}
        preset={isCastId(fields.character) ? (fields.character as CastId) : undefined}
        seed={fields.seed}
        sizePx={px}
        // Reduced motion is the engine's own subscription, so the face holds its
        // last frame instead of resetting. `autoPause` adds the other two cases
        // the engine knows: scrolled out of view, and a hidden tab.
        paused={reduced}
        autoPause
        followPointer={followPointer}
        // A mirrored build flips the gaze too, which is the point: the face keeps
        // looking where the pointer is while the body faces the content.
        style={mirrored ? { transform: "scaleX(-1)" } : undefined}
      />
    </div>
  );
}

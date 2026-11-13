"use client";

import {
  AVATAR_SIZE_PX,
  DEFAULT_AVATAR_SIZE,
  type AvatarSize,
} from "@morechat/ui/lib/avatar-size";
import { decodeAoraSpec, deriveAoraSpec } from "@morechat/core/avatar/aora-spec";
import {
  renderStaticSvg,
  type ColorId,
  type FaceStyle,
  type ShapeId,
  type StyleId,
} from "@aora-bot/engine";
import { cn } from "@morechat/ui/lib/utils";

/**
 * Aora avatar: one `<img>` at the static SVG route.
 *
 * The face itself is not drawn here. `GET /avatar/<spec>` renders it once
 * with the engine's static renderer and marks the response immutable, so a
 * list of forty agents costs forty cached images instead of forty live
 * simulations. This component only builds that URL and keeps the slot.
 *
 * Two inputs, one route:
 * - `avatar_url` already holds an `aora:<character>:<shape>:<color>:<face>:<style>:<seed>`
 *   spec (someone picked a face) — the spec goes in the path verbatim.
 * - anything else — empty, a legacy `cap:` value, a value from an older client
 *   — asks the route to derive the spec from the entity id (`?derive=1`), which
 *   is the same hash the server writes, so nothing has to know the pools here.
 */

/**
 * `aora:` + six colon-separated fields; the shape of the frozen encoding.
 *
 * The cast field may be empty: `aora::blob:blue:capsule:vector:1a2b` is what a
 * spec looks like when nobody named a character and the shape picks the cast —
 * the decoder in `packages/core/avatar/aora-spec.ts` accepts it, and the route
 * renders it as written, so recognizing it here keeps the client from deriving
 * a different face than the route would.
 */
const AORA_SPEC_SHAPE = /^aora:(?:[^:]*:){5}[^:]+$/;

/** True when the persisted value is a complete, self-describing Aora spec. */
export function isAoraSpec(value: string | null | undefined): value is string {
  return typeof value === "string" && AORA_SPEC_SHAPE.test(value);
}

export interface AoraAvatarUrlInput {
  /** Actor id the derived spec is hashed from; also the fallback path segment. */
  entityId: string;
  /** Persisted `avatar_url`, if any. */
  avatarUrl?: string | null;
  /** Intrinsic size of the rendered SVG, in px. */
  sizePx?: number;
}

/**
 * The static avatar URL for an entity.
 *
 * A spec keeps its own path; everything else becomes `<entityId>?derive=1`, so
 * an unknown or legacy value still renders the entity's own face rather than a
 * hole in the layout.
 */
export function aoraAvatarUrl({
  entityId,
  avatarUrl,
  sizePx,
}: AoraAvatarUrlInput): string {
  const size = sizePx && sizePx > 0 ? `size=${Math.round(sizePx)}` : "";
  if (isAoraSpec(avatarUrl)) {
    return size ? `/avatar/${avatarUrl}?${size}` : `/avatar/${avatarUrl}`;
  }
  const segment = encodeURIComponent(entityId || avatarUrl || "");
  return `/avatar/${segment}?derive=1${size ? `&${size}` : ""}`;
}

/**
 * The same face as an inline data URI.
 *
 * One image per avatar with no request and no route: the engine draws the SVG here,
 * so a workspace face, an agent face and a picker cell all work on a page that has no
 * `/avatar` handler at all - which is every Electron window.
 */
export function aoraAvatarDataUri({
  entityId,
  avatarUrl,
  sizePx,
}: AoraAvatarUrlInput): string {
  const decoded = decodeAoraSpec(avatarUrl);
  const spec = decoded ?? deriveAoraSpec(entityId || avatarUrl || "avatar");
  const px = sizePx && sizePx > 0 ? Math.round(sizePx) : 40;
  try {
    const svg = renderStaticSvg({
      shape: spec.shape as ShapeId,
      color: spec.color as ColorId,
      face: spec.face as FaceStyle,
      style: spec.style as StyleId,
      sizePx: px,
      // Matches the route: a flat fill ships fewer bytes and needs no dark mode pass.
      flat: true,
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    // A spec only uses ids the engine ships, so this is the floor rather than a hole.
    // An empty src makes React warn and the browser fetch the page again; a blank SVG
    // keeps the slot and stays quiet.
    return "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  }
}

export interface AoraAvatarProps {
  /** Actor id; the derived spec is hashed from it. */
  entityId: string;
  /** Persisted `avatar_url`. Empty or unrecognised values derive from `entityId`. */
  avatarUrl?: string | null;
  /** Entity name, used for `alt`. */
  name?: string;
  /** Explicit `alt` override for surfaces whose label is not the entity name. */
  alt?: string;
  /** Upstream slot tier or a raw px diameter. Defaults to the 20px list slot. */
  size?: AvatarSize | number;
  /**
   * Mirror the drawing horizontally.
   *
   * Content sits to the right of the avatar in this shell, so an unmirrored face looks
   * like it is staring at the window edge. The flip is a CSS transform on the image:
   * the stored spec is unchanged.
   */
  mirrored?: boolean;
  className?: string;
}

function diameterPx(size: AvatarSize | number): number {
  if (typeof size === "number") return size;
  return AVATAR_SIZE_PX[size] ?? AVATAR_SIZE_PX[DEFAULT_AVATAR_SIZE];
}

export function AoraAvatar({
  entityId,
  avatarUrl,
  name,
  alt,
  size = DEFAULT_AVATAR_SIZE,
  mirrored = false,
  className,
}: AoraAvatarProps) {
  const px = diameterPx(size);
  // `--avatar-slot-size` wins over `size`, exactly as it does for every other
  // actor avatar: a control that fixes its own content size must not have a
  // 40px face pushed into it.
  const diameter = `var(--avatar-slot-size, ${px}px)`;
  return (
    <div
      data-slot="avatar"
      data-avatar-engine="aora"
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        className,
        // rounded-full stays last so a call-site `className` can never override
        // the circle — avatar shape is a hard invariant, not a per-site choice.
        "rounded-full",
      )}
      style={{ width: diameter, height: diameter }}
    >
      <img
        src={aoraAvatarDataUri({ entityId, avatarUrl, sizePx: px })}
        alt={alt ?? name ?? ""}
        width={px}
        height={px}
        style={mirrored ? { transform: "scaleX(-1)" } : undefined}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover select-none"
      />
    </div>
  );
}

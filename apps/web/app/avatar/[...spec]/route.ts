import {
  ALL_COLOR_IDS,
  FACE_STYLES,
  SHAPE_IDS,
  STYLE_IDS,
  renderStaticSvg,
  type ColorId,
  type FaceStyle,
  type ShapeId,
  type StyleId,
} from "@aora-bot/engine";
import {
  decodeAoraSpec,
  deriveAoraSpec,
  type AoraSpec,
} from "@morechat/core/avatar/aora-spec";

export const runtime = "nodejs";

/**
 * Static avatar route: `GET /avatar/<spec>` or `GET /avatar/<entityId>?derive=1`.
 *
 * One request renders one frame with the engine's static renderer — no live
 * simulation, no DOM, no timers — and the response is immutable for a year, so
 * a list of avatars is a list of cache hits after the first paint.
 *
 * Inputs:
 * - `aora:<character>:<shape>:<color>:<face>:<style>:<seed>` — the persisted spec.
 * - an entity id with `?derive=1` — the spec is derived from the id, which is
 *   what empty and legacy `cap:` values get. Deriving here rather than in each
 *   client keeps one implementation of the hash (packages/core/avatar).
 * - anything unparseable — derived from the raw value, so a bad URL still
 *   returns a face instead of a broken image.
 */

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const DEFAULT_SIZE_PX = 40;
const MIN_SIZE_PX = 16;
const MAX_SIZE_PX = 256;

const SHAPES = new Set<string>(SHAPE_IDS);
const COLORS = new Set<string>(ALL_COLOR_IDS);
const FACES = new Set<string>(FACE_STYLES);
const STYLES = new Set<string>(STYLE_IDS);

function requestedSizePx(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("size"));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SIZE_PX;
  return Math.min(MAX_SIZE_PX, Math.max(MIN_SIZE_PX, Math.round(raw)));
}

/**
 * The spec a request renders. Explicit specs win; everything else — an empty
 * value, a legacy `cap:` value, a field the engine does not know — derives from
 * the same string, which for the derive form is the entity id.
 */
function specFor(raw: string): AoraSpec {
  const decoded = decodeAoraSpec(raw);
  if (
    decoded &&
    SHAPES.has(decoded.shape) &&
    COLORS.has(decoded.color) &&
    FACES.has(decoded.face) &&
    STYLES.has(decoded.style)
  ) {
    return decoded;
  }
  return deriveAoraSpec(raw);
}

function render(spec: AoraSpec, sizePx: number): string {
  // A spec's `character` is the cast name the spec was written with; the
  // engine draws the silhouette from `shape`, so a missing or renamed cast
  // still renders the same face.
  const svg = renderStaticSvg({
    shape: spec.shape as ShapeId,
    color: spec.color as ColorId,
    face: spec.face as FaceStyle,
    style: spec.style as StyleId,
    sizePx,
    // A flat fill, matching the `vector` style derived avatars are pinned to:
    // no gradient stops to ship, and nothing to re-evaluate in dark mode.
    flat: true,
  });
  return compactPrecision(svg);
}

/**
 * Drop path coordinates to one decimal place.
 *
 * The engine writes geometry at three decimals in shape space; at a 288-unit
 * viewBox rendered between 20px and 56px, the third decimal is a thousandth of
 * a pixel. Trimming it takes the largest silhouettes from ~9KB to under 7KB,
 * which is what keeps these images inside the avatar budget (CONTRACTS.md).
 */
function compactPrecision(svg: string): string {
  return svg.replace(
    /(\sd|\spoints)="([^"]*)"/g,
    (_match, attribute: string, data: string) =>
      `${attribute}="${data.replace(/-?\d+\.\d{2,}/g, (number) =>
        String(Math.round(Number(number) * 10) / 10),
      )}"`,
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ spec?: string[] }> },
): Promise<Response> {
  const { spec: segments } = await context.params;
  const raw = (segments ?? []).join("/").replace(/\.svg$/, "");
  const sizePx = requestedSizePx(new URL(request.url).searchParams);

  let svg: string;
  try {
    svg = render(specFor(raw || "avatar"), sizePx);
  } catch {
    // A derived spec only uses ids the engine ships, so this is the floor: a
    // face for an id nobody wrote a spec for.
    svg = render(deriveAoraSpec(raw || "avatar"), sizePx);
  }

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
    },
  });
}

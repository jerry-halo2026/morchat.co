/**
 * morechat.co brand geometry.
 *
 * Same construction as the mark it replaces (multica-brand.ts, kept for
 * unmigrated references): every mark is built from one module — straight
 * lines and true circles with a constant stroke. The icon is the wordmark's
 * first letter (m), scaled up until it no longer fits its tile and gets
 * cropped. Units are the 100×100 icon grid unless stated otherwise.
 *
 * The wordmark spells `morechat.co`; the `.` is not a glyph but the brand's
 * separator dot: a filled circle whose diameter equals the stroke width, so
 * it reads as the same pen as the letters.
 */

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Filled outline of one arch: outer width `w`, stroke `t`, legs down to `y1`. */
export function archPath(x0: number, y0: number, y1: number, w: number, t: number): string {
  const R = w / 2;
  const cy = y0 + R;
  const ri = R - t;
  return (
    `M${r3(x0)} ${r3(y1)}V${r3(cy)}A${r3(R)} ${r3(R)} 0 0 1 ${r3(x0 + w)} ${r3(cy)}V${r3(y1)}` +
    `H${r3(x0 + w - t)}V${r3(cy)}A${r3(ri)} ${r3(ri)} 0 0 0 ${r3(x0 + t)} ${r3(cy)}V${r3(y1)}Z`
  );
}

// ---------- icon (F1): stroke 22, arch 68, scaled 0.96, top at 22% ----------
export const ICON_STROKE = 22;
export const ICON_ARCH = 68;
const ICON_SCALE = 0.96;
const ICON_TOP = 22;
const ICON_M_WIDTH = (2 * ICON_ARCH - ICON_STROKE) * ICON_SCALE;
const ICON_LEG = (100 - ICON_TOP) / ICON_SCALE + 4;

/**
 * Places the m on the tile; the m's own paths are in unscaled arch units. The
 * circle (avatar) form sits the m 2 units lower so the arches clear the curve.
 */
export function iconMTransform(shape: "square" | "circle" = "square"): string {
  const top = shape === "circle" ? ICON_TOP + 2 : ICON_TOP;
  return `translate(${r3(50 - ICON_M_WIDTH / 2)} ${top}) scale(${ICON_SCALE})`;
}
export const ICON_TILE_RADIUS = 22.5;

/** The m as two filled arches sharing the middle stem. */
export const ICON_M_PATH =
  archPath(0, 0, ICON_LEG, ICON_ARCH, ICON_STROKE) +
  archPath(ICON_ARCH - ICON_STROKE, 0, ICON_LEG, ICON_ARCH, ICON_STROKE);

/** Centre line of the m, stroked at ICON_STROKE. Drives the "think" highlight. */
export const ICON_M_CENTRE_LINE =
  `M11 ${r3(ICON_LEG)}V34A23 23 0 0 1 57 34V${r3(ICON_LEG)}V34A23 23 0 0 1 103 34V${r3(ICON_LEG)}`;

/**
 * The thin edge in the tile colour that keeps the tile outline intact on any
 * background: 2.6% of the width, never thinner than 1px.
 */
export function iconEdge(sizePx: number): number {
  return Math.max(2.6, 100 / sizePx);
}

// ---------- wordmark (G2): stroke 16, bowl radius 23, x-height 76, ascender 30 ----------
export const WORDMARK_STROKE = 16;

/** The name the wordmark spells. */
export const WORDMARK_WORD = "morechat";

/**
 * The suffix the mark carries so the wordmark is the domain, not just the
 * name. The `.` between them is the separator dot.
 */
export const WORDMARK_SUFFIX = "co";

export interface WordmarkLetter {
  /** Centre line, stroked at WORDMARK_STROKE. Absent when the glyph is only a dot. */
  d?: string;
  dot?: { cx: number; cy: number; r: number };
}

function buildWordmark() {
  const t = WORDMARK_STROKE;
  const W = 62;
  const X = 76;
  const asc = 30;
  const gap = 12;
  const r = (W - t) / 2;
  const a = t / 2;
  const cy1 = a + r;
  // The round glyphs share one ring: its top sits on the arch's top (cy1) and its
  // bottom on the baseline, so `o` is exactly as tall as `m`. Deriving it from the
  // ring instead of subtracting from the baseline keeps the two in step.
  const CY = cy1 + r;
  const cy2 = CY + r;
  const c45 = Math.SQRT1_2;
  const A = (x1: number, y1: number) => `A${r3(r)} ${r3(r)} 0 0 1 ${r3(x1)} ${r3(y1)}`;

  // Round glyphs are built from cubic quarter-circle segments rather than one
  // `A` command: an arc's sweep direction depends on the coordinate system, which
  // is how `e` and `c` turned into blobs. A quarter circle with these control
  // points is exact to within a rounding error, and the direction is explicit.
  const K = 0.5522847498;
  const P = (cx: number, cy: number, deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  /** Point coordinates as an `M`/`L` pair. */
  const at = (cx: number, cy: number, deg: number) => {
    const p = P(cx, cy, deg);
    return `${r3(p.x)} ${r3(p.y)}`;
  };
  /** Ring segment from `fromDeg` sweeping `deltaDeg`; positive is clockwise on screen. */
  const ring = (cx: number, cy: number, fromDeg: number, deltaDeg: number) => {
    const steps = Math.max(1, Math.ceil(Math.abs(deltaDeg) / 90));
    const step = deltaDeg / steps;
    const k = (K * r * Math.abs(step)) / 90;
    const sign = Math.sign(step);
    let out = "";
    let start = fromDeg;
    for (let i = 0; i < steps; i++) {
      const end = start + step;
      const from = P(cx, cy, start);
      const to = P(cx, cy, end);
      const tangent = (deg: number) => {
        const rad = (deg * Math.PI) / 180;
        return { x: -Math.sin(rad), y: Math.cos(rad) };
      };
      const t0 = tangent(start);
      const t1 = tangent(end);
      out += `C${r3(from.x + sign * t0.x * k)} ${r3(from.y + sign * t0.y * k)} ${r3(to.x - sign * t1.x * k)} ${r3(to.y - sign * t1.y * k)} ${r3(to.x)} ${r3(to.y)}`;
      start = end;
    }
    return out;
  };

  // Every glyph is made of the same three parts: a vertical stem, a quarter
  // arc of radius r (a true circle), and a horizontal bar. Nothing is eyeballed.
  const glyphs: Record<
    string,
    [number, (x: number) => string, ((x: number) => WordmarkLetter["dot"])?]
  > = {
    // two arches sharing the middle stem
    m: [
      4 * r + t,
      (x) =>
        `M${r3(x + a)} ${X}V${r3(cy1)}${A(x + a + 2 * r, cy1)}V${X}M${r3(x + a + 2 * r)} ${r3(cy1)}${A(x + a + 4 * r, cy1)}V${X}`,
    ],
    // closed ring: one full turn from the top
    o: [
      2 * r + t,
      (x) => {
        const cx = x + a + r;
        return `M${at(cx, CY, 270)}${ring(cx, CY, 270, 360)}`;
      },
    ],
    // stem with a quarter-circle arm: the arm leaves the stem at x-height and
    // stops in a short vertical terminal, so it reads as an r, not an n.
    r: [
      r + t,
      (x) =>
        `M${r3(x + a)} ${X}V${r3(cy1)}A${r3(r)} ${r3(r)} 0 0 1 ${r3(x + a + r)} ${r3(cy1 - r)}V${r3(cy1 - r + 12)}`,
    ],
    // bowl with the bar at mid-height and an aperture at the lower right, where
    // the bottom arc stops before the right side comes down.
    e: [
      2 * r + t,
      (x) => {
        const cx = x + a + r;
        // The right side rises to the bar, the bowl goes over the top and down the
        // left, and the bottom stops 45° short of the right: that gap is the
        // aperture, and the bar closes the letter at mid-height.
        return (
          `M${at(cx, CY, 0)}` +
          ring(cx, CY, 0, -180) +
          `V${r3(cy2)}` +
          ring(cx, CY, 90, -45) +
          `M${at(cx, CY, 180)}H${r3(cx + r)}`
        );
      },
    ],
    // ascender stem plus one full arch — the m with a single arch
    h: [
      2 * r + t,
      (x) => `M${r3(x + a)} ${-asc}V${X}M${r3(x + a)} ${r3(cy1)}${A(x + a + 2 * r, cy1)}V${X}`,
    ],
    // open bowl: the ring with the lower right left off
    c: [
      (W / 2) * (1 + c45),
      (x) => {
        const cx = x + W / 2;
        // From 45° below the top-right, over the top and down the left, then
        // around the bottom to 45° above the bottom-right: the right side is open.
        return (
          `M${at(cx, CY, -45)}` +
          ring(cx, CY, -45, -135) +
          `V${r3(cy2)}` +
          ring(cx, CY, 90, -45)
        );
      },
    ],
    // bowl plus right stem
    a: [
      W,
      (x) => {
        const cx = x + a + r;
        return (
          `M${at(cx, CY, 270)}${ring(cx, CY, 270, 360)}` +
          `M${r3(cx + r)} ${r3(cy1)}V${X}`
        );
      },
    ],
    t: [2.5 * t, (x) => `M${r3(x + 0.75 * t + a)} ${r3(-asc * 0.66)}V${X}M${r3(x)} ${r3(a)}H${r3(x + 2.5 * t)}`],
    l: [t, (x) => `M${r3(x + a)} ${-asc}V${X}`],
    i: [t, (x) => `M${r3(x + a)} 0V${X}`, (x) => ({ cx: r3(x + a), cy: r3(-asc * 0.62), r: r3(t * 0.56) })],
    // The separator dot. A filled circle, never a stroke: its diameter is the
    // stroke width, so the pen never changes size between letters and the dot.
    ".": [t, () => "", (x) => ({ cx: r3(x + t / 2), cy: r3(X - t / 2), r: r3(t / 2) })],
  };

  // Optical kerning: the pairs that read loose at the default spacing.
  const kern: Record<string, number> = {
    lt: 0.8,
    ti: 0.85,
    ic: 0.92,
    ca: 0.8,
    ra: 0.92,
    rc: 0.94,
    ec: 0.94,
    ".c": 0.45,
  };
  const sequence = `${WORDMARK_WORD}.${WORDMARK_SUFFIX}`;
  const letters: WordmarkLetter[] = [];
  let x = 0;
  for (let k = 0; k < sequence.length; k++) {
    const [w, d, dot] = glyphs[sequence[k]!]!;
    letters.push({ d: d(x), dot: dot?.(x) });
    x += w;
    if (k < sequence.length - 1) x += gap * (kern[sequence[k]! + sequence[k + 1]!] ?? 1);
  }
  const top = -asc - 0.5;
  /** Index of the `.` inside `letters`, for callers that animate name and suffix apart. */
  const separatorIndex = WORDMARK_WORD.length;
  return { word: WORDMARK_WORD, suffix: WORDMARK_SUFFIX, letters, separatorIndex, viewBox: `0 ${r3(top)} ${r3(x)} ${r3(X - top)}` };
}

export const WORDMARK = buildWordmark();

/**
 * The single-letter mark (monogram): the icon's m as flat filled paths on the
 * 100×100 grid, for favicons and app icons. `assets/brand/monogram.svg` draws
 * exactly these shapes.
 */
export const MONOGRAM_PATH = ICON_M_PATH;
export const MONOGRAM_TRANSFORM = iconMTransform("square");

// ---------- bars: the m's three legs, straightened ----------
/**
 * The icon's three bars, on the 100x100 grid.
 *
 * The m is already three verticals joined by two arches. Straightened, the same three
 * move as a single wave, which reads as activity at a size where a drawing line does
 * not. Width, gap and cap match the arch stroke so the mark keeps its proportions.
 */
/**
 * The app icon's three bars, mapped onto the 100 grid.
 *
 * Read off `apps/web/app/icon.svg`: it places a unit-space mark at
 * translate(18.2095 22.1076) scale(50.7135) and draws bars of width 0.3 whose tops sit
 * at 0.48 / 0.24 / 0, heights 0.62 / 0.86 / 1.1, opacity 0.45 / 0.7 / 1. Using those
 * numbers here keeps the thinking mark and the app icon the same shape.
 */
export const ICON_BARS = [
  { x: 18.2, y: 46.45, width: 15.21, height: 31.44, rx: 4.56, opacity: 0.45 },
  { x: 41.54, y: 34.28, width: 15.21, height: 43.61, rx: 4.56, opacity: 0.7 },
  { x: 64.87, y: 22.11, width: 15.21, height: 55.78, rx: 4.56, opacity: 1 },
] as const;

/**
 * The tile the bars sit in: the app icon's own background and ink.
 *
 * `apps/web/app/icon.svg` used to be the only place these lived, which is why the
 * generator could not rebuild the tile from this module. They belong here for the
 * same reason the geometry does: one source, every asset.
 */
export const ICON_TILE_FILL = "#F7F7F8";
export const ICON_BAR_FILL = "#ED7B2D";

/** The bars lean right by this much, the way the reference mark does. */
export const ICON_BAR_SKEW_DEG = -8;

/**
 * The lean, applied about a bar's own centre so the group keeps its footprint.
 *
 * Skewing the group instead would slide the outer bars sideways and break the
 * gaps; a per-bar transform keeps the spacing the geometry above defines.
 */
export function iconBarTransform(bar: {
  x: number;
  y: number;
  width: number;
  height: number;
}): string {
  const cx = r3(bar.x + bar.width / 2);
  const cy = r3(bar.y + bar.height / 2);
  return `translate(${cx} ${cy}) skewX(${ICON_BAR_SKEW_DEG}) translate(${-cx} ${-cy})`;
}

/** The bars as rounded-rect attribute sets, in drawing order. */
export function iconBarRects(): { bar: (typeof ICON_BARS)[number]; attrs: Record<string, number> }[] {
  return ICON_BARS.map((bar) => ({
    bar,
    attrs: { x: bar.x, y: bar.y, width: bar.width, height: bar.height, rx: bar.rx },
  }));
}
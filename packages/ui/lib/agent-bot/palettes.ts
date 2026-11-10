/**
 * Palette half of the frozen `cap-v1` identity contract.
 *
 * The order of `PALETTES` is load-bearing: `capFor` picks `PALETTES[h]` with
 * `h ∈ [0, 17)`, so index order is part of the mutual contract with the Go
 * implementation and `testdata/cap-vectors.json` (Lead-frozen, read-only).
 * Reordering, inserting or removing an id needs `cap-v2`; **swapping the two
 * hex values of a pair does not** — `a`/`b` are paint, the id is identity.
 */

export interface Palette {
  /** Stable palette id used in the `cap:<bodyId>:<paletteId>` value. */
  id: PaletteId;
  /** 本体 colour — the flat fill of the body (`palette.a` fills the cap). */
  a: string;
  /** 眼睛 colour — the ink the two eyes are drawn with. */
  b: string;
}

export const PALETTE_IDS = [
  "deep-tide",
  "ember",
  "moss",
  "cobalt",
  "plum",
  "sand",
  "slate",
  "coral",
  "jade",
  "amber",
  "indigo",
  "rose",
  "teal",
  "olive",
  "steel",
  "violet",
  "clay",
] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

/**
 * 17 palettes, mirrored 1:1 (id, a, b, order) from the frozen vector file.
 *
 * Bauhaus board. `a` is a saturated primary-family body colour, byte-for-byte
 * the board's value. `b` is the eye ink: the board's ink, kept on its own hue
 * but moved along luminance by the smallest step that clears **3:1** against
 * its body — WCAG AA for graphic objects, the floor below which a 4px eye dot
 * on a 21px cap stops being an eye.
 *
 * The board's raw ink values clear 3:1 for only 3 of 17 pairs (sand, slate,
 * amber); a body like `deep-tide` (#1B4F9C) is dark enough that *no* darker ink
 * can reach 3:1 (pure black tops out at 2.66:1), so those inks lift instead of
 * dropping. `scripts/palette-contrast.mjs` is the audit and it reads this file:
 *
 *   deep-tide #1B4F9C / #0E2B58 → #95A2B6  lightened
 *   ember     #C8392B / #6E1D17 → #43120E  darkened
 *   moss      #6E8B6A / #33422F → #2F3D2B  darkened
 *   cobalt    #3B3F9E / #1D1F52 → #9697AF  lightened
 *   plum      #7D4E6B / #3E2435 → #B8AEB4  lightened
 *   sand      #C9A66B / #6B5326   verbatim
 *   slate     #9AA0A6 / #4A5056   verbatim
 *   coral     #E8641B / #7A3208 → #6E2D07  darkened
 *   jade      #1F8A4C / #0C4426 → #0A361E  darkened
 *   amber     #F2C300 / #7A6100   verbatim
 *   indigo    #5B2C8D / #2E1249 → #9A8CA7  lightened
 *   rose      #A3175A / #550A2E → #BC9EAC  lightened
 *   teal      #0E7C86 / #064449 → #042B2E  darkened
 *   olive     #B8860B / #5C4305 → #563F05  darkened
 *   steel     #4A4A4A / #141414 → #989898  lightened
 *   violet    #8C3B2E / #452015 → #B2A29E  lightened
 *   clay      #5B8FD1 / #2A4A73 → #264267  darkened
 *
 * `amber` (index 9) is the product's default orange: it is the first palette a
 * workspace sees and the one the orange mark leads with.
 */
export const PALETTES: readonly Palette[] = [
  { id: "deep-tide", a: "#1B4F9C", b: "#95A2B6" },
  { id: "ember", a: "#C8392B", b: "#43120E" },
  { id: "moss", a: "#6E8B6A", b: "#2F3D2B" },
  { id: "cobalt", a: "#3B3F9E", b: "#9697AF" },
  { id: "plum", a: "#7D4E6B", b: "#B8AEB4" },
  { id: "sand", a: "#C9A66B", b: "#6B5326" },
  { id: "slate", a: "#9AA0A6", b: "#4A5056" },
  { id: "coral", a: "#E8641B", b: "#6E2D07" },
  { id: "jade", a: "#1F8A4C", b: "#0A361E" },
  { id: "amber", a: "#F2C300", b: "#7A6100" },
  { id: "indigo", a: "#5B2C8D", b: "#9A8CA7" },
  { id: "rose", a: "#A3175A", b: "#BC9EAC" },
  { id: "teal", a: "#0E7C86", b: "#042B2E" },
  { id: "olive", a: "#B8860B", b: "#563F05" },
  { id: "steel", a: "#4A4A4A", b: "#989898" },
  { id: "violet", a: "#8C3B2E", b: "#B2A29E" },
  { id: "clay", a: "#5B8FD1", b: "#264267" },
];

const PALETTE_BY_ID: ReadonlyMap<string, Palette> = new Map(
  PALETTES.map((palette) => [palette.id, palette])
);

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === "string" && PALETTE_BY_ID.has(value);
}

export function paletteById(id: string): Palette | undefined {
  return PALETTE_BY_ID.get(id);
}

/** Fallback used by the render layer when a persisted palette id is unknown. */
export const DEFAULT_PALETTE: Palette = PALETTES[0]!;

/** The product's default orange — `amber`, not the index-0 navy. */
export const DEFAULT_ORANGE_PALETTE: Palette =
  PALETTE_BY_ID.get("amber") ?? DEFAULT_PALETTE;

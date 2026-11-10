/**
 * Palette half of the frozen `cap-v1` identity contract.
 *
 * The order of `PALETTES` is load-bearing: `capFor` picks `PALETTES[h]` with
 * `h ∈ [0, 17)`, so index order is part of the mutual contract with the Go
 * implementation and `testdata/cap-vectors.json` (Lead-frozen, read-only).
 * Reordering, inserting, or editing a value needs `cap-v2`.
 */

export interface Palette {
  /** Stable palette id used in the `cap:<bodyId>:<paletteId>` value. */
  id: PaletteId;
  /** Top colour of `linear-gradient(180deg, a, b)`. */
  a: string;
  /** Bottom colour of `linear-gradient(180deg, a, b)`. */
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

/** 17 palettes, mirrored 1:1 (id, a, b, order) from the frozen vector file. */
export const PALETTES: readonly Palette[] = [
  { id: "deep-tide", a: "#6E8B9E", b: "#334A5C" },
  { id: "ember", a: "#B98B7A", b: "#6E4A3F" },
  { id: "moss", a: "#8A9A7B", b: "#4C5743" },
  { id: "cobalt", a: "#7B8FA6", b: "#425164" },
  { id: "plum", a: "#9C8397", b: "#5A4657" },
  { id: "sand", a: "#C9B79C", b: "#7C6C56" },
  { id: "slate", a: "#8E97A3", b: "#525A63" },
  { id: "coral", a: "#C79A8E", b: "#7C564B" },
  { id: "jade", a: "#8FA9A0", b: "#4C625A" },
  { id: "amber", a: "#C2A26B", b: "#6E5735" },
  { id: "indigo", a: "#7E85A0", b: "#434A5C" },
  { id: "rose", a: "#C29AA0", b: "#7A5860" },
  { id: "teal", a: "#7FA3A3", b: "#456363" },
  { id: "olive", a: "#9A9A78", b: "#57573F" },
  { id: "steel", a: "#9AA3A8", b: "#565E63" },
  { id: "violet", a: "#9A8FA8", b: "#564F63" },
  { id: "clay", a: "#B9A08F", b: "#6E5A4E" },
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

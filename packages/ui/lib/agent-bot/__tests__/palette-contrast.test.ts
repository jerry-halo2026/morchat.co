import { describe, expect, it } from "vitest";

import { PALETTES } from "../palettes";

/**
 * The eyes are a 4px dot on a 21–24px cap. Below 3:1 (WCAG AA for graphic
 * objects) that dot stops reading as an eye and the avatar becomes a blank
 * disc, so the palette board is only valid while every pair clears it.
 *
 * This is the in-suite twin of `scripts/palette-contrast.mjs`, which prints the
 * per-palette audit; both read `palettes.ts`, so a repaint that breaks the floor
 * fails here first.
 */
function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("palette board contrast", () => {
  it("keeps every body/eye pair at or above 3:1", () => {
    expect(PALETTES).toHaveLength(17);
    for (const palette of PALETTES) {
      expect(contrastRatio(palette.a, palette.b), `${palette.id} ${palette.a}/${palette.b}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses the Bauhaus body colours verbatim", () => {
    // `a` is the brand body colour; only the eye ink is allowed to move for
    // contrast. Spot-check a few so a silent repaint is visible in the diff.
    expect(PALETTES[0]).toMatchObject({ id: "deep-tide", a: "#1B4F9C" });
    expect(PALETTES[9]).toMatchObject({ id: "amber", a: "#F2C300" });
    expect(PALETTES[16]).toMatchObject({ id: "clay", a: "#5B8FD1" });
  });
});

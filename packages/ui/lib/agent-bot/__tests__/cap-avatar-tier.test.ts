import { describe, expect, it } from "vitest";

import { BODY_IDS, BODY_TO_ENGINE_SHAPE, engineShapeFor, isBodyId } from "../bodies";
import {
  CAP_CSS_MAX_PX,
  CAP_DEFAULT_PX,
  CAP_ENGINE_MIN_PX,
  CAP_STATIC_MAX_PX,
  capEngineProps,
  capEyeFrame,
  capInkColor,
  capSeed,
  capSolidColor,
  capStaticStyle,
  selectCapTier,
} from "../caps";
import { frameFloorMs, SMALL_AVATAR_PX } from "../clock";
import {
  AVATAR_SIZE_PX,
  AVATAR_SLOT_PX,
  DEFAULT_AVATAR_SIZE,
  avatarPx,
} from "../../avatar-size";
import { PALETTES } from "../palettes";

/**
 * Sizing is the caller's slot. Upstream's tier table (16/20/24/32/40/56) is the
 * only scale, and nothing rounds an agent up to a product-wide diameter: a
 * `size="sm"` list row is a 20px face, a `size="2xl"` hero is 56px.
 */
describe("avatar size scale", () => {
  it("is upstream's table, unmodified", () => {
    expect(AVATAR_SIZE_PX).toEqual({ xs: 16, sm: 20, md: 24, lg: 32, xl: 40, "2xl": 56 });
  });

  it("resolves every tier to its own pixel diameter (no clamping)", () => {
    for (const tier of ["xs", "sm", "md", "lg", "xl", "2xl"] as const) {
      expect(avatarPx(tier)).toBe(AVATAR_SIZE_PX[tier]);
    }
  });

  it("defaults to the 20px list-row slot when no tier is given", () => {
    expect(DEFAULT_AVATAR_SIZE).toBe("sm");
    expect(avatarPx()).toBe(20);
    expect(CAP_DEFAULT_PX).toBe(20);
  });

  it("records the upstream slot diameters (list 20 / comment 24 / detail 40 / hero 56)", () => {
    expect(AVATAR_SLOT_PX).toEqual({ list: 20, comment: 24, detail: 40, hero: 56 });
  });
});

describe("selectCapTier", () => {
  it("uses the CSS layer at or below 20px", () => {
    for (const size of [8, 12, 16, 20]) {
      expect(selectCapTier(size)).toBe("css");
      expect(selectCapTier(size, false)).toBe("css");
    }
  });

  it("renders a single static frame in the 21–31px band", () => {
    for (const size of [21, 24, 28, 31]) {
      expect(selectCapTier(size)).toBe("static");
    }
  });

  it("animates at 32px and above when animation is allowed", () => {
    for (const size of [32, 40, 56, 64, 96]) {
      expect(selectCapTier(size)).toBe("animated");
    }
  });

  it("drops to the static frame when animation is not allowed", () => {
    for (const size of [32, 40, 56]) {
      expect(selectCapTier(size, false)).toBe("static");
    }
  });

  it("treats the tier boundaries exactly", () => {
    expect(selectCapTier(CAP_CSS_MAX_PX)).toBe("css");
    expect(selectCapTier(CAP_CSS_MAX_PX + 1)).toBe("static");
    expect(selectCapTier(CAP_ENGINE_MIN_PX - 1)).toBe("static");
    expect(selectCapTier(CAP_ENGINE_MIN_PX)).toBe("animated");
    expect(CAP_ENGINE_MIN_PX).toBe(32);
    expect(CAP_STATIC_MAX_PX).toBe(CAP_ENGINE_MIN_PX - 1);
  });

  it("maps the upstream slots onto the three layers", () => {
    // What a real surface gets: list rows and comments are flat/static, detail
    // headers and the hero are engine-tier when the caller opts into animation.
    expect(selectCapTier(AVATAR_SLOT_PX.list)).toBe("css");
    expect(selectCapTier(AVATAR_SLOT_PX.comment)).toBe("static");
    expect(selectCapTier(AVATAR_SLOT_PX.detail, false)).toBe("static");
    expect(selectCapTier(AVATAR_SLOT_PX.detail)).toBe("animated");
    expect(selectCapTier(AVATAR_SLOT_PX.hero)).toBe("animated");
  });

  it("falls back to the default slot for non-finite sizes", () => {
    expect(selectCapTier(Number.NaN)).toBe(selectCapTier(CAP_DEFAULT_PX));
    expect(selectCapTier(Number.POSITIVE_INFINITY)).toBe(selectCapTier(CAP_DEFAULT_PX));
    // The default slot is the 20px list row, i.e. the CSS layer either way.
    expect(selectCapTier(Number.NaN, false)).toBe("css");
  });
});

describe("frameFloorMs", () => {
  it("locks avatars up to 64px to 20fps", () => {
    for (const size of [16, 24, 32, 56, 64]) {
      expect(frameFloorMs(size)).toBeCloseTo(50, 6);
    }
  });

  it("allows the 60fps floor above 64px", () => {
    expect(frameFloorMs(SMALL_AVATAR_PX + 1)).toBeCloseTo(1000 / 60, 6);
    expect(frameFloorMs(128)).toBeCloseTo(1000 / 60, 6);
  });

  it("falls back to the 20fps floor for non-finite input", () => {
    expect(frameFloorMs(Number.NaN)).toBeCloseTo(50, 6);
  });
});

describe("static CSS layer", () => {
  it("paints one flat body colour (palette.a) for every palette", () => {
    for (const palette of PALETTES) {
      expect(capSolidColor({ paletteId: palette.id, bodyId: "blob" })).toBe(palette.a);
      expect(capInkColor({ paletteId: palette.id, bodyId: "blob" })).toBe(palette.b);
    }
  });

  it("never emits a background-image gradient", () => {
    for (const palette of PALETTES) {
      const style = capStaticStyle({ paletteId: palette.id, bodyId: "blob" }, 16);
      expect(style.backgroundColor).toBe(palette.a);
      expect(style.backgroundImage).toBeUndefined();
      expect(JSON.stringify(style)).not.toContain("gradient");
    }
  });

  it("gives every body a silhouette and honours the requested size", () => {
    for (const bodyId of BODY_IDS) {
      const style = capStaticStyle({ paletteId: "rose", bodyId }, 16);
      expect(style.width).toBe(16);
      expect(style.height).toBe(16);
      expect(Boolean(style.borderRadius ?? style.clipPath)).toBe(true);
    }
    // A slot above the CSS band keeps its own diameter — nothing clamps it.
    expect(capStaticStyle({ paletteId: "rose", bodyId: "blob" }, 40).width).toBe(40);
  });

  it("uses clip-path only where a border-radius cannot describe the shape", () => {
    expect(capStaticStyle({ paletteId: "rose", bodyId: "hex" }, 16).clipPath).toContain("polygon(");
    expect(capStaticStyle({ paletteId: "rose", bodyId: "square" as never }, 16).borderRadius).toBeDefined();
  });
});

describe("static eye frame", () => {
  it("draws no eyes at or below 20px", () => {
    for (const size of [8, 12, 16, 20]) {
      expect(capEyeFrame({ paletteId: "amber", bodyId: "blob" }, size)).toBeNull();
    }
  });

  it("draws two eyes in palette.b from 21px up", () => {
    for (const size of [21, 24, 32, 64]) {
      const frame = capEyeFrame({ paletteId: "amber", bodyId: "blob" }, size);
      expect(frame).not.toBeNull();
      expect(frame?.fill).toBe("#7A6100");
      expect(frame?.eyes).toHaveLength(2);
      const [left, right] = frame!.eyes;
      // Level with each other, symmetric about the centre, above the middle.
      expect(left.cy).toBe(right.cy);
      expect(left.cx + right.cx).toBeCloseTo(100, 1);
      expect(left.cx).toBeLessThan(right.cx);
      expect(left.cy).toBeLessThan(50);
      expect(left.r).toBeGreaterThan(0);
    }
  });

  it("keeps the eye dots large enough to read at 24px", () => {
    const frame = capEyeFrame({ paletteId: "amber", bodyId: "blob" }, 24);
    const radiusPx = (frame!.eyes[0].r / 100) * 24;
    const gapPx = ((frame!.eyes[1].cx - frame!.eyes[0].cx) / 100) * 24;
    expect(radiusPx).toBeGreaterThan(2);
    expect(gapPx).toBeGreaterThan(radiusPx);
  });
});

describe("engine layer descriptors", () => {
  it("maps every body id to a same-name engine shape", () => {
    for (const bodyId of BODY_IDS) {
      expect(BODY_TO_ENGINE_SHAPE[bodyId]).toBe(bodyId);
      expect(engineShapeFor(bodyId)).toBe(bodyId);
    }
  });

  it("rejects unknown body ids", () => {
    expect(isBodyId("blob")).toBe(true);
    expect(isBodyId("circle")).toBe(false);
    expect(engineShapeFor("nope" as never)).toBe("blob");
  });

  it("derives a stable, non-default seed from the agent id", () => {
    expect(capSeed("agent-0001")).toBe(capSeed("agent-0001"));
    expect(capSeed("agent-0001")).toBeGreaterThanOrEqual(1000);
    expect(capSeed("agent-0001")).not.toBe(capSeed("agent-0002"));
  });

  it("hands the engine a flat body colour and the eye ink", () => {
    const props = capEngineProps({ paletteId: "jade", bodyId: "star6" }, 40, "agent-0001");
    expect(props.shape).toBe("star6");
    expect(props.size).toBe(40);
    expect(props.state).toBe("idle");
    expect(props.background).toBe("#1F8A4C");
    expect(props.ink).toBe("#0A361E");
    expect(JSON.stringify(props.background)).not.toContain("gradient");
  });

  it("hands the engine the reference idle face and pose", () => {
    const props = capEngineProps({ paletteId: "jade", bodyId: "blob" }, 40, "agent-0001");
    expect(props.uniformEyes).toBe(true);
    expect(props.naturalLids).toBe(true);
    expect(props.faceTune).toEqual({ size: 1, gap: 1, height: 1, eyeWidth: 1.2, eyeHeight: 1.16 });
    expect(props.poseHome).toEqual({ turn: 17, tilt: -14, roll: 29 });
    // Reference shape scale: blob is 0.92 → eyeScale 1, pose scale 0.92 * 259 / 229.
    expect(props.eyeScale).toBeCloseTo(1, 6);
    expect(props.pose.scale).toBeCloseTo((0.92 * 259) / 229, 6);
  });

  it("passes gaze the way `bot-element.jsx` does: viewport point, or null", () => {
    // No pointer → `gazeTarget: null`, the reference's "pointerActive === false".
    expect(capEngineProps({ paletteId: "jade", bodyId: "blob" }, 40, "agent-0001").gazeTarget).toBeNull();
    // Pointer → client coordinates, untouched: the engine projects them itself.
    const looking = capEngineProps({ paletteId: "jade", bodyId: "blob" }, 40, "agent-0001", {
      x: 640,
      y: 220,
    });
    expect(looking.gazeTarget).toEqual({ x: 640, y: 220 });
  });

  it("keeps the engine size equal to the caller's slot", () => {
    for (const slot of [32, 40, 56]) {
      expect(capEngineProps({ paletteId: "amber", bodyId: "blob" }, slot, "a").size).toBe(slot);
    }
  });
});

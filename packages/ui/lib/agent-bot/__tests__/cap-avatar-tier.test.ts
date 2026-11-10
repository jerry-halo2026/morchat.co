import { describe, expect, it } from "vitest";

import { BODY_IDS, BODY_TO_ENGINE_SHAPE, engineShapeFor, isBodyId } from "../bodies";
import {
  CAP_ANIMATED_MIN_PX,
  CAP_CSS_MAX_PX,
  CAP_STANDARD_PX,
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
import { AGENT_AVATAR_PX, agentAvatarPx, AVATAR_SIZE_PX } from "../../avatar-size";
import { PALETTES } from "../palettes";

describe("agent size standard", () => {
  it("exposes one standard diameter and it is 32px", () => {
    expect(AGENT_AVATAR_PX).toBe(32);
    expect(CAP_STANDARD_PX).toBe(AGENT_AVATAR_PX);
  });

  it("collapses every small tier onto the standard, keeps xl/2xl above it", () => {
    for (const tier of ["xs", "sm", "md", "lg"] as const) {
      expect(agentAvatarPx(tier)).toBe(AGENT_AVATAR_PX);
    }
    expect(agentAvatarPx("xl")).toBe(40);
    expect(agentAvatarPx("2xl")).toBe(56);
    // Non-agent tiers keep their historical pixels.
    expect(AVATAR_SIZE_PX.xs).toBe(16);
    expect(AVATAR_SIZE_PX.sm).toBe(20);
    expect(AVATAR_SIZE_PX.md).toBe(24);
  });

  it("defaults to the standard when no tier is given", () => {
    expect(agentAvatarPx()).toBe(AGENT_AVATAR_PX);
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
    expect(selectCapTier(CAP_ANIMATED_MIN_PX - 1)).toBe("static");
    expect(selectCapTier(CAP_ANIMATED_MIN_PX)).toBe("animated");
    // The product standard is exactly the engine boundary.
    expect(CAP_STANDARD_PX).toBe(32);
    expect(selectCapTier(CAP_STANDARD_PX)).toBe("animated");
    expect(selectCapTier(CAP_STANDARD_PX, false)).toBe("static");
    expect(CAP_STATIC_MAX_PX).toBe(CAP_ANIMATED_MIN_PX - 1);
  });

  it("falls back to the standard size for non-finite sizes", () => {
    expect(selectCapTier(Number.NaN)).toBe(selectCapTier(CAP_STANDARD_PX));
    expect(selectCapTier(Number.POSITIVE_INFINITY)).toBe(selectCapTier(CAP_STANDARD_PX));
    expect(selectCapTier(Number.NaN, false)).toBe("static");
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
      expect(frame?.fill).toBe("#6E5735");
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
    expect(props.background).toBe("#8FA9A0");
    expect(props.ink).toBe("#4C625A");
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
});

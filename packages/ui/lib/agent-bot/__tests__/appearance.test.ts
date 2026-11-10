import { describe, expect, it } from "vitest";

import vectors from "../../../../../testdata/cap-vectors.json";

import { CAP_SCHEME, capFor, formatCap, parseCap, resolveCap } from "../appearance";
import { BODY_IDS } from "../bodies";
import { PALETTES, PALETTE_IDS } from "../palettes";

const frozen = vectors as unknown as {
  palettes: { id: string; a: string; b: string }[];
  bodies: string[];
  vectors: { agentId: string; paletteId: string; bodyId: string }[];
};

describe("palette/body mirror", () => {
  it("mirrors the frozen 17 palettes in order, including both colours", () => {
    expect(PALETTES).toHaveLength(17);
    expect(PALETTES.map((p) => ({ id: p.id, a: p.a, b: p.b }))).toEqual(frozen.palettes);
    expect([...PALETTE_IDS]).toEqual(frozen.palettes.map((p) => p.id));
  });

  it("mirrors the frozen 10 bodies in order", () => {
    expect([...BODY_IDS]).toEqual(frozen.bodies);
  });
});

describe("capFor", () => {
  it("matches every frozen vector", () => {
    expect(frozen.vectors).toHaveLength(25);
    for (const vector of frozen.vectors) {
      expect({ agentId: vector.agentId, ...capFor(vector.agentId) }).toEqual({
        agentId: vector.agentId,
        paletteId: vector.paletteId,
        bodyId: vector.bodyId,
      });
    }
  });

  it("is deterministic and case-sensitive", () => {
    expect(capFor("mika")).toEqual(capFor("mika"));
    expect(capFor("Mika")).not.toEqual(capFor("mika"));
  });

  it("counts code points, not UTF-16 units", () => {
    // An astral-plane id must hash by code point to stay Go-rune compatible.
    const id = "mika-🐼";
    const cap = capFor(id);
    const byRunes = (() => {
      let h = 0;
      let runeLen = 0;
      for (const ch of id) {
        h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 17;
        runeLen += 1;
      }
      return { h2: (h * 31 + runeLen) % 10, h };
    })();
    expect(cap.bodyId).toBe(BODY_IDS[byRunes.h2]);
    expect(cap.paletteId).toBe(PALETTE_IDS[byRunes.h]);
  });

  it("has a defined identity for the empty id", () => {
    expect(capFor("")).toEqual({ paletteId: "deep-tide", bodyId: "blob" });
  });
});

describe("parseCap / formatCap", () => {
  it("round-trips every frozen vector", () => {
    for (const vector of frozen.vectors) {
      const value = formatCap({ bodyId: vector.bodyId, paletteId: vector.paletteId });
      expect(value).toBe(`${CAP_SCHEME}${vector.bodyId}:${vector.paletteId}`);
      expect(parseCap(value)).toEqual({ paletteId: vector.paletteId, bodyId: vector.bodyId });
    }
  });

  it("rejects foreign schemes and malformed values", () => {
    for (const value of [
      null,
      undefined,
      "",
      "emoji:🐼",
      "https://cdn.example/a.png",
      "/uploads/agent/a.png",
      "cap:",
      "cap:blob",
      "cap:blob:rose:extra",
      "cap:not-a-body:rose",
      "cap:blob:not-a-palette",
      "CAP:blob:rose",
    ]) {
      expect(parseCap(value as string | null | undefined)).toBeNull();
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseCap("  cap:heart:coral  ")).toEqual({ paletteId: "coral", bodyId: "heart" });
  });
});

describe("resolveCap", () => {
  it("passes a valid cap through", () => {
    expect(resolveCap("agent-0001", "cap:hex:teal")).toEqual({ paletteId: "teal", bodyId: "hex" });
  });

  it("generates for empty values", () => {
    expect(resolveCap("agent-0001", "")).toEqual(capFor("agent-0001"));
    expect(resolveCap("agent-0001", null)).toEqual(capFor("agent-0001"));
    expect(resolveCap("agent-0001")).toEqual(capFor("agent-0001"));
  });

  it("falls back to the deterministic cap for a malformed cap value", () => {
    expect(resolveCap("agent-0001", "cap:not-a-body:rose")).toEqual(capFor("agent-0001"));
  });

  it("declines avatars it does not own", () => {
    expect(resolveCap("agent-0001", "emoji:🐼")).toBeNull();
    expect(resolveCap("agent-0001", "https://cdn.example/a.png")).toBeNull();
    expect(resolveCap("agent-0001", "/uploads/agent/a.png")).toBeNull();
  });
});

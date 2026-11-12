import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AORA_CAST_CHARACTERS } from "./aora-cast";
import {
  DERIVED_FACE,
  DERIVED_STYLE,
  decodeAoraSpec,
  deriveAoraSpec,
  encodeAoraSpec,
  isDerivedAvatar,
  stableHash,
} from "./aora-spec";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The derivation vectors are shared with server/internal/avatar/spec_test.go. Both
 * sides reproduce them, so a change here that the server does not make fails
 * before an avatar renders differently in the web and desktop apps.
 */
interface Vectors {
  vectors: { id: string; spec: ReturnType<typeof deriveAoraSpec>; encoded: string }[];
}

function vectors(): Vectors {
  return JSON.parse(readFileSync(join(HERE, "..", "..", "..", "testdata", "aora-vectors.json"), "utf8")) as Vectors;
}

describe("aora spec", () => {
  it("derives the same look the shared vectors pin", () => {
    for (const vector of vectors().vectors) {
      expect(deriveAoraSpec(vector.id)).toEqual(vector.spec);
      expect(encodeAoraSpec(deriveAoraSpec(vector.id))).toBe(vector.encoded);
    }
  });

  it("keeps derived avatars flat with capsule eyes on a cast character", () => {
    const spec = deriveAoraSpec("anything");
    expect(spec.style).toBe(DERIVED_STYLE);
    expect(spec.face).toBe(DERIVED_FACE);
    expect(spec.character).not.toBe("");
    expect(AORA_CAST_CHARACTERS.map((character) => character.id)).toContain(spec.character);
  });

  it("takes the shape and colour from the character it picked", () => {
    const byId = new Map(AORA_CAST_CHARACTERS.map((character) => [character.id, character]));
    for (const vector of vectors().vectors) {
      const spec = deriveAoraSpec(vector.id);
      const character = byId.get(spec.character);
      expect(character).toBeDefined();
      expect(spec.shape).toBe(character!.shape);
      expect(spec.color).toBe(character!.color);
    }
  });

  it("spreads ids across many characters instead of one body", () => {
    const picked = new Set(
      Array.from({ length: 400 }, (_, index) => deriveAoraSpec(`agent-${index}`).character),
    );
    expect(picked.size).toBeGreaterThan(30);
  });

  it("hashes stably across calls and differs between ids", () => {
    expect(stableHash("agent-1")).toBe(stableHash("agent-1"));
    expect(stableHash("agent-1")).not.toBe(stableHash("agent-2"));
  });

  it("round-trips a stored spec", () => {
    const spec = { character: "mochi", shape: "blob", color: "blue", face: "capsule", style: "pixel", seed: "1a2b" };
    const encoded = encodeAoraSpec(spec);
    expect(decodeAoraSpec(encoded)).toEqual(spec);
    expect(isDerivedAvatar(encoded)).toBe(false);
  });

  it("still decodes specs written before derivation named a character", () => {
    expect(decodeAoraSpec("aora::blob:cyan:capsule:vector:f3b0")).toEqual({
      character: "",
      shape: "blob",
      color: "cyan",
      face: "capsule",
      style: "vector",
      seed: "f3b0",
    });
  });

  it("treats legacy and malformed values as derived", () => {
    for (const value of ["", "cap:blob:amber", "aora:", "aora:mochi:blob:blue:capsule", "aora:m::b:capsule:vector:1"]) {
      expect(decodeAoraSpec(value)).toBeNull();
      expect(isDerivedAvatar(value)).toBe(true);
    }
  });
});

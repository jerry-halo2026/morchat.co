import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_COLOR_IDS,
  AUTO_SHAPE_POOL,
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

  it("keeps derived avatars flat with capsule eyes", () => {
    const spec = deriveAoraSpec("anything");
    expect(spec.style).toBe(DERIVED_STYLE);
    expect(spec.face).toBe(DERIVED_FACE);
    expect(spec.character).toBe("");
    expect(AUTO_SHAPE_POOL).toContain(spec.shape);
    expect(ASSIGNABLE_COLOR_IDS).toContain(spec.color);
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

  it("treats legacy and malformed values as derived", () => {
    for (const value of ["", "cap:blob:amber", "aora:", "aora:mochi:blob:blue:capsule", "aora:m::b:capsule:vector:1"]) {
      expect(decodeAoraSpec(value)).toBeNull();
      expect(isDerivedAvatar(value)).toBe(true);
    }
  });
});

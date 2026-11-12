// @vitest-environment node
import { describe, expect, it } from "vitest";

import { removeCredentialRef, upsertCredentialRef } from "./dsh-credentials";

const EXISTING = [
  "version: 1",
  "records:",
  "  deepseek-account-platform/default:",
  "    kind: grant",
  "    payload:",
  "      token: abc",
  "refs:",
  "  DEEPSEEK_API_KEY: sk-old",
  "",
].join("\n");

describe("upsertCredentialRef", () => {
  it("adds the entry beside the refs that are already there", () => {
    const next = upsertCredentialRef(EXISTING, "MULTICA_RELAY_KEY", "relay-key-1");
    expect(next).toContain("  DEEPSEEK_API_KEY: sk-old");
    expect(next).toContain("  MULTICA_RELAY_KEY: relay-key-1");
    // Records are not refs; the grant must survive untouched.
    expect(next).toContain("      token: abc");
  });

  it("replaces an existing value instead of duplicating the name", () => {
    const once = upsertCredentialRef(EXISTING, "MULTICA_RELAY_KEY", "relay-key-1");
    const twice = upsertCredentialRef(once, "MULTICA_RELAY_KEY", "relay-key-2");
    expect(twice.match(/MULTICA_RELAY_KEY/g)).toHaveLength(1);
    expect(twice).toContain("  MULTICA_RELAY_KEY: relay-key-2");
  });

  it("creates the block in a file that has none", () => {
    const next = upsertCredentialRef("version: 1\nrecords:\n", "MULTICA_RELAY_KEY", "k");
    expect(next).toContain("refs:");
    expect(next).toContain("  MULTICA_RELAY_KEY: k");
  });

  it("starts a file from nothing", () => {
    const next = upsertCredentialRef("", "MULTICA_RELAY_KEY", "k");
    expect(next.startsWith("version: 1")).toBe(true);
    expect(next).toContain("  MULTICA_RELAY_KEY: k");
  });

  it("quotes a value that would otherwise break the document", () => {
    const next = upsertCredentialRef(EXISTING, "MULTICA_RELAY_KEY", "has space: and #hash");
    expect(next).toContain('  MULTICA_RELAY_KEY: "has space: and #hash"');
  });

  it("puts the entry inside the block, not after the next top-level key", () => {
    const withTail = `${EXISTING}other: 1\n`;
    const next = upsertCredentialRef(withTail, "MULTICA_RELAY_KEY", "k");
    const lines = next.split("\n");
    const refIndex = lines.indexOf("refs:");
    const entryIndex = lines.findIndex((line) => line.includes("MULTICA_RELAY_KEY:"));
    const tailIndex = lines.findIndex((line) => line.startsWith("other:"));
    expect(entryIndex).toBeGreaterThan(refIndex);
    expect(entryIndex).toBeLessThan(tailIndex);
  });
});

describe("removeCredentialRef", () => {
  it("drops only our entry", () => {
    const added = upsertCredentialRef(EXISTING, "MULTICA_RELAY_KEY", "k");
    const next = removeCredentialRef(added, "MULTICA_RELAY_KEY");
    expect(next).not.toContain("MULTICA_RELAY_KEY");
    expect(next).toContain("  DEEPSEEK_API_KEY: sk-old");
    expect(next).toContain("      token: abc");
  });

  it("is a no-op on a file without refs", () => {
    expect(removeCredentialRef("version: 1\n", "MULTICA_RELAY_KEY")).toBe("version: 1\n");
  });
});

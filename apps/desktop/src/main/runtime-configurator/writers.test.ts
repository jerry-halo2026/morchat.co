// @vitest-environment node
/**
 * Writer contract: renders only indirection, and verification actually parses.
 *
 * Two properties are load-bearing for the "company key never reaches the client"
 * rule, so they are asserted rather than trusted:
 *   1. a rendered file never contains a token-shaped literal;
 *   2. verification reads the landed document and disagrees when it is broken.
 */

import { describe, expect, it } from "vitest";

import type { FileSnapshot, PlannedFile } from "./types";
import { mergeFile } from "./index";
import { assertNoSecretLiteral } from "./writers/writer";
import { claudeCodeWriter } from "./writers/claude-code";
import { codexWriter } from "./writers/codex";
import { dshWriter } from "./writers/dsh";
import { createTestProfile, testPaths } from "./testing";

const profile = createTestProfile();
const paths = testPaths();

function planOf(writer: { plan: typeof claudeCodeWriter.plan }): readonly PlannedFile[] {
  return writer.plan({ profile, provider: profile.provider });
}

function snapshotter(files: Record<string, string | null>) {
  return (path: string): FileSnapshot => ({
    path,
    content: path in files ? (files[path] ?? null) : null,
    mode: path in files && files[path] !== null ? 0o600 : null,
  });
}

describe("assertNoSecretLiteral", () => {
  it("throws on a rendered relay token", () => {
    expect(() => assertNoSecretLiteral('key = "sk-abcdefgh12345678"')).toThrow();
  });

  it("throws on a task token", () => {
    expect(() => assertNoSecretLiteral('token = "mat_abcd1234efgh5678"')).toThrow();
  });

  it("accepts env-var names — the only thing our files may contain", () => {
    expect(() =>
      assertNoSecretLiteral('env_key = "MULTICA_RELAY_KEY"'),
    ).not.toThrow();
  });
});

describe("claude-code writer", () => {
  it("renders base URL + model + helper path, never a key", () => {
    const [file] = planOf(claudeCodeWriter);
    const parsed = JSON.parse(file.content) as Record<string, unknown>;
    const owned = parsed["morechat"] as Record<string, unknown>;
    expect(owned["env"]).toEqual({
      ANTHROPIC_BASE_URL: profile.provider.baseUrl,
      ANTHROPIC_MODEL: profile.provider.defaultModel,
    });
    expect(owned["apiKeyHelper"]).toBe(
      (profile.targets.find((target) => target.id === "claude-code")?.paths as {
        keyHelperPath: string;
      }).keyHelperPath,
    );
    expect(file.mode).toBe(0o600);
  });

  it("verifies a merged document and reports unparsable JSON", () => {
    const [file] = planOf(claudeCodeWriter);
    const good = mergeFile(file, '{"theme":"dark"}\n');
    expect(
      claudeCodeWriter.verify([file], snapshotter({ [paths.claude]: good })),
    ).toEqual({ ok: true });

    const broken = claudeCodeWriter.verify(
      [file],
      snapshotter({ [paths.claude]: "{ not json" }),
    );
    expect(broken.ok).toBe(false);
    if (broken.ok) return;
    expect(broken.failures[0]?.code).toBe("unparsable");
  });

  it("reports a drifted field by name", () => {
    const [file] = planOf(claudeCodeWriter);
    const good = mergeFile(file, null);
    const drifted = good.replace(profile.provider.defaultModel, "someone-elses-model");
    const result = claudeCodeWriter.verify(
      [file],
      snapshotter({ [paths.claude]: drifted }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toContainEqual({
      code: "field-mismatch",
      path: paths.claude,
      field: "env.ANTHROPIC_MODEL",
    });
  });

  it("reports a missing file instead of assuming it landed", () => {
    const [file] = planOf(claudeCodeWriter);
    const result = claudeCodeWriter.verify([file], snapshotter({}));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures[0]).toEqual({ code: "missing", path: paths.claude });
  });
});

describe("codex writer", () => {
  it("verifies a file the daemon has appended its own TOML to", () => {
    const [file] = planOf(codexWriter);
    const daemonTail = [
      "",
      "[sandbox_workspace_write]",
      "network_access = false",
      "",
      "[[skills.config]]",
      'path = "skill.md"',
      "enabled = true",
    ].join("\n");
    const landed = `${mergeFile(file, null)}${daemonTail}\n`;

    const result = codexWriter.verify([file], snapshotter({ [paths.codex]: landed }));
    expect(result).toEqual({ ok: true });
  });

  it("fails when the managed region was dropped", () => {
    const [file] = planOf(codexWriter);
    const result = codexWriter.verify(
      [file],
      snapshotter({ [paths.codex]: 'model = "x"\n' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures[0]).toEqual({ code: "missing", path: paths.codex });
  });

  it("fails when the whole file stops being valid TOML", () => {
    const [file] = planOf(codexWriter);
    const landed = `${mergeFile(file, null)}this is not toml\n`;
    const result = codexWriter.verify([file], snapshotter({ [paths.codex]: landed }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures[0]?.code).toBe("unparsable");
  });
});

describe("dsh writer", () => {
  it("replaces the installer's empty `[]` document instead of appending to it", () => {
    const [file] = planOf(dshWriter);
    const before = "# generated by dsh\n[]\n";
    const merged = mergeFile(file, before);

    expect(merged).not.toContain("[]");
    expect(merged).toContain("# generated by dsh");
    expect(merged).toContain("apiKeyEnv: 'MULTICA_RELAY_KEY'");

    expect(dshWriter.verify([file], snapshotter({ [paths.dsh]: merged }))).toEqual({
      ok: true,
    });
  });

  it("fails when the provider entry no longer parses as part of the document", () => {
    const [file] = planOf(dshWriter);
    const landed = `${mergeFile(file, null)}  - stray: item\n`;
    const result = dshWriter.verify([file], snapshotter({ [paths.dsh]: landed }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["unparsable", "field-mismatch"]).toContain(result.failures[0]?.code);
  });

  it("points at the route when the base URL drifted", () => {
    const [file] = planOf(dshWriter);
    const landed = mergeFile(file, null).replace(
      profile.provider.baseUrl,
      "https://evil.example/v1",
    );
    const result = dshWriter.verify([file], snapshotter({ [paths.dsh]: landed }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toContainEqual({
      code: "field-mismatch",
      path: paths.dsh,
      field: "baseURL",
    });
  });
});

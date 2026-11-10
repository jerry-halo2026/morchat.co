/**
 * Codex target — `~/.codex/config.toml` (+ `~/.codex/auth.json`, read-only).
 *
 * Minimal fields we own, inside a marker-delimited region so the rest of the
 * user's TOML survives byte-for-byte:
 *   model                          = "<default model>"
 *   model_provider                 = "morechat"
 *   [model_providers.morechat]
 *   name                           = "morechat relay"
 *   base_url                       = "<gateway root>"
 *   env_key                        = "MULTICA_RELAY_KEY"   ← name only
 *   wire_api                       = "responses"
 *
 * `env_key` is the reason Codex needs no secret on disk: Codex reads the value
 * out of the environment variable named there at request time.
 *
 * Why we write the *shared* file rather than a per-task one: the daemon seeds
 * every task's `$CODEX_HOME` by copying this exact file and re-adding its own
 * sandbox/multi-agent/memory blocks (server/internal/daemon/execenv/codex_home.go),
 * and it symlinks `auth.json` from the same shared home. Writing anything
 * per-task would be discarded on the next Prepare.
 *
 * `auth.json` is listed as a backup/verify-only path: it holds the user's
 * ChatGPT OAuth material, we never write it, but a rollback must not leave it
 * pointing at a home that no longer exists.
 */

import type {
  FileSnapshot,
  PlannedFile,
  VerifyFailure,
  VerifyResult,
} from "../types";
import { parseToml, readTomlPath } from "../toml-lite";
import {
  TOML_REGION,
  assertNoSecretLiteral,
  envNameFor,
  file,
  modeTooOpen,
  splitRegion,
  wrapRegion,
  type RuntimeTargetWriter,
  type WriterInput,
} from "./writer";

export const CODEX_PROVIDER_ID = "morechat";

export function renderCodexRegion(input: WriterInput): string {
  const { provider } = input;
  const envKey = envNameFor(provider.apiKeyRef, "MULTICA_RELAY_KEY");
  const body = [
    `model = ${tomlString(provider.defaultModel)}`,
    `model_provider = ${tomlString(CODEX_PROVIDER_ID)}`,
    "",
    `[model_providers.${CODEX_PROVIDER_ID}]`,
    `name = ${tomlString("morechat relay")}`,
    `base_url = ${tomlString(provider.baseUrl)}`,
    `env_key = ${tomlString(envKey)}`,
    `wire_api = "responses"`,
  ].join("\n");
  const rendered = wrapRegion(body);
  assertNoSecretLiteral(rendered);
  return rendered;
}

function tomlString(value: string): string {
  // TOML basic strings escape backslash and double quote; nothing else in a
  // URL or model id needs it, and over-escaping would change the value.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The values we *intended* to land, read back out of our own rendered region —
 * so verification compares parsed value to parsed value instead of trusting the
 * string we just wrote.
 */
function readPlannedCodexValues(content: string): Map<string, unknown> {
  const document = parseToml(content);
  return new Map<string, unknown>([
    ["model", readTomlPath(document, ["model"])],
    ["model_provider", readTomlPath(document, ["model_provider"])],
    [
      "base_url",
      readTomlPath(document, ["model_providers", CODEX_PROVIDER_ID, "base_url"]),
    ],
    [
      "env_key",
      readTomlPath(document, ["model_providers", CODEX_PROVIDER_ID, "env_key"]),
    ],
    [
      "wire_api",
      readTomlPath(document, ["model_providers", CODEX_PROVIDER_ID, "wire_api"]),
    ],
  ]);
}

export const codexWriter: RuntimeTargetWriter = {
  id: "codex",

  plan(input: WriterInput): readonly PlannedFile[] {
    const target = input.profile.targets.find((t) => t.id === "codex");
    if (!target) return [];
    const paths = target.paths as { configPath: string; authPath: string };
    return [
      file(
        "codex",
        paths.configPath,
        "toml",
        renderCodexRegion(input),
        {
          mode: 0o600,
          change: "patch",
          merge: "managed-region",
          managedRegion: TOML_REGION,
        },
      ),
    ];
  },

  verify(
    planned: readonly PlannedFile[],
    snapshot: (path: string) => FileSnapshot,
  ): VerifyResult {
    const failures: VerifyFailure[] = [];
    for (const plannedFile of planned) {
      const landed = snapshot(plannedFile.path);
      if (landed.content === null) {
        failures.push({ code: "missing", path: plannedFile.path });
        continue;
      }

      const region = plannedFile.managedRegion ?? TOML_REGION;
      if (splitRegion(landed.content, region) === null) {
        // Our markers are gone: whatever we wrote is not the configuration
        // Codex will read, so this counts as missing rather than "some TOML".
        failures.push({ code: "missing", path: plannedFile.path });
        continue;
      }

      // Parse the WHOLE file, not just the region: the daemon appends its own
      // `[sandbox_workspace_write]` / `[[skills.config]]` blocks, and a region
      // that parses fine inside a document that does not is still a broken
      // config for every following task.
      let actual: Record<string, unknown>;
      try {
        actual = parseToml(landed.content);
      } catch (err) {
        failures.push({
          code: "unparsable",
          path: plannedFile.path,
          detail: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      const baseUrl = readTomlPath(actual, ["model_providers", CODEX_PROVIDER_ID, "base_url"]);
      const envKey = readTomlPath(actual, ["model_providers", CODEX_PROVIDER_ID, "env_key"]);
      const wireApi = readTomlPath(actual, ["model_providers", CODEX_PROVIDER_ID, "wire_api"]);
      const checks: readonly (readonly [string, unknown, string])[] = [
        ["model", readTomlPath(actual, ["model"]), "model"],
        ["model_provider", readTomlPath(actual, ["model_provider"]), "model_provider"],
        [`model_providers.${CODEX_PROVIDER_ID}.base_url`, baseUrl, "base_url"],
        [`model_providers.${CODEX_PROVIDER_ID}.env_key`, envKey, "env_key"],
        [`model_providers.${CODEX_PROVIDER_ID}.wire_api`, wireApi, "wire_api"],
      ];
      const plannedValues = readPlannedCodexValues(plannedFile.content);
      for (const [field, landedValue, plannedKey] of checks) {
        if (landedValue !== plannedValues.get(plannedKey)) {
          failures.push({ code: "field-mismatch", path: plannedFile.path, field });
        }
      }

      if (landed.mode !== null && modeTooOpen(landed.mode, plannedFile.mode)) {
        failures.push({
          code: "mode-too-open",
          path: plannedFile.path,
          mode: landed.mode,
        });
      }
    }
    return failures.length === 0 ? { ok: true } : { ok: false, failures };
  },
};

export default codexWriter;

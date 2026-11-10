/**
 * Claude Code target — `~/.claude/settings.json`.
 *
 * Minimal fields we own (namespaced under the `morechat` key so a JSON merge
 * cannot clobber the user's own settings):
 *   morechat.env.ANTHROPIC_BASE_URL   → gateway root
 *   morechat.env.ANTHROPIC_MODEL      → default model from the plan
 *   morechat.apiKeyHelper             → absolute path to the key helper
 *
 * Why `apiKeyHelper` and not `env.ANTHROPIC_AUTH_TOKEN`: the latter requires
 * the secret *in the file*, and this file is a JSON document a user will paste
 * into a bug report. The helper keeps the file secret-free and survives token
 * rotation — it reads the current token each time Claude Code asks.
 *
 * Facts this file depends on (both verified in this repo):
 *   - the daemon reads `~/.claude/settings.json` itself
 *     (server/internal/daemon/claude_plugins.go:39), so it must stay valid JSON;
 *   - the claude backend gates usage accounting on `ANTHROPIC_BASE_URL` being
 *     present in the child env (server/pkg/agent/claude.go:497), i.e. the same
 *     knob reaches the daemon-run path through the agent's `custom_env`.
 */

import type {
  FileSnapshot,
  PlannedFile,
  VerifyFailure,
  VerifyResult,
} from "../types";
import {
  JSON_OWNED_KEY,
  assertNoSecretLiteral,
  compareScalars,
  file,
  flattenScalars,
  isRecord,
  modeTooOpen,
  type RuntimeTargetWriter,
  type WriterInput,
} from "./writer";

export interface ClaudeCodeOwnedSettings {
  readonly env: {
    readonly ANTHROPIC_BASE_URL: string;
    readonly ANTHROPIC_MODEL: string;
  };
  /** Absolute path to the helper that prints the relay token. Relay plans only. */
  readonly apiKeyHelper?: string;
}

export function renderClaudeCodeOwned(
  input: WriterInput,
  keyHelperPath: string,
): string {
  const { provider } = input;
  const owned: ClaudeCodeOwnedSettings = {
    env: {
      ANTHROPIC_BASE_URL: provider.baseUrl,
      ANTHROPIC_MODEL: provider.defaultModel,
    },
    // `upstream` plans pin only the model and leave the user's own login in
    // charge of credentials — writing a helper there would hijack it.
    ...(provider.kind === "relay" ? { apiKeyHelper: keyHelperPath } : {}),
  };
  const rendered = `${JSON.stringify({ [JSON_OWNED_KEY]: owned }, null, 2)}\n`;
  assertNoSecretLiteral(rendered);
  return rendered;
}

export const claudeCodeWriter: RuntimeTargetWriter = {
  id: "claude-code",

  plan(input: WriterInput): readonly PlannedFile[] {
    const target = input.profile.targets.find((t) => t.id === "claude-code");
    if (!target) return [];
    const paths = target.paths as {
      settingsPath: string;
      keyHelperPath: string;
    };
    return [
      file(
        "claude-code",
        paths.settingsPath,
        "json",
        renderClaudeCodeOwned(input, paths.keyHelperPath),
        { mode: 0o600, change: "patch", merge: "json-merge" },
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

      // The daemon reads this file too (claude_plugins.go), so "it parses" is
      // not a nicety: an invalid JSON body takes the Claude provider down for
      // every task on this machine.
      let actual: unknown;
      try {
        actual = JSON.parse(landed.content);
      } catch (err) {
        failures.push({
          code: "unparsable",
          path: plannedFile.path,
          detail: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      if (!isRecord(actual)) {
        failures.push({
          code: "field-mismatch",
          path: plannedFile.path,
          field: JSON_OWNED_KEY,
        });
        continue;
      }

      const plannedOwned = JSON.parse(plannedFile.content) as unknown;
      const plannedSubtree = isRecord(plannedOwned)
        ? plannedOwned[JSON_OWNED_KEY]
        : undefined;
      const actualSubtree = actual[JSON_OWNED_KEY];
      if (!isRecord(actualSubtree) || !isRecord(plannedSubtree)) {
        failures.push({
          code: "field-mismatch",
          path: plannedFile.path,
          field: JSON_OWNED_KEY,
        });
        continue;
      }

      // Field-by-field, never raw-string: the user's editor may have
      // reformatted the document around our own unchanged values.
      failures.push(
        ...compareScalars(
          flattenScalars(plannedSubtree),
          flattenScalars(actualSubtree),
          plannedFile.path,
        ),
      );

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

export default claudeCodeWriter;

/**
 * The writer contract, plus the two rendering helpers every writer shares.
 *
 * A writer is pure: `plan()` returns the files it wants on disk and never
 * touches it. That is what makes the whole configurator testable without a
 * temp dir, and what makes "never print a key" a structural property rather
 * than a code-review habit — a writer has no `SecretRef`-to-string function,
 * so it cannot render one.
 */

import type {
  FileFormat,
  ManagedRegion,
  PlannedFile,
  ProviderProfile,
  RuntimeProfile,
  SecretRef,
  TargetId,
  VerifyFailure,
  VerifyResult,
  FileSnapshot,
} from "../types";

export interface WriterInput {
  readonly profile: RuntimeProfile;
  readonly provider: ProviderProfile;
}

export interface RuntimeTargetWriter {
  readonly id: TargetId;
  /** Deterministic: same input ⇒ byte-identical output. */
  plan(input: WriterInput): readonly PlannedFile[];
  /**
   * Re-reads what actually landed and checks the fields we own. Parses the
   * real format (JSON / TOML / YAML) — a substring check would pass on a
   * commented-out line.
   */
  verify(
    planned: readonly PlannedFile[],
    snapshot: (path: string) => FileSnapshot,
  ): VerifyResult;
}

export const MANAGED_BEGIN = "# >>> morechat managed block (do not edit) >>>";
export const MANAGED_END = "# <<< morechat managed block <<<";

export const TOML_REGION: ManagedRegion = { begin: MANAGED_BEGIN, end: MANAGED_END };
export const YAML_REGION: ManagedRegion = { begin: MANAGED_BEGIN, end: MANAGED_END };

/** JSON has no comments, so our region lives under a namespaced key instead. */
export const JSON_OWNED_KEY = "morechat";

export function file(
  target: TargetId,
  path: string,
  format: FileFormat,
  content: string,
  options: {
    mode: 0o600 | 0o644;
    change: "create" | "patch";
    merge: "replace" | "json-merge" | "managed-region";
    managedRegion?: ManagedRegion;
  },
): PlannedFile {
  return {
    target,
    path,
    format,
    content,
    mode: options.mode,
    change: options.change,
    merge: options.merge,
    ...(options.managedRegion ? { managedRegion: options.managedRegion } : {}),
  };
}

/** Wraps a TOML/YAML body in the managed markers, one trailing newline. */
export function wrapRegion(body: string): string {
  const trimmed = body.replace(/\s+$/, "");
  return `${MANAGED_BEGIN}\n${trimmed}\n${MANAGED_END}\n`;
}

/** Renders the env-var NAME a target should read the relay credential from. */
export function envNameFor(
  ref: SecretRef,
  fallback: string,
): string {
  return ref.kind === "env" ? ref.name : fallback;
}

/** Small shared guard: a plan that names a variable nobody can resolve is a bug. */
export function assertNoSecretLiteral(content: string): void {
  // Cheap, deliberate: writers only ever emit names. If this trips, a writer
  // interpolated a key and the whole red-line story is void.
  if (/\bsk-[A-Za-z0-9_-]{8,}|\bmat_[A-Za-z0-9]{8,}|\bmul_[A-Za-z0-9]{8,}/.test(content)) {
    throw new Error("runtime-configurator: rendered file contains a token literal");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a landed file is readable by anyone but its owner.
 *
 * Deliberately a property check (`group`/`other` bits set), not equality with the
 * requested mode: a file that ends up 0640 because of the user's umask is still
 * a leak, while 0600 with the setuid bit cleared is fine. Windows has no POSIX
 * mode — `chmod` there only toggles the read-only flag — so the check is a no-op
 * rather than a permanent false alarm in the desktop's primary dev platform.
 */
export function modeTooOpen(
  actual: number,
  expected: 0o600 | 0o644,
  platform: string = process.platform,
): boolean {
  if (platform === "win32") return false;
  const forbidden = expected === 0o600 ? 0o077 : 0o022;
  return (actual & forbidden) !== 0;
}

/** The three slices of a managed-region file; `null` when the markers are gone. */
export function splitRegion(
  content: string,
  region: ManagedRegion,
): { readonly before: string; readonly body: string; readonly after: string } | null {
  const begin = content.indexOf(region.begin);
  const end = content.indexOf(region.end);
  if (begin === -1 || end === -1 || end < begin) return null;
  return {
    before: content.slice(0, begin),
    body: content.slice(begin + region.begin.length, end),
    after: content.slice(end + region.end.length),
  };
}

/**
 * Flattens a value into `dotted.path` → scalar, so two renderings of the same
 * subtree can be compared field by field and a mismatch can name the exact
 * field instead of "the file differs".
 */
export function flattenScalars(
  value: unknown,
  prefix = "",
  out = new Map<string, string>(),
): Map<string, string> {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenScalars(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenScalars(child, prefix.length === 0 ? key : `${prefix}.${key}`, out);
    }
    return out;
  }
  out.set(prefix, value === null ? "null" : String(value));
  return out;
}

/**
 * Compares every field we planned against what the file actually holds, in the
 * direction that matters: a planned key that is missing or different fails
 * verification; keys we never planned are left alone (the user owns the rest of
 * the file, and a future version of us may add more).
 */
export function compareScalars(
  planned: ReadonlyMap<string, string>,
  actual: ReadonlyMap<string, string>,
  path: string,
): VerifyFailure[] {
  const failures: VerifyFailure[] = [];
  for (const [field, expected] of planned) {
    if (actual.get(field) !== expected) {
      failures.push({ code: "field-mismatch", path, field });
    }
  }
  return failures;
}

export type { FileSnapshot, PlannedFile, VerifyResult };

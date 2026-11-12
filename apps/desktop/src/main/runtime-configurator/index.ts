/**
 * Runtime Configurator — orchestration.
 *
 * Shape of the operation, and the only shape it is allowed to have:
 *
 *   credential  →  plan  →  backup  →  write  →  verify  →  (rollback on failure)
 *
 * `plan` is pure and deterministic (writers only). Every step after it goes
 * through injected dependencies, which is why this file imports no `fs`: the
 * concrete adapter that touches disk is `fs.ts`, and it is the only module in
 * the feature that does.
 *
 * Invariants:
 *   0. The credential self-check runs before anything is written. A company key
 *      the gateway rejects (401/402/403/429/timeout) is retried exactly once
 *      with the employee's personal key; if both fail the apply throws a
 *      readable `CredentialUnavailableError` with **zero** bytes on disk. Every
 *      run records `credential_source` so "company or personal" stays answerable
 *      afterwards — personal usage must not be billed to the company.
 *   1. Nothing is written before a byte-exact backup of every touched path
 *      exists. A failed backup aborts the whole apply.
 *   2. Writes are idempotent: a plan whose merged output equals the snapshot is
 *      skipped, so a re-apply after a crash is a no-op instead of a new backup.
 *   3. Verification re-reads what actually landed and parses it. If it fails,
 *      every path written in this apply is restored from the backup, including
 *      files that verified fine — a half-configured profile is worse than the
 *      old one.
 *   4. No secret ever reaches the logger: log entries carry a path and an
 *      8-character content hash, never content, and never a credential value.
 */

import type {
  ApplyFailure,
  ApplyOutcome,
  BackupRecord,
  CredentialAttempt,
  CredentialSource,
  FileSnapshot,
  PlannedFile,
  RunRecord,
  RuntimeProfile,
  VerifyFailure,
  VerifyResult,
} from "./types";
import type { BackupStore, ConfiguratorFs, ConfiguratorLogger } from "./ports";
import {
  CredentialUnavailableError,
  NoCredentialError,
  describeCredentials,
  readCredentialValue,
  resolveCredential,
  type CredentialStatusSummary,
  type ResolvedCredential,
} from "./credential";
import type { Keychain } from "./keychain";
import { isDegradable, type CredentialProbe } from "./probe";
import { claudeCodeWriter } from "./writers/claude-code";
import { codexWriter } from "./writers/codex";
import type { RuntimeTargetWriter } from "./writers/writer";

export type { BackupStore, ConfiguratorFs, ConfiguratorLogger } from "./ports";
export {
  CredentialUnavailableError,
  NoCredentialError,
} from "./credential";

export const WRITERS: readonly RuntimeTargetWriter[] = [
  claudeCodeWriter,
  codexWriter,
];

export interface ConfiguratorDeps {
  readonly fs: ConfiguratorFs;
  readonly backup: BackupStore;
  /** Stable content digest (sha256 hex). Used for idempotence + log fields. */
  readonly hash: (content: string) => string;
  readonly newApplyId: () => string;
  readonly now: () => Date;
  readonly logger: ConfiguratorLogger;
  /**
   * Account the keychain entries belong to. Without it the configurator runs
   * "credential-free" (headless tests, a preview) and writes nothing secret —
   * which is correct, because there is no key to reference.
   */
  readonly userId?: string;
  readonly keychain?: Keychain;
  /**
   * One authenticated request against the gateway. Omitted in tests and in
   * environments without network access; when omitted no self-check is made and
   * the credential is trusted as resolved.
   */
  readonly probe?: CredentialProbe;
  /** Receives every run record (the `credential_source` ledger). */
  readonly onRecord?: (record: RunRecord) => void;
}

export interface RuntimeConfigurator {
  /** Pure. No io, no writes — safe to call from a UI preview. */
  plan(profile: RuntimeProfile): readonly PlannedFile[];
  apply(profile: RuntimeProfile): Promise<ApplyOutcome>;
  /** Manual revert of a completed apply (support / "restore my settings"). */
  revert(record: BackupRecord): Promise<VerifyResult>;
  /**
   * Which credentials are stored for this account right now, for Settings to
   * render. Read-only, no network, no self-check — see `describeCredentials`.
   * Without a `userId`/`keychain` (headless, preview) every slot reads empty.
   */
  credentialStatus(): Promise<CredentialStatusSummary>;
}

interface CredentialStage {
  readonly credential?: ResolvedCredential;
  readonly attempts: readonly CredentialAttempt[];
  readonly retried: boolean;
}

export function createRuntimeConfigurator(
  deps: ConfiguratorDeps,
): RuntimeConfigurator {
  const { fs, backup, logger } = deps;

  function plan(profile: RuntimeProfile): readonly PlannedFile[] {
    const selected = new Set(profile.targets.map((t) => t.id));
    const planned: PlannedFile[] = [];
    for (const writer of WRITERS) {
      if (!selected.has(writer.id)) continue;
      planned.push(...writer.plan({ profile, provider: profile.provider }));
    }
    return planned;
  }

  function record(entry: RunRecord): void {
    logger.info("runtime-configurator: run record", {
      apply_id: entry.applyId,
      // The one field this feature exists to keep answerable.
      credential_source: entry.credentialSource,
      credential_retried: entry.credentialRetried,
      outcome: entry.outcome,
      ...(entry.failureCode ? { failure_code: entry.failureCode } : {}),
      files: entry.paths.length,
    });
    try {
      deps.onRecord?.(entry);
    } catch (err) {
      // Reporting must never fail an apply that already succeeded.
      logger.warn("runtime-configurator: run record sink failed", {
        error: describe(err),
      });
    }
  }

  /**
   * Resolve + self-check the credential for this run.
   *
   * Company first. A *degradable* company failure (401/402/403/429/timeout)
   * moves to the personal key exactly once; a non-degradable one (5xx, DNS)
   * stops immediately, because switching the employee onto their own key while
   * the gateway is merely down is how someone silently pays for company
   * infrastructure. Both failing throws, with nothing written.
   */
  async function credentialStage(profile: RuntimeProfile): Promise<CredentialStage> {
    const { keychain, userId } = deps;
    const probe = deps.probe;
    if (!keychain || !userId) {
      return { attempts: [], retried: false };
    }

    const attempts: CredentialAttempt[] = [];

    const attempt = async (
      source: CredentialSource,
    ): Promise<{
      readonly credential?: ResolvedCredential;
      readonly stop: boolean;
    }> => {
      const context = { keychain, userId, logger };
      let resolved: ResolvedCredential;
      try {
        resolved = await resolveCredential(profile, context, { only: source });
      } catch (err) {
        if (err instanceof NoCredentialError) {
          attempts.push(...err.attempts);
          return { stop: false };
        }
        throw err;
      }

      if (!probe) {
        attempts.push({ source, ok: true });
        return { credential: resolved, stop: false };
      }

      const result = await probe({
        credential: resolved,
        profile,
        readKey: () => readCredentialValue(keychain, resolved),
      });

      if (result.ok) {
        attempts.push({ source, ok: true, status: result.status });
        return { credential: resolved, stop: false };
      }

      attempts.push({
        source,
        ok: false,
        reason: result.reason,
        ...(result.status !== undefined ? { status: result.status } : {}),
      });
      logger.warn("runtime-configurator: credential self-check failed", {
        credential_source: source,
        reason: result.reason,
        ...(result.status !== undefined ? { status: result.status } : {}),
      });
      return { stop: !isDegradable(result) };
    };

    const company = await attempt("company");
    if (company.credential) {
      return { credential: company.credential, attempts, retried: false };
    }
    if (company.stop) throw new CredentialUnavailableError(attempts);

    // The one retry the design allows: personal instead of company.
    logger.warn("runtime-configurator: falling back to personal key", {
      reason: attempts.at(-1)?.reason ?? "unknown",
    });
    const personal = await attempt("personal");
    if (personal.credential) {
      return { credential: personal.credential, attempts, retried: true };
    }
    throw new CredentialUnavailableError(attempts);
  }

  /**
   * `credentialStage` plus the run record a failure owes us. Rethrows on
   * purpose: a credential problem is not a state of the disk, so it must not be
   * reported as a partial apply — nothing was written.
   */
  async function credentialStageOrThrow(
    profile: RuntimeProfile,
    applyId: string,
    createdAt: string,
  ): Promise<CredentialStage> {
    try {
      return await credentialStage(profile);
    } catch (err) {
      const attempts =
        err instanceof CredentialUnavailableError || err instanceof NoCredentialError
          ? err.attempts
          : [];
      record({
        applyId,
        profileId: profile.profileId,
        providerId: profile.provider.id,
        credentialSource: "none",
        credentialRetried: attempts.length > 1,
        credentialAttempts: attempts,
        outcome: "failed",
        failureCode: err instanceof Error && "code" in err ? String(err.code) : "credential-error",
        createdAt,
        paths: [],
      });
      throw err;
    }
  }

  /**
   * Reads the current state of every path.
   *
   * `tolerateReadErrors` exists because the two callers need opposite behaviour:
   * the pre-write snapshot must *abort* when a path cannot be read (a backup that
   * silently records "did not exist" would delete the user's file on rollback),
   * while the post-write verification may treat an unreadable file as "not
   * there", which correctly fails verification and rolls everything back.
   */
  async function snapshot(
    paths: readonly string[],
    options: { readonly tolerateReadErrors?: boolean } = {},
  ): Promise<readonly FileSnapshot[]> {
    const unique = [...new Set(paths)];
    const out: FileSnapshot[] = [];
    for (const path of unique) {
      const stat = await fs.stat(path);
      let content: string | null = null;
      if (stat) {
        try {
          content = await fs.read(path);
        } catch (err) {
          if (!options.tolerateReadErrors) throw err;
          content = null;
        }
      }
      out.push({ path, content, mode: stat ? stat.mode : null });
    }
    return out;
  }

  async function apply(profile: RuntimeProfile): Promise<ApplyOutcome> {
    const applyId = deps.newApplyId();
    const createdAt = deps.now().toISOString();
    const planned = plan(profile);

    if (planned.length === 0) {
      record({
        applyId,
        profileId: profile.profileId,
        providerId: profile.provider.id,
        credentialSource: "none",
        credentialRetried: false,
        credentialAttempts: [],
        outcome: "failed",
        failureCode: "plan-empty",
        createdAt,
        paths: [],
      });
      return { ok: false, failure: { code: "plan-empty" }, rolledBack: true };
    }

    // ---- credential self-check (no disk touched yet) ----------------------
    const stage = await credentialStageOrThrow(profile, applyId, createdAt);
    const credentialSource: CredentialSource | "none" =
      stage.credential?.source ?? "none";

    // ---- plan application (pure, still no io) -----------------------------
    let before: readonly FileSnapshot[];
    try {
      before = await snapshot(planned.map((p) => p.path));
    } catch (err) {
      // Without a trustworthy pre-state there is no rollback material, so the
      // whole apply aborts with zero writes rather than guessing "absent".
      return failed({
        applyId,
        profile,
        createdAt,
        credentialSource,
        stage,
        failure: { code: "backup-failed", detail: describe(err) },
        paths: planned.map((p) => p.path),
      });
    }
    const next: { readonly file: PlannedFile; readonly content: string }[] = [];
    for (const plannedFile of planned) {
      const prior = before.find((s) => s.path === plannedFile.path);
      let merged: string;
      try {
        merged = mergeFile(plannedFile, prior?.content ?? null);
      } catch (err) {
        return failed({
          applyId,
          profile,
          createdAt,
          credentialSource,
          stage,
          failure: { code: "merge-failed", path: plannedFile.path, detail: describe(err) },
          paths: planned.map((p) => p.path),
        });
      }
      if (merged === prior?.content) continue; // idempotent no-op
      next.push({ file: plannedFile, content: merged });
    }

    if (next.length === 0) {
      record({
        applyId,
        profileId: profile.profileId,
        providerId: profile.provider.id,
        credentialSource,
        credentialRetried: stage.retried,
        credentialAttempts: stage.attempts,
        outcome: "noop",
        createdAt,
        paths: planned.map((p) => p.path),
      });
      logger.info("runtime-configurator: already configured", {
        profile_id: profile.profileId,
      });
      return { ok: true, applyId, changed: [], ...credentialField(credentialSource) };
    }

    // ---- backup -----------------------------------------------------------
    let backupRecord: BackupRecord;
    try {
      backupRecord = await backup.create({
        applyId,
        profileId: profile.profileId,
        createdAt,
        snapshots: before,
      });
    } catch (err) {
      // No backup ⇒ no writes. This is the one branch that must never soften.
      return failed({
        applyId,
        profile,
        createdAt,
        credentialSource,
        stage,
        failure: { code: "backup-failed", detail: describe(err) },
        paths: planned.map((p) => p.path),
      });
    }

    // ---- write ------------------------------------------------------------
    const written: string[] = [];
    let currentPath = next[0]?.file.path ?? "";
    try {
      for (const { file, content } of next) {
        currentPath = file.path;
        await fs.mkdirp(parentDir(file.path));
        await fs.writeFileAtomic(file.path, content, file.mode);
        written.push(file.path);
        logger.info("runtime-configurator: wrote", {
          target: file.target,
          path: file.path,
          content_sha256_8: deps.hash(content).slice(0, 8),
        });
      }
    } catch (err) {
      return rollback(backupRecord, {
        applyId,
        profile,
        createdAt,
        credentialSource,
        stage,
        failure: {
          code: "write-failed",
          path: currentPath,
          detail: describe(err),
        },
        paths: written,
      });
    }

    // ---- verify (against what is on disk now) -----------------------------
    let verify: VerifyResult;
    try {
      verify = await verifyLanded(planned);
    } catch (err) {
      // Reading back failed outright (permissions, a directory in the way). That
      // is a verification failure, and it rolls back like any other.
      verify = {
        ok: false,
        failures: [{ code: "missing", path: currentPath }],
      };
      logger.warn("runtime-configurator: verify could not read back", {
        error: describe(err),
      });
    }
    // A value we could not land in a file we do not own is not a reason to throw
    // away the work that did land: an existing Codex (or Claude) configuration
    // keeps its own model settings, and taking the whole profile down because one
    // field stayed foreign would leave the user with nothing configured at all.
    // Structural problems (a missing region, an unparsable document) still fail.
    if (!verify.ok) {
      const foreign = verify.failures.filter((failure) => failure.code === "field-mismatch");
      const blocking = verify.failures.filter((failure) => failure.code !== "field-mismatch");
      if (blocking.length === 0 && foreign.length > 0) {
        logger.warn("runtime-configurator: kept foreign values in a shared file", {
          fields: foreign.map((failure) => ({ path: failure.path, field: failure.field })),
        });
        verify = { ok: true };
      }
    }
    if (!verify.ok) {
      logger.warn("runtime-configurator: verify failed, rolling back", {
        failures: verify.failures.length,
        detail: verify.failures.map((f) => ({ code: f.code, path: f.path })),
      });
      return rollback(backupRecord, {
        applyId,
        profile,
        createdAt,
        credentialSource,
        stage,
        failure: { code: "verify-failed", failures: verify.failures },
        paths: written,
      });
    }

    record({
      applyId,
      profileId: profile.profileId,
      providerId: profile.provider.id,
      credentialSource,
      credentialRetried: stage.retried,
      credentialAttempts: stage.attempts,
      outcome: "applied",
      createdAt,
      paths: written,
    });
    return { ok: true, applyId, changed: written, ...credentialField(credentialSource) };
  }

  function credentialField(
    source: CredentialSource | "none",
  ): { credentialSource?: CredentialSource } {
    return source === "none" ? {} : { credentialSource: source };
  }

  interface FailureContext {
    readonly applyId: string;
    readonly profile: RuntimeProfile;
    readonly createdAt: string;
    readonly credentialSource: CredentialSource | "none";
    readonly stage: CredentialStage;
    readonly failure: ApplyFailure;
    readonly paths: readonly string[];
  }

  /** A failure that happened before anything reached the disk. */
  function failed(context: FailureContext): ApplyOutcome {
    record({
      applyId: context.applyId,
      profileId: context.profile.profileId,
      providerId: context.profile.provider.id,
      credentialSource: context.credentialSource,
      credentialRetried: context.stage.retried,
      credentialAttempts: context.stage.attempts,
      outcome: "failed",
      failureCode: context.failure.code,
      createdAt: context.createdAt,
      paths: context.paths,
    });
    return { ok: false, failure: context.failure, rolledBack: true };
  }

  /**
   * Verification reads the files back through the adapter and lets each writer
   * parse them. Verifying the *intent* we just rendered would have made the
   * whole step decorative: it can never disagree with what we wrote.
   */
  async function verifyLanded(
    planned: readonly PlannedFile[],
  ): Promise<VerifyResult> {
    const observed = await snapshot(
      planned.map((p) => p.path),
      { tolerateReadErrors: true },
    );
    const byPath = new Map(observed.map((s) => [s.path, s] as const));
    const read = (path: string): FileSnapshot =>
      byPath.get(path) ?? { path, content: null, mode: null };

    const failures: VerifyFailure[] = [];
    for (const writer of WRITERS) {
      const mine = planned.filter((p) => p.target === writer.id);
      if (mine.length === 0) continue;
      const result = writer.verify(mine, read);
      if (!result.ok) failures.push(...result.failures);
    }
    return failures.length === 0 ? { ok: true } : { ok: false, failures };
  }

  async function rollback(
    backupRecord: BackupRecord,
    context: FailureContext,
  ): Promise<ApplyOutcome> {
    try {
      await backup.restore(backupRecord);
      logger.warn("runtime-configurator: rolled back", {
        apply_id: backupRecord.applyId,
        restored: context.paths.length,
      });
      record({
        applyId: context.applyId,
        profileId: context.profile.profileId,
        providerId: context.profile.provider.id,
        credentialSource: context.credentialSource,
        credentialRetried: context.stage.retried,
        credentialAttempts: context.stage.attempts,
        outcome: "rolled-back",
        failureCode: context.failure.code,
        createdAt: context.createdAt,
        paths: context.paths,
      });
      return { ok: false, failure: context.failure, rolledBack: true };
    } catch (err) {
      logger.warn("runtime-configurator: rollback FAILED", {
        apply_id: backupRecord.applyId,
        error: describe(err),
      });
      return {
        ok: false,
        failure: {
          code: "rollback-failed",
          path: context.paths.at(-1) ?? "",
          detail: describe(err),
        },
        rolledBack: false,
      };
    }
  }

  /**
   * Restore a previous state and prove it: every path is re-read and compared
   * against the sha256 recorded in the manifest, so "revert" cannot report
   * success for a file that came back different.
   */
  async function revert(backupRecord: BackupRecord): Promise<VerifyResult> {
    await backup.restore(backupRecord);
    const failures: VerifyFailure[] = [];
    for (const entry of backupRecord.entries) {
      const content = await fs.read(entry.path);
      if (!entry.existed) {
        if (content !== null) {
          failures.push({
            code: "field-mismatch",
            path: entry.path,
            field: "expected-absent",
          });
        }
        continue;
      }
      if (content === null) {
        failures.push({ code: "missing", path: entry.path });
        continue;
      }
      if (entry.sha256 !== null && deps.hash(content) !== entry.sha256) {
        failures.push({ code: "field-mismatch", path: entry.path, field: "sha256" });
      }
    }
    return failures.length === 0 ? { ok: true } : { ok: false, failures };
  }

  /**
   * `credentialStatus` is the Settings readback: which of the two credentials
   * exist for this account. It deliberately shares `describeCredentials` with
   * the bootstrap's IPC answer, so the page and the pushed status can never
   * disagree about what is stored. With no account there is nothing to report,
   * and an empty summary is the honest answer rather than an error.
   */
  async function credentialStatus(): Promise<CredentialStatusSummary> {
    const { keychain, userId } = deps;
    if (!keychain || !userId) {
      return {
        keychainAvailable: keychain?.available ?? false,
        company: { configured: false, suffix: null },
        personal: { configured: false, suffix: null },
        effective: null,
      };
    }
    return describeCredentials(keychain, userId);
  }

  return { plan, apply, revert, credentialStatus };
}

/**
 * Applies a plan to the content already on disk.
 *
 * `replace`        — the file is ours; the plan wins.
 * `json-merge`     — deep-merge the planned subtree into the parsed document,
 *                    planned keys winning. An unparsable user file is replaced
 *                    rather than merged: half-parsing someone's edited JSON is
 *                    how key ordering and unrelated settings get destroyed.
 * `managed-region` — replace only the bytes between the markers; everything
 *                    outside them is preserved verbatim, and the region is
 *                    appended when absent. A document that is nothing but an
 *                    empty `[]` (the shape DSH's installer leaves behind) is
 *                    replaced by our region instead of being appended to,
 *                    because `[]` followed by a block sequence is not YAML.
 */
export function mergeFile(file: PlannedFile, prior: string | null): string {
  if (prior === null || file.merge === "replace") return file.content;
  if (file.merge === "json-merge") {
    let existing: unknown;
    try {
      existing = JSON.parse(prior);
    } catch {
      return file.content;
    }
    let owned: unknown;
    try {
      owned = JSON.parse(file.content);
    } catch {
      return file.content;
    }
    if (!isRecord(existing) || !isRecord(owned)) return file.content;
    return `${JSON.stringify(deepMerge(existing, owned), null, 2)}\n`;
  }

  const region = file.managedRegion;
  if (!region) return file.content;
  const begin = prior.indexOf(region.begin);
  const end = prior.indexOf(region.end);
  if (begin === -1 || end === -1 || end < begin) {
    const base = stripEmptyDocument(prior);
    const sep = base.endsWith("\n") || base.length === 0 ? "" : "\n";
    return `${base}${sep}${file.content}`;
  }
  const head = prior.slice(0, begin);
  const tail = prior.slice(end + region.end.length).replace(/^\n/, "");
  return `${head}${file.content}${tail.length > 0 ? tail : ""}`;
}

/**
 * Drops a `[]` (or `{}`) that is the entire document, keeping its comments —
 * the sequence our region appends *is* the document afterwards.
 */
function stripEmptyDocument(prior: string): string {
  const lines = prior.split("\n");
  const contentLines = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("#");
  });
  if (contentLines.length !== 1) return prior;
  const only = contentLines[0].trim();
  if (only !== "[]" && only !== "{}") return prior;
  const kept = lines.filter((line) => line.trim() !== only);
  const joined = kept.join("\n");
  return joined.replace(/\s+$/, "\n");
}

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = out[key];
    if (isRecord(current) && isRecord(value)) {
      out[key] = deepMerge(current, value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parentDir(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? path : path.slice(0, index);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

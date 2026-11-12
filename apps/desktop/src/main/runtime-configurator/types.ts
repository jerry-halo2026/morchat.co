/**
 * Runtime Configurator — shared vocabulary.
 *
 * The whole point of this module is that an employee installs the desktop app,
 * signs in, and every local coding CLI (Claude Code, Codex, DSH) is already
 * pointed at the company model gateway with a *personal, revocable, quota'd*
 * relay credential. Nothing here ever carries the upstream provider key: see
 * `SecretRef` below, which can only name a secret, never contain one.
 *
 * This file is types only. No fs, no electron, no network — so it is safe to
 * import from anything, including tests that run in jsdom.
 */

/** A local CLI whose provider configuration we own. */
export type TargetId = "claude-code" | "codex";

export const TARGET_IDS: readonly TargetId[] = ["claude-code", "codex"];

/**
 * How the target reaches a model.
 *
 * - `relay`    — through the company gateway (new-api). The credential is a
 *                per-user relay token, minted server-side, quota- and
 *                model-limited, revocable. This is the default.
 * - `upstream` — the target is left on the user's own provider account
 *                (ChatGPT sub, personal key). Used when the gateway is
 *                unreachable at sign-in time; usage then lands in
 *                `task_usage` as usual but can never be attributed to the
 *                gateway's ledger. See RUNTIME-CONFIGURATOR.md §3.6.
 */
export type ProviderKind = "relay" | "upstream";

/**
 * A reference to a secret. Deliberately NOT a string.
 *
 * This is the type-level half of the "company key never reaches the client"
 * rule: writers receive `SecretRef`, so no writer *can* embed a key even by
 * accident, and `content` on a `PlannedFile` is a plain string that only ever
 * contains the *name* of an environment variable. A unit test asserts that no
 * rendered file contains a token-shaped substring.
 */
export type SecretRef =
  | { readonly kind: "env"; readonly name: string }
  | { readonly kind: "keychain"; readonly service: string; readonly account: string };

/** One provider entry, i.e. one cc-switch style "provider profile". */
export interface ProviderProfile {
  /** Stable id used in file keys and managed-region markers, e.g. `morechat-relay`. */
  readonly id: string;
  readonly kind: ProviderKind;
  /** Human label shown in the UI only. */
  readonly label: string;
  /** Gateway root, e.g. `https://relay.morechat.co/v1`. Never includes a key. */
  readonly baseUrl: string;
  /** Where the *user* credential lives. Always an indirection. */
  readonly apiKeyRef: SecretRef;
  /** Model allowlist mirrored from the server plan; display + validation only. */
  readonly models: readonly string[];
  readonly defaultModel: string;
}

/** Per-target filesystem coordinates, resolved by the caller (homedir, app paths). */
export interface TargetPaths {
  readonly "claude-code": {
    /** `~/.claude/settings.json` */
    readonly settingsPath: string;
    /** Helper executable the key is read from, e.g. `~/.multica/bin/relay-key`. */
    readonly keyHelperPath: string;
  };
  readonly codex: {
    /** `~/.codex/config.toml` — the shared file the daemon seeds per-task homes from. */
    readonly configPath: string;
    /** `~/.codex/auth.json` — referenced for backup/verify only; never rewritten. */
    readonly authPath: string;
  };

}

export type TargetSelection = {
  readonly [K in TargetId]: {
    readonly id: K;
    readonly paths: TargetPaths[K];
  };
}[TargetId];

/** The complete desired state. Idempotent: same profile ⇒ same rendered files. */
export interface RuntimeProfile {
  readonly schemaVersion: 1;
  /** Stable per-user-per-host id; used as the backup root and apply-log key. */
  readonly profileId: string;
  readonly provider: ProviderProfile;
  readonly targets: readonly TargetSelection[];
}

export type FileFormat = "json" | "toml" | "yaml";

/**
 * Markers delimiting the region of a user-owned file we are allowed to rewrite.
 * Files we create outright (no pre-existing content) use no markers and are
 * removed wholesale on revert.
 */
export interface ManagedRegion {
  readonly begin: string;
  readonly end: string;
}

/**
 * One file we intend to have on disk. Produced by a writer, consumed by the
 * orchestrator; nothing here touches the filesystem.
 */
export interface PlannedFile {
  readonly target: TargetId;
  readonly path: string;
  readonly format: FileFormat;
  /** 0o600 for anything that could ever hold a credential; 0o644 otherwise. */
  readonly mode: 0o600 | 0o644;
  readonly managedRegion?: ManagedRegion;
  /** Rendered content. Contains env-var NAMES, never values. */
  readonly content: string;
  /** `create` = file is ours; `patch` = merge into a user-owned file. */
  readonly change: "create" | "patch";
  /**
   * How `content` lands in a pre-existing file.
   * - `replace`        — the file is ours, write it whole.
   * - `json-merge`     — `content` is the owned subtree; deep-merge by key.
   * - `managed-region` — `content` is the body between `managedRegion` markers.
   */
  readonly merge: "replace" | "json-merge" | "managed-region";
}

/** A file as it exists right now. `content: null` means "absent". */
export interface FileSnapshot {
  readonly path: string;
  readonly content: string | null;
  readonly mode: number | null;
}

export type VerifyFailure =
  | { readonly code: "missing"; readonly path: string }
  | { readonly code: "unparsable"; readonly path: string; readonly detail: string }
  | { readonly code: "field-mismatch"; readonly path: string; readonly field: string }
  | { readonly code: "mode-too-open"; readonly path: string; readonly mode: number };

export type VerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failures: readonly VerifyFailure[] };

/** Rollback material: the byte-exact prior state of every path we touched. */
export interface BackupRecord {
  readonly applyId: string;
  readonly profileId: string;
  readonly createdAt: string;
  readonly root: string;
  readonly entries: readonly BackupEntry[];
  /** sha256 of the manifest-free entry list, so a restore can prove it read what it wrote. */
  readonly entriesSha256?: string;
}

export interface BackupEntry {
  readonly path: string;
  /** Path under `root` holding the prior content; absent when the file did not exist. */
  readonly backupPath?: string;
  readonly existed: boolean;
  readonly priorMode: number | null;
  /**
   * sha256 of the prior bytes (`null` when the file did not exist). The manifest
   * records it so `revert()` can verify byte-exact restore without ever logging
   * the content — a hash is the only thing about a user file we are willing to
   * put in a log line.
   */
  readonly sha256: string | null;
  /** Byte length of the prior content; `0` when absent. */
  readonly bytes: number;
}

/**
 * Which credential the run used.
 *
 * - `company`  — the per-user gateway key minted by the server (T1). Usage is
 *                attributed to the company ledger.
 * - `personal` — a key the employee typed into Settings themselves, stored in
 *                the OS keychain and labelled "this device only". Usage must NOT
 *                be billed to the company, so every run record carries this
 *                field for the caller to report from.
 */
export type CredentialSource = "company" | "personal";

/**
 * Outcome of one credential + self-check attempt during `apply`.
 *
 * Carries no key material — only which source was tried and, on failure, a
 * coarse reason that maps 1:1 onto a user-facing hint.
 */
export interface CredentialAttempt {
  readonly source: CredentialSource;
  readonly ok: boolean;
  /** HTTP status the self-check saw, when one was made. */
  readonly status?: number;
  /**
   * `no-credential` = nothing stored; `unavailable` = keychain unusable;
   * `unauthorized`/`payment-required`/`forbidden`/`rate-limited` are the
   * degradable gateway answers; `timeout` likewise; `server`/`network`/
   * `unknown` are not.
   */
  readonly reason?: string;
}

export type ApplyFailure =
  | { readonly code: "plan-empty" }
  | { readonly code: "backup-failed"; readonly detail: string }
  | { readonly code: "merge-failed"; readonly path: string; readonly detail: string }
  | { readonly code: "write-failed"; readonly path: string; readonly detail: string }
  | { readonly code: "verify-failed"; readonly failures: readonly VerifyFailure[] }
  | { readonly code: "rollback-failed"; readonly path: string; readonly detail: string }
  | {
      readonly code: "credential-unavailable";
      readonly attempts: readonly CredentialAttempt[];
    };

export type ApplyOutcome =
  | {
      readonly ok: true;
      readonly applyId: string;
      readonly changed: readonly string[];
      /** Present whenever an account was supplied and a credential resolved. */
      readonly credentialSource?: CredentialSource;
    }
  | { readonly ok: false; readonly failure: ApplyFailure; readonly rolledBack: boolean };

/**
 * One line of the apply run log. This is the record that carries
 * `credential_source`, because "was this month's spend company or personal" is
 * a question about runs, not about files. Deliberately content-free.
 */
export interface RunRecord {
  readonly applyId: string;
  readonly profileId: string;
  readonly providerId: string;
  readonly credentialSource: CredentialSource | "none";
  /** True when the company self-check failed and `personal` was tried second. */
  readonly credentialRetried: boolean;
  readonly credentialAttempts: readonly CredentialAttempt[];
  readonly outcome: "applied" | "noop" | "rolled-back" | "failed";
  readonly failureCode?: string;
  readonly createdAt: string;
  /** Paths only — never content, never hashes of content. */
  readonly paths: readonly string[];
}

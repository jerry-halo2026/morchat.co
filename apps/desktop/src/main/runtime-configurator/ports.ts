/**
 * The injected surfaces the orchestrator talks to.
 *
 * Kept in their own module (rather than in `index.ts`) so the concrete
 * adapters — `fs.ts` for disk, `credential.ts`/`keychain.ts` for secrets — can
 * implement them without importing the orchestrator that imports them.
 *
 * Every method here exists because a rollback depends on it. Nothing else is
 * allowed in: `ConfiguratorFs` is the *only* way the configurator reaches the
 * filesystem, and it has no "append", no "truncate", no "list" and no "log
 * content" — the shapes that would let a half-written config survive.
 */

export interface ConfiguratorLogger {
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export interface ConfiguratorFs {
  /** `null` = absent. */
  stat(path: string): Promise<{ readonly mode: number } | null>;
  /** `null` = absent. */
  read(path: string): Promise<string | null>;
  /**
   * Contract, not a suggestion: write a sibling temp file, fsync, chmod, then
   * rename over the target. A crash mid-write must leave either the old bytes
   * or the new bytes, never a truncated config the daemon will then parse.
   */
  writeFileAtomic(
    path: string,
    content: string,
    mode: 0o600 | 0o644,
  ): Promise<void>;
  /**
   * Restores a permission that the original file had before we touched it.
   * Separate from `writeFileAtomic` because restoring a 0o664 file must not
   * widen the write path's own 0600-first policy.
   */
  chmod(path: string, mode: number): Promise<void>;
  remove(path: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
}

export interface BackupStore {
  /** Copies every non-null snapshot under a fresh timestamped `root`. */
  create(input: {
    readonly applyId: string;
    readonly profileId: string;
    readonly createdAt: string;
    readonly snapshots: readonly import("./types").FileSnapshot[];
  }): Promise<import("./types").BackupRecord>;
  /** Restores byte-exact prior state: re-creates, rewrites, or deletes. */
  restore(record: import("./types").BackupRecord): Promise<void>;
}

/**
 * The only module in this feature that is allowed to touch the disk.
 *
 * Two collaborators live here:
 *
 *   `createNodeConfiguratorFs()` — `ConfiguratorFs`, i.e. atomic writes,
 *   permission bits, and nothing else. It never logs, and in particular never
 *   logs content: the file bytes inside this module are either a user's config
 *   (which may embed their own provider keys) or the byte-exact backup of it.
 *
 *   `createBackupStore()` — the timestampped backup directory plus a manifest
 *   carrying a sha256 per touched path. The manifest is what makes the
 *   rollback *provable*: a restore first checks the bytes it is about to put
 *   back against the hash it recorded before the write, so "rolled back" cannot
 *   silently mean "wrote whatever was lying around".
 *
 * Design rules encoded here (see docs/plans/RUNTIME-CONFIGURATOR.md §2.1):
 *   1. never `truncate + write`, always `temp → fsync → rename`;
 *   2. 0600 for every file we create — the config files are secret-free today
 *      and must stay safe if a future path puts a key in one;
 *   3. a failed backup aborts the apply with zero writes, so a partially
 *      written file never exists without rollback material.
 */

import { randomBytes } from "node:crypto";
import { promises as fsp } from "node:fs";
import { basename, dirname, join } from "node:path";

import type { BackupRecord, FileSnapshot, BackupEntry } from "./types";
import type { BackupStore, ConfiguratorFs, ConfiguratorLogger } from "./ports";

const MANIFEST_NAME = "manifest.json";
const FILES_DIR = "files";
const DIR_MODE = 0o700;

/** `ENOENT` is the only "not there" we are willing to treat as absent. */
function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

function parentDir(path: string): string {
  return dirname(path);
}

export interface NodeFsOptions {
  readonly logger?: ConfiguratorLogger;
  /** Injectable for deterministic tests; defaults to 8 random bytes. */
  readonly tempSuffix?: () => string;
}

/**
 * Node-backed `ConfiguratorFs`.
 *
 * `writeFileAtomic` opens the temp file with `wx` (no clobber, no symlink
 * following), writes, fsyncs the file, applies the mode, renames, then fsyncs
 * the *directory* so the rename itself is durable on POSIX. Windows has no
 * directory fsync — the open fails there, which is caught and ignored because
 * the rename is already atomic on NTFS.
 */
export function createNodeConfiguratorFs(
  options: NodeFsOptions = {},
): ConfiguratorFs {
  const suffix =
    options.tempSuffix ?? (() => randomBytes(8).toString("hex"));

  return {
    async stat(path) {
      try {
        const stats = await fsp.stat(path);
        return { mode: stats.mode & 0o777 };
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async read(path) {
      try {
        return await fsp.readFile(path, "utf8");
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async writeFileAtomic(path, content, mode) {
      const dir = parentDir(path);
      await fsp.mkdir(dir, { recursive: true, mode: DIR_MODE });
      const temp = join(dir, `.${basename(path)}.${suffix()}.tmp`);

      let handle: Awaited<ReturnType<typeof fsp.open>> | null = null;
      try {
        handle = await fsp.open(temp, "wx", mode);
        await handle.writeFile(content, "utf8");
        await handle.sync();
      } catch (err) {
        await handle?.close().catch(() => undefined);
        await fsp.rm(temp, { force: true }).catch(() => undefined);
        throw err;
      }
      await handle.close();
      await fsp.chmod(temp, mode);
      await fsp.rename(temp, path);

      try {
        const dirHandle = await fsp.open(dir, "r");
        try {
          await dirHandle.sync();
        } finally {
          await dirHandle.close();
        }
      } catch {
        // Windows (and some network filesystems) refuse fsync on a directory.
        // The rename is still atomic there; nothing to recover.
      }
    },

    async chmod(path, mode) {
      await fsp.chmod(path, mode);
    },

    async remove(path) {
      await fsp.rm(path, { force: true });
    },

    async mkdirp(path) {
      await fsp.mkdir(path, { recursive: true, mode: DIR_MODE });
    },
  };
}

export interface BackupStoreOptions {
  readonly fs: ConfiguratorFs;
  /** Parent directory; one timestamped child is created per apply. */
  readonly root: string;
  /** sha256 hex. Injected so the orchestrator and the store agree on one hash. */
  readonly hash: (content: string) => string;
  readonly logger?: ConfiguratorLogger;
}

/** `2026-11-10T17:44:49.123Z` → `20261110T174449Z-<applyId>`; sorts by time. */
function directoryName(createdAt: string, applyId: string): string {
  const stamp = createdAt.replace(/[^0-9A-Za-z]+/g, "").replace(/Z?$/, "Z");
  const safeApply = applyId.replace(/[^0-9A-Za-z_-]+/g, "-").slice(0, 48);
  return `${stamp}-${safeApply || "apply"}`;
}

/** Backup filenames stay identifiable without leaking anything but a path. */
function backupFileName(index: number, path: string, sha256: string): string {
  const flat = basename(path).replace(/[^0-9A-Za-z._-]+/g, "_").slice(0, 40);
  return `${String(index).padStart(3, "0")}-${sha256.slice(0, 8)}-${flat || "file"}`;
}

interface ManifestFile {
  readonly schemaVersion: 1;
  readonly applyId: string;
  readonly profileId: string;
  readonly createdAt: string;
  readonly entries: readonly BackupEntry[];
  readonly entriesSha256: string;
}

export function createBackupStore(options: BackupStoreOptions): BackupStore {
  const { fs, hash } = options;

  return {
    async create(input): Promise<BackupRecord> {
      const dirName = directoryName(input.createdAt, input.applyId);
      const root = join(options.root, dirName);
      await fs.mkdirp(join(root, FILES_DIR));

      const entries: BackupEntry[] = [];
      let index = 0;
      for (const snapshot of input.snapshots) {
        entries.push(await writeEntry(snapshot));
      }
      async function writeEntry(snapshot: FileSnapshot): Promise<BackupEntry> {
        if (snapshot.content === null) {
          return {
            path: snapshot.path,
            existed: false,
            priorMode: snapshot.mode,
            sha256: null,
            bytes: 0,
          };
        }
        const digest = hash(snapshot.content);
        const backupPath = join(
          root,
          FILES_DIR,
          backupFileName(index++, snapshot.path, digest),
        );
        // 0600 even though this is "just a copy": the copy is the thing that
        // still holds the user's own provider key after we overwrote the file.
        await fs.writeFileAtomic(backupPath, snapshot.content, 0o600);
        return {
          path: snapshot.path,
          backupPath,
          existed: true,
          priorMode: snapshot.mode,
          sha256: digest,
          bytes: Buffer.byteLength(snapshot.content, "utf8"),
        };
      }

      const entriesSha256 = hash(JSON.stringify(entries));
      const manifest: ManifestFile = {
        schemaVersion: 1,
        applyId: input.applyId,
        profileId: input.profileId,
        createdAt: input.createdAt,
        entries,
        entriesSha256,
      };
      // Paths + hashes only: this file is safe to attach to a bug report.
      await fs.writeFileAtomic(
        join(root, MANIFEST_NAME),
        `${JSON.stringify(manifest, null, 2)}\n`,
        0o600,
      );

      options.logger?.info("runtime-configurator: backup created", {
        apply_id: input.applyId,
        entries: entries.length,
        root,
      });

      return {
        applyId: input.applyId,
        profileId: input.profileId,
        createdAt: input.createdAt,
        root,
        entries,
        entriesSha256,
      };
    },

    async restore(record: BackupRecord): Promise<void> {
      if (record.entriesSha256) {
        const actual = hash(JSON.stringify(record.entries));
        if (actual !== record.entriesSha256) {
          throw new Error(
            "runtime-configurator: backup manifest does not match its own entries",
          );
        }
      }

      // Restore in reverse write order: the last file we touched is the most
      // likely to be half-relevant, and undoing it first shortens the window in
      // which the user sees a mixed state.
      //
      // One blocked path (a file another process holds read-only, a directory
      // that appeared in its place) must not stop the rest from being restored:
      // every entry is attempted, and the failures are raised together at the
      // end so `apply` still reports `rollback-failed` — loudly, but with as much
      // of the user's configuration already back as possible.
      const failures: string[] = [];
      for (const entry of [...record.entries].reverse()) {
        try {
          await restoreEntry(entry);
        } catch (err) {
          failures.push(`${entry.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (failures.length > 0) {
        throw new Error(
          `runtime-configurator: ${failures.length} path(s) could not be restored — ${failures.join("; ")}`,
        );
      }

      options.logger?.warn("runtime-configurator: backup restored", {
        apply_id: record.applyId,
        entries: record.entries.length,
      });
    },
  };

  async function restoreEntry(entry: BackupEntry): Promise<void> {
    if (!entry.existed) {
      await fs.remove(entry.path);
      return;
    }
    if (!entry.backupPath) {
      throw new Error("backup entry has no content to restore");
    }
    const content = await fs.read(entry.backupPath);
    if (content === null) {
      throw new Error("backup copy is missing on disk");
    }
    if (entry.sha256 && hash(content) !== entry.sha256) {
      throw new Error("backup copy no longer matches its recorded hash");
    }
    await fs.mkdirp(parentDir(entry.path));
    await fs.writeFileAtomic(entry.path, content, 0o600);
    if (entry.priorMode !== null) {
      await fs.chmod(entry.path, entry.priorMode);
    }
  }
}

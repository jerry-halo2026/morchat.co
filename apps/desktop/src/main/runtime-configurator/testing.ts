/**
 * Test doubles for the Runtime Configurator.
 *
 * The point of the ports (`ConfiguratorFs`, `BackupStore`) is that the whole
 * pipeline — plan, backup, write, verify, rollback — can be exercised without a
 * temp directory and without ever asking the real keychain for a key. These
 * helpers are the "without" half: an in-memory filesystem that records the order
 * of every operation, and a backup store that really keeps the prior bytes so a
 * rollback assertion means something.
 *
 * Not named `*.test.ts` on purpose: it is support code, not a suite.
 */

import { createHash } from "node:crypto";

import type { BackupStore, ConfiguratorFs } from "./ports";
import type {
  BackupRecord,
  CredentialSource,
  FileSnapshot,
  RunRecord,
  RuntimeProfile,
} from "./types";

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export interface MemoryFs extends ConfiguratorFs {
  readonly entries: Map<string, { content: string; mode: number }>;
  /** Every operation in order: `stat <path>`, `write <path>`, … */
  readonly ops: string[];
  /** Last write wins; used to simulate a bad editor or a half-written file. */
  corruptOnWrite?: (path: string, content: string) => string;
}

export function createMemoryFs(initial: Record<string, string> = {}): MemoryFs {
  const entries = new Map<string, { content: string; mode: number }>();
  for (const [path, content] of Object.entries(initial)) {
    entries.set(path, { content, mode: 0o600 });
  }
  const ops: string[] = [];

  const fs: MemoryFs = {
    entries,
    ops,
    async stat(path) {
      ops.push(`stat ${path}`);
      const entry = entries.get(path);
      return entry ? { mode: entry.mode } : null;
    },
    async read(path) {
      ops.push(`read ${path}`);
      return entries.get(path)?.content ?? null;
    },
    async writeFileAtomic(path, content, mode) {
      const final = fs.corruptOnWrite ? fs.corruptOnWrite(path, content) : content;
      ops.push(`write ${path}`);
      entries.set(path, { content: final, mode });
    },
    async chmod(path, mode) {
      ops.push(`chmod ${path}`);
      const entry = entries.get(path);
      if (entry) entry.mode = mode;
    },
    async remove(path) {
      ops.push(`remove ${path}`);
      entries.delete(path);
    },
    async mkdirp(path) {
      ops.push(`mkdirp ${path}`);
    },
  };
  return fs;
}

export interface RecordingBackupStore extends BackupStore {
  readonly events: string[];
  readonly records: BackupRecord[];
  failCreate: boolean;
  failRestore: boolean;
}

/**
 * A backup store that is genuinely byte-exact: it keeps the snapshot content in
 * memory, so "rolled back" can be asserted by comparing the files, not by
 * trusting a flag.
 */
export function createRecordingBackup(
  fs: MemoryFs,
  events: string[] = [],
): RecordingBackupStore {
  const records: BackupRecord[] = [];
  const store = new Map<string, readonly FileSnapshot[]>();
  const backupStore: RecordingBackupStore = {
    events,
    records,
    failCreate: false,
    failRestore: false,
    async create(input) {
      events.push("backup:create");
      if (backupStore.failCreate) throw new Error("disk full");
      store.set(input.applyId, input.snapshots);
      const record: BackupRecord = {
        applyId: input.applyId,
        profileId: input.profileId,
        createdAt: input.createdAt,
        root: `/backups/${input.applyId}`,
        entries: input.snapshots.map((snapshot) => ({
          path: snapshot.path,
          ...(snapshot.content === null ? {} : { backupPath: `${snapshot.path}.bak` }),
          existed: snapshot.content !== null,
          priorMode: snapshot.mode,
          sha256: snapshot.content === null ? null : sha256(snapshot.content),
          bytes: snapshot.content === null ? 0 : Buffer.byteLength(snapshot.content, "utf8"),
        })),
      };
      records.push(record);
      return record;
    },
    async restore(record) {
      events.push("backup:restore");
      if (backupStore.failRestore) throw new Error("restore blew up");
      const snapshots = store.get(record.applyId) ?? [];
      for (const snapshot of snapshots) {
        if (snapshot.content === null) {
          await fs.remove(snapshot.path);
        } else {
          await fs.writeFileAtomic(
            snapshot.path,
            snapshot.content,
            (snapshot.mode === 0o644 ? 0o644 : 0o600) as 0o600 | 0o644,
          );
        }
      }
    },
  };
  return backupStore;
}

export function createTestProfile(overrides: {
  readonly baseUrl?: string;
  readonly models?: readonly string[];
  readonly defaultModel?: string;
  readonly profileId?: string;
  readonly userId?: string;
} = {}): RuntimeProfile {
  const root = `/home/${overrides.userId ?? "u1"}`;
  return {
    schemaVersion: 1,
    profileId: overrides.profileId ?? "profile-1",
    provider: {
      id: "morechat-relay",
      kind: "relay",
      label: "morechat gateway",
      baseUrl: overrides.baseUrl ?? "https://relay.example/v1",
      apiKeyRef: { kind: "env", name: "MULTICA_RELAY_KEY" },
      models: overrides.models ?? ["claude-sonnet-4-5"],
      defaultModel: overrides.defaultModel ?? "claude-sonnet-4-5",
    },
    targets: [
      {
        id: "claude-code",
        paths: {
          settingsPath: `${root}/.claude/settings.json`,
          keyHelperPath: `${root}/.multica/bin/relay-key`,
        },
      },
      {
        id: "codex",
        paths: {
          configPath: `${root}/.codex/config.toml`,
          authPath: `${root}/.codex/auth.json`,
        },
      },
      {
        id: "dsh",
        paths: { home: `${root}/.dsh`, profileName: "multica" },
      },
    ],
  };
}

/** Paths the test profile above owns — handy for assertions. */
export function testPaths(): {
  readonly claude: string;
  readonly codex: string;
  readonly dsh: string;
} {
  const root = "/home/u1";
  return {
    claude: `${root}/.claude/settings.json`,
    codex: `${root}/.codex/config.toml`,
    dsh: `${root}/.dsh/cordis.patch.yml`,
  };
}

export interface RecordingLogger {
  readonly lines: { level: "info" | "warn"; message: string; fields?: Record<string, unknown> }[];
  readonly logger: {
    info(message: string, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
  };
}

export function createRecordingLogger(): RecordingLogger {
  const lines: RecordingLogger["lines"] = [];
  return {
    lines,
    logger: {
      info(message, fields) {
        lines.push({ level: "info", message, ...(fields ? { fields } : {}) });
      },
      warn(message, fields) {
        lines.push({ level: "warn", message, ...(fields ? { fields } : {}) });
      },
    },
  };
}

export function credentialSourceOf(records: readonly RunRecord[]): (CredentialSource | "none")[] {
  return records.map((record) => record.credentialSource);
}

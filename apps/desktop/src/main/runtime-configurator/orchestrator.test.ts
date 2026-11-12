// @vitest-environment node
/**
 * The pipeline contract, asserted on an in-memory disk:
 *
 *   plan → backup → write → verify → (rollback on any failure)
 *
 * plus the parts that make it usable in a company: the credential precedence,
 * the single degrade retry, and the run record that carries
 * `credential_source`.
 */

import { describe, expect, it } from "vitest";

import { createRuntimeConfigurator, mergeFile, WRITERS } from "./index";
import { CredentialUnavailableError, companyAccount, personalAccount, KEYCHAIN_SERVICE } from "./credential";
import { createMemoryKeychain } from "./keychain";
import type { CredentialProbe } from "./probe";
import type { RunRecord } from "./types";
import {
  createMemoryFs,
  createRecordingBackup,
  createRecordingLogger,
  createTestProfile,
  sha256,
  testPaths,
  type MemoryFs,
  type RecordingBackupStore,
} from "./testing";

interface Harness {
  readonly fs: MemoryFs;
  readonly backup: RecordingBackupStore;
  readonly records: RunRecord[];
  readonly logger: ReturnType<typeof createRecordingLogger>;
}

function harness(initial: Record<string, string> = {}): Harness {
  const fs = createMemoryFs(initial);
  const backup = createRecordingBackup(fs, fs.ops);
  const records: RunRecord[] = [];
  return { fs, backup, records, logger: createRecordingLogger() };
}

function configurator(
  h: Harness,
  extra: {
    readonly keychain?: ReturnType<typeof createMemoryKeychain>;
    readonly probe?: CredentialProbe;
    readonly userId?: string;
  } = {},
) {
  return createRuntimeConfigurator({
    fs: h.fs,
    backup: h.backup,
    hash: sha256,
    newApplyId: () => `apply-${h.records.length + 1}`,
    now: () => new Date("2026-11-10T09:00:00.000Z"),
    logger: h.logger.logger,
    onRecord: (record) => h.records.push(record),
    ...(extra.keychain ? { keychain: extra.keychain } : {}),
    ...(extra.probe ? { probe: extra.probe } : {}),
    ...(extra.userId ? { userId: extra.userId } : {}),
  });
}

describe("apply pipeline", () => {
  it("runs plan → backup → write → verify, with no write before the backup", async () => {
    const h = harness();
    const outcome = await configurator(h).apply(createTestProfile());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const paths = testPaths();
    expect([...outcome.changed].sort()).toEqual(
      [paths.claude, paths.codex].sort(),
    );

    const ops = h.fs.ops;
    const backupAt = ops.indexOf("backup:create");
    const firstWrite = ops.findIndex((op) => op.startsWith("write "));
    const verifyRead = ops.findIndex(
      (op, index) => index > firstWrite && op.startsWith("read "),
    );

    expect(backupAt).toBeGreaterThanOrEqual(0);
    expect(firstWrite).toBeGreaterThan(backupAt);
    // verify must read the file back, not reuse what it just rendered.
    expect(verifyRead).toBeGreaterThan(firstWrite);
    // and every file the plan names really landed.
    for (const path of outcome.changed) {
      expect(h.fs.entries.has(path)).toBe(true);
    }
  });

  it("rolls back every write when verify cannot parse one of them", async () => {
    const paths = testPaths();
    const claudeBefore = '{\n  "theme": "dark"\n}\n';
    const codexBefore = '# my own codex notes\nmodel = "gpt-5"\n';
    const h = harness({ [paths.claude]: claudeBefore, [paths.codex]: codexBefore });
    // Simulate the one thing verify exists for: the bytes on disk are not the
    // bytes we planned (bad editor, disk corruption, another process). Only the
    // first write is corrupted — the rollback must land the original bytes.
    let corrupted = false;
    h.fs.corruptOnWrite = (path, content) => {
      if (!corrupted && path === paths.claude) {
        corrupted = true;
        return "{ not json at all";
      }
      return content;
    };

    const outcome = await configurator(h).apply(createTestProfile());

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.code).toBe("verify-failed");
    expect(outcome.rolledBack).toBe(true);

    // Both writers are undone — including the codex file that verified fine.
    // A half-configured profile is worse than the old one.
    expect(h.fs.entries.get(paths.claude)?.content).toBe(claudeBefore);
    expect(h.fs.entries.get(paths.codex)?.content).toBe(codexBefore);
    expect(h.fs.ops).toContain("backup:restore");
  });

  it("is idempotent: a second apply creates no backup and touches nothing", async () => {
    const h = harness();
    const instance = configurator(h);
    const first = await instance.apply(createTestProfile());
    expect(first.ok).toBe(true);

    const backupsAfterFirst = h.backup.records.length;
    const snapshot = new Map(
      [...h.fs.entries].map(([path, entry]) => [path, entry.content] as const),
    );

    const second = await instance.apply(createTestProfile());
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.changed).toEqual([]);
    expect(h.backup.records.length).toBe(backupsAfterFirst);
    for (const [path, content] of snapshot) {
      expect(h.fs.entries.get(path)?.content).toBe(content);
    }
    // The run record still says which credential it would have used.
    expect(h.records.at(-1)?.outcome).toBe("noop");
  });

  it("merge is idempotent per writer: applying a merged plan again is a no-op", () => {
    const profile = createTestProfile();
    for (const writer of WRITERS) {
      const planned = writer.plan({ profile, provider: profile.provider });
      for (const file of planned) {
        const merged = mergeFile(file, null);
        expect(mergeFile(file, merged)).toBe(merged);
      }
    }
  });

  it("preserves user content outside the managed region", async () => {
    const paths = testPaths();
    const codexBefore = '# keep me\nmodel_reasoning_effort = "high"\n';
    const h = harness({ [paths.codex]: codexBefore });
    await configurator(h).apply(createTestProfile());

    const after = h.fs.entries.get(paths.codex)?.content ?? "";
    expect(after.startsWith(codexBefore)).toBe(true);
    expect(after).toContain("# >>> morechat managed block");
  });

  it("aborts with zero writes when the backup fails", async () => {
    const h = harness();
    h.backup.failCreate = true;
    const outcome = await configurator(h).apply(createTestProfile());

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.code).toBe("backup-failed");
    expect(h.fs.ops.some((op) => op.startsWith("write "))).toBe(false);
  });

  it("reports rollback-failed loudly instead of pretending the disk is clean", async () => {
    const paths = testPaths();
    const h = harness({ [paths.claude]: "{}\n" });
    h.fs.corruptOnWrite = (path, content) =>
      path === paths.claude ? "{ broken" : content;
    h.backup.failRestore = true;

    const outcome = await configurator(h).apply(createTestProfile());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.rolledBack).toBe(false);
    expect(outcome.failure.code).toBe("rollback-failed");
  });

  it("aborts before writing when a path's current content cannot be read", async () => {
    // A backup that recorded "did not exist" for an unreadable file would make
    // rollback *delete* it. So an unreadable pre-state must abort, not guess.
    const paths = testPaths();
    const base = createMemoryFs({ [paths.claude]: "{}\n" });
    const backup = createRecordingBackup(base, base.ops);
    const fs = {
      ...base,
      async read(path: string): Promise<string | null> {
        if (path === paths.claude) throw new Error("EISDIR: illegal operation on a directory");
        return base.read(path);
      },
    };
    const instance = createRuntimeConfigurator({
      fs,
      backup,
      hash: sha256,
      newApplyId: () => "apply-unreadable",
      now: () => new Date("2026-11-10T09:00:00.000Z"),
      logger: createRecordingLogger().logger,
    });

    const outcome = await instance.apply(createTestProfile());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.code).toBe("backup-failed");
    expect(base.ops.some((op) => op.startsWith("write "))).toBe(false);
  });

  it("returns plan-empty and writes nothing when no target is selected", async () => {
    const h = harness();
    const profile = { ...createTestProfile(), targets: [] };
    const outcome = await configurator(h).apply(profile);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.code).toBe("plan-empty");
    expect(h.fs.ops.some((op) => op.startsWith("write "))).toBe(false);
  });
});

describe("credential source and degrade retry", () => {
  const userId = "u1";

  function keychainWith(company: string | null, personal: string | null) {
    const entries: (readonly [string, string, string])[] = [];
    if (company !== null) entries.push([KEYCHAIN_SERVICE, companyAccount(userId), company]);
    if (personal !== null) entries.push([KEYCHAIN_SERVICE, personalAccount(userId), personal]);
    return createMemoryKeychain(entries);
  }

  /** 401 for the company key, ok for anything else — the exact degrade case. */
  const companyRejected: CredentialProbe = async ({ readKey }) => {
    const key = await readKey();
    return key === "company-key"
      ? { ok: false, reason: "unauthorized", status: 401 }
      : { ok: true, status: 200 };
  };

  /** Every credential is accepted: the happy path. */
  const probeAlwaysOk: CredentialProbe = async () => ({ ok: true, status: 200 });

  it("uses the company key and records credential_source=company", async () => {
    const h = harness();
    const outcome = await configurator(h, {
      keychain: keychainWith("company-key", null),
      probe: probeAlwaysOk,
      userId,
    }).apply(createTestProfile());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.credentialSource).toBe("company");
    expect(h.records.at(-1)?.credentialSource).toBe("company");
    expect(h.records.at(-1)?.credentialRetried).toBe(false);
  });

  it("falls back to the personal key exactly once when the company key 401s", async () => {
    const h = harness();
    const outcome = await configurator(h, {
      keychain: keychainWith("company-key", "personal-key"),
      probe: companyRejected,
      userId,
    }).apply(createTestProfile());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // The caller reads this to keep personal usage off the company ledger.
    expect(outcome.credentialSource).toBe("personal");
    const record = h.records.at(-1);
    expect(record?.credentialSource).toBe("personal");
    expect(record?.credentialRetried).toBe(true);
    expect(record?.credentialAttempts.map((attempt) => attempt.source)).toEqual([
      "company",
      "personal",
    ]);
    // …and the config still landed, so the employee can keep working.
    // and the config still landed (one file per remaining target), so the employee
    // can keep working: DSH is no longer a configuration target.
    expect(h.fs.entries.size).toBe(2);
  });

  it("throws a readable error and writes nothing when both credentials fail", async () => {
    const h = harness();
    const bothRejected: CredentialProbe = async ({ credential }) =>
      credential.source === "company"
        ? { ok: false, reason: "rate-limited", status: 429 }
        : { ok: false, reason: "timeout" };

    await expect(
      configurator(h, {
        keychain: keychainWith("company-key", "personal-key"),
        probe: bothRejected,
        userId,
      }).apply(createTestProfile()),
    ).rejects.toBeInstanceOf(CredentialUnavailableError);

    expect(h.fs.ops.some((op) => op.startsWith("write "))).toBe(false);
    expect(h.fs.entries.size).toBe(0);
    const record = h.records.at(-1);
    expect(record?.outcome).toBe("failed");
    expect(record?.failureCode).toBe("credential-unavailable");
    expect(record?.credentialSource).toBe("none");
    expect(record?.paths).toEqual([]);
  });

  it("does not degrade when the gateway itself is unreachable", async () => {
    const h = harness();
    const gatewayDown: CredentialProbe = async () => ({ ok: false, reason: "server", status: 503 });

    await expect(
      configurator(h, {
        keychain: keychainWith("company-key", "personal-key"),
        probe: gatewayDown,
        userId,
      }).apply(createTestProfile()),
    ).rejects.toBeInstanceOf(CredentialUnavailableError);

    // Only the company attempt was made: burning the employee's own quota
    // because the gateway is down would be worse than failing.
    expect(h.records.at(-1)?.credentialAttempts).toHaveLength(1);
    expect(h.fs.entries.size).toBe(0);
  });

  it("never writes a secret into the run record or the log", async () => {
    const h = harness();
    await configurator(h, {
      keychain: keychainWith("company-key", null),
      probe: probeAlwaysOk,
      userId,
    }).apply(createTestProfile());

    const serialised = JSON.stringify({
      records: h.records,
      logs: h.logger.lines,
    });
    expect(serialised).not.toContain("company-key");
    expect(serialised).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
  });
});

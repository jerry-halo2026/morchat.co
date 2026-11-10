// @vitest-environment node
/**
 * The real disk adapter, exercised on a real temporary directory.
 *
 * What matters here cannot be faked convincingly: that a write is atomic (no
 * half-file, no leftover temp), that the backup directory carries a manifest with
 * a sha256 and the prior bytes, and that a restore puts back exactly those bytes
 * — or blows up when the backup was tampered with, instead of writing garbage
 * over a working config.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBackupStore, createNodeConfiguratorFs } from "./fs";
import { sha256 } from "./testing";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "morechat-configurator-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createNodeConfiguratorFs", () => {
  it("writes atomically and leaves no temp file behind", async () => {
    const fs = createNodeConfiguratorFs();
    const target = join(root, "nested", "settings.json");

    await fs.writeFileAtomic(target, '{"a":1}\n', 0o600);

    expect(await fs.read(target)).toBe('{"a":1}\n');
    const siblings = await readdir(join(root, "nested"));
    expect(siblings).toEqual(["settings.json"]);
  });

  it("reports absence as null and never as a throw", async () => {
    const fs = createNodeConfiguratorFs();
    expect(await fs.read(join(root, "nope.json"))).toBeNull();
    expect(await fs.stat(join(root, "nope.json"))).toBeNull();
  });

  it("applies 0600 on POSIX", async () => {
    if (process.platform === "win32") return; // chmod is a read-only flag there
    const fs = createNodeConfiguratorFs();
    const target = join(root, "secret.json");
    await fs.writeFileAtomic(target, "{}\n", 0o600);
    const stat = await fs.stat(target);
    expect(stat?.mode).toBe(0o600);
  });
});

describe("createBackupStore", () => {
  it("copies prior bytes under a timestamped directory with a manifest of hashes", async () => {
    const fs = createNodeConfiguratorFs();
    const store = createBackupStore({ fs, root: join(root, "backups"), hash: sha256 });
    const existing = join(root, "config.toml");
    const priorContent = 'model = "gpt-5"\n';
    await writeFile(existing, priorContent, "utf8");
    const absent = join(root, "settings.json");

    const record = await store.create({
      applyId: "apply-1",
      profileId: "user@host",
      createdAt: "2026-11-10T09:00:00.000Z",
      snapshots: [
        { path: existing, content: priorContent, mode: 0o600 },
        { path: absent, content: null, mode: null },
      ],
    });

    // Timestamped, sortable, one per apply.
    expect(record.root.startsWith(join(root, "backups"))).toBe(true);
    expect(record.root).toMatch(/-apply-1$/);
    expect(record.root).toMatch(/[\\/]20261110T09\d*Z-apply-1$/);

    const manifest = JSON.parse(
      await readFile(join(record.root, "manifest.json"), "utf8"),
    ) as {
      entries: { path: string; sha256: string | null; backupPath?: string; existed: boolean }[];
    };
    const existingEntry = manifest.entries.find((entry) => entry.path === existing);
    expect(existingEntry?.existed).toBe(true);
    expect(existingEntry?.sha256).toBe(sha256(priorContent));
    expect(existingEntry?.backupPath).toBeDefined();
    // The manifest itself must not carry content, only where the copy lives.
    expect(JSON.stringify(manifest)).not.toContain('model = \\"gpt-5\\"');
    // The copy does carry the bytes, byte-exact.
    expect(await readFile(existingEntry?.backupPath ?? "", "utf8")).toBe(priorContent);
  });

  it("restores byte-exact state: rewrites, and deletes files we created", async () => {
    const fs = createNodeConfiguratorFs();
    const store = createBackupStore({ fs, root: join(root, "backups"), hash: sha256 });
    const existing = join(root, "config.toml");
    const created = join(root, "cordis.patch.yml");
    const priorContent = "# mine\nmodel = \"gpt-5\"\n";
    await writeFile(existing, priorContent, "utf8");

    const record = await store.create({
      applyId: "apply-2",
      profileId: "user@host",
      createdAt: "2026-11-10T09:00:01.000Z",
      snapshots: [
        { path: existing, content: priorContent, mode: 0o640 },
        { path: created, content: null, mode: null },
      ],
    });

    // The apply overwrites one file and creates the other.
    await fs.writeFileAtomic(existing, "# managed\n", 0o600);
    await fs.writeFileAtomic(created, "- id: ours\n", 0o600);

    await store.restore(record);

    expect(await readFile(existing, "utf8")).toBe(priorContent);
    expect(await fs.read(created)).toBeNull();
  });

  it("refuses to restore from a tampered backup", async () => {
    const fs = createNodeConfiguratorFs();
    const store = createBackupStore({ fs, root: join(root, "backups"), hash: sha256 });
    const target = join(root, "settings.json");
    await mkdir(root, { recursive: true });
    await writeFile(target, "{}\n", "utf8");

    const record = await store.create({
      applyId: "apply-3",
      profileId: "user@host",
      createdAt: "2026-11-10T09:00:02.000Z",
      snapshots: [{ path: target, content: "{}\n", mode: 0o600 }],
    });

    await writeFile(record.entries[0]?.backupPath ?? "", "{ tampered }\n", "utf8");
    await expect(store.restore(record)).rejects.toThrow(/no longer matches its recorded hash/);
  });
});

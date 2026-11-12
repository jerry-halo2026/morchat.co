// @vitest-environment node
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DEVICE_ID_FILENAME, readOrCreateDeviceId } from "./device-id";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "morechat-device-id-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("readOrCreateDeviceId", () => {
  it("creates an id once and returns the same one afterwards", async () => {
    const dir = await tempDir();
    const first = await readOrCreateDeviceId({ dir });
    const second = await readOrCreateDeviceId({ dir });

    expect(first).toMatch(/^mcdev-[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });

  it("persists the id owner-only", async () => {
    const dir = await tempDir();
    const id = await readOrCreateDeviceId({ dir });

    const stored = (await readFile(join(dir, DEVICE_ID_FILENAME), "utf8")).trim();
    expect(stored).toBe(id);
    const mode = (await stat(join(dir, DEVICE_ID_FILENAME))).mode & 0o777;
    // Windows reports the writable bit rather than POSIX 0600; assert we did not
    // widen it for group or others where the platform models that.
    expect(mode & 0o077).toBe(process.platform === "win32" ? mode & 0o077 : 0);
  });

  it("replaces a corrupted file instead of trusting it", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, DEVICE_ID_FILENAME), "not-a-device-id\n", "utf8");

    const id = await readOrCreateDeviceId({ dir });
    expect(id).toMatch(/^mcdev-/);
    expect((await readFile(join(dir, DEVICE_ID_FILENAME), "utf8")).trim()).toBe(id);
  });

  it("still answers when the directory cannot be written", async () => {
    // A file where the directory should be: mkdir fails, and the caller must not.
    const dir = await tempDir();
    const blocked = join(dir, "blocked");
    await writeFile(blocked, "", "utf8");

    const id = await readOrCreateDeviceId({ dir: join(blocked, "nested") });
    expect(id).toMatch(/^mcdev-/);
  });
});

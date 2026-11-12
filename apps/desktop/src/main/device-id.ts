/**
 * A stable identifier for this installation.
 *
 * The gateway mints one token per (user, device) pair, and the token name carries a
 * hash of this value — so it has to be stable across restarts but must not be a
 * hardware fingerprint: the server only needs to tell "the same machine" from
 * "another machine" when it decides whether to reuse or rotate a key.
 *
 * Generated once, stored under the app's userData directory with owner-only mode,
 * and never sent anywhere except as the `device_id` field of a credential request.
 */

import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";

export const DEVICE_ID_FILENAME = "device-id";

/** Bumped when the on-disk shape changes; an unknown prefix means "generate again". */
const PREFIX = "mcdev";
const MAX_LENGTH = 128;

function isUsable(value: string): boolean {
  return value.startsWith(`${PREFIX}-`) && value.length <= MAX_LENGTH;
}

export interface DeviceIdOptions {
  /** Directory that holds app state (Electron's `userData`). */
  readonly dir: string;
}

/**
 * Returns this installation's device id, creating it on first use.
 *
 * A read failure is not fatal: an id that cannot be persisted is still a valid id
 * for this process, and losing it only means the next start mints a fresh token.
 */
export async function readOrCreateDeviceId({ dir }: DeviceIdOptions): Promise<string> {
  const path = join(dir, DEVICE_ID_FILENAME);
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (isUsable(existing)) return existing;
  } catch {
    // Missing or unreadable: fall through and create one.
  }

  const created = `${PREFIX}-${randomUUID()}`;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path, `${created}\n`, { mode: 0o600 });
    await chmod(path, 0o600);
  } catch {
    // Persisting failed; the in-memory value still serves this run.
  }
  return created;
}

/**
 * Where the two credentials live: the OS keychain, never a config file.
 *
 * Electron has no keytar dependency in this repo, so "the OS keychain" means
 * `safeStorage` (Keychain on macOS, DPAPI on Windows, libsecret/kwallet on
 * Linux) with the ciphertext parked in a 0600 file under `userData`. That is
 * the same primitive the rest of the app uses for at-rest secrets and it keeps
 * the plaintext out of every file we own.
 *
 * Two rules this module enforces:
 *
 *   1. A value goes in and a value comes out — nothing else. No `getAll()`, no
 *      serialisation of the store, no logging of entries. The only observable
 *      surface is `get(service, account): string | null`.
 *   2. When the OS has no usable backend (`safeStorage.isEncryptionAvailable()`
 *      is false — a headless CI box, a Linux session without a keyring), the
 *      store reports `available: false` and callers must treat both credentials
 *      as absent rather than falling back to plaintext on disk. Losing the
 *      convenience is acceptable; writing an API key in the clear is not.
 *
 * The ciphertext file is written through the same `writeFileAtomic` used for
 * configs, so a crash cannot leave a half-serialised store that decrypts to
 * garbage, and reads/writes are serialised so two windows cannot lose one
 * another's update.
 */

import { dirname } from "node:path";

import type { ConfiguratorFs } from "./ports";

export interface Keychain {
  /** False when the platform has no encryption backend; every read is `null`. */
  readonly available: boolean;
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, value: string): Promise<void>;
  delete(service: string, account: string): Promise<void>;
}

/** Thrown when a caller tries to *store* a secret without a backend. */
export class KeychainUnavailableError extends Error {
  readonly code = "keychain-unavailable";
  constructor() {
    super(
      "runtime-configurator: no OS keychain backend is available, so credentials cannot be stored",
    );
    this.name = "KeychainUnavailableError";
  }
}

/** `safeStorage`'s two calls, injected so this module imports no Electron. */
export interface SecretCipher {
  readonly available: boolean;
  encrypt(plain: string): Buffer;
  decrypt(blob: Buffer): string;
}

const STORE_VERSION = 1;

interface StoreFile {
  readonly v: number;
  readonly entries: Readonly<Record<string, string>>;
}

function entryKey(service: string, account: string): string {
  // `\u0000` cannot appear in either half (both are ours), so the composite key
  // is unambiguous without escaping.
  return `${service}\u0000${account}`;
}

function decodeStore(raw: string | null): Record<string, string> {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as StoreFile).v === STORE_VERSION &&
      typeof (parsed as StoreFile).entries === "object" &&
      (parsed as StoreFile).entries !== null
    ) {
      const entries: Record<string, string> = {};
      for (const [key, value] of Object.entries(
        (parsed as StoreFile).entries as Record<string, unknown>,
      )) {
        if (typeof value === "string") entries[key] = value;
      }
      return entries;
    }
  } catch {
    // A corrupt store must not brick sign-in: treat it as empty and let the
    // next write replace it. The old bytes are already useless (we cannot
    // decrypt a truncated blob anyway).
  }
  return {};
}

export interface KeychainOptions {
  readonly fs: ConfiguratorFs;
  /** Absolute path of the ciphertext store, e.g. `<userData>/…/keychain.json`. */
  readonly path: string;
  readonly cipher: SecretCipher;
}

export function createSafeStorageKeychain(options: KeychainOptions): Keychain {
  const { fs, cipher } = options;
  const path = options.path;
  // Serialises read-modify-write so concurrent `set()` calls cannot drop one
  // another's entry (the file is a single JSON document).
  let queue: Promise<unknown> = Promise.resolve();

  function serialised<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async function load(): Promise<Record<string, string>> {
    return decodeStore(await fs.read(path));
  }

  async function save(entries: Record<string, string>): Promise<void> {
    const body: StoreFile = { v: STORE_VERSION, entries };
    await fs.mkdirp(dirname(path));
    await fs.writeFileAtomic(path, `${JSON.stringify(body)}\n`, 0o600);
  }

  return {
    available: cipher.available,

    async get(service, account) {
      if (!cipher.available) return null;
      return serialised(async () => {
        const blob = (await load())[entryKey(service, account)];
        if (blob === undefined) return null;
        try {
          return cipher.decrypt(Buffer.from(blob, "base64"));
        } catch {
          // Undecryptable (rotated OS key, copied profile): behave as absent so
          // the user is asked for the key again instead of seeing a crash loop.
          return null;
        }
      });
    },

    async set(service, account, value) {
      if (!cipher.available) throw new KeychainUnavailableError();
      await serialised(async () => {
        const entries = await load();
        entries[entryKey(service, account)] = cipher
          .encrypt(value)
          .toString("base64");
        await save(entries);
      });
    },

    async delete(service, account) {
      await serialised(async () => {
        const entries = await load();
        if (!(entryKey(service, account) in entries)) return;
        delete entries[entryKey(service, account)];
        await save(entries);
      });
    },
  };
}

/**
 * In-memory keychain. Used by tests and by a `--no-keychain` dev run; never
 * selected silently in production, because "your key disappears on restart"
 * must be a deliberate, visible choice.
 */
export function createMemoryKeychain(
  initial: readonly (readonly [string, string, string])[] = [],
): Keychain & { readonly entries: Map<string, string> } {
  const entries = new Map<string, string>();
  for (const [service, account, value] of initial) {
    entries.set(entryKey(service, account), value);
  }
  return {
    available: true,
    entries,
    async get(service, account) {
      return entries.get(entryKey(service, account)) ?? null;
    },
    async set(service, account, value) {
      entries.set(entryKey(service, account), value);
    },
    async delete(service, account) {
      entries.delete(entryKey(service, account));
    },
  };
}

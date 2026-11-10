// @vitest-environment node
/**
 * The keychain adapter, with `safeStorage` swapped for a fake cipher and the
 * filesystem for the in-memory one.
 *
 * The real OS backend (`safeStorage`) cannot be exercised in CI — headless Linux
 * and CI Windows both report `isEncryptionAvailable() === false`, which is why
 * `bootstrap.ts` treats "unavailable" as "no credential" instead of falling back
 * to plaintext. What *is* testable, and is tested here, is everything around it:
 * one JSON document under 0600, serialised read-modify-write, absent-on-corrupt,
 * and refusing to store anything without a backend.
 */

import { describe, expect, it } from "vitest";

import {
  KeychainUnavailableError,
  createSafeStorageKeychain,
  type SecretCipher,
} from "./keychain";
import { createMemoryFs } from "./testing";

const service = "morechat.runtime-configurator";
const path = "/userData/runtime-configurator/keychain.json";

/** NOT encryption — a deliberately transparent stand-in for safeStorage. */
const fakeCipher: SecretCipher = {
  available: true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`, "utf8"),
  decrypt: (blob) => blob.toString("utf8").replace(/^enc:/, ""),
};

const unavailableCipher: SecretCipher = {
  available: false,
  encrypt: () => {
    throw new Error("no backend");
  },
  decrypt: () => {
    throw new Error("no backend");
  },
};

describe("createSafeStorageKeychain", () => {
  it("stores ciphertext at 0600 and round-trips the value", async () => {
    const fs = createMemoryFs();
    const keychain = createSafeStorageKeychain({ fs, path, cipher: fakeCipher });

    await keychain.set(service, "company:u1", "company-key");
    expect(await keychain.get(service, "company:u1")).toBe("company-key");

    const stored = fs.entries.get(path);
    expect(stored?.mode).toBe(0o600);
    // The plaintext must not appear in the file we leave on disk.
    expect(stored?.content ?? "").not.toContain("company-key");
    expect(stored?.content ?? "").toContain(Buffer.from("enc:company-key").toString("base64"));
  });

  it("keeps both entries when two writes race", async () => {
    const fs = createMemoryFs();
    const keychain = createSafeStorageKeychain({ fs, path, cipher: fakeCipher });

    await Promise.all([
      keychain.set(service, "company:u1", "company-key"),
      keychain.set(service, "personal:u1", "personal-key"),
    ]);

    expect(await keychain.get(service, "company:u1")).toBe("company-key");
    expect(await keychain.get(service, "personal:u1")).toBe("personal-key");
  });

  it("deletes one entry without disturbing the other", async () => {
    const fs = createMemoryFs();
    const keychain = createSafeStorageKeychain({ fs, path, cipher: fakeCipher });
    await keychain.set(service, "company:u1", "company-key");
    await keychain.set(service, "personal:u1", "personal-key");

    await keychain.delete(service, "personal:u1");
    expect(await keychain.get(service, "personal:u1")).toBeNull();
    expect(await keychain.get(service, "company:u1")).toBe("company-key");
  });

  it("treats an undecryptable or corrupt store as absent instead of crashing", async () => {
    const fs = createMemoryFs({ [path]: "{ not json" });
    const keychain = createSafeStorageKeychain({ fs, path, cipher: fakeCipher });
    expect(await keychain.get(service, "company:u1")).toBeNull();
    // …and a later write recovers the store.
    await keychain.set(service, "company:u1", "company-key");
    expect(await keychain.get(service, "company:u1")).toBe("company-key");
  });

  it("refuses to store a key when the platform has no backend", async () => {
    const fs = createMemoryFs();
    const keychain = createSafeStorageKeychain({
      fs,
      path,
      cipher: unavailableCipher,
    });

    expect(keychain.available).toBe(false);
    expect(await keychain.get(service, "company:u1")).toBeNull();
    await expect(keychain.set(service, "company:u1", "x")).rejects.toBeInstanceOf(
      KeychainUnavailableError,
    );
    // Nothing was written in the clear.
    expect(fs.entries.size).toBe(0);
  });
});

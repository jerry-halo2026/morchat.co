// @vitest-environment node
/**
 * Credential precedence: company → personal → throw.
 *
 * The personal key is a first-class citizen here (it is what keeps someone
 * working through a company-key outage) but it must stay visibly *personal*:
 * labelled "仅本机", and flagged so the caller never bills its usage to the
 * company.
 */

import { describe, expect, it } from "vitest";

import {
  KEYCHAIN_SERVICE,
  NoCredentialError,
  PERSONAL_KEY_LABEL,
  clearPersonalCredential,
  companyAccount,
  personalAccount,
  readCredentialValue,
  resolveCredential,
  storePersonalCredential,
} from "./credential";
import { createMemoryKeychain, type Keychain } from "./keychain";
import { createTestProfile } from "./testing";

const profile = createTestProfile();
const userId = "u1";

function keychain(company: string | null, personal: string | null) {
  const entries: (readonly [string, string, string])[] = [];
  if (company !== null) entries.push([KEYCHAIN_SERVICE, companyAccount(userId), company]);
  if (personal !== null) entries.push([KEYCHAIN_SERVICE, personalAccount(userId), personal]);
  return createMemoryKeychain(entries);
}

describe("resolveCredential", () => {
  it("prefers the company key", async () => {
    const resolved = await resolveCredential(profile, {
      keychain: keychain("company-key", "personal-key"),
      userId,
    });
    expect(resolved.source).toBe("company");
    expect(resolved.billableToCompany).toBe(true);
    expect(resolved.secretName).toBe("MULTICA_RELAY_KEY");
  });

  it("falls back to the personal key and marks it not billable to the company", async () => {
    const resolved = await resolveCredential(profile, {
      keychain: keychain(null, "personal-key"),
      userId,
    });
    expect(resolved.source).toBe("personal");
    expect(resolved.billableToCompany).toBe(false);
    expect(resolved.label).toBe(PERSONAL_KEY_LABEL);
    expect(resolved.label).toContain("仅本机");
  });

  it("throws NoCredentialError when neither key is stored", async () => {
    await expect(
      resolveCredential(profile, { keychain: keychain(null, null), userId }),
    ).rejects.toBeInstanceOf(NoCredentialError);

    try {
      await resolveCredential(profile, { keychain: keychain(null, null), userId });
    } catch (err) {
      expect(err).toBeInstanceOf(NoCredentialError);
      const error = err as NoCredentialError;
      expect(error.attempts.map((attempt) => attempt.source)).toEqual([
        "company",
        "personal",
      ]);
      expect(error.message).toContain("Settings");
    }
  });

  it("honours `only` so the degrade retry cannot silently re-pick the company key", async () => {
    const resolved = await resolveCredential(
      profile,
      { keychain: keychain("company-key", "personal-key"), userId },
      { only: "personal" },
    );
    expect(resolved.source).toBe("personal");
  });

  it("treats an unusable keychain as 'no credential' instead of crashing", async () => {
    const unavailable: Keychain = {
      available: false,
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
    };
    try {
      await resolveCredential(profile, { keychain: unavailable, userId });
      throw new Error("expected a rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(NoCredentialError);
      expect((err as NoCredentialError).attempts.every((a) => a.reason === "unavailable")).toBe(
        true,
      );
    }
  });

  it("returns a reference, and only readCredentialValue yields the plaintext", async () => {
    const store = keychain(null, "personal-key");
    const resolved = await resolveCredential(profile, { keychain: store, userId });
    expect(JSON.stringify(resolved)).not.toContain("personal-key");
    expect(await readCredentialValue(store, resolved)).toBe("personal-key");
  });
});

describe("personal key lifecycle", () => {
  it("stores, reads back, and clears", async () => {
    const store = keychain(null, null);
    await storePersonalCredential(store, userId, "  personal-key  ");
    const resolved = await resolveCredential(profile, { keychain: store, userId });
    expect(resolved.source).toBe("personal");

    await clearPersonalCredential(store, userId);
    await expect(
      resolveCredential(profile, { keychain: store, userId }),
    ).rejects.toBeInstanceOf(NoCredentialError);
  });

  it("ignores a blank personal key rather than treating it as configured", async () => {
    const store = keychain(null, null);
    await storePersonalCredential(store, userId, "   ");
    await expect(
      resolveCredential(profile, { keychain: store, userId }),
    ).rejects.toBeInstanceOf(NoCredentialError);
  });
});

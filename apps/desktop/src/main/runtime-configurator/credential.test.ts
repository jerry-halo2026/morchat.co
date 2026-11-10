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
  describeCredentials,
  personalAccount,
  readCredentialValue,
  resolveCredential,
  storePersonalCredential,
  validatePersonalKey,
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

// Settings renders exactly this shape, so it is the one place where "what is
// stored" becomes user-visible. The invariants that matter: a key never appears,
// the suffix is only the last four characters, and a machine without a keychain
// reports both slots empty rather than pretending.
describe("describeCredentials", () => {
  it("reports each slot with a four-character suffix and the effective source", async () => {
    const summary = await describeCredentials(
      keychain("company-key-aaaa", "personal-key-zzzz"),
      userId,
    );
    expect(summary).toEqual({
      keychainAvailable: true,
      company: { configured: true, suffix: "aaaa" },
      personal: { configured: true, suffix: "zzzz" },
      effective: "company",
    });
    expect(JSON.stringify(summary)).not.toContain("company-key-aaaa");
    expect(JSON.stringify(summary)).not.toContain("personal-key-zzzz");
  });

  it("falls back to personal as effective when only that slot is filled", async () => {
    const summary = await describeCredentials(keychain(null, "personal-key-zzzz"), userId);
    expect(summary.effective).toBe("personal");
    expect(summary.company).toEqual({ configured: false, suffix: null });
  });

  it("reports nothing stored, and no effective source, on an empty keychain", async () => {
    const summary = await describeCredentials(keychain(null, null), userId);
    expect(summary.effective).toBeNull();
    expect(summary.personal.configured).toBe(false);
  });

  it("treats a keychain with no OS backend as empty instead of guessing", async () => {
    const unavailable = {
      available: false,
      get: async () => {
        throw new Error("must not be read");
      },
      set: async () => {},
      delete: async () => {},
    } as unknown as Keychain;
    const summary = await describeCredentials(unavailable, userId);
    expect(summary.keychainAvailable).toBe(false);
    expect(summary.company.configured).toBe(false);
    expect(summary.effective).toBeNull();
  });
});

describe("validatePersonalKey", () => {
  it("accepts an opaque token and rejects the shapes a paste actually produces", () => {
    expect(validatePersonalKey("sk-live-0123456789abcdef")).toBeNull();
    expect(validatePersonalKey("   ")).toBe("empty");
    expect(validatePersonalKey("short")).toBe("too-short");
    expect(validatePersonalKey("sk-live 0123456789abcdef")).toBe("contains-whitespace");
    expect(validatePersonalKey("sk-live-0123456789abcde\u00e9")).toBe("not-a-key");
  });
});

/**
 * Which credential a run should use, and in what order.
 *
 * Precedence is fixed and non-negotiable (RUNTIME-CONFIGURATOR.md §1.2):
 *
 *   ① company  — the per-user gateway key the server minted for this person and
 *      device (T1). Long-lived, revocable, quota'd, and billed to the company.
 *   ② personal — a key the employee typed into Settings themselves. Stored in
 *      the OS keychain only, labelled "this device only", and never billed to
 *      the company ledger. It exists so that a company-key outage (401/402/403/
 *      429/timeout) degrades into "I'll use my own key for a while" instead of
 *      "I cannot work".
 *   ③ nothing  — throw `NoCredentialError` with an actionable message.
 *
 * The returned value is a *reference*, never the key: `ResolvedCredential.ref`
 * is keychain coordinates, so a caller cannot accidentally log the secret and
 * cannot render it into a config file. The one function that yields plaintext
 * is `readCredentialValue`, which exists only to hand the value to a network
 * self-check or a spawned CLI's environment.
 */

import type {
  CredentialAttempt,
  CredentialSource,
  RuntimeProfile,
  SecretRef,
} from "./types";
import { envNameFor } from "./writers/writer";
import { KeychainUnavailableError, type Keychain } from "./keychain";
import type { ConfiguratorLogger } from "./ports";

/** Keychain service name; stable, so upgrades find the same entries. */
export const KEYCHAIN_SERVICE = "morechat.runtime-configurator";

/** Shown in Settings next to the input: the promise this key comes with. */
export const PERSONAL_KEY_LABEL = "仅本机（个人 Key，用量不计入公司账）";

export const DEFAULT_PROVIDER_ENV_NAME = "MULTICA_RELAY_KEY";

export function companyAccount(userId: string): string {
  return `company:${userId}`;
}

export function personalAccount(userId: string): string {
  return `personal:${userId}`;
}

export interface ResolvedCredential {
  readonly source: CredentialSource;
  /** Keychain coordinates. The plaintext exists only behind this reference. */
  readonly ref: Extract<SecretRef, { kind: "keychain" }>;
  /** Env-var NAME a spawned CLI reads the value from (never the value). */
  readonly secretName: string;
  /** False for `personal`: the caller must not bill that usage to the company. */
  readonly billableToCompany: boolean;
  readonly label: string;
}

export class NoCredentialError extends Error {
  readonly code = "no-credential";
  readonly attempts: readonly CredentialAttempt[];
  constructor(attempts: readonly CredentialAttempt[]) {
    super(
      "runtime-configurator: no credential is available — sign in again to receive a company gateway key, or add your own key in Settings",
    );
    this.name = "NoCredentialError";
    this.attempts = attempts;
  }
}

/**
 * Both sources were tried and neither worked: either the stored company key was
 * rejected by the gateway (401/402/403/429/timeout) and no personal key is
 * configured, or the gateway itself is unreachable and degrading would have
 * spent the employee's money on a problem the company owns.
 *
 * `nothingWritten` is part of the contract: the credential self-check runs
 * before the first byte is written, so this failure leaves every file exactly as
 * it was. `hint` is the sentence to show in the UI.
 */
export class CredentialUnavailableError extends Error {
  readonly code = "credential-unavailable";
  readonly nothingWritten = true;
  readonly hint: string;
  constructor(readonly attempts: readonly CredentialAttempt[]) {
    const worst = attempts[attempts.length - 1];
    super(
      `runtime-configurator: credential unavailable after ${attempts.length} attempt(s) (${attempts
        .map((attempt) => `${attempt.source}:${attempt.reason ?? "ok"}`)
        .join(", ") || "none"}); last=${worst?.reason ?? "none"}. No file was modified.`,
    );
    this.name = "CredentialUnavailableError";
    this.hint = credentialHint("none");
  }
}


export interface ResolveCredentialContext {
  readonly keychain: Keychain;
  /** Account the keychain entries are keyed by. */
  readonly userId: string;
  readonly logger?: ConfiguratorLogger;
}

export interface ResolveCredentialOptions {
  /** Restrict resolution to one source (used by the degrade retry). */
  readonly only?: CredentialSource;
}

function descriptor(
  source: CredentialSource,
  profile: RuntimeProfile,
  account: string,
): ResolvedCredential {
  return {
    source,
    ref: { kind: "keychain", service: KEYCHAIN_SERVICE, account },
    secretName: envNameFor(profile.provider.apiKeyRef, DEFAULT_PROVIDER_ENV_NAME),
    billableToCompany: source === "company",
    label: source === "company" ? "公司网关 Key" : PERSONAL_KEY_LABEL,
  };
}

/**
 * Resolve the credential to use for `profile`.
 *
 * Never returns a plaintext value; never logs one either. When `only` is set,
 * exactly one source is consulted and failure throws — that is how the
 * orchestrator retries "personal only" after a company self-check failure
 * without accidentally falling back to the company key a second time.
 */
export async function resolveCredential(
  profile: RuntimeProfile,
  context: ResolveCredentialContext,
  options: ResolveCredentialOptions = {},
): Promise<ResolvedCredential> {
  const { keychain, userId, logger } = context;
  const order: readonly CredentialSource[] = options.only
    ? [options.only]
    : ["company", "personal"];

  const attempts: CredentialAttempt[] = [];
  for (const source of order) {
    const account =
      source === "company" ? companyAccount(userId) : personalAccount(userId);

    if (!keychain.available) {
      attempts.push({ source, ok: false, reason: "unavailable" });
      continue;
    }

    let value: string | null;
    try {
      value = await keychain.get(KEYCHAIN_SERVICE, account);
    } catch (err) {
      if (err instanceof KeychainUnavailableError) {
        attempts.push({ source, ok: false, reason: "unavailable" });
        continue;
      }
      throw err;
    }

    if (value === null || value.trim().length === 0) {
      attempts.push({ source, ok: false, reason: "no-credential" });
      continue;
    }

    attempts.push({ source, ok: true });
    // Desensitised by construction: source + provider id, no value, no hash.
    logger?.info("runtime-configurator: credential resolved", {
      credential_source: source,
      provider_id: profile.provider.id,
    });
    return descriptor(source, profile, account);
  }

  throw new NoCredentialError(attempts);
}

/**
 * Read the plaintext for an already-resolved credential.
 *
 * The name is the warning: this is the single place a key becomes a string, and
 * its result must never reach a logger, a file, or a renderer. Returns `null`
 * if the entry vanished between resolution and use (revoked / cleared).
 */
export async function readCredentialValue(
  keychain: Keychain,
  credential: ResolvedCredential,
): Promise<string | null> {
  if (!keychain.available) return null;
  return keychain.get(credential.ref.service, credential.ref.account);
}

/** Store the company key handed over by the server at sign-in. */
export async function storeCompanyCredential(
  keychain: Keychain,
  userId: string,
  value: string,
): Promise<void> {
  await keychain.set(KEYCHAIN_SERVICE, companyAccount(userId), value);
}

/** Store the key the employee typed into Settings ("this device only"). */
export async function storePersonalCredential(
  keychain: Keychain,
  userId: string,
  value: string,
): Promise<void> {
  await keychain.set(KEYCHAIN_SERVICE, personalAccount(userId), value);
}

export async function clearPersonalCredential(
  keychain: Keychain,
  userId: string,
): Promise<void> {
  await keychain.delete(KEYCHAIN_SERVICE, personalAccount(userId));
}

export async function clearCompanyCredential(
  keychain: Keychain,
  userId: string,
): Promise<void> {
  await keychain.delete(KEYCHAIN_SERVICE, companyAccount(userId));
}

/** Human hint for the degrade path; contains no credential material. */
export function credentialHint(source: CredentialSource | "none"): string {
  switch (source) {
    case "company":
      return "使用公司网关 Key";
    case "personal":
      return PERSONAL_KEY_LABEL;
    default:
      return "公司额度不可用，请在设置里填自己的 Key 或联系管理员";
  }
}

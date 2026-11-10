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

// ---------------------------------------------------------------------------
// Settings readback
// ---------------------------------------------------------------------------

/**
 * What Settings may show about one stored credential. Never the key: `suffix`
 * is the last four characters, which is what a person needs to answer "is this
 * the key I just pasted", and is not usable to reconstruct the rest.
 *
 * `null` suffix with `configured: true` would be a bug (nothing to show), so the
 * shape keeps the two consistent: configured implies a suffix.
 */
export interface CredentialSlotStatus {
  readonly configured: boolean;
  readonly suffix: string | null;
}

/**
 * The whole answer the 模型凭据 section renders:
 *
 *   - per-source state, so the page can say "公司凭据已配置 ····a1b2" and
 *     "个人 Key 未设置";
 *   - `effective`, i.e. which one a run would use right now, which is NOT the
 *     same question as "is the company key configured" — a company key can be
 *     stored and still be the one the gateway rejects, in which case the retry
 *     is what actually decided. This reports the stored preference order only;
 *     the orchestrator's self-check remains the authority at run time.
 *   - `keychainAvailable`, because on a machine without a usable OS keychain
 *     both slots are permanently unavailable and the page must say so instead of
 *     offering a form that cannot work.
 */
export interface CredentialStatusSummary {
  readonly keychainAvailable: boolean;
  readonly company: CredentialSlotStatus;
  readonly personal: CredentialSlotStatus;
  /** The source a run would try first and, absent a gateway rejection, use. */
  readonly effective: CredentialSource | null;
}

/** Last four characters of a stored value; `null` when there is no value. */
function suffixOf(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) return null;
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}

/**
 * Read the credential state for Settings. Two keychain reads, no self-check, no
 * network: opening a settings page must not spend a request against the
 * gateway, and must not ring the "company key is being rate-limited" bell by
 * probing it. That is the orchestrator's job, at run time.
 */
export async function describeCredentials(
  keychain: Keychain,
  userId: string,
): Promise<CredentialStatusSummary> {
  if (!keychain.available) {
    return {
      keychainAvailable: false,
      company: { configured: false, suffix: null },
      personal: { configured: false, suffix: null },
      effective: null,
    };
  }
  const [companyValue, personalValue] = await Promise.all([
    keychain.get(KEYCHAIN_SERVICE, companyAccount(userId)),
    keychain.get(KEYCHAIN_SERVICE, personalAccount(userId)),
  ]);
  const companySuffix = suffixOf(companyValue);
  const personalSuffix = suffixOf(personalValue);
  return {
    keychainAvailable: true,
    company: { configured: companySuffix !== null, suffix: companySuffix },
    personal: { configured: personalSuffix !== null, suffix: personalSuffix },
    effective:
      companySuffix !== null ? "company" : personalSuffix !== null ? "personal" : null,
  };
}

/**
 * Validation for the personal-key form, shared by the IPC handler and the page's
 * own pre-submit check so both refuse the same inputs for the same reason.
 *
 * Returns `null` when the value is acceptable, otherwise a stable machine code
 * the renderer maps to a localised message — the main process never ships
 * user-facing prose for this surface, because it has no locale context.
 */
export type PersonalKeyRejection =
  | "empty"
  | "too-short"
  | "not-a-key"
  | "contains-whitespace";

export function validatePersonalKey(value: string): PersonalKeyRejection | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "empty";
  // Every gateway key this repo mints or accepts is a single opaque token. A
  // value with internal whitespace is a paste of the surrounding sentence, not
  // a key, and storing it would only produce a 401 later with no explanation.
  if (/\s/.test(trimmed)) return "contains-whitespace";
  if (trimmed.length < 16) return "too-short";
  if (!/^[\x21-\x7e]+$/.test(trimmed)) return "not-a-key";
  return null;
}


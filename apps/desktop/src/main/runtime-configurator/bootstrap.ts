/**
 * The Electron end of the Runtime Configurator: where the abstract ports get
 * their real implementations, and where the apply pipeline meets sign-in.
 *
 * Nothing in this file invents product behaviour — it resolves paths, builds the
 * `RuntimeProfile` from configuration that exists today, and calls `apply()`
 * once per signed-in account. Two boundaries are deliberate:
 *
 *   1. It never blocks sign-in. A failed apply flips the UI state to
 *      "未配置" and logs a desensitised reason; the user stays logged in and can
 *      keep using the app's own model path.
 *   2. It never logs or renders a credential. The only credential information
 *      that leaves this module is `credential_source` — `company` or
 *      `personal` — plus the attempt reasons.
 *
 * Profile source (explicitly interim): the server endpoint that mints the
 * per-user gateway key (`POST /api/runtime/credentials`, RUNTIME-CONFIGURATOR.md
 * §1.2) is not implemented yet, and does not exist in this repo. Until it does,
 * the gateway address, model list and default model come from the process
 * environment, so this module is testable and harmless on a machine where the
 * endpoint is absent: with no base URL there is no profile, and with no stored
 * credential the apply stops at `NoCredentialError` before writing a byte.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { hostname, homedir as osHomedir } from "node:os";
import { join } from "node:path";
import { ipcMain, safeStorage } from "electron";

import {
  clearPersonalCredential,
  describeCredentials,
  readCredentialValue,
  resolveCredential,
  storePersonalCredential,
  validatePersonalKey,
  CredentialUnavailableError,
  NoCredentialError,
  type CredentialStatusSummary,
  type PersonalKeyRejection,
} from "./credential";
import { upsertCredentialRef, removeCredentialRef } from "./dsh-credentials";
import { createBackupStore, createNodeConfiguratorFs } from "./fs";
import { createRuntimeConfigurator } from "./index";
import { createSafeStorageKeychain, type Keychain, type SecretCipher } from "./keychain";
import { createHttpProbe } from "./probe";
import type { ConfiguratorLogger } from "./ports";
import type {
  ApplyFailure,
  CredentialSource,
  ProviderProfile,
  RunRecord,
  RuntimeProfile,
  TargetSelection,
} from "./types";

/** Default ref name for the relay key when the provider config does not name one. */
const ENV_REF_NAME = "MULTICA_RELAY_KEY";

/** Harness profile this module writes, and the one `--list-models` reads back. */
const DSH_PROFILE_NAME = "multica";

/** How long the post-apply model list check may take before it is abandoned. */
const MODEL_CHECK_TIMEOUT_MS = 3_000;

/**
 * The gateway a signed-in account was issued, as the server's credential
 * response describes it. Optional everywhere: a build with neither this nor
 * `MORECHAT_RELAY_BASE_URL` simply has nothing to configure.
 */
export interface RelayGateway {
  readonly baseUrl: string;
  readonly models?: readonly string[];
}

export const RUNTIME_CONFIGURATOR_STATUS_CHANNEL = "runtime-configurator:status";
export const RUNTIME_CONFIGURATOR_GET_STATUS_CHANNEL = "runtime-configurator:get-status";
export const RUNTIME_CONFIGURATOR_SET_PERSONAL_KEY_CHANNEL =
  "runtime-configurator:set-personal-key";
export const RUNTIME_CONFIGURATOR_CLEAR_PERSONAL_KEY_CHANNEL =
  "runtime-configurator:clear-personal-key";

export type RuntimeConfiguratorState =
  | "idle"
  | "applying"
  | "configured"
  | "unconfigured";

export interface RuntimeConfiguratorStatus {
  readonly state: RuntimeConfiguratorState;
  /** UI text, already free of credential material. */
  readonly detail: string;
  readonly credentialSource?: CredentialSource;
  readonly applyId?: string;
  readonly updatedAt?: string;
  /**
   * Which credentials are stored for the signed-in account, so the 模型凭据
   * section can render without waiting for an apply. Absent before sign-in and
   * when the keychain read itself failed; its absence means "unknown", and the
   * page asks for `get-status` rather than drawing a conclusion.
   */
  readonly credentials?: CredentialStatusSummary;
}

export interface RuntimeConfiguratorHandle {
  /**
   * Runs the full pipeline for a freshly signed-in account. Never throws.
   *
   * `gateway` is what the server issued for this account; it outranks the
   * environment, and a different gateway re-arms the run for the same account.
   */
  readonly applyForUser: (
    userId: string,
    gateway?: RelayGateway,
  
    options?: { readonly force?: boolean },
  ) => Promise<RuntimeConfiguratorStatus>;
  /** Forgets the account (logout / account switch). */
  readonly reset: () => void;
  readonly status: () => RuntimeConfiguratorStatus;
  /**
   * Environment entries a spawned daemon needs: the relay key under the name the
   * provider configuration references, and the gateway address. Empty until a
   * credential is configured, and empty again after logout.
   */
  readonly relayEnv: () => Readonly<Record<string, string>>;
  /**
   * Status plus a *fresh* credential readback, for a settings page opening
   * long after the last state change. Read-only: it neither re-runs the apply
   * nor re-broadcasts, so a page that refreshes on mount cannot loop with the
   * status subscription.
   */
  readonly getStatus: () => Promise<RuntimeConfiguratorStatus>;
  readonly setPersonalKey: (
    userId: string,
    value: string,
  ) => Promise<RuntimeConfiguratorStatus>;
  readonly clearPersonalKey: (userId: string) => Promise<RuntimeConfiguratorStatus>;
}

export interface RuntimeConfiguratorOptions {
  /** `<userData>`; the encrypted keychain store lives under it. */
  readonly userDataDir: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly homedir?: string;
  readonly hostId?: string;
  readonly logger?: ConfiguratorLogger;
  readonly fetchImpl?: typeof fetch;
  /** Gateway known before the first apply (already-received credential response). */
  readonly gateway?: RelayGateway;
  /** Pushes status to the renderers. Called on every state change. */
  readonly notify?: (status: RuntimeConfiguratorStatus) => void;
  readonly now?: () => Date;
  readonly newApplyId?: () => string;
}

const DEFAULT_MODEL = "claude-sonnet-4-5";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function newApplyId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function consoleLogger(): ConfiguratorLogger {
  const write = (level: "info" | "warn") => (message: string, fields?: Record<string, unknown>) => {
    const suffix = fields && Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : "";
    // Fields are paths, ids, counts, hashes and source names — never content.
    console[level](`[runtime-configurator] ${message}${suffix}`);
  };
  return { info: write("info"), warn: write("warn") };
}

function describeFailure(failure: ApplyFailure): string {
  switch (failure.code) {
    case "plan-empty":
      return "未配置：没有选中任何本地 CLI 目标";
    case "backup-failed":
      return "未配置：备份失败，未改动任何配置文件";
    case "merge-failed":
    case "write-failed":
      return "未配置：写入失败，已回滚";
    case "verify-failed":
      return "未配置：写入校验失败，已回滚全部改动";
    case "rollback-failed":
      return "配置失败且回滚失败，请检查本地配置文件的备份目录";
    case "credential-unavailable":
      return "未配置：公司额度不可用，请在设置里填自己的 Key 或联系管理员";
  }
}

/** Trims and drops empty entries; `undefined` and `[]` mean "no list given". */
function normaliseModels(models: readonly string[] | undefined): readonly string[] {
  return (models ?? [])
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
}

/** Model allowlist mirrored from configuration; display + validation only. */
function readModels(env: NodeJS.ProcessEnv): readonly string[] {
  const raw = env.MORECHAT_RELAY_MODELS?.trim();
  if (!raw) return [env.MORECHAT_RELAY_MODEL?.trim() || DEFAULT_MODEL];
  const models = raw
    .split(",")
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
  return models.length > 0 ? models : [DEFAULT_MODEL];
}

/** True when a gateway address is actually usable (present and not blank). */
export function hasGatewayAddress(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Builds the desired state, or `null` when this machine has no gateway address
 * yet. Returning `null` is not a failure: it is "nothing to configure".
 *
 * Precedence is explicit `gateway` (what the server issued for this account) >
 * `MORECHAT_RELAY_BASE_URL` (developer / packaged override) > nothing. Models
 * follow the same order: a non-empty `gateway.models` beats
 * `MORECHAT_RELAY_MODELS`, which beats the single default.
 */
export function buildRelayProfile(input: {
  readonly userId: string;
  readonly hostId: string;
  readonly env: NodeJS.ProcessEnv;
  readonly homedir: string;
  readonly gateway?: RelayGateway;
}): RuntimeProfile | null {
  const gatewayModels = normaliseModels(input.gateway?.models);
  const baseUrl =
    input.gateway?.baseUrl?.trim() || input.env.MORECHAT_RELAY_BASE_URL?.trim();
  if (!baseUrl) return null;

  const models = gatewayModels.length > 0 ? gatewayModels : readModels(input.env);
  const envDefault = input.env.MORECHAT_RELAY_MODEL?.trim();
  // An explicitly named default only survives when the gateway actually serves
  // it; otherwise the first allowed model is the only safe choice.
  const defaultModel =
    envDefault && models.includes(envDefault) ? envDefault : models[0] || DEFAULT_MODEL;
  const envName = input.env.MORECHAT_RELAY_KEY_ENV?.trim() || ENV_REF_NAME;

  const provider: ProviderProfile = {
    id: "morechat-relay",
    kind: "relay",
    label: "morechat 网关",
    baseUrl,
    // A reference, never a value — this is what the writers render.
    apiKeyRef: { kind: "env", name: envName },
    models,
    defaultModel,
  };

  const dshHome = input.env.DSH_HOME?.trim() || join(input.homedir, ".dsh");
  const targets: readonly TargetSelection[] = [
    {
      id: "claude-code",
      paths: {
        settingsPath: join(input.homedir, ".claude", "settings.json"),
        keyHelperPath: join(input.homedir, ".multica", "bin", "relay-key"),
      },
    },
    {
      id: "codex",
      paths: {
        configPath: join(input.homedir, ".codex", "config.toml"),
        authPath: join(input.homedir, ".codex", "auth.json"),
      },
    },
    {
      id: "dsh",
      paths: { home: dshHome, profileName: DSH_PROFILE_NAME },
    },
  ];

  return {
    schemaVersion: 1,
    profileId: `${input.userId}@${input.hostId}`,
    provider,
    targets,
  };
}

/**
 * Dedupe key for "we already ran the pipeline for this account". The gateway
 * fingerprint belongs in it: the same account repointed at another gateway (or
 * another model list) must run again instead of keeping the previous status.
 */
function attemptKeyOf(userId: string, gateway: RelayGateway | undefined): string {
  const baseUrl = gateway?.baseUrl?.trim();
  if (!baseUrl) return userId;
  const models = normaliseModels(gateway?.models).join(",");
  // A short digest, never the address itself: this only has to differ.
  return `${userId}#${sha256(`${baseUrl}\n${models}`).slice(0, 8)}`;
}

export interface ProfileModelCheck {
  /** `env.DSH_BIN` when set, otherwise the `dsh` on PATH. */
  readonly binary: string;
  readonly profileName: string;
  /** The allowlist this apply just wrote; only membership is reported. */
  readonly models: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

export interface ProfileModelCheckResult {
  /** True when at least one allowlisted model came back. */
  readonly ok: boolean;
  /** How many models the profile listed at all. */
  readonly listed: number;
}

/**
 * Post-apply readback: asks the harness which models `--profile multica` exposes
 * and logs only booleans and counts — never the list, because a gateway may name
 * models that identify the account.
 *
 * This runs after a successful apply and must never be able to undo it, so it
 * resolves instead of rejecting and swallows every failure into a `warn`.
 */
export function verifyProfileModels(
  check: ProfileModelCheck,
  logger: ConfiguratorLogger,
): Promise<ProfileModelCheckResult> {
  const expected = normaliseModels(check.models);
  return new Promise((resolve) => {
    const settle = (result: ProfileModelCheckResult): void => resolve(result);
    try {
      execFile(
        check.binary,
        ["--profile", check.profileName, "--list-models"],
        {
          timeout: check.timeoutMs ?? MODEL_CHECK_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
          // The shipped harness is a `.cmd` on Windows, which execFile cannot run
          // without a shell; the quoted argument list is still handled by Node.
          shell: process.platform === "win32",
          ...(check.env ? { env: check.env } : {}),
        },
        (error, stdout) => {
          if (error) {
            const code = (error as NodeJS.ErrnoException).code ?? "unknown";
            logger.warn("runtime-configurator: model list check failed", {
              reason: typeof code === "string" ? code : "unknown",
              ...(error.killed ? { timed_out: true } : {}),
            });
            settle({ ok: false, listed: 0 });
            return;
          }
          // `--list-models` prints one JSON document (`{"v":1,"type":"models",…}`)
          // beside its log lines, so the ids have to be read out of that document
          // rather than out of every line of output.
          const listed = new Set<string>();
          for (const line of String(stdout ?? "").split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('{"v":1')) continue;
            try {
              const parsed = JSON.parse(trimmed) as { models?: { id?: unknown }[] };
              for (const model of parsed.models ?? []) {
                if (typeof model.id === "string") listed.add(model.id);
              }
            } catch {
              // A truncated or foreign line is not our document.
            }
          }
          // The harness qualifies every id with its provider route (`morechat/x`),
          // while the plan lists bare model names.
          const found = expected.filter((model) =>
            [...listed].some((id) => id === model || id.endsWith(`/${model}`)),
          ).length;
          logger.info("runtime-configurator: model list check", {
            ok: found > 0,
            models_expected: expected.length,
            models_listed: listed.size,
            models_found: found,
          });
          settle({ ok: found > 0, listed: listed.size });
        },
      );
    } catch {
      // A binary that cannot even be spawned is the same outcome as a failed
      // run: reported, not thrown.
      logger.warn("runtime-configurator: model list check failed", { reason: "spawn" });
      settle({ ok: false, listed: 0 });
    }
  });
}

export function installRuntimeConfigurator(
  options: RuntimeConfiguratorOptions,
): RuntimeConfiguratorHandle {
  const env = options.env ?? process.env;
  const home = options.homedir ?? osHomedir();
  const hostId = options.hostId ?? hostname();
  const logger = options.logger ?? consoleLogger();
  const now = options.now ?? (() => new Date());
  const nextApplyId = options.newApplyId ?? newApplyId;

  const fs = createNodeConfiguratorFs({ logger });
  const cipher: SecretCipher = {
    available: safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (blob) => safeStorage.decryptString(blob),
  };
  const keychain: Keychain = createSafeStorageKeychain({
    fs,
    path: join(options.userDataDir, "runtime-configurator", "keychain.json"),
    cipher,
  });
  const backupRoot = join(
    home,
    ".multica",
    "profiles",
    `desktop-${hostId.replace(/[^0-9A-Za-z._-]+/g, "-")}`,
    "runtime-config-backups",
  );
  const backup = createBackupStore({ fs, root: backupRoot, hash: sha256, logger });
  const probe = createHttpProbe({
    fetchImpl: options.fetchImpl,
    timeoutMs: Number(env.MORECHAT_RELAY_PROBE_TIMEOUT_MS ?? "4000") || 4_000,
  });

  let status: RuntimeConfiguratorStatus = {
    state: "idle",
    detail: "尚未开始配置",
  };
  let currentUserId: string | null = null;
  let lastRecord: RunRecord | null = null;
  /**
   * Account + gateway we already ran the pipeline for. Renderers report the auth
   * session on every refresh; without this guard a flaky gateway would be probed
   * on each report. Re-armed by `reset()`, `setPersonalKey()`, `clearPersonalKey()`
   * — and by any change of gateway, because the key carries its fingerprint.
   */
  let attemptedKey: string | null = null;
  /**
   * Env handed to the daemon once a credential is configured: the harness provider
   * reads the key from an env var, so this is the last link between "the account
   * has a key" and "an agent run can call a model". Cleared on logout.
   */
  let relay: Record<string, string> | null = null;

  /**
   * Writes the relay key into `$DSH_HOME/.credentials.yaml` under the name the
   * provider configuration references. Written through a temp file and renamed so a
   * crash cannot leave the harness with a truncated credential store.
   */
  async function writeHarnessRef(name: string, value: string): Promise<void> {
    const dshHome = env.DSH_HOME?.trim() || join(home, ".dsh");
    const path = join(dshHome, ".credentials.yaml");
    const current = (await fs.read(path).catch(() => null)) ?? "";
    const next = upsertCredentialRef(current, name, value);
    if (next === current) return;
    await fs.mkdirp(dshHome);
    await fs.writeFileAtomic(path, next, 0o600);
  }

  /** Removes our ref on logout; other refs and every grant stay. */
  async function clearHarnessRef(): Promise<void> {
    const dshHome = env.DSH_HOME?.trim() || join(home, ".dsh");
    const path = join(dshHome, ".credentials.yaml");
    const current = await fs.read(path).catch(() => null);
    if (!current) return;
    const name = ENV_REF_NAME;
    const next = removeCredentialRef(current, name);
    if (next === current) return;
    await fs.writeFileAtomic(path, next, 0o600);
  }

  function publish(next: RuntimeConfiguratorStatus): RuntimeConfiguratorStatus {
    status = next;
    try {
      options.notify?.(status);
    } catch (err) {
      logger.warn("runtime-configurator: status notify failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return status;
  }

  /** The env-var name a writer rendered for this provider, or "" when it is not env-based. */
  function relayEnvName(ref: { kind: string; name?: string }): string {
    return ref.kind === "env" ? (ref.name ?? "") : "";
  }

  async function applyForUser(
    userId: string,
    gateway?: RelayGateway,
    options: { readonly force?: boolean } = {},
  ): Promise<RuntimeConfiguratorStatus> {
    return runApply(userId, options.force === true, gateway);
  }

  /**
   * The credential half of a status, read fresh from the keychain. Absent
   * before sign-in, and swallowed (with a desensitised log line) when the
   * keychain read itself fails — a status that cannot answer "what is stored"
   * is still a status worth showing, but it must not guess.
   */
  async function readCredentials(): Promise<CredentialStatusSummary | undefined> {
    const userId = currentUserId;
    if (!userId) return undefined;
    try {
      return await describeCredentials(keychain, userId);
    } catch (err) {
      logger.warn("runtime-configurator: credential status read failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  /**
   * Publish a state change together with the credential readback. Every path
   * that stores or clears a key goes through here, so the renderer never has to
   * assume that "configured" still holds after a click it just made.
   */
  async function publishWithCredentials(
    next: RuntimeConfiguratorStatus,
  ): Promise<RuntimeConfiguratorStatus> {
    const credentials = await readCredentials();
    return publish({ ...next, ...(credentials ? { credentials } : {}) });
  }

  async function runApply(
    userId: string,
    force: boolean,
    gateway?: RelayGateway,
  ): Promise<RuntimeConfiguratorStatus> {
    currentUserId = userId;
    // An install-time gateway is the default; a per-call one is what the server
    // just issued for this account.
    const effectiveGateway = gateway ?? options.gateway;
    const attemptKey = attemptKeyOf(userId, effectiveGateway);
    if (!force && attemptedKey === attemptKey && status.state !== "applying") {
      return status;
    }
    attemptedKey = attemptKey;
    const profile = buildRelayProfile({
      userId,
      hostId,
      env,
      homedir: home,
      ...(effectiveGateway ? { gateway: effectiveGateway } : {}),
    });
    if (!profile) {
      // Signed in, but this build has no gateway address to point the CLIs at.
      // Say so once, in a way an operator can grep for.
      logger.info("runtime-configurator: skipped apply", {
        reason: "gateway-not-configured",
      });
      return await publishWithCredentials({
        state: "unconfigured",
        detail: "未配置：还没有收到网关地址",
        updatedAt: now().toISOString(),
      });
    }

    publish({ ...status, state: "applying", detail: "正在写入本机 CLI 配置…" });

    const configurator = createRuntimeConfigurator({
      fs,
      backup,
      hash: sha256,
      newApplyId: nextApplyId,
      now,
      logger,
      userId,
      keychain,
      probe,
      onRecord: (entry) => {
        lastRecord = entry;
      },
    });

    try {
      const outcome = await configurator.apply(profile);
      const updatedAt = now().toISOString();
      if (outcome.ok) {
        // The apply proved the key works, so hand the daemon what it needs to use
        // it: the provider route plus the two variables the harness reads. A read
        // failure leaves the previous env in place instead of clearing it.
        const stored = await readCredentialValue(
          keychain,
          await resolveCredential(profile, { keychain, userId, logger }),
        ).catch(() => null);
        if (stored) {
          // The harness resolves a provider's `apiKeyEnv` against its own credential
          // store, so the key has to live there as well as in the child environment;
          // an env var alone changes nothing for model calls.
          await writeHarnessRef(relayEnvName(profile.provider.apiKeyRef), stored).catch((err: unknown) => {
            logger.warn("runtime-configurator: harness credential store write failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
          relay = {
            [relayEnvName(profile.provider.apiKeyRef)]: stored,
            DEEPSEEK_BASE_URL: profile.provider.baseUrl,
          };
        }
        // Fire-and-forget readback: an apply that already succeeded must not be
        // downgraded by a harness that is slow, missing, or mid-upgrade.
        void verifyProfileModels(
          {
            // Prefer the harness the desktop shipped: in a packaged app nothing named
      // `dsh` is on PATH, so a bare name would fail with ENOENT on every apply.
      binary: env.DSH_BIN?.trim() || process.env["MULTICA_DSH_PATH"]?.trim() || "dsh",
            profileName: DSH_PROFILE_NAME,
            models: profile.provider.models,
            env,
          },
          logger,
        );
        return await publishWithCredentials({
          state: "configured",
          detail:
            outcome.changed.length === 0
              ? "已配置（无需改动）"
              : `已配置 ${outcome.changed.length} 个文件`,
          ...(outcome.credentialSource
            ? { credentialSource: outcome.credentialSource }
            : {}),
          applyId: outcome.applyId,
          updatedAt,
        });
      }
      return await publishWithCredentials({
        state: "unconfigured",
        detail: describeFailure(outcome.failure),
        ...(lastCredentialSource() ? { credentialSource: lastCredentialSource() } : {}),
        ...(lastRecord ? { applyId: lastRecord.applyId } : {}),
        updatedAt,
      });
    } catch (err) {
      // Credential failures land here by design: they are not disk failures, so
      // `apply()` throws rather than returning a half-applied outcome.
      const credentialSource = lastCredentialSource();
      const detail =
        err instanceof CredentialUnavailableError
          ? err.hint
          : err instanceof NoCredentialError
            ? "未配置：没有可用凭据，请重新登录或填自己的 Key"
            : `未配置：${err instanceof Error ? err.message : String(err)}`;
      logger.warn("runtime-configurator: apply failed", {
        reason: err instanceof Error ? err.name : "unknown",
      });
      return await publishWithCredentials({
        state: "unconfigured",
        detail,
        ...(credentialSource ? { credentialSource } : {}),
        updatedAt: now().toISOString(),
      });
    }
  }

  function lastCredentialSource(): CredentialSource | undefined {
    const source = lastRecord?.credentialSource;
    return source === "company" || source === "personal" ? source : undefined;
  }

  async function setPersonalKey(
    userId: string,
    value: string,
  ): Promise<RuntimeConfiguratorStatus> {
    const rejection = validatePersonalKey(value);
    if (rejection) {
      // The renderer maps the code to its own copy; the main process has no
      // locale context, and the detail string stays content-free.
      logger.warn("runtime-configurator: personal key rejected", { reason: rejection });
      return await publishWithCredentials({ ...status, detail: "个人 Key 未保存：格式不符合要求" });
    }
    if (!keychain.available) {
      return await publishWithCredentials({
        ...status,
        detail: "本机没有可用的系统钥匙串，无法保存 Key",
      });
    }
    await storePersonalCredential(keychain, userId, value.trim());
    logger.info("runtime-configurator: personal key stored", { only_this_device: true });
    return runApply(userId, true);
  }

  async function clearPersonalKey(
    userId: string,
  ): Promise<RuntimeConfiguratorStatus> {
    await clearPersonalCredential(keychain, userId);
    logger.info("runtime-configurator: personal key cleared");
    return runApply(userId, true);
  }

  /**
   * Fresh status for a page that is opening, not reacting. Reads the keychain
   * but changes nothing and broadcasts nothing: a settings page that refreshes
   * on mount must not be able to feed itself through the status subscription.
   */
  async function getStatus(): Promise<RuntimeConfiguratorStatus> {
    const credentials = await readCredentials();
    return credentials ? { ...status, credentials } : status;
  }

  installIpc();

  // One line at startup so an operator can tell "nothing to configure yet" apart
  // from "the feature never ran". Paths and booleans only — never content.
  logger.info("runtime-configurator: installed", {
    keychain_available: keychain.available,
    gateway_configured:
      hasGatewayAddress(env.MORECHAT_RELAY_BASE_URL) ||
      hasGatewayAddress(options.gateway?.baseUrl),
    backup_root: backupRoot,
    profile_targets: 3,
  });

  function installIpc(): void {
    ipcMain.removeHandler(RUNTIME_CONFIGURATOR_GET_STATUS_CHANNEL);
    ipcMain.removeHandler(RUNTIME_CONFIGURATOR_SET_PERSONAL_KEY_CHANNEL);
    ipcMain.removeHandler(RUNTIME_CONFIGURATOR_CLEAR_PERSONAL_KEY_CHANNEL);

    // Page initialisation: the renderer asks once on mount instead of relying
    // on a push it may have missed (a window opened after the last apply never
    // saw one).
    ipcMain.handle(RUNTIME_CONFIGURATOR_GET_STATUS_CHANNEL, async () => getStatus());

    ipcMain.handle(
      RUNTIME_CONFIGURATOR_SET_PERSONAL_KEY_CHANNEL,
      async (_event, value: unknown) => {
        if (typeof value !== "string") return { ok: false, reason: "invalid" } as const;
        const rejection: PersonalKeyRejection | null = validatePersonalKey(value);
        if (rejection) return { ok: false, reason: rejection } as const;
        const userId = currentUserId;
        if (!userId) return { ok: false, reason: "signed-out" } as const;
        const next = await setPersonalKey(userId, value);
        return { ok: true, status: next } as const;
      },
    );
    ipcMain.handle(
      RUNTIME_CONFIGURATOR_CLEAR_PERSONAL_KEY_CHANNEL,
      async () => {
        const userId = currentUserId;
        if (!userId) return { ok: false, reason: "signed-out" } as const;
        const next = await clearPersonalKey(userId);
        return { ok: true, status: next } as const;
      },
    );
  }

  return {
    applyForUser,
    reset: () => {
      currentUserId = null;
      lastRecord = null;
      attemptedKey = null;
      if (relay) void clearHarnessRef();
      relay = null;
      publish({ state: "idle", detail: "已退出登录" });
    },
    status: () => status,
    getStatus,
    setPersonalKey,
    clearPersonalKey,
    /**
     * Environment a spawned daemon needs so the harness can reach the gateway
     * without anyone signing into DeepSeek on this machine.
     *
     * Returns names and values, never files: the key lives in the keychain and
     * crosses into a child process's environment, so it is not written to disk and
     * disappears with the process. Empty when no credential is configured, which
     * leaves the harness on whatever it had before.
     */
    relayEnv: () => (relay ? { ...relay } : {}),
  };
}

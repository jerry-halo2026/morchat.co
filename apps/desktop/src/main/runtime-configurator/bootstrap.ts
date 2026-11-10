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

import { createHash } from "node:crypto";
import { hostname, homedir as osHomedir } from "node:os";
import { join } from "node:path";
import { ipcMain, safeStorage } from "electron";

import {
  clearPersonalCredential,
  storePersonalCredential,
  CredentialUnavailableError,
  NoCredentialError,
} from "./credential";
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

export const RUNTIME_CONFIGURATOR_STATUS_CHANNEL = "runtime-configurator:status";
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
}

export interface RuntimeConfiguratorHandle {
  /** Runs the full pipeline for a freshly signed-in account. Never throws. */
  readonly applyForUser: (userId: string) => Promise<RuntimeConfiguratorStatus>;
  /** Forgets the account (logout / account switch). */
  readonly reset: () => void;
  readonly status: () => RuntimeConfiguratorStatus;
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

/**
 * Builds the desired state, or `null` when this machine has no gateway address
 * yet. Returning `null` is not a failure: it is "nothing to configure".
 */
export function buildRelayProfile(input: {
  readonly userId: string;
  readonly hostId: string;
  readonly env: NodeJS.ProcessEnv;
  readonly homedir: string;
}): RuntimeProfile | null {
  const baseUrl = input.env.MORECHAT_RELAY_BASE_URL?.trim();
  if (!baseUrl) return null;

  const models = readModels(input.env);
  const defaultModel = input.env.MORECHAT_RELAY_MODEL?.trim() || models[0] || DEFAULT_MODEL;
  const envName = input.env.MORECHAT_RELAY_KEY_ENV?.trim() || "MULTICA_RELAY_KEY";

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
      paths: { home: dshHome, profileName: "multica" },
    },
  ];

  return {
    schemaVersion: 1,
    profileId: `${input.userId}@${input.hostId}`,
    provider,
    targets,
  };
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
   * Account we already ran the pipeline for. Renderers report the auth session
   * on every refresh; without this guard a flaky gateway would be probed on each
   * report. Re-armed by `reset()`, `setPersonalKey()` and `clearPersonalKey()`.
   */
  let attemptedUserId: string | null = null;

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

  async function applyForUser(userId: string): Promise<RuntimeConfiguratorStatus> {
    return runApply(userId, false);
  }

  async function runApply(
    userId: string,
    force: boolean,
  ): Promise<RuntimeConfiguratorStatus> {
    currentUserId = userId;
    if (!force && attemptedUserId === userId && status.state !== "applying") {
      return status;
    }
    attemptedUserId = userId;
    const profile = buildRelayProfile({ userId, hostId, env, homedir: home });
    if (!profile) {
      // Signed in, but this build has no gateway address to point the CLIs at.
      // Say so once, in a way an operator can grep for.
      logger.info("runtime-configurator: skipped apply", {
        reason: "gateway-not-configured",
      });
      return publish({
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
        return publish({
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
      return publish({
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
      return publish({
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
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return publish({ ...status, detail: "个人 Key 为空，未保存" });
    }
    if (!keychain.available) {
      return publish({ ...status, detail: "本机没有可用的系统钥匙串，无法保存 Key" });
    }
    await storePersonalCredential(keychain, userId, trimmed);
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

  installIpc();

  // One line at startup so an operator can tell "nothing to configure yet" apart
  // from "the feature never ran". Paths and booleans only — never content.
  logger.info("runtime-configurator: installed", {
    keychain_available: keychain.available,
    gateway_configured: typeof env.MORECHAT_RELAY_BASE_URL === "string" && env.MORECHAT_RELAY_BASE_URL.trim().length > 0,
    backup_root: backupRoot,
    profile_targets: 3,
  });

  function installIpc(): void {
    ipcMain.removeHandler(RUNTIME_CONFIGURATOR_SET_PERSONAL_KEY_CHANNEL);
    ipcMain.removeHandler(RUNTIME_CONFIGURATOR_CLEAR_PERSONAL_KEY_CHANNEL);

    ipcMain.handle(
      RUNTIME_CONFIGURATOR_SET_PERSONAL_KEY_CHANNEL,
      async (_event, value: unknown) => {
        if (typeof value !== "string") return { ok: false, reason: "invalid" } as const;
        const userId = currentUserId;
        if (!userId) return { ok: false, reason: "signed-out" } as const;
        const next = await setPersonalKey(userId, value);
        return { ok: next.state === "configured", status: next } as const;
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
      attemptedUserId = null;
      publish({ state: "idle", detail: "已退出登录" });
    },
    status: () => status,
    setPersonalKey,
    clearPersonalKey,
  };
}

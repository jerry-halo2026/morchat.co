/**
 * The renderer half of the 模型凭据 settings section.
 *
 * The main process owns every secret (see `runtime-configurator/credential.ts`:
 * company key in the OS keychain, personal key in the OS keychain, labelled
 * "this device only"). This module is the only door between that state and a
 * React component, and it stays deliberately narrow:
 *
 *   - `getStatus`       read-only initialisation; the pushed status can be
 *                       missed by a window that opened after the last change.
 *   - `setPersonalKey`  the value travels IN and never comes back out. The
 *                       reply carries state (`configured`, last-4 suffix), not
 *                       the key.
 *   - `clearPersonalKey` forget this device's personal key.
 *   - `onStatusChange`  the push channel main already broadcasts on.
 *
 * Kept in `preload/` (not `shared/`) because only these two files may import
 * `electron` from the renderer side.
 */

import { ipcRenderer } from "electron";

/** Which credential a run uses. Mirrors the main-process type of the same name. */
export type CredentialSource = "company" | "personal";

/** One stored credential. `suffix` is the last four characters, never the key. */
export interface CredentialSlotStatus {
  configured: boolean;
  suffix: string | null;
}

/** Everything the section renders, plus `keychainAvailable` for the degraded case. */
export interface CredentialStatusSummary {
  keychainAvailable: boolean;
  company: CredentialSlotStatus;
  personal: CredentialSlotStatus;
  /** Which source a run would try first; null when neither is stored. */
  effective: CredentialSource | null;
}

export type RuntimeConfiguratorState = "idle" | "applying" | "configured" | "unconfigured";

export interface RuntimeConfiguratorStatus {
  state: RuntimeConfiguratorState;
  detail: string;
  credentialSource?: CredentialSource;
  applyId?: string;
  updatedAt?: string;
  credentials?: CredentialStatusSummary;
}

/**
 * Why a personal key was not stored. Machine codes, not prose: the renderer owns
 * the copy (seven locales), and main has no locale context to pick one.
 */
export type PersonalKeyRejection =
  | "invalid"
  | "signed-out"
  | "empty"
  | "too-short"
  | "not-a-key"
  | "contains-whitespace";

export type SetPersonalKeyResult =
  | { ok: true; status: RuntimeConfiguratorStatus }
  | { ok: false; reason: PersonalKeyRejection };

export type ClearPersonalKeyResult =
  | { ok: true; status: RuntimeConfiguratorStatus }
  | { ok: false; reason: "signed-out" };

export interface RuntimeConfiguratorAPI {
  /** Status plus a fresh keychain readback. Safe to call on every mount. */
  getStatus: () => Promise<RuntimeConfiguratorStatus>;
  /** Store this device's personal key. The key is never echoed back. */
  setPersonalKey: (value: string) => Promise<SetPersonalKeyResult>;
  /** Forget this device's personal key. */
  clearPersonalKey: () => Promise<ClearPersonalKeyResult>;
  /** Subscribe to pushed status changes. Returns an unsubscribe function. */
  onStatusChange: (callback: (status: RuntimeConfiguratorStatus) => void) => () => void;
}

export const RUNTIME_CONFIGURATOR_STATUS_CHANNEL = "runtime-configurator:status";
export const RUNTIME_CONFIGURATOR_GET_STATUS_CHANNEL = "runtime-configurator:get-status";
export const RUNTIME_CONFIGURATOR_SET_PERSONAL_KEY_CHANNEL =
  "runtime-configurator:set-personal-key";
export const RUNTIME_CONFIGURATOR_CLEAR_PERSONAL_KEY_CHANNEL =
  "runtime-configurator:clear-personal-key";

export function createRuntimeConfiguratorAPI(): RuntimeConfiguratorAPI {
  return {
    getStatus: () => ipcRenderer.invoke(RUNTIME_CONFIGURATOR_GET_STATUS_CHANNEL),
    setPersonalKey: (value) =>
      ipcRenderer.invoke(RUNTIME_CONFIGURATOR_SET_PERSONAL_KEY_CHANNEL, value),
    clearPersonalKey: () =>
      ipcRenderer.invoke(RUNTIME_CONFIGURATOR_CLEAR_PERSONAL_KEY_CHANNEL),
    onStatusChange: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, status: RuntimeConfiguratorStatus) =>
        callback(status);
      ipcRenderer.on(RUNTIME_CONFIGURATOR_STATUS_CHANNEL, handler);
      return () => ipcRenderer.removeListener(RUNTIME_CONFIGURATOR_STATUS_CHANNEL, handler);
    },
  };
}

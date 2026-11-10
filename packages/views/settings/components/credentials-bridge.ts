// Desktop-only helpers for the 模型凭据 (model credential) settings section.
//
// The credential itself never crosses into this package: the preload bridge
// exposes state (`configured`, the last four characters, which source wins) and
// two write operations, and the main process owns every secret. These wrappers
// keep the React component SSR-safe — on web `window.runtimeConfigurator` does
// not exist, and the section degrades to "only configurable in the desktop app"
// instead of crashing the settings page.
//
// Shapes are declared structurally here rather than imported from
// apps/desktop: the views package must typecheck without the Electron app, and
// the preload module is the only place allowed to import `electron`.

export type CredentialSource = "company" | "personal";

export interface CredentialSlotStatus {
  configured: boolean;
  suffix: string | null;
}

export interface CredentialStatusSummary {
  keychainAvailable: boolean;
  company: CredentialSlotStatus;
  personal: CredentialSlotStatus;
  /** Which source a run would try first; null when neither is stored. */
  effective: CredentialSource | null;
}

export type RuntimeConfiguratorState =
  | "idle"
  | "applying"
  | "configured"
  | "unconfigured";

export interface RuntimeConfiguratorStatus {
  state: RuntimeConfiguratorState;
  detail: string;
  credentialSource?: CredentialSource;
  applyId?: string;
  updatedAt?: string;
  credentials?: CredentialStatusSummary;
}

/** Machine codes from the main process; the component owns the copy. */
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

export interface RuntimeConfiguratorBridge {
  getStatus: () => Promise<RuntimeConfiguratorStatus>;
  setPersonalKey: (value: string) => Promise<SetPersonalKeyResult>;
  clearPersonalKey: () => Promise<ClearPersonalKeyResult>;
  onStatusChange: (
    callback: (status: RuntimeConfiguratorStatus) => void,
  ) => () => void;
}

function readBridge(): RuntimeConfiguratorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const bridge = (
    window as unknown as { runtimeConfigurator?: Partial<RuntimeConfiguratorBridge> }
  ).runtimeConfigurator;
  // Presence of the write path is the test: a partial bridge (an older desktop
  // build that only pushes status) must not render a form that cannot submit.
  if (
    !bridge ||
    typeof bridge.getStatus !== "function" ||
    typeof bridge.setPersonalKey !== "function" ||
    typeof bridge.clearPersonalKey !== "function"
  ) {
    return undefined;
  }
  return bridge as RuntimeConfiguratorBridge;
}

/** True inside the desktop shell, i.e. when the credential form can work. */
export function isCredentialConfigurable(): boolean {
  return readBridge() !== undefined;
}

/**
 * Current credential state, or `null` when this build cannot answer (web, or a
 * desktop build without the bridge). `null` is not an error: it means "not
 * configurable here", which the section says out loud.
 */
export async function readCredentialStatus(): Promise<RuntimeConfiguratorStatus | null> {
  const bridge = readBridge();
  if (!bridge) return null;
  return bridge.getStatus();
}

/** Store this device's personal key. A rejected value never reaches disk. */
export async function storePersonalKey(value: string): Promise<SetPersonalKeyResult> {
  const bridge = readBridge();
  if (!bridge) return { ok: false, reason: "invalid" };
  return bridge.setPersonalKey(value);
}

/** Forget this device's personal key. */
export async function forgetPersonalKey(): Promise<ClearPersonalKeyResult> {
  const bridge = readBridge();
  if (!bridge) return { ok: false, reason: "signed-out" };
  return bridge.clearPersonalKey();
}

/** Follow pushed status changes (apply finished, key stored/cleared elsewhere). */
export function subscribeCredentialStatus(
  callback: (status: RuntimeConfiguratorStatus) => void,
): () => void {
  const bridge = readBridge();
  if (!bridge || typeof bridge.onStatusChange !== "function") return () => {};
  return bridge.onStatusChange(callback);
}

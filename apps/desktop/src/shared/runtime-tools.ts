/**
 * Contract between the main-process runtime probe, the preload bridge and the
 * 「运行时」settings section.
 *
 * The probe answers one question per tool: can an agent run on this machine
 * without the user installing anything? `docs/engineering/CONTRACTS.md`
 * (运行时自带的工具链) defines the three answers:
 *
 *   - `bundled` — a copy the app owns: shipped inside the installer, or
 *     downloaded once into `<userData>/tools/<tool>/` by the install button.
 *   - `system`  — something already on this machine's PATH. Reported, never
 *     shadowed: the probe must not reorder the user's PATH.
 *   - `missing` — nothing usable; the UI offers the install button.
 */

export const RUNTIME_TOOLS = ["python", "git", "multica"] as const;

export type RuntimeTool = (typeof RUNTIME_TOOLS)[number];

export type RuntimeToolSource = "bundled" | "system" | "missing";

export interface RuntimeToolProbe {
  readonly tool: RuntimeTool;
  /** First version-looking token the probe printed, null when missing. */
  readonly version: string | null;
  readonly source: RuntimeToolSource;
  /** Absolute path that answered, or null when missing. */
  readonly path: string | null;
}

export interface RuntimeProbeReport {
  readonly tools: readonly RuntimeToolProbe[];
  readonly updatedAt: string;
}

export interface RuntimeToolInstallResult {
  readonly ok: boolean;
  readonly tool: RuntimeTool;
  /** True when an existing install was found and left untouched. */
  readonly alreadyInstalled?: boolean;
  readonly probe?: RuntimeToolProbe;
  /** Human-readable failure reason; shown verbatim in the settings row. */
  readonly error?: string;
}

/** Pulled by a renderer that mounted after the boot probe finished. */
export const RUNTIME_PROBE_GET_CHANNEL = "runtime-tools:get";
/** Pushed to every renderer on each probe/install state change. */
export const RUNTIME_PROBE_STATUS_CHANNEL = "runtime-tools:status";
/** Download + unpack one tool into `<userData>/tools/<tool>/`, then re-probe. */
export const RUNTIME_TOOL_INSTALL_CHANNEL = "runtime-tools:install";

export function isRuntimeTool(value: unknown): value is RuntimeTool {
  return (
    typeof value === "string" &&
    (RUNTIME_TOOLS as readonly string[]).includes(value)
  );
}

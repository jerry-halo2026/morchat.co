import { useCallback, useEffect, useState } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import { SettingsCard, SettingsRow, SettingsSection } from "@morechat/views/settings";
import { useT } from "@morechat/views/i18n";
import {
  RUNTIME_TOOLS,
  type RuntimeProbeReport,
  type RuntimeTool,
  type RuntimeToolProbe,
} from "../../../shared/runtime-tools";

/**
 * 「运行时」→ 工具链.
 *
 * One row per tool the desktop promises to provide (python / git / multica):
 * the probe's answer — ready with a version, or missing — and the one-click
 * install that downloads it into `<userData>/tools/<tool>/`. Install state is
 * local: it exists only while this row is doing something; the report the main
 * process pushes after every probe is the source of truth once it settles.
 */
type InstallState =
  | { status: "idle" }
  | { status: "installing" }
  | { status: "failed"; error: string };

type Translator = ReturnType<typeof useT<"settings">>["t"];

function toolLabel(t: Translator, tool: RuntimeTool): string {
  switch (tool) {
    case "python":
      return t(($) => $.desktop.toolchain.python_label);
    case "git":
      return t(($) => $.desktop.toolchain.git_label);
    case "multica":
      return t(($) => $.desktop.toolchain.multica_label);
  }
}

function statusText(
  t: Translator,
  install: InstallState,
  probe: RuntimeToolProbe | undefined,
): string {
  if (install.status === "installing") return t(($) => $.desktop.toolchain.installing);
  if (install.status === "failed") {
    return t(($) => $.desktop.toolchain.install_failed, { error: install.error });
  }
  if (!probe) return t(($) => $.desktop.toolchain.checking);
  if (probe.source === "missing" || !probe.version) return t(($) => $.desktop.toolchain.missing);
  return probe.source === "bundled"
    ? t(($) => $.desktop.toolchain.ready_bundled, { version: probe.version })
    : t(($) => $.desktop.toolchain.ready_system, { version: probe.version });
}

function mergeProbe(
  report: RuntimeProbeReport | null,
  probe: RuntimeToolProbe | undefined,
): RuntimeProbeReport | null {
  if (!probe) return report;
  if (!report) return { tools: [probe], updatedAt: new Date().toISOString() };
  return {
    tools: report.tools.map((entry) => (entry.tool === probe.tool ? probe : entry)),
    updatedAt: new Date().toISOString(),
  };
}

export function ToolchainSettingsSection() {
  const { t } = useT("settings");
  const [report, setReport] = useState<RuntimeProbeReport | null>(null);
  const [installs, setInstalls] = useState<Record<RuntimeTool, InstallState>>({
    python: { status: "idle" },
    git: { status: "idle" },
    multica: { status: "idle" },
  });

  useEffect(() => {
    let cancelled = false;
    void window.runtimeTools?.get().then((next) => {
      if (!cancelled && next) setReport(next);
    });
    const unsubscribe = window.runtimeTools?.onStatus((next) => {
      if (!cancelled) setReport(next);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const install = useCallback(async (tool: RuntimeTool) => {
    const api = window.runtimeTools;
    if (!api) return;
    setInstalls((state) => ({ ...state, [tool]: { status: "installing" } }));
    try {
      const result = await api.install(tool);
      setReport((current) => mergeProbe(current, result.probe));
      setInstalls((state) => ({
        ...state,
        [tool]: result.ok
          ? { status: "idle" }
          : { status: "failed", error: result.error ?? "" },
      }));
    } catch (err) {
      setInstalls((state) => ({
        ...state,
        [tool]: {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }, []);

  return (
    <SettingsSection title={t(($) => $.desktop.toolchain.title)}>
      <SettingsCard>
        {RUNTIME_TOOLS.map((tool) => {
          const installState = installs[tool];
          const probe = report?.tools.find((entry) => entry.tool === tool);
          const busy = installState.status === "installing";
          const missing = probe?.source === "missing";
          return (
            <SettingsRow
              key={tool}
              label={toolLabel(t, tool)}
              description={statusText(t, installState, probe)}
            >
              {missing ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void install(tool)}
                >
                  {busy
                    ? t(($) => $.desktop.toolchain.installing)
                    : t(($) => $.desktop.toolchain.install)}
                </Button>
              ) : (
                <span />
              )}
            </SettingsRow>
          );
        })}
      </SettingsCard>
    </SettingsSection>
  );
}

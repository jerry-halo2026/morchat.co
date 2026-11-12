import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@morechat/core/i18n/react";
import { RESOURCES } from "@morechat/views/locales";
import type {
  RuntimeProbeReport,
  RuntimeToolInstallResult,
} from "../../../shared/runtime-tools";
import { ToolchainSettingsSection } from "./toolchain-settings-section";

const initialReport: RuntimeProbeReport = {
  updatedAt: "2026-01-01T00:00:00.000Z",
  tools: [
    { tool: "python", version: null, source: "missing", path: null },
    {
      tool: "git",
      version: "2.47.1",
      source: "bundled",
      path: "C:\\app\\resources\\git\\cmd\\git.exe",
    },
    { tool: "multica", version: "0.8.2", source: "system", path: "multica" },
  ],
};

function renderSection() {
  return render(
    <I18nProvider locale="zh-Hans" resources={RESOURCES}>
      <ToolchainSettingsSection />
    </I18nProvider> as ReactNode,
  );
}

function installRuntimeTools(
  install: (tool: string) => Promise<RuntimeToolInstallResult>,
) {
  Object.defineProperty(window, "runtimeTools", {
    configurable: true,
    value: {
      get: vi.fn().mockResolvedValue(initialReport),
      install: vi.fn(install),
      onStatus: vi.fn(() => () => {}),
    },
  });
  return window.runtimeTools!;
}

describe("ToolchainSettingsSection", () => {
  it("offers install only for the tool the probe reports missing", async () => {
    installRuntimeTools(vi.fn());
    renderSection();

    expect(await screen.findByText("已就绪 · 2.47.1（随应用提供）")).toBeInTheDocument();
    expect(screen.getByText("已就绪 · 0.8.2（系统安装）")).toBeInTheDocument();
    expect(screen.getByText("缺失")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("runs the install state machine: 安装 → 安装中… → 已就绪", async () => {
    let finish: (result: RuntimeToolInstallResult) => void = () => {};
    const api = installRuntimeTools(
      () =>
        new Promise<RuntimeToolInstallResult>((resolve) => {
          finish = resolve;
        }),
    );
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "安装" }));

    expect(api.install).toHaveBeenCalledWith("python");
    const busy = await screen.findByRole("button", { name: "安装中…" });
    expect(busy).toBeDisabled();

    finish({
      ok: true,
      tool: "python",
      probe: {
        tool: "python",
        version: "3.12.10",
        source: "bundled",
        path: "C:\\Users\\me\\AppData\\Roaming\\morechat.co\\tools\\python\\python.exe",
      },
    });

    expect(await screen.findByText("已就绪 · 3.12.10（随应用提供）")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the readable error the main process returned", async () => {
    installRuntimeTools(async () => ({
      ok: false,
      tool: "python",
      error: "下载失败：无法连接下载服务器，请检查网络后重试",
    }));
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "安装" }));

    expect(
      await screen.findByText("安装失败：下载失败：无法连接下载服务器，请检查网络后重试"),
    ).toBeInTheDocument();
    // The row keeps offering the install button so a retry is one click away.
    expect(screen.getByRole("button", { name: "安装" })).toBeInTheDocument();
  });
});

// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CommandOutcome } from "./runtime-probe";
import {
  ensureRuntimeTool,
  probeRuntimeTools,
  runtimeProbeLogLine,
} from "./runtime-probe";

const resources = "C:\\app\\resources";
const bundledPython = join(resources, "python", "python.exe");
const bundledGit = join(resources, "git", "cmd", "git.exe");
const bundledMultica = join(resources, "bin", "multica.exe");

const outputFor: Record<string, string> = {
  [bundledPython]: "Python 3.12.4\r\n",
  [bundledGit]: "git version 2.47.1.windows.1\r\n",
  [bundledMultica]: "1.27.3, commit 4f2a1c0\r\n",
  python: "Python 3.11.9\r\n",
  git: "git version 2.40.0\r\n",
  multica: "multica 0.7.0\r\n",
};

function fakeRun(
  available: readonly string[],
  extraOutput: Record<string, string> = {},
) {
  const calls: string[] = [];
  const run = vi.fn(async (file: string): Promise<CommandOutcome> => {
    calls.push(file);
    const stdout = available.includes(file)
      ? extraOutput[file] ?? outputFor[file] ?? ""
      : "";
    return stdout
      ? { ok: true, stdout, stderr: "" }
      : { ok: false, stdout: "", stderr: "not found" };
  });
  return { run, calls };
}

function onlyThese(paths: readonly string[]) {
  return (path: string) => paths.includes(path);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("probeRuntimeTools — bundled copy present", () => {
  it("reports source=bundled for each tool found inside <resources>", async () => {
    const { run } = fakeRun([bundledPython, bundledGit, bundledMultica]);
    const report = await probeRuntimeTools({
      resourcesDirs: [resources],
      platform: "win32",
      env: {},
      exists: onlyThese([bundledPython, bundledGit, bundledMultica]),
      run,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(report.tools.map((tool) => [tool.tool, tool.version, tool.source, tool.path])).toEqual([
      ["python", "3.12.4", "bundled", bundledPython],
      ["git", "2.47.1.windows.1", "bundled", bundledGit],
      ["multica", "1.27.3", "bundled", bundledMultica],
    ]);
    expect(report.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(report.tools.map(runtimeProbeLogLine)).toEqual([
      "[runtime-probe] python=3.12.4 source=bundled",
      "[runtime-probe] git=2.47.1.windows.1 source=bundled",
      "[runtime-probe] multica=1.27.3 source=bundled",
    ]);
  });

  it("prefers the bundled copy over a system install with the same name", async () => {
    const { run, calls } = fakeRun([bundledPython, "python"]);
    const report = await probeRuntimeTools({
      resourcesDirs: [resources],
      platform: "win32",
      env: {},
      exists: onlyThese([bundledPython]),
      run,
    });

    const python = report.tools.find((tool) => tool.tool === "python");
    expect(python?.source).toBe("bundled");
    expect(python?.version).toBe("3.12.4");
    expect(calls).not.toContain("python");
  });
});

describe("probeRuntimeTools — bundled copy absent, PATH usable", () => {
  it("falls back to PATH and reports source=system", async () => {
    const { run, calls } = fakeRun(["python", "git", "multica"]);
    const report = await probeRuntimeTools({
      resourcesDirs: [resources],
      platform: "win32",
      env: {},
      exists: onlyThese([]),
      run,
    });

    expect(report.tools.map((tool) => [tool.tool, tool.version, tool.source, tool.path])).toEqual([
      ["python", "3.11.9", "system", "python"],
      ["git", "2.40.0", "system", "git"],
      ["multica", "0.7.0", "system", "multica"],
    ]);
    // The bundled paths are probed first, so their absence shows up as a stat,
    // not a failed spawn: nothing was executed before the PATH lookup.
    expect(calls).toEqual(["python", "git", "multica"]);
  });
});

describe("probeRuntimeTools — nothing installed", () => {
  it("reports source=missing with no version and no path", async () => {
    const { run } = fakeRun([]);
    const report = await probeRuntimeTools({
      resourcesDirs: [resources],
      platform: "win32",
      env: {},
      exists: onlyThese([]),
      run,
    });

    for (const tool of report.tools) {
      expect(tool.source).toBe("missing");
      expect(tool.version).toBeNull();
      expect(tool.path).toBeNull();
      expect(runtimeProbeLogLine(tool)).toBe(
        `[runtime-probe] ${tool.tool}=missing source=missing`,
      );
    }
  });

  it("treats a command that exits non-zero as missing, not as a version", async () => {
    const run = vi.fn(
      async (): Promise<CommandOutcome> => ({
        ok: false,
        stdout: "",
        stderr: "python: not found",
      }),
    );
    const report = await probeRuntimeTools({
      resourcesDirs: [resources],
      platform: "win32",
      env: {},
      exists: onlyThese([]),
      run,
    });

    expect(report.tools.every((tool) => tool.source === "missing")).toBe(true);
  });
});

describe("ensureRuntimeTool", () => {
  it("leaves an existing managed install alone unless force is set", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "runtime-probe-test-"));
    try {
      const installed = join(userDataDir, "tools", "python", "python.exe");
      const download = vi.fn();
      const { run } = fakeRun([installed], { [installed]: "Python 3.12.4\r\n" });

      const result = await ensureRuntimeTool({
        tool: "python",
        userDataDir,
        platform: "win32",
        env: {},
        exists: onlyThese([installed]),
        run,
        download,
      });

      expect(result.ok).toBe(true);
      expect(result.alreadyInstalled).toBe(true);
      expect(result.probe?.source).toBe("bundled");
      expect(download).not.toHaveBeenCalled();
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  it("returns a readable error instead of throwing when the download fails", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "runtime-probe-test-"));
    try {
      const result = await ensureRuntimeTool({
        tool: "git",
        userDataDir,
        platform: "win32",
        env: {},
        exists: onlyThese([]),
        run: fakeRun([]).run,
        log: () => undefined,
        download: async () => {
          throw new TypeError("fetch failed");
        },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("无法连接下载服务器");
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });
});

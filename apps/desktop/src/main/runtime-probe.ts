/**
 * Runtime toolchain probe: `python`, `git` and the `multica` CLI.
 *
 * The desktop already ships a Node runtime and a DSH runtime; agents also need
 * these three to do anything (see `docs/engineering/CONTRACTS.md`,
 * 运行时自带的工具链). This module answers, for each tool, where it was found
 * and whether it works — by executing it once — and can install a missing tool
 * into `<userData>/tools/<tool>/` so a machine with nothing installed still
 * runs agents out of the box.
 *
 * Order per tool, first usable answer wins:
 *
 *   1. the `MULTICA_*` override the daemon injects into agent processes
 *      (`MULTICA_PYTHON_HOME`, `MULTICA_GIT_HOME`, `MULTICA_CLI_PATH`);
 *   2. bundled copies: `<resources>/python/python.exe`,
 *      `<resources>/git/cmd/git.exe`, `<resources>/bin/multica.exe`;
 *   3. an app-managed install under `<userData>/tools/<tool>/`;
 *   4. PATH.
 *
 * Steps 2 and 3 report `source: "bundled"` — both are files the app owns, which
 * is the only distinction the settings UI needs. A PATH hit reports `system`
 * and is never shadowed: nothing here rewrites PATH order.
 *
 * Logging rule, matching the contract: one line per tool,
 * `[runtime-probe] python=3.12.4 source=bundled`. Paths and versions only.
 *
 * The module deliberately does not import `electron`: the probe is pure logic
 * over paths and a command runner, and every dependency (`exists`, `run`,
 * `download`, `extract`) is injectable so the three source cases are unit
 * testable without spawning anything.
 */

import { execFile } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
  RuntimeProbeReport,
  RuntimeTool,
  RuntimeToolInstallResult,
  RuntimeToolProbe,
} from "../shared/runtime-tools";
import { RUNTIME_TOOLS } from "../shared/runtime-tools";

/** One command budget. A cold antivirus scan of a fresh MinGit tree needs a few seconds. */
export const RUNTIME_PROBE_TIMEOUT_MS = 5_000;

/**
 * Upstream official download for each tool. Windows asset names by default;
 * `ensureRuntimeTool` takes a `downloadUrl` override so a packaged build (or a
 * test) can point elsewhere without touching this table.
 */
export const RUNTIME_TOOL_DOWNLOADS: Record<RuntimeTool, string> = {
  python: "https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip",
  git: "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/MinGit-2.47.1-64-bit.zip",
  multica:
    "https://github.com/jerry-halo2026/morchat.co/releases/latest/download/multica_windows_amd64.zip",
};

interface ToolSpec {
  /** Relative paths inside one `<resources>` root, most specific first. */
  readonly bundledRel: readonly string[];
  /** Relative path inside `<userData>/tools/<tool>/` after an install. */
  readonly installedRel: string;
  /** Name looked up on PATH. */
  readonly command: string;
  readonly versionArgs: readonly string[];
  readonly versionPattern: RegExp;
  /** Daemon-injected directory that holds this tool. */
  readonly envHome?: string;
  /** Daemon-injected absolute path to this tool's executable. */
  readonly envPath?: string;
}

function toolSpecs(platform: NodeJS.Platform): Record<RuntimeTool, ToolSpec> {
  const exe = platform === "win32" ? ".exe" : "";
  return {
    python: {
      bundledRel: [`python/python${exe}`, `python/python3${exe}`],
      installedRel: `python${exe}`,
      command: platform === "win32" ? "python" : "python3",
      versionArgs: ["--version"],
      versionPattern: /Python\s+(\d+\.\d+\.\d+[^\s]*)/i,
      envHome: "MULTICA_PYTHON_HOME",
      envPath: "MULTICA_PYTHON_PATH",
    },
    git: {
      bundledRel: [`git/cmd/git${exe}`, `git/bin/git${exe}`],
      installedRel: platform === "win32" ? `cmd/git${exe}` : `bin/git${exe}`,
      command: "git",
      versionArgs: ["--version"],
      versionPattern: /git version\s+(\S+)/i,
      envHome: "MULTICA_GIT_HOME",
      envPath: "MULTICA_GIT_PATH",
    },
    multica: {
      bundledRel: [`bin/multica${exe}`],
      installedRel: `multica${exe}`,
      command: "multica",
      versionArgs: ["version"],
      // `multica version` prints `1.27.3, commit …`; stop at the punctuation
      // instead of swallowing the whole tail into the version.
      versionPattern: /(\d+\.\d+\.\d+(?:[.-][0-9A-Za-z]+)*)/,
      envPath: "MULTICA_CLI_PATH",
    },
  };
}

export interface CommandOutcome {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut?: boolean;
  readonly error?: string;
}

export interface RuntimeProbeOptions {
  /** `<resources>` roots to search, in order (packaged, then dev checkout). */
  readonly resourcesDirs?: readonly string[];
  /** `<userData>/tools`; app-managed installs live one level below it. */
  readonly toolsDir?: string | null;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  /** Injectable filesystem/exec for tests. */
  readonly exists?: (path: string) => boolean;
  readonly run?: (file: string, args: readonly string[]) => Promise<CommandOutcome>;
  readonly now?: () => Date;
}

function defaultEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of [
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "SYSTEMROOT",
    "windir",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "LANG",
    "LC_ALL",
  ]) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) env[name] = value;
  }
  return env;
}

function runCommand(
  file: string,
  args: readonly string[],
  platform: NodeJS.Platform,
): Promise<CommandOutcome> {
  return new Promise((resolve) => {
    // Windows: a PATH hit can be a `.cmd` shim (npm-style wrappers), which only
    // runs through the shell; quote the program because a resources path under
    // "C:\Program Files" contains spaces.
    const shell = platform === "win32";
    const command = shell && file.includes(" ") ? `"${file}"` : file;
    execFile(
      command,
      [...args],
      {
        timeout: RUNTIME_PROBE_TIMEOUT_MS,
        env: defaultEnv(),
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        ...(shell ? { shell: true } : {}),
      },
      (error, stdout, stderr) => {
        const timedOut = Boolean(error && error.killed);
        resolve({
          ok: !error,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          timedOut,
          ...(error ? { error: error.message } : {}),
        });
      },
    );
  });
}

/** `3.12.4` out of `Python 3.12.4`, `2.47.1.windows.1` out of `git version ...`. */
function parseVersion(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern) ?? text.match(/(\d+\.\d+(?:\.\d+)?[^\s]*)/);
  return match?.[1] ?? null;
}

interface Candidate {
  readonly path: string;
  readonly source: "bundled" | "system";
}

function candidatesFor(
  tool: RuntimeTool,
  spec: ToolSpec,
  options: RuntimeProbeOptions,
): Candidate[] {
  const env = options.env ?? process.env;
  const list: Candidate[] = [];

  const override = spec.envPath ? env[spec.envPath] : undefined;
  if (override) list.push({ path: override, source: "system" });
  const home = spec.envHome ? env[spec.envHome] : undefined;
  if (home) list.push({ path: join(home, spec.installedRel), source: "system" });

  for (const root of options.resourcesDirs ?? []) {
    if (!root) continue;
    for (const rel of spec.bundledRel) list.push({ path: join(root, rel), source: "bundled" });
  }

  if (options.toolsDir) {
    list.push({ path: join(options.toolsDir, tool, spec.installedRel), source: "bundled" });
  }

  // PATH last: a bundled copy always wins, and a system copy is only reported
  // when nothing of ours answered — the contract forbids reordering the user's
  // PATH, and both orderings leave the user's own tooling intact.
  list.push({ path: spec.command, source: "system" });
  return list;
}

async function probeTool(
  tool: RuntimeTool,
  spec: ToolSpec,
  options: RuntimeProbeOptions,
): Promise<RuntimeToolProbe> {
  const exists = options.exists ?? existsSync;
  const run =
    options.run ??
    ((file: string, args: readonly string[]) =>
      runCommand(file, args, options.platform ?? process.platform));

  for (const candidate of candidatesFor(tool, spec, options)) {
    const onPath = candidate.path === spec.command;
    if (!onPath && !exists(candidate.path)) continue;
    let outcome: CommandOutcome;
    try {
      outcome = await run(candidate.path, spec.versionArgs);
    } catch {
      continue;
    }
    if (!outcome.ok) continue;
    const version = parseVersion(`${outcome.stdout}\n${outcome.stderr}`, spec.versionPattern);
    if (!version) continue;
    return { tool, version, source: candidate.source, path: candidate.path };
  }

  return { tool, version: null, source: "missing", path: null };
}

/**
 * Probes every tool once. Never throws: a tool that cannot run is `missing`,
 * which is exactly what the install button needs to see.
 */
export async function probeRuntimeTools(
  options: RuntimeProbeOptions = {},
): Promise<RuntimeProbeReport> {
  const specs = toolSpecs(options.platform ?? process.platform);
  const tools = await Promise.all(
    RUNTIME_TOOLS.map((tool) =>
      probeTool(tool, specs[tool], options).catch<RuntimeToolProbe>(() => ({
        tool,
        version: null,
        source: "missing",
        path: null,
      })),
    ),
  );
  return {
    tools,
    updatedAt: (options.now?.() ?? new Date()).toISOString(),
  };
}

/** The contract's log line: `[runtime-probe] python=3.12.4 source=bundled`. */
export function runtimeProbeLogLine(probe: RuntimeToolProbe): string {
  return `[runtime-probe] ${probe.tool}=${probe.version ?? "missing"} source=${probe.source}`;
}

/**
 * The directories the daemon needs to put a task's toolchain in front of PATH.
 *
 * Only `bundled` copies are exported: a `system` tool is already reachable through
 * the user's own PATH, and overriding it with the same binary would change which
 * one a task runs for no benefit. A missing tool contributes nothing.
 *
 * Git is the awkward one - the probe finds `<git>/cmd/git.exe`, while the daemon
 * wants the install root and appends `cmd` itself.
 */
export function runtimeToolchainEnv(
  report: RuntimeProbeReport,
): Record<string, string> {
  const env: Record<string, string> = {};
  const python = toolProbe(report, "python");
  if (python?.source === "bundled" && python.path) {
    env.MULTICA_PYTHON_HOME = dirname(python.path);
  }
  const git = toolProbe(report, "git");
  if (git?.source === "bundled" && git.path) {
    // `<git>/cmd/git.exe` or `<git>/bin/git.exe`.
    env.MULTICA_GIT_HOME = dirname(dirname(git.path));
  }
  return env;
}

/** One log line per tool, in a stable order. */
export function runtimeProbeLogLines(report: RuntimeProbeReport): string[] {
  return report.tools.map(runtimeProbeLogLine);
}

export function toolProbe(
  report: RuntimeProbeReport,
  tool: RuntimeTool,
): RuntimeToolProbe | undefined {
  return report.tools.find((entry) => entry.tool === tool);
}

export interface EnsureRuntimeToolOptions extends RuntimeProbeOptions {
  readonly tool: RuntimeTool;
  /** `<userData>`. Staged installs live in `<userData>/tools/<tool>/`. */
  readonly userDataDir: string;
  /** Reinstall over an existing copy. Off by default: user data is not ours. */
  readonly force?: boolean;
  readonly downloadUrl?: string;
  readonly download?: (url: string, dest: string) => Promise<void>;
  readonly extract?: (archive: string, dest: string) => Promise<void>;
  readonly log?: (line: string) => void;
}

export function runtimeToolInstallDir(userDataDir: string, tool: RuntimeTool): string {
  return join(userDataDir, "tools", tool);
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`下载失败：HTTP ${res.status} ${res.statusText}（${url}）`);
  }
  await mkdir(dirname(dest), { recursive: true });
  const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  await pipeline(body, createWriteStream(dest));
}

/**
 * Windows 10+ ships `bsdtar`, macOS/Linux ship one too; both auto-detect zip
 * and tar.gz, which keeps this to a single code path — same choice as
 * `cli-bootstrap.ts`.
 */
function extractArchive(archive: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("tar", ["-xf", archive, "-C", dest], (error) =>
      error ? reject(new Error(`解包失败：${error.message}`)) : resolve(),
    );
  });
}

function readableInstallError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(err.message)) {
    return "下载失败：无法连接下载服务器，请检查网络后重试";
  }
  if (/ENOSPC/i.test(err.message)) return "安装失败：磁盘空间不足";
  if (/EACCES|EPERM/i.test(err.message)) return "安装失败：没有写入权限";
  return err.message;
}

/**
 * Installs one tool into `<userData>/tools/<tool>/` and re-probes it.
 *
 * An existing install is left alone unless `force` is set — the managed copy is
 * the user's, and a stale version is still better than a failed download. A
 * failed attempt removes its own half-written directory so the next click starts
 * from a known state, and every failure comes back as text the settings row can
 * render.
 */
export async function ensureRuntimeTool(
  options: EnsureRuntimeToolOptions,
): Promise<RuntimeToolInstallResult> {
  const { tool } = options;
  const platform = options.platform ?? process.platform;
  const spec = toolSpecs(platform)[tool];
  const exists = options.exists ?? existsSync;
  const toolsDir = join(options.userDataDir, "tools");
  const targetDir = runtimeToolInstallDir(options.userDataDir, tool);
  const binary = join(targetDir, spec.installedRel);
  const reprobeOptions: RuntimeProbeOptions = { ...options, toolsDir };
  const log = options.log ?? ((line: string) => console.log(line));

  const current = async () =>
    toolProbe(await probeRuntimeTools(reprobeOptions), tool) ?? {
      tool,
      version: null,
      source: "missing" as const,
      path: null,
    };

  if (exists(binary) && options.force !== true) {
    const probe = await current();
    return { ok: true, tool, alreadyInstalled: true, probe };
  }

  const url = options.downloadUrl ?? RUNTIME_TOOL_DOWNLOADS[tool];
  const download =
    options.download ?? ((from: string, dest: string) => downloadToFile(from, dest));
  const extract = options.extract ?? extractArchive;

  let workDir: string | null = null;
  try {
    if (options.force === true) await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });
    workDir = await mkdtemp(join(tmpdir(), `morechat-runtime-${tool}-`));
    const archive = join(workDir, `${tool}.archive`);
    log(`[runtime-probe] installing ${tool} from ${url}`);
    await download(url, archive);
    await extract(archive, targetDir);
    if (!exists(binary)) {
      throw new Error(`解包后没有找到 ${spec.installedRel}`);
    }
    const probe = await current();
    if (probe.source === "missing") {
      // Unpacked but not runnable (wrong asset, missing DLLs): report it and
      // keep the directory — the next probe/install can overwrite it on force.
      return { ok: false, tool, error: `安装完成，但 ${tool} 仍无法运行`, probe };
    }
    log(runtimeProbeLogLine(probe));
    return { ok: true, tool, probe };
  } catch (err) {
    await rm(targetDir, { recursive: true, force: true }).catch(() => undefined);
    const error = readableInstallError(err);
    log(`[runtime-probe] install ${tool} failed: ${error}`);
    return { ok: false, tool, error };
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

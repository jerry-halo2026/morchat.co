#!/usr/bin/env node
// Fetches the portable Python and git the desktop app ships, so "works out of
// the box" means the user's machine needs neither installed.
//
// The contract this serves is docs/engineering/CONTRACTS.md "运行时自带的工具链":
// the daemon only injects `MULTICA_PYTHON_HOME` / `MULTICA_GIT_HOME` and prepends
// these directories to a run's PATH, so the two trees have to exist *beside* the
// packaged app, at `resources/python/` and `resources/git/`. Neither is checked
// in: both are build inputs (see apps/desktop/.gitignore), the same convention
// `resources/node/` and `resources/dsh/` already follow, and 100 MB of binaries
// in history would be a permanent cost for a payload that is reproducible from
// two pinned URLs.
//
// Layout produced (Windows):
//
//   resources/python/python.exe            embedded CPython, `python -c` works
//   resources/python/Lib/site-packages/    pip + the preinstalled libraries
//   resources/git/cmd/git.exe              MinGit launcher, `git --version` works
//
// Two deliberate deviations from the upstream archives, both measured:
//
//   1. `python312._pth` is deleted. Upstream ships it to make the distribution
//      isolated, and an isolated interpreter ignores `PYTHONPATH` — which is how
//      a skill runner adds its own script directory. Without the file, CPython's
//      normal prefix search still finds `python312.zip` and `Lib/site-packages`,
//      and `PYTHONPATH` works again.
//   2. MinGit's GUI credential-helper stack (.NET: Avalonia + SkiaSharp + MSAL,
//      ~30 MB) is dropped. It is a desktop login window; an agent authenticates
//      with a token or the `wincred` helper, which stays. That trim is what
//      brings the tree from 92 MB to the 60 MB budget.
//
// Usage:
//   node scripts/fetch-runtime-tools.mjs              # fetch (no-op if current)
//   node scripts/fetch-runtime-tools.mjs --force      # rebuild both trees
//   node scripts/fetch-runtime-tools.mjs --check       # verify only, exit 1 if absent
//   node scripts/fetch-runtime-tools.mjs --only=git    # one of them
//
// Downloads are cached under <repo>/.cache/runtime-tools/downloads, so repeat
// builds and `--force` rebuilds do not re-download.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(here, "..");
const repoRoot = resolve(desktopDir, "..", "..");
const resourcesDir = join(desktopDir, "resources");
const cacheDir = join(repoRoot, ".cache", "runtime-tools");
const downloadDir = join(cacheDir, "downloads");
const stageDir = join(cacheDir, "stage");

// Bump when a trim/rule changes in a way that must invalidate existing trees.
const RUNTIME_RULES = "2026-11-12.1";

const MB = 1024 * 1024;

const PYTHON = {
  name: "python",
  version: "3.12.10",
  // The embeddable zip is the lean post-3.11 distribution (~11 MB compressed,
  // 21 MB unpacked) and 3.12.10 is the last 3.12 patch with Windows binaries;
  // 3.12.11+ are source-only security releases.
  url: "https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip",
  sha256: "4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3",
  archive: "python-3.12.10-embed-amd64.zip",
  budgetMb: 45,
};

const GET_PIP = {
  url: "https://bootstrap.pypa.io/get-pip.py",
  archive: "get-pip.py",
  // get-pip.py is regenerated upstream on every pip release, so the file itself
  // is not pinned; the pip version it installs is (below), which is what the
  // bundle actually depends on.
};

// pip is the only thing `get-pip.py` adds; setuptools/wheel are left out because
// runtime `pip install` fetches them as build dependencies when a package needs
// them, and they are 4 MB of the budget.
const PIP_VERSION = "26.3";

/**
 * The preinstalled libraries, ranked by what the market's python skills really
 * import. Counting `import` lines across the 89 `.py` files under
 * `morechat-assistant/catalog/packages/**`:
 *
 *   PIL 19 · requests 8 · numpy 4 · yaml 2 · docx 1 · bs4 1 · cv2/scipy/
 *   playwright/faster_whisper 1 each
 *
 * These three are 3 MB and cover the 29 skills that use a third-party module at
 * all. numpy (4 citations) and the ML/vision stacks are intentionally *not*
 * bundled: numpy alone is ~40 MB of OpenBLAS and would blow the 45 MB budget for
 * four skills. Runtime `pip install` covers them — the interpreter ships with a
 * working pip for exactly that reason. Transitive deps are pinned too so a
 * rebuild produces the same bytes.
 */
const PYTHON_PACKAGES = [
  "pillow==13.0.0",
  "requests==2.34.2",
  "pyyaml==6.0.3",
  "urllib3==2.8.0",
  "certifi==2026.10.23",
  "idna==3.20",
  "charset_normalizer==3.5.2",
];

/**
 * Pillow 13's `_avif.cp312-win_amd64.pyd` is 7.5 MB — a third of the remaining
 * budget for one codec no catalog skill touches. JPEG/PNG/WebP/TIFF stay. A
 * runtime `pip install --force-reinstall pillow` restores it.
 */
const PYTHON_DROP_FILES = [join("Lib", "site-packages", "PIL", "_avif.cp312-win_amd64.pyd")];

const GIT = {
  name: "git",
  version: "2.56.1",
  url: "https://github.com/git-for-windows/git/releases/download/v2.56.1.windows.1/MinGit-2.56.1-64-bit.zip",
  sha256: "4a92850b6e917da4fd010669b614b55dccf5b0ec333a534cc4be4700dfefdafd",
  archive: "MinGit-2.56.1-64-bit.zip",
  budgetMb: 60,
};

/** Git Credential Manager: a .NET/Avalonia login window, useless headless. */
const GIT_DROP_GLOBS = [/^Avalonia\./, /^Microsoft\./, /^System\./, /^MicroCom\./];

/**
 * Individually measured drops, each with what still works without it. The two
 * `git-http-*` helpers are the *dumb* HTTP protocol; `git -remote-https` (kept)
 * is what fetch/push over HTTPS actually use.
 */
const GIT_DROP_FILES = [
  "ucrt64/bin/libSkiaSharp.dll",
  "ucrt64/bin/SkiaSharp.dll",
  "ucrt64/bin/libHarfBuzzSharp.dll",
  "ucrt64/bin/HarfBuzzSharp.dll",
  "ucrt64/bin/av_libglesv2.dll",
  "ucrt64/bin/msalruntime.dll",
  "ucrt64/bin/gcmcore.dll",
  "ucrt64/bin/git-credential-manager.exe",
  "ucrt64/bin/git-credential-manager.exe.config",
  "ucrt64/bin/git-credential-helper-selector.exe",
  "ucrt64/bin/git-askpass.exe",
  "ucrt64/bin/git-askyesno.exe",
  "ucrt64/bin/headless-git.exe",
  "ucrt64/bin/proxy-lookup.exe",
  "ucrt64/bin/GitHub.dll",
  "ucrt64/bin/GitLab.dll",
  "ucrt64/bin/Atlassian.Bitbucket.dll",
  "ucrt64/bin/docx2txt.exe",
  "ucrt64/bin/docx-strip-pii.exe",
  "ucrt64/bin/blocked-file-util.exe",
  "ucrt64/bin/scalar.exe",
  "ucrt64/bin/git-update-git-for-windows",
  "ucrt64/bin/git-http-push.exe",
  "ucrt64/bin/git-http-fetch.exe",
  "cmd/scalar.exe",
];
const GIT_DROP_DIRS = ["ucrt64/share/doc"];

/**
 * Upstream's system gitconfig points `credential.helper` at the GCM we just
 * removed, which would turn every HTTPS auth prompt into "not a git command".
 * `wincred` ships in libexec/git-core and stores tokens in the Windows
 * credential store, which is what an agent's token ends up in anyway.
 */
const GIT_GITCONFIG = ["etc/gitconfig", "helper = manager", "helper = wincred"];

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const checkOnly = argv.includes("--check");
const only = argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);

function log(message) {
  console.log(`[runtime-tools] ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw new Error(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
}

async function sha256Of(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

async function measure(dir) {
  let bytes = 0;
  let files = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await measure(path);
      bytes += nested.bytes;
      files += nested.files;
    } else {
      bytes += (await stat(path)).size;
      files += 1;
    }
  }
  return { bytes, files };
}

async function download(spec) {
  const path = join(downloadDir, spec.archive);
  if (existsSync(path)) {
    if (!spec.sha256 || (await sha256Of(path)) === spec.sha256) {
      log(`reusing ${spec.archive}`);
      return path;
    }
    log(`${spec.archive} does not match its pinned hash; re-downloading`);
    await rm(path, { force: true });
  }
  await mkdir(downloadDir, { recursive: true });
  log(`downloading ${spec.url}`);
  const response = await fetch(spec.url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${spec.url} returned ${response.status}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  if (spec.sha256) {
    const actual = await sha256Of(path);
    if (actual !== spec.sha256) throw new Error(`${spec.archive} hash ${actual} != ${spec.sha256}`);
  }
  return path;
}

/** Unzips with the platform's own reader: bsdtar on Windows 10+, unzip elsewhere. */
function unzipInto(archive, dest) {
  if (process.platform === "win32") run("tar", ["-xf", archive, "-C", dest]);
  else run("unzip", ["-q", archive, "-d", dest]);
}

async function manifestMatches(dir, tool) {
  const path = join(dir, ".morechat-runtime.json");
  if (!existsSync(path)) return false;
  try {
    const manifest = JSON.parse(await readFile(path, "utf8"));
    return manifest.tool === tool.name && manifest.version === tool.version && manifest.rules === RUNTIME_RULES;
  } catch {
    return false;
  }
}

async function writeManifest(dir, tool, extra) {
  await writeFile(
    join(dir, ".morechat-runtime.json"),
    `${JSON.stringify({ tool: tool.name, version: tool.version, rules: RUNTIME_RULES, ...extra }, null, 2)}\n`,
  );
}

function verifyPython(dir) {
  run(join(dir, "python.exe"), ["--version"]);
  run(join(dir, "python.exe"), ["-c", "import json,os,sys,PIL,requests,yaml;print('imports ok')"]);
  const pip = spawnSync(join(dir, "python.exe"), ["-m", "pip", "--version"], { encoding: "utf8" });
  if (pip.status !== 0) throw new Error(`[runtime-tools] bundled pip is broken: ${pip.stderr}`);
  if (!pip.stdout.includes(PIP_VERSION)) {
    throw new Error(`[runtime-tools] expected pip ${PIP_VERSION}, got ${pip.stdout.trim()}`);
  }
  log(`python: ${pip.stdout.trim()}`);
}

function verifyGit(dir) {
  const git = join(dir, "cmd", "git.exe");
  const version = spawnSync(git, ["--version"], { encoding: "utf8" });
  if (version.status !== 0) throw new Error(`[runtime-tools] ${git} --version failed: ${version.stderr}`);
  log(`git: ${version.stdout.trim()}`);
}

async function buildPython() {
  const dest = join(resourcesDir, "python");
  if (!force && (await manifestMatches(dest, PYTHON))) {
    log(`python ${PYTHON.version} is current at ${dest}`);
    return;
  }

  const archive = await download(PYTHON);
  const getPip = await download(GET_PIP);
  const stage = join(stageDir, "python");
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  unzipInto(archive, stage);

  // Isolated-by-default upstream: see the header. `Lib/site-packages` is the
  // layout CPython's own prefix search recognises, so no path file is needed.
  await rm(join(stage, "python312._pth"), { force: true });
  await mkdir(join(stage, "Lib", "site-packages"), { recursive: true });

  const python = join(stage, "python.exe");
  log(`bootstrapping pip ${PIP_VERSION}`);
  run(python, [
    getPip,
    "--no-warn-script-location",
    "--no-compile",
    "--disable-pip-version-check",
    "--quiet",
  ]);
  log(`installing ${PYTHON_PACKAGES.length} pinned packages`);
  run(python, [
    "-m",
    "pip",
    "install",
    "--no-compile",
    "--no-cache-dir",
    "--no-warn-script-location",
    "--disable-pip-version-check",
    "--quiet",
    ...PYTHON_PACKAGES,
  ]);

  for (const rel of PYTHON_DROP_FILES) await rm(join(stage, rel), { force: true });

  verifyPython(stage);
  const size = await measure(stage);
  if (size.bytes > PYTHON.budgetMb * MB) {
    throw new Error(
      `[runtime-tools] python is ${(size.bytes / MB).toFixed(1)} MB, over the ${PYTHON.budgetMb} MB budget`,
    );
  }
  await writeManifest(stage, PYTHON, {
    packages: PYTHON_PACKAGES,
    pip: PIP_VERSION,
    bytes: size.bytes,
  });

  await rm(dest, { recursive: true, force: true });
  await copyTree(stage, dest);
  log(`python ${PYTHON.version}: ${(size.bytes / MB).toFixed(1)} MB, ${size.files} files -> ${dest}`);
}

async function buildGit() {
  const dest = join(resourcesDir, "git");
  if (!force && (await manifestMatches(dest, GIT))) {
    log(`git ${GIT.version} is current at ${dest}`);
    return;
  }

  const archive = await download(GIT);
  const stage = join(stageDir, "git");
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  unzipInto(archive, stage);

  for (const rel of GIT_DROP_FILES) await rm(join(stage, rel), { force: true, recursive: true });
  for (const rel of GIT_DROP_DIRS) await rm(join(stage, rel), { recursive: true, force: true });
  const binDir = join(stage, "ucrt64", "bin");
  for (const entry of await readdir(binDir)) {
    if (GIT_DROP_GLOBS.some((glob) => glob.test(entry))) await rm(join(binDir, entry), { force: true });
  }

  const [configPath, from, to] = GIT_GITCONFIG;
  const configFile = join(stage, configPath);
  await writeFile(configFile, (await readFile(configFile, "utf8")).replace(from, to));

  verifyGit(stage);
  const size = await measure(stage);
  if (size.bytes > GIT.budgetMb * MB) {
    throw new Error(
      `[runtime-tools] git is ${(size.bytes / MB).toFixed(1)} MB, over the ${GIT.budgetMb} MB budget`,
    );
  }
  await writeManifest(stage, GIT, { bytes: size.bytes, dropped: GIT_DROP_FILES.length });

  await rm(dest, { recursive: true, force: true });
  await copyTree(stage, dest);
  log(`git ${GIT.version}: ${(size.bytes / MB).toFixed(1)} MB, ${size.files} files -> ${dest}`);
}

/** Copies a staged tree, dereferencing any hardlinks the archive expanded into. */
async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) await copyTree(source, target);
    else await copyFile(source, target);
  }
}

function verifyOnly() {
  let failed = false;
  if (!only || only === "python") {
    const dir = join(resourcesDir, "python");
    const ready = existsSync(join(dir, "python.exe"));
    log(`python: ${ready ? "present" : `MISSING at ${dir}`}`);
    if (ready) verifyPython(dir);
    failed ||= !ready;
  }
  if (!only || only === "git") {
    const dir = join(resourcesDir, "git");
    const ready = existsSync(join(dir, "cmd", "git.exe"));
    log(`git: ${ready ? "present" : `MISSING at ${dir}`}`);
    if (ready) verifyGit(dir);
    failed ||= !ready;
  }
  if (failed) process.exitCode = 1;
}

async function main() {
  if (checkOnly) {
    verifyOnly();
    return;
  }
  if (process.platform !== "win32") {
    // The archives are Windows binaries. macOS/Linux toolchains are a separate
    // fetch (and a separate budget); until they exist, do not pretend.
    log(`skipping: no ${process.platform} toolchain pinned yet`);
    return;
  }
  await mkdir(cacheDir, { recursive: true });
  if (!only || only === "python") await buildPython();
  if (!only || only === "git") await buildGit();
}

main().catch((error) => {
  console.error(`[runtime-tools] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

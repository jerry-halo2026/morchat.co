#!/usr/bin/env node
// Bundles a *usable DSH runtime* into apps/desktop/resources/ so an installed
// morechat.co can register DSH on first launch instead of asking the user to go
// install DeepSeek Harness themselves.
//
// Three things are copied:
//
//   1. the DSH CLI and everything its boot chain resolves at startup
//      (`node_modules/**`, the package manifest, and DSH's own
//      `desktop-runtime.json`) 鈫?`resources/dsh/`;
//   2. the pinned portable Node that runs that CLI 鈫?`resources/node/`;
//   3. the `multica` profile bundle, when a bridge build is available ->
//      `resources/dsh-profile/` (see `writeDshProfileBundle`).
//
// (3) is what turns "the daemon can see dsh" into the official install path:
// the daemon installs a local bundle directory itself, with no pnpm and no
// registry, so `MULTICA_DSH_PROFILE_BUNDLE` can point inside the app. The
// directory layout and the manifest fields it needs are recorded in
// `resources/dsh-profile/bundle.json`, which is also what a consumer reads to
// decide whether to export that variable at all — `state` is `ready` only when a
// real bundle payload was copied. Without one, the daemon correctly reports the
// profile as missing instead of trusting a placeholder.
//
// Why a pinned Node instead of the user's: DSH is a Node program (`bin` is
// `lib/bin.js`), and "installed but no Node" is the same broken first run as
// "not installed". The pin is the same v22.23.4 the repo already pins elsewhere,
// so the desktop, the daemon's probes and CI all execute one interpreter.
//
// Volume is the whole problem: the upstream install is ~436 MB across ~21k
// files, and the desktop payload has a budget. Nothing here is copied "just in
// case" 鈥?the drop list below is the measured one, and every entry states what
// stops working without it. Re-run with `--keep-package <name>` (repeatable) to
// put one back, and read the printed table before shipping a change to it.
//
// Idempotent: the destination is rebuilt from a fingerprint of the *inputs*
// (kept source files + rules + node binary), so a second run in an unchanged
// tree is a no-op and prints `up to date` 鈥?and a changed tree never leaves a
// stale file behind.
//
// Usage:
//   node scripts/bundle-dsh.mjs                 # bundle (skips if unchanged)
//   node scripts/bundle-dsh.mjs --force         # rebuild even if unchanged
//   node scripts/bundle-dsh.mjs --report-only    # measure, copy nothing
//   node scripts/bundle-dsh.mjs --max-mb 150     # budget for the warning
//
// Environment overrides (same names a CI runner would set):
//   MORECHAT_DSH_RUNTIME_SRC   upstream install root (鈥?resources/app/dsh)
//   MORECHAT_PORTABLE_NODE     directory or file holding the pinned node
//   MORECHAT_DSH_PROFILE_SRC   the @multica-ai/dsh-runtime bridge build to ship

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(here, "..");
const outRoot = join(desktopDir, "resources");
const outDshDir = join(outRoot, "dsh");
const outNodeDir = join(outRoot, "node");
const outProfileDir = join(outRoot, "dsh-profile");
const manifestPath = join(outDshDir, ".morechat-bundle.json");
const profileManifestPath = join(outProfileDir, "bundle.json");

// The package the daemon's profile check looks for, and the profile it has to
// end up loaded by. Both are fixed by server/internal/daemon/dsh_profile.go:
// a bundle whose manifest names anything else installs files the daemon then
// reports as missing.
const PROFILE_PACKAGE = "@multica-ai/dsh-runtime";
const PROFILE_NAME = "multica";
// Same commit scripts/fetch-dsh-bridge.mjs builds and caches.
const DEFAULT_BRIDGE_COMMIT = "571d7c036d15f58ee88c89fd80afb0a6c7f0023c";
const PROFILE_PAYLOAD_REL = "package";

const DEFAULT_SRC = "D:\\software\\deepseekharness\\resources\\app\\dsh";
const DEFAULT_NODE_DIR =
  "E:\\CodexData\\morchat-r1-local\\tools\\node22\\node-v22.23.4-win-x64";

// Bump when the rules change in a way that must invalidate existing bundles.
const BUNDLE_RULES = "2026-11-11.2";

/**
 * Packages dropped whole, with the reason they are droppable. All four are
 * desktop-UI payloads (DevTools frontend, native Office/PDF converters, speech
 * model, browser document preview) that the DSH *CLI* boot chain never imports:
 * a profile's own plugins are installed into `$DSH_HOME/profiles/<name>` by
 * `dsh plugin add`, not taken from this tree.
 */
const DROPPED_PACKAGES = [
  {
    // 182 MB: LibreOffice + PDF converters behind `dsh-skill-office`. Only
    // mounted by `dsh-desktop-host` (the DSH *Electron* app), never by a
    // `--profile 鈥?--stdio` runtime.
    path: "@deepseek-ai/libreoffice-kit-win32-x64",
    why: "native Office/PDF converters (desktop host only)",
  },
  {
    // 22 MB: SenseVoice speech-to-text weights, voice input.
    path: "sherpa-onnx-win-x64",
    why: "speech-to-text native model (voice input)",
  },
  {
    // 22 MB: Chrome DevTools frontend (lighthouse worker alone is 8.8 MB).
    path: "@deepseek-ai/dsh-experimental-inspector",
    why: "embedded DevTools UI (experimental inspector profile)",
  },
  {
    // 14 MB: pdf.js + exceljs bundles for the browser sidebar preview.
    path: "@deepseek-ai/dsh-client-ui-sidebar-documentpreview",
    why: "browser document preview bundles",
  },
];

/**
 * Per-file drops. Sources, docs, tests and READMEs are dead weight at runtime:
 * the compiled `lib` output is what executes, and no package's `main`/`exports`
 * points into `src/` (verified against all 1,300+ manifests in the tree).
 */
const DROP_FILE_RULES = [
  { test: (rel) => rel.endsWith(".map"), why: "source map" },
  { test: (rel) => /\.md$/i.test(rel) || /(^|\/)README(\..*)?$/i.test(rel), why: "docs" },
  // Only drop documentation directories of our own tree. A vendored package may
  // keep runtime code under a folder named `doc` - yaml ships
  // dist/doc/directives.js and its composer requires it - and dropping those
  // broke `dsh --profile <name> --probe` with "Cannot find module
  // '../doc/directives.js'" in an installed client.
  {
    test: (rel) => !rel.startsWith("node_modules/") && /(^|\/)docs?\//i.test(rel),
    why: "docs",
  },
  { test: (rel) => /(^|\/)(test|tests|__tests__|__mocks__|fixtures)\//i.test(rel), why: "tests" },
  // Only drop uncompiled sources from our own tree. A vendored package may ship
  // the code it actually runs under src/ - human-signals keeps build/src/main.js,
  // and execa imports it, so trimming those made any profile with plugins fail to
  // load ("Cannot find module human-signals/build/src/main.js").
  { test: (rel) => !rel.startsWith("node_modules/") && /(^|\/)src\//.test(rel), why: "uncompiled sources" },
  { test: (rel) => /(^|\/)\.[^/]+rc(\.[a-z]+)?$/i.test(rel) && !rel.includes("node_modules/"), why: "dev config" },
];

function parseArgs(argv) {
  const out = {
    src: process.env.MORECHAT_DSH_RUNTIME_SRC || DEFAULT_SRC,
    node: process.env.MORECHAT_PORTABLE_NODE || DEFAULT_NODE_DIR,
    profileSrc: process.env.MORECHAT_DSH_PROFILE_SRC || "",
    maxMb: 150,
    force: false,
    reportOnly: false,
    keep: new Set(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`[bundle-dsh] ${arg} needs a value`);
      i += 1;
      return next;
    };
    switch (arg) {
      case "--src":
        out.src = value();
        break;
      case "--node":
        out.node = value();
        break;
      case "--profile-src":
        out.profileSrc = value();
        break;
      case "--max-mb":
        out.maxMb = Number(value());
        if (!Number.isFinite(out.maxMb) || out.maxMb <= 0) {
          throw new Error("[bundle-dsh] --max-mb needs a positive number");
        }
        break;
      case "--keep-package":
        out.keep.add(value().replace(/\\/g, "/"));
        break;
      case "--force":
        out.force = true;
        break;
      case "--report-only":
        out.reportOnly = true;
        break;
      default:
        throw new Error(`[bundle-dsh] unknown argument: ${arg}`);
    }
  }
  return out;
}

function mb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

/** Walks `root`, returning posix-style relative paths for every regular file. */
async function walk(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walk(root, rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files;
}

function droppedPackage(rel, keep) {
  for (const rule of DROPPED_PACKAGES) {
    if (keep.has(rule.path)) continue;
    // Match at any nesting depth: pnpm keeps real copies under
    // `node_modules/@deepseek-ai/*鈥?node_modules/` in some layouts.
    if (rel.includes(`node_modules/${rule.path}/`)) return rule;
  }
  return null;
}

function classify(rel, keep) {
  const pkg = droppedPackage(rel, keep);
  if (pkg) return { keep: false, why: pkg.why, group: pkg.path };
  for (const rule of DROP_FILE_RULES) {
    if (rule.test(rel)) return { keep: false, why: rule.why, group: rule.why };
  }
  return { keep: true, why: "runtime", group: groupOf(rel) };
}

/** Size attribution for the report: `@scope/name`, top-level dir, or `<root>`. */
function groupOf(rel) {
  const parts = rel.split("/");
  const nm = parts.indexOf("node_modules");
  if (nm === -1) return "<root>";
  const name = parts[nm + 1] ?? "";
  if (name.startsWith("@")) return parts[nm + 2] ? `${name}/${parts[nm + 2]}` : name;
  return name;
}

async function resolveNodeBinary(input) {
  const candidates = [];
  const direct = [input, join(input, process.platform === "win32" ? "node.exe" : "node")];
  for (const candidate of direct) candidates.push(candidate);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const info = await stat(candidate);
    if (info.isFile()) return candidate;
  }
  return null;
}

function shimScripts(platform) {
  // Both shims are generated by this script rather than committed: their only
  // job is "run the CLI with the Node we shipped", and a relative path is the
  // only form that survives an install under a path with spaces.
  const cmd = [
    "@echo off",
    "rem Generated by scripts/bundle-dsh.mjs 鈥?do not edit.",
    'setlocal',
    'set "NODE=%~dp0..\\..\\node\\node.exe"',
    'set "DSH=%~dp0..\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js"',
    '"%NODE%" "%DSH%" %*',
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");
  const sh = [
    "#!/bin/sh",
    "# Generated by scripts/bundle-dsh.mjs 鈥?do not edit.",
    'here=$(cd -- "$(dirname -- "$0")" && pwd)',
    'exec "$here/../../node/node" "$here/../node_modules/@deepseek-ai/dsh/lib/bin.js" "$@"',
    "",
  ].join("\n");
  return platform === "win32"
    ? [{ rel: "bin/dsh.cmd", body: cmd, mode: 0o755 }]
    : [{ rel: "bin/dsh", body: sh, mode: 0o755 }];
}

function probeBundle(nodeBinary, entryPath) {
  const result = spawnSync(nodeBinary, [entryPath, "--version"], {
    timeout: 10_000,
    encoding: "utf8",
    // A probe must never inherit a user's credentials; only the version is read.
    env: { ...process.env, DSH_HOME: "" },
  });
  const stdout = (result.stdout ?? "").trim();
  if (result.error) {
    return { ok: false, error: result.error.message };
  }
  if (result.status !== 0) {
    return { ok: false, error: `exit ${result.status}: ${(result.stderr ?? "").trim().slice(0, 300)}` };
  }
  return { ok: /^[0-9]+\.[0-9]+\.[0-9]+/.test(stdout), version: stdout.split(/\r?\n/)[0] };
}

/**
 * Reads a JSON file, tolerating a UTF-8 BOM. A package.json written by a Windows
 * tool (PowerShell's `-Encoding utf8` writes one) is otherwise a parse error for
 * `JSON.parse`, and that would fail the whole bundle build over an invisible
 * character.
 */
async function readJsonFile(path) {
  const text = await readFile(path, "utf8");
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

/**
 * Locates a built `@multica-ai/dsh-runtime` bridge: an explicit source wins,
 * otherwise the DSH install tree is asked, which is where `dsh plugin add` would
 * have put it. Returns null when there is none.
 */
async function resolveProfileSource(options) {
  // An explicit source wins, then the checkout scripts/fetch-dsh-bridge.mjs caches
  // by commit (what a release build produces), then whatever sits in the DSH tree
  // because someone ran `dsh plugin add` by hand.
  const cachedBridge = join(
    here,
    "..",
    "..",
    "..",
    ".cache",
    "dsh-bridge",
    process.env.MORECHAT_DSH_BRIDGE_COMMIT || DEFAULT_BRIDGE_COMMIT,
  );
  const candidates = options.profileSrc
    ? [resolve(options.profileSrc)]
    : [cachedBridge, join(resolve(options.src), "node_modules", ...PROFILE_PACKAGE.split("/"))];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "package.json"))) return candidate;
  }
  return null;
}

/**
 * Produces `resources/dsh-profile/`: the `multica` profile bundle the daemon
 * installs, plus the manifest that describes it (`bundle.json`).
 *
 * Only a real bridge payload is ever written into `package/`. The bridge is not
 * on a public registry yet (multica#6936), so a build without one still gets
 * `bundle.json` — with `state: "missing-bridge"` and no payload — and the daemon
 * is left to report the profile as missing, which is the truth. Writing a
 * placeholder package would make the profile look installed and then fail every
 * `--probe`, which is strictly worse than saying so.
 *
 * Volume: this is a profile bundle, not the DSH install. Only the files DSH
 * loads are kept; sources, source maps, docs and tests are dropped.
 */
async function writeDshProfileBundle(options, dshVersion) {
  await rm(outProfileDir, { recursive: true, force: true });
  await mkdir(outProfileDir, { recursive: true });

  const source = await resolveProfileSource(options);
  const manifest = {
    schemaVersion: 1,
    rules: BUNDLE_RULES,
    kind: "dsh-profile-bundle",
    profile: PROFILE_NAME,
    package: PROFILE_PACKAGE,
    // What server/internal/daemon/dsh_profile.go expects. Paths are relative to
    // the app's resources root.
    layout: {
      bundle: `dsh-profile/${PROFILE_PAYLOAD_REL}`,
      profileManifest: `profiles/${PROFILE_NAME}/package.json`,
      bundleInstallPath: `profiles/${PROFILE_NAME}/node_modules/${PROFILE_PACKAGE}`,
      manifestBundlesKey: "dsh.profile.bundles",
      manifestBundlesEntry: PROFILE_PACKAGE,
      manifestDependencyKey: `dependencies.${PROFILE_PACKAGE}`,
    },
    // For the desktop bootstrap: with no payload there is nothing to export, and
    // the daemon's existing "report the missing profile" behaviour is correct.
    env: source ? { MULTICA_DSH_PROFILE_BUNDLE: "dsh-profile/package" } : {},
    dshVersion,
    state: "missing-bridge",
    source: source ?? null,
    files: 0,
    bytes: 0,
    builtAt: new Date().toISOString(),
  };

  if (!source) {
    console.warn(
      `[bundle-dsh] no ${PROFILE_PACKAGE} bridge build found (looked at ` +
        `${join(resolve(options.src), "node_modules", PROFILE_PACKAGE)}); ` +
        "resources/dsh-profile carries the manifest only and the daemon will report the profile as missing. " +
        "Set MORECHAT_DSH_PROFILE_SRC to the built bridge to ship it.",
    );
    await writeFile(profileManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  }

  const pkg = await readJsonFile(join(source, "package.json"));
  if (pkg.name !== PROFILE_PACKAGE) {
    // Not a hard failure: a checkout of the wrong package must not break a
    // release build, and the daemon refuses it by name anyway.
    console.warn(
      `[bundle-dsh] ${source}/package.json names "${pkg.name ?? ""}", not ${PROFILE_PACKAGE}; ` +
        "the daemon only installs a bundle by that exact name, so nothing is shipped.",
    );
    manifest.state = "wrong-package";
    manifest.packageFound = pkg.name ?? null;
    await writeFile(profileManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  }

  const payloadDir = join(outProfileDir, PROFILE_PAYLOAD_REL);
  const kept = [];
  let bytes = 0;
  for (const rel of await walk(source)) {
    // The bridge declares no runtime dependencies - its @deepseek-ai peers are
    // optional and satisfied by the DSH host. Copying the build's node_modules
    // shipped 75 MB of .pnpm store and made the bundled runtime refuse the
    // profile ("required plugin did not activate"), so the payload is the package
    // itself: dist/, package.json and the cordis patch.
    if (rel === "node_modules" || rel.startsWith("node_modules/")) continue;
    const dropRule = DROP_FILE_RULES.find((rule) => rule.test(rel));
    if (dropRule) continue;
    const info = await stat(join(source, rel));
    const dest = join(payloadDir, rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(source, rel), dest);
    kept.push({ rel, bytes: info.size });
    bytes += info.size;
  }

  manifest.state = "ready";
  manifest.version = pkg.version ?? null;
  manifest.files = kept.length;
  manifest.bytes = bytes;
  manifest.fingerprint = createHash("sha256")
    .update(BUNDLE_RULES)
    .update(`\n${pkg.name}\n${pkg.version ?? ""}\n`)
    .update(kept.map((file) => `${file.rel}:${file.bytes}`).sort().join("\n"))
    .digest("hex");
  await writeFile(profileManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `[bundle-dsh] profile bundle: ${kept.length} files / ${(bytes / 1024).toFixed(1)} KB from ${source} ` +
      `(${PROFILE_PACKAGE} ${pkg.version ?? "unknown"}) -> ${payloadDir}`,
  );
  return manifest;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const srcDir = resolve(options.src);

  if (!existsSync(join(srcDir, "node_modules", "@deepseek-ai", "dsh", "package.json"))) {
    // Mirrors bundle-cli.mjs: a missing source must not break a frontend-only
    // build. The feature degrades to "no bundled runtime", which the main
    // process reports to the UI as the install-the-runtime state.
    console.warn(
      `[bundle-dsh] no DSH install at ${srcDir} 鈥?skipping. ` +
        "Desktop will report the runtime as absent and show the install prompt. " +
        "Set MORECHAT_DSH_RUNTIME_SRC to bundle one.",
    );
    await rm(outDshDir, { recursive: true, force: true });
    await rm(outNodeDir, { recursive: true, force: true });
    await rm(outProfileDir, { recursive: true, force: true });
    process.exit(0);
  }

  const nodeBinary = await resolveNodeBinary(resolve(options.node));
  if (!nodeBinary) {
    throw new Error(
      `[bundle-dsh] pinned node not found at ${resolve(options.node)}. ` +
        "Set MORECHAT_PORTABLE_NODE to the directory holding node.exe.",
    );
  }
  const nodeInfo = await stat(nodeBinary);
  const nodeName = process.platform === "win32" ? "node.exe" : "node";

  const files = await walk(srcDir);
  const kept = [];
  const dropped = { files: 0, bytes: 0, groups: new Map() };
  let keptBytes = 0;
  for (const rel of files) {
    const verdict = classify(rel, options.keep);
    const info = await stat(join(srcDir, rel));
    if (verdict.keep) {
      kept.push({ rel, bytes: info.size, group: verdict.group });
      keptBytes += info.size;
    } else {
      dropped.files += 1;
      dropped.bytes += info.size;
      const group = verdict.group;
      const current = dropped.groups.get(group) ?? { files: 0, bytes: 0, why: verdict.why };
      current.files += 1;
      current.bytes += info.size;
      dropped.groups.set(group, current);
    }
  }

  const dshManifest = JSON.parse(
    await readFile(join(srcDir, "node_modules", "@deepseek-ai", "dsh", "package.json"), "utf8"),
  );
  const fingerprint = createHash("sha256")
    .update(BUNDLE_RULES)
    .update(`\n${dshManifest.version}\n${nodeBinary}\n${nodeInfo.size}\n`)
    .update(kept.map((file) => `${file.rel}:${file.bytes}`).sort().join("\n"))
    .digest("hex");

  const groupTotals = new Map();
  for (const file of kept) {
    groupTotals.set(file.group, (groupTotals.get(file.group) ?? 0) + file.bytes);
  }
  const top = [...groupTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  console.log(
    `[bundle-dsh] source ${srcDir} (dsh ${dshManifest.version}): ` +
      `${files.length} files / ${mb(keptBytes + dropped.bytes)} MB`,
  );
  console.log(
    `[bundle-dsh] keep ${kept.length} files / ${mb(keptBytes)} MB 鈥?` +
      `drop ${dropped.files} files / ${mb(dropped.bytes)} MB`,
  );
  for (const [group, bytes] of top) {
    console.log(`  keep ${String(mb(bytes)).padStart(8)} MB  ${group}`);
  }
  for (const [group, info] of [...dropped.groups.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 8)) {
    console.log(
      `  drop ${String(mb(info.bytes)).padStart(8)} MB  ${group} (${info.why}, ${info.files} files)`,
    );
  }

  const totalMb = mb(keptBytes + nodeInfo.size);
  console.log(
    `[bundle-dsh] payload: dsh ${mb(keptBytes)} MB + node ${mb(nodeInfo.size)} MB = ${totalMb} MB ` +
      `(budget ${options.maxMb} MB)`,
  );
  if (mb(keptBytes) > options.maxMb) {
    // A warning, not a failure: upstream growth must not block a release build,
    // but it must be impossible to miss in the build log.
    console.warn(
      `[bundle-dsh] WARNING resources/dsh is ${mb(keptBytes)} MB, over the ${options.maxMb} MB budget. ` +
        "Add a measured DROPPED_PACKAGES entry or raise --max-mb deliberately.",
    );
  }

  if (options.reportOnly) {
    const profileSource = await resolveProfileSource(options);
    console.log(
      profileSource
        ? `[bundle-dsh] profile bundle: would ship ${profileSource} -> ${join(outProfileDir, PROFILE_PAYLOAD_REL)}`
        : `[bundle-dsh] profile bundle: no ${PROFILE_PACKAGE} bridge build; resources/dsh-profile would carry the manifest only`,
    );
    console.log("[bundle-dsh] --report-only: nothing copied");
    return;
  }

  if (!options.force && existsSync(manifestPath) && existsSync(profileManifestPath)) {
    try {
      const existing = JSON.parse(await readFile(manifestPath, "utf8"));
      if (existing.fingerprint === fingerprint) {
        console.log(`[bundle-dsh] up to date 鈥?${existing.files} files / ${mb(existing.bytes)} MB in ${outDshDir}`);
        return;
      }
    } catch {
      // An unreadable manifest is just "rebuild".
    }
  }

  // Rebuild from scratch so a rule change can never leave a stale package that
  // the next run then counts as part of the bundle.
  await rm(outDshDir, { recursive: true, force: true });
  await rm(outNodeDir, { recursive: true, force: true });

  for (const file of kept) {
    const dest = join(outDshDir, file.rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(srcDir, file.rel), dest);
  }
  for (const shim of shimScripts(process.platform)) {
    const dest = join(outDshDir, shim.rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, shim.body, { mode: shim.mode });
  }

  await mkdir(outNodeDir, { recursive: true });
  await copyFile(nodeBinary, join(outNodeDir, nodeName));

  const entryRel = "node_modules/@deepseek-ai/dsh/lib/bin.js";
  const probe = probeBundle(join(outNodeDir, nodeName), join(outDshDir, entryRel));
  if (probe.ok) {
    console.log(`[bundle-dsh] bundled runtime answers --version: ${probe.version}`);
  } else {
    console.warn(`[bundle-dsh] bundled runtime failed its --version probe: ${probe.error}`);
  }

  const manifest = {
    schemaVersion: 1,
    rules: BUNDLE_RULES,
    runtime: "dsh",
    version: dshManifest.version,
    fingerprint,
    source: srcDir,
    entry: entryRel,
    node: { file: nodeName, bytes: nodeInfo.size },
    files: kept.length,
    bytes: keptBytes,
    nodeBytes: nodeInfo.size,
    dropped: { files: dropped.files, bytes: dropped.bytes },
    builtAt: new Date().toISOString(),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // After the runtime, not before: the profile bundle is only meaningful next to
  // the dsh that will load it, and a report-only or missing-source run has
  // already returned above.
  const profile = await writeDshProfileBundle(options, dshManifest.version);

  console.log(
    `[bundle-dsh] wrote ${kept.length} files / ${mb(keptBytes)} MB 鈫?${outDshDir} ` +
      `and ${nodeName} ${mb(nodeInfo.size)} MB 鈫?${outNodeDir}`,
  );
  console.log(`[bundle-dsh] profile bundle state: ${profile.state}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

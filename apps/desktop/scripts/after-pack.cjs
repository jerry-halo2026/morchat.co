// Copies the bundled DSH runtime, the portable Node, the DSH profile bundle, and
// the portable toolchain (python + git) next to the packaged app.
//
// electron-builder's export path is not usable for this payload: its file
// matcher drops nested `node_modules`, and the runtime *is* a node_modules tree,
// so `extraResources` shipped four files instead of thirteen thousand. Copying
// here goes through fs.cp, which has no matcher and no surprises, and it keeps
// the per-target layout that `process.resourcesPath` already points at.
//
// `dsh-profile` travels with them rather than separately because the daemon
// installs it as a local bundle directory, and a path the app cannot see at
// runtime is the one thing that would make `MULTICA_DSH_PROFILE_BUNDLE` useless.
//
// `python` and `git` are what CONTRACTS.md ("运行时自带的工具链") promises: an
// agent run has both on PATH even when the machine has neither installed. They
// are produced by scripts/fetch-runtime-tools.mjs and are *required* on Windows -
// shipping an installer that silently lacks them ships the exact broken first
// run this feature exists to prevent. macOS/Linux have no pinned toolchain yet,
// so there a missing directory is only a warning.
/* eslint-disable @typescript-eslint/no-require-imports -- electron-builder
   loads an `afterPack` hook with require(); a CommonJS module is the entry. Same
   constraint as scripts/before-pack.cjs in this directory. */
const { cp, mkdir, readdir, stat } = require("node:fs/promises");
const { join } = require("node:path");

const BUNDLED_TOOLS = ["dsh", "node", "dsh-profile", "python", "git"];

// Checked after the copy: a directory that exists but is empty (a failed fetch,
// an interrupted copy) is worse than a missing one, because it looks installed.
const TOOL_PROBES = {
  dsh: ["bin/dsh.cmd"],
  node: ["node.exe"],
  python: ["python.exe", "Lib/site-packages/pip"],
  git: ["cmd/git.exe", "ucrt64/bin/git.exe"],
};

const REQUIRED_ON = { win32: ["dsh", "python", "git"] };

async function countFiles(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += await countFiles(join(dir, entry.name));
    else total += 1;
  }
  return total;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

exports.default = async function afterPack(context) {
  const source = join(context.packager.projectDir, "resources");
  // Windows and Linux keep resources beside the executable; macOS keeps them
  // inside the bundle, which is what `context.appOutDir` already names.
  const target = join(
    context.appOutDir,
    context.electronPlatformName === "darwin"
      ? join(context.packager.appInfo.productFilename + ".app", "Contents", "Resources")
      : "resources",
  );

  const required = new Set(REQUIRED_ON[context.electronPlatformName] ?? []);

  for (const name of BUNDLED_TOOLS) {
    const from = join(source, name);
    if (!(await exists(from))) {
      if (required.has(name)) {
        throw new Error(
          `[after-pack] ${name} is missing at ${from}; run \`node scripts/fetch-runtime-tools.mjs\` ` +
            "before packaging (the installer would promise a toolchain it does not contain)",
        );
      }
      console.warn(`[after-pack] ${name} is missing at ${from}; the installer will ship without it`);
      continue;
    }
    const to = join(target, name);
    await mkdir(to, { recursive: true });
    await cp(from, to, { recursive: true, force: true, dereference: true });
    for (const probe of TOOL_PROBES[name] ?? []) {
      if (!(await exists(join(to, probe)))) {
        throw new Error(`[after-pack] ${name} was copied to ${to} but ${probe} is missing`);
      }
    }
    console.log(`[after-pack] copied ${name}: ${await countFiles(to)} files`);
  }
};

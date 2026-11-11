// Copies the bundled DSH runtime, the portable Node, and the DSH profile bundle
// next to the packaged app.
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
const { cp, mkdir, readdir, stat } = require("node:fs/promises");
const { join } = require("node:path");

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

  for (const name of ["dsh", "node", "dsh-profile"]) {
    const from = join(source, name);
    if (!(await exists(from))) {
      console.warn(`[after-pack] ${name} is missing at ${from}; the installer will ship without it`);
      continue;
    }
    const to = join(target, name);
    await mkdir(to, { recursive: true });
    await cp(from, to, { recursive: true, force: true, dereference: true });
    console.log(`[after-pack] copied ${name}: ${await countFiles(to)} files`);
  }
};

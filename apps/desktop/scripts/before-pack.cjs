// electron-builder `beforePack` hook: the one place per-release work that must
// happen *before* the file list is collected lives.
//
// electron-builder supports exactly one `beforePack` entry, and two things need
// it:
//
//   1. the macOS update floor (scripts/mac-update-floor.cjs) — it mutates
//      `packager.platformSpecificBuildOptions.releaseInfo` before the update
//      metadata is generated;
//   2. the bundled DSH runtime (scripts/bundle-dsh.mjs) — `extraResources`
//      copies `resources/dsh` and `resources/node`, so they have to exist on
//      disk before packing starts. Without this hook a clean checkout would
//      package an installer with no runtime, and "install and go" would be
//      false on exactly the machines this feature is for.
//
// Keeping the mac floor logic in its own module preserves its unit tests; this
// file only orders the two steps.

/* eslint-disable @typescript-eslint/no-require-imports -- electron-builder
   loads a `beforePack` hook with require(); an ESM module cannot be the entry.
   Same constraint as scripts/local-dsh-account.cjs in this directory. */

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const { applyMacUpdateFloor } = require("./mac-update-floor.cjs");

const BUNDLE_DIR_ENV = "MORECHAT_SKIP_DSH_BUNDLE";

async function beforePack(context) {
  applyMacUpdateFloor(context);

  if (process.env[BUNDLE_DIR_ENV] === "1") {
    console.log("[before-pack] MORECHAT_SKIP_DSH_BUNDLE=1 — not bundling the DSH runtime");
    return;
  }

  // Synchronous on purpose: electron-builder collects `extraResources` right
  // after this hook resolves, so the directories must already be complete.
  // `bundle-dsh.mjs` is idempotent (a fingerprint match is a ~2 s no-op) and
  // exits 0 with a warning when no DSH install is present to copy.
  const bundleScript = join(__dirname, "bundle-dsh.mjs");
  console.log("[before-pack] bundling the DSH runtime");
  const result = spawnSync(process.execPath, [bundleScript], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw new Error(`[before-pack] could not run ${bundleScript}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `[before-pack] ${bundleScript} failed with exit ${result.status}; ` +
        "refusing to package an installer without the runtime it promises",
    );
  }
}

module.exports = beforePack;
module.exports.default = beforePack;
module.exports.beforePack = beforePack;
module.exports.BUNDLE_DIR_ENV = BUNDLE_DIR_ENV;

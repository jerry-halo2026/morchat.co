// electron-builder `beforePack` hook: the one place per-release work that must
// happen *before* the file list is collected lives.
//
// electron-builder supports exactly one `beforePack` entry, and three things
// need it:
//
//   1. the macOS update floor (scripts/mac-update-floor.cjs) — it mutates
//      `packager.platformSpecificBuildOptions.releaseInfo` before the update
//      metadata is generated;
//   2. the bundled DSH runtime (scripts/bundle-dsh.mjs) — `extraResources`
//      copies `resources/dsh` and `resources/node`, so they have to exist on
//      disk before packing starts. Without this hook a clean checkout would
//      package an installer with no runtime, and "install and go" would be
//      false on exactly the machines this feature is for;
//   3. the portable python + git toolchain (scripts/fetch-runtime-tools.mjs) —
//      same argument for the toolchain CONTRACTS.md promises agents, except the
//      trees are downloaded instead of built, which is why it warns instead of
//      throwing when there is no network.
//
// Keeping the mac floor logic in its own module preserves its unit tests; this
// file only orders the three steps.

/* eslint-disable @typescript-eslint/no-require-imports -- electron-builder
   loads a `beforePack` hook with require(); an ESM module cannot be the entry.
   Same constraint as scripts/local-dsh-account.cjs in this directory. */

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const { applyMacUpdateFloor } = require("./mac-update-floor.cjs");

const BUNDLE_DIR_ENV = "MORECHAT_SKIP_DSH_BUNDLE";
const RUNTIME_TOOLS_ENV = "MORECHAT_SKIP_RUNTIME_TOOLS";

async function beforePack(context) {
  applyMacUpdateFloor(context);

  if (process.env[BUNDLE_DIR_ENV] === "1") {
    console.log("[before-pack] MORECHAT_SKIP_DSH_BUNDLE=1 — not bundling the DSH runtime");
  } else {
    // Synchronous on purpose: electron-builder collects `extraResources` right
    // after this hook resolves, so the directories must already be complete.
    // `bundle-dsh.mjs` is idempotent (a fingerprint match is a ~2 s no-op) and
    // exits 0 with a warning when no DSH install is present to copy.
    runScript("bundle-dsh.mjs", "the DSH runtime", { fatal: true });
  }

  // The portable python + git trees (scripts/fetch-runtime-tools.mjs) are
  // downloaded rather than built, so this is the step that needs the network.
  // Its failure is deliberately not fatal: `after-pack` is where the payload is
  // copied and where a missing tree becomes one error naming the command to run,
  // which is a better message for an offline contributor than a stack trace from
  // this hook.
  if (process.env[RUNTIME_TOOLS_ENV] === "1") {
    console.log("[before-pack] MORECHAT_SKIP_RUNTIME_TOOLS=1 — not fetching python/git");
  } else {
    runScript("fetch-runtime-tools.mjs", "the portable python + git toolchain", { fatal: false });
  }
}

function runScript(name, description, { fatal }) {
  const script = join(__dirname, name);
  console.log(`[before-pack] bundling ${description}`);
  const result = spawnSync(process.execPath, [script], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw new Error(`[before-pack] could not run ${script}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (fatal) {
      throw new Error(
        `[before-pack] ${script} failed with exit ${result.status}; ` +
          "refusing to package an installer without the runtime it promises",
      );
    }
    console.warn(`[before-pack] ${script} exited ${result.status}; after-pack reports what is missing`);
  }
}

module.exports = beforePack;
module.exports.default = beforePack;
module.exports.beforePack = beforePack;
module.exports.BUNDLE_DIR_ENV = BUNDLE_DIR_ENV;
module.exports.RUNTIME_TOOLS_ENV = RUNTIME_TOOLS_ENV;

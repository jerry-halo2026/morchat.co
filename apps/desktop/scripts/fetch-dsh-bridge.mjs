// Fetches and builds the Multica DSH runtime bridge, so a release build can ship
// a profile payload without a human remembering four commands.
//
// The bridge is not on npm yet (multica#6936), so the only reproducible source is
// a pinned commit of multica-ai/dsh-multica-runtime. The build output is cached by
// commit: a second packaging run reuses it instead of cloning again.
//
//   node scripts/fetch-dsh-bridge.mjs            # ensure the pinned commit is built
//   node scripts/fetch-dsh-bridge.mjs --force    # rebuild even if cached
//   node scripts/fetch-dsh-bridge.mjs --print    # only print the path
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(DESKTOP_DIR, "..", "..");
const REPO = "https://github.com/multica-ai/dsh-multica-runtime";
const COMMIT = process.env.MORECHAT_DSH_BRIDGE_COMMIT || "571d7c036d15f58ee88c89fd80afb0a6c7f0023c";
const CACHE_ROOT = join(REPO_ROOT, ".cache", "dsh-bridge");
const TARGET = join(CACHE_ROOT, COMMIT);

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const printOnly = argv.includes("--print");

function run(command, args, cwd) {
  // Windows resolves pnpm through a .cmd shim, which execFile cannot spawn
  // directly (EINVAL); a shell is what the shim expects.
  execFileSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
}

function built() {
  return existsSync(join(TARGET, "dist", "index.js")) && existsSync(join(TARGET, "package.json"));
}

async function main() {
  if (built() && !force) {
    console.log(`[dsh-bridge] reusing ${TARGET}`);
    console.log(TARGET);
    return;
  }
  if (printOnly) {
    console.log(TARGET);
    return;
  }

  await mkdir(CACHE_ROOT, { recursive: true });
  if (!existsSync(join(TARGET, ".git"))) {
    console.log(`[dsh-bridge] cloning ${REPO} at ${COMMIT.slice(0, 12)}`);
    run("git", ["clone", "--filter=blob:none", "--no-checkout", REPO, TARGET]);
    run("git", ["checkout", COMMIT], TARGET);
  } else {
    console.log(`[dsh-bridge] reusing checkout ${TARGET}`);
    run("git", ["checkout", COMMIT], TARGET);
  }

  // pnpm is what the bridge's own lockfile expects; install then build is the
  // sequence its README documents, and `tsc -p tsconfig.build.json` is the build.
  run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["install", "--prefer-offline"], TARGET);
  run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["build"], TARGET);

  if (!built()) {
    throw new Error(`[dsh-bridge] build finished but ${join(TARGET, "dist", "index.js")} is missing`);
  }
  console.log(`[dsh-bridge] ready: ${TARGET}`);
  console.log(TARGET);
}

main().catch((error) => {
  console.error(`[dsh-bridge] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

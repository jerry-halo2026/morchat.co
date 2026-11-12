// @vitest-environment node
import { delimiter, join, resolve } from "path";
import { describe, expect, it } from "vitest";

import { daemonSpawnEnv } from "./daemon-spawn-env";

const repo = resolve("/repo");
const desktop = join(repo, "apps", "desktop");
const userPath = [resolve("/opt/homebrew/bin"), resolve("/usr/bin")];
const scriptBins = [
  join(desktop, "node_modules", ".bin"),
  join(repo, "node_modules", ".bin"),
  resolve("/pnpm/dist/node-gyp-bin"),
];

// What `pnpm dev:desktop` → turbo → `electron-vite dev` adds, as observed in a
// dev Desktop's daemon.
const LAUNCHER_ENV = {
  NODE: "/opt/homebrew/bin/node",
  NODE_PATH: "/repo/node_modules/.pnpm/electron-vite@5.0.0/node_modules",
  INIT_CWD: desktop,
  PNPM_SCRIPT_SRC_DIR: desktop,
  npm_command: "run-script",
  npm_config_catalog: '{"react":"19.2.0"}',
  npm_config_frozen_lockfile: "",
  npm_config_registry: "https://registry.npmjs.org/",
  npm_config_shamefully_hoist: "true",
  npm_config_verify_deps_before_run: "false",
  npm_execpath: "/pnpm/bin/pnpm.cjs",
  npm_lifecycle_event: "dev",
  npm_package_name: "@morechat/desktop",
  pnpm_config_verify_deps_before_run: "false",
  TURBO_HASH: "1cb7045295f9eb44",
  TURBO_INVOCATION_DIR: repo,
  NODE_ENV: "development",
  NODE_ENV_ELECTRON_VITE: "development",
  ELECTRON_CLI_ARGS: "[]",
  ELECTRON_EXEC_PATH: "/repo/node_modules/electron/dist/Electron",
  ELECTRON_MAJOR_VER: "44",
  ELECTRON_RENDERER_URL: "http://localhost:5173",
};

// Same prefixes as the launcher env, but set by the user.
const USER_ENV = {
  HOME: "/Users/me",
  PNPM_HOME: "/Users/me/Library/pnpm",
  TURBO_TOKEN: "secret",
  ELECTRON_MIRROR: "https://mirror.example/electron/",
  NODE_OPTIONS: "--max-old-space-size=8192",
};

// fix-path's login-shell PATH: the user's entries, then what pnpm added.
const DEV_PATH = [...userPath, ...scriptBins, resolve("/usr/local/bin")].join(delimiter);

describe("daemonSpawnEnv", () => {
  it("drops the launcher env under a dev Desktop and keeps the user's", () => {
    const env = daemonSpawnEnv({ ...USER_ENV, ...LAUNCHER_ENV, PATH: DEV_PATH });

    expect(env).toEqual({
      ...USER_ENV,
      PATH: [...userPath, resolve("/usr/local/bin")].join(delimiter),
      MULTICA_LAUNCHED_BY: "desktop",
    });
  });

  it("keeps the same variables when electron-vite did not launch the Desktop", () => {
    const { NODE_ENV_ELECTRON_VITE: _marker, ...rest } = LAUNCHER_ENV;
    const source = { ...USER_ENV, ...rest, NODE_ENV: "test", PATH: DEV_PATH };

    const env = daemonSpawnEnv(source);

    expect(env).toEqual({ ...source, MULTICA_LAUNCHED_BY: "desktop" });
  });

  it("does not mutate the source env", () => {
    const source = { ...LAUNCHER_ENV, PATH: DEV_PATH };

    daemonSpawnEnv(source);

    expect(source).toEqual({ ...LAUNCHER_ENV, PATH: DEV_PATH });
  });
});

describe("daemonSpawnEnv credential variables", () => {
  it("adds the relay variables to the daemon environment", () => {
    const env = daemonSpawnEnv({ PATH: "/usr/bin" }, {
      MULTICA_RELAY_KEY: "key-from-keychain",
      DEEPSEEK_API_KEY: "key-from-keychain",
      DEEPSEEK_BASE_URL: "https://api.example.test/v1",
    });

    expect(env["MULTICA_RELAY_KEY"]).toBe("key-from-keychain");
    expect(env["DEEPSEEK_API_KEY"]).toBe("key-from-keychain");
    expect(env["DEEPSEEK_BASE_URL"]).toBe("https://api.example.test/v1");
    expect(env["MULTICA_LAUNCHED_BY"]).toBe("desktop");
  });

  it("wins over a stale value inherited from the shell", () => {
    const env = daemonSpawnEnv(
      { DEEPSEEK_API_KEY: "stale" },
      { DEEPSEEK_API_KEY: "fresh" },
    );

    expect(env["DEEPSEEK_API_KEY"]).toBe("fresh");
  });

  it("leaves the environment untouched when no credential is configured", () => {
    const env = daemonSpawnEnv({ PATH: "/usr/bin" });

    expect(env["DEEPSEEK_API_KEY"]).toBeUndefined();
    expect(env["DEEPSEEK_BASE_URL"]).toBeUndefined();
  });
});
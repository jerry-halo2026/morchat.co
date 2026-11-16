#!/usr/bin/env node
/**
 * Local self-host control for morechat.co.
 *
 * `up`     generate .env.selfhost if missing, pick free ports, build+start the
 *          compose stack, wait for /health, and point this machine's desktop
 *          client at it.
 * `down`   stop the stack (data volumes are kept).
 * `status` print container state, URLs, and the login code.
 *
 * Local-only: the env file is written with APP_ENV=development and a fixed
 * verification code so login works without SMTP. Never use this file on a
 * server you expose.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(repoRoot, ".env.selfhost");
const composeFiles = [
  "-f",
  join(repoRoot, "docker-compose.selfhost.yml"),
  "-f",
  join(repoRoot, "docker-compose.selfhost.build.yml"),
];
const DEV_CODE = "123456";
const DEFAULTS = { api: 8081, web: 3100 };

/**
 * Address colleagues should use. `--localhost` keeps the stack private to this
 * machine; otherwise the LAN address of the interface that carries the default
 * route is used, and the ports are published on 0.0.0.0.
 */
function lanAddress() {
  const explicit = process.argv.find((arg) => arg.startsWith("--lan-ip="));
  if (explicit) return explicit.slice("--lan-ip=".length);
  if (process.argv.includes("--localhost")) return "127.0.0.1";

  if (process.platform === "win32") {
    const route = spawnSync("route", ["print", "0.0.0.0"], { encoding: "utf8" });
    for (const line of (route.stdout ?? "").split(/\r?\n/)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length === 5 && cols[0] === "0.0.0.0" && cols[1] === "0.0.0.0") {
        const local = cols[3];
        if (/^\d+\.\d+\.\d+\.\d+$/.test(local) && !local.startsWith("127.")) return local;
      }
    }
  }

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      if (address.address.startsWith("169.254.") || address.address.startsWith("172.1")) continue;
      return address.address;
    }
  }
  return "127.0.0.1";
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: repoRoot, encoding: "utf8", ...options });
}

function compose(args, options = {}) {
  return run("docker", ["compose", "--env-file", envFile, ...composeFiles, ...args], options);
}

function portFree(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", () => resolvePort(false));
    server.once("listening", () => server.close(() => resolvePort(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function pickPort(start) {
  for (let port = start; port < start + 40; port += 1) {
    if (await portFree(port)) return port;
  }
  throw new Error(`no free port near ${start}`);
}

function readEnv() {
  if (!existsSync(envFile)) return {};
  const out = {};
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

function writeEnv(values) {
  const text = readFileSync(join(repoRoot, ".env.example"), "utf8")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([A-Z0-9_]+)=/);
      if (!match) return line;
      const key = match[1];
      return key in values ? `${key}=${values[key]}` : line;
    })
    .join("\n");
  writeFileSync(envFile, text);
}

async function ensureEnv({ rebuild }) {
  const existing = readEnv();
  const host = lanAddress();
  const api = existing.PORT ? Number(existing.PORT) : await pickPort(DEFAULTS.api);
  const web = existing.FRONTEND_PORT ? Number(existing.FRONTEND_PORT) : await pickPort(DEFAULTS.web);
  const values = {
    ...existing,
    PORT: String(api),
    FRONTEND_PORT: String(web),
    // Colleagues on the LAN reach this machine by its address, so the stack is
    // published on 0.0.0.0 and every URL carries that host instead of localhost.
    BIND_HOST: host === "127.0.0.1" ? "127.0.0.1" : "0.0.0.0",
    FRONTEND_ORIGIN: `http://${host}:${web}`,
    MULTICA_APP_URL: `http://${host}:${web}`,
    MULTICA_PUBLIC_URL: `http://${host}:${api}`,
    APP_ENV: "development",
    MULTICA_DEV_VERIFICATION_CODE: DEV_CODE,
    JWT_SECRET: existing.JWT_SECRET || randomBytes(32).toString("hex"),
    POSTGRES_PASSWORD: existing.POSTGRES_PASSWORD || randomBytes(24).toString("hex"),
    MULTICA_VCS_SECRET_KEY: existing.MULTICA_VCS_SECRET_KEY || randomBytes(32).toString("base64"),
  };
  // Always rewrite: ports, bind host and the LAN URLs can change between runs
  // (a laptop that moves networks), while the secrets above are carried over.
  writeEnv(values);
  return { api, web, host, values };
}

function waitForHealth(port, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveHealth) => {
    const tick = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        const body = await res.text();
        if (res.ok && body.includes('"ok"')) return resolveHealth(true);
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) return resolveHealth(false);
      setTimeout(tick, 2000);
    };
    void tick();
  });
}

function postgresContainer() {
  const res = compose(["ps", "-q", "postgres"]);
  return res.stdout.trim().split(/\r?\n/).filter(Boolean)[0] ?? "";
}

function healDatabasePassword(password) {
  const container = postgresContainer();
  if (!container) return false;
  const res = run("docker", [
    "exec",
    container,
    "psql",
    "-U",
    "multica",
    "-d",
    "postgres",
    "-c",
    `ALTER ROLE multica PASSWORD '${password}';`,
  ]);
  if (res.status !== 0) return false;
  compose(["up", "-d", "backend"]);
  return true;
}

function writeDesktopConfig(host, api, web) {
  const dir = join(homedir(), ".multica");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "desktop.json");
  if (existsSync(file)) copyFileSync(file, `${file}.bak`);
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        apiUrl: `http://${host}:${api}`,
        wsUrl: `ws://${host}:${api}/ws`,
        appUrl: `http://${host}:${web}`,
      },
      null,
      2,
    )}\n`,
  );
  return file;
}

async function up() {
  const { api, web, host, values } = await ensureEnv({ rebuild: false });
  console.log(`==> building and starting the local stack (api ${host}:${api}, web ${host}:${web})`);
  const build = compose(["up", "-d", "--build"], { stdio: "inherit" });
  if (build.status !== 0) {
    console.error("compose up failed");
    process.exit(1);
  }

  process.stdout.write("==> waiting for the backend");
  let healthy = false;
  for (let attempt = 0; attempt < 6 && !healthy; attempt += 1) {
    healthy = await waitForHealth(api, 40_000);
    if (!healthy && attempt === 0) {
      // The volume may predate the generated password; realign the role once.
      if (healDatabasePassword(values.POSTGRES_PASSWORD)) {
        console.log("\n==> database password realigned with .env.selfhost, retrying");
        continue;
      }
    }
    process.stdout.write(".");
  }
  console.log(healthy ? "\n==> backend healthy" : "\n==> backend did not become healthy; run with --logs to inspect");

  const configPath = writeDesktopConfig(host, api, web);
  console.log(`
local stack is up

  web        http://${host}:${web}
  api        http://${host}:${api}
  health     http://${host}:${api}/health
  desktop    ${configPath} (restart the app to pick it up)
  cli        morechat setup self-host --server-url http://${host}:${api} --app-url http://${host}:${web}
  login      any email + verification code ${DEV_CODE} (development mode, no SMTP)
  shared     colleagues on the same network use the web URL above

stop with: node scripts/selfhost-local.mjs down
`);
}

function down() {
  compose(["down"], { stdio: "inherit" });
  console.log("==> stopped (data volumes kept)");
}

function status() {
  compose(["ps"], { stdio: "inherit" });
  const env = readEnv();
  const api = env.PORT || String(DEFAULTS.api);
  const web = env.FRONTEND_PORT || String(DEFAULTS.web);
  const host = (env.FRONTEND_ORIGIN ?? "").replace(/^https?:\/\//, "").replace(/:\d+$/, "") || "localhost";
  console.log(`
  web    http://${host}:${web}
  api    http://${host}:${api}/health
  login  code ${env.MULTICA_DEV_VERIFICATION_CODE || DEV_CODE} (APP_ENV=${env.APP_ENV || "production"})
  bind   ${env.BIND_HOST || "127.0.0.1"} (127.0.0.1 = this machine only, 0.0.0.0 = LAN)
`);
}

const command = process.argv[2] ?? "up";
if (command === "up") await up();
else if (command === "down") down();
else if (command === "status") status();
else {
  console.error("usage: node scripts/selfhost-local.mjs <up|down|status>");
  process.exit(2);
}

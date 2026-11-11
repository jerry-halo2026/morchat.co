#!/usr/bin/env node
// One entry point for this checkout's dev environment.
//
// The orchestration itself (ports, PID registry, health checks, profiles) lives
// in scripts/dev-env.sh and is deliberately not reimplemented here. This
// wrapper exists because the tools that script assumes are not where Windows
// looks for them: `bash` on PATH is WSL (the script is written for Git Bash),
// `go` is often not installed on PATH at all, and the checkout has no .env yet.
//
//   pnpm dev            full stack (api + web)
//   pnpm dev:api        api only        pnpm dev:web     web only
//   pnpm dev:daemon     daemon only     pnpm dev:desktop desktop only
//   pnpm dev:status     what is running pnpm dev:stop    stop it
//   pnpm db:migrate up|down             go run ./cmd/migrate
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const isWindows = process.platform === "win32";

function fail(message) {
  console.error(`dev: ${message}`);
  process.exit(1);
}

function probe(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? (result.stdout || "").trim() : null;
}

// Git Bash, not WSL: dev-env.sh has a MINGW branch and its own test suite, but
// the `bash` Windows puts on PATH is the WSL launcher, which cannot see the
// Windows docker, pnpm or go installations.
function resolveBash() {
  const candidates = [];
  if (process.env.BASH_BIN) candidates.push(process.env.BASH_BIN);
  if (isWindows) {
    candidates.push("C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe");
  }
  candidates.push("bash");

  for (const candidate of candidates) {
    if (candidate.includes("\\") && !existsSync(candidate)) continue;
    const uname = probe(candidate, ["-lc", "uname -s"]);
    if (!uname) continue;
    if (isWindows && !/MINGW|MSYS|CYGWIN/.test(uname)) continue;
    return candidate;
  }
  fail(
    isWindows
      ? "no Git Bash found (install Git for Windows, or set BASH_BIN to ...\\Git\\bin\\bash.exe)"
      : "no bash found on PATH",
  );
}

function resolveGo() {
  if (process.env.GO_BIN) return process.env.GO_BIN;
  if (probe("go", ["version"])) return "go";
  const candidates = [
    "E:\\CodexData\\morchat-r1-local\\tools\\go127\\go\\bin\\go.exe",
    "C:\\Program Files\\Go\\bin\\go.exe",
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Go", "bin", "go.exe"),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate) && probe(candidate, ["version"])) return candidate;
  }
  fail("no go found (install Go 1.26+, or set GO_BIN to the go executable)");
}

// The committed example points at 5432; the dev container listens elsewhere.
// Rather than make every fresh checkout fail on a connection refused, align the
// database URL with the container that is actually running and say so.
function ensureEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) {
    copyFileSync(join(ROOT, ".env.example"), envPath);
    console.log("dev: created .env from .env.example");
  }

  const port = probe("docker", ["port", "morchat-dev-pg", "5432/tcp"]);
  if (!port) return;
  const hostPort = port.split("\n")[0].split(":").pop();
  const user = probe("docker", ["exec", "morchat-dev-pg", "printenv", "POSTGRES_USER"]);
  const pass = probe("docker", ["exec", "morchat-dev-pg", "printenv", "POSTGRES_PASSWORD"]);
  const db = probe("docker", ["exec", "morchat-dev-pg", "printenv", "POSTGRES_DB"]);
  if (!hostPort || !user || !db) return;

  const text = readFileSync(envPath, "utf8");
  const wanted = `postgres://${user}:${pass ?? ""}@127.0.0.1:${hostPort}/${db}?sslmode=disable`;
  const current = /^DATABASE_URL=(.*)$/m.exec(text)?.[1];
  if (current === wanted) return;
  const next = text.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${wanted}`).replace(/^POSTGRES_PORT=.*$/m, `POSTGRES_PORT=${hostPort}`);
  writeFileSync(envPath, next);
  console.log(`dev: pointed .env DATABASE_URL at the running container (port ${hostPort})`);
}

// KEY=VALUE pairs from .env, so `db:migrate` and friends do not have to be run
// through a POSIX shell to see DATABASE_URL.
function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function execBash(bash, go, argv) {
  const goDir = go === "go" ? null : dirname(go);
  const child = spawn(bash, ["-lc", argv.map((part) => `'${part.replace(/'/g, `'\\''`)}'`).join(" ")], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(goDir ? { PATH: `${goDir}${isWindows ? ";" : ":"}${process.env.PATH ?? ""}` } : {}),
    },
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}

const [command = "up", ...rest] = process.argv.slice(2);
const bash = resolveBash();

if (command === "env") {
  console.log(JSON.stringify({ bash, go: resolveGo(), root: ROOT }, null, 2));
  process.exit(0);
}

if (command === "migrate") {
  const go = resolveGo();
  ensureEnv();
  const child = spawn(go, ["run", "./cmd/migrate", ...(rest.length ? rest : ["up"])], {
    cwd: join(ROOT, "server"),
    stdio: "inherit",
    env: { ...process.env, ...loadEnv() },
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else if (command === "server") {
  const go = resolveGo();
  ensureEnv();
  const child = spawn(go, ["run", "./cmd/server"], {
    cwd: join(ROOT, "server"),
    stdio: "inherit",
    env: { ...process.env, ...loadEnv() },
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  const components = { api: "api", web: "web", daemon: "daemon", desktop: "desktop" };
  const passthrough = components[command]
    ? ["up", "--components", components[command], ...rest]
    : [command === "dev" || command === "start" ? "up" : command === "stop" ? "down" : command, ...rest];
  if (!["up", "down", "status"].includes(passthrough[0])) {
    fail(`unknown command "${command}" (use up|down|status|api|web|daemon|desktop|migrate|env)`);
  }
  if (passthrough[0] === "up") ensureEnv();
  execBash(bash, resolveGo(), ["scripts/dev-env.sh", ...passthrough]);
}

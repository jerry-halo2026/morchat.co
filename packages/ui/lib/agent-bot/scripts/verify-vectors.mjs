#!/usr/bin/env node
/**
 * W2 vector verification — no vitest, no dependencies.
 *
 * Runs the REAL TypeScript modules (`appearance.ts`, `palettes.ts`, `bodies.ts`)
 * through Node 22's native type stripping, and compares them against the
 * Lead-frozen `testdata/cap-vectors.json` (read-only):
 *
 *   1. palettes/bodies mirror — 17 palettes (id, a, b, order) and 10 bodies
 *   2. all 25 `capFor` vectors — paletteId + bodyId
 *   3. `formatCap` / `parseCap` round-trip for every vector
 *   4. foreign/malformed values are declined
 *   5. `engine/motion-engine.js` SHA256 matches PROVENANCE (byte-copy guard)
 *
 * Usage:
 *   node packages/ui/lib/agent-bot/scripts/verify-vectors.mjs [--source <path>]
 *
 * Exit code 0 = every check PASS, 1 = at least one FAIL.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

const log = (...parts) => process.stdout.write(`${parts.join(" ")}\n`);

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = resolve(HERE, "..", "engine");
const ENGINE_FILE = join(ENGINE_DIR, "motion-engine.js");
const EXPECTED_ENGINE_SHA256 = "F722F8AC9A37EAEE67C41F517F1FF53CC47914E4A9D09088156ED605DF44925D";

/** `cap-v1` arithmetic — kept in the script as an independent oracle. */
function capForOracle(agentId, palettes, bodies) {
  let h = 0;
  let runeLen = 0;
  for (const ch of String(agentId)) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 17;
    runeLen += 1;
  }
  const h2 = (h * 31 + runeLen) % 10;
  return { paletteId: palettes[h].id, bodyId: bodies[h2] };
}

function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "testdata", "cap-vectors.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`testdata/cap-vectors.json not found above ${start}`);
    dir = parent;
  }
}

// Node ESM will not guess a `.ts` extension for extensionless relative imports,
// which is exactly how the product sources import each other. Map them here so
// the script exercises the shipped files instead of a re-implementation.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const failures = [];
let passes = 0;

function check(ok, label, detail) {
  if (ok) {
    passes += 1;
    log(`PASS  ${label}`);
  } else {
    failures.push(label);
    log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const repoRoot = findRepoRoot(HERE);
const vectorPath = join(repoRoot, "testdata", "cap-vectors.json");
const frozen = JSON.parse(readFileSync(vectorPath, "utf8"));

log(`repo      : ${repoRoot}`);
log(`vectors   : ${vectorPath}`);
log(`frozen    : schema=${frozen.schemaVersion} character=${frozen.characterVersion}`);
log("");

const { PALETTES, PALETTE_IDS } = await import(pathToFileURL(join(HERE, "..", "palettes.ts")).href);
const { BODY_IDS } = await import(pathToFileURL(join(HERE, "..", "bodies.ts")).href);
const { capFor, parseCap, formatCap, CAP_SCHEME } = await import(
  pathToFileURL(join(HERE, "..", "appearance.ts")).href
);

log("== 1. mirror check (palettes / bodies) ==");
check(PALETTES.length === 17, `palettes length = 17 (got ${PALETTES.length})`);
check(BODY_IDS.length === 10, `bodies length = 10 (got ${BODY_IDS.length})`);
for (let i = 0; i < frozen.palettes.length; i += 1) {
  const want = frozen.palettes[i];
  const got = PALETTES[i];
  const ok = got && got.id === want.id && got.a === want.a && got.b === want.b;
  check(ok, `palette[${i}] ${want.id}`, ok ? "" : `want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
}
check(PALETTE_IDS.length === frozen.palettes.length, `palette id list length ${PALETTE_IDS.length}`);
for (let i = 0; i < frozen.bodies.length; i += 1) {
  check(BODY_IDS[i] === frozen.bodies[i], `body[${i}] ${frozen.bodies[i]}`, `got ${BODY_IDS[i]}`);
}

log("");
log("== 2. capFor vs frozen vectors ==");
check(frozen.vectors.length === 25, `vector count = 25 (got ${frozen.vectors.length})`);
for (const vector of frozen.vectors) {
  const got = capFor(vector.agentId);
  const oracle = capForOracle(vector.agentId, frozen.palettes, frozen.bodies);
  const ok = got.paletteId === vector.paletteId && got.bodyId === vector.bodyId;
  const oracleOk = oracle.paletteId === vector.paletteId && oracle.bodyId === vector.bodyId;
  check(
    ok && oracleOk,
    `${vector.agentId} -> cap:${vector.bodyId}:${vector.paletteId}`,
    ok ? "" : `got cap:${got.bodyId}:${got.paletteId}`
  );
}

log("");
log("== 3. formatCap / parseCap round-trip ==");
for (const vector of frozen.vectors) {
  const value = formatCap({ bodyId: vector.bodyId, paletteId: vector.paletteId });
  const parsed = parseCap(value);
  const ok =
    value === `${CAP_SCHEME}${vector.bodyId}:${vector.paletteId}` &&
    parsed !== null &&
    parsed.paletteId === vector.paletteId &&
    parsed.bodyId === vector.bodyId;
  check(ok, `${value} round-trips`, ok ? "" : `parsed ${JSON.stringify(parsed)}`);
}

log("");
log("== 4. foreign / malformed values are declined ==");
const declined = [
  null,
  undefined,
  "",
  "emoji:🐼",
  "https://cdn.example/a.png",
  "/uploads/agent/a.png",
  "cap:",
  "cap:blob",
  "cap:blob:rose:extra",
  "cap:not-a-body:rose",
  "cap:blob:not-a-palette",
  "CAP:blob:rose",
];
for (const value of declined) {
  const parsed = parseCap(value);
  check(parsed === null, `parseCap(${JSON.stringify(value ?? null)}) === null`, `got ${JSON.stringify(parsed)}`);
}
check(
  JSON.stringify(parseCap("  cap:heart:coral  ")) === JSON.stringify({ paletteId: "coral", bodyId: "heart" }),
  "parseCap trims surrounding whitespace"
);

log("");
log("== 5. engine byte-copy guard ==");
if (existsSync(ENGINE_FILE)) {
  const engineSha = createHash("sha256").update(readFileSync(ENGINE_FILE)).digest("hex").toUpperCase();
  check(engineSha === EXPECTED_ENGINE_SHA256, `engine SHA256 = ${EXPECTED_ENGINE_SHA256}`, `got ${engineSha}`);
  const sourceArgIndex = process.argv.indexOf("--source");
  if (sourceArgIndex !== -1 && process.argv[sourceArgIndex + 1]) {
    const sourcePath = resolve(process.argv[sourceArgIndex + 1]);
    const sourceSha = createHash("sha256").update(readFileSync(sourcePath)).digest("hex").toUpperCase();
    check(sourceSha === engineSha, `upstream ${sourcePath} SHA256 matches copy`, `source ${sourceSha}`);
  }
} else {
  check(false, "engine/motion-engine.js exists", `missing ${ENGINE_FILE}`);
}

log("");
log(`TOTAL ${passes} PASS / ${failures.length} FAIL`);
if (failures.length > 0) {
  log("FAILED:");
  for (const failure of failures) log(`  - ${failure}`);
  process.exitCode = 1;
} else {
  log("RESULT: PASS — wiring matches testdata/cap-vectors.json (cap-v1)");
}

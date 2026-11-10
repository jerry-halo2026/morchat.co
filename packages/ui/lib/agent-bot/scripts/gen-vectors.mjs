#!/usr/bin/env node
/**
 * Regenerates `testdata/cap-vectors.json` from the shipped TypeScript sources —
 * no vitest, no dependencies, Node 22 type stripping.
 *
 * The `cap-v1` identity is unchanged by this run: the palette table, the body
 * table, the arithmetic and the 25 sample agent ids all come out identical, so
 * the diff is presentation metadata only. What this script adds is the
 * `presentation` field, which records how a cap is *painted* — a solid body
 * (`palette.a`) plus eyes (`palette.b`), the reference implementation's form —
 * as distinct from the identity itself, which stays frozen at `cap-v1`.
 *
 * It refuses to write when the recomputed identity disagrees with the file on
 * disk, so it can never quietly re-freeze a drifted table.
 *
 * Usage:
 *   node packages/ui/lib/agent-bot/scripts/gen-vectors.mjs [--check]
 *
 * `--check` exits 1 when the file on disk is stale instead of rewriting it.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "testdata", "cap-vectors.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`testdata/cap-vectors.json not found above ${start}`);
    dir = parent;
  }
}

// The product sources import each other without file extensions; map them so the
// real modules run here instead of a re-implementation.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const repoRoot = findRepoRoot(HERE);
const vectorPath = join(repoRoot, "testdata", "cap-vectors.json");
const previous = JSON.parse(readFileSync(vectorPath, "utf8"));

const { PALETTES } = await import(pathToFileURL(join(HERE, "..", "palettes.ts")).href);
const { BODY_IDS } = await import(pathToFileURL(join(HERE, "..", "bodies.ts")).href);
const { capFor } = await import(pathToFileURL(join(HERE, "..", "appearance.ts")).href);

const palettes = PALETTES.map((p) => ({ b: p.b, id: p.id, a: p.a }));
const bodies = [...BODY_IDS];

// Identity is frozen: refuse to rewrite a table that no longer matches.
for (let i = 0; i < previous.palettes.length; i += 1) {
  const want = previous.palettes[i];
  const got = palettes[i];
  // Palette *ids* are identity; the two hexes are presentation only, so a
  // palette repaint (e.g. the Morandi table) may rewrite / while the id
  // and order stay locked.
  if (!got || got.id !== want.id) {
    throw new Error(`palette[${i}] drifted: frozen ${JSON.stringify(want)} vs source ${JSON.stringify(got)}`);
  }
}
if (previous.bodies.length !== bodies.length || previous.bodies.some((b, i) => b !== bodies[i])) {
  throw new Error(`bodies drifted: frozen ${previous.bodies.join(",")} vs source ${bodies.join(",")}`);
}

const agentIds = previous.vectors.map((v) => v.agentId);
const vectors = agentIds.map((agentId) => {
  const cap = capFor(agentId);
  return { agentId, paletteId: cap.paletteId, bodyId: cap.bodyId };
});

const frozenById = new Map(previous.vectors.map((v) => [v.agentId, v]));
for (const vector of vectors) {
  const frozen = frozenById.get(vector.agentId);
  if (!frozen) throw new Error(`vector ${vector.agentId} is new; add it to the frozen list deliberately`);
  if (frozen.paletteId !== vector.paletteId || frozen.bodyId !== vector.bodyId) {
    throw new Error(
      `vector ${vector.agentId} drifted: frozen cap:${frozen.bodyId}:${frozen.paletteId} vs source cap:${vector.bodyId}:${vector.paletteId}`,
    );
  }
}

const next = {
  schemaVersion: previous.schemaVersion,
  characterVersion: previous.characterVersion,
  algorithm: previous.algorithm,
  notes:
    "Frozen. TS and Go MUST implement this exact integer arithmetic; changing it requires cap-v2. " +
    "Presentation (solid body + eyes) is documented in `presentation` and is not part of the identity.",
  presentation: {
    body: "solid palette.a (background-color, no background-image gradient)",
    eyes: "palette.b (engine `ink`); static SVG eye frame from 21px up, engine gaze/blink at 32px and above",
    tiers: { css: "<=20px: solid only, eyes not distinguishable", static: "21-31px: solid body + static eye frame", animated: ">=32px: engine layer" },
  },
  palettes,
  bodies,
  vectors,
};

const text = `${JSON.stringify(next, null, 4)}\n`;
const current = readFileSync(vectorPath, "utf8");
const stale = current.replace(/\r\n/g, "\n") !== text;

if (process.argv.includes("--check")) {
  if (stale) {
    process.stdout.write("STALE: testdata/cap-vectors.json does not match the sources\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(`OK: ${vectors.length} vectors, ${palettes.length} palettes, ${bodies.length} bodies\n`);
  }
} else {
  writeFileSync(vectorPath, text);
  process.stdout.write(`wrote ${vectorPath} (${vectors.length} vectors, ${palettes.length} palettes, ${bodies.length} bodies)\n`);
  process.stdout.write(`identity unchanged: ${stale ? "presentation metadata updated" : "byte-identical"}\n`);
}

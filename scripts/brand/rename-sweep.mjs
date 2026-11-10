#!/usr/bin/env node
/**
 * Re-run the morechat rename layer on top of an arbitrary base (here: upstream v0.8.2).
 *
 * The rename commit on our branch (55eb2de) was a whole-tree substitution made
 * against the 0.8.1 base. Replaying that patch on top of a newer upstream is
 * pointless -- the same identity layer can be *regenerated* instead, because the
 * transform is an idempotent function of the file content.
 *
 * Rules, longest match first:
 *   github.com/multica-ai/multica/server -> github.com/jerry-halo2026/morchat.co/server
 *   github.com/multica-ai/multica        -> github.com/jerry-halo2026/morchat.co
 *   multica-ai/multica                   -> jerry-halo2026/morchat.co
 *   @multica/                            -> @morechat/
 *   brand module identifiers / paths     -> morechat equivalents
 *   Multica glued to an identifier char  -> Morechat (symbols stay PascalCase)
 *   Multica (user-visible copy)          -> morechat.co   (outside the gate allowlist)
 *   multica.ai                           -> morechat.co   (outside the gate allowlist)
 *
 * Frozen on purpose (runtime contracts, not product copy): MULTICA_* env vars,
 * the `multica` CLI verb, ~/.multica, the multica:// scheme, multica.plugin.json
 * and X-Multica-Plugin-Installation. None of them match the patterns above.
 *
 * This file is skipped: it has to spell the source tokens out to do its job.
 *
 * Usage: node scripts/brand/rename-sweep.mjs [--dry]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";

const DRY = process.argv.includes("--dry");

const SKIP_PREFIXES = [
  "docs/", // provenance record: the upstream base is *called* Multica there
  "experiments/",
  "testdata/",
  ".git/",
];
const SKIP_FILES = new Set(["pnpm-lock.yaml", "scripts/brand/rename-sweep.mjs"]);
const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".ico",
  ".icns",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".zip",
  ".bundle",
  ".mp4",
  ".mov",
  ".wasm",
]);

/** Paths the brand-string gate allowlists; product copy is not rewritten there. */
const BRAND_ALLOWLIST = [
  "docs/",
  "experiments/",
  "testdata/",
  "server/",
  "examples/plugins/",
  ".github/",
  "deploy/",
  "docker-compose",
  ".goreleaser.yml",
  "scripts/check-brand-strings.mjs",
];

/** Identity-layer rewrites: safe everywhere (they are import/module specifiers). */
const IDENTITY = [
  [
    "github.com/multica-ai/multica/server",
    "github.com/jerry-halo2026/morchat.co/server",
  ],
  ["github.com/multica-ai/multica", "github.com/jerry-halo2026/morchat.co"],
  ["multica-ai/multica", "jerry-halo2026/morchat.co"],
  ["@multica/", "@morechat/"],
];

/**
 * Brand-layer rewrites. Identifiers first so that the generic `Multica` rule
 * cannot shred `MulticaIcon` into `morechat.coIcon`.
 */
const BRAND = [
  ["MulticaIconMode", "MorechatIconMode"],
  ["MulticaIcon", "MorechatIcon"],
  ["MulticaWordmark", "MorechatWordmark"],
  ["MulticaStarRow", "MorechatArcade"],
  ["MulticaBleedMark", "MorechatBleedMark"],
  ["/multica-icon", "/morechat-icon"],
  ["/multica-wordmark", "/morechat-wordmark"],
  ["/multica-graphics", "/morechat-graphics"],
  ["/multica-brand", "/morechat-brand"],
  // Any other `Multica` glued to an identifier character is a symbol, a type or
  // a class name, not visible copy: keep it PascalCase instead of splicing a
  // domain into it. The first pattern also repairs trees swept before the rule
  // existed (`morechat.coPluginError` -> `MorechatPluginError`).
  [/morechat\.co(?=[A-Za-z0-9_])/g, "Morechat"],
  [/Multica(?=[A-Za-z0-9_])/g, "Morechat"],
  ["Multica", "morechat.co"],
  ["multica.ai", "morechat.co"],
];

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

let touched = 0;
for (const rel of tracked) {
  if (SKIP_FILES.has(rel)) continue;
  if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) continue;
  if (BINARY_EXT.has(extname(rel).toLowerCase())) continue;

  let source;
  try {
    source = readFileSync(rel, "utf8");
  } catch {
    continue;
  }
  if (source.includes("\u0000")) continue; // binary pretending to be text

  let next = source;
  for (const [from, to] of IDENTITY) next = next.split(from).join(to);
  if (!BRAND_ALLOWLIST.some((p) => rel === p || rel.startsWith(p))) {
    for (const [from, to] of BRAND) {
      next = typeof from === "string" ? next.split(from).join(to) : next.replace(from, to);
    }
  }
  if (next === source) continue;
  touched += 1;
  if (!DRY) writeFileSync(rel, next);
}

console.log(`${DRY ? "would touch" : "touched"} ${touched} of ${tracked.length} tracked files`);

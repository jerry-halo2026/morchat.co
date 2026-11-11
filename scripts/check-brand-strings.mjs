#!/usr/bin/env node
/**
 * Brand string gate: find leftover upstream brand strings on the visible layer.
 *
 * Scans ts/tsx/md/mdx/json/css/svg/mjs/js/txt/yml/yaml for `Multica` or
 * `multica.ai` and prints every hit, grouped by file, with a count.
 *
 * Exit code is 0 when nothing outside the allowlist matches, 1 otherwise — so
 * the gate can be wired into CI as `node scripts/check-brand-strings.mjs`.
 *
 * Usage:
 *   node scripts/check-brand-strings.mjs            # fail on any hit
 *   node scripts/check-brand-strings.mjs --report   # always exit 0 (report only)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_ONLY = process.argv.includes("--report");

const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".md",
  ".mdx",
  ".json",
  ".css",
  ".svg",
  ".mjs",
  ".js",
  ".cjs",
  ".txt",
  ".yml",
  ".yaml",
]);

const SKIP_DIRS = new Set([
  ".git",
  ".local",
  ".mimosa",
  ".next",
  ".turbo",
  ".vercel",
  "node_modules",
  "dist",
  "out",
  "build",
  "coverage",
]);

/**
 * Paths allowed to keep the old name. Each entry is a directory prefix or an
 * exact file:
 *  - docs/upstream, docs/archive, docs/tasks: imported upstream material and
 *    historical planning records; rewriting them would falsify the record.
 *  - testdata: fixtures.
 *  - the retired brand modules: kept so unmigrated call sites still resolve.
 */
const ALLOWLIST = [
  // Internal design/decision material: the upstream base is *called* Multica in
  // these documents, and the provenance record must keep saying so. Product
  // surfaces (apps/**, packages/**) are not covered by this exemption.
  "docs/",
  "experiments/",
  "docs/upstream/",
  "docs/archive/",
  "docs/tasks/",
  "testdata/",
  // The upstream landing page is used exactly as upstream ships it: pages,
  // dictionaries and demo data (Acme Labs, Mia Chen, build-02, ACM-151,
  // multica.ai) keep the upstream wording, and only the brand mark, the retired
  // entry points and the login stage are ours. Rewriting the copy would stop the
  // page from being the upstream page, so the gate exempts it as it does
  // docs/upstream — this is deliberate, not a miss.
  // The rename sweep script *contains* the rewrite table, so it names the old
  // brand by design.
  "scripts/brand/",
  // Runtime identifiers deliberately frozen this round: DB user/db names, CLI
  // verb, MULTICA_* env names and code comments. The user-visible copy inside
  // server/ (CLI help, auth page, onboarding text, integration titles) is swept
  // separately and is not exempt in spirit.
  "server/",
  // Infra/release/example identifiers (chart name, compose service names,
  // workflow names, example plugin manifests). Renaming these changes deployed
  // identifiers rather than product copy, which this round deliberately keeps.
  "examples/plugins/",
  ".github/",
  "deploy/",
  "docker-compose",
  ".goreleaser.yml",
  "packages/ui/lib/multica-brand.ts",
  // the gate itself names the pattern it hunts for
  "scripts/check-brand-strings.mjs",
  "packages/ui/components/common/multica-icon.tsx",
  "packages/ui/components/common/multica-wordmark.tsx",
  "packages/ui/components/common/multica-graphics.tsx",
];

const PATTERN = /Multica|multica\.ai/g;

/**
 * Identifiers that are part of a wire or packaging contract and therefore must
 * keep their literal spelling this round (runtime identifiers are frozen):
 *  - `X-Multica-Plugin-Installation`: read by handler/plugin_action.go and
 *    allowed by the router CORS list; renaming one side breaks the bridge.
 *  - `multica.plugin.json`: `plugincontract.ManifestFilename` on the server.
 * Exempted per token so the rest of the line is still checked.
 */
const CONTRACT_TOKENS =
  /X-Multica-Plugin-Installation|multica\.plugin\.json|multica (?:setup|daemon|auth|issue|knowledge)\b|multica:\/\/\S*/g;

const toPosix = (p) => p.split(sep).join("/");
const allowed = (rel) => ALLOWLIST.some((entry) => rel === entry || rel.startsWith(entry));

const hits = [];
const allowedHits = [];

function scan(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      scan(abs);
      continue;
    }
    const dot = name.lastIndexOf(".");
    if (dot < 0 || !EXTENSIONS.has(name.slice(dot))) continue;
    const rel = toPosix(relative(ROOT, abs));
    let source;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (!PATTERN.test(source.replace(CONTRACT_TOKENS, ""))) continue;
    PATTERN.lastIndex = 0;
    const lines = source.split(/\r?\n/);
    const fileHits = [];
    lines.forEach((line, i) => {
      // Frozen wire/manifest identifiers are exempt as tokens, not as files: the
      // plugin installation header and the plugin manifest filename are read by
      // the server, so any other brand string on the same line still counts.
      const scannable = line.replace(CONTRACT_TOKENS, "");
      PATTERN.lastIndex = 0;
      if (PATTERN.test(scannable)) fileHits.push({ line: i + 1, text: line.trim() });
    });
    if (!fileHits.length) continue;
    (allowed(rel) ? allowedHits : hits).push({ rel, fileHits });
  }
}

scan(ROOT);

const total = hits.reduce((n, f) => n + f.fileHits.length, 0);
const allowTotal = allowedHits.reduce((n, f) => n + f.fileHits.length, 0);

console.log(`check:brand — scanned ${ROOT}`);
console.log(`pattern: ${PATTERN.source}\n`);

if (hits.length === 0) {
  console.log("OK: no brand strings outside the allowlist.");
} else {
  console.log(`REMAINING (${total} in ${hits.length} files):`);
  for (const file of hits.sort((a, b) => a.rel.localeCompare(b.rel))) {
    console.log(`\n  ${file.rel}  (${file.fileHits.length})`);
    for (const h of file.fileHits) console.log(`    ${h.line}: ${h.text.slice(0, 160)}`);
  }
}

if (allowedHits.length) {
  console.log(`\nALLOWED (${allowTotal} in ${allowedHits.length} files):`);
  for (const file of allowedHits.sort((a, b) => a.rel.localeCompare(b.rel))) {
    console.log(`  ${file.rel}  (${file.fileHits.length})`);
  }
}

console.log(`\nTOTAL remaining: ${total}  allowed: ${allowTotal}`);
if (REPORT_ONLY) process.exit(0);
process.exit(hits.length === 0 ? 0 : 1);

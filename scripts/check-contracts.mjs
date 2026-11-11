#!/usr/bin/env node
// Guards the "one capability, one entrance" rules in docs/engineering/CONTRACTS.md.
//
// Report mode by default; --strict turns findings into a failure. The checks are
// deliberately structural: they catch a second route for the same resource, a
// second dev entry point, and a missing knowledge entrance, without pretending to
// be a full architecture linter.
//
//   node scripts/check-contracts.mjs [--strict]
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const strict = process.argv.includes("--strict");
const findings = [];

function read(relative) {
  const path = join(ROOT, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

// 1. No two handlers for the same METHOD + path in the router.
//
// chi nests routes (`r.Route("/api/knowledge", func(r chi.Router){ r.Post("/import", …) })`),
// so relative paths repeat inside different groups by design. Only absolute
// `/api/...` registrations are comparable across the file.
const router = read("server/cmd/server/router.go");
const seen = new Map();
for (const match of router.matchAll(/\br\.(Get|Post|Put|Patch|Delete)\("(\/api\/[^"]+)"/g)) {
  const key = `${match[1].toUpperCase()} ${match[2]}`;
  seen.set(key, (seen.get(key) ?? 0) + 1);
}
for (const [key, count] of seen) {
  if (count > 1) findings.push(`duplicate route: ${key} registered ${count} times`);
}

// 2. The knowledge surface exists exactly once per protocol: REST under
//    /api/knowledge (nested, so counted by prefix) and MCP under /api/mcp.
const restKnowledge = [...router.matchAll(/\br\.(?:Get|Post|Put|Patch|Delete)\("([^"]+)"/g)]
  .map((match) => match[1])
  .filter((path) => path.startsWith("/api/knowledge") || /^\/(spaces|items|pages|search|import|upload-url|retrieval-test|tools)\b/.test(path));
if (restKnowledge.length === 0) findings.push("no REST knowledge routes registered");
const mcp = [...seen.keys()].filter((key) => key.includes("/api/mcp/"));
if (mcp.length > 1) findings.push(`more than one MCP endpoint: ${mcp.join(", ")}`);

// 3. One dev entry point: every dev* script in the root manifest must go through
//    scripts/dev.mjs, and nothing may shell out to bash directly.
const manifest = JSON.parse(read("package.json") || "{}");
for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
  if (!/^dev(:|$)|^db:/.test(name)) continue;
  if (name === "dev:docs" || name === "dev:mobile" || name.startsWith("dev:mobile") || name.startsWith("ios:")) continue;
  if (!command.includes("scripts/dev.mjs") && !command.startsWith("turbo ")) {
    findings.push(`entry point ${name} does not use scripts/dev.mjs: ${command}`);
  }
  if (/\bsh -c\b/.test(command)) findings.push(`entry point ${name} depends on a POSIX shell: ${command}`);
}

// 4. The web dev script must not require a shell either.
const webManifest = JSON.parse(read("apps/web/package.json") || "{}");
if (/\bsh -c\b/.test(webManifest.scripts?.dev ?? "")) {
  findings.push(`apps/web dev uses sh -c: ${webManifest.scripts.dev}`);
}

console.log(`contracts: routes=${seen.size} knowledgeREST=${restKnowledge.length} mcp=${mcp.length} findings=${findings.length}`);
for (const finding of findings) console.error(`  ✗ ${finding}`);

if (strict && findings.length) process.exit(1);

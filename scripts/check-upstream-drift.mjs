#!/usr/bin/env node
// Reports how far this branch has drifted from an upstream release, and which
// of those differences fall outside the seams we declared in
// docs/upstream/SEAMS.md.
//
// Report mode is the default: the drift we already carry is a known, large
// number (the brand rename alone touches every package). Use --strict in CI once
// the allowlist has been narrowed, so a new unlisted difference fails the build.
//
//   node scripts/check-upstream-drift.mjs                 # report against v0.8.2
//   node scripts/check-upstream-drift.mjs --base v0.8.2 --strict
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const strict = argv.includes("--strict");
const base = (() => {
  const index = argv.indexOf("--base");
  return index >= 0 ? argv[index + 1] : "v0.8.2";
})();

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

// SEAMS.md lists one path prefix per line, as a markdown bullet with a trailing
// slash, e.g. "- packages/views/knowledge/". Everything else is drift we did not
// declare, which is exactly what this gate is for.
function readSeams() {
  const file = join(ROOT, "docs", "upstream", "SEAMS.md");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => /^\s*[-*]\s+`?([^`\s]+?)`?\s*$/.exec(line)?.[1])
    .filter((entry) => entry && entry.includes("/"));
}

let status;
try {
  status = git(["diff", "--name-status", `${base}...HEAD`]);
} catch {
  console.error(`drift: cannot diff against ${base}; fetch the tag first (git fetch upstream --tags)`);
  process.exit(2);
}

const rows = status
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [flag, ...paths] = line.split("\t");
    return { flag: flag[0], path: paths[paths.length - 1] };
  });

const seams = readSeams();
const inside = [];
const outside = [];
for (const row of rows) {
  (seams.some((prefix) => row.path.startsWith(prefix)) ? inside : outside).push(row);
}

const byFlag = (list, flag) => list.filter((row) => row.flag === flag).length;
console.log(`drift: base=${base} changed=${rows.length} (A ${byFlag(rows, "A")} / M ${byFlag(rows, "M")} / D ${byFlag(rows, "D")})`);
console.log(`drift: inside seams=${inside.length} seams-declared=${seams.length}`);

if (outside.length) {
  const groups = new Map();
  for (const row of outside) {
    const top = row.path.split("/").slice(0, 2).join("/");
    groups.set(top, (groups.get(top) ?? 0) + 1);
  }
  const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(`drift: outside seams=${outside.length} (top areas: ${top.map(([area, count]) => `${area}=${count}`).join(", ")})`);
}

if (strict && outside.length) {
  console.error("drift: unlisted differences found; add them to docs/upstream/SEAMS.md or revert them");
  for (const row of outside.slice(0, 40)) console.error(`  ${row.flag}\t${row.path}`);
  process.exit(1);
}

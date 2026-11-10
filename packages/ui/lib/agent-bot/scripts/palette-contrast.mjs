#!/usr/bin/env node
/**
 * WCAG contrast audit for the 17-palette Bauhaus board.
 *
 * Each palette is one pair: `a` = body fill (pure colour), `b` = eye ink. The
 * eyes are an 18–20% dot inside the body, so the pair has to clear 3:1 (WCAG AA
 * for non-text / large-scale graphics) or the face reads as a blank disc.
 *
 * Run: node packages/ui/lib/agent-bot/scripts/palette-contrast.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../palettes.ts"), "utf8");

/** Pull `{ id: "…", a: "#…", b: "#…" }` rows out of the source of truth. */
function readPalettes() {
  const rows = [];
  const re = /\{\s*id:\s*"([a-z-]+)",\s*a:\s*"(#[0-9A-Fa-f]{6})",\s*b:\s*"(#[0-9A-Fa-f]{6})"\s*\}/g;
  let match;
  while ((match = re.exec(source))) {
    rows.push({ id: match[1], a: match[2], b: match[3] });
  }
  return rows;
}

/** sRGB channel (0–255) → linear light. */
function linear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of `#RRGGBB`. */
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two `#RRGGBB` colours. */
function contrast(x, y) {
  const lx = luminance(x);
  const ly = luminance(y);
  const hi = Math.max(lx, ly);
  const lo = Math.min(lx, ly);
  return (hi + 0.05) / (lo + 0.05);
}

const MIN = 3;
const palettes = readPalettes();
let failures = 0;

console.log(`palette contrast (body a vs eye b, WCAG AA graphics >= ${MIN}:1)`);
for (const [index, palette] of palettes.entries()) {
  const ratio = contrast(palette.a, palette.b);
  const ok = ratio >= MIN;
  if (!ok) failures += 1;
  console.log(
    `${String(index + 1).padStart(2)} ${palette.id.padEnd(10)} ${palette.a} / ${palette.b}  ${ratio.toFixed(2)}:1  ${ok ? "PASS" : "FAIL"}`,
  );
}

console.log(`\n${palettes.length - failures}/${palettes.length} pairs >= ${MIN}:1`);
if (palettes.length !== 17) {
  console.error(`expected 17 palettes, found ${palettes.length}`);
  process.exit(1);
}
process.exit(failures === 0 ? 0 : 1);

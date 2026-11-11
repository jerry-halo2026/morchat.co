// Renders docs/brand/reference/avatar-aora/index.html and avatar-slots.png from
// the live static avatar route, so the reference is the route's own output.
//
//   node .cache/gen-aora-reference.mjs [baseUrl]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = resolve(repo, "docs/brand/reference/avatar-aora");
const base = process.argv[2] ?? "http://localhost:3001";

const SHAPES = [
  ["blob", "blue"],
  ["pebble", "green"],
  ["mochi", "pink"],
  ["tofu", "violet"],
  ["onigiri", "red"],
  ["hex", "cyan"],
  ["cloud", "yellow"],
  ["drop", "orange"],
];
const SLOTS = [
  [20, "list 20"],
  [24, "comment 24"],
  [40, "detail 40"],
  [56, "hero 56"],
];
const ENTITIES = [
  "fbb43d67-c039-42ff-b77a-761b01bccc37",
  "7f52a0c1-4f7e-4a1f-8c2d-2f4f4d1f8a10",
  "0f1c6b52-58a7-4b9e-9d02-4c7a45e0d3f1",
  "agent-0001",
];

const spec = ([shape, color]) => `aora::${shape}:${color}:capsule:vector:1a2b`;
const cell = (shape, color, px) =>
  `<figure><img src="${base}/avatar/${spec([shape, color])}?size=${px}" width="${px}" height="${px}" alt="${shape} ${color}" /><figcaption>${shape}</figcaption></figure>`;

const rows = SHAPES.map(
  ([shape, color]) =>
    `<tr><th>${shape} · ${color}</th>${SLOTS.map(([px]) => `<td>${cell(shape, color, px)}</td>`).join("")}</tr>`,
).join("\n");

const derived = ENTITIES.map(
  (id) =>
    `<figure><img src="${base}/avatar/${id}?derive=1&size=40" width="40" height="40" alt="derived ${id}" /><figcaption>${id.slice(0, 8)}</figcaption></figure>`,
).join("\n");

const html = `<!doctype html>
<meta charset="utf-8" />
<title>Aora avatars �?slots and shapes</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 32px 40px; font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; color: #1b1b1b; background: #fbfaf8; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 24px; color: #5c5c5c; }
  table { border-collapse: collapse; margin-bottom: 28px; }
  th { text-align: left; font-weight: 500; padding: 8px 16px 8px 0; color: #5c5c5c; white-space: nowrap; }
  td { padding: 8px 24px 8px 0; }
  figure { margin: 0; display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
  figcaption { font-size: 11px; color: #8a8a8a; }
  img { display: block; border-radius: 9999px; }
  h2 { font-size: 14px; margin: 0 0 12px; }
  .row { display: flex; gap: 20px; }
  code { font-size: 12px; color: #5c5c5c; }
</style>
<h1>头像槽位与形�?/h1>
<p><code>avatar_url = aora:&lt;character&gt;:&lt;shape&gt;:&lt;color&gt;:&lt;face&gt;:&lt;style&gt;:&lt;seed&gt;</code> �?静�?SVG �?<code>GET /avatar/&lt;spec&gt;</code> 渲染�?code>Cache-Control: immutable</code>�?/p>
<table>
  <tr><th></th>${SLOTS.map(([, label]) => `<th>${label}</th>`).join("")}</tr>
  ${rows}
</table>
<h2>派生（无 avatar_url 或历�?cap: 值）</h2>
<div class="row">
${derived}
</div>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "index.html"), html);

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 760, height: 640 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "networkidle" });
const loaded = await page.evaluate(
  () => [...document.images].every((img) => img.complete && img.naturalWidth > 0),
);
await page.screenshot({ path: resolve(outDir, "avatar-slots.png"), fullPage: true });
await browser.close();

console.log(`images loaded: ${loaded}`);
console.log(`wrote ${resolve(outDir, "index.html")}`);
console.log(`wrote ${resolve(outDir, "avatar-slots.png")}`);

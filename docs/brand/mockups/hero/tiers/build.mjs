// 头像档位对照图 —— 包豪斯 17 色板 × 上游槽位尺寸（20 / 24 / 40 / 56）
//
// 尺寸口径是**上游槽位**，不是产品统一钳制：
//   - 20px 列表行 → CSS 层（纯色本体，无眼）
//   - 24px 评论作者 → 静态瞳片（同一本体 + 一层 SVG 眼睛）
//   - 40px 详情页头 / 56px 主视觉 → 引擎真身（`capEngineProps` + `clock.createEngineClock`，Chrome 里跑 rAF）
//
// 每一格都按**产品真实渲染**出图，不手抄像素：20/24 用 `capStaticStyle` /
// `capEyeFrame` 的返回值生成 DOM，40/56 直接挂 `engine/motion-engine.js` 的
// `GrokBot`。渲染走 9222 端口的 CDP，DPR 4 截图 → docs/brand/avatar-tiers.png。
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../../..");
const agentBotDir = path.join(repo, "packages/ui/lib/agent-bot");

// 产品源码是无扩展名的相对 import；Node 需要显式映射到 .ts。
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { capEngineProps, capEyeFrame, capSeed, capStaticStyle, selectCapTier } = await import(
  pathToFileURL(path.join(agentBotDir, "caps.ts")).href
);
const { AVATAR_SLOT_PX } = await import(
  pathToFileURL(path.join(agentBotDir, "../avatar-size.ts")).href
);
const { PALETTES } = await import(pathToFileURL(path.join(agentBotDir, "palettes.ts")).href);

/** 上游槽位：列表 20 / 评论 24 / 详情 40 / 主视觉 56。 */
const SIZE_COLUMNS = [
  { px: AVATAR_SLOT_PX.list, slot: "列表", hint: "列表行" },
  { px: AVATAR_SLOT_PX.comment, slot: "评论", hint: "评论作者" },
  { px: AVATAR_SLOT_PX.detail, slot: "详情", hint: "详情页头" },
  { px: AVATAR_SLOT_PX.hero, slot: "主视觉", hint: "单实例" },
];
const ROWS = ["amber", "deep-tide", "ember"].map((id) => PALETTES.find((p) => p.id === id));
const SHAPE = "blob";
const AGENT_ID = "mika"; // 线上内置橙子的 agent id（cap:blob:amber）

const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
/** CSSProperties → CSS 文本：数字的 width/height 补 px，undefined 直接跳过。 */
const cssText = (style) =>
  Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      const name = kebab(key);
      const sized = (name === "width" || name === "height") && typeof value === "number";
      return `${name}:${sized ? `${value}px` : value}`;
    })
    .join(";");

// 每一列画哪一层，由 `selectCapTier(px, true)` 决定：20 → CSS 纯色本体，
// 24 → 静态瞳片，40 / 56 → 引擎真身（详情页头、主视觉这类单实例展示位才会
// 开动画，列表行保持静态帧）。
for (const column of SIZE_COLUMNS) {
  column.tier = selectCapTier(column.px, true);
}

const engineSpecs = [];

/** 一格里到底画什么，由 `selectCapTier` 决定，而不是由这张图自己猜。 */
function cell(palette, column) {
  const cap = { paletteId: palette.id, bodyId: SHAPE };
  const tier = selectCapTier(column.px, true);
  const attrs = `data-slot="cap-avatar" data-tier="${tier}" data-shape="${SHAPE}" data-size="${column.px}" data-palette="${palette.id}"`;

  if (tier === "animated") {
    engineSpecs.push({
      palette: palette.id,
      size: column.px,
      shape: SHAPE,
      props: capEngineProps(cap, column.px, AGENT_ID),
      seed: capSeed(AGENT_ID),
    });
    return `<div class="cell"><div class="cap" ${attrs} data-engine></div></div>`;
  }

  const body = `<span class="cap-body" aria-hidden="true" style="${cssText(capStaticStyle(cap, column.px))}"></span>`;
  const frame = capEyeFrame(cap, column.px);
  const eyes = frame
    ? `<svg class="cap-eyes" aria-hidden="true" viewBox="${frame.viewBox}">${frame.eyes
        .map((eye) => `<circle cx="${eye.cx}" cy="${eye.cy}" r="${eye.r}" fill="${frame.fill}" />`)
        .join("")}</svg>`
    : "";
  return `<div class="cell"><div class="cap cap-static" ${attrs}>${body}${eyes}</div></div>`;
}

const row = (palette) => `
  <div class="row">
    <div class="row-head">
      <span class="swatch" style="background-color:${palette.a}"></span>
      <span class="row-name">${palette.id}</span>
      <span class="row-hex">${palette.a} / ${palette.b}</span>
    </div>
    ${SIZE_COLUMNS.map((column) => cell(palette, column)).join("")}
  </div>`;

const HEADER = SIZE_COLUMNS.map(
  (column) =>
    `<div class="col-head"><span class="px">${column.px}</span><span class="px-unit">px</span><span class="px-tag">${column.slot}</span></div>`,
).join("");

const panel = `
<div class="panel">
  <div class="title-row">
    <div class="title">包豪斯色板 · 上游槽位尺寸</div>
    <div class="subtitle">列表 20 / 评论 24 / 详情 40 / 主视觉 56 —— 按调用方给的槽位渲染，不做统一钳制</div>
  </div>
  <div class="grid">
    <div class="row-head-spacer"></div>
    ${HEADER}
    ${ROWS.map(row).join("")}
  </div>
  <div class="foot">
    <span class="foot-key">amber</span> 橙子（cap:blob:amber）·
    <span class="foot-key">deep-tide</span> / <span class="foot-key">ember</span> 另外两个色板 ·
    本体 = <code>palette.a</code> 纯色，眼睛 = <code>palette.b</code>，每对对比 ≥ 3:1<br>
    三档分层：<span class="foot-key">≤20 无眼</span>（纯色本体，列表行）·
    <span class="foot-key">21–31 静态瞳片</span>（同一本体 + 一层 SVG 眼睛，评论作者）·
    <span class="foot-key">≥32 引擎</span>（<code>engine/motion-engine.js</code>，视线/眨眼/姿态，
    详情页头与主视觉）。40 / 56 两列跑参考实现的 idle 姿态（17° / −14° / 29°），
    所以眼睛略偏上、带一点斜和视线。
  </div>
</div>`;

const productEngineCss = await fs.readFile(
  path.join(agentBotDir, "cap-avatar-engine.css"),
  "utf8",
);

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>avatar tiers</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; overflow: hidden; }
  body {
    font-family: "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #1b1b1a;
  }
  .panel { padding: 26px 30px 22px; background: #fff; }
  .title-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; padding-bottom: 4px; }
  .title { font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }
  .subtitle { font-size: 11.5px; color: #8a8a84; }
  .grid {
    margin-top: 16px;
    display: grid;
    grid-template-columns: 132px repeat(4, 104px);
    align-items: end;
    column-gap: 8px;
  }
  .col-head {
    display: flex; align-items: baseline; gap: 2px; justify-content: center;
    padding-bottom: 8px; color: #6f6f69;
  }
  .col-head .px { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .col-head .px-unit { font-size: 9.5px; color: #a2a29b; }
  .col-head .px-tag { margin-left: 4px; font-size: 9.5px; color: #6f6f69; background: #f0f0ec; border-radius: 4px; padding: 1px 4px; }
  .row { display: contents; }
  .row-head {
    display: flex; flex-direction: column; gap: 3px;
    padding: 0 0 14px 2px; align-self: center;
  }
  .swatch { width: 9px; height: 9px; border-radius: 3px; }
  .row-name { font-size: 12px; font-weight: 600; }
  .row-hex { font-size: 9.5px; color: #94948d; font-variant-numeric: tabular-nums; }
  .cell {
    height: 96px; display: flex; align-items: flex-end; justify-content: center;
    padding-bottom: 14px;
  }
  /* 静态帧与 CapAvatar 一致：外层定位盒 + 纯色本体 + 绝对定位瞳片。 */
  .cap { position: relative; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; }
  .cap-body { position: relative; display: block; }
  .cap-eyes { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .cap svg.grok-bot-mark { overflow: visible; }
  /* 产品自己的引擎配色规则（同一个文件，逐字引入，不在这里重写）。 */
  ${productEngineCss}
  .foot {
    margin-top: 8px; padding-top: 10px; border-top: 1px solid #ececE8;
    font-size: 10.5px; color: #8a8a84; letter-spacing: 0.005em; line-height: 1.55;
  }
  .foot code { font-size: 10px; color: #55554f; }
  .foot-key { color: #55554f; font-weight: 600; }
  .foot-key + * { font-weight: 400; }
</style></head>
<body>${panel}<script src="./bundle.js"></script></body></html>`;

await fs.writeFile(path.join(here, "index.html"), html);
await fs.writeFile(
  path.join(here, "specs.json"),
  `${JSON.stringify(engineSpecs, null, 2)}\n`,
);

/* ------------------------------ 引擎 bundle ------------------------------ */
const require = (await import("node:module")).createRequire(path.join(repo, "package.json"));
const esbuild = require(path.join(repo, "node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild"));

const entry = `
import { createRoot } from "react-dom/client";
import { GrokBot } from ${JSON.stringify(path.join(agentBotDir, "engine/motion-engine.js").replace(/\\/g, "/"))};
import { createEngineClock } from ${JSON.stringify(path.join(agentBotDir, "clock.ts").replace(/\\/g, "/"))};
import specs from "./specs.json";

for (const spec of specs) {
  const host = document.querySelector('[data-engine][data-palette="' + spec.palette + '"][data-size="' + spec.size + '"]');
  if (!host) continue;
  const clock = createEngineClock(spec.size);
  createRoot(host).render(
    <GrokBot key={spec.palette + spec.size} {...spec.props} clock={clock} aria-hidden={true} />
  );
}
`;

await fs.writeFile(path.join(here, ".engine-entry.jsx"), entry);
await esbuild.build({
  entryPoints: [path.join(here, ".engine-entry.jsx")],
  bundle: true,
  format: "iife",
  platform: "browser",
  outfile: path.join(here, "bundle.js"),
  loader: { ".js": "jsx", ".jsx": "jsx", ".json": "json" },
  jsx: "automatic",
  nodePaths: [path.join(repo, "node_modules")],
  absWorkingDir: repo,
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "warning",
});
await fs.rm(path.join(here, ".engine-entry.jsx"));

/* ------------------------------- CDP 截图 ------------------------------- */
const CDP = "http://127.0.0.1:9222";
const pageUrl = "file:///" + path.join(here, "index.html").replace(/\\/g, "/");
const created = await fetch(`${CDP}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" });
const target = await created.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    console.error("page exception:", JSON.stringify(msg.params.exceptionDetails).slice(0, 400));
  }
});
await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", rej, { once: true });
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 132 + SIZE_COLUMNS.length * 104 + SIZE_COLUMNS.length * 8 + 60,
  height: 640,
  deviceScaleFactor: 4,
  mobile: false,
});
await send("Page.navigate", { url: pageUrl });
await sleep(2600);

// 页面高度跟着内容长；量出来再把视口卡到内容精确高度，避免大块留白。
const box = await send("Runtime.evaluate", {
  expression: `(() => {
    const el = document.querySelector('.panel');
    const r = el.getBoundingClientRect();
    const engines = [...document.querySelectorAll('[data-engine] svg')].length;
    const staticEyes = [...document.querySelectorAll('.cap-eyes')].length;
    const flatBodies = [...document.querySelectorAll('.cap-body')].length;
    return JSON.stringify({ w: Math.ceil(r.width), h: Math.ceil(r.height), engines, staticEyes, flatBodies });
  })()`,
  returnByValue: true,
});
const boxInfo = JSON.parse(box.result.value);
console.log("panel:", boxInfo);
await send("Emulation.setDeviceMetricsOverride", {
  width: boxInfo.w,
  height: boxInfo.h,
  deviceScaleFactor: 4,
  mobile: false,
});
await sleep(900);

const shot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
  fromSurface: true,
});
const outPath = path.join(repo, "docs/brand/avatar-tiers.png");
await fs.writeFile(outPath, Buffer.from(shot.data, "base64"));
console.log("saved", outPath);

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});

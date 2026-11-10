// 头像尺寸对照图（32 / 48 / 64px × 橙子 amber / 深潮 / 梅紫）
//
// 产品只有一档标准尺寸：**32px**（`AGENT_AVATAR_PX`）。48 / 64 只出现在单实例
// 展示位（智能体详情页头、弹层里的身份卡），不进列表、不进卡片。16px / 24px 两列
// 已经删掉：agent 头像不再有这两个档位。
//
// 三列都按**产品真实渲染**出图，不手抄像素：32/48/64 都是引擎真身
// （`capEngineProps` + `clock.createEngineClock`，Chrome 里跑 rAF）。
// 渲染走 9222 端口的 CDP，DPR 4 截图 → docs/brand/avatar-tiers.png。
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

const { capEngineProps, capSeed } = await import(
  pathToFileURL(path.join(agentBotDir, "caps.ts")).href
);
const { AVATAR_SIZE_PX } = await import(
  pathToFileURL(path.join(agentBotDir, "../avatar-size.ts")).href
);
const { PALETTES } = await import(pathToFileURL(path.join(agentBotDir, "palettes.ts")).href);

const SIZE_COLUMNS = [AVATAR_SIZE_PX.lg, 48, 64];
const ROWS = ["amber", "deep-tide", "plum"].map((id) => PALETTES.find((p) => p.id === id));
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

/** 三列都是引擎挂载点。颜色走 `capEngineProps`，类规则直接引产品自己的 CSS。 */
function engineCell(palette, size) {
  return `<div class="cell"><div class="cap cap-${size}" data-slot="cap-avatar" data-tier="animated" data-engine data-shape="${SHAPE}" data-size="${size}" data-palette="${palette.id}"></div></div>`;
}

const engineSpecs = [];
for (const palette of ROWS) {
  for (const size of SIZE_COLUMNS) {
    engineSpecs.push({
      shape: SHAPE,
      size,
      palette: palette.id,
      props: capEngineProps({ paletteId: palette.id, bodyId: SHAPE }, size, AGENT_ID),
      seed: capSeed(AGENT_ID),
    });
  }
}

const row = (palette) => `
  <div class="row">
    <div class="row-head">
      <span class="swatch" style="background-color:${palette.a}"></span>
      <span class="row-name">${palette.id}</span>
      <span class="row-hex">${palette.a} / ${palette.b}</span>
    </div>
    ${SIZE_COLUMNS.map((size) => engineCell(palette, size)).join("")}
  </div>`;

const HEADER = SIZE_COLUMNS.map(
  (size) =>
    `<div class="col-head"><span class="px">${size}</span><span class="px-unit">px</span>${
      size === SIZE_COLUMNS[0] ? '<span class="px-tag">标准</span>' : ""
    }</div>`,
).join("");

const panel = `
<div class="panel">
  <div class="title-row">
    <div class="title">智能体头像 · 纯色本体 + 眼睛</div>
    <div class="subtitle">标准 32px；48 / 64 仅用于单实例展示（详情页头、身份弹层）</div>
  </div>
  <div class="grid">
    <div class="row-head-spacer"></div>
    ${HEADER}
    ${ROWS.map(row).join("")}
  </div>
  <div class="foot">
    <span class="foot-key">amber</span> 橙子（cap:blob:amber）·
    <span class="foot-key">deep-tide</span> / <span class="foot-key">plum</span> 另外两个色板 ·
    形状一致性来自 cap-v1 哈希，颜色来自 palettes.ts（a = 本体，b = 眼睛）<br>
    三档都是引擎真身：它跑参考实现的 idle 姿态（17° / −14° / 29°），所以眼睛略偏上、
    带一点斜和视线。列表里默认停在静态帧（animated={false}），只有单实例展示位开动画；
    16px / 24px 两档已从产品里删除，不再出现在本图上。
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
    grid-template-columns: 118px repeat(3, 96px);
    align-items: end;
    column-gap: 10px;
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
    font-size: 10.5px; color: #8a8a84; letter-spacing: 0.005em;
  }
  .foot-key { color: #55554f; font-weight: 600; }
  .foot-key + * { font-weight: 400; }
</style></head>
<body>${panel}<script src="./bundle.js"></script></body></html>`;

await fs.writeFile(path.join(here, "index.html"), html);
await fs.writeFile(
  path.join(here, "specs.json"),
  `${JSON.stringify(engineSpecs.map((s) => ({ ...s })), null, 2)}\n`,
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
  width: 118 + 3 * 96 + 3 * 10 + 60,
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
    return JSON.stringify({ w: Math.ceil(r.width), h: Math.ceil(r.height), engines });
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

// 五个承载位的头像槽位图 —— issue 列表行 / 评论头 / 看板卡片 / 侧栏 / agent 详情。
//
// 这些图量的是**槽位**，不是装饰：每一格的 avatar 直径直接来自 `avatar-size.ts`
// 的 `AVATAR_SLOT_PX`（列表 20 / 评论 24 / 详情 40 / 主视觉 56），行高来自
// `tokens.css` 的 `--issue-row-height`（36px）和侧栏树行高（26px）。像素不是手抄：
// 本体与瞳片由 `capStaticStyle` / `capEyeFrame` 生成，色板读 `palettes.ts`。
//
// 为什么是组件级截图：`docs/tasks/LOCAL-RUN.md` 的本地工作区需要 Supabase 邮箱
// 验证码登录，本机 3000/8080 只到登录页，没有可用会话；因此这里用产品函数渲染
// 每个承载位自己的 chrome + 槽位直径，保证"行高与留白与上游一致"是可量的，
// 而不是从一张带登录态的截图里目测。
//
// 渲染走 9222 端口的 CDP，DPR 3，逐 section 裁切成
// docs/brand/reference/avatar-sizes/*.png。
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../..");
const agentBotDir = path.join(repo, "packages/ui/lib/agent-bot");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { capEyeFrame, capStaticStyle } = await import(
  pathToFileURL(path.join(agentBotDir, "caps.ts")).href
);
const { AVATAR_SLOT_PX } = await import(
  pathToFileURL(path.join(agentBotDir, "../avatar-size.ts")).href
);
const { PALETTES } = await import(pathToFileURL(path.join(agentBotDir, "palettes.ts")).href);

const palettes = {
  amber: PALETTES.find((p) => p.id === "amber"),
  "deep-tide": PALETTES.find((p) => p.id === "deep-tide"),
  ember: PALETTES.find((p) => p.id === "ember"),
};

const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const cssText = (style) =>
  Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      const name = kebab(key);
      const sized = (name === "width" || name === "height") && typeof value === "number";
      return `${name}:${sized ? `${value}px` : value}`;
    })
    .join(";");

/** 一个真实渲染的 cap 头像：纯色本体 + （≥21px 时）静态瞳片。 */
function cap(paletteId, sizePx, bodyId = "blob") {
  const capValue = { paletteId, bodyId };
  const frame = capEyeFrame(capValue, sizePx);
  const eyes = frame
    ? `<svg class="cap-eyes" viewBox="${frame.viewBox}">${frame.eyes
        .map((eye) => `<circle cx="${eye.cx}" cy="${eye.cy}" r="${eye.r}" fill="${frame.fill}"/>`)
        .join("")}</svg>`
    : "";
  return `<span class="cap" data-slot="cap-avatar" data-cap-body="${bodyId}" data-cap-palette="${paletteId}" data-size="${sizePx}"><span class="cap-body" style="${cssText(
    capStaticStyle(capValue, sizePx),
  )}"></span>${eyes}</span>`;
}

const sections = [
  {
    key: "issue-list-row",
    title: "issue 列表行",
    note: `行高 36px（--issue-row-height）· 头像槽位 ${AVATAR_SLOT_PX.list}px（size="sm"）· 行内留白 8px 上下`,
    body: `
      <div class="row-list">
        ${[
          ["amber", "企业工作区支持 SAML 登录", "MUL-145", "1 小时前"],
          ["deep-tide", "给账单管理员发用量提醒", "MUL-144", "3 小时前"],
          ["ember", "按工作区分配带权限范围的 API 密钥", "MUL-143", "4 小时前"],
          ["amber", "轮换 webhook 签名密钥", "MUL-141", "昨天"],
        ]
          .map(
            ([paletteId, title, identifier, time]) => `
          <div class="list-row">
            <span class="row-id">${identifier}</span>
            <span class="row-title">${title}</span>
            <span class="row-spacer"></span>
            ${cap(paletteId, AVATAR_SLOT_PX.list)}
            <span class="row-time">${time}</span>
          </div>`,
          )
          .join("")}
      </div>`,
  },
  {
    key: "comment-header",
    title: "评论头",
    note: `评论作者槽位 ${AVATAR_SLOT_PX.comment}px（size="md"）· 与作者名 / 时间的基线间距`,
    body: `
      <div class="comments">
        ${[
          ["amber", "橙子", "刚刚", "把 SAML 元数据接进企业工作区，登录回跳已验证。"],
          ["deep-tide", "深潮", "12 分钟前", "限流改成按工作区配额，压测跑了 3 轮。"],
        ]
          .map(
            ([paletteId, name, time, text]) => `
          <div class="comment">
            ${cap(paletteId, AVATAR_SLOT_PX.comment)}
            <div class="comment-body">
              <div class="comment-head"><span class="comment-name">${name}</span><span class="comment-time">${time}</span></div>
              <div class="comment-text">${text}</div>
            </div>
          </div>`,
          )
          .join("")}
      </div>`,
  },
  {
    key: "board-card",
    title: "看板卡片",
    note: `卡片 meta 行 ${AVATAR_SLOT_PX.list}px 头像 · 卡片内边距 12px / 10px，与上游一致`,
    body: `
      <div class="board">
        ${[
          ["amber", "MUL-145", "企业工作区支持 SAML 登录", "todo"],
          ["ember", "MUL-142", "把认证 webhook 移到任务队列", "doing"],
        ]
          .map(
            ([paletteId, identifier, title, status]) => `
          <div class="card">
            <div class="card-top"><span class="card-id">${identifier}</span><span class="card-status ${status}">${status}</span></div>
            <div class="card-title">${title}</div>
            <div class="card-meta">${cap(paletteId, AVATAR_SLOT_PX.list)}<span class="card-badge">进行中</span></div>
          </div>`,
          )
          .join("")}
      </div>`,
  },
  {
    key: "sidebar",
    title: "侧栏",
    note: `树行 26px（TREE_CHILD_ROW_CLASS）· running badge 里的头像 16px（size="xs"）`,
    body: `
      <div class="sidebar">
        ${[
          ["amber", "MUL-145", "企业工作区支持 SAML 登录", true],
          ["deep-tide", "MUL-144", "给账单管理员发用量提醒", false],
          ["ember", "MUL-143", "按工作区分配带权限范围的 API 密钥", true],
        ]
          .map(
            ([paletteId, identifier, title, running]) => `
          <div class="tree-row">
            <span class="tree-icon"></span>
            <span class="tree-id">${identifier}</span>
            <span class="tree-title">${title}</span>
            ${running ? `<span class="tree-badge">${cap(paletteId, 16)}</span>` : ""}
          </div>`,
          )
          .join("")}
      </div>`,
  },
  {
    key: "agent-detail",
    title: "agent 详情",
    note: `详情页头槽位 ${AVATAR_SLOT_PX.detail}px（--avatar-slot-size:3rem 同口径，40px）· 主视觉 ${AVATAR_SLOT_PX.hero}px 对照`,
    body: `
      <div class="detail">
        <div class="detail-head">
          <span class="detail-avatar">${cap("amber", AVATAR_SLOT_PX.detail)}</span>
          <div class="detail-text">
            <div class="detail-name">橙子</div>
            <div class="detail-sub">Lead Agent · 正在执行 · 详情页头</div>
          </div>
        </div>
        <div class="detail-hero">
          ${cap("amber", AVATAR_SLOT_PX.hero)}
          <span class="hero-note">主视觉 ${AVATAR_SLOT_PX.hero}px（单实例展示，引擎档）</span>
        </div>
      </div>`,
  },
];

const paletteRow = Object.values(palettes)
  .map((p) => `<span class="swatch" style="background-color:${p.a}"></span><code>${p.id} ${p.a}</code>`)
  .join(" · ");

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>avatar slot sizes</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f7f7f5; color: #1b1b1a;
    font-family: "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  .sheet { padding: 28px; display: flex; flex-direction: column; gap: 20px; width: 760px; }
  .section { background: #fff; border: 1px solid #e6e6e0; border-radius: 10px; padding: 14px 16px; }
  .section h2 { margin: 0 0 2px; font-size: 13px; font-weight: 600; }
  .section .note { margin: 0 0 12px; font-size: 10.5px; color: #8a8a84; }
  .cap { position: relative; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; flex: 0 0 auto; }
  .cap-body { position: relative; display: block; }
  .cap-eyes { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

  .list-row { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px; border-radius: 6px; }
  .list-row + .list-row { border-top: 1px solid #f0f0ea; }
  .row-id { width: 64px; font-size: 11px; color: #9a9a93; font-variant-numeric: tabular-nums; }
  .row-title { font-size: 12.5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .row-spacer { flex: 1; }
  .row-time { font-size: 10.5px; color: #9a9a93; width: 54px; text-align: right; }

  .comment { display: flex; gap: 10px; padding: 8px 0; }
  .comment + .comment { border-top: 1px solid #f0f0ea; }
  .comment-head { display: flex; align-items: baseline; gap: 6px; }
  .comment-name { font-size: 12px; font-weight: 600; }
  .comment-time { font-size: 10.5px; color: #9a9a93; }
  .comment-text { margin-top: 2px; font-size: 12px; color: #55554f; line-height: 1.5; }

  .board { display: flex; gap: 10px; align-items: flex-start; }
  .card { width: 240px; border: 0.5px solid #e2e2dc; border-radius: 8px; padding: 12px 10px; background: #fff; }
  .card-top { display: flex; align-items: center; justify-content: space-between; }
  .card-id { font-size: 10.5px; color: #9a9a93; }
  .card-status { font-size: 10px; border-radius: 4px; padding: 1px 5px; background: #f0f0ea; color: #6f6f69; }
  .card-status.doing { background: #e8f0ff; color: #2a4a73; }
  .card-title { margin: 6px 0 8px; font-size: 12.5px; line-height: 1.35; }
  .card-meta { display: flex; align-items: center; gap: 6px; }
  .card-badge { font-size: 10px; color: #9a9a93; }

  .tree-row { display: flex; align-items: center; gap: 6px; min-height: 26px; padding: 3px 8px; border-radius: 8px; }
  .tree-row + .tree-row { border-top: 1px solid #f4f4ef; }
  .tree-icon { width: 8px; height: 8px; border-radius: 2px; background: #dcdcd4; }
  .tree-id { font-size: 10.5px; color: #9a9a93; font-variant-numeric: tabular-nums; }
  .tree-title { flex: 1; font-size: 11.5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .tree-badge { display: inline-flex; }

  .detail-head { display: flex; align-items: center; gap: 12px; }
  .detail-avatar { display: inline-flex; }
  .detail-name { font-size: 15px; font-weight: 600; }
  .detail-sub { margin-top: 2px; font-size: 10.5px; color: #8a8a84; }
  .detail-hero { margin-top: 14px; display: flex; align-items: center; gap: 10px; padding-top: 12px; border-top: 1px solid #f0f0ea; }
  .hero-note { font-size: 10.5px; color: #8a8a84; }

  .foot { font-size: 10px; color: #8a8a84; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .swatch { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
  .foot code { font-size: 10px; color: #55554f; }
</style></head>
<body>
  <div class="sheet">
    <div class="section">
      <h2>包豪斯 17 色板 · 上游槽位尺寸</h2>
      <p class="note">本体 = palette.a 纯色，眼睛 = palette.b；列表 20 / 评论 24 / 详情 40 / 主视觉 56</p>
      <div class="foot">${paletteRow}</div>
    </div>
    ${sections
      .map(
        (s) => `<div class="section" data-shot="${s.key}"><h2>${s.title}</h2><p class="note">${s.note}</p>${s.body}</div>`,
      )
      .join("\n")}
  </div>
</body></html>`;

await fs.writeFile(path.join(here, "index.html"), html);

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
await send("Emulation.setDeviceMetricsOverride", { width: 820, height: 1400, deviceScaleFactor: 3, mobile: false });
await send("Page.navigate", { url: pageUrl });
await sleep(1500);

for (const section of sections) {
  const box = await send("Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector('[data-shot="${section.key}"]');
      const r = el.getBoundingClientRect();
      const avatars = [...el.querySelectorAll('[data-slot="cap-avatar"]')].map((a) => a.dataset.size);
      return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height, avatars });
    })()`,
    returnByValue: true,
  });
  const info = JSON.parse(box.result.value);
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: info.x, y: info.y, width: info.width, height: info.height, scale: 3 },
  });
  const outPath = path.join(here, `${section.key}.png`);
  await fs.writeFile(outPath, Buffer.from(shot.data, "base64"));
  console.log(`${section.key}: ${Math.round(info.width)}x${Math.round(info.height)} avatar slots ${info.avatars.join("/")} → ${path.basename(outPath)}`);
}

ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});

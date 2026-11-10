// 生成 index.html：数据驱动，避免手写 15 张卡片重复标记。
// 只产出纯 HTML/CSS，无外链字体、无外链图片。
import fs from "node:fs";
import path from "node:path";

import { capAvatar, capFor, resolveCap, PALETTES } from "./caps.mjs";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ""));

/* ------------------------- 演示用智能体（真实 id） -------------------------
 * 形状 + 色板全部来自 capFor(agentId) 的稳定哈希；mika 额外带上线上持久化的
 * `cap:blob:amber`（内置橙子的固定橙色头像），与 resolveCap 的行为一致。
 * reviewer 与 designer 落到同一组 hex/coral，这是哈希的真实结果，保留不修饰。
 */
const AGENTS = [
  { id: "mika", name: "橙子", state: "在执行", live: true, avatarUrl: "cap:blob:amber" },
  { id: "squad-lead", name: "队长", state: "在线" },
  { id: "reviewer", name: "评审", state: "在线" },
  { id: "ops", name: "运维", state: "在线" },
  { id: "designer", name: "设计", state: "在线" },
  { id: "writer", name: "文案", state: "空闲" },
];

const agentById = (id) => AGENTS.find((a) => a.id === id);

/* 成员头像同样走 cap 外观：成员 id 是 workspace 里的稳定标识。 */
const MEMBERS = { 陈: "chen", 林: "lin", 周: "zhou" };

const CSS = `
  /* ------------------------------------------------------------------
   * 落地页首屏假产品看板 - 纯 HTML/CSS，无外链字体、无外链图片。
   * 颜色取自 packages/ui/styles/tokens.css 的亮色主题：
   *   background oklch(.988 0 0) / card #fff / border oklch(.945 .003 286.32)
   *   foreground oklch(.141 .005 285.823) / muted-foreground oklch(.505 .016 285.938)
   *   faint-foreground oklch(.606 .016 285.938) / muted oklch(.967 .001 286.375)
   *   warning oklch(.75 .16 85) / success oklch(.55 .16 145) / info oklch(.55 .18 250)
   *   destructive oklch(.577 .245 27.325) / priority-high oklch(.68 .18 50)
   * ------------------------------------------------------------------ */
  :root {
    --bg: oklch(0.988 0 0);
    --card: oklch(1 0 0);
    --border: oklch(0.945 0.003 286.32);
    --border-strong: oklch(0.92 0.004 286.32);
    --fg: oklch(0.141 0.005 285.823);
    --muted-fg: oklch(0.505 0.016 285.938);
    --faint-fg: oklch(0.606 0.016 285.938);
    --muted: oklch(0.967 0.001 286.375);
    --primary: oklch(0.21 0.006 285.885);
    --warning: oklch(0.75 0.16 85);
    --success: oklch(0.55 0.16 145);
    --info: oklch(0.55 0.18 250);
    --destructive: oklch(0.577 0.245 27.325);
    --prio-high: oklch(0.68 0.18 50);
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 1320px; height: 890px; overflow: hidden; }

  body {
    background: var(--bg);
    color: var(--fg);
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
      "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    font-size: 13px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }

  .app { display: flex; width: 1320px; height: 890px; }

  /* ============================ 左侧导航 ============================ */
  .sidebar {
    width: 208px; flex: 0 0 208px; height: 100%;
    background: var(--card);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    padding: 12px 10px;
  }

  /* 品牌词标：MorechatWordmark 的排版（font-weight 600 / letter-spacing -0.02em /
     currentColor，.co 后半段淡化到 0.6）；下一行小字是工作区名。 */
  .ws { display: flex; align-items: center; gap: 8px; padding: 2px 4px 0; }
  .wordmark {
    display: inline-block;
    font-size: 15px; font-weight: 600;
    letter-spacing: -0.02em; line-height: 1; color: currentColor;
    white-space: nowrap; user-select: none;
  }
  .wordmark .wm-tld { opacity: 0.6; }
  .ws-sub { padding: 0 4px; margin: 5px 0 11px; font-size: 10px; color: var(--faint-fg); white-space: nowrap; }
  .ws-chev { margin-left: auto; color: var(--faint-fg); }

  .nav { display: flex; flex-direction: column; gap: 1px; margin-top: 4px; }
  .nav-item {
    display: flex; align-items: center; gap: 9px;
    height: 31px; padding: 0 8px; border-radius: 7px;
    color: var(--muted-fg); font-size: 12.5px;
  }
  .nav-item svg { color: var(--faint-fg); flex: 0 0 auto; }
  .nav-item.active { background: var(--muted); color: var(--fg); font-weight: 600; }
  .nav-item.active svg { color: var(--fg); }
  .nav-count { margin-left: auto; font-size: 10.5px; color: var(--faint-fg); font-variant-numeric: tabular-nums; }
  .nav-item.active .nav-count { color: var(--muted-fg); }

  .side-run {
    margin-top: auto;
    border: 1px solid var(--border); border-radius: 10px; padding: 10px;
    background: linear-gradient(180deg, oklch(0.99 0.005 285), oklch(1 0 0));
  }
  .side-run-head { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted-fg); }
  .dot { width: 6px; height: 6px; border-radius: 999px; background: var(--success); }
  /* 32px 头像 + 标题同一行：行高跟着头像走，文字垂直居中，不压扁头像。 */
  .side-run-now { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .side-run-title { font-size: 12px; font-weight: 600; line-height: 1.35; }
  .side-run-sub { font-size: 10.5px; color: var(--faint-fg); margin-top: 2px; font-variant-numeric: tabular-nums; }
  .bar { height: 4px; border-radius: 999px; background: var(--muted); margin-top: 8px; overflow: hidden; }
  .bar > i { display: block; height: 100%; width: 62%; border-radius: 999px; background: linear-gradient(90deg, var(--info), oklch(0.65 0.17 300)); }

  .side-user { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 6px; border-radius: 9px; }
  .side-user .who { font-size: 12px; font-weight: 500; }
  .side-user .plan { font-size: 10px; color: var(--faint-fg); }

  /* ============================ 主区域 ============================ */
  .main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }

  .toolbar {
    height: 56px; flex: 0 0 56px;
    display: flex; align-items: center; gap: 10px;
    padding: 0 16px;
    background: var(--card);
    border-bottom: 1px solid var(--border);
  }
  .tb-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
  .tb-sep { width: 1px; height: 16px; background: var(--border-strong); }
  .seg { display: flex; align-items: center; gap: 2px; background: var(--muted); border-radius: 8px; padding: 2px; }
  .seg-item { display: flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border-radius: 6px; font-size: 12px; color: var(--muted-fg); }
  .seg-item.active {
    background: var(--card); color: var(--fg); font-weight: 600;
    box-shadow: 0 1px 2px rgba(16, 17, 23, 0.08), 0 0 0 1px oklch(0.92 0.004 286.32);
  }
  .tb-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .search {
    display: flex; align-items: center; gap: 6px;
    width: 168px; height: 28px; padding: 0 9px;
    border: 1px solid var(--border); border-radius: 7px;
    color: var(--faint-fg); font-size: 11.5px; background: var(--bg);
  }
  .btn-new {
    display: flex; align-items: center; gap: 6px;
    height: 28px; padding: 0 11px; border-radius: 7px;
    background: var(--primary); color: #fff; font-size: 12px; font-weight: 600;
    box-shadow: 0 1px 2px rgba(16, 17, 23, 0.18);
  }
  .avatars { display: flex; align-items: center; gap: 4px; }

  /* ============================ 看板 ============================ */
  .board {
    flex: 1 1 auto; min-height: 0;
    display: grid; grid-template-columns: repeat(5, 1fr);
    gap: 10px; padding: 12px 16px 16px;
    align-items: stretch;
  }

  .col {
    display: flex; flex-direction: column; min-width: 0;
    border-radius: 12px;
    background: oklch(0.972 0.002 286.32);
    border: 1px solid oklch(0.955 0.003 286.32);
    padding: 8px;
  }
  .col[data-tone="warning"] { background: oklch(0.982 0.015 88); border-color: oklch(0.955 0.022 88); }
  .col[data-tone="success"] { background: oklch(0.981 0.012 150); border-color: oklch(0.955 0.018 150); }
  .col[data-tone="info"] { background: oklch(0.981 0.013 250); border-color: oklch(0.955 0.019 250); }

  .col-head {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 4px 9px;
    color: var(--muted-fg); font-size: 12px; font-weight: 600; letter-spacing: -0.005em;
  }
  .col-head .n { color: var(--faint-fg); font-weight: 500; font-size: 11px; font-variant-numeric: tabular-nums; }
  .col-head .plus { margin-left: auto; color: var(--faint-fg); display: grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; }

  .cards { display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 10px 10px 9px;
    box-shadow: 0 1px 2px rgba(16, 17, 23, 0.04);
  }
  .card-top { display: flex; align-items: center; gap: 6px; }
  .key { font-size: 10.5px; color: var(--faint-fg); font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
  .card-title {
    margin: 5px 0 0;
    font-size: 13.2px; line-height: 1.4; font-weight: 600;
    letter-spacing: -0.01em; color: var(--fg);
  }
  .card-desc { margin: 4px 0 0; font-size: 11.2px; line-height: 1.55; color: var(--faint-fg); }

  .sub-row { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
  .sub-label { font-size: 10px; color: var(--faint-fg); white-space: nowrap; }
  .mini-bar { flex: 1 1 auto; height: 3px; border-radius: 999px; background: var(--muted); overflow: hidden; }
  .mini-bar > i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, oklch(0.66 0.14 255), oklch(0.7 0.15 300)); }
  .frac { font-size: 10px; color: var(--faint-fg); font-variant-numeric: tabular-nums; white-space: nowrap; }

  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .chip {
    font-size: 10px; line-height: 16px; padding: 0 6px;
    border-radius: 5px; background: var(--muted); color: var(--muted-fg);
    display: inline-flex; align-items: center; gap: 3px;
  }
  .chip-dot { width: 5px; height: 5px; border-radius: 999px; flex: 0 0 auto; }
  .chip.agent { background: oklch(0.55 0.18 250 / 0.09); color: var(--info); display: inline-flex; align-items: center; gap: 3px; }

  /* 卡片元信息行：32px 头像撑起这一行，所以上下留白按 32px 重排 —— 头像与时间、
     评论数在同一条水平线上，不再为了贴合 24px 把间距压到 8/9px。 */
  .card-foot {
    display: flex; align-items: center; gap: 6px;
    margin-top: 10px; padding-top: 9px;
    min-height: 32px;
    border-top: 1px solid oklch(0.955 0.003 286.32);
  }
  .card-foot .meta { font-size: 10.5px; color: var(--faint-fg); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .card-foot .right { margin-left: auto; display: flex; align-items: center; gap: 7px; flex: 0 0 auto; }
  .foot-ic { display: inline-flex; align-items: center; gap: 2px; font-size: 10px; color: var(--faint-fg); font-variant-numeric: tabular-nums; }
  .st { font-size: 10px; display: inline-flex; align-items: center; gap: 4px; }

  .add-task {
    display: flex; align-items: center; justify-content: center; gap: 5px;
    height: 28px; border-radius: 8px;
    border: 1px dashed oklch(0.9 0.004 286.32);
    color: var(--faint-fg); font-size: 11.5px;
    margin-top: 2px;
  }

  /* ---------------- 优先级徽章 ---------------- */
  .prio {
    margin-left: auto; display: inline-flex; align-items: center; gap: 3px;
    height: 18px; padding: 0 5px; border-radius: 5px;
    font-size: 10px; font-weight: 600; white-space: nowrap;
  }
  .prio svg { flex: 0 0 auto; }
  .prio.urgent { background: oklch(0.577 0.245 27.325 / 0.1); color: var(--destructive); }
  .prio.high { background: oklch(0.68 0.18 50 / 0.13); color: oklch(0.6 0.17 45); }
  .prio.medium { background: oklch(0.75 0.16 85 / 0.18); color: oklch(0.54 0.13 72); }
  .prio.low { background: oklch(0.55 0.18 250 / 0.1); color: var(--info); }

  /* ---------------- cap 头像：外观全部内联，逐值来自 capStaticStyle ----------------
   * 形态与参考实现一致：**纯色本体 + 眼睛**（palette.a 的 background-color，
   * palette.b 的深色小圆）。尺寸、颜色、border-radius、clip-path、内阴影都不在
   * 这里写死：build.mjs 调 caps.mjs 从 packages/ui/lib/agent-bot 的真实契约算出
   * 后写进 style 属性。这里只留骨架和瞳片定位，不画形状、不留占位字形。 */
  .cap-avatar { display: inline-block; position: relative; vertical-align: middle; overflow: hidden; user-select: none; }
  .cap-eyes { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

  /* ---------------- 侧栏智能体列表 ---------------- */
  .agents { margin-top: 15px; padding: 0 2px; }
  .agents-head {
    display: flex; align-items: center; gap: 4px;
    padding: 0 4px 5px;
    font-size: 10.5px; color: var(--faint-fg); letter-spacing: 0.01em;
  }
  .agents-head .n { font-variant-numeric: tabular-nums; color: oklch(0.66 0.01 286); }
  .agent-row { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 4px; border-radius: 6px; }
  .agent-name { font-size: 11.8px; color: var(--fg); }
  .agent-state { margin-left: auto; font-size: 10px; color: var(--faint-fg); }
  .agent-row.live .agent-state { color: oklch(0.55 0.13 145); }
`;

/* ------------------------------- 图标 ------------------------------- */
const ico = {
  inbox: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 4.2A1.2 1.2 0 0 1 3.2 3h9.6A1.2 1.2 0 0 1 14 4.2v6.4a1.2 1.2 0 0 1-1.2 1.2H6.4L3.2 14v-2.2A1.2 1.2 0 0 1 2 10.6Z" stroke-linejoin="round"/></svg>`,
  mine: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="5.6"/><path d="M5.6 8.2 7.2 9.8 10.5 6.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  tasks: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2.4" y="2.4" width="4.4" height="11.2" rx="1.2"/><rect x="9.2" y="2.4" width="4.4" height="6.6" rx="1.2"/></svg>`,
  agents: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3.4" y="5" width="9.2" height="7" rx="2"/><path d="M8 2.6v2.4M5.6 8.4v1M10.4 8.4v1" stroke-linecap="round"/></svg>`,
  runtimes: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2.6" y="2.6" width="10.8" height="4" rx="1.4"/><rect x="2.6" y="9.4" width="10.8" height="4" rx="1.4"/><path d="M4.9 4.6h.01M4.9 11.4h.01" stroke-linecap="round"/></svg>`,
  skills: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2 9.4 5.2 12.6 5.7 10.3 8 10.8 11.2 8 9.7 5.2 11.2 5.7 8 3.4 5.7 6.6 5.2Z"/></svg>`,
  settings: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="2.1"/><path d="M8 2.3v1.4M8 12.3v1.4M2.3 8h1.4M12.3 8h1.4M3.9 3.9l1 1M11.1 11.1l1 1M12.1 3.9l-1 1M4.9 11.1l-1 1" stroke-linecap="round"/></svg>`,
  board: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.4" y="2.4" width="4.2" height="11.2" rx="1.1"/><rect x="9.4" y="2.4" width="4.2" height="7" rx="1.1"/></svg>`,
  filter: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2.3 3.4h11.4l-4.4 5.1v4.1l-2.6 1V8.5Z" stroke-linejoin="round"/></svg>`,
  display: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2.6 4.6h10.8M4.6 8h6.8M6.6 11.4h2.8"/></svg>`,
  search: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3 3" stroke-linecap="round"/></svg>`,
  plus: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3.6v8.8M3.6 8h8.8"/></svg>`,
  comment: `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.4 4.4A1.4 1.4 0 0 1 3.8 3h8.4a1.4 1.4 0 0 1 1.4 1.4v5.2a1.4 1.4 0 0 1-1.4 1.4H7l-3 2.4v-2.4H3.8a1.4 1.4 0 0 1-1.4-1.4Z" stroke-linejoin="round"/></svg>`,
  pen: `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="m10.6 2.9 2.5 2.5M2.6 13.4l.6-2.7L9.9 4l2.1 2.1-6.7 6.7-2.7.6Z" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  chevron: `<svg class="ws-chev" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

/* 状态图标：和 StatusIcon 一样的几何（14x14，环 + 扇形/勾/叉） */
const statusIcon = {
  todo: `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="7" cy="7" r="5.6" stroke-dasharray="1.5 1.9" stroke-linecap="round"/></svg>`,
  progress: `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.6" stroke="currentColor" stroke-width="1.3"/><path d="M7 7V1.4A5.6 5.6 0 0 1 12.6 7Z" fill="currentColor"/></svg>`,
  review: `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.6" stroke="currentColor" stroke-width="1.3"/><path d="M7 7V1.4A5.6 5.6 0 0 1 12.6 7Z" fill="currentColor"/><path d="M12.6 7A5.6 5.6 0 0 1 7 12.6V7Z" fill="currentColor" opacity="0.55"/></svg>`,
  done: `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.6" fill="currentColor"/><path d="M4.4 7.1 6.2 8.9 9.7 5.3" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  archived: `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.6" stroke="currentColor" stroke-width="1.3"/><path d="M5 5 9 9M9 5 5 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
};

/* 优先级图形：1/2/3 根柱子填色 = 低/中/高；紧急是实心圆角方块加叹号 */
const prioIcon = {
  low: `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="8" width="3.5" height="6" rx="1"/><rect x="6.25" y="5" width="3.5" height="9" rx="1" opacity="0.3"/><rect x="10.5" y="2" width="3.5" height="12" rx="1" opacity="0.3"/></svg>`,
  medium: `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="8" width="3.5" height="6" rx="1"/><rect x="6.25" y="5" width="3.5" height="9" rx="1"/><rect x="10.5" y="2" width="3.5" height="12" rx="1" opacity="0.3"/></svg>`,
  high: `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="8" width="3.5" height="6" rx="1"/><rect x="6.25" y="5" width="3.5" height="9" rx="1"/><rect x="10.5" y="2" width="3.5" height="12" rx="1"/></svg>`,
  urgent: `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="3"/><rect x="7.2" y="4.6" width="1.6" height="4" rx="0.8" fill="#fff"/><circle cx="8" cy="11" r="0.95" fill="#fff"/></svg>`,
};
const prioLabel = { urgent: "紧急", high: "高", medium: "中", low: "低" };

/* 头像：成员用成员 id、智能体用智能体 id，全部交给 caps.mjs 出内联样式。
 *
 * 尺寸只有一档：`AVATAR_PX = 32`，就是线上智能体头像的产品标准
 * （`AGENT_AVATAR_PX`）。卡片、侧栏智能体列表、侧栏底部「正在执行」都按 32px 排，
 * 不再出现 15/18/20/24 混排；顶栏成员叠头像仍是成员尺寸，成员不在智能体标准内。 */
const AVATAR_PX = 32;
const memberAvatar = (ch, size = 24) => capAvatar(MEMBERS[ch] ?? ch, size);
const agentAvatar = (agentId, size = AVATAR_PX) => {
  const a = agentById(agentId);
  return capAvatar(agentId, size, "", a ? a.avatarUrl : null);
};
/** 徽章前的小色点：取该智能体色板的纯色 a，不当作头像（头像才有眼睛）。 */
const agentDot = (agentId) => {
  const { paletteId } = resolveCap(agentId, agentById(agentId)?.avatarUrl);
  const p = PALETTES.find((x) => x.id === paletteId);
  return `<span class="chip-dot" style="background-color:${p.a}"></span>`;
};

function card(c) {
  const chips = c.chips
    .map((t) =>
      typeof t === "string"
        ? `<span class="chip">${t}</span>`
        : `<span class="chip ${t.cls}">${t.agentId ? agentDot(t.agentId) : ""}${t.text}</span>`,
    )
    .join("");
  const pct = c.subs[1] ? Math.round((c.subs[0] / c.subs[1]) * 100) : 0;
  const barColor = c.subs[0] === c.subs[1] && c.subs[1] > 0 ? "background:var(--success)" : "";
  const right = c.comments || c.edits
    ? `<span class="right">
          ${c.comments ? `<span class="foot-ic">${ico.comment}${c.comments}</span>` : ""}
          ${c.edits ? `<span class="foot-ic">${ico.pen}${c.edits}</span>` : ""}
        </span>`
    : c.status
      ? `<span class="right"><span class="st" style="color:oklch(0.55 0.13 72)">${statusIcon.progress}${c.status}</span></span>`
      : "";
  return `          <article class="card">
            <div class="card-top">
              <span class="key">${c.id}</span>
              <span class="prio ${c.prio}">${prioIcon[c.prio]}${prioLabel[c.prio]}</span>
            </div>
            <h3 class="card-title">${c.title}</h3>
            <p class="card-desc">${c.desc}</p>
            <div class="sub-row">
              <span class="sub-label">子任务</span>
              <span class="mini-bar"><i style="width:${pct}%;${barColor}"></i></span>
              <span class="frac">${c.subs[0]}/${c.subs[1]}</span>
            </div>
            <div class="chips">${chips}</div>
            <div class="card-foot">
              ${memberAvatar(c.who, AVATAR_PX)}
              ${c.agent ? agentAvatar(c.agent) : ""}
              <span class="meta">${c.time}</span>
              ${right}
            </div>
          </article>`;
}

const columns = [
  {
    name: "待办",
    icon: statusIcon.todo,
    tone: "",
    cards: [
      { id: "MC-1247", prio: "high", title: "优化首屏渲染慢的问题", desc: "把首屏可见时间压到 1.2 秒内，先去掉阻塞渲染的请求。", subs: [2, 5], chips: ["性能", "前端"], who: "陈", time: "3 小时前", comments: 4, edits: 1 },
      { id: "MC-1243", prio: "medium", title: "导出智能体运行日志", desc: "按任务编号导出记录，附带每次工具调用的耗时。", subs: [0, 3], chips: ["运行时", { text: "智能体", cls: "agent", agentId: "squad-lead" }], who: "周", agent: "reviewer", time: "昨天 18:20", comments: 2 },
      { id: "MC-1239", prio: "low", title: "补齐看板空状态提示", desc: "列内没有任务时，给出新建入口和快捷键说明。", subs: [0, 2], chips: ["体验", "文案"], who: "林", time: "2 天前" },
    ],
  },
  {
    name: "进行中",
    icon: statusIcon.progress,
    tone: "warning",
    cards: [
      { id: "MC-1231", prio: "urgent", title: "运行时心跳检测接入", desc: "每 15 秒上报一次状态，超时后自动标记为离线。", subs: [4, 6], chips: ["运行时", { text: "橙子", cls: "agent", agentId: "mika" }], who: "周", agent: "mika", time: "刚刚更新", status: "进行中" },
      { id: "MC-1228", prio: "medium", title: "拆分任务详情侧边栏", desc: "属性区独立成组件，减少一次多余的重新渲染。", subs: [1, 4], chips: ["重构", "前端"], who: "陈", time: "1 小时前", comments: 6 },
      { id: "MC-1225", prio: "high", title: "移动端看板拖拽", desc: "长按进入拖拽状态，跨列移动时保持滚动位置。", subs: [4, 5], chips: ["移动端", "交互"], who: "林", time: "4 小时前" },
    ],
  },
  {
    name: "评审中",
    icon: statusIcon.review,
    tone: "success",
    cards: [
      { id: "MC-1216", prio: "medium", title: "技能市场评分与排序", desc: "评分数据接入后，按使用频次重新排列推荐列表。", subs: [5, 5], chips: ["技能", "排序"], who: "周", time: "6 小时前", comments: 3 },
      { id: "MC-1211", prio: "low", title: "收件箱批量已读", desc: "支持全选后一键已读，操作完成保留撤销入口。", subs: [2, 2], chips: ["收件箱"], who: "林", time: "昨天 09:40" },
      { id: "MC-1207", prio: "high", title: "智能体指令模板校验", desc: "提交前检查占位符，缺失时在输入框内给出提示。", subs: [3, 4], chips: ["智能体", "校验"], who: "陈", time: "昨天 15:02", comments: 8 },
    ],
  },
  {
    name: "已完成",
    icon: statusIcon.done,
    tone: "info",
    cards: [
      { id: "MC-1198", prio: "medium", title: "统一任务编号前缀", desc: "全站编号统一为 MC- 前缀，历史数据已经回填。", subs: [4, 4], chips: ["规范", "数据"], who: "周", time: "3 天前完成", comments: 5 },
      { id: "MC-1193", prio: "high", title: "修复筛选条件叠加失效", desc: "多个条件改为取交集，清除单项不再重置全部设置。", subs: [3, 3], chips: ["缺陷", "筛选"], who: "陈", time: "4 天前完成" },
      { id: "MC-1190", prio: "medium", title: "新建任务模板预填", desc: "按任务类型带出常用字段，并预填默认负责人。", subs: [3, 3], chips: ["体验", "模板"], who: "林", time: "5 天前完成" },
    ],
  },
  {
    name: "已归档",
    icon: statusIcon.archived,
    tone: "",
    cards: [
      { id: "MC-1184", prio: "low", title: "下线旧版列表视图", desc: "保留只读入口，两个月后彻底移除该页面。", subs: [2, 2], chips: ["清理"], who: "林", time: "上个月归档" },
      { id: "MC-1179", prio: "medium", title: "采集运行时资源占用", desc: "记录处理器与内存峰值，写入每日汇总记录。", subs: [4, 4], chips: ["运行时", "指标"], who: "周", time: "上个月归档" },
      { id: "MC-1172", prio: "low", title: "清理未引用的提示词片段", desc: "移除三个月内没有被引用的片段，减小打包体积。", subs: [2, 2], chips: ["清理", "智能体"], who: "陈", time: "上上个月归档" },
    ],
  },
];

const navItem = (icon, label, extra = "", active = false) =>
  `      <div class="nav-item${active ? " active" : ""}">\n        ${icon}\n        ${label}\n        ${extra}\n      </div>`;

const nav =
  navItem(ico.inbox, "收件箱", `<span class="nav-count">3</span>`) + "\n" +
  navItem(ico.mine, "我的任务", `<span class="nav-count">7</span>`) + "\n" +
  navItem(ico.tasks, "任务", `<span class="nav-count">15</span>`, true) + "\n" +
  navItem(ico.agents, "智能体") + "\n" +
  navItem(ico.runtimes, "运行时", `<span class="nav-count">2</span>`) + "\n" +
  navItem(ico.skills, "技能") + "\n" +
  navItem(ico.settings, "设置");

const columnHtml = columns
  .map(
    (col) => `      <div class="col"${col.tone ? ` data-tone="${col.tone}"` : ""}>
        <div class="col-head">
          ${col.icon}
          ${col.name}
          <span class="n">${col.cards.length}</span>
          <span class="plus">${ico.plus}</span>
        </div>
        <div class="cards">
${col.cards.map(card).join("\n\n")}

          <div class="add-task">${ico.plus}添加任务</div>
        </div>
      </div>`,
  )
  .join("\n\n");

const agentRows = AGENTS.map(
  (a) => `      <div class="agent-row${a.live ? " live" : ""}">
        ${agentAvatar(a.id)}
        <span class="agent-name">${a.name}</span>
        <span class="agent-state">${a.state}</span>
      </div>`,
).join("\n");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>morechat.co · 任务看板</title>
<style>${CSS}</style>
</head>
<body>
<div class="app">
  <!-- ======================= 左侧导航 ======================= -->
  <aside class="sidebar">
    <div class="ws">
      <div class="wordmark">morechat<span class="wm-tld">.co</span></div>
      ${ico.chevron}
    </div>
    <div class="ws-sub">示例工作区 · 14 位成员 · 6 个智能体</div>

    <nav class="nav">
${nav}
    </nav>

    <div class="agents">
      <div class="agents-head">智能体<span class="n">6</span></div>
${agentRows}
    </div>

    <div class="side-run">
      <div class="side-run-head"><span class="dot"></span>正在运行</div>
      <div class="side-run-now">
        ${agentAvatar("mika")}
        <span class="side-run-title">橙子 正在执行 MC-1231</span>
      </div>
      <div class="side-run-sub">已运行 4 分 12 秒 · 第 9 次工具调用</div>
      <div class="bar"><i></i></div>
    </div>

    <div class="side-user">
      ${memberAvatar("陈", 20)}
      <div>
        <div class="who">陈晨</div>
        <div class="plan">产品 · 在线</div>
      </div>
    </div>
  </aside>

  <!-- ======================= 主区域 ======================= -->
  <div class="main">
    <header class="toolbar">
      <span class="tb-title">任务</span>
      <span class="tb-sep"></span>
      <div class="seg">
        <span class="seg-item active">${ico.board}看板</span>
        <span class="seg-item">${ico.filter}筛选</span>
        <span class="seg-item">${ico.display}显示</span>
      </div>
      <div class="tb-right">
        <div class="search">${ico.search}搜索任务或编号</div>
        <div class="avatars">
          ${memberAvatar("林")}
          ${memberAvatar("周")}
          ${memberAvatar("陈")}
        </div>
        <div class="btn-new">${ico.plus}新建任务</div>
      </div>
    </header>

    <section class="board">
${columnHtml}
    </section>
  </div>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(here, "index.html"), html, "utf8");
console.log("wrote index.html", Buffer.byteLength(html, "utf8"), "bytes");

// 打印这次实际渲染用的身份，便于和 packages/ui/lib/agent-bot 的结果对账。
for (const a of AGENTS) {
  const hashed = capFor(a.id);
  const shown = resolveCap(a.id, a.avatarUrl);
  const palette = PALETTES.find((p) => p.id === shown.paletteId);
  console.log(
    `${a.id.padEnd(11)} ${a.name}  hash=${hashed.bodyId}/${hashed.paletteId}`,
    `shown=${shown.bodyId}/${shown.paletteId} ${palette.a}→${palette.b}`,
  );
}

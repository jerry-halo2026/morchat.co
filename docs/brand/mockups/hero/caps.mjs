// 从真实源码读取 cap-v1 身份契约，给首屏假看板算出与线上 ≤20px 层完全一致的头像外观。
//
// 数据不手抄：palettes.ts 的 17 套色板、bodies.ts 的 10 种形状、caps.ts 的
// BODY_ART（border-radius / clip-path / transform）都在运行时从仓库源码解析出来，
// 算术则逐行照抄 appearance.ts 的 capFor（h*31+cp，模 17 / 模 10）。
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ""));
const agentBotDir = path.resolve(here, "../../../../packages/ui/lib/agent-bot");

const read = (file) => fs.readFileSync(path.join(agentBotDir, file), "utf8");

/* ---------------------------- palettes.ts ---------------------------- */
const palettesSrc = read("palettes.ts");
const PALETTES = [...palettesSrc.matchAll(/\{\s*id:\s*"([^"]+)",\s*a:\s*"([^"]+)",\s*b:\s*"([^"]+)"\s*\}/g)].map(
  ([, id, a, b]) => ({ id, a, b }),
);
if (PALETTES.length !== 17) throw new Error(`expected 17 palettes, parsed ${PALETTES.length}`);

/* ----------------------------- bodies.ts ----------------------------- */
const bodiesSrc = read("bodies.ts");
const bodyBlock = bodiesSrc.match(/export const BODY_IDS\s*=\s*\[([\s\S]*?)\]\s*as const/);
if (!bodyBlock) throw new Error("BODY_IDS not found");
const BODY_IDS = [...bodyBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (BODY_IDS.length !== 10) throw new Error(`expected 10 bodies, parsed ${BODY_IDS.length}`);

/* ------------------------------ caps.ts ------------------------------ */
const capsSrc = read("caps.ts");
const artBlock = capsSrc.match(/const BODY_ART: Record<BodyId,[^=]*=\s*(\{[\s\S]*?\n\});/);
if (!artBlock) throw new Error("BODY_ART not found");
// BODY_ART 字面量是纯 JS 对象语法（只有字符串键值），直接求值，避免手抄形状参数。
const BODY_ART = new Function(`return (${artBlock[1]});`)();

/**
 * 静态瞳片：与 `packages/ui/lib/agent-bot/caps.ts` 的 `capEyeFrame` 同一组比例
 * （眼径 = 直径 20%，两瞳心距 = 直径 28%，瞳孔高度 = 直径 42%），换算到
 * 100×100 的 viewBox。
 *
 * 卡片头像现在按产品标准 32px 排（`AVATAR_PX`），这个比例在 32px 下就是线上
 * 静态帧的样子，所以不再放大 —— 首屏与线上逐值一致，不需要"为了看得见"另外调参。
 */
export const EYE = { diameter: 20, gap: 28, cy: 42 };

/** 纯色本体 + 深色小圆眼睛（参考实现是「实心本体 + 眼睛」，不是渐变）。 */
export function capBodyColor(palette) {
  return palette.a;
}

export function capEyes(palette) {
  const r = EYE.diameter / 2;
  const dx = EYE.gap / 2;
  return [50 - dx, 50 + dx]
    .map((cx) => `<circle cx="${cx}" cy="${EYE.cy}" r="${r}" fill="${palette.b}"/>`)
    .join("");
}

/** 逐行照抄 appearance.ts 的 capFor。 */
export function capFor(agentId) {
  const id = typeof agentId === "string" ? agentId : "";
  let h = 0;
  let runeLen = 0;
  for (const ch of id) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 17;
    runeLen += 1;
  }
  const h2 = (h * 31 + runeLen) % 10;
  return { paletteId: PALETTES[h].id, bodyId: BODY_IDS[h2] ?? BODY_IDS[0] };
}

/**
 * resolveCap（appearance.ts）的等价实现：持久化的 `cap:<body>:<palette>` 优先，
 * 其余情况回落到 capFor(agentId)。内置橙子线上存的就是 `cap:blob:amber`。
 */
export function resolveCap(agentId, avatarUrl) {
  if (typeof avatarUrl === "string" && avatarUrl.trim().startsWith("cap:")) {
    const [bodyId, paletteId] = avatarUrl.trim().slice(4).split(":");
    if (BODY_IDS.includes(bodyId) && PALETTES.some((p) => p.id === paletteId)) {
      return { paletteId, bodyId };
    }
  }
  return capFor(agentId);
}

/** capStaticStyle（caps.ts）的 CSS 文本形态：尺寸/纯色/内阴影/形状。 */
export function capStyle(agentId, sizePx, avatarUrl) {
  const cap = resolveCap(agentId, avatarUrl);
  const palette = PALETTES.find((p) => p.id === cap.paletteId);
  const art = BODY_ART[cap.bodyId] ?? BODY_ART.blob;
  const size = Math.round(sizePx);
  const parts = [
    `width:${size}px`,
    `height:${size}px`,
    `background-color:${capBodyColor(palette)}`,
    
    "flex:0 0 auto",
  ];
  if (art.borderRadius) parts.push(`border-radius:${art.borderRadius}`);
  if (art.clipPath) parts.push(`clip-path:${art.clipPath}`);
  if (art.transform) parts.push(`transform:${art.transform}`);
  return { cap, palette, art, css: parts.join(";") };
}

/**
 * 一个头像节点：class 保持 cap-avatar，外观全部内联，零外链、零字形。
 * 本体是一个纯色块，眼睛是叠在上面的 SVG 小圆（palette.b）。
 */
export function capAvatar(agentId, sizePx, extraClass = "", avatarUrl = null) {
  const { cap, css, palette } = capStyle(agentId, sizePx, avatarUrl);
  const cls = ["cap-avatar", extraClass].filter(Boolean).join(" ");
  return `<span class="${cls}" data-cap-body="${cap.bodyId}" data-cap-palette="${cap.paletteId}" style="${css}"><svg class="cap-eyes" viewBox="0 0 100 100" aria-hidden="true">${capEyes(palette)}</svg></span>`;
}

export { PALETTES, BODY_IDS, BODY_ART };

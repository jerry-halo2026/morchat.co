#!/usr/bin/env node
/**
 * capture.mjs — grab https://multica.ai/zh through CDP for the landing rebuild.
 *
 *   node docs/brand/reference/multica-ai-zh/capture.mjs [url]
 *
 * Needs a Chrome listening on 127.0.0.1:9222. Writes into this directory:
 *   *.png          segmented screenshots (hero / sections / footer) + full page
 *   structure.json sections, headings, copy, cards, fake-UI boxes, layout params
 *
 * No dependencies: Node 22 ships a global WebSocket and fetch.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE);
const URL_ARG = process.argv[2] ?? "https://multica.ai/zh";
const ENDPOINT = "http://127.0.0.1:9222";
const VIEWPORT = { width: 1440, height: 900 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Set();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve: ok, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? "")})`));
        else ok(msg.result);
        return;
      }
      for (const fn of this.handlers) fn(msg);
    });
  }

  static async connect() {
    const targets = await (await fetch(`${ENDPOINT}/json/list`)).json();
    // Prefer the browser-level socket's flatten mode: one socket, many sessions.
    const version = await (await fetch(`${ENDPOINT}/json/version`)).json();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((ok, bad) => {
      ws.addEventListener("open", ok, { once: true });
      ws.addEventListener("error", () => bad(new Error("ws error")), { once: true });
    });
    const cdp = new CDP(ws);
    cdp.existing = targets;
    return cdp;
  }

  on(fn) {
    this.handlers.add(fn);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((ok, bad) => {
      this.pending.set(id, { resolve: ok, reject: bad });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          bad(new Error(`${method} timed out`));
        }
      }, 60_000);
    });
  }
}

/** In-page extraction. Runs as one Runtime.evaluate expression, returns JSON. */
const EXTRACT = String.raw`(() => {
  const round = (n) => Math.round(n * 100) / 100;
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.x + window.scrollX), y: round(r.y + window.scrollY), w: round(r.width), h: round(r.height) };
  };
  const text = (el) => (el.innerText || "").replace(/\s+/g, " ").trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05;
  };
  const style = (el, keys) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const out = {};
    for (const k of keys) out[k] = cs[k];
    return out;
  };

  // --- top-level section stack -------------------------------------------
  const candidates = [...document.querySelectorAll("section, header, footer, main > div, main > section, body > div > section")]
    .filter((el) => visible(el) && el.getBoundingClientRect().height > 80 && !el.closest("nav, footer nav"));
  const sections = [];
  for (const el of candidates) {
    const r = rect(el);
    // keep only the outermost box at each vertical band
    if (sections.some((s) => Math.abs(s.rect.y - r.y) < 40 && s.rect.h >= r.h)) continue;
    const inner = candidates.filter((o) => o !== el && el.contains(o));
    if (inner.some((o) => Math.abs(rect(o).y - r.y) < 40 && rect(o).h > r.h * 0.9)) continue;
    sections.push({ el, rect: r });
  }
  sections.sort((a, b) => a.rect.y - b.rect.y);

  const sectionReport = sections.map((s, i) => {
    const el = s.el;
    const headings = [...el.querySelectorAll("h1,h2,h3,h4")]
      .filter(visible)
      .map((h) => ({ tag: h.tagName.toLowerCase(), text: text(h), rect: rect(h), style: style(h, ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "color", "textAlign"]) }));
    const buttons = [...el.querySelectorAll("a,button")]
      .filter((b) => visible(b) && text(b).length > 0 && text(b).length < 60)
      .map((b) => ({ text: text(b), href: b.getAttribute("href") || null, tag: b.tagName.toLowerCase(), rect: rect(b), style: style(b, ["backgroundColor", "color", "borderRadius", "borderColor", "borderWidth", "fontSize", "padding"]) }));
    const cards = [...el.querySelectorAll("[class*=card], [class*=Card], li")]
      .filter((c) => visible(c) && c.querySelector("h2,h3,h4,p") && rect(c).h > 60 && rect(c).h < 1400 && rect(c).w > 120)
      .slice(0, 40)
      .map((c) => ({
        rect: rect(c),
        title: text(c.querySelector("h2,h3,h4") || c).slice(0, 160),
        description: (() => { const p = c.querySelector("p"); return p ? text(p).slice(0, 400) : ""; })(),
        style: style(c, ["backgroundColor", "borderRadius", "borderColor", "borderWidth", "padding", "boxShadow"]),
      }));
    const images = [...el.querySelectorAll("img, svg[role=img], canvas, video")]
      .filter(visible)
      .slice(0, 30)
      .map((im) => ({ tag: im.tagName.toLowerCase(), src: im.getAttribute("src") || im.getAttribute("alt") || null, alt: im.getAttribute("alt") || null, rect: rect(im), style: style(im, ["borderRadius", "borderColor", "borderWidth", "objectFit"]) }));
    const bg = getComputedStyle(el).backgroundColor;
    return {
      index: i,
      rect: s.rect,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: (el.className || "").toString().slice(0, 220),
      background: bg,
      headings,
      buttons,
      cards,
      images,
      textSample: text(el).slice(0, 1200),
    };
  });

  // --- page skeleton ------------------------------------------------------
  const docHeadings = [...document.querySelectorAll("h1,h2,h3")]
    .filter(visible)
    .map((h) => ({ tag: h.tagName.toLowerCase(), text: text(h).slice(0, 200), y: round(h.getBoundingClientRect().top + window.scrollY) }));

  const nav = [...document.querySelectorAll("header a, nav a")]
    .filter(visible)
    .map((a) => ({ text: text(a).slice(0, 60), href: a.getAttribute("href") || null }))
    .filter((a) => a.text);

  const links = [...document.querySelectorAll("a[href]")]
    .filter(visible)
    .map((a) => text(a).slice(0, 80))
    .filter(Boolean);

  // --- layout parameters --------------------------------------------------
  const widest = [...document.querySelectorAll("body *")]
    .filter((el) => {
      const cs = getComputedStyle(el);
      return visible(el) && (cs.maxWidth !== "none" || el.className?.toString?.().includes?.("container"));
    })
    .slice(0, 400)
    .map((el) => ({ className: (el.className || "").toString().slice(0, 160), width: round(el.getBoundingClientRect().width), maxWidth: getComputedStyle(el).maxWidth }));

  const grids = [...document.querySelectorAll("body *")]
    .filter((el) => visible(el) && getComputedStyle(el).display.includes("grid"))
    .slice(0, 120)
    .map((el) => {
      const cs = getComputedStyle(el);
      return {
        className: (el.className || "").toString().slice(0, 120),
        gridTemplateColumns: cs.gridTemplateColumns,
        columnGap: cs.columnGap,
        rowGap: cs.rowGap,
        width: round(el.getBoundingClientRect().width),
        childCount: el.children.length,
      };
    });

  const fonts = {};
  for (const el of document.querySelectorAll("h1,h2,h3,h4,p,a,button,span,li")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const key = cs.fontSize + "|" + cs.fontWeight + "|" + cs.lineHeight + "|" + cs.letterSpacing + "|" + cs.fontFamily.split(",")[0];
    fonts[key] = (fonts[key] || 0) + 1;
  }

  const radii = {};
  const colors = {};
  const borders = {};
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.borderRadius !== "0px") radii[cs.borderRadius] = (radii[cs.borderRadius] || 0) + 1;
    if (cs.backgroundColor !== "rgba(0, 0, 0, 0)") colors[cs.backgroundColor] = (colors[cs.backgroundColor] || 0) + 1;
    if (cs.borderTopWidth !== "0px" && cs.borderTopStyle !== "none") borders[cs.borderTopColor + " " + cs.borderTopWidth] = (borders[cs.borderTopColor + " " + cs.borderTopWidth] || 0) + 1;
    if (cs.color) colors["fg:" + cs.color] = (colors["fg:" + cs.color] || 0) + 1;
  }
  const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ value: k, count: v }));

  // vertical rhythm between sections
  const rhythm = [];
  for (let i = 1; i < sections.length; i++) {
    rhythm.push(round(sections[i].rect.y - (sections[i - 1].rect.y + sections[i - 1].rect.h)));
  }

  // background switches down the page
  const bands = sectionReport.map((s) => ({ y: s.rect.y, h: s.rect.h, bg: s.background }));

  // The site scrolls inside a wrapper, not on documentElement: record the real
  // scroll container so the screenshot pass can grow the viewport instead of
  // relying on captureBeyondViewport (which renders that wrapper blank).
  const scrollers = [...document.querySelectorAll("div, main, body")]
    .filter((el) => el.scrollHeight > el.clientHeight + 40 && Math.abs(el.getBoundingClientRect().width - innerWidth) < 40)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: (el.className || "").toString().slice(0, 160),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: getComputedStyle(el).overflowY,
      isDocument: el === document.scrollingElement || el === document.documentElement || el === document.body,
    }))
    .sort((a, b) => b.scrollHeight - a.scrollHeight);

  return JSON.stringify({
    url: location.href,
    title: document.title,
    lang: document.documentElement.lang,
    docHeight: round(document.documentElement.scrollHeight),
    scrollers: scrollers.slice(0, 5),
    contentHeight: Math.max(...scrollers.map((s) => s.scrollHeight), document.documentElement.scrollHeight),
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    docHeadings,
    nav,
    linkCount: links.length,
    sections: sectionReport,
    rhythm,
    bands,
    layout: {
      widest: widest.slice(0, 40),
      grids,
      topFonts: top(fonts, 22),
      topRadii: top(radii, 12),
      topColors: top(colors, 16),
      topBorders: top(borders, 12),
    },
  });
})()`;

const slugify = (value, fallback) =>
  (value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || fallback;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const cdp = await CDP.connect();

  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", background: false });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

  let inflight = 0;
  let lastActivity = Date.now();
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Network.requestWillBeSent") {
      inflight++;
      lastActivity = Date.now();
    } else if (msg.method === "Network.loadingFinished" || msg.method === "Network.loadingFailed") {
      inflight = Math.max(0, inflight - 1);
      lastActivity = Date.now();
    }
  });

  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  // Chinese copy renders in a Latin-first stack on some boxes; keep the real UA
  // so the site serves the same bundle a browser would get.
  await cdp.send("Page.navigate", { url: URL_ARG }, sessionId);

  // network idle: no in-flight request for 1.2s, hard cap 45s
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    await sleep(250);
    if (inflight === 0 && Date.now() - lastActivity > 1200 && Date.now() - started > 1500) break;
  }
  await sleep(800);

  // scroll the whole page once so lazy sections mount, then return to the top
  await cdp.send(
    "Runtime.evaluate",
    {
      awaitPromise: true,
      expression: `(async () => {
        const step = Math.floor(innerHeight * 0.8);
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 220));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 600));
        return document.documentElement.scrollHeight;
      })()`,
    },
    sessionId,
  );
  await sleep(1200);

  const { result } = await cdp.send(
    "Runtime.evaluate",
    { expression: EXTRACT, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  const structure = JSON.parse(result.value);
  writeFileSync(join(OUT, "structure.json"), `${JSON.stringify(structure, null, 2)}\n`, "utf8");

  async function shot(file, clip) {
    const params = { format: "png", captureBeyondViewport: true, fromSurface: true };
    if (clip) params.clip = { ...clip, scale: 1 };
    const res = await cdp.send("Page.captureScreenshot", params, sessionId);
    writeFileSync(join(OUT, file), Buffer.from(res.data, "base64"), "base64");
    return file;
  }

  const shots = [];
  const pageWidth = VIEWPORT.width;

  // 1) what a visitor actually sees on arrival, at the real 1440x900 viewport
  shots.push(await shot("01-hero-viewport.png", null));

  // 2) grow the viewport to the full content height so the inner scroll wrapper
  //    lays out completely; clips then map 1:1 onto content coordinates.
  const pageHeight = Math.min(Math.ceil(structure.contentHeight), 24000);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: pageWidth, height: pageHeight, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await sleep(1500);
  await cdp.send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const all = [document.scrollingElement, document.documentElement, document.body,
          ...document.querySelectorAll("div, main")];
        for (const el of all) { if (!el) continue; try { el.scrollTop = 0; } catch {} }
        window.scrollTo(0, 0);
        return true;
      })()`,
    },
    sessionId,
  );
  await sleep(1000);

  shots.push(await shot("00-full.png", { x: 0, y: 0, width: pageWidth, height: pageHeight }));

  const wanted = structure.sections.filter((s) => s.rect.h >= 120);
  let n = 0;
  for (const s of wanted) {
    n += 1;
    const heading = s.headings[0]?.text ?? s.id ?? `section-${n}`;
    const name = `${String(n).padStart(2, "0")}-${slugify(heading, `section-${n}`)}.png`;
    const top = Math.max(0, Math.round(s.rect.y));
    const height = Math.min(Math.round(s.rect.h), 6000, pageHeight - top);
    if (height < 40) continue;
    shots.push(await shot(name, { x: 0, y: top, width: pageWidth, height }));
  }

  await cdp.send("Emulation.clearDeviceMetricsOverride", {}, sessionId);

  const summary = {
    url: structure.url,
    title: structure.title,
    lang: structure.lang,
    docHeight: structure.docHeight,
    pageWidth,
    sections: structure.sections.length,
    shots,
    headings: structure.docHeadings,
  };
  writeFileSync(join(OUT, "capture-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(summary, null, 2));
  cdp.ws.close();
}

main().catch((error) => {
  console.error("capture failed:", error.message);
  process.exit(1);
});

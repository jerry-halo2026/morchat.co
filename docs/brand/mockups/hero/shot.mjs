// CDP 截图脚本：9222 端口的 Chrome，1320x890 视口，DPR 2 -> 2640x1780 PNG
import fs from "node:fs/promises";
import path from "node:path";

const CDP = "http://127.0.0.1:9222";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ""));
const pageUrl = "file:///" + path.resolve(here, "index.html").replace(/\\/g, "/");
const outPng = path.resolve(here, "hero-2640x1780.png");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const created = await fetch(`${CDP}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" });
  if (!created.ok) throw new Error(`/json/new failed: ${created.status} ${await created.text()}`);
  const target = await created.json();
  console.log("target:", target.id, pageUrl);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  const loaded = new Promise((resolve) => {
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === "Page.loadEventFired") resolve();
    };
    ws.addEventListener("message", onMsg);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.code}: ${msg.error.message}`)) : resolve(msg.result);
    }
  });

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1320,
    height: 890,
    deviceScaleFactor: 2,
    mobile: false,
    screenWidth: 1320,
    screenHeight: 890,
  });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await send("Page.navigate", { url: pageUrl });
  await Promise.race([loaded, sleep(8000)]);
  await send("Runtime.evaluate", { expression: "document.fonts.ready.then(()=>true)", awaitPromise: true });
  await sleep(600);

  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
    optimizeForSpeed: false,
  });
  const buf = Buffer.from(shot.data, "base64");
  await fs.writeFile(outPng, buf);
  console.log("png bytes:", buf.length, "->", outPng);

  ws.close();
  await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});

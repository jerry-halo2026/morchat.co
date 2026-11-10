// 看落地页首屏实际效果（本地 3000 端口的 dev server）
import fs from "node:fs/promises";
import path from "node:path";

const CDP = "http://127.0.0.1:9222";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ""));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const created = await fetch(`${CDP}/json/new?${encodeURIComponent("http://localhost:3000/")}`, { method: "PUT" });
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

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1320, height: 1320, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(9000);
const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
const out = path.join(here, "page-preview.png");
await fs.writeFile(out, Buffer.from(shot.data, "base64"));
console.log("saved", out);
ws.close();
await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});

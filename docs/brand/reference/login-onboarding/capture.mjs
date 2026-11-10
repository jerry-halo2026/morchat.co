// CDP capture harness for the login → onboarding handoff reference shots.
//
// Usage (dev web on :3000, Chrome started with --remote-debugging-port=9222):
//   node docs/brand/reference/login-onboarding/capture.mjs \
//     --url http://127.0.0.1:3000/login \
//     --out docs/brand/reference/login-onboarding/login-before.png \
//     --width 1440 --height 900 --delay 1500 \
//     [--eval "document.querySelector('[data-login-stage]').dataset.loginHandoff='out'"] \
//     [--eval-delay 90]
//
// `--eval` runs after the page settles; `--eval-delay` is the wait between the
// expression and the screenshot, which is how the mid-transition frame is
// grabbed. Node 22+ ships a global WebSocket, so there is no dependency here.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const url = args.get("url") ?? "http://127.0.0.1:3000/login";
const out = args.get("out");
const width = Number(args.get("width") ?? 1440);
const height = Number(args.get("height") ?? 900);
const settle = Number(args.get("delay") ?? 1500);
const expression = args.get("eval");
const evalDelay = Number(args.get("eval-delay") ?? 90);
const cdp = args.get("cdp") ?? "http://127.0.0.1:9222";

if (!out) {
  console.error("missing --out");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const target = await (
  await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })
).json();

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const waiters = [];

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (waiters[i].method === msg.method) {
      waiters[i].resolve(msg.params);
      waiters.splice(i, 1);
    }
  }
});

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function once(method) {
  return new Promise((resolve) => waiters.push({ method, resolve }));
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (args.get("reduced-motion") === "1") {
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  }

  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url });
  await loaded;
  await sleep(settle);

  if (expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log("eval:", JSON.stringify(result.result?.value ?? result.result?.description ?? null));
    await sleep(evalDelay);
  }

  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log(`wrote ${out} (${width}x${height})`);
} finally {
  ws.close();
  await fetch(`${cdp}/json/close/${target.id}`).catch(() => {});
}

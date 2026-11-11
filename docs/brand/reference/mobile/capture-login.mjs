// Reference shot of the Expo mobile app's login screen, rendered from the
// static web export (`expo export --platform web`).
//
// The export is a single-page bundle (`dist/index.html`), so this script also
// serves `dist/` with SPA fallback — every unknown path returns index.html and
// expo-router resolves `/login` on the client.
//
// Usage (from the repo root):
//   node docs/brand/reference/mobile/capture-login.mjs \
//     --dir apps/mobile/dist \
//     --out docs/brand/reference/mobile/login.png \
//     --path /login --width 390 --height 844 --scale 2
//
// Chromium: uses Playwright's bundled browser when installed, otherwise the
// system Edge (`--channel msedge`), otherwise system Chrome.

import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const root = resolve(args.get("dir") ?? "apps/mobile/dist");
const out = args.get("out");
const route = args.get("path") ?? "/login";
const width = Number(args.get("width") ?? 390);
const height = Number(args.get("height") ?? 844);
const scale = Number(args.get("scale") ?? 2);
const settle = Number(args.get("delay") ?? 4000);
const port = Number(args.get("port") ?? 8099);

if (!out) {
  console.error("missing --out");
  process.exit(1);
}
if (!existsSync(join(root, "index.html"))) {
  console.error(`no index.html in ${root} — run the web export first`);
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  const candidate = join(root, rel);
  const isFile =
    candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile();
  const file = isFile ? candidate : join(root, "index.html");
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
});

await new Promise((done) => server.listen(port, "127.0.0.1", done));

const { chromium } = await import("playwright");
let browser = null;
for (const options of [{}, { channel: "msedge" }, { channel: "chrome" }]) {
  try {
    browser = await chromium.launch(options);
    console.log("browser:", options.channel ?? "bundled chromium");
    break;
  } catch (error) {
    console.log(`launch ${options.channel ?? "bundled"} failed: ${error.message.split("\n")[0]}`);
  }
}
if (!browser) {
  server.close();
  console.error("no chromium available");
  process.exit(1);
}

try {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? String(error)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "load" });
  await page.waitForTimeout(settle);

  const shot = join(out);
  mkdirSync(dirname(resolve(shot)), { recursive: true });
  await page.screenshot({ path: shot });

  const probe = await page.evaluate(() => ({
    path: location.pathname,
    text: (document.getElementById("root")?.innerText ?? "").slice(0, 400),
  }));
  console.log("path:", probe.path);
  console.log("text:", JSON.stringify(probe.text));
  if (errors.length) console.log("console errors:", errors.slice(0, 5));
  console.log(`wrote ${shot} (${width}x${height} @${scale}x)`);
} finally {
  await browser.close();
  server.close();
}

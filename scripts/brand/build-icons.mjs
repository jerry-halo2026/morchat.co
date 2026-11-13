// Regenerate the app icons from apps/web/app/icon.svg, which is the three-bar mark.
//
// `scripts/brand/generate.mjs` cannot do this: it builds the tile from `starPath` and
// `iconStar`, symbols `morechat-brand.ts` no longer exports, so it throws before it
// writes anything. This script does the part that matters now - round-trip the SVG
// through a real Chromium at every size the ICO carries - and leaves the wordmark
// assets to whoever revives generate.mjs.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = "D:/dev/morchat.co";
const svg = readFileSync(join(ROOT, "apps/web/app/icon.svg"), "utf8");
const OUT_PNG = join(ROOT, "apps/desktop/build/icon.png");
const OUT_ICO = join(ROOT, "apps/desktop/build/icon.ico");
const WEB_ICON = join(ROOT, "apps/web/app/icon.png");
const WEB_APPLE = join(ROOT, "apps/web/app/apple-icon.png");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const render = async (page, size) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`,
    { waitUntil: "load" },
  );
  // The SVG is authored at 100x100; scale it to the requested square.
  await page.addStyleTag({ content: `svg{width:${size}px;height:${size}px;display:block}` });
  return page.screenshot({ omitBackground: true });
};

/** One ICO holding every size as a PNG entry. */
const buildIco = (pngs) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + 16 * pngs.length;
  pngs.forEach(({ size, data }, index) => {
    const at = index * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, at);
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1);
    dir.writeUInt8(0, at + 2);
    dir.writeUInt8(0, at + 3);
    dir.writeUInt16LE(1, at + 4);
    dir.writeUInt16LE(32, at + 6);
    dir.writeUInt32LE(data.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
};

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage();

const big = await render(page, 1024);
writeFileSync(OUT_PNG, big);
console.log(`desktop icon.png 1024x1024`);

writeFileSync(WEB_ICON, await render(page, 512));
console.log(`web icon.png 512x512`);

writeFileSync(WEB_APPLE, await render(page, 180));
console.log(`web apple-icon.png 180x180`);

const entries = [];
for (const size of ICO_SIZES) {
  entries.push({ size, data: await render(page, size) });
}
writeFileSync(OUT_ICO, buildIco(entries));
console.log(`desktop icon.ico ${ICO_SIZES.join("/")}`);

await browser.close();
console.log("done");

// PNG -> webp(q88) 2640x1781 写入 apps/web/public/images/landing-hero-v7.webp
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ""));
const repo = path.resolve(here, "../../../..");
const require = createRequire(import.meta.url);
const sharp = require(
  path.join(repo, "node_modules/.pnpm/sharp@0.35.5_@types+node@25.5.0/node_modules/sharp"),
);

const src = path.join(here, "hero-2640x1780.png");
const out = path.join(repo, "apps/web/public/images/landing-hero-v7.webp");

const img = sharp(src);
const meta = await img.metadata();
console.log("src:", meta.width, "x", meta.height, meta.format);

// 2640x1780 -> 2640x1781：底部补 1 行（复制边缘像素），保持 2640x1781 的版面比例。
const buf = await sharp(src)
  .extend({ bottom: 1, extendWith: "copy" })
  .webp({ quality: 88, effort: 6 })
  .toBuffer();

await fs.writeFile(out, buf);
const outMeta = await sharp(out).metadata();
console.log("out:", outMeta.width, "x", outMeta.height, outMeta.format, "bytes:", buf.length);

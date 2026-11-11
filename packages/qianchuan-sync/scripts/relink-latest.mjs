#!/usr/bin/env node
// 从 versions 版本链重建 latest 指针（非破坏性：不动任何版本文件）
//
// 场景：latest 被误删、或 prune 后 latest 与版本链失联，此时 export-flat 会读不到数据。
// 与 prune-raw.mjs 的区别：prune 会删旧版本（治理磁盘），本脚本只做“最新版本 → latest”的链接。
//
// 用法：node scripts/relink-latest.mjs [--dry-run]
import { readdirSync, existsSync, linkSync, copyFileSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";

const DRY = process.argv.includes("--dry-run");
const RAW_DIR = join(PKG, "data", "raw");

let linked = 0, skipped = 0, noVer = 0;

for (const src of readdirSync(RAW_DIR)) {
  const srcDir = join(RAW_DIR, src);
  const verDir = join(srcDir, "versions");
  if (!existsSync(verDir)) continue;

  // name → 最新版本文件（按文件名里的 14 位时间戳，不依赖 mtime）
  const newest = new Map();
  for (const f of readdirSync(verDir).filter((x) => x.endsWith(".json"))) {
    const i = f.lastIndexOf("--");
    if (i < 0) continue;
    const name = f.slice(0, i);
    const m = f.slice(i).match(/\d{14}/);
    const ts = m ? m[0] : "";
    const cur = newest.get(name);
    if (!cur || ts > cur.ts) newest.set(name, { ts, f });
  }

  for (const [name, { f, ts }] of newest) {
    const latest = join(srcDir, `${name}.json`);
    if (existsSync(latest)) { skipped++; continue; }
    if (!ts) { noVer++; continue; }
    if (DRY) { linked++; continue; }
    const verPath = join(verDir, f);
    try {
      linkSync(verPath, latest);            // 同盘硬链接，不占额外空间
    } catch {
      copyFileSync(verPath, latest);        // 跨卷/权限不足则退化为复制
    }
    linked++;
  }
}

console.log(`${DRY ? "[dry-run] " : ""}重建 latest: ${linked} 个 | 已存在跳过: ${skipped} | 无版本: ${noVer}`);

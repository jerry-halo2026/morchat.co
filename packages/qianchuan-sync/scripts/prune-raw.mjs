#!/usr/bin/env node
// raw 缓存磁盘治理（2026-11-07 新增）
//
// 背景：runner 原先每次调用都无脑写一个新时间戳版本，从不清理。实测 3958 个版本
// 文件只对应约 700 个唯一来源（如 uni_video 的 45 个账号被存了 141 份，其中 96 份
// 是同一数据的重复快照），白占 2.7G。同时根目录 latest 与 versions 最新份是两份
// 完整副本，等于每份数据存两遍。
//
// 本脚本做三件事：
//   ① versions 每个 name 只保留最近 N 份（默认 1），其余删除
//   ② 保留的那份与根目录 latest 做硬链接对齐 —— 同一 inode 不占额外空间
//   ③ （可选 --strip）重写素材类快照，剥离已过期的签名 URL
//
// 用法：
//   node scripts/prune-raw.mjs --dry-run        # 只看能省多少，不动文件
//   node scripts/prune-raw.mjs                  # 执行
//   node scripts/prune-raw.mjs --keep 3         # 每个 name 留 3 份
//   node scripts/prune-raw.mjs --strip          # 顺带剥离素材签名 URL
//   node scripts/prune-raw.mjs --with-backup    # 顺带删 flat_backup_* 旧备份

import { readdirSync, statSync, unlinkSync, existsSync, linkSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = join(PKG, "data", "raw");
const DATA_DIR = join(PKG, "data");

// argv 归一化：--k=v → { k: "v" }（本项目历史上被 --day= 这类写法坑过）
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const eq = a.indexOf("=");
  if (eq > -1) args[a.slice(2, eq)] = a.slice(eq + 1);
  else if (process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) { args[a.slice(2)] = process.argv[i + 1]; i++; }
  else args[a.slice(2)] = true;
}

const DRY = !!args["dry-run"];
const KEEP = Number(args.keep || 1);
const STRIP = !!args.strip;
const WITH_BACKUP = !!args["with-backup"];

const mb = (n) => (n / 1048576).toFixed(1);
let freedTotal = 0, removedTotal = 0;

/** 文件名 → 唯一来源名：`uni_video-1234--20261107105428..json` → `uni_video-1234` */
function baseName(f) {
  return f.replace(/--\d[\d.]*\.json$/, "");
}

/** 剥离签名 URL（与 core/runner.mjs 的 stripSigned 同一规则） */
function stripSigned(node) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const v = node[i];
      if (typeof v === "string") {
        if (v.length > 200 && (v.includes("x-expires=") || v.includes("x-signature=")))
          node[i] = `[signed-url-omitted:${v.length}B]`;
      } else if (v && typeof v === "object") stripSigned(v);
    }
    return;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === "string") {
        if (v.length > 200 && (v.includes("x-expires=") || v.includes("x-signature=")))
          node[k] = `[signed-url-omitted:${v.length}B]`;
      } else if (v && typeof v === "object") stripSigned(v);
    }
  }
}

/** 两个路径是否已指向同一 inode */
function sameFile(a, b) {
  try {
    const sa = statSync(a), sb = statSync(b);
    return sa.ino === sb.ino && sa.dev === sb.dev && sa.ino !== 0;
  } catch { return false; }
}

console.log(`\n🗂  raw 缓存治理${DRY ? "（演练模式，不删任何文件）" : ""}  每个来源保留 ${KEEP} 份\n`);

for (const src of readdirSync(RAW_DIR)) {
  const srcDir = join(RAW_DIR, src);
  if (!statSync(srcDir).isDirectory()) continue;
  const verDir = join(srcDir, "versions");
  if (!existsSync(verDir)) continue;

  const all = readdirSync(verDir).filter((f) => f.endsWith(".json"));
  if (!all.length) continue;

  // 按来源名分组
  const groups = new Map();
  for (const f of all) {
    const key = baseName(f);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ f, m: statSync(join(verDir, f)).mtimeMs, s: statSync(join(verDir, f)).size });
  }

  let srcFreed = 0, srcRemoved = 0;
  for (const [key, list] of groups) {
    list.sort((a, b) => b.m - a.m);
    const keep = list.slice(0, KEEP);
    const drop = list.slice(KEEP);

    // ① 删除超额版本
    for (const d of drop) {
      srcFreed += d.s; srcRemoved++;
      if (!DRY) { try { unlinkSync(join(verDir, d.f)); } catch { /* 并发删除 */ } }
    }

    // ② 保留份与根目录 latest 对齐为硬链接（省掉「每份数据存两遍」的重复）
    const latest = join(srcDir, `${key}.json`);
    if (keep[0] && existsSync(latest) && !sameFile(join(verDir, keep[0].f), latest)) {
      const verPath = join(verDir, keep[0].f);
      const a = statSync(verPath), b = statSync(latest);
      // 以 mtime 更晚的为权威内容
      const [authoritative, target] = a.mtimeMs >= b.mtimeMs ? [verPath, latest] : [latest, verPath];
      srcFreed += Math.min(a.size, b.size); // 对齐后可省掉一份
      if (!DRY) {
        try {
          unlinkSync(target);
          linkSync(authoritative, target);
        } catch {
          // 跨卷或权限不足：保持两份独立文件，不报错（数据安全优先）
          if (!existsSync(target)) writeFileSync(target, readFileSync(authoritative));
        }
      }
    }
  }

  // ③ 剥离签名 URL（仅素材类，且只在非演练时真正重写）
  let stripSaved = 0;
  if (STRIP && /material/.test(src)) {
    for (const f of readdirSync(srcDir).filter((x) => x.endsWith(".json"))) {
      const p = join(srcDir, f);
      try {
        const before = statSync(p).size;
        if (!DRY) {
          const obj = JSON.parse(readFileSync(p, "utf8"));
          stripSigned(obj);
          writeFileSync(p, JSON.stringify(obj), "utf8");
        }
        stripSaved += Math.max(0, before - statSync(p).size);
      } catch { /* 单文件异常不影响整体 */ }
    }
  }

  const total = srcFreed + stripSaved;
  if (srcRemoved || stripSaved) {
    console.log(`  ${src.padEnd(14)} 删版本 ${String(srcRemoved).padStart(4)} 个  ${mb(total).padStart(8)} MB${stripSaved ? `（含剥离 URL ${mb(stripSaved)} MB）` : ""}`);
  }
  freedTotal += total;
  removedTotal += srcRemoved;
}

// ④ 旧备份
if (WITH_BACKUP) {
  for (const d of readdirSync(DATA_DIR)) {
    if (!/^flat_backup_/.test(d)) continue;
    const p = join(DATA_DIR, d);
    let s = 0;
    for (const f of readdirSync(p)) { try { s += statSync(join(p, f)).size; } catch { /* skip */ } }
    console.log(`  ${d.padEnd(24)} 删除旧备份          ${mb(s).padStart(8)} MB`);
    if (!DRY) {
      for (const f of readdirSync(p)) { try { unlinkSync(join(p, f)); } catch { /* skip */ } }
      try { unlinkSync(p); } catch { /* 非空目录忽略 */ }
    }
    freedTotal += s;
  }
}

console.log(`\n  ${DRY ? "预计可回收" : "已回收"} ${mb(freedTotal)} MB，清理版本文件 ${removedTotal} 个`);
if (DRY) console.log("  去掉 --dry-run 即可执行\n");

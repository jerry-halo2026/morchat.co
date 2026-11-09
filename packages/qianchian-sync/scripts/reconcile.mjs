#!/usr/bin/env node
// 账户口径 vs 素材口径 对账
// 用法：node scripts/reconcile.mjs [--day 2026-11-07]
// 说明：recon.csv 由 `node run.mjs --incremental --source recon` 生成，
//       窗口是「day-7 .. day」（与增量报表窗口一致），所以这里按同一窗口汇总素材表。
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const FLAT = join(PKG, "data", "flat");
// 参数归一化：把 --k=v 展开成 --k v。
// 此前多数脚本只认空格写法，用 --day=2026-11-06 会静默走默认值 —— 与 --source=xx 是同一类 bug。
const args = process.argv.slice(2).flatMap((a) =>
  a.startsWith("--") && a.includes("=")
    ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)]
    : [a]);
const day = args.includes("--day") ? args[args.indexOf("--day") + 1] : new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

function minusDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
// 窗口必须与 recon 跑批那次完全一致，否则账户口径多算一天、素材口径少算一天，
// 会凭空造出 3% 的「假缺口」。
//   daily 模式：run.mjs 用 window = day-8..day（9 天）
//   incremental：reportWindow = day-7..day（8 天）
// 所以这里不再写死，默认按 daily（day-8），可用 --from/--to 覆盖。
const argFrom = args.includes("--from") ? args[args.indexOf("--from") + 1] : null;
const argTo = args.includes("--to") ? args[args.indexOf("--to") + 1] : null;
const FROM = argFrom || minusDays(day, 8), TO = argTo || day;

function readCsv(name) {
  const p = join(FLAT, name);
  if (!existsSync(p)) return [];
  const txt = readFileSync(p, "utf8");
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (ch !== "\r") f += ch;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

// 素材口径：直播(画面) + 直播(视频引流) + 商品全域视频 + 商品全域图文
const SRC = [
  ["uni_live", "stat_cost_for_roi2_fork"],
  ["live_video", "stat_cost_for_roi2"],
  ["uni_video", "stat_cost_for_roi2"],
  ["uni_image", "stat_cost_for_roi2"],
];
const mat = new Map(); // acct -> {live, videoLive, video, image}
for (const [src, costField] of SRC) {
  for (const r of readCsv(`${src}.csv`)) {
    if (r.stat_date < FROM || r.stat_date > TO) continue;
    const k = r.account_id;
    const cur = mat.get(k) || { live: 0, liveVideo: 0, video: 0, image: 0, overall: 0 };
    const v = num(r[costField]);
    if (src === "uni_live") cur.live += v;
    else if (src === "live_video") cur.liveVideo += v;
    else if (src === "uni_video") cur.video += v;
    else cur.image += v;
    mat.set(k, cur);
  }
}

// 补差集：OVERALL_ROI_* 是另一套口径，填的正是素材线覆盖不到的那部分。
// 但它内部 p-product / p-plan / p-aweme 是「同一批消耗的三种切法」（实测 7278/7282/7096，
// 三者近似相等），绝不能相加 —— 只能选一个视角。这里取商品视角 p-product 与直播抖音号 l-aweme。
// 验证：欧海涵 素材线 14835.72 + p-product 1019.03 = 15854.75 ≈ 账户口径 15854.85（互补不重叠）
const ovFile = readCsv("overall.csv");
for (const r of ovFile) {
  if (r.stat_date < FROM || r.stat_date > TO) continue;
  if (r.topic_tag !== "p-product" && r.topic_tag !== "l-aweme") continue;
  const k = r.account_id;
  const cur = mat.get(k) || { live: 0, liveVideo: 0, video: 0, image: 0, overall: 0 };
  cur.overall = (cur.overall || 0) + num(r.stat_cost_for_overall_roi2);
  mat.set(k, cur);
}

const recon = readCsv("recon.csv");
if (!recon.length) {
  console.error("recon.csv 不存在，先跑：node run.mjs --incremental --source recon");
  process.exit(1);
}
const byAcct = new Map();
for (const r of recon) {
  const k = r.account_id;
  // 2026-11-09 v3：recon 接口换 all_promotion/get，goal ∈ {UNI, OVERALL}，账户总口径 = 两者之和
  const cur = byAcct.get(k) || { name: r.account_name, all: 0, live: 0, mat: mat.get(k) || { live: 0, liveVideo: 0, video: 0, image: 0, overall: 0 } };
  cur.all += num(r.acct_cost);
  byAcct.set(k, cur);
}

const rows = [...byAcct.entries()].map(([id, v]) => {
  const m = v.mat;
  const matSum = m.live + m.liveVideo + m.video + m.image + (m.overall || 0);
  return { id, name: v.name, acct: v.all, acctLive: v.live, matSum, gap: v.all - matSum, m };
}).sort((a, b) => b.gap - a.gap);

const T = rows.reduce((s, r) => ({ acct: s.acct + r.acct, mat: s.mat + r.matSum, gap: s.gap + r.gap }), { acct: 0, mat: 0, gap: 0 });

console.log(`对账窗口 ${FROM} .. ${TO}`);
console.log(`（须与 recon 跑批窗口一致；mismatch 会造出假缺口）`);
// T+0 陷阱（2026-11-07 实测）：账户口径接口实时更新，素材维度报表当天回填慢。
// 含当天时缺口会明显偏大 —— 欧海涵含 11-07 缺 6,515，排除后只剩 3,172，其中当天贡献 6,458。
// 王栋/徐鹏/李晓瑞/张苗 排除当日后缺口直接归零。所以判断「是否漏数」必须用 T-1 及之前的窗口。
{
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  if (TO >= today) console.log(`⚠️ 窗口含今天(${today})：缺口里混着 T+0 未回填量，不要当成漏数\n`);
  else console.log("");
}
console.log("账户口径    素材口径      缺口    缺口%");
console.log(`${T.acct.toFixed(0).padStart(9)} ${T.mat.toFixed(0).padStart(11)} ${T.gap.toFixed(0).padStart(9)} ${(T.acct ? (T.gap / T.acct) * 100 : 0).toFixed(1).padStart(6)}%`);
console.log("\n缺口 Top10：");
console.log("账户".padEnd(24) + "账户口径".padStart(10) + "素材口径".padStart(10) + "缺口".padStart(9) + "缺口%".padStart(8));
let flagged = 0;
for (const r of rows.slice(0, 10)) {
  if (r.acct <= 0) continue;
  const pct = (r.gap / r.acct) * 100;
  console.log(r.name.slice(0, 22).padEnd(24) + r.acct.toFixed(0).padStart(10) + r.matSum.toFixed(0).padStart(10) + r.gap.toFixed(0).padStart(9) + pct.toFixed(0).padStart(7) + "%");
}
for (const r of rows) if (r.acct > 0 && r.gap / r.acct > 0.03) flagged++;
console.log(`\n缺口 >3% 的账户：${flagged} 个 → 通常是「未授权抖音号/直播间」，需在千川后台做抖音号授权后重拉`);

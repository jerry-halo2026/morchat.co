#!/usr/bin/env node
// 量化：补上 C（商品维度）与 D（全域口径）两套主题后，账户口径覆盖能到多少
//
// 背景：现有 4 条素材线只覆盖 A（直播素材线）与 B（商品素材线）。
// 实测发现还有两套独立口径：
//   C  SITE_PROMOTION_PRODUCT_PRODUCT / _AD —— 按商品/计划聚合，账户级，不需要 anchor_id
//   D  OVERALL_ROI_PRODUCT_PRODUCT / _PROJECT —— 全域视角，陈小苗这类户只在这套里有数
//
// 用法：node scripts/coverage-check.mjs --from=2026-11-05 --to=2026-11-06
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";
import { callOE } from "../core/client.mjs";

const ARG = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const FROM = ARG.from || "2026-11-05";
const TO = ARG.to || "2026-11-06";
const ACCT_URL = "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/get/";
const RPT_URL = "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/";
const num = (v) => (v === null || v === undefined ? 0 : typeof v === "object" ? Number(v.Value ?? 0) || 0 : Number(v) || 0);

function readCsv(p) {
  if (!existsSync(p)) return [];
  const L = readFileSync(p, "utf8").split("\n").filter(Boolean);
  const h = L[0].split(",");
  return L.slice(1).map((l) => { const c = l.split(","); const o = {}; h.forEach((k, i) => (o[k] = c[i])); return o; });
}
const accts = readCsv(join(PKG, "data", "flat", "accounts.csv"));
const existing = JSON.parse(readFileSync(join(PKG, "data", "full-recon-2026-11-05_2026-11-06.json"), "utf8"));

// C/D 两套主题
const SETS = [
  { key: "C_商品维度", topic: "SITE_PROMOTION_PRODUCT_PRODUCT", dims: ["stat_time_day", "qianchuan_product_id"], cost: "stat_cost" },
  { key: "C_商品计划", topic: "SITE_PROMOTION_PRODUCT_AD", dims: ["stat_time_day", "ad_id"], cost: "stat_cost" },
  { key: "D_全域商品", topic: "OVERALL_ROI_PRODUCT_PRODUCT", dims: ["stat_time_day", "qianchuan_product_id"], cost: "stat_cost_for_roi2" },
  { key: "D_全域计划", topic: "OVERALL_ROI_PRODUCT_PROJECT", dims: ["stat_time_day", "ad_id"], cost: "stat_cost_for_roi2" },
  { key: "D_全域直播号", topic: "OVERALL_ROI_LIVE_AWEME", dims: ["stat_time_day", "anchor_id"], cost: "stat_cost_for_roi2" },
];

async function topicSum(t, adv) {
  let sum = 0, rows = 0, page = 1, total = 1;
  do {
    const { body } = await callOE(RPT_URL, {
      advertiser_id: Number(adv), data_topic: t.topic, dimensions: t.dims, metrics: [t.cost],
      filters: [], order_by: [{ field: t.cost, type: 2 }],
      start_time: `${FROM} 00:00:00`, end_time: `${TO} 23:59:59`, page, page_size: 200,
    }, { retries: 1 });
    if (body.code !== 0) return { sum: null, rows: 0, err: body.code };
    const list = body.data?.rows || [];
    rows += list.length;
    for (const r of list) sum += num(r.metrics?.[t.cost] ?? r[t.cost]);
    total = body.data?.page_info?.total_page || 1;
    page++;
  } while (page <= total && page <= 30);
  return { sum, rows };
}

const out = [];
console.log(`窗口 ${FROM}..${TO}，${accts.length} 户\n`);
console.log("账户".padEnd(32) + "账户".padStart(11) + "A+B".padStart(11) + "   C/D 各套口径");
let covBefore = 0, covAfter = 0, totAcct = 0;
const covered = { C_商品维度: 0, C_商品计划: 0, D_全域商品: 0, D_全域计划: 0, D_全域直播号: 0 };

for (const a of accts) {
  const prev = existing.results.find((r) => String(r.adv) === String(a.account_id));
  const { body } = await callOE(ACCT_URL, {
    advertiser_id: Number(a.account_id), start_date: `${FROM} 00:00:00`, end_date: `${TO} 23:59:59`,
    marketing_goal: "ALL", order_platform: "QIANCHUAN", fields: ["stat_cost"],
  }, { retries: 1 });
  const acct = body.code === 0 ? num(body.data?.stat_cost) : (prev?.acct || 0);
  if (acct <= 0) continue;
  totAcct += acct;

  const line = prev?.lineSum || 0;
  covBefore += line;
  const vals = {};
  for (const s of SETS) {
    const r = await topicSum(s, a.account_id);
    vals[s.key] = r.sum;
    if (r.sum > 0) covered[s.key] += 1;
  }
  // 覆盖估计：A+B 优先，缺口用 C/D 里最大的单套补（不叠加，避免重复计量）
  const gap = Math.max(0, acct - line);
  const best = Math.max(0, ...Object.values(vals).filter((v) => v !== null));
  const after = line + Math.min(gap, best);
  covAfter += after;

  out.push({ adv: a.account_id, name: a.account_name, acct, ab: line, gap, sets: vals, after });
  const flag = gap > 50 ? (after / acct > 0.99 ? "✅" : "·") : "✅";
  const str = Object.entries(vals).filter(([, v]) => v > 1).map(([k, v]) => `${k}=${v.toFixed(0)}`).join("  ");
  console.log(`${flag} ${(a.account_id + " " + a.account_name).slice(0, 30).padEnd(31)}${acct.toFixed(1).padStart(11)}${line.toFixed(1).padStart(11)}   ${str || "-"}`);
}

console.log(`\n=== 合计 ===`);
console.log(`账户口径      ${totAcct.toFixed(2)}`);
console.log(`A+B 素材线    ${covBefore.toFixed(2)}  (${(covBefore / totAcct * 100).toFixed(2)}%)`);
console.log(`补 C/D 后估计  ${covAfter.toFixed(2)}  (${(covAfter / totAcct * 100).toFixed(2)}%)`);
console.log(`\n各套口径有数的户数：${Object.entries(covered).map(([k, v]) => `${k}=${v}`).join("  ")}`);

writeFileSync(join(PKG, "data", `coverage-${FROM}_${TO}.json`), JSON.stringify({ generated_at: new Date().toISOString(), from: FROM, to: TO, totAcct, covBefore, covAfter, covered, rows: out }, null, 1), "utf8");

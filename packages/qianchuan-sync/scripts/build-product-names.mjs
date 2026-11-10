// 商品名映射构建器：用 OVERALL_ROI_PRODUCT_PRODUCT 主题的
// qianchuan_product_id + qianchuan_product_name 双维度，建立 ID→名称静态映射。
//
// 背景（2026-11-09 体检）：prod_dim 报表里混两套商品 ID——
//   16 位店铺商品 ID 与 19 位千川商品 ID。商品库接口（uni_promotion/product/get）
//   只返回 19 位，导致 46% 的商品行（约 13.7 万消耗）join 不上名字。
// 本脚本按账户拉「全域商品维」报表，任何在该主题出现过的 ID（含 16 位）
//   都能拿到名称，输出 data/flat/product_names.csv 供分析层兜底 join。
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";
import { callOE, callOEPaged } from "../core/client.mjs";

const URL = "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/";

// argv 归一化：--k=v → --k v
const rawArgs = process.argv.slice(2);
const args = [];
for (let i = 0; i < rawArgs.length; i++) {
  const m = rawArgs[i].match(/^--([^=]+)=(.*)$/);
  if (m) { args.push(`--${m[1]}`, m[2]); } else args.push(rawArgs[i]);
}
const val = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const days = Number(val("days", 90));

function today(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
}

// 读账户
const accounts = [];
for (let p = 1; p <= 5; p++) {
  const f = join(PKG, "data", "raw", "accounts", `accounts-p${p}.json`);
  if (!existsSync(f)) continue;
  const o = JSON.parse(readFileSync(f, "utf8"));
  for (const x of o.data?.adv_id_list || []) accounts.push({ id: Number(x.adv_id), name: x.adv_name });
}
if (!accounts.length) { console.error("无账户数据，先跑 --source accounts"); process.exit(1); }

const from = today(-days), to = today(-1);
console.log(`== 商品名/计划名映射 窗口 ${from}..${to} 账户 ${accounts.length} ==`);

// 2026-11-09 修正：此前以为 prod_dim 的 16 位 ID 是「店铺商品 ID」——实测是【计划 ID】
// （382 行 plan:16 中 294 行能在 plans.csv 命中）。缺名的 88 行（约 5.9 万消耗）是
// 已删除/停用的计划，plans 列表接口查不到，但 OVERALL_ROI_PRODUCT_PROJECT 的
// ad_name 维度仍带名字 → 用它补计划名映射。
const TASKS = [
  { out: "product_names.csv", topic: "OVERALL_ROI_PRODUCT_PRODUCT", idDim: "qianchuan_product_id", nameDim: "qianchuan_product_name", metric: "stat_cost_for_overall_roi2", label: "商品" },
  { out: "plan_names.csv", topic: "OVERALL_ROI_PRODUCT_PROJECT", idDim: "ad_id", nameDim: "ad_name", metric: "stat_cost_for_roi2", label: "计划" },
];

for (const task of TASKS) {
  const map = new Map(); // id -> { name, accounts:Set, cost }
  let done = 0, fail = 0;
  for (const a of accounts) {
    const { rows, body } = await callOEPaged(URL, {
      advertiser_id: a.id,
      data_topic: task.topic,
      dimensions: [task.idDim, task.nameDim],
      metrics: [task.metric],
      filters: [],
      order_by: [{ field: task.metric, type: 2 }],
      start_time: `${from} 00:00:00`,
      end_time: `${to} 23:59:59`,
      page_size: 200,
    }, { maxPages: 50 });
    if (body.code !== 0) { fail++; if (fail <= 3) console.log(`  ⚠️ ${a.name}: code=${body.code} ${String(body.message).slice(0, 40)}`); continue; }
    for (const r of rows) {
      const d = r.dimensions || {};
      const id = String(d[task.idDim]?.Value ?? d[task.idDim]?.ValueStr ?? "");
      const name = String(d[task.nameDim]?.ValueStr ?? d[task.nameDim]?.Value ?? "");
      if (!id || !name || id === "null") continue;
      const cost = Number(r.metrics?.[task.metric]?.Value) || 0;
      let e = map.get(id);
      if (!e) { e = { name, accounts: new Set(), cost: 0 }; map.set(id, e); }
      e.accounts.add(a.name);
      e.cost += cost;
    }
    done++;
    if (done % 15 === 0 || done === accounts.length) console.log(`  [${task.label}] 进度 ${done}/${accounts.length} | 唯一 ${map.size}`);
  }

  // 输出 CSV
  const out = join(PKG, "data", "flat", task.out);
  const esc = (s) => { s = String(s); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [task.idDim === "ad_id" ? "plan_id,plan_name,account_count,total_cost" : "product_id,product_name,account_count,total_cost"];
  for (const [id, e] of map) lines.push([id, esc(e.name), e.accounts.size, e.cost.toFixed(2)].join(","));
  writeFileSync(out, lines.join("\n") + "\n", "utf8");
  console.log(`  [${task.label}] 完成: ${done} OK / ${fail} FAIL | 唯一 ${map.size} → ${task.out}`);
}

// ── 第三步：用 ad/detail 补齐 prod_dim 里仍缺名的站内计划 ──
// 这些计划（多为全店托管/已删除）既不在 plans.csv（全域列表）也不在
// OVERALL_ROI_PRODUCT_PROJECT（全域报表），但 detail 接口按 ID 仍能查到名字。
{
  const esc2 = (s) => { s = String(s); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const prodPath = join(PKG, "data", "flat", "prod_dim.csv");
  const plansPath = join(PKG, "data", "flat", "plans.csv");
  if (existsSync(prodPath) && existsSync(plansPath)) {
    const csv = (f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => l.split(","));
    const planRows = csv(plansPath);
    const pi = planRows[0].indexOf("plan_id");
    const known = new Set(planRows.slice(1).map((r) => r[pi]));
    const prodRows = csv(prodPath);
    const ti = prodRows[0].indexOf("topic_tag"), di = prodRows[0].indexOf("dim_id"),
      ai = prodRows[0].indexOf("account_id");
    const missing = new Map(); // plan_id -> account_id
    for (const r of prodRows.slice(1)) {
      if (r[ti] !== "plan" || known.has(r[di])) continue;
      if (!missing.has(r[di])) missing.set(r[di], r[ai]);
    }
    // 载入第二步产出的 plan_names.csv，去重后追加
    const out = join(PKG, "data", "flat", "plan_names.csv");
    const existing = existsSync(out)
      ? readFileSync(out, "utf8").split("\n").filter(Boolean) : ["plan_id,plan_name,account_count,total_cost"];
    const existingIds = new Set(existing.slice(1).map((l) => l.split(",")[0]));
    let fetched = 0, dead = 0;
    for (const [pid, acct] of missing) {
      if (existingIds.has(pid)) continue;
      // 注意：detail 是单对象接口，不能走 callOEPaged（其附加的 page 参数会让返回变空）
      const { body } = await callOE("https://open.oceanengine.com/open_api/v1.0/qianchuan/uni_promotion/ad/detail/", {
        advertiser_id: Number(acct), ad_id: Number(pid),
      });
      const name = body.code === 0 ? String(body.data?.name || "") : "";
      if (name) { existing.push(`${pid},${esc2(name)},1,0`); fetched++; }
      else dead++;
    }
    writeFileSync(out, existing.join("\n") + "\n", "utf8");
    console.log(`  [计划补名] 缺名计划 ${missing.size} 个 | ad/detail 补上 ${fetched} | 查无 ${dead}`);
  }
}

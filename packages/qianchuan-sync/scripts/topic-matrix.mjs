// 主题覆盖矩阵：账户 × 主题，看每个主题对哪些账户有数、消耗多少
//
// 目的（2026-11-07）：把"数据是否全面"量化成矩阵，而不是靠推断。
// 用法：
//   node scripts/topic-matrix.mjs --day=2026-11-05 --advs=1792203326280778,1786139492330569
//   node scripts/topic-matrix.mjs --day=2026-11-05 --all   （全量 46 户 × 19 主题，约 20 分钟）
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";
import { callOE } from "../core/client.mjs";

const U = "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/";
const ARG = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const DAY = ARG.day || "2026-11-05";
const SAVE = !!ARG.save;
const LEGAL_SIZE = 200;

const cfg = JSON.parse(readFileSync(join(PKG, "data", "report-topics.json"), "utf8")).topics;

function readCsv(p) {
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
  const h = lines[0].split(",");
  return lines.slice(1).map((l) => { const c = l.split(","); const o = {}; h.forEach((k, i) => (o[k] = c[i])); return o; });
}
const accts = readCsv(join(PKG, "data", "flat", "accounts.csv"));

let advList;
if (ARG.all) advList = accts.map((a) => a.account_id);
else if (ARG.advs) advList = String(ARG.advs).split(",");
else advList = ["1792203326280778", "1786139492330569"];

// 只测「素材/商品/计划」这类有增量信息的主题，元数据类跳过
const SKIP = new Set(["SITE_PROMOTION_POST_DATA_LIVE", "SITE_PROMOTION_POST_DATA_VIDEO", "SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO", "SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE"]); // 已接，仅作对照
const TARGETS = Object.keys(cfg).filter((t) => !SKIP.has(t));

// 优先用主键维度（能聚合到日粒度）
function pickDims(t) {
  const dims = cfg[t].dims;
  const has = (f) => dims.some((d) => d.field === f);
  const required = dims.filter((d) => d.required).map((d) => d.field);
  const out = ["stat_time_day", ...required];
  // 商品主题补商品维度，否则只有账户合计
  if (t.includes("PRODUCT_PRODUCT") && has("qianchuan_product_id")) out.push("qianchuan_product_id");
  if (t === "SITE_PROMOTION_PRODUCT_AD" && has("ad_id")) out.push("ad_id");
  return [...new Set(out)].filter((f) => has(f) || f === "stat_time_day");
}

function pickMetrics(t) {
  const m = cfg[t].metrics.map((x) => x.field);
  for (const c of ["stat_cost_for_overall_roi2", "stat_cost_for_roi2", "stat_cost_for_roi2_fork"]) {
    if (m.includes(c)) return { cost: c, list: [c] };
  }
  return { cost: null, list: [] }; // OTHER 主题无消耗指标
}

// 必填过滤 ≠ 只能传一个值。aggregate_smart_bid_type 有 0(控成本)/7(放量)，
// ecp_app_id 有 1(千川PC)/2(随心推) —— 只传一个就是系统性漏数。
// 这里对「取值域有限」的必填过滤一律传全部码值。
function pickFilters(t) {
  const out = [];
  for (const d of cfg[t].dims) {
    if (!d.filter_required) continue;
    if (d.filter_codes?.length) out.push({ field: d.field, operator: 7, values: d.filter_codes });
    // 无固定取值域的必填过滤（如 anchor_id）无法凭空构造 → 留给调用方
  }
  return out;
}

const rows = [];
let n = 0;
const totalReq = advList.length * TARGETS.length;
console.log(`矩阵：${advList.length} 账户 × ${TARGETS.length} 主题 = ${totalReq} 请求（day=${DAY}）\n`);

for (const adv of advList) {
  for (const t of TARGETS) {
    n++;
    const dims = pickDims(t);
    const { cost, list } = pickMetrics(t);
    const filters = pickFilters(t);
    const needFilter = cfg[t].dims.filter((d) => d.filter_required && !d.filter_codes?.length).map((d) => d.field);
    if (needFilter.length) {
      rows.push({ adv, topic: t, state: "需必填过滤:" + needFilter.join("+"), rows: 0, cost: null });
      process.stdout.write(`\r${n}/${totalReq}  ${t.padEnd(36)} 跳过(需${needFilter})        `);
      continue;
    }
    if (!cost) {
      rows.push({ adv, topic: t, state: "无消耗指标", rows: 0, cost: null });
      process.stdout.write(`\r${n}/${totalReq}  ${t.padEnd(36)} 跳过(无消耗指标)          `);
      continue;
    }
    const params = {
      advertiser_id: Number(adv), data_topic: t,
      dimensions: dims, metrics: list,
      filters,
      order_by: [{ field: cost, type: 2 }],
      start_time: `${DAY} 00:00:00`, end_time: `${DAY} 23:59:59`,
      page: 1, page_size: LEGAL_SIZE,
    };
    const { body } = await callOE(U, params, { retries: 1 });
    if (body.code !== 0) {
      rows.push({ adv, topic: t, state: `ERR ${body.code} ${String(body.message).slice(0, 70)}`, rows: 0, cost: null });
      process.stdout.write(`\r${n}/${totalReq}  ${t.padEnd(36)} ERR ${String(body.message).slice(0, 40)}      `);
      continue;
    }
    const data = body.data || {};
    const listRows = Array.isArray(data.rows) ? data.rows : Array.isArray(data.list) ? data.list : [];
    const sum = listRows.reduce((s, r) => {
      const v = r[cost];
      return s + (typeof v === "object" ? Number(v?.Value ?? 0) : Number(v) || 0);
    }, 0);
    rows.push({ adv, topic: t, state: listRows.length ? "有数" : "空", rows: listRows.length, total: data.page_info?.total_number ?? listRows.length, cost: Math.round(sum * 100) / 100 });
    process.stdout.write(`\r${n}/${totalReq}  ${t.padEnd(36)} ${listRows.length ? "✅ " + sum.toFixed(2) : "· 空"}          `);
  }
}
console.log("\n");

// 按账户打印
for (const adv of advList) {
  const name = accts.find((a) => a.account_id === adv)?.account_name || "";
  console.log(`\n### ${adv} ${name}`);
  for (const r of rows.filter((x) => x.adv === adv)) {
    console.log(`  ${r.topic.padEnd(38)} ${String(r.state).padEnd(24)} 行=${String(r.rows).padStart(4)} 消耗=${r.cost === null ? "-" : r.cost}`);
  }
}

if (SAVE) {
  const p = join(PKG, "data", `topic-matrix-${DAY}.json`);
  writeFileSync(p, JSON.stringify({ generated_at: new Date().toISOString(), day: DAY, rows }, null, 1), "utf8");
  console.log(`\n→ ${p}`);
}

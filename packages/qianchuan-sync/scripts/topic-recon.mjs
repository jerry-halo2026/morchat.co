#!/usr/bin/env node
// 口径对账实验：OVERALL_ROI_* 素材主题 vs SITE_PROMOTION_* 素材线 vs 账户口径
//
// 要回答的问题（2026-11-07）：
//   1) OVERALL_ROI_LIVE_MATERIAL_VIDEO 是否 = 旧的两个直播素材线之和？（新旧等价 → 不必重复接）
//   2) 还是它有额外覆盖（OTHER / 图文 / 标题）→ 必须接，否则仍有缺口
//   3) 它能否一次拉整个账户（anchor_id 非必填）→ 只要能，506 主播对 × N 源的请求量就能砍掉
import { callOE } from "../core/client.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";

const ADV = Number(process.argv[2] || 1786139492330569);
const DAY = process.argv[3] || "2026-11-06";
const URL = "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/";

const topics = JSON.parse(readFileSync(join(PKG, "data", "report-topics.json"), "utf8")).topics;

const METRICS = ["stat_cost_for_roi2", "stat_cost_for_overall_roi2", "total_pay_order_gmv_for_roi2", "total_pay_order_count_for_roi2"];

function val(m) {
  if (m === null || m === undefined) return 0;
  if (typeof m === "object") return Number(m.Value ?? m.value ?? 0) || 0;
  return Number(m) || 0;
}

async function q(topic, dims, filters = [], size = 200) {
  const avail = (topics[topic]?.metrics || []).map((m) => m.field);
  const ms = METRICS.filter((m) => avail.includes(m));
  const params = {
    advertiser_id: ADV,
    data_topic: topic,
    dimensions: dims,
    metrics: ms,
    order_by: [{ field: ms[0], type: 2 }],
    start_time: `${DAY} 00:00:00`,
    end_time: `${DAY} 23:59:59`,
    page: 1,
    page_size: size,
  };
  params.filters = filters; // 必填，空也要传 []
  const rows = [];
  let page = 1, total = 1;
  do {
    params.page = page;
    const { body } = await callOE(URL, params, { retries: 1 });
    if (body.code !== 0) return { rows: [], err: `${body.code}: ${String(body.message).slice(0, 120)}`, metrics: ms };
    const d = body.data || {};
    rows.push(...(d.list || []));
    total = d.page_info?.total_page || 1;
    page++;
  } while (page <= total && page <= 20);
  return { rows, err: null, metrics: ms };
}

// range_values 里 label 是数字码、value 才是中文 —— 过滤必须传 label
const TYPES = ["1", "2", "3", "4", "5", "6"];
const TYPE_NAME = { "1": "标题", "2": "图片", "3": "视频", "4": "直播间画面", "5": "其他创意", "6": "图文" };

async function main() {
  const out = [];
  const log = (s) => { console.log(s); out.push(s); };

  log(`\n=== 账户 ${ADV} / ${DAY} ===\n`);

  // ── 口径 A：OVERALL_ROI_LIVE_MATERIAL_VIDEO，按素材类型拆 ──
  const dimsA = ["stat_time_day", "roi2_material_type_v3"];
  const rA = await q("OVERALL_ROI_LIVE_MATERIAL_VIDEO", dimsA, [
    { field: "roi2_material_type_v3", operator: 7, values: TYPES },
  ]);
  log(`[A] OVERALL_ROI_LIVE_MATERIAL_VIDEO  ${rA.err ? "ERR " + rA.err : rA.rows.length + " 行 (metrics: " + rA.metrics.join(",") + ")"}`);
  if (!rA.err) {
    let sum = 0;
    for (const r of rA.rows) {
      const t = TYPE_NAME[String(r.roi2_material_type_v3?.ValueNum ?? r.roi2_material_type_v3?.ValueStr ?? r.roi2_material_type_v3?.Value ?? r.roi2_material_type_v3)] ?? r.roi2_material_type_v3?.ValueStr ?? r.roi2_material_type_v3?.Value;
      const c = val(r.stat_cost_for_roi2);
      sum += c;
      log(`     ${String(t).padEnd(10)} 消耗 ${c.toFixed(2)}`);
    }
    log(`     —— A 合计 ${sum.toFixed(2)}`);
  }

  // ── 口径 B：同上，但不带任何过滤（看默认范围是否＝六类之和）──
  const rB = await q("OVERALL_ROI_LIVE_MATERIAL_VIDEO", dimsA, []);
  log(`\n[B] 同主题不带 filter  ${rB.err ? "ERR " + rB.err : rB.rows.length + " 行"}`);
  if (!rB.err) {
    let sum = 0;
    for (const r of rB.rows) {
      const t = TYPE_NAME[String(r.roi2_material_type_v3?.ValueNum ?? r.roi2_material_type_v3?.ValueStr ?? r.roi2_material_type_v3?.Value ?? r.roi2_material_type_v3)] ?? r.roi2_material_type_v3?.ValueStr ?? r.roi2_material_type_v3?.Value;
      const c = val(r.stat_cost_for_roi2);
      sum += c;
      log(`     ${String(t).padEnd(10)} 消耗 ${c.toFixed(2)}`);
    }
    log(`     —— B 合计 ${sum.toFixed(2)}`);
  }

  // ── 口径 C：OVERALL_ROI_LIVE_MATERIAL_LIVE（直播间画面视角）──
  const rC = await q("OVERALL_ROI_LIVE_MATERIAL_LIVE", ["stat_time_day"]);
  log(`\n[C] OVERALL_ROI_LIVE_MATERIAL_LIVE  ${rC.err ? "ERR " + rC.err : rC.rows.length + " 行"}`);
  if (!rC.err) log(`     stat_cost_for_roi2_fork = ${rC.rows.reduce((s, r) => s + val(r.stat_cost_for_roi2_fork), 0).toFixed(2)}`);

  // ── 口径 D：OVERALL_ROI_PRODUCT_MATERIAL（商品全域素材）──
  const rD = await q("OVERALL_ROI_PRODUCT_MATERIAL", ["stat_time_day", "roi2_material_type_v3"], [
    { field: "roi2_material_type_v3", operator: 7, values: TYPES },
  ]);
  log(`\n[D] OVERALL_ROI_PRODUCT_MATERIAL  ${rD.err ? "ERR " + rD.err : rD.rows.length + " 行"}`);
  if (!rD.err) {
    for (const r of rD.rows) {
      const t = TYPE_NAME[String(r.roi2_material_type_v3?.ValueNum ?? r.roi2_material_type_v3?.ValueStr ?? r.roi2_material_type_v3?.Value ?? r.roi2_material_type_v3)] ?? r.roi2_material_type_v3?.ValueStr ?? r.roi2_material_type_v3?.Value;
      log(`     ${String(t).padEnd(10)} 消耗 ${val(r.stat_cost_for_roi2).toFixed(2)}`);
    }
    log(`     —— D 合计 ${rD.rows.reduce((s, r) => s + val(r.stat_cost_for_roi2), 0).toFixed(2)}`);
  }

  // ── 口径 E：旧口径（现有 4 源）单日合计 ──
  const flat = join(PKG, "data", "flat");
  const readCsv = (n) => {
    const p = join(flat, n);
    try {
      const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
      const h = lines[0].split(",");
      return lines.slice(1).map((l) => { const c = l.split(","); const o = {}; h.forEach((k, i) => (o[k] = c[i])); return o; });
    } catch { return []; }
  };
  let sumE = 0;
  for (const [file, field] of [
    ["uni_live.csv", "stat_cost_for_roi2_fork"],
    ["live_video.csv", "stat_cost_for_roi2"],
    ["uni_video.csv", "stat_cost_for_roi2"],
    ["uni_image.csv", "stat_cost_for_roi2"],
  ]) {
    const rows = readCsv(file).filter((r) => r.stat_date === DAY && String(r.account_id) === String(ADV));
    const s = rows.reduce((x, r) => x + (Number(r[field]) || 0), 0);
    sumE += s;
    log(`[E] ${file.padEnd(16)} ${s.toFixed(2)}  (${rows.length} 行)`);
  }
  log(`     —— E 合计 ${sumE.toFixed(2)}`);

  // ── 口径 F：账户口径（recon 已是 ALL 口径）──
  const recon = readCsv("recon.csv").filter((r) => r.goal === "ALL" && String(r.account_id) === String(ADV));
  log(`\n[F] recon ALL 口径（近 7 天聚合，非单日，仅作参考）: ${JSON.stringify(recon.map((r) => r.acct_cost))}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

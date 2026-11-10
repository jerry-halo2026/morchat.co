#!/usr/bin/env node
// 接口探测：把「候选读接口」逐个实测，记录 code / message / 返回结构。
//
// 为什么需要它：官方文档只写"有这个接口"，不写"你这个账户能不能调、要什么参数、返回什么"。
// 2026-11-07 的教训是 —— 文档里 `qianchuan/ad/get/` 还在，实际早已下线；
// 反过来 `SITE_PROMOTION_POST_DATA_VIDEO` 这个主题文档里没标红，却是 27% 消耗缺口的来源。
// 所以：文档用来枚举，实测定真假。
//
// 用法：node scripts/probe-apis.mjs [--only=报表,计划] [--save]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PKG, todayInTz, minusDaysInTz } from "../core/env.mjs";
import { callOE } from "../core/client.mjs";

const BASE = "https://open.oceanengine.com";
const day = todayInTz("Asia/Shanghai");
const from = minusDaysInTz(day, 7);

// ── 上下文：选一个真有消耗的直播户 + 一个商品卡户 ──
function readCsv(p) {
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => {
    const c = l.split(",");
    const o = {};
    head.forEach((h, i) => (o[h] = c[i]));
    return o;
  });
}
const accts = readCsv(join(PKG, "data", "flat", "accounts.csv"));
const anchors = readCsv(join(PKG, "data", "flat", "anchors.csv"));
const recon = readCsv(join(PKG, "data", "flat", "recon.csv"));

// 挑消耗最大的账户当样本（recon 里 ALL 口径的最大值）
const topAcct = recon
  .filter((r) => r.goal === "ALL" && Number(r.acct_cost) > 0)
  .sort((a, b) => Number(b.acct_cost) - Number(a.acct_cost))[0];
const ADV = Number(topAcct?.account_id || accts[0]?.account_id);
const ADV_NAME = topAcct?.account_name || accts[0]?.account_name;
const ANCHOR = anchors.find((a) => String(a.account_id) === String(ADV))?.aweme_id || anchors[0]?.aweme_id;

const catalog = (() => {
  const base = JSON.parse(readFileSync(join(PKG, "data", "qc-uni-config-20261104.json"), "utf8"));
  const m = {};
  for (const c of base.data.custom_config_datas) m[c.data_topic] = c;
  const extraPath = join(PKG, "data", "uni-config-extra.json");
  if (existsSync(extraPath)) {
    const e = JSON.parse(readFileSync(extraPath, "utf8"));
    for (const [k, v] of Object.entries(e)) if (!m[k]) m[k] = v;
  }
  return m;
})();
const LIVE_METRICS = catalog["SITE_PROMOTION_POST_DATA_LIVE"]?.metrics?.map?.((x) => x.field)?.slice(0, 5) || ["stat_cost_for_roi2_fork"];

const RPT = `${BASE}/open_api/v1.0/qianchuan/report/uni_promotion/data/get/`;

// ── 候选接口（读语义，按业务域分组）──
const PROBES = [
  // ===== 0. 元数据：主题/维度/指标全景 =====
  // 注意：data_topics 必填 —— 这个接口是「按主题查」，不是「返回全部主题」。
  // 所以它能验证「某主题到底有哪些维度/指标」，但主题清单纯靠它枚举不出来。
  { g: "元数据", id: "report-config", m: "GET", p: "/open_api/v1.0/qianchuan/report/uni_promotion/config/get/", q: { advertiser_id: ADV, data_topics: ["SITE_PROMOTION_POST_DATA_LIVE", "SITE_PROMOTION_PRODUCT_PRODUCT"] }, note: "按主题查可用维度/指标" },

  // ===== 1. 报表域 =====
  { g: "报表", id: "all_promotion", m: "GET", p: "/open_api/v1.0/qianchuan/report/all_promotion/get/", q: { advertiser_id: ADV, start_date: from, end_date: day }, note: "账户维度数据（账户口径，可替代自建 recon）" },
  { g: "报表", id: "uni_promotion_acct", m: "GET", p: "/open_api/v1.0/qianchuan/report/uni_promotion/get/", q: { advertiser_id: ADV, start_date: from, end_date: day, page: 1, page_size: 10 }, note: "全域投放账户维度" },
  { g: "报表", id: "dim_room", m: "GET", p: "/open_api/v1.0/qianchuan/report/uni_promotion/dimension_data/room/get/", q: { advertiser_id: ADV, start_date: from, end_date: day, page: 1, page_size: 10 }, note: "直播间维度" },
  { g: "报表", id: "dim_author", m: "GET", p: "/open_api/v1.0/qianchuan/report/uni_promotion/dimension_data/author/get/", q: { advertiser_id: ADV, start_date: from, end_date: day, page: 1, page_size: 10 }, note: "抖音号维度" },
  { g: "报表", id: "report_live", m: "GET", p: "/open_api/v1.0/qianchuan/report/live/get/", q: { advertiser_id: ADV, start_date: from, end_date: day, page: 1, page_size: 10 }, note: "今日/区间直播数据" },
  { g: "报表", id: "long_order", m: "GET", p: "/open_api/v1.0/qianchuan/report/long_transfer/order/data/get/", q: { advertiser_id: ADV, start_date: from, end_date: day, page: 1, page_size: 10 }, note: "长周期订单（T+7/T+30 结算）" },
  // 主题覆盖验证：拿每个未接主题各打一枪
  ...["SITE_PROMOTION_PRODUCT_PRODUCT", "SITE_PROMOTION_PRODUCT_AD", "OVERALL_ROI_PRODUCT_PROJECT", "OVERALL_ROI_PRODUCT_PRODUCT", "SITE_PROMOTION_POST_DATA_TITLE", "SITE_PROMOTION_PRODUCT_POST_DATA_TITLE"].map((t) => ({
    g: "报表-主题", id: t, m: "GET", p: "/open_api/v1.0/qianchuan/report/uni_promotion/data/get/",
    q: { advertiser_id: ADV, data_topic: t, dimensions: (catalog[t]?.dimensions || []).filter((d) => d.field).map((d) => d.field).slice(0, 2).length ? (catalog[t].dimensions || []).map((d) => d.field || d).slice(0, 2) : ["stat_time_day"], metrics: ((catalog[t]?.metrics || []).map((x) => x.field).filter(Boolean).slice(0, 3).length ? (catalog[t].metrics || []).map((x) => x.field).filter(Boolean).slice(0, 3) : ["stat_cost_for_roi2"]), start_time: `${from} 00:00:00`, end_time: `${day} 23:59:59`, order_by: [{ field: "stat_cost_for_roi2", type: 2 }], page: 1, page_size: 10 },
    note: `主题可用性：${t}`,
  })),

  // ===== 2. 计划域 =====
  { g: "计划", id: "plan-detail", m: "GET", p: "/open_api/v1.0/qianchuan/uni_promotion/ad/detail/", q: { advertiser_id: ADV, ad_id: 0 }, note: "计划详情（需真实 ad_id）" },
  { g: "计划", id: "plan-material", m: "GET", p: "/open_api/v1.0/qianchuan/uni_promotion/ad/material/get/", q: { advertiser_id: ADV, ad_id: 0 }, note: "计划下素材（计划↔素材关联）" },
  { g: "计划", id: "plan-product", m: "GET", p: "/open_api/v1.0/qianchuan/uni_promotion/ad/product/get/", q: { advertiser_id: ADV, ad_id: 0 }, note: "计划下商品（计划↔商品关联）" },
  { g: "计划", id: "plan-suggestion", m: "GET", p: "/open_api/v1.0/qianchuan/uni_promotion/ad/suggestion/", q: { advertiser_id: ADV, ad_id: 0 }, note: "计划审核建议" },
  { g: "计划", id: "plan-learn", m: "GET", p: "/open_api/v1.0/qianchuan/ad/learing_status/get/", q: { advertiser_id: ADV }, note: "计划学习期状态" },
  { g: "计划", id: "plan-compensate", m: "GET", p: "/open_api/v1.0/qianchuan/ad/compensate_status/get/", q: { advertiser_id: ADV }, note: "成本保障状态" },
  { g: "计划", id: "plan-quota", m: "GET", p: "/open_api/v1.0/qianchuan/ad/quota/get/", q: { advertiser_id: ADV }, note: "在投计划配额" },
  { g: "计划", id: "control-task", m: "GET", p: "/open_api/v1.0/qianchuan/uni_promotion/ad/control_task/list/", q: { advertiser_id: ADV, page: 1, page_size: 10 }, note: "调控任务列表" },

  // ===== 3. 素材库 =====
  { g: "素材", id: "material-video", m: "GET", p: "/open_api/v1.0/qianchuan/video/get/", q: { advertiser_id: ADV, page: 1, page_size: 10 }, note: "素材库视频" },
  { g: "素材", id: "material-image", m: "GET", p: "/open_api/v1.0/qianchuan/image/get/", q: { advertiser_id: ADV, page: 1, page_size: 10 }, note: "素材库图片" },
  { g: "素材", id: "material-carousel", m: "GET", p: "/open_api/v1.0/qianchuan/carousel/get/", q: { advertiser_id: ADV, page: 1, page_size: 10 }, note: "素材库图文" },
  { g: "素材", id: "material-original", m: "GET", p: "/open_api/v1.0/qianchuan/file/video/original/get/", q: { advertiser_id: ADV, page: 1, page_size: 10 }, note: "首发素材" },
  { g: "素材", id: "material-loweff", m: "GET", p: "/open_api/v1.0/qianchuan/file/video/efficiency/get/", q: { advertiser_id: ADV, page: 1, page_size: 10 }, note: "低效素材" },
  { g: "素材", id: "material-attr", m: "GET", p: "/open_api/2/file/material_attributes/list/", q: { advertiser_id: ADV, page: 1, page_size: 10 }, note: "素材评估标签" },
  { g: "素材", id: "aweme-video", m: "GET", p: "/open_api/v1.0/qianchuan/file/video/aweme/get/", q: { advertiser_id: ADV, aweme_id: ANCHOR, page: 1, page_size: 10 }, note: "抖音号下视频" },

  // ===== 4. 账户 / 财务 =====
  { g: "财务", id: "qc-balance", m: "GET", p: "/open_api/v1.0/qianchuan/account/balance/get/", q: { advertiser_id: ADV }, note: "千川账户余额（vs v3.0 代理商口径）" },
  { g: "财务", id: "qc-wallet", m: "GET", p: "/open_api/v1.0/qianchuan/finance/wallet/get/", q: { advertiser_id: ADV }, note: "账户钱包信息" },
  { g: "财务", id: "qc-flow", m: "GET", p: "/open_api/v1.0/qianchuan/finance/detail/get/", q: { advertiser_id: ADV, start_date: from, end_date: day, page: 1, page_size: 10 }, note: "财务流水" },
  { g: "财务", id: "acct-budget", m: "GET", p: "/open_api/v1.0/qianchuan/account/budget/get/", q: { advertiser_id: ADV }, note: "账户日预算" },
  { g: "账户", id: "adv-info", m: "GET", p: "/open_api/2/advertiser/info/", q: { advertiser_ids: [ADV] }, note: "账户全量信息" },
  { g: "账户", id: "adv-public", m: "GET", p: "/open_api/2/advertiser/public_info/", q: { advertiser_ids: [ADV] }, note: "账户基础信息" },
  { g: "账户", id: "adv-type", m: "GET", p: "/open_api/v1.0/qianchuan/advertiser/type/get/", q: { advertiser_id: ADV }, note: "账户类型（区分直播户/商品卡户）" },

  // ===== 5. 工具 =====
  { g: "工具", id: "op-log", m: "GET", p: "/open_api/v1.0/qianchuan/tools/log_search/", q: { advertiser_id: ADV, start_date: from, end_date: day, page: 1, page_size: 10 }, note: "操作日志（关停/改预算时间线）" },
  { g: "工具", id: "score-total", m: "GET", p: "/open_api/v3.0/security/score_total/get/", q: { advertiser_id: ADV }, note: "账户累计违规积分" },
  { g: "工具", id: "score-disposal", m: "GET", p: "/open_api/v3.0/security/score_disposal_info/get/", q: { advertiser_id: ADV, page: 1, page_size: 10 }, note: "积分处置详情" },
  { g: "工具", id: "comment-metrics", m: "GET", p: "/open_api/v3.0/tools/comment_metrics/get/", q: { advertiser_id: ADV, start_time: `${from} 00:00:00`, end_time: `${day} 23:59:59` }, note: "评论统计指标" },
  { g: "工具", id: "agent-cost", m: "GET", p: "/open_api/2/agent/adv/cost_report/list/query/", q: { advertiser_id: ADV, start_date: from, end_date: day, page: 1, page_size: 10 }, note: "代理商消耗报表" },
];

function summarize(body) {
  const d = body?.data;
  if (d === undefined || d === null) return { kind: typeof d };
  if (Array.isArray(d)) return { kind: "array", len: d.length, itemKeys: d[0] ? Object.keys(d[0]).slice(0, 14) : [] };
  const keys = Object.keys(d);
  const out = { kind: "object", keys: keys.slice(0, 16) };
  for (const k of ["list", "rows", "data", "result"]) {
    if (Array.isArray(d[k])) {
      out[`${k}_len`] = d[k].length;
      out[`${k}_itemKeys`] = d[k][0] ? Object.keys(d[k][0]).slice(0, 16) : [];
      break;
    }
  }
  return out;
}

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const filters = onlyArg ? onlyArg.slice(7).split(",") : null;
const list = filters ? PROBES.filter((x) => filters.some((f) => x.g.includes(f) || x.id.includes(f))) : PROBES;

console.log(`样本账户: ${ADV} (${ADV_NAME})  主播: ${ANCHOR}  窗口: ${from}..${day}`);
console.log(`待测 ${list.length} 个接口\n`);

const results = [];
for (const it of list) {
  const t0 = Date.now();
  const { body } = await callOE(BASE + it.p, it.q, { retries: 1 });
  const rec = {
    group: it.g,
    id: it.id,
    method: it.m,
    path: it.p,
    note: it.note,
    code: body.code,
    message: String(body.message || "").slice(0, 160),
    ok: body.code === 0,
    ms: Date.now() - t0,
    shape: body.code === 0 ? summarize(body) : null,
    request_id: body.request_id || "",
  };
  results.push(rec);
  console.log(`${rec.ok ? "✅" : "❌"} [${rec.group}/${rec.id}] ${rec.code} ${rec.message || "OK"} ${rec.shape ? JSON.stringify(rec.shape).slice(0, 220) : ""}`);
}

const outPath = join(PKG, "data", "probe-result.json");
writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), adv: ADV, adv_name: ADV_NAME, anchor: ANCHOR, from, day, results }, null, 1), "utf8");
console.log(`\n→ ${outPath}`);
console.log(`通过 ${results.filter((r) => r.ok).length} / ${results.length}`);

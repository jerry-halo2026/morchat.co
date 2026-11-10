// 直播分主播报表：anchor_id 筛选是接口硬约束，单请求只能查一个主播（授权主播数就是调用下限）
// 2026-11-07 v2：增量模式只拉「历史上真正花过钱」的主播对 + 从未出现过的新主播
//   —— 506 个授权主播里 474 个在 179 天内一分钱没花过，全拉一遍是纯浪费
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PKG, getConfig } from "../../core/env.mjs";

export const recipe = { id: "uni_live", schedule: "manual", requires: ["accounts", "anchors"] };

/** 读 flat/uni_live.csv，返回 { active: 近 N 天有消耗的对, seen: 出现过的所有对 } */
function readPairIndex(days) {
  const p = join(PKG, "data", "flat", "uni_live.csv");
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, "utf8").split("\n");
  const head = lines[0].split(",");
  const iDate = head.indexOf("stat_date");
  const iAcct = head.indexOf("account_id");
  const iDim = head.indexOf("dim_id");
  let iCost = head.indexOf("stat_cost_for_roi2_fork");
  if (iCost < 0) iCost = head.indexOf("stat_cost_for_roi2");
  if (iDate < 0 || iAcct < 0 || iDim < 0 || iCost < 0) return null;
  const cut = new Date(Date.now() + 8 * 3600e3 - days * 86400e3).toISOString().slice(0, 10);
  const active = new Set(), seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = lines[i].split(",");
    if (c.length <= iCost) continue;
    const k = `${c[iAcct]}:${c[iDim]}`;
    seen.add(k);
    if (c[iDate] >= cut && Number(c[iCost]) > 0) active.add(k);
  }
  return { active, seen };
}

export async function build(ctx) {
  const entries = Object.entries(ctx.anchorMap);
  let pairs = entries;

  if (ctx.mode === "incremental") {
    const idx = readPairIndex(getConfig().activeAnchorDays);
    if (idx && idx.seen.size) {
      const before = entries.reduce((n, [, a]) => n + a.length, 0);
      pairs = entries
        .map(([adv, list]) => [adv, list.filter((aw) => {
          const k = `${adv}:${aw.aweme_id}`;
          return idx.active.has(k) || !idx.seen.has(k); // 活跃的 + 从没拉过的新授权主播
        })])
        .filter(([, list]) => list.length);
      const after = pairs.reduce((n, [, a]) => n + a.length, 0);
      console.log(`  [uni_live] 活跃主播过滤：${before} → ${after} 对（近 ${getConfig().activeAnchorDays} 天有消耗 / 新授权；其余靠每周 --backfill 全量扫）`);
    }
  }

  const calls = [];
  for (const [advId, anchors] of pairs) {
    for (const aw of anchors) {
      calls.push({
        name: `uni_live-${advId}-${aw.aweme_id}`,
        url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/",
        params: {
          advertiser_id: Number(advId), data_topic: "SITE_PROMOTION_POST_DATA_LIVE",
          dimensions: ["stat_time_day", "anchor_id"],
          metrics: ctx.catalog["SITE_PROMOTION_POST_DATA_LIVE"].metrics,
          filters: [
            { field: "ecp_app_id", operator: 7, values: ["1"] },
            { field: "anchor_id", operator: 7, values: [String(aw.aweme_id)] },
            { field: "aggregate_smart_bid_type", operator: 7, values: ["0"] },
          ],
          order_by: [{ field: "stat_cost_for_roi2_fork", type: 2 }],
          start_time: `${(ctx.reportWindow || ctx.window).from} 00:00:00`, end_time: `${(ctx.reportWindow || ctx.window).to} 23:59:59`,
          page: 1, page_size: 200,
        },
        paged: true,
      });
    }
  }
  return { calls };
}

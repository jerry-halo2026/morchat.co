// 直播全域-视频素材报表（SITE_PROMOTION_POST_DATA_VIDEO）
//
// 为什么单列一个源（2026-11-07 定位）：
//   直播全域的消耗分两条素材线 —— ①直播间画面（uni_live，SITE_PROMOTION_POST_DATA_LIVE）
//   ②直播间引流短视频（本源）。此前只接了①，导致 11/05–11/06 全盘账户口径 92,474 元
//   对素材口径 67,595 元，缺 24,880 元（27%），且缺口 100% 落在直播户、商品卡户几乎为 0。
//   实测乔续续官旗这一户两天就有 13,849 元短视频引流消耗，占该户 34%。
//
// 接口硬约束（实测）：
//   - dimensions 必须同时含 stat_time_day + material_id + roi2_material_video_name + roi2_material_video_type
//   - filters 必须含 anchor_id（单请求只能查一个主播），与 uni_live 同构
//   - 消耗字段 stat_cost_for_roi2（不是 stat_cost_for_roi2_fork，后者是直播间画面口径）
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PKG, getConfig } from "../../core/env.mjs";

export const recipe = { id: "live_video", schedule: "manual", requires: ["accounts", "anchors"] };

const TOPIC = "SITE_PROMOTION_POST_DATA_VIDEO";
const DIMS = ["stat_time_day", "material_id", "roi2_material_video_name", "roi2_material_video_type"];

/** 复用 uni_live 的活跃主播索引：短视频引流的投放主体也是主播，冷主播没必要拉 */
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
          return idx.active.has(k) || !idx.seen.has(k);
        })])
        .filter(([, list]) => list.length);
      const after = pairs.reduce((n, [, a]) => n + a.length, 0);
      console.log(`  [live_video] 活跃主播过滤：${before} → ${after} 对`);
    }
  }

  const calls = [];
  for (const [advId, anchors] of pairs) {
    for (const aw of anchors) {
      calls.push({
        name: `live_video-${advId}-${aw.aweme_id}`,
        url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/",
        params: {
          advertiser_id: Number(advId), data_topic: TOPIC,
          dimensions: DIMS,
          metrics: ctx.catalog[TOPIC].metrics,
          filters: [
            { field: "ecp_app_id", operator: 7, values: ["1"] },
            { field: "anchor_id", operator: 7, values: [String(aw.aweme_id)] },
            { field: "aggregate_smart_bid_type", operator: 7, values: ["0"] },
          ],
          order_by: [{ field: "stat_cost_for_roi2", type: 2 }],
          start_time: `${(ctx.reportWindow || ctx.window).from} 00:00:00`,
          end_time: `${(ctx.reportWindow || ctx.window).to} 23:59:59`,
          page: 1, page_size: 200,
        },
        paged: true,
      });
    }
  }
  return { calls };
}

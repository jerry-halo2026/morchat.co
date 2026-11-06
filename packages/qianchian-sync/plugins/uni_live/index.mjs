export const recipe = { id: "uni_live", schedule: "manual", requires: ["accounts", "anchors"] };
export async function build(ctx) {
  const calls = [];
  for (const [advId, anchors] of Object.entries(ctx.anchorMap)) {
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
          start_time: `${ctx.window.from} 00:00:00`, end_time: `${ctx.window.to} 23:59:59`,
          page: 1, page_size: 200,
        },
        paged: true,
      });
    }
  }
  return { calls };
}

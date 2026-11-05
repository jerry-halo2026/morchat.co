// 计划快照：全域计划列表（两目标 × 每户）
export const recipe = { id: "plans", schedule: "manual", requires: ["accounts"] };
export async function build(ctx) {
  const calls = [];
  const goals = ["LIVE_PROM_GOODS", "VIDEO_PROM_GOODS"];
  for (const a of ctx.accounts) {
    for (const g of goals) {
      calls.push({
        name: `plans-${a.advertiser_id}-${g}`,
        url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/uni_promotion/list/",
        params: {
          advertiser_id: a.advertiser_id,
          start_time: `${ctx.window.from} 00:00:00`, end_time: `${ctx.window.to} 23:59:59`,
          marketing_goal: g, order_type: "DESC", order_field: "stat_cost",
          page: 1, page_size: 100,
        },
      });
    }
  }
  return { calls };
}

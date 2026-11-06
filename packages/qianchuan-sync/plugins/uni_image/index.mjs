// 商品卡主题：全窗一次区间调用（dims 含日期维度=逐日行；全指标取自存档词表）
export const recipe = { id: "uni_image", schedule: "manual", requires: ["accounts"] };
export async function build(ctx) {
  const calls = [];
  for (const a of ctx.accounts) {
    calls.push({
      name: `uni_image-${a.advertiser_id}`,
      url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/",
      params: {
        advertiser_id: a.advertiser_id, data_topic: "SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE",
        dimensions: ["stat_time_day", "material_id", "roi2_material_image_name"],
        metrics: ctx.catalog["SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE"].metrics,
        filters: [],
        order_by: [{ field: "stat_cost_for_roi2", type: 2 }],
        start_time: `${ctx.window.from} 00:00:00`, end_time: `${ctx.window.to} 23:59:59`,
        page: 1, page_size: 200, paged: true,
      },
    });
  }
  return { calls };
}

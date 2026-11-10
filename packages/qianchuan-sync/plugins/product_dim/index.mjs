// 商品维表（2026-11-07 新增）
//
// 解决什么问题：prod_dim 里的 SITE_PROMOTION_PRODUCT_* 主题只有 4 个维度
//   （stat_time_day / qianchuan_product_id / stat_time_hour / order_platform），
//   不含商品名。于是「商品 3693487721747186086 花了 8,000 元」无法翻译成人话。
//
// 接口硬约束（2026-11-07 实测）：
//   ① filtering 必须是【对象】不是数组：传 [] 报 "Field must be set to object"。
//   ② aweme_id 必须放在【顶层】，放进 filtering 里会报 "请传入aweme_id后获取商品列表"。
//   ③ filtering 传空对象 {} 即可，不需要任何过滤条件。
//   ④ 返回键是 product_list（不是 list），已在 pickRows 之外单独处理。
//   ⑤ 同账户下不同 aweme_id 返回的商品列表【完全一致】（实测重叠 100/100），
//      所以每户只取一个 aweme_id 拉一次，不必按 590 个主播对逐个拉。
export const recipe = { id: "product_dim", schedule: "manual", requires: ["anchors"] };

const URL = "https://open.oceanengine.com/open_api/v1.0/qianchuan/uni_promotion/product/get/";

export function build(ctx) {
  const calls = [];
  // 每户取第一个授权抖音号即可（见约束 ⑤）
  const firstAweme = {};
  for (const [advId, list] of Object.entries(ctx.anchorMap || {})) {
    if (list.length) firstAweme[advId] = list[0].aweme_id;
  }
  // 没有授权主播的账户：仍然尝试一次，用账户维度查询（部分户可能不需要 aweme_id）
  for (const a of ctx.accounts || []) {
    const advId = String(a.advertiser_id);
    if (!firstAweme[advId]) continue;
    calls.push({
      name: `product-${advId}`,
      url: URL,
      params: {
        advertiser_id: Number(advId),
        aweme_id: String(firstAweme[advId]),
        filtering: {}, // 必须是对象，且不能省略
        page: 1,
        page_size: 100,
      },
      paged: true,
      // 同 material_meta：无时间参数，不加 noCache 会被 isWithinWindow() 永久 SKIP
      noCache: true,
    });
  }
  return { calls };
}

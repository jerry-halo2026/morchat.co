// 台账：投放子账户清单（shop_id 维度，page_size<=100）
export const recipe = { id: "accounts", schedule: "manual", requires: [] };
const SHOP_ID = 59589091; // 李陌茶官方旗舰店（店铺账号）
export async function build(ctx) {
  const calls = [];
  for (let page = 1; page <= 3; page++) {
    calls.push({
      name: `accounts-p${page}`,
      url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/shop/advertiser/list/",
      params: { shop_id: SHOP_ID, page, page_size: 100 },
    });
  }
  return { calls };
}

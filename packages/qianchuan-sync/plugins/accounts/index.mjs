// 台账：投放子账户清单（SHOP_ID 从 config 读取，修复 #13）
import { getConfig } from "../../core/env.mjs";
export const recipe = { id: "accounts", schedule: "manual", requires: [] };
export async function build(ctx) {
  const { shopId } = getConfig();
  const calls = [];
  for (let page = 1; page <= 3; page++) {
    calls.push({
      name: `accounts-p${page}`,
      url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/shop/advertiser/list/",
      params: { shop_id: shopId, page, page_size: 100 },
      noCache: true,
    });
  }
  return { calls };
}

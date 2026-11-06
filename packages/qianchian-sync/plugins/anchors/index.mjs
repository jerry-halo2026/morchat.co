// 台账：每户授权主播清单（生成器模式 + 空页自动停，修复 #7：省~135调/次）
import { callOE } from "../../core/client.mjs";
export const recipe = { id: "anchors", schedule: "manual", requires: ["accounts"] };
export async function* build(ctx) {
  for (const a of ctx.accounts) {
    for (let page = 1; page <= 10; page++) {
      yield {
        name: `anchors-${a.advertiser_id}-p${page}`,
        url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/aweme_auth_list/get/",
        params: { advertiser_id: a.advertiser_id, page, page_size: 50 },
        stopIfEmpty: page > 1, // 第2页起空则停该户后续页
      };
    }
  }
}

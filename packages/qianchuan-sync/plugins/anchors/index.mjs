// 台账：每户授权主播清单（aweme_auth_list，page_size 枚举 {10,20,50}）
export const recipe = { id: "anchors", schedule: "manual", requires: ["accounts"] };
export async function build(ctx) {
  const calls = [];
  for (const a of ctx.accounts) {
    for (let page = 1; page <= 4; page++) {
      calls.push({
        name: `anchors-${a.advertiser_id}-p${page}`,
        url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/aweme_auth_list/get/",
        params: { advertiser_id: a.advertiser_id, page, page_size: 50 },
      });
    }
  }
  return { calls };
}

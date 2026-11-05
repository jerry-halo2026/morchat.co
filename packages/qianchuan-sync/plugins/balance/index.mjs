// 余额快照
export const recipe = { id: "balance", schedule: "manual", requires: ["accounts"] };
export async function build(ctx) {
  return { calls: ctx.accounts.map((a) => ({
    name: `balance-${a.advertiser_id}`,
    url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/account/balance/get/",
    params: { advertiser_id: a.advertiser_id },
  })) };
}

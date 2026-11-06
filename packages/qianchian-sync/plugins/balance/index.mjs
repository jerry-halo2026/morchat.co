export const recipe = { id: "balance", schedule: "manual", requires: ["accounts"] };
// 2026-11-06 v2：换批量接口 /v3.0/account/fund/get（实测单次可带多账户）
// 45 账户逐户调用 → 每 50 个账户 1 次调用
export async function build(ctx) {
  const ids = ctx.accounts.map((a) => a.advertiser_id);
  const calls = [];
  for (let i = 0; i < ids.length; i += 50) {
    calls.push({
      name: `balance-batch-${Math.floor(i / 50) + 1}`,
      url: "https://ad.oceanengine.com/open_api/v3.0/account/fund/get/",
      params: { account_ids: ids.slice(i, i + 50), account_type: "AD" },
    });
  }
  return { calls };
}

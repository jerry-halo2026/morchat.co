export const recipe = { id: "balance", schedule: "manual", requires: ["accounts"] };
// 2026-11-06 v2：换批量接口 /v3.0/account/fund/get（实测单次可带多账户）
// 45 账户逐户调用 → 每 50 个账户 1 次调用
export async function build(ctx) {
  // 2026-11-09 修复：safeJsonParse 会把 16 位 adv_id 转成字符串，
  // 而 v3.0 fund/get 严格要求 account_ids 为整数数组（报 "account_ids: 0: Field must be set to integer"）。
  // 账户 ID 均为 16 位（< 2^53 安全整数），转回 Number 无精度风险；异常值兜底跳过。
  const toInt = (x) => {
    const n = /^\d+$/.test(String(x)) ? Number(x) : NaN;
    return Number.isSafeInteger(n) ? n : null;
  };
  const ids = ctx.accounts.map((a) => toInt(a.advertiser_id)).filter((x) => x !== null);
  const skipped = ctx.accounts.length - ids.length;
  if (skipped) console.warn(`  ⚠️ balance: ${skipped} 个账户 ID 非法被跳过`);
  const calls = [];
  for (let i = 0; i < ids.length; i += 50) {
    calls.push({
      name: `balance-batch-${Math.floor(i / 50) + 1}`,
      url: "https://ad.oceanengine.com/open_api/v3.0/account/fund/get/",
      params: { account_ids: ids.slice(i, i + 50), account_type: "AD" },
      noCache: true, // 余额每天变，无时间参数→断点续传会永久跳过
    });
  }
  return { calls };
}

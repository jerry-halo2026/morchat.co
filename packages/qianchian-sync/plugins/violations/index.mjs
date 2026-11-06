export const recipe = { id: "violations", schedule: "manual", requires: ["accounts"] };
export async function build(ctx) {
  const calls = [];
  for (const a of ctx.accounts) {
    calls.push({
      name: `violations-${a.advertiser_id}`,
      url: "https://ad.oceanengine.com/open_api/v3.0/security/score_violation_event/get/",
      params: { advertiser_id: a.advertiser_id, business_line: "QIANCHUAN", page: 1, page_size: 100 },
      paged: true,
    });
  }
  return { calls };
}

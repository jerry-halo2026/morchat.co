// 临时：看非法主题的完整报错，是否吐出允许值全集
import { callOE } from "../core/client.mjs";

const ADV = 1786139492330569;
const U = "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/config/get/";
const r = await callOE(U, { advertiser_id: ADV, data_topics: ["SITE_PROMOTION_NONSENSE_XXX"] }, { retries: 0 });
console.log("code:", r.body.code);
console.log("message 全文:\n", r.body.message);
console.log("\n全部 key:", Object.keys(r.body));
console.log("\n原始 JSON:\n", JSON.stringify(r.body).slice(0, 4000));

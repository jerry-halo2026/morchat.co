// 重新拉取字段词表（修复后的引擎自带翻页和 token 短路）
import { callOE } from "./core/client.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "./core/env.mjs";

const topics = [
  "SITE_PROMOTION_POST_DATA_LIVE",
  "SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE",
  "SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO",
];

const { body } = await callOE(
  "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/config/get/",
  { advertiser_id: 1742478706540547, data_topics: JSON.stringify(topics) }
);

if (body.code === 0) {
  const p = join(PKG, "data", "qc-uni-config-20261104.json");
  mkdirSync(join(PKG, "data"), { recursive: true });
  writeFileSync(p, JSON.stringify(body, null, 1), "utf8");
  console.log(`✅ 词表写入: ${p} (${(JSON.stringify(body).length / 1024).toFixed(0)}KB)`);
} else {
  console.error(`❌ code=${body.code} ${body.message}`);
  process.exit(1);
}

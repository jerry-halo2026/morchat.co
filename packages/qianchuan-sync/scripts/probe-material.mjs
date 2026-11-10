// 素材元数据接口探测（2026-11-07）
// 目标：确认 video/get / image/get / carousel/get / material_attributes 的真实参数与返回字段
import { callOE } from "../core/client.mjs";

const ADV = 1792203326280778;
const BASE = "https://open.oceanengine.com";

async function probe(name, url, params) {
  try {
    const r = await callOE(BASE + url, params, { retries: 0 });
    const b = r.body;
    console.log("\n### " + name);
    console.log("  url:", url);
    console.log("  code:", b.code, "| msg:", (b.message || "").slice(0, 100));
    if (b.code !== 0) return null;
    const d = b.data || {};
    console.log("  data keys:", Object.keys(d).join(", "));
    // 找到列表所在的键
    let list = null, listKey = "";
    for (const k of Object.keys(d)) {
      if (Array.isArray(d[k])) { list = d[k]; listKey = k; break; }
    }
    if (!list) { console.log("  (无数组字段)"); return d; }
    console.log("  列表键:", listKey, "| 条数:", list.length);
    if (list[0]) {
      console.log("  行字段:", Object.keys(list[0]).join(", "));
      console.log("  首行:", JSON.stringify(list[0]).slice(0, 900));
    }
    return d;
  } catch (e) {
    console.log("\n### " + name + "  ✗ " + e.message);
    return null;
  }
}

const MID = "7683080817870929974";
const IMID = "7682310233544704050";

// 1) 视频素材库
await probe("video/get (按 material_ids)", "/open_api/v1.0/qianchuan/video/get/", {
  advertiser_id: ADV, material_ids: [MID], page: 1, page_size: 10,
});

// 2) 图片素材库
await probe("image/get (按 material_ids)", "/open_api/v1.0/qianchuan/image/get/", {
  advertiser_id: ADV, material_ids: [IMID], page: 1, page_size: 10,
});

// 3) 图文素材库
await probe("carousel/get", "/open_api/v1.0/qianchuan/carousel/get/", {
  advertiser_id: ADV, page: 1, page_size: 10,
});

// 4) 视频素材评估标签（新版，最有价值）
await probe("material_attributes/list", "/open_api/2/file/material_attributes/list/", {
  advertiser_id: ADV, material_ids: [MID], page: 1, page_size: 10,
});

// 5) 低效素材
await probe("file/video/efficiency/get", "/open_api/v1.0/qianchuan/file/video/efficiency/get/", {
  advertiser_id: ADV, material_ids: [MID],
});

// 6) 首发素材
await probe("file/video/original/get", "/open_api/v1.0/qianchuan/file/video/original/get/", {
  advertiser_id: ADV, material_ids: [MID],
});

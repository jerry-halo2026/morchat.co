// 素材质量标记（2026-11-07 新增）
//
// 目的：补上「这条素材为什么不行」的唯一官方信号——低效判定与首发判定。
//
// 两个接口的共同点：**必须传素材 ID 列表，只返回命中的那部分**。
// 所以不能像素材库那样全量拉，必须先有 ID 来源。ID 来自 uni_video.csv
// 的 dim_id（真正投过的素材），比素材库全量小一个数量级。
//
// 实测（2026-11-07）：
//   - 单批 100 个 ID 正常；返回 original_material_ids / inefficient_material_ids
//   - 返回的 ID 是**字符串**（精确，无精度问题）
//   - 大量素材不被判定时返回空数组，属正常
//
// 成本：6,805 个投放素材 / 100 = 68 批 × 2 接口 ≈ 136 次调用。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../../core/env.mjs";

export const recipe = { id: "material_flag", schedule: "manual", requires: ["accounts"] };

const ENDPOINTS = {
  inefficient: "https://open.oceanengine.com/open_api/v1.0/qianchuan/file/video/efficiency/get/",
  original: "https://open.oceanengine.com/open_api/v1.0/qianchuan/file/video/original/get/",
};

/** 从已拍平的 uni_video.csv 取「该账户投过的素材 ID」 */
function usedIdsByAccount() {
  const p = join(PKG, "data", "flat", "uni_video.csv");
  if (!existsSync(p)) return {};
  const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
  const head = lines[0].split(",");
  const iA = head.indexOf("account_id"), iD = head.indexOf("dim_id");
  if (iA < 0 || iD < 0) return {};
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    const id = c[iD];
    if (!id || id === "null" || id === "-") continue;
    (out[c[iA]] = out[c[iA]] || new Set()).add(id);
  }
  return out;
}

export function build(ctx) {
  const byAcct = usedIdsByAccount();
  const calls = [];
  const CHUNK = 100;

  for (const a of ctx.accounts || []) {
    const advId = String(a.advertiser_id);
    const ids = [...(byAcct[advId] || [])];
    if (!ids.length) continue;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const batch = i / CHUNK;
      for (const [tag, url] of Object.entries(ENDPOINTS)) {
        calls.push({
          name: `flag_${tag}-${advId}-${batch}`,
          url,
          params: { advertiser_id: Number(advId), material_ids: chunk },
          // 无时间参数 → 不加 noCache 会被 runner 永久 SKIP
          noCache: true,
        });
      }
    }
  }
  return { calls };
}

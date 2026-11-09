// 账户口径对账（recon）：用官方账户维度报表给素材级数据做兜底校验
//
// 口径演进：
//   v1 (11-07)：report/uni_promotion/get/ + marketing_goal 汇总 —— 11-07 后服务端
//     对全部 45 户返回 0 行（参数变体/旧窗口实测均空），已废弃。
//   v2 (11-09 上午)：report/uni_promotion/data/get/ + OVERALL_ROI_* 按天聚合 ——
//     实测只覆盖全域推广消耗，素材线大户（乔续续）返回 0，不能当账户真值，废弃。
//   v3 (11-09 下午)：report/all_promotion/get/（官方文档：查询千川投放账户账号下
//     包含乘方计划时的聚合数据）—— 实测才是账户级全口径：
//       乔续续(全域户) UNI_PROJECT=1,015,368.54 vs 素材线 676,509（素材线只是子集）
//       欧海涵-商品卡  UNI=48,687.78 + OVERALL=4,611.42 = 53,299.20
//     账户总口径 = adlab_scene∈{UNI_PROJECT, OVERALL_PROJECT} 两次调用之和。
//   硬约束（文档 + 实测）：
//     · fields 只能用 stat_cost_for_roi2 / total_pay_order_gmv_for_roi2 /
//       total_pay_order_count_for_roi2 等应答指标（传 stat_cost 报 50000）
//     · start_time/end_time 必须带时分秒
//     · adlab_scene / marketing_goal / order_platform 必填
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../../core/env.mjs";

export const recipe = { id: "recon", schedule: "manual", requires: ["accounts"] };

const URL_ = "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/all_promotion/get/";

const SCENES = [
  { goal: "UNI", scene: "UNI_PROJECT" },      // 全域计划
  { goal: "OVERALL", scene: "OVERALL_PROJECT" }, // 乘方计划
];

function accounts() {
  const p = join(PKG, "data", "flat", "accounts.csv");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").slice(1).filter(Boolean)
    .map((l) => l.split(",")).map((c) => ({ id: c[0], name: c[1] }));
}

export async function build(ctx) {
  const win = ctx.reportWindow || ctx.window;
  const calls = [];
  for (const a of accounts()) {
    for (const s of SCENES) {
      calls.push({
        name: `recon-${a.id}-${s.goal}`,
        url: URL_,
        params: {
          advertiser_id: Number(a.id),
          start_time: `${win.from} 00:00:00`,
          end_time: `${win.to} 23:59:59`,
          adlab_scene: s.scene,
          marketing_goal: "ALL",
          order_platform: "ALL",
          fields: ["stat_cost_for_roi2", "total_pay_order_gmv_for_roi2", "total_pay_order_count_for_roi2"],
        },
        noCache: false, // 有时间参数，isWithinWindow 正常判窗，断点续传可用
      });
    }
  }
  return { calls };
}

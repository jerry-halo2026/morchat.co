// 千川操作日志：谁在什么时候关停了计划、改了预算、加了素材追投
//
// 为什么这是刚需（2026-11-07）：
//   现有数据能证明"消耗在 11/05 14:00 断崖式下跌"，但证不了"为什么"。
//   操作日志是唯一能还原「关停 → 重开 → 再关停」时间线的接口。
//
// 实测硬约束：
//   · object_type 必填，只有 AD / ACCOUNT
//   · object_type=AD 时 object_id 必填 → 只能按计划逐个查
//   · **page_size 上限 20**（传 50 报 "number must be most 20"）
//   · 返回键是 data.logs（不是 list/rows）→ pickRows 已补
//   · 单计划日志量惊人：某计划一个月 791 条 → 全量拉 270 个计划要上万次调用，不可行
//   · ACCOUNT 级用 start_time/end_time（传 start_date 会报 strptime None）
//
// 因此采集策略：只查「近期真花过钱」的计划，每个最多取 3 页（60 条，覆盖最近操作）。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../../core/env.mjs";

export const recipe = { id: "oplog", schedule: "weekly", requires: ["accounts", "plans"] };

const MAX_PAGES = 3;
const PAGE_SIZE = 20;

/** 从落地的维度表里找「近窗口有消耗」的计划，避免对 269 个计划全量扫 */
function activePlans() {
  const out = new Map();
  const files = [
    ["prod_dim.csv", ["plan"]],
    ["overall.csv", ["p-plan"]],
  ];
  for (const [f, tags] of files) {
    const p = join(PKG, "data", "flat", f);
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
    const h = lines[0].split(",");
    const iTag = h.indexOf("topic_tag"), iDim = h.indexOf("dim_id"), iAcct = h.indexOf("account_id");
    const iCost = h.indexOf("stat_cost") >= 0 ? h.indexOf("stat_cost") : h.indexOf("stat_cost_for_roi2");
    for (const l of lines.slice(1)) {
      const c = l.split(",");
      if (!tags.includes(c[iTag])) continue;
      if (!(Number(c[iCost]) > 0)) continue;
      if (!c[iDim] || c[iDim] === "null") continue;
      out.set(`${c[iAcct]}:${c[iDim]}`, { acct: c[iAcct], plan: c[iDim] });
    }
  }
  return [...out.values()];
}

export async function build(ctx) {
  const win = ctx.reportWindow || ctx.window;
  const st = `${win.from} 00:00:00`, et = `${win.to} 23:59:59`;
  const calls = [];

  // ① 账户级：改预算、充值、授权变更（量小，1 页足够）
  for (const a of ctx.accounts || []) {
    calls.push({
      name: `oplog-acct-${a.advertiser_id}`,
      url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/tools/log_search/",
      params: { advertiser_id: Number(a.advertiser_id), object_type: "ACCOUNT", start_time: st, end_time: et, page_size: PAGE_SIZE },
      paged: true, maxPages: 2,
    });
  }
  // ② 计划级：关停/开启/改出价/素材追投 —— 唯一能解释消耗突变的证据
  for (const p of activePlans()) {
    calls.push({
      name: `oplog-ad-${p.acct}-${p.plan}`,
      url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/tools/log_search/",
      params: {
        advertiser_id: Number(p.acct), object_type: "AD", object_id: Number(p.plan),
        start_time: st, end_time: et, page_size: PAGE_SIZE,
      },
      paged: true, maxPages: MAX_PAGES,
    });
  }
  return { calls };
}

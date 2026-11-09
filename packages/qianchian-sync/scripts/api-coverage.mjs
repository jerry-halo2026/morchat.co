#!/usr/bin/env node
// 接口全景分类：把 175 个官方接口切成「能取数的」和「只能操作的」，再按业务域归堆
//
// 为什么需要：文档只按功能分组（资金管理 25 个），不区分"读"和"写"。
// 25 个资金接口里有 18 个是转账/充值/建钱包（写），只有 7 个能取数。
// 不切开就会误以为"才接了 6 个接口"而下错判断。
//
// 用法：node scripts/api-coverage.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";

const inv = JSON.parse(readFileSync(join(PKG, "data", "qianchuan-api-inventory.json"), "utf8"));

// 写操作词根：path 里出现即视为"操作类"，不产生数据
const WRITE_ROOTS = ["/create/", "/update/", "/delete/", "/add/", "/submit/", "/remove/", "/apply/",
  "/upload/", "/transfer/", "/charge/", "/set/", "/set_callback/", "/refresh_token/", "/bind/", "/unbind/"];
const READ_HINT = ["/get/", "/list/", "/query/", "/search/", "/report/", "/detail/", "/config/", "/info/"];

// 已接入的接口（path 精确匹配，来自 plugins/*/index.mjs 的实际调用）
const USED_PATHS = new Set([
  "/open_api/oauth2/advertiser/get/",
  "/open_api/v1.0/qianchuan/shop/advertiser/list/",
  "/open_api/v1.0/qianchuan/aweme_auth_list/get/",
  "/open_api/v1.0/qianchuan/uni_promotion/list/",
  "/open_api/v1.0/qianchuan/report/uni_promotion/data/get/",
  "/open_api/v1.0/qianchuan/report/uni_promotion/config/get/",
  "/open_api/v1.0/qianchuan/report/uni_promotion/get/",
  "/open_api/v3.0/account/fund/get/",
  "/open_api/v3.0/security/score_violation_event/get/",
]);

function kind(a) {
  const p = a.path.toLowerCase();
  if (WRITE_ROOTS.some((w) => p.includes(w))) return "write";
  if (READ_HINT.some((w) => p.includes(w))) return "read";
  return a.method === "GET" ? "read?" : "write?";
}

// 业务域重划，按"要回答什么业务问题"归堆，而不是照抄文档分组
const DOMAIN_RULES = [
  ["账户", /advertiser|shop\/advertiser|ebp|customer_center|agent\/info|user\/info|oauth2\/advertiser/],
  ["授权", /aweme_auth|shop_auth|uni_promotion\/auth/],
  ["计划", /uni_promotion\/(ad|promotion)\/(detail|list|material|product|suggestion)|ad\/(learing|compensate|quota)|overall_aweme/],
  ["报表-素材", /report\/uni_promotion\/data/],
  ["报表-账户", /report\/(all_promotion|uni_promotion\/get)|report\/live|dimension_data|long_transfer/],
  ["报表-直播大屏", /today_live/],
  ["商品", /product|promshop/],
  ["素材库", /video|image|carousel|material/],
  ["财务", /fund|finance|wallet|balance|billing|cg_transfer|remittance|charge/],
  ["预算", /budget/],
  ["违规/积分", /security\//],
  ["评论", /comment/],
  ["定向/工具", /orientation|interest_action|creative_word|tools\//],
  ["调控", /control_task/],
  ["随心推", /aweme\/uni_promotion/],
  ["订阅", /subscribe|callback/],
  ["Token", /oauth2\/(access|refresh)_token|user\/info/],
];

function domain(a) {
  for (const [name, re] of DOMAIN_RULES) if (re.test(a.path)) return name;
  return "其他";
}

const rows = inv.apis.map((a) => ({
  group: a.group,
  title: a.title,
  path: a.path,
  method: a.method,
  kind: kind(a),
  domain: domain(a),
  used: USED_PATHS.has(a.path) || a.used,
}));

const readOnly = rows.filter((r) => r.kind === "read" || r.kind === "read?");
const writeOnly = rows.filter((r) => r.kind === "write" || r.kind === "write?");

console.log(`接口总数 ${rows.length}：读 ${readOnly.length} / 写 ${writeOnly.length}`);
console.log(`已接 ${rows.filter((r) => r.used).length} 个\n`);

// 按业务域汇总读接口
const byDomain = {};
for (const r of readOnly) (byDomain[r.domain] ||= []).push(r);

console.log("业务域".padEnd(16) + "读接口".padStart(6) + " 已接" + "  未接清单");
for (const [d, list] of Object.entries(byDomain).sort((a, b) => b[1].length - a[1].length)) {
  const used = list.filter((r) => r.used);
  const unused = list.filter((r) => !r.used);
  console.log(`\n${d.padEnd(15)} ${String(list.length).padStart(6)} ${String(used.length).padStart(4)}`);
  for (const r of list) console.log(`   ${r.used ? "✅" : "  "} ${r.method.padEnd(4)} ${r.path}  # ${r.title}`);
}

// 落一份结构化清单
writeFileSync(join(PKG, "data", "api-coverage.json"), JSON.stringify({
  generated_at: new Date().toISOString(),
  total: rows.length,
  read: readOnly.length,
  write: writeOnly.length,
  used: rows.filter((r) => r.used).length,
  byDomain: Object.fromEntries(Object.entries(byDomain).map(([d, l]) => [d, {
    total: l.length,
    used: l.filter((r) => r.used).map((r) => r.path),
    unused: l.filter((r) => !r.used).map((r) => ({ method: r.method, path: r.path, title: r.title })),
  }])),
}, null, 1), "utf8");
console.log("\n→ data/api-coverage.json");

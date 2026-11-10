// 从千川官方文档站抓全量接口清单（免登录）
// 文档树来自 skiff/api/doc/client/tree/get/，节点详情来自 node/get/，abstract 里含 interface_path/method
// 用法：node scripts/fetch-api-inventory.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const KEY = "1af4244b2d2b3fa114d4917a957656608ee79223de7717ec29a3e0d0ebea279a";
const LABEL = 2; // 巨量千川
const BASE = "https://open.oceanengine.com/skiff/api/doc/client";
const OUT_DIR = "data";
const CACHE = join(OUT_DIR, "doc-nodes-cache.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(600 * (i + 1));
    }
  }
}

// 1) 文档树
let tree;
const treePath = join(OUT_DIR, "doc-tree-qc.json");
if (existsSync(treePath)) {
  tree = JSON.parse(readFileSync(treePath, "utf8"));
  console.log("复用本地文档树", treePath);
} else {
  tree = await getJSON(`${BASE}/tree/get/?label_id=${LABEL}&identify_key=${KEY}`);
  writeFileSync(treePath, JSON.stringify(tree));
}

const nodes = [];
(function walk(x, group) {
  const title = (x.title || "").trim().replace(/\s+/g, " ");
  const kids = x.child_docs || [];
  nodes.push({ doc_id: String(x.doc_id), title, group });
  for (const c of kids) walk(c, kids.length ? title : group);
})({ child_docs: tree.data.primary_doc_list, title: "ROOT" }, "ROOT");
const leaves = nodes.filter((n) => n.doc_id && n.title !== "ROOT");

// 2) 节点详情（带缓存，支持断点续跑）
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
let fetched = 0;
for (const n of leaves) {
  if (cache[n.doc_id] !== undefined) continue;
  try {
    const j = await getJSON(`${BASE}/node/get/?language=CHINESE&doc_id=${n.doc_id}&identify_key=${KEY}`);
    let abs = j?.data?.abstract;
    if (typeof abs === "string") {
      try { abs = JSON.parse(abs); } catch { abs = { title: n.title }; }
    }
    cache[n.doc_id] = { title: j?.data?.title || n.title, abstract: abs || {}, path: j?.data?.path };
    fetched++;
    if (fetched % 20 === 0) {
      writeFileSync(CACHE, JSON.stringify(cache));
      console.log(`  已抓 ${fetched} 篇…`);
    }
  } catch (e) {
    cache[n.doc_id] = { title: n.title, error: String(e.message || e) };
  }
  await sleep(120);
}
writeFileSync(CACHE, JSON.stringify(cache));

// 3) 汇总：只保留真正是接口的条目
const apis = [];
for (const n of leaves) {
  const c = cache[n.doc_id];
  const a = c?.abstract || {};
  if (!a.interface_path) continue;
  apis.push({
    doc_id: n.doc_id,
    title: c.title || n.title,
    group: n.group,
    api_id: a.id || "",
    method: a.method || "",
    path: a.interface_path,
    risk: a.risk_level || "",
    summary: (a.capability_summary || "").replace(/\s+/g, " "),
  });
}

// 4) 对照已接入的端点
const USED = [
  "/open_api/v1.0/qianchuan/shop/advertiser/list/",
  "/open_api/v1.0/qianchuan/aweme_auth_list/get/",
  "/open_api/v1.0/qianchuan/uni_promotion/list/",
  "/open_api/v1.0/qianchuan/report/uni_promotion/data/get/",
  "/open_api/v3.0/account/fund/get/",
  "/open_api/v3.0/security/score_violation_event/get/",
];
const usedNorm = new Set(USED.map((u) => u.replace("/open_api", "")));
for (const a of apis) {
  a.used = usedNorm.has(a.path) || USED.some((u) => u.endsWith(a.path.replace("/open_api", "")));
}

const inv = {
  generated_at: new Date().toISOString(),
  label: "巨量千川",
  doc_nodes: leaves.length,
  api_count: apis.length,
  used_count: apis.filter((a) => a.used).length,
  apis,
};
writeFileSync(join(OUT_DIR, "qianchuan-api-inventory.json"), JSON.stringify(inv, null, 1));

console.log(`\n文档节点 ${leaves.length} 篇，其中接口 ${apis.length} 个，已接入 ${inv.used_count} 个`);
const byGroup = {};
for (const a of apis) byGroup[a.group] = (byGroup[a.group] || 0) + 1;
for (const [g, n] of Object.entries(byGroup)) console.log(`  ${String(n).padStart(3)}  ${g}`);

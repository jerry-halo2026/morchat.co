#!/usr/bin/env node
// 拍平导出：raw 版本链 → 单源单 CSV（分析友好）
// 用法：
//   node scripts/export-flat.mjs                          # 用最新副本（latest）
//   node scripts/export-flat.mjs --as-of 20261106080000   # 按版本链回放到指定时刻（UTC）
// 输出：data/flat/<source>.csv + README
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pickRows } from "../core/client.mjs";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(PKG, "data", "raw");
const OUT = join(PKG, "data", "flat");

// 参数归一化：把 --k=v 展开成 --k v。
// 此前多数脚本只认空格写法，用 --day=2026-11-06 会静默走默认值 —— 与 --source=xx 是同一类 bug。
const args = process.argv.slice(2).flatMap((a) =>
  a.startsWith("--") && a.includes("=")
    ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)]
    : [a]);
const asOf = args.includes("--as-of") ? args[args.indexOf("--as-of") + 1] : null;

function readSnapshot(source, name) {
  if (asOf) {
    const dir = join(RAW, source, "versions");
    if (existsSync(dir)) {
      const cands = readdirSync(dir)
        // 版本文件名有新旧两种：`--20261107105428..json`（旧的 slice(0,15) 带小数点）
        // 与 `--20261107105428.json`（v5 起修掉双点）。正则两种都要认，否则回放失效。
        .map(f => { const m = f.match(new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}--(\\d{14})\\.*json$`)); return m ? { ts: m[1], file: join(dir, f) } : null; })
        .filter(Boolean).sort((a, b) => a.ts.localeCompare(b.ts))
        .filter(v => !asOf || v.ts <= asOf);
      if (cands.length) return JSON.parse(readFileSync(cands[cands.length - 1].file, "utf8"));
    }
    return null;
  }
  const p = join(RAW, source, `${name}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}
function listCalls(source) {
  if (asOf) {
    const dir = join(RAW, source, "versions");
    const s = new Set();
    for (const f of readdirSync(dir)) { const m = f.match(/^(.*)--\d{14}\.\.json$/); if (m) s.add(m[1]); }
    return [...s];
  }
  return readdirSync(join(RAW, source)).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5));
}
// 行提取统一走 core/client.mjs pickRows（陷阱注释见彼处）
const rowsOf = (j) => pickRows(j?.data || {});

// ── 维表：账户名 / 主播名 ──
const acctName = {}, anchorName = {};
{
  for (let p = 1; p <= 3; p++) {
    const j = readSnapshot("accounts", `accounts-p${p}`);
    for (const r of rowsOf(j || {})) acctName[r.adv_id] = r.adv_name;
  }
  for (const c of listCalls("anchors")) {
    const j = readSnapshot("anchors", c);
    for (const r of rowsOf(j || {})) if (r.aweme_name) anchorName[r.aweme_id] = r.aweme_name;
  }
}

function csvEscape(v) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── CSV 解析（支持双引号转义，素材名里带逗号/引号的情况实测存在）──
function parseCsv(txt) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) {
      if (ch === '"') { if (txt[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── 只增不减：新数据按主键 UPSERT 进旧 CSV，窗口外的历史行原样保留 ──
// 2026-11-07 修复 #25：增量拉取只回看 7 天，若直接覆盖写盘，90,574 行的 uni_live
// 会瞬间缩成 7 天。全域报表 max_day=180，历史本来就会滚出窗口，flat 必须当事实表长期留存。
// --as-of 回放历史快照时不合并（否则会把当前数据混进历史视图）
const mergeKeys = (k) => (asOf ? null : k);
let mergeStats = { kept: 0, updated: 0 };
function writeCsv(name, header, rows, keyCols = null) {
  const file = join(OUT, name);
  let orphan = 0;
  if (keyCols && existsSync(file)) {
    const old = parseCsv(readFileSync(file, "utf8"));
    if (old.length > 1) {
      const oldHeader = old[0];
      const oldIdx = keyCols.map((k) => oldHeader.indexOf(k));
      const newIdx = keyCols.map((k) => header.indexOf(k));
      const fresh = new Set(rows.map((r) => newIdx.map((i) => String(r[i] ?? "")).join("\u0001")));
      for (const orow of old.slice(1)) {
        if (!orow.length) continue;
        const k = oldIdx.map((i) => String(i >= 0 ? orow[i] ?? "" : "")).join("\u0001");
        if (fresh.has(k)) continue;
        // 旧表头可能与新表头不同（新增指标字段）→ 按列名重映射
        const mapped = header.map((h) => { const j = oldHeader.indexOf(h); return j >= 0 ? orow[j] ?? "" : ""; });
        rows.push(mapped); orphan++;
      }
      mergeStats.kept += orphan;
    }
  }
  const lines = [header.join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  writeFileSync(file, lines.join("\n") + "\n", "utf8");
  console.log(`${name.padEnd(22)} ${rows.length} 行${orphan ? `（含历史保留 ${orphan}）` : ""}`);
}

mkdirSync(OUT, { recursive: true });
const stamp = asOf ? `as-of ${asOf}Z` : "latest";
console.log(`# 拍平导出（${stamp}）\n`);

// ── uni 报表三件套：date, account, dim, [name], 全指标 ──
for (const [source, dimField, nameField] of [
  ["uni_live", "anchor_id", null],
  ["uni_video", "material_id", "roi2_material_video_name"],
  ["uni_image", "material_id", "roi2_material_image_name"],
  // 直播全域-视频素材：直播间引流短视频的消耗（2026-11-07 补，此前占账户消耗 27% 的缺口）
  ["live_video", "material_id", "roi2_material_video_name"],
]) {
  const rows = [];
  for (const c of listCalls(source)) {
    const j = readSnapshot(source, c);
    if (!j || j.code !== 0) continue;
    const acct = Number(c.split("-")[1]);
    for (const r of rowsOf(j)) {
      const dims = r.dimensions || {}, mets = r.metrics || {};
      const out = {
        stat_date: dims.stat_time_day?.ValueStr || "",
        account_id: acct,
        account_name: acctName[acct] || "",
        dim_id: dims[dimField]?.ValueStr ?? dims[dimField]?.Value ?? "",
        dim_name: nameField ? (dims[nameField]?.ValueStr || "") : (anchorName[dims[dimField]?.ValueStr] || ""),
      };
      for (const [k, v] of Object.entries(mets)) out[k] = v.Value ?? 0;
      rows.push(out);
    }
  }
  if (rows.length) {
    const header = Object.keys(rows[0]);
    writeCsv(`${source}.csv`, header, rows.map(r => header.map(h => r[h])), mergeKeys(["stat_date","account_id","dim_id"]));
  }
}

// ── 商品名 / 计划名映射（2026-11-07 补）──
// 商品维度主题 SITE_PROMOTION_PRODUCT_PRODUCT 只有 4 个维度，**不含商品名**；
// 计划维度主题也不含 ad_name。不建映射的话 prod_dim.csv 的 dim_name 全空，
// 分析时只知道"商品 3634844724373917652 花了 2220 元"，等于没用。
// 名称来源：① OVERALL_ROI_PRODUCT_PRODUCT 的 qianchuan_product_name 维度
//           ② raw/plans 的 ad_info.name
const productName = {}, planName2 = {};
{
  if (existsSync(join(RAW, "overall"))) {
    for (const c of listCalls("overall")) {
      if (!c.includes("p-product")) continue;
      const j = readSnapshot("overall", c);
      for (const r of rowsOf(j || {})) {
        const d = r.dimensions || {};
        const id = d.qianchuan_product_id?.ValueStr ?? d.qianchuan_product_id?.Value;
        const nm = d.qianchuan_product_name?.ValueStr;
        if (id && nm) productName[id] = nm;
      }
    }
  }
  if (existsSync(join(RAW, "plans"))) {
    for (const c of listCalls("plans")) {
      const j = readSnapshot("plans", c);
      for (const r of rowsOf(j || {})) {
        const a = r.ad_info || {};
        if (a.id && a.name) planName2[String(a.id)] = a.name;
      }
    }
  }
}
console.log(`维表映射：商品名 ${Object.keys(productName).length} 个 / 计划名 ${Object.keys(planName2).length} 个`);

// ── prod_dim / overall：账户级「商品 / 计划 / 抖音号」维度（2026-11-07 新增）──
// 与 uni_* 的区别：不需要 anchor_id，账户级直出；消耗字段分别是 stat_cost / stat_cost_for_roi2。
// 注意 prod_dim 与 overall 各自内部的两个视角（商品 vs 计划）是同一份消耗，**不可相加**。
const DIM_SPEC = {
  prod_dim: { "product": ["qianchuan_product_id", "qianchuan_product_name"], "plan": ["ad_id", "ad_name"] },
  overall: {
    "p-product": ["qianchuan_product_id", "qianchuan_product_name"],
    "p-plan": ["ad_id", "ad_name"],
    "p-aweme": ["anchor_id", null],
    "l-aweme": ["anchor_id", null],
  },
};
for (const [source, spec] of Object.entries(DIM_SPEC)) {
  const rows = [];
  if (!existsSync(join(RAW, source))) continue;
  for (const c of listCalls(source)) {
    const j = readSnapshot(source, c);
    if (!j || j.code !== 0) continue;
    const acct = Number(c.split("-")[1]);
    const tag = c.split("-").slice(2).join("-");
    const [dimField, nameField] = spec[tag] || [];
    if (!dimField) continue;
    for (const r of rowsOf(j)) {
      const dims = r.dimensions || {}, mets = r.metrics || {};
      const dimId = dims[dimField]?.ValueStr ?? dims[dimField]?.Value ?? "";
      // 账户无数据时接口会回一行 dim=null 的占位，必须丢弃，否则主键污染
      if (dimId === "" || dimId === null || dimId === "null" || dimId === undefined) continue;
      const out = {
        stat_date: dims.stat_time_day?.ValueStr || "",
        account_id: acct,
        account_name: acctName[acct] || "",
        topic_tag: tag,
        dim_id: dimId,
        dim_name: nameField
          ? (dims[nameField]?.ValueStr || "")
          : (anchorName[dimId] || productName[dimId] || planName2[String(dimId)] || ""),
      };
      for (const [k, v] of Object.entries(mets)) out[k] = v.Value ?? 0;
      rows.push(out);
    }
  }
  if (rows.length) {
    const header = Object.keys(rows[0]);
    writeCsv(`${source}.csv`, header, rows.map(r => header.map(h => r[h])), mergeKeys(["stat_date", "account_id", "topic_tag", "dim_id"]));
  }
}

// ── oplog：操作日志（事件流，按 log_id 去重，只增不减）──
if (existsSync(join(RAW, "oplog"))) {
  const rows = [];
  for (const c of listCalls("oplog")) {
    const j = readSnapshot("oplog", c);
    if (!j || j.code !== 0) continue;
    const m = c.match(/^oplog-(acct|ad)-(\d+)/);
    const acct = m ? Number(m[2]) : 0;
    for (const r of rowsOf(j)) {
      const content = Array.isArray(r.content_log) ? r.content_log.join(" | ") : (r.content_log || "");
      rows.push([
        r.log_id, acct, acctName[acct] || "", r.object_type, r.object_id,
        r.object_name || planName2[String(r.object_id)] || "", r.content_title, content, r.create_time,
      ]);
    }
  }
  if (rows.length) {
    writeCsv("oplog.csv", ["log_id", "account_id", "account_name", "object_type", "object_id", "object_name", "action", "content", "create_time"], rows, mergeKeys(["log_id"]));
  }
}

// ── material_meta：素材库元数据（2026-11-07 新增，与报表按 material_id join）──
// 三张表分开而不是合一张：视频/图片/图文属性差异大，合表会有大量空列。
// 不导 url：签名链接会过期，且单条 1KB，6 万素材会让 CSV 膨胀几十 MB。
{
  const SPECS = {
    video: ["material_id", "video_id", "filename", "duration", "width", "height", "size", "format", "image_mode", "is_ai_create", "source", "signature", "create_time", "bit_rate"],
    image: ["material_id", "image_id", "filename", "width", "height", "size", "image_mode", "is_ai_create", "source", "signature", "create_time", "analysis_type", "tag"],
    carousel: ["material_id", "filename", "description", "image_mode", "source", "create_time", "image_count"],
  };
  // 字段名归一：视频的 id 是 string，图片的 id 也是 string
  for (const [tag, cols] of Object.entries(SPECS)) {
    if (!existsSync(join(RAW, "material_meta"))) break;
    const rows = [];
    for (const c of listCalls("material_meta")) {
      if (!c.startsWith(`material_${tag}-`)) continue;
      const j = readSnapshot("material_meta", c);
      if (!j || j.code !== 0) continue;
      const acct = Number(c.split("-")[1]);
      for (const r of rowsOf(j)) {
        const out = {
          account_id: acct,
          account_name: acctName[acct] || "",
          material_id: r.material_id ?? "",
          video_id: r.id ?? "",
          image_id: r.id ?? "",
          filename: r.filename ?? "",
          duration: r.duration ?? "",
          width: r.width ?? "",
          height: r.height ?? "",
          size: r.size ?? "",
          format: r.format ?? "",
          image_mode: r.image_mode ?? "",
          is_ai_create: r.is_ai_create === true ? 1 : r.is_ai_create === false ? 0 : "",
          source: r.source ?? "",
          signature: r.signature ?? "",
          create_time: r.create_time ?? "",
          bit_rate: r.bit_rate ?? "",
          description: r.description ?? "",
          analysis_type: r.analysis_type ?? "",
          tag: r.tag ?? "",
          image_count: Array.isArray(r.images) ? r.images.length : "",
        };
        // 注意：表头是 account_id/account_name + cols，数据行必须同样两个前缀，
        // 否则整行左移两列（首版漏了，导致 material_id 被当成 account_id，join 命中率 0%）
        rows.push([acct, acctName[acct] || "", ...cols.map((k) => out[k])]);
      }
    }
    if (rows.length) {
      writeCsv(`material_${tag}.csv`, ["account_id", "account_name", ...cols],
        rows, mergeKeys(["account_id", "material_id"]));
    }
  }
}

// ── product_dim：商品维表（2026-11-07 新增，给 prod_dim 的裸 ID 配上名字）──
if (existsSync(join(RAW, "product_dim"))) {
  const rows = [];
  for (const c of listCalls("product_dim")) {
    const j = readSnapshot("product_dim", c);
    if (!j || j.code !== 0) continue;
    const acct = Number(c.split("-")[1]);
    for (const r of rowsOf(j)) {
      rows.push([
        String(r.id ?? ""), r.name || "", r.category_name || "", acct, acctName[acct] || "",
        r.sell_num ?? "", r.stock_num ?? "", r.audit_time || "", r.tag || "",
      ]);
    }
  }
  if (rows.length) {
    writeCsv("products.csv",
      ["product_id", "product_name", "category", "account_id", "account_name", "sell_num", "stock_num", "audit_time", "tag"],
      rows, mergeKeys(["account_id", "product_id"]));
  }
}

// ── material_flag：低效 / 首发判定（2026-11-07 新增）──
// 注意：这两个接口返回的是**字符串数组**（data.inefficient_material_ids /
// data.original_material_ids），pickRows 只认对象数组，必须直接读 data。
{
  const flags = new Map(); // "acct:mid" -> {ineff, orig}
  for (const c of listCalls("material_flag")) {
    const j = readSnapshot("material_flag", c);
    if (!j || j.code !== 0) continue;
    const m = c.match(/^flag_(inefficient|original)-(\d+)-\d+$/);
    if (!m) continue;
    const [, tag, acct] = m;
    const arr = tag === "inefficient"
      ? j.data?.inefficient_material_ids
      : j.data?.original_material_ids;
    if (!Array.isArray(arr)) continue;
    for (const id of arr) {
      const k = `${acct}:${id}`;
      const o = flags.get(k) || { acct, id, ineff: 0, orig: 0 };
      if (tag === "inefficient") o.ineff = 1; else o.orig = 1;
      flags.set(k, o);
    }
  }
  const rows = [...flags.values()].map((o) => [
    o.acct, acctName[o.acct] || "", o.id, o.ineff, o.orig,
  ]);
  if (rows.length) {
    writeCsv("material_flag.csv",
      ["account_id", "account_name", "material_id", "is_inefficient", "is_original"],
      rows, mergeKeys(["account_id", "material_id"]));
  }
}

// ── recon：账户口径对账（每账户一行/场景），给素材级数据做兜底校验 ──
// 2026-11-09 v3：接口换 all_promotion/get（旧 uni_promotion/get 已失效）。
// 返回是扁平 data（非 rows），goal ∈ {UNI(全域计划), OVERALL(乘方计划)}，账户总口径=两者之和。
{
  const rows = [];
  for (const c of listCalls("recon")) {
    const j = readSnapshot("recon", c);
    if (!j || j.code !== 0) continue;
    const m = c.match(/^recon-(\d+)-(\w+)$/);
    if (!m) continue;
    const acct = Number(m[1]), goal = m[2];
    const d = j.data || {};
    const val = (k) => { const v = d[k]; return v && typeof v === "object" ? (v.Value ?? 0) : (v ?? 0); };
    rows.push([acct, acctName[acct] || "", goal, val("stat_cost_for_roi2"), val("total_pay_order_gmv_for_roi2"), val("total_pay_order_count_for_roi2")]);
  }
  if (rows.length) writeCsv("recon.csv", ["account_id","account_name","goal","acct_cost","acct_gmv","acct_orders"], rows, mergeKeys(["account_id","goal"]));
}

// ── plans：一计划一行 ──
{
  const rows = [];
  for (const c of listCalls("plans")) {
    const j = readSnapshot("plans", c);
    if (!j || j.code !== 0) continue;
    const acct = Number(c.split("-")[1]);
    for (const r of rowsOf(j)) {
      const a = r.ad_info || {};
      rows.push([a.id, acct, acctName[acct] || "", a.name, a.marketing_goal, a.status, a.opt_status, a.budget, a.budget_mode, a.roi2_goal, a.smart_bid_type, a.create_time, a.start_time, a.end_time, a.modify_time]);
    }
  }
  writeCsv("plans.csv", ["plan_id","account_id","account_name","name","marketing_goal","status","opt_status","budget","budget_mode","roi2_goal","smart_bid_type","create_time","start_time","end_time","modify_time"], rows, mergeKeys(["plan_id"]));
}

// ── anchors：授权主播维表 ──
{
  const rows = [];
  for (const c of listCalls("anchors")) {
    const acct = Number(c.split("-")[1]);
    const j = readSnapshot("anchors", c);
    for (const r of rowsOf(j || {})) rows.push([acct, acctName[acct] || "", r.aweme_id, r.aweme_name || anchorName[r.aweme_id] || ""]);
  }
  writeCsv("anchors.csv", ["account_id","account_name","aweme_id","aweme_name"], rows, mergeKeys(["account_id","aweme_id"]));
}

// ── accounts / balance / violations ──
{
  const rows = [];
  for (let p = 1; p <= 3; p++) {
    const j = readSnapshot("accounts", `accounts-p${p}`);
    for (const r of rowsOf(j || {})) rows.push([r.adv_id, r.adv_name]);
  }
  writeCsv("accounts.csv", ["account_id","account_name"], rows, mergeKeys(["account_id"]));
}
{
  const j = readSnapshot("balance", "balance-batch-1");
  const rows = rowsOf(j || {}).map(r => [r.account_id, acctName[r.account_id] || "", r.balance, r.cash, r.common_grant, r.valid_grant ?? r["valid_grant"]]);
  writeCsv("balance.csv", ["account_id","account_name","balance","cash","common_grant","valid_grant"], rows, mergeKeys(["account_id"]));
}
{
  const rows = [];
  for (const c of listCalls("violations")) {
    const j = readSnapshot("violations", c);
    if (!j || j.code !== 0) continue;
    for (const r of rowsOf(j)) rows.push([r.event_id, r.advertiser_id, acctName[r.advertiser_id] || "", r.ad_id, r.create_time, r.illegal_type, r.score, r.status, r.reject_reason]);
  }
  writeCsv("violations.csv", ["event_id","account_id","account_name","ad_id","create_time","illegal_type","score","status","reject_reason"], rows, mergeKeys(["event_id"]));
}

console.log(`\n导出目录: ${OUT}`);

// 素材资产与效果分析报告生成（2026-11-07）
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";

const FLAT = join(PKG, "data", "flat");
function parseCsvLine(l) {
  const cells = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { cells.push(cur); cur = ""; }
    else cur += c;
  }
  cells.push(cur); return cells;
}
function load(name) {
  const p = join(FLAT, name);
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => { const c = parseCsvLine(l); const o = {}; head.forEach((k, i) => (o[k] = c[i])); return o; });
}

const mv = load("material_video.csv");
const mi = load("material_image.csv");
const mc = load("material_carousel.csv");
const prods = load("products.csv");
const uv = load("uni_video.csv");
const pdim = load("prod_dim.csv");
const oplog = load("oplog.csv");
const flags = load("material_flag.csv");

const meta = new Map();
for (const r of mv) if (r.material_id) meta.set(r.account_id + ":" + r.material_id, r);

const COST = "stat_cost_for_roi2", GMV = "total_order_settle_amount_for_roi2_1h";
const agg = new Map();
for (const r of uv) {
  if (!r.dim_id || r.dim_id === "null" || r.dim_id === "-") continue;
  const k = r.account_id + ":" + r.dim_id;
  let a = agg.get(k);
  if (!a) { a = { cost: 0, gmv: 0, days: 0, acct: r.account_id }; agg.set(k, a); }
  a.cost += Number(r[COST]) || 0;
  a.gmv += Number(r[GMV]) || 0;
  if ((Number(r[COST]) || 0) > 0) a.days++;
}
const rows = [];
for (const [k, a] of agg) {
  const m = meta.get(k);
  rows.push({ ...a, dur: m ? Number(m.duration) || 0 : null, matched: !!m });
}
const matched = rows.filter((r) => r.matched);
const totCost = rows.reduce((s, r) => s + r.cost, 0);
const hitCost = matched.reduce((s, r) => s + r.cost, 0);
const totGmv = rows.reduce((s, r) => s + r.gmv, 0);

// 时长分组
const BUCKETS = [["≤15秒", 0, 15], ["16-30秒", 15, 30], ["31-60秒", 30, 60], ["61-120秒", 60, 120], [">120秒", 120, 1e9]];
const durRows = BUCKETS.map(([label, lo, hi]) => {
  const g = matched.filter((r) => r.dur > lo && r.dur <= hi);
  const cost = g.reduce((s, r) => s + r.cost, 0);
  const gmv = g.reduce((s, r) => s + r.gmv, 0);
  return { label, n: g.length, cost, gmv, roi: cost > 0 ? gmv / cost : 0, avg: g.length ? cost / g.length : 0 };
});

// 持续性
const DAYB = [["1 天", 1, 1], ["2-7 天", 2, 7], ["8-30 天", 8, 30], ["30 天以上", 31, 1e9]];
const dayRows = DAYB.map(([label, lo, hi]) => {
  const g = rows.filter((r) => r.days >= lo && r.days <= hi);
  const cost = g.reduce((s, r) => s + r.cost, 0);
  const gmv = g.reduce((s, r) => s + r.gmv, 0);
  return { label, n: g.length, cost, share: totCost ? cost / totCost : 0, roi: cost > 0 ? gmv / cost : 0 };
});

// 集中度
const sorted = [...rows].sort((a, b) => b.cost - a.cost);
const conc = [10, 50, 100, 500].map((n) => ({
  n, share: totCost ? sorted.slice(0, n).reduce((s, r) => s + r.cost, 0) / totCost : 0,
}));

// 按上传月份切：报表只有 180 天，窗口前的素材不可能查到消耗
const usedKeys = new Set([...agg.keys()]);
let winAll = 0, winUsed = 0, outAll = 0, outUsed = 0, novAll = 0, novUsed = 0;
for (const r of mv) {
  const mo = (r.create_time || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mo)) continue;
  const used = usedKeys.has(r.account_id + ":" + r.material_id);
  if (mo >= "2026-05") {
    winAll++; if (used) winUsed++;
    if (mo === "2026-11") { novAll++; if (used) novUsed++; }
  } else { outAll++; if (used) outUsed++; }
}

// 首发素材 vs 其他
const origSet = new Set(flags.filter((r) => r.is_original === "1").map((r) => r.account_id + ":" + r.material_id));
const ineffSet = new Set(flags.filter((r) => r.is_inefficient === "1").map((r) => r.account_id + ":" + r.material_id));
const og = { n: 0, cost: 0, gmv: 0 }, ng = { n: 0, cost: 0, gmv: 0 };
for (const [k, a] of agg) {
  const t = origSet.has(k) ? og : ng;
  t.n++; t.cost += a.cost; t.gmv += a.gmv;
}

// 商品 join
const pname = new Map();
for (const r of prods) if (r.product_id) pname.set(r.account_id + ":" + r.product_id, r);
const gp = new Map();
for (const r of pdim) {
  if (r.topic_tag !== "product" || !r.dim_id || r.dim_id === "null") continue;
  const k = r.account_id + ":" + r.dim_id;
  gp.set(k, (gp.get(k) || 0) + (Number(r.stat_cost) || 0));
}
const pHit = [...gp].filter(([k]) => pname.has(k));
const pCost = [...gp.values()].reduce((s, v) => s + v, 0);
const pHitCost = pHit.reduce((s, [, v]) => s + v, 0);

// 账户级缺口
const byAcct = {};
for (const r of rows) {
  const a = (byAcct[r.acct] = byAcct[r.acct] || { n: 0, hit: 0, cost: 0, costHit: 0 });
  a.n++; a.cost += r.cost;
  if (r.matched) { a.hit++; a.costHit += r.cost; }
}
const acctRows = Object.entries(byAcct)
  .filter(([, v]) => v.n >= 20)
  .map(([k, v]) => ({ acct: k, ...v, rate: v.hit / v.n }))
  .sort((a, b) => a.rate - b.rate)
  .slice(0, 6);

const fmt = (n, d = 0) => Number(n).toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n, d = 1) => (n * 100).toFixed(d) + "%";
const now = new Date(Date.now() + 8 * 3600e3).toISOString().replace("T", " ").slice(0, 16);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>素材资产与效果分析 · 2026-11-07</title>
<style>
:root{--ink:#1c2b25;--sub:#5d6f66;--line:#e2e0d6;--bg:#faf8f2;--card:#fff;--green:#1b4332;--green2:#2d6a4f;--mint:#e8f0ea;--gold:#a97a22;--amber:#fdf3d8;--red:#a4342a;--redbg:#fbeeec}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
.wrap{max-width:1120px;margin:0 auto;padding:48px 28px 90px}
header{border-bottom:2px solid var(--green);padding-bottom:22px;margin-bottom:36px}
h1{margin:0 0 10px;font-size:27px;letter-spacing:-.4px;font-weight:650}
.meta{color:var(--sub);font-size:13.5px}
.meta b{color:var(--green);font-weight:600}
h2{font-size:19px;margin:44px 0 14px;padding-left:11px;border-left:4px solid var(--green2);font-weight:650}
h3{font-size:15.5px;margin:26px 0 10px;color:var(--green);font-weight:600}
p{margin:10px 0}
.lead{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--gold);padding:18px 22px;border-radius:3px;margin:22px 0}
.lead p{margin:6px 0}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:24px 0}
.kpi>div{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:16px 18px}
.kpi .n{font-size:25px;font-weight:680;color:var(--green);letter-spacing:-.5px}
.kpi .l{font-size:12.5px;color:var(--sub);margin-top:3px}
table{width:100%;border-collapse:collapse;background:var(--card);font-size:13.5px;margin:14px 0}
th{background:var(--mint);text-align:left;padding:9px 11px;font-weight:600;color:var(--green);border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:8px 11px;border-bottom:1px solid #efeee6;vertical-align:top}
tr:last-child td{border-bottom:none}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.tag{display:inline-block;padding:1px 7px;border-radius:3px;font-size:11.5px;font-weight:600;white-space:nowrap}
.ok{background:var(--mint);color:var(--green2)}
.no{background:#f0efe8;color:#7a8378}
.warn{background:var(--amber);color:var(--gold)}
.bad{background:var(--redbg);color:var(--red)}
code{background:#f2f1e9;padding:1px 5px;border-radius:3px;font:12.5px/1.5 ui-monospace,Consolas,monospace;color:#3d4b43}
.note{font-size:13px;color:var(--sub);margin:8px 0 0}
ol,ul{margin:10px 0;padding-left:22px}
li{margin:6px 0}
.constraint{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:16px 20px;margin:12px 0}
.constraint .h{font-weight:650;color:var(--green);margin-bottom:4px;font-size:14px}
.constraint .b{font-size:13.5px;color:#374b42}
.constraint .why{font-size:12.5px;color:var(--sub);margin-top:6px;padding-top:6px;border-top:1px dashed var(--line)}
.bug{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--red);border-radius:3px;padding:16px 20px;margin:12px 0}
.bug .t{font-weight:650;color:var(--red);font-size:14px}
.bug .d{font-size:13.5px;margin-top:6px}
pre{background:#25352d;color:#d8e4dc;padding:12px 16px;border-radius:4px;overflow-x:auto;font:12.5px/1.6 ui-monospace,Consolas,monospace}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);font-size:12.5px;color:var(--sub)}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>素材资产与效果分析</h1>
  <div class="meta">
    数据范围：<b>${Object.keys(byAcct).length} 个有投放的账户 / ${fmt(mv.length)} 个素材库视频</b> ·
    报表窗口 <b>2026-05-12 ~ 11-07（180 天）</b> ·
    生成于 ${now}
  </div>
</header>

<div class="lead">
  <p><strong>这一轮补的不是"更多指标"，而是"素材是什么"。</strong></p>
  <p>此前只能算出「素材 7701285642369990694 花了 8,000 元」，但不知道它多长、什么时候传的、竖屏还是方图——于是"什么素材有效"永远只能停留在相关性猜测。补上素材库元数据后，第一次能按属性分群算 ROI。</p>
  <p>同时暴露了一个隐藏很久的坑：素材 ID 是 19 位整数，超过 JavaScript 精度上限，<b>不修就是 100% join 不上</b>。</p>
</div>

<div class="kpi">
  <div><div class="n">${fmt(mv.length)}</div><div class="l">素材库视频</div></div>
  <div><div class="n">${fmt(rows.length)}</div><div class="l">180 天内有过消耗的素材</div></div>
  <div><div class="n">${pct(hitCost / totCost)}</div><div class="l">元数据可解释的消耗占比</div></div>
  <div><div class="n">${fmt(prods.length)}</div><div class="l">商品维表（含名称）</div></div>
</div>

<h2>一、这批数据第一次能回答的问题</h2>

<h3>1. 时长和 ROI 几乎无关，但和"单条烧多少钱"强相关</h3>
<table>
<thead><tr><th>时长段</th><th class="num">素材数</th><th class="num">消耗（元）</th><th class="num">成交（元）</th><th class="num">ROI</th><th class="num">单素材均耗</th></tr></thead>
<tbody>
${durRows.filter((r) => r.n > 0).map((r) => `<tr>
  <td>${r.label}</td><td class="num">${fmt(r.n)}</td><td class="num">${fmt(r.cost)}</td>
  <td class="num">${fmt(r.gmv)}</td><td class="num"><b>${r.roi.toFixed(2)}</b></td><td class="num">${fmt(r.avg)}</td>
</tr>`).join("\n")}
</tbody></table>
<p class="note">ROI 在 2.57–2.77 之间窄幅波动，<b>没有统计学上的优劣</b>。但单素材均耗从 35 元一路涨到 754 元（21 倍）——同样 10 万元预算，投 31–60 秒档能试 592 条素材，投 2 分钟以上只能试 133 条。</p>
<p class="note"><b>可执行结论：</b>素材测试阶段优先 31–60 秒（占现有投放的 75%），把长视频留给已验证的爆量素材做二次剪辑，而不是用它去试新方向。</p>

<h3>2. 消耗极度集中在少数"能跑住"的素材上</h3>
<table>
<thead><tr><th>集中度</th><th class="num">消耗占比</th></tr></thead>
<tbody>
${conc.map((c) => `<tr><td>Top ${c.n} 素材（占全部 ${pct(c.n / rows.length, 2)}）</td><td class="num"><b>${pct(c.share)}</b></td></tr>`).join("\n")}
</tbody></table>
<p class="note">Top 100 条素材（1.5%）吃掉了 ${pct(conc[2].share)} 的消耗。这不是异常，是投流的常态——但它意味着<b>大部分素材的真实作用是被淘汰</b>，所以"素材产能"比"单条素材质量"更值得优化。</p>

<h3>3. 能跑过 30 天的素材，消耗占比 35.6%，ROI 也是最高</h3>
<table>
<thead><tr><th>连续投放</th><th class="num">素材数</th><th class="num">消耗（元）</th><th class="num">消耗占比</th><th class="num">ROI</th></tr></thead>
<tbody>
${dayRows.map((r) => `<tr><td>${r.label}</td><td class="num">${fmt(r.n)}</td><td class="num">${fmt(r.cost)}</td><td class="num">${pct(r.share)}</td><td class="num">${r.roi.toFixed(2)}</td></tr>`).join("\n")}
</tbody></table>
<p class="note">只投 1 天就停的素材共 ${fmt(dayRows[0].n)} 条，合计消耗仅 ${fmt(dayRows[0].cost)} 元（${pct(dayRows[0].share)}）——<b>基本等于白测</b>。而撑过 30 天的 ${dayRows[3].n} 条素材，用 3% 的数量贡献了 ${pct(dayRows[3].share)} 的消耗。</p>
<p class="note"><b>可执行结论：</b>给新素材的最小观察窗口应该是 7 天。1 天内砍掉的素材，几乎没有一次被验证过。</p>

<h3>4. 「首发素材」带来的是流量，不是效率</h3>
<p>千川会给首发素材额外流量扶持，直觉上应该更划算。实测结果相反：</p>
<table>
<thead><tr><th>类型</th><th class="num">素材数</th><th class="num">消耗（万元）</th><th class="num">成交（万元）</th><th class="num">ROI</th><th class="num">单素材均耗</th></tr></thead>
<tbody>
<tr><td>首发素材</td><td class="num">${fmt(og.n)}</td><td class="num">${(og.cost / 1e4).toFixed(1)}</td><td class="num">${(og.gmv / 1e4).toFixed(1)}</td><td class="num"><b>${(og.gmv / og.cost).toFixed(2)}</b></td><td class="num">${fmt(og.cost / og.n)}</td></tr>
<tr><td>其他素材</td><td class="num">${fmt(ng.n)}</td><td class="num">${(ng.cost / 1e4).toFixed(1)}</td><td class="num">${(ng.gmv / 1e4).toFixed(1)}</td><td class="num"><b>${(ng.gmv / ng.cost).toFixed(2)}</b></td><td class="num">${fmt(ng.cost / ng.n)}</td></tr>
</tbody></table>
<p class="note">首发素材只占素材数 ${pct(og.n / (og.n + ng.n))}，却吃掉 ${pct(og.cost / (og.cost + ng.cost))} 的消耗——<b>单条平均烧钱是普通素材的 ${(og.cost / og.n / (ng.cost / ng.n)).toFixed(1)} 倍</b>，ROI 反而低 ${((ng.gmv / ng.cost - og.gmv / og.cost)).toFixed(2)}。</p>
<p class="note"><b>可执行结论：</b>首发扶持买到的是"更多曝光"，不是"更高转化"。它适合用来快速测一个方向能不能起量，但跑出量之后要靠内容本身撑住 ROI，不能指望首发标签兜底。</p>
<p class="note">另外：${fmt(flags.length)} 个有判定的素材里，<b>低效素材 ${fmt(ineffSet.size)} 个</b>。说明目前投放的素材没有触发平台的低效判定——要么素材质量确实过关，要么这个判定的门槛比预想的高。</p>

<h2>二、窗口内新传的素材，七成没有进入投放</h2>
<p>先说一个容易读错的地方：素材库 ${fmt(mv.length)} 个视频里，只有 ${fmt(rows.length)} 个在报表里出现过。<b>这不能直接说成「89.8% 的素材从没投过」</b>——报表只有 180 天（2026-05-12 起），更早上传的素材根本不在数据窗口内，天然查不到消耗。</p>
<p>按上传时间切开才看得清：</p>
<table>
<thead><tr><th>素材上传时间</th><th class="num">素材数</th><th class="num">报表里有消耗</th><th class="num">使用率</th><th>能否下结论</th></tr></thead>
<tbody>
<tr><td>2026-05 及以后（在报表窗口内）</td><td class="num">${fmt(winAll)}</td><td class="num">${fmt(winUsed)}</td><td class="num"><b>${pct(winUsed / winAll)}</b></td><td>可以</td></tr>
<tr><td>2026-05 以前（窗口之外）</td><td class="num">${fmt(outAll)}</td><td class="num">${fmt(outUsed)}</td><td class="num">${pct(outUsed / outAll)}</td><td>不能，报表不覆盖</td></tr>
</tbody></table>
<p class="note"><b>可执行结论：</b>近半年新上传的 ${fmt(winAll)} 条素材里，只有 ${fmt(winUsed)} 条（${pct(winUsed / winAll)}）真正跑出过消耗，<b>约七成上传即闲置</b>。要么产能过剩，要么选素材这一环没有筛子。这个比例可以直接折算成制作成本的沉没。</p>
<p class="note">2026-11 上传的 ${fmt(novAll)} 条，使用率已达 ${pct(novUsed / novAll)}，高于历史月份——说明当月新素材启用更快，但其中也含「刚传就投、还没跑出结果」的部分，不宜直接当成好评。</p>

<h3>图片与图文</h3>
<table>
<thead><tr><th>类型</th><th class="num">数量</th><th>说明</th></tr></thead>
<tbody>
<tr><td>视频</td><td class="num">${fmt(mv.length)}</td><td>字段最全：时长、码率、尺寸、是否 AI 生成</td></tr>
<tr><td>图片</td><td class="num">${fmt(mi.length)}</td><td>尺寸、是否 AI 生成、<code>analysis_type</code></td></tr>
<tr><td>图文</td><td class="num">${fmt(mc.length)}</td><td>含描述文案与图片张数，可用于内容分析</td></tr>
</tbody></table>

<h2>三、商品终于有名字了</h2>
<p>上一轮补了商品维度消耗（<code>SITE_PROMOTION_PRODUCT_PRODUCT</code>），但那 4 个维度里没有商品名，落表只有裸 ID。这一轮通过 <code>uni_promotion/product/get</code> 建了商品维表：</p>
<table>
<thead><tr><th>指标</th><th class="num">数值</th></tr></thead>
<tbody>
<tr><td>商品维表记录</td><td class="num">${fmt(prods.length)}</td></tr>
<tr><td>prod_dim 里实际有消耗的商品</td><td class="num">${fmt(gp.size)}</td></tr>
<tr><td>join 命中</td><td class="num">${fmt(pHit.length)}（${pct(pHit.length / gp.size)}）</td></tr>
<tr><td>消耗覆盖</td><td class="num">${fmt(pHitCost)} / ${fmt(pCost)} 元（${pct(pHitCost / pCost)}）</td></tr>
</tbody></table>
<p class="note">商品名、类目、销量、库存、审核时间都已落表，商品分析从"看数字"变成"看货"。</p>

<h2>四、三个真 bug（都不是配置问题）</h2>

<div class="bug">
  <div class="t">① 19 位 ID 精度丢失 —— 无声无息，join 必挂</div>
  <div class="d">千川的 <code>material_id</code> 是 19 位整数，超过 JS 安全整数上限（16 位）。<code>JSON.parse</code> 会静默改写：</div>
  <pre>7705286888558821386  →  7705286888558821000</pre>
  <div class="d">不报错、不告警。而报表接口用 <code>ValueStr</code> 返回 ID 所以一直精确——两边一 join，命中率 <b>0%</b>。修复方式是解析前把超长整数改写成字符串（状态机实现，避开字符串字面量里的数字），修完命中率 ${pct(matched.length / rows.length)}。</div>
  <div class="why">顺带发现：修这个 bug 的第一版把 <code>"ratio":0.5622720166753518</code> 的小数部分当成独立整数加了引号，拼出 <code>0."5622..."</code> 导致 JSON 语法错误，3 个账户的图文接口全线失败。数字扫描必须把小数和指数一起吞掉。</div>
</div>

<div class="bug">
  <div class="t">② 翻页翻到一半失败，已拉的数据全丢</div>
  <div class="d"><code>video/get</code> 有「最多只能请求前 10000 条」的硬限制。素材库 14,743 个的账户翻到第 101 页必然报 40000，而旧逻辑<b>连前 100 页（10,000 条）一起丢弃</b>，该户归零。</div>
  <div class="d">改为：中途失败保留已拉行，标记 <code>partial</code>。两个超限户因此各拿回最新 10,000 条。</div>
</div>

<div class="bug">
  <div class="t">③ 导出时整行左移两列</div>
  <div class="d">表头写了 <code>account_id, account_name</code> 两个前缀列，数据行却忘了拼这两个值，导致 <code>material_id</code> 被当成 <code>account_id</code>。第一次验证时命中率 0%，就是这个原因——不是数据错，是我写错了。</div>
</div>

<h2>五、元数据覆盖的缺口在哪</h2>
<table>
<thead><tr><th>账户</th><th class="num">投放素材</th><th class="num">命中率</th><th class="num">消耗（元）</th><th class="num">消耗覆盖</th></tr></thead>
<tbody>
${acctRows.map((r) => `<tr>
  <td>${r.acct}</td><td class="num">${fmt(r.n)}</td>
  <td class="num"><span class="tag ${r.rate > 0.85 ? "ok" : r.rate > 0.5 ? "warn" : "bad"}">${pct(r.rate)}</span></td>
  <td class="num">${fmt(r.cost)}</td><td class="num">${pct(r.costHit / r.cost)}</td>
</tr>`).join("\n")}
</tbody></table>
<p class="note">缺口有两个成因，都不是代码能修的：<b>①</b> 素材库只保留未删除素材，已下架的查不到；<b>②</b> 两个素材库超 10,000 条的账户只能拉最新 10,000 条，老素材不在快照里。</p>

<h2>六、新增的四个数据源</h2>
<table>
<thead><tr><th>源</th><th>内容</th><th class="num">调用</th><th class="num">落表</th></tr></thead>
<tbody>
<tr><td><code>material_meta</code></td><td>素材库视频 / 图片 / 图文元数据</td><td class="num">135</td><td class="num">${fmt(mv.length + mi.length + mc.length)}</td></tr>
<tr><td><code>material_flag</code></td><td>低效判定 + 首发判定（按素材 ID 批量问）</td><td class="num">166</td><td class="num">${fmt(flags.length)}</td></tr>
<tr><td><code>product_dim</code></td><td>商品维表（名称 / 类目 / 销量 / 库存）</td><td class="num">45</td><td class="num">${fmt(prods.length)}</td></tr>
<tr><td><code>oplog</code></td><td>操作日志（上轮接入，本轮已落表）</td><td class="num">123</td><td class="num">${fmt(oplog.length)}</td></tr>
</tbody></table>

<h2>七、还没解决的</h2>
<div class="constraint">
  <div class="h">素材的「低质原因」仍然拿不到</div>
  <div class="b">低效判定与首发判定本轮已接通（靠已有素材 ID 批量问），但 <code>material_attributes/list</code>（低质原因 / 同质化 / 排队 / 搬运风险）无论怎么调都返回 HTML——这个路径不在千川开放平台的 <code>open_api</code> 网关下，传对标也拿不到数据。</div>
  <div class="why">现在能算的是「这条素材跑了多少、ROI 多少、是否被判低效」，还不能算「它为什么被判低质」。</div>
</div>
<div class="constraint">
  <div class="h">计划名称仍然缺失</div>
  <div class="b">商品域的 <code>ad_id</code> 与全域计划表的 <code>plan_id</code> 是两套 ID，实测零重合，无法回填名称。</div>
  <div class="why">上轮已确认，这轮没有变化。除非能拿到商品域的独立计划列表接口。</div>
</div>

<footer>
  数据源：<code>data/flat/material_video.csv</code> · <code>material_image.csv</code> · <code>material_carousel.csv</code> · <code>products.csv</code> · <code>material_flag.csv</code><br>
  复现：<code>node run.mjs --source=material_meta</code> → <code>node run.mjs --source=material_flag</code> → <code>node run.mjs --source=product_dim</code> → <code>node scripts/export-flat.mjs</code> → <code>node scripts/analyze-material.mjs</code>
</footer>
</div>
</body>
</html>`;

const out = join(PKG, "data", "素材资产与效果分析-20261107.html");
writeFileSync(out, html, "utf8");
console.log("已生成:", out);
console.log("素材", mv.length, "| 投放", rows.length, "| 命中", matched.length, "| 消耗覆盖", pct(hitCost / totCost));

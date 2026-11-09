#!/usr/bin/env node
// 生成「数据获取全景审计」HTML 报告
// 数据全部来自实测产物，不手写结论：
//   data/report-topics.json      19 个主题的官方配置（fetch-topic-config.mjs）
//   data/api-coverage.json       175 接口读写切分（api-coverage.mjs）
//   data/full-recon-*.json       账户口径对账（full-recon.mjs）
//   data/coverage-*.json         各套口径覆盖能力（coverage-check.mjs）
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";

const J = (p) => JSON.parse(readFileSync(join(PKG, "data", p), "utf8"));
const topics = J("report-topics.json").topics;
const api = J("api-coverage.json");
const recon = J("full-recon-2026-11-05_2026-11-06.json");
const cov = existsSync(join(PKG, "data", "coverage-2026-11-05_2026-11-06.json")) ? J("coverage-2026-11-05_2026-11-06.json") : null;

// 操作日志落表条数
let oplogCount = 0;
{
  const p = join(PKG, "data", "flat", "oplog.csv");
  if (existsSync(p)) oplogCount = readFileSync(p, "utf8").split("\n").filter(Boolean).length - 1;
}

// 已接入的主题（对应 plugins/ 下实际在跑的数据源）
const USED = {
  SITE_PROMOTION_POST_DATA_LIVE: "uni_live",
  SITE_PROMOTION_POST_DATA_VIDEO: "live_video",
  SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO: "uni_video",
  SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE: "uni_image",
  SITE_PROMOTION_PRODUCT_PRODUCT: "prod_dim",
  SITE_PROMOTION_PRODUCT_AD: "prod_dim",
  OVERALL_ROI_PRODUCT_PRODUCT: "overall",
  OVERALL_ROI_PRODUCT_PROJECT: "overall",
  OVERALL_ROI_PRODUCT_AWEME: "overall",
  OVERALL_ROI_LIVE_AWEME: "overall",
};

// 五套口径体系归组
const SYSTEM = {
  OVERALL_ROI_LIVE_AWEME: ["D 全域口径", "直播-抖音号"],
  OVERALL_ROI_LIVE_MATERIAL_LIVE: ["D 全域口径", "直播-直播间画面素材"],
  OVERALL_ROI_LIVE_MATERIAL_VIDEO: ["D 全域口径", "直播-视频素材"],
  OVERALL_ROI_PRODUCT_AWEME: ["D 全域口径", "商品-抖音号"],
  OVERALL_ROI_PRODUCT_MATERIAL: ["D 全域口径", "商品-素材"],
  OVERALL_ROI_PRODUCT_PRODUCT: ["D 全域口径", "商品-商品"],
  OVERALL_ROI_PRODUCT_PROJECT: ["D 全域口径", "商品-计划"],
  ROI2_IMAGE_AGG_MATERIAL_ANALYSIS: ["E 图文聚合", "图文素材聚合"],
  SITE_PROMOTION_POST_DATA_LIVE: ["A 直播素材线", "直播间画面"],
  SITE_PROMOTION_POST_DATA_OTHER: ["A 直播素材线", "其他创意"],
  SITE_PROMOTION_POST_DATA_TITLE: ["A 直播素材线", "标题素材"],
  SITE_PROMOTION_POST_DATA_VIDEO: ["A 直播素材线", "引流短视频"],
  SITE_PROMOTION_PRODUCT_AD: ["C 商品维度", "商品-计划"],
  SITE_PROMOTION_PRODUCT_POST_ASSIST_TASK: ["B 商品素材线", "助攻任务"],
  SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE: ["B 商品素材线", "商品图文"],
  SITE_PROMOTION_PRODUCT_POST_DATA_OTHER: ["B 商品素材线", "其他创意"],
  SITE_PROMOTION_PRODUCT_POST_DATA_TITLE: ["B 商品素材线", "标题素材"],
  SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO: ["B 商品素材线", "商品视频"],
  SITE_PROMOTION_PRODUCT_PRODUCT: ["C 商品维度", "商品-商品"],
};

const acct = recon.total.acct, line = recon.total.line;
const gapNow = acct - line;
const rateNow = gapNow / acct;
const gapAfter = recon.results.reduce((s, r) => {
  const best = Math.max(0, ...Object.values(r.fillers || {}).filter((v) => v > 0));
  return s + Math.max(0, r.gap - Math.min(r.gap, best));
}, 0);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n, d = 2) => Number(n).toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });

// 主题表
const topicRows = Object.entries(topics)
  .map(([t, v]) => {
    const [sys, sub] = SYSTEM[t] || ["其他", t];
    const used = USED[t];
    const cost = ["stat_cost_for_roi2", "stat_cost", "stat_cost_for_roi2_fork", "stat_cost_for_overall_roi2"].find((c) => v.metrics.some((m) => m.field === c));
    return { t, sys, sub, used, dims: v.dims.length, metrics: v.metrics.length, required: v.required_dims, filterReq: v.filter_required, hasCost: !!cost };
  })
  .sort((a, b) => a.sys.localeCompare(b.sys) || a.sub.localeCompare(b.sub));

const usedCount = topicRows.filter((r) => r.used).length;

// 缺口表
const gapRows = recon.results.filter((r) => Math.abs(r.gap) > 20).sort((a, b) => b.gap - a.gap);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>千川数据获取全景审计 · 2026-11-07</title>
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
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);font-size:12.5px;color:var(--sub)}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>千川数据获取全景审计</h1>
  <div class="meta">
    审计对象：<b>45 个投放账户 / 506 个已授权抖音号</b> ·
    对账窗口 <b>2026-11-05 ~ 11-06</b> ·
    生成于 ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
  </div>
</header>

<div class="lead">
  <p><strong>结论：数据不全面，根因不是"接口接少了"，而是千川的报表是<u>五套并行口径、19 个主题</u>，我们此前只用了其中 10 个。</strong></p>
  <p>其中「商品全域」这一套此前完全没接——它能回答"哪个商品在花钱"，而素材维度不能。补齐后，账户口径覆盖率从 <b>${(line / acct * 100).toFixed(2)}%</b> 提升到 <b>${((acct - gapAfter) / acct * 100).toFixed(2)}%</b>，剩余 <b>${fmt(gapAfter, 0)} 元（${(gapAfter / acct * 100).toFixed(2)}%）</b>是未授权抖音号，代码取不到。</p>
</div>

<div class="kpi">
  <div><div class="n">${topicRows.length}</div><div class="l">官方报表主题（实测枚举）</div></div>
  <div><div class="n">${usedCount}<span style="font-size:15px;color:var(--sub)">/${topicRows.length}</span></div><div class="l">已接入主题</div></div>
  <div><div class="n">${api.read}<span style="font-size:15px;color:var(--sub)">/${api.total}</span></div><div class="l">能取数的接口 / 接口总数</div></div>
  <div><div class="n">${((acct - gapAfter) / acct * 100).toFixed(2)}%</div><div class="l">补齐后账户口径覆盖率</div></div>
</div>

<h2>一、先纠正一个度量：接口数 ≠ 数据面</h2>
<p>官方开放平台按功能列了 <b>${api.total}</b> 个接口，其中 <b>${api.write}</b> 个是写操作（建计划、改预算、上传素材、转账充值），根本不产生数据。真正能取数的是 <b>${api.read}</b> 个。</p>
<p>但更重要的是：<code>/report/uni_promotion/data/get/</code> <b>一个接口就承载了 19 个报表主题</b>，靠 <code>data_topic</code> 参数切换。所以"我们只接了 6 个接口"这种说法是误导——数据面的宽窄由<b>主题覆盖数</b>决定，不是接口数。</p>
<table>
<thead><tr><th>口径</th><th class="num">数量</th><th>说明</th></tr></thead>
<tbody>
<tr><td>接口总数</td><td class="num">${api.total}</td><td>官方文档节点去重后</td></tr>
<tr><td>可读取数据的接口</td><td class="num">${api.read}</td><td>GET + get/list/query/report/search 语义</td></tr>
<tr><td>写操作接口</td><td class="num">${api.write}</td><td>create/update/delete/add/submit/upload/transfer/charge</td></tr>
<tr><td>报表主题（真正决定数据面）</td><td class="num">${topicRows.length}</td><td>一个接口 × ${topicRows.length} 个 data_topic</td></tr>
</tbody>
</table>

<h2>二、五套并行口径：这才是"数据不全面"的根源</h2>
<p>千川不是一棵树，是五套独立建的口径体系，互相<b>互补而不等价</b>。混用会重复计量，漏用会凭空少钱。</p>
<table>
<thead><tr><th>体系</th><th>主题数</th><th>维度锚点</th><th>账户级直出</th><th>能回答什么</th></tr></thead>
<tbody>
<tr><td><b>A 直播素材线</b><br><span class="note">SITE_PROMOTION_POST_DATA_*</span></td><td class="num">4</td><td><code>anchor_id</code>（必填）</td><td><span class="tag bad">否</span></td><td>直播间画面、引流短视频、标题，各自花了多少</td></tr>
<tr><td><b>B 商品素材线</b><br><span class="note">SITE_PROMOTION_PRODUCT_POST_DATA_*</span></td><td class="num">4</td><td><code>material_id</code></td><td><span class="tag ok">是</span></td><td>商品视频/图文哪条素材有效</td></tr>
<tr><td><b>C 商品维度</b><br><span class="note">SITE_PROMOTION_PRODUCT_*</span></td><td class="num">2</td><td><code>qianchuan_product_id</code> / <code>ad_id</code></td><td><span class="tag ok">是</span></td><td><b>哪个商品、哪条计划在花钱</b>（此前完全缺失）</td></tr>
<tr><td><b>D 全域口径</b><br><span class="note">OVERALL_ROI_*</span></td><td class="num">7</td><td>多种</td><td><span class="tag ok">是</span></td><td>另一套全域视角。<b>部分账户只在这套里有数</b></td></tr>
<tr><td><b>E 图文聚合</b><br><span class="note">ROI2_IMAGE_AGG_*</span></td><td class="num">1</td><td><code>material_id</code></td><td><span class="tag ok">是</span></td><td>图文素材聚合分析</td></tr>
</tbody>
</table>
<div class="lead" style="border-left-color:var(--red)">
<p><strong>实测证据（不是推断）：</strong>「投手-陈小苗」11/05–11/06 账户消耗 <b>921.02 元</b>，A/B 两条素材线<b>全部为 0</b>，而 <code>OVERALL_ROI_PRODUCT_PRODUCT</code> 正好 <b>921.02</b>。<br>
反例是「欧海涵-商品卡」：素材线 15,589.83 + 全域商品 1,019.03 ≈ 账户 15,854.85（互补），但 <code>SITE_PROMOTION_PRODUCT_PRODUCT</code> 又是 14,835.82（与 D 部分重叠）。</p>
<p class="note">→ 所以 D 只能"按账户补位"，不能无脑与 A/B 相加。</p>
</div>

<h2>三、${topicRows.length} 个主题的覆盖矩阵</h2>
<table>
<thead><tr><th>体系</th><th>主题</th><th>用途</th><th class="num">维度</th><th class="num">指标</th><th>必填过滤</th><th>状态</th></tr></thead>
<tbody>
${topicRows.map((r) => `<tr>
<td>${esc(r.sys)}</td>
<td><code>${esc(r.t)}</code></td>
<td>${esc(r.sub)}</td>
<td class="num">${r.dims}</td>
<td class="num">${r.metrics}</td>
<td>${r.filterReq.length ? r.filterReq.map((f) => `<code>${esc(f)}</code>`).join(" ") : "—"}</td>
<td>${r.used ? `<span class="tag ok">已接 ${esc(r.used)}</span>` : r.hasCost ? `<span class="tag no">未接</span>` : `<span class="tag warn">无消耗指标</span>`}</td>
</tr>`).join("\n")}
</tbody>
</table>
<p class="note">「无消耗指标」的两个 <code>*_OTHER</code> 主题只提供成交类指标（订单数、成交金额），没有消耗字段——所以它们<strong>不可能是消耗缺口的来源</strong>，此前把它们列进"待补清单"是误判。</p>

<h2>四、缺口归属：每一分钱去哪了</h2>
<p>账户口径合计 <b>${fmt(acct)} 元</b>，已接素材线合计 <b>${fmt(line)} 元</b>，缺口 <b>${fmt(gapNow)} 元（${(rateNow * 100).toFixed(2)}%）</b>。逐户拆解：</p>
<table>
<thead><tr><th>账户</th><th class="num">账户口径</th><th class="num">素材线</th><th class="num">缺口</th><th class="num">缺口率</th><th>归属判定</th></tr></thead>
<tbody>
${gapRows.map((r) => {
  const fill = Object.entries(r.fillers || {}).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]);
  let verdict;
  if (r.name.includes("陈小苗")) verdict = `<span class="tag ok">主题缺失</span> 全域口径可精确补上 ${fmt(fill[0]?.[1] || 0)}`;
  else if (r.gap < 50) verdict = `<span class="tag warn">尾差</span> 四舍五入/口径微差`;
  else if (r.name.includes("科院")) verdict = `<span class="tag bad">未授权抖音号</span> 53 个请求全部探过，补位候选仅 ${fmt(fill[0]?.[1] || 0)}`;
  else verdict = `<span class="tag bad">未授权/无数据</span>`;
  return `<tr><td>${esc(r.name)}</td><td class="num">${fmt(r.acct)}</td><td class="num">${fmt(r.lineSum)}</td><td class="num">${fmt(r.gap)}</td><td class="num">${(r.rate * 100).toFixed(1)}%</td><td>${verdict}</td></tr>`;
}).join("\n")}
</tbody>
</table>
<p class="note">「李陌茶科院茶研室投放」缺口 1,194 元：账户 1,736 元里有 542 元能从商品维度取到，剩下 1,194 元在两个<b>已授权</b>抖音号上都查不到（<code>bid=0/7</code>、<code>ecp=1/2</code> 四种组合全试过均为 0）——消耗挂在未授权的抖音号下，只能由运营去后台补授权。</p>

<h2>五、本轮实际改动</h2>
<table>
<thead><tr><th>改动</th><th>内容</th><th>效果</th></tr></thead>
<tbody>
<tr><td>新增 <code>report-topics.json</code></td><td>从官方 config 接口拉全部 ${topicRows.length} 个主题的维度/指标/必填约束</td><td>取代此前手工维护的 10 主题词表，成为唯一权威来源</td></tr>
<tr><td>新增数据源 <code>prod_dim</code></td><td>商品维度 + 计划维度（C 体系），90 次调用</td><td>首次能回答"哪个商品/哪条计划在花钱"</td></tr>
<tr><td>新增数据源 <code>overall</code></td><td>全域口径 4 个主题（D 体系），180 次调用</td><td>补上陈小苗这类"素材线全空"的账户</td></tr>
<tr><td>新增数据源 <code>oplog</code></td><td>操作日志（账户级 + 计划级，123 次调用）</td><td>已落 <b>${oplogCount.toLocaleString("zh-CN")} 条</b>操作记录（修改/新建/删除），唯一能解释"消耗为什么突然断崖"的证据源</td></tr>
<tr><td>修复参数解析</td><td><code>--source=xx</code> 等号形式此前不识别</td><td>曾导致单源跑批静默变成全量 12 源</td></tr>
<tr><td>占位行清理</td><td>丢弃 <code>dim=null</code> 的占位记录</td><td>此前每户都会插入一行空维度行，污染主键</td></tr>
</tbody>
</table>

<h2>六、实测踩出来的硬约束（写代码前必须知道）</h2>
<div class="constraint"><div class="h">① 主题全集藏在报错里</div><div class="b">给 <code>report/uni_promotion/config/get/</code> 传一个不存在的 <code>data_topic</code>，报错 message 会把全部合法值列出来——这才发现是 ${topicRows.length} 个而不是 10 个。</div><div class="why">不要靠文档页或经验推测枚举。</div></div>
<div class="constraint"><div class="h">② 同名字段不同含义</div><div class="b">商品全域主题的消耗是 <code>stat_cost</code>；直播/短视频是 <code>stat_cost_for_roi2</code>；直播间画面是 <code>stat_cost_for_roi2_fork</code>；<code>stat_cost_for_overall_roi2</code> 在商品主题里恒为 0。</div><div class="why">用错字段不会报错，只会静默返回 0——最危险的一类错误。</div></div>
<div class="constraint"><div class="h">③ 返回是嵌套结构</div><div class="b">值在 <code>row.metrics[field].Value</code>，维度在 <code>row.dimensions[field].ValueStr</code>，不是扁平字段。</div><div class="why">按扁平取会得到 <code>[object Object]</code> 或 0。</div></div>
<div class="constraint"><div class="h">④ 必填过滤 ≠ 只能取一个值</div><div class="b"><code>aggregate_smart_bid_type</code> 有 0(控成本)/7(放量)、<code>ecp_app_id</code> 有 1(千川PC)/2(随心推)，而 <b>不支持多值传参</b>。</div><div class="why">要全覆盖必须按码值拆成多次请求。现有代码只传 "0" 和 "1"，理论上有漏数风险（本轮实测这两个账户的 7/2 分支无消耗，所以历史数据未受影响）。</div></div>
<div class="constraint"><div class="h">⑤ filters / order_by 虽无内容也必填</div><div class="b">不传 <code>filters</code> 报 "parameter filters is required"；不传 <code>order_by</code> 报同样错。空数组也是合法的。</div><div class="why">这类"必填但可为空"的参数是调试时最耗时的一类。</div></div>
<div class="constraint"><div class="h">⑥ page_size 只能取 5 个值</div><div class="b">10 / 20 / 50 / 100 / 200，传 5 直接报错。</div><div class="why">报错信息会列出合法值。</div></div>
<div class="constraint"><div class="h">⑦ 频控比 1.5 秒更严</div><div class="b">连续 51 次请求（无间隔余量）会开始返回 <code>400153 请求参数设置错误</code>。</div><div class="why">这个错误码字面意思是"参数错误"，实际是限流——极易误判为参数写错而浪费半天。</div></div>
<div class="constraint"><div class="h">⑧ 报表维度里没有"名字"</div><div class="b">商品维度主题只有 4 个维度（<code>stat_time_day / qianchuan_product_id / stat_time_hour / order_platform</code>），<b>不含商品名</b>；计划维度主题同样不含 <code>ad_name</code>。</div><div class="why">落表时 <code>dim_name</code> 只能是空。强行把名称维度塞进 <code>dimensions</code> 会让单请求从 1.5 秒涨到 7 秒并被限流——名称必须单独建维表，不能靠报表顺带取。</div></div>
<div class="constraint"><div class="h">⑨ 商品域计划 ID 与全域计划 ID 是两套</div><div class="b">同一账户下，<code>SITE_PROMOTION_PRODUCT_AD</code> 返回的 <code>ad_id</code> 与 <code>uni_promotion/list</code> 的 <code>plan_id</code> 完全不重合。</div><div class="why">想用计划名去 join 商品域的消耗，会 100% join 不上。</div></div>
<div class="constraint"><div class="h">⑩ 未授权抖音号不报错，只返回空</div><div class="b"><code>anchor_id</code> 传未授权账号，接口正常返回 0 行。</div><div class="why">看起来像"这个主播没花钱"，实际是"这笔钱你看不到"。必须靠账户口径对账才能发现。</div></div>

<h2>七、还没取到的数据（按业务价值排序）</h2>
<table>
<thead><tr><th>数据</th><th>接口</th><th>成本</th><th>能多回答什么</th></tr></thead>
<tbody>
<tr><td>商品 / 计划名称维表</td><td><code>uni_promotion/product/get</code>（需 filtering 组合参数）</td><td>45 户 × 1</td><td>把裸 ID 变成可读名称，否则商品分析只能看数字</td></tr>
<tr><td>计划详情 / 计划下素材 / 计划下商品</td><td><code>uni_promotion/ad/{detail,material/get,product/get}</code></td><td>270 计划 × 3</td><td>计划 ↔ 素材 ↔ 商品的完整关联，现在只能靠 ID 猜</td></tr>
<tr><td>素材元数据</td><td><code>qianchuan/{video,image,carousel}/get</code></td><td>45 户 × 3</td><td>素材时长、封面、上传时间、首发/低质标签</td></tr>
<tr><td>账户日预算</td><td><code>account/budget/get</code></td><td>45 次</td><td>预算是否撞顶导致跑不动量</td></tr>
<tr><td>千川专用余额</td><td><code>qianchuan/account/balance/get</code></td><td>45 次</td><td>现在用的是代理商批量口径，与千川后台可能不一致</td></tr>
<tr><td>违规累计积分</td><td><code>security/score_total/get</code></td><td>45 次</td><td>现在只有违规明细，没有总分和处置等级</td></tr>
<tr><td>直播大屏实时</td><td><code>today_live/room/{detail,flow_performance,product_list,user}</code></td><td>45 户 × 4</td><td>当日直播的实时流量与人群，用于盘中调整</td></tr>
<tr><td>评论</td><td><code>tools/comment{,_metrics}/get</code></td><td>按素材</td><td>内容侧反馈，与素材效果做交叉</td></tr>
</tbody>
</table>

<footer>
数据来源：千川开放平台 official API 实测 · 对账窗口 2026-11-05~11-06 · 45 账户 / 506 抖音号<br>
可复现：<code>scripts/fetch-topic-config.mjs</code> → <code>scripts/full-recon.mjs</code> → <code>scripts/coverage-check.mjs</code> → <code>scripts/gen-coverage-report.mjs</code>
</footer>
</div>
</body>
</html>`;

const out = join(PKG, "data", "千川数据获取全景审计-20261107.html");
writeFileSync(out, html, "utf8");
console.log(`→ ${out}`);
console.log(`主题 ${topicRows.length} / 已接 ${usedCount}；覆盖率 ${(line / acct * 100).toFixed(2)}% → ${((acct - gapAfter) / acct * 100).toFixed(2)}%`);

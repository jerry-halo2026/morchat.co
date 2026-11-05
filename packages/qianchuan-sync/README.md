# qianchuan-sync —— 千川连接器数据同步包

> morchat 首个业务连接器（千川）的数据管道。本包是千川相关**一切**的家：规格、脚本、实测存档。
> 定位与授权边界见 [平台导航](../../docs/README.md)；生产调用/部署随连接器实施立项。

## 包内导航

| 路径 | 内容 |
|---|---|
| `docs/SYNC-ENGINE.md` | 引擎规格：插件契约/幂等/预算/失败隔离/调用与对接方式 |
| `scripts/token-refresh.mjs` | token 轮换刷新器（计划任务每日 08:30 调用；支持多套 QC* token） |
| `data/` | 实测存档：45 户名单 · 主播清单 · 大屏/自定义/全域三份字段词表目录 · 刷新日志 |
| （待建）`plugins/` | 首批 10 张插件卡（accounts/anchors/plans/uni_live/uni_image/uni_video/balance/finance/violations/today_live）——按 `docs/SYNC-ENGINE.md` §4 契约实施 |
| （待建）`core/` | 拉取核心：envelope 判定/令牌桶/水位/幂等/审计 |
| （待建）`run.mjs` | CLI 入口（--list/--source/--all/--backfill/--health） |

## 快速使用

```bash
# 手动刷新 token（也可等计划任务 morchat-qc-token-refresh 每日 08:30）
node packages/qianchuan-sync/scripts/token-refresh.mjs
```

## 数据文件与复用方式

### 文件在哪

```text
packages/qianchuan-sync/data/raw/
├── accounts/           45 户清单（3 个分页文件）
├── anchors/            45 户 × 4 页 = 180 文件（~505 主播×户对）
├── plans/              45 户 × 2 目标 = 90 文件（计划配置快照）
├── uni_image/          45 文件（商品卡 180 天逐日明细，55 指标全量）
├── uni_video/          45 文件（短视频 180 天逐日明细，65 指标全量）
├── uni_live/           ~505 文件（直播 180 天逐日明细，98 指标全量）
├── balance/            45 文件（余额快照）
└── violations/         45 文件（违规全史含 2023，event_id 幂等）
```

每个文件 = 一次 API 调用的完整 JSON 响应（指标原样保留，未裁剪）。文件名规则：`{source}-{advertiser_id}[-{anchor_id}][-p{page}].json`。

### 四种复用方式

**① 直接读 JSON（零依赖）**
```js
const d = require('./data/raw/uni_image/uni_image-1742478706540547.json');
// d.data.rows[i].dimensions.stat_time_day.ValueStr  → 日期
// d.data.rows[i].dimensions.material_id.ValueStr     → 素材 ID
// d.data.rows[i].metrics.stat_cost_for_roi2.Value    → 消耗（数字）
// d.data.rows[i].metrics.stat_cost_for_roi2.ValueStr → 消耗（格式化字符串）
```

**② 分析脚本（Node 遍历）**
```js
// 例：全店昨日直播消耗 TOP 10
import { readdirSync, readFileSync } from "fs";
const files = readdirSync("data/raw/uni_live");
let rows = [];
for (const f of files) {
  const d = JSON.parse(readFileSync(`data/raw/uni_live/${f}`, "utf8"));
  for (const r of d.data?.rows || []) {
    if (r.dimensions?.stat_time_day?.ValueStr === "2026-11-04") {
      rows.push({ anchor: r.dimensions.anchor_id?.ValueStr,
                  cost: r.metrics.stat_cost_for_roi2_fork?.Value,
                  gmv: r.metrics.total_pay_order_gmv_for_roi2_fork?.Value });
    }
  }
}
rows.sort((a, b) => b.cost - a.cost).slice(0, 10)
    .forEach(r => console.log(`${r.anchor} | ¥${r.cost} | GMV ¥${r.gmv}`));
```

**③ 灌进 Postgres（Phase 1 计划）**
回填 raw 是 Layer 0 正本；Phase 1 写解析器灌进 fact/dim 表后可用 SQL 六切面查询（全店/投手/形态/品牌/主播/账户），不用手写遍历。

**④ 增量更新**
```bash
node run.mjs --all              # 每日增量（昨日 + 漂移重拉 8 天 + 台账对账）
node run.mjs --all --backfill   # 全量重跑（一般不需要）
node run.mjs --source uni_live  # 只跑某一个源
```
增量跑完自动覆盖同名文件（文件层面幂等）。

### 数据保留策略

- `data/raw/` 被 `.gitignore` 排除（1.4 GB 太大），本地永久保留
- 灌库后有两份：raw 正本 + 结构化仓（两不丢）
- 回填窗口=API 滚动 180 天，每天收缩——**不拉就永久丢**

## 关联文档（包外）

- [千川 API 手册](../../docs/QIANCHUAN-API-DEV.md)：12+ 实测配方与参数陷阱
- [千川数据面](../../docs/QIANCHUAN-DATA.md)：时效阶梯/九域目录/字段语义
- 凭证：仓库根 `.env.local`（gitignore；刻意不放包内，避免随包分发）

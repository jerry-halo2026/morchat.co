# qianchian-sync

千川（巨量千川广告平台）投放数据的**采集 → 版本化落盘 → 拍平事实表 → 分析**引擎。
纯 Node ESM，无第三方依赖，`node run.mjs` 直接跑。

设计目标是**可回溯**：同一份数据每次拉取都进不可变版本链，任何时点都能回放出当时的报表，
因此"修改/删除计划导致历史数值变动"这类归因回溯问题可被证实，而不是靠猜。

---

## 目录

```
run.mjs                   CLI 入口（模式 / 单源 / 定向账户 / 强制重拉）
core/
  env.mjs                 凭证与配置（读仓库根 .env.local）· 惰性 token 刷新（24h/30d）
  client.mjs              主机白名单 · 超时 · 节流 · 40105 强刷 · 翻页 · 19 位整数精度保护
  runner.mjs              版本化落盘 · 断点续传 · 失败隔离 · 空页停止 · 版本滚动
plugins/<source>/index.mjs 每个数据源一个声明式配方（部分支持生成器）
scripts/                  采集辅助 / 拍平导出 / 分析 / 对账 / 探测
docs/SYNC-ENGINE.md       引擎规格（调用形状硬约束、口径演进、已知事项）
data/                     数据（见下方"落盘约定"，绝大部分不进版本库）
```

## 环境

仓库根目录 `.env.local`（已被 gitignore）：

```ini
QIANCHUAN_APP_ID=...
QIANCHUAN_APP_SECRET=...
QIANCHUAN_SHOP_ID=...
QC_ACCESS_TOKEN=...        # 首次授权后由引擎自动续期并回写
QC_REFRESH_TOKEN=...
QC_ACCESS_TOKEN_UPDATED=...
```

可选：`SYNC_TIMEZONE`（默认 Asia/Shanghai）、`SYNC_THROTTLE_MS`（默认 1500，低于 600 必触发 40100 限流）、
`SYNC_KEEP_VERSIONS`（默认 1）、`SYNC_STRIP_SIGNED_URLS`（默认开）。

## 常用命令

```bash
node run.mjs --list                          # 列出数据源与依赖
node run.mjs --backfill                      # 全量回填（计划窗口 180 天）
node run.mjs --incremental                   # 增量（计划全窗口 / 报表近 7 天）
node run.mjs --source uni_video              # 只跑一个源（自动补齐 accounts/anchors 依赖）
node run.mjs --source material_meta --accounts 1742478706540547   # 定向账户
node run.mjs --backfill --refetch uni_video  # 强制重拉（旁路断点续传）
node run.mjs --backfill --date=2026-11-07    # 指定业务日

node scripts/export-flat.mjs                  # 版本链最新 → data/flat/*.csv
node scripts/export-flat.mjs --as-of 20261106080000   # 回放到指定时刻（UTC）
node scripts/analyze-kpi.mjs --days 14        # 六段式投放分析
node scripts/reconcile.mjs --day 2026-11-08   # 账户口径 vs 素材口径，缺口 >3% 告警
node scripts/prune-raw.mjs --dry-run          # 存量清理（版本/冗余副本）
node scripts/kill-stale-sync.ps1              # 清残留进程 + 僵尸锁（Ctrl+C 中断后）
```

## 数据源（16 个）

| 源 | 接口 / 主题 | 粒度 |
|---|---|---|
| accounts | `shop/advertiser/list` | 账户 |
| anchors | `aweme_auth_list/get` | 账户 × 抖音号 |
| plans | `uni_promotion/list` | 计划（× 营销目标） |
| uni_video | `SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO` | 日 × 素材 |
| uni_image | `SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE` | 日 × 素材 |
| uni_live | `SITE_PROMOTION_POST_DATA_LIVE` | 日 × 主播（`anchor_id` 必填） |
| live_video | `SITE_PROMOTION_POST_DATA_VIDEO` | 日 × 主播 × 短视频素材 |
| prod_dim | `SITE_PROMOTION_PRODUCT_PRODUCT` / `_AD` | 日 × 商品 / 日 × 计划 |
| overall | `OVERALL_ROI_PRODUCT_*` / `OVERALL_ROI_LIVE_*` | 日 × 商品 / 计划 / 抖音号 |
| product_dim | `uni_promotion/product/get` | 商品维表（ID → 名称） |
| material_meta | `video` / `image` / `carousel` get | 素材库元数据（时长/尺寸/是否 AIGC） |
| material_flag | `file/video/efficiency` + `original` get | 素材 ID → 低效 / 首发标记 |
| oplog | 操作日志 | 计划 × 操作记录（关停/预算/状态） |
| recon | `report/all_promotion/get` | 账户 × 场景（账户口径真值） |
| balance | `v3.0/account/fund/get` | 账户 |
| violations | 违规记录 | 账户 |

## 五套口径（别相加，按问题选）

这是最容易出错的地方。同一个"消耗"在不同表里不是同一件事：

| 口径 | 表 | 消耗字段 | 何时用 |
|---|---|---|---|
| A 标准-视频/图文素材 | `uni_video` / `uni_image` | `stat_cost_for_roi2` | 素材效果、素材生命周期 |
| B 直播引流短视频 | `live_video` | `stat_cost_for_roi2` | 直播户的短视频引流（占直播消耗约三成） |
| C 直播间画面 | `uni_live` | **`stat_cost_for_roi2_fork`** | 主播效果（用 `stat_cost_for_roi2` 会归零） |
| D 全域 | `overall` | `stat_cost_for_roi2` | 补 A/B 覆盖不到的账户，**与 A/B 部分重叠，不可叠加** |
| E 账户真值 | `recon` | `stat_cost_for_roi2`（双场景求和） | 对账基准；A+B+C 应逼近 E |

D 与 A/B 的关系是"互补"不是"相加"：欧海涵-商品卡素材线 15,589 + D 全域 1,019 ≈ 账户 15,854，
但同一户 `SITE_PROMOTION_PRODUCT_PRODUCT` 也有 14,835，与 D 重叠 754。落表时分开存，分析层按口径选。

## 落盘约定

```
data/raw/<source>/<call>.json            最新副本（与版本文件硬链接，不额外占空间）
data/raw/<source>/versions/...--<ts>.json 不可变版本链，每 name 保留 SYNC_KEEP_VERSIONS 份
data/flat/*.csv                          拍平事实表（export-flat 生成）
data/state/sync-<day>.json               调用审计（request_id / 耗时 / 行数 / issues）
data/sync.lock                           PID 互斥锁（防双进程互吊 token）
```

**版本库只跟踪 4 类输入配置**（`data/qc-*.json|txt`、`report-topics.json`、`uni-config-extra.json`），
其余全部忽略——`raw/` 约 1.5G、`flat/` 约 62M，都是可再生的。换机器只需 clone + 填 `.env.local` + 跑 `--backfill`。

## 已知限制（不是 bug，是接口边界）

1. **未授权抖音号**：素材级报表 `anchor_id` 必填，只能查已授权抖音号。未授权直播间花的钱接口不报错、只返回空。
   这就是 `recon` 存在的理由：靠账户口径对账发现缺口，实测 11-01~11-08 缺口 1.3%。
2. **素材库 10000 条硬上限**：`video/get` 翻到第 101 页必报 `40000`，大账户只能取到前 10000 条。
   `callOEPaged` 已改为"中途失败保留已拉数据"，不再把整户归零。
3. **AIGC 聚合素材不在素材库**：约 8% 的投放素材查不到元数据，其 `dim_name` 本身带名字，分析层回退使用。
4. **素材库过滤参数不生效**：`material_ids` / `video_ids` 服务端忽略，只能全量拉 + 本地 join。
5. **操作日志 page_size ≤ 20**：单计划一个月可 700+ 条，只对近期有消耗的计划取最近 3 页。

## 相关文档

- `docs/SYNC-ENGINE.md` — 引擎规格、调用形状硬约束、口径演进史、接口实测裁定
  （哪些参数"文档写了但服务端不生效"，都记在它的「调用形状硬约束」和「已知事项」里）

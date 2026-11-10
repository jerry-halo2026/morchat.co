# qianchian-sync 引擎规格

> 45 账户 · 180 天窗口 · 16 个数据源 · 版本化缓存。数据只落本地 `data/`（git 不跟踪，可重拉）。
> 2026-11-06 v4：#17-#21 修复后首次全量健康（962 文件 / 138,676 行 / 3.6 GB / FAIL 0）。
> 2026-11-07 v5：新增 `--incremental` 增量模式；修掉 #24 假增量 / #25 覆盖写丢历史 / #26 台账永久跳过。
> 2026-11-07 v6：数据源 8 → 16（补商品/计划/全域口径、素材元数据与质量标记、操作日志、账户对账）；
> 存储治理（硬链接 + 剥签名 URL + 版本滚动，5.6G → 1.5G）。
> 2026-11-09 v7：recon 改用 `report/all_promotion/get`（前两版接口实测均失效）；`--date` 参数修复。

## 三个模式

| 模式 | 计划窗口 | 报表窗口 | 用途 |
|---|---|---|---|
| `--backfill` | day-178..day | day-178..day | 全量重建，重拉一切 |
| `--incremental` | day-178..day | **day-7..day** | 日常增量（推荐） |
| 默认 daily | day-8..day | day-8..day | 遗留，别用（计划会被窗口裁掉） |

- **报表窗口必须收窄到 7 天**：全域报表 `max_day=180` 是硬顶，全量重拉每天写 3.6 GB 版本链，且窗口每推进一天就滚掉一天历史。
- **计划窗口必须保持 178 天**：`uni_promotion/list` 按 `start_time/end_time` 过滤，窗口一窄，近 7 天没消耗的老计划就会从 `plans` 表消失。
- 增量会回看 7 天，是为了吃掉 T+1~T+7 的**归因回溯修正**（历史日期的数值会变，见下节）。

## 断点续传的真实语义（#24 / #26）

- 有时间参数：取已有数据里最大的 `dimensions.stat_time_day.ValueStr`，**≥ 请求窗口 `end_time` 才 SKIP**。否则重拉。
- 无时间参数（accounts / anchors / balance / violations）：靠调用上的 `noCache: true` 强制刷新。**这四个源没有时间参数，不加 noCache 会被永久跳过**——余额每天在变、新授权达人不进清单就会整块漏拉直播报表。
- `--refetch a,b` 仍可旁路一切判定。

## flat 层是事实表，只增不减（#25）

`scripts/export-flat.mjs` 对每张表按主键 UPSERT 进已有 CSV，窗口外的历史行原样保留：

| 表 | 主键 |
|---|---|
| uni_live / uni_video / uni_image / live_video | `stat_date + account_id + dim_id` |
| prod_dim / overall | `stat_date + account_id + topic_tag + dim_id` |
| plans | `plan_id` |
| accounts / balance | `account_id` |
| anchors | `account_id + aweme_id` |
| violations | `event_id` |
| material_video / material_image / material_carousel | `material_id` |
| material_flag | `material_id` |
| product_names / plan_names | 各自 ID（名称映射维表，只增不减） |
| oplog | `log_id` |
| recon | `account_id + goal` |

原因：全域报表 180 天硬顶，**每天都会有一天的历史滚出可查询窗口**（2026-11-07 这天，2026-05-12 的 832 行就已经查不到了）。如果 flat 层是覆盖写，这一天的数据就永久没了。`--as-of` 回放历史快照时不合并，避免把当前数据混进历史视图。


## 结构

```
packages/qianchian-sync/
├── run.mjs                  # CLI：--backfill | --incremental | --source X | --refetch a,b | --accounts ids | --date= | --list
├── core/
│   ├── env.mjs              # .env.local 凭证 · 惰性 token（24h/30d 轮换）· invalidateToken() · 配置
│   ├── client.mjs           # 主机白名单 · 超时 · 节流 · 40105 强刷 · 翻页 stopWhen · safeJsonParse 精度保护
│   └── runner.mjs           # 版本化落盘 · 断点续传 · 失败隔离 · 空页停止 · 硬链接/版本滚动/剥签名URL
├── plugins/                 # 每源一个声明式配方（支持生成器）
│   │── 基础层
│   ├── accounts  (3 calls)   店铺→账户清单
│   ├── anchors   (~227)      账户→授权主播，生成器空页停止
│   ├── plans     (90)        全域计划 ×2 营销目标，行键 ad_list
│   ├── balance   (1)         /v3.0/account/fund/get 批量（每 50 户一批）
│   ├── violations (45)       违规记录，行键 adv_score_event
│   │── 素材线（A/B/C）
│   ├── uni_video (45)        A 标准-视频素材报表
│   ├── uni_image (45)        A 标准-图文素材报表
│   ├── uni_live  (506)       C 直播间画面（anchor_id 必填，消耗取 stat_cost_for_roi2_fork）
│   ├── live_video (~32)      B 直播引流短视频（此前漏接，占直播消耗约三成）
│   │── 维度层（商品/计划/全域口径）
│   ├── prod_dim  (90)        SITE_PROMOTION_PRODUCT_PRODUCT / _AD → 商品 / 计划日表
│   ├── overall   (180)       OVERALL_ROI_* 全域口径（与素材线互补，不可叠加）
│   ├── product_dim (~45)     商品 ID → 名称维表（filtering 必须是对象）
│   │── 元数据 / 行为 / 对账
│   ├── material_meta         video/image/carousel 素材库元数据
│   ├── material_flag         efficiency/original 素材低效与首发标记
│   ├── oplog                操作日志（page_size ≤ 20，只扫近期有消耗的计划）
│   └── recon     (90)        report/all_promotion/get 账户口径真值（双场景求和）
└── scripts/                  # 采集辅助 / 拍平 / 分析 / 探测
    ├── export-flat.mjs       # 版本链 → data/flat/*.csv（UPSERT，只增不减，支持 --as-of 回放）
    ├── analyze-kpi.mjs       # 六段式投放分析
    ├── analyze-material.mjs / analyze-plans.mjs / analyze-flag.mjs
    ├── reconcile.mjs         # 账户 vs 素材口径对账，缺口 >3% 告警
    ├── attribution-diff.mjs  # 归因回溯差分（见下）
    ├── build-product-names.mjs / diagnose-gap.mjs / coverage-check.mjs
    ├── prune-raw.mjs         # 存量清理（版本冗余 + 双写副本）
    ├── fetch-topic-config.mjs / fetch-api-inventory.mjs   # 官方词表 / 文档清单
    ├── probe-apis.mjs / probe-catalog.mjs / probe-material.mjs   # 接口探测
    └── kill-stale-sync.ps1   # 清残留进程与僵尸锁
```

## 落盘与版本化

- `data/raw/<source>/<call>.json` — 最新副本（硬链接指向版本文件，同 inode 不占双份空间）
- `data/raw/<source>/versions/<call>--<UTC时间戳>.json` — **不可变版本链**，每次成功拉取追加
- 每个 name 只保留最近 `SYNC_KEEP_VERSIONS`（默认 1）份版本；历史回溯需要多份时临时调大
- 序列化不带缩进（省 1.42x 体积）；签名 URL（`x-expires`/`x-signature`）落盘前替换为 `[signed-url-omitted:NB]`
- `data/state/sync-<day>.json` — 调用审计（request_id/耗时/行数）+ issues
- `data/sync.lock` — PID 互斥锁（防双进程互吊 token，#19）

> 存储实测：改造前 5.6G（版本无限累积 + 双写 + 缩进），改造后 1.5G，回收 4170MB，1958 个快照全部可解析。

## 调用形状硬约束（实测裁定）

1. 单请求 = 单账户 × 单接口 × 单页（plans 上限 100，报表 200）
2. plans `marketing_goal` 必填 → 90 次是下限
3. LIVE 报表 `anchor_id` 筛选必填 → 506 次是下限
4. 报表 179 天整段一次请求（无 30 天切块）
5. 各接口行键名不同：`rows`/`list`/`ad_list`/`adv_score_event`/`logs`/`carousels`/`product_list` —— client.mjs 提取链全兜
6. 报表明细接口（`ad/detail`、`product/get`）**不能带 `page` 参数**，`callOEPaged` 会破坏单对象响应 → 必须用 `callOE`
7. 19 位 ID 会超出 JS 安全整数（`7705286888558821386` → `...821000`），`safeJsonParse` 在 parse 前把超长整数转字符串
8. `report/all_promotion/get` 的 `fields` 只能用应答指标（`stat_cost` 报 `50000`），时间必须带时分秒

## 归因回溯（drift）工作流

```bash
# T1/T2/Tn 快照：全量重拉（写新版本，不动历史版本）
node run.mjs --backfill --refetch accounts,anchors,plans,uni_image,uni_video,uni_live,balance,violations

# 差分：默认每调用最早 vs 最新版本；--from/--to 按时间界选
node scripts/attribution-diff.mjs
node scripts/attribution-diff.mjs --source uni_video --from 20261106070000 --to 20261107060000

# 输出：data/analysis/attribution-drift-*.json + 控制台摘要
# 维度：按指标 / 按日期（历史日期回溯变动 = 归因回溯证据）/ 按账户 / 计划生命周期事件
```

验证目标（同事反馈）："修改/删除计划后历史数值变动"。
方法：plans 生命周期事件（删除/状态/预算变动）⟷ 同账户 uni_* 历史日期漂移的相关性。
注意：断点续传会跳过已存在文件——产生新快照必须显式 `--refetch`；日常增量的窗口推进语义后续再实现。

## 数据源现状（2026-11-07 扩容后 16 个源）

| 源 | 接口 / data_topic | 粒度 | 增量调用量 |
|---|---|---|---|
| accounts | `shop/advertiser/list` | 账户 | 3 |
| anchors | `aweme_auth_list/get` | 账户×抖音号 | 92 |
| plans | `uni_promotion/list` | 计划 | 90 |
| uni_live | 报表 `SITE_PROMOTION_POST_DATA_LIVE` | 日×主播 | 活跃对 ~32 |
| **live_video** | 报表 `SITE_PROMOTION_POST_DATA_VIDEO` | 日×主播×短视频 | 活跃对 ~32 |
| uni_video | 报表 `SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO` | 日×素材 | 45 |
| uni_image | 报表 `SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE` | 日×素材 | 45 |
| **prod_dim** | `SITE_PROMOTION_PRODUCT_PRODUCT` / `_AD` | 日×商品 / 日×计划 | 90 |
| **overall** | `OVERALL_ROI_PRODUCT_*` / `OVERALL_ROI_LIVE_*` | 日×商品/计划/抖音号 | 180 |
| **product_dim** | `uni_promotion/product/get` | 商品 ID→名称 | ~45 |
| **material_meta** | `video` / `image` / `carousel` get | 素材库元数据 | 按页 ~150 |
| **material_flag** | `file/video/efficiency` + `original` | 素材 ID 标记 | ~136 批 |
| **oplog** | 操作日志 | 计划×操作 | 近期活跃计划 ×3 页 |
| **recon** | `report/all_promotion/get` | 账户×场景 | 90 |
| balance / violations | `v3.0` 两个接口 | 账户 | 46 |

**live_video 存在的原因（务必别删）**：直播全域的消耗分「直播间画面」和「直播间引流短视频」两条素材线，只接前者会漏掉约三成直播消耗。实测 11/05–11/06 账户口径 92,474 vs 素材口径 67,595（缺 27%），补上后降到 1.2%。

**recon 存在的原因**：素材级报表 `anchor_id` 必填，可查范围 = 已授权抖音号。未授权的直播间花了钱，接口不报错、只返回空 —— 只能靠账户口径对账发现。`node scripts/reconcile.mjs --day <date>` 输出缺口表，>3% 即告警。

**recon 的口径演进（前一版都失效了，别再改回去）**：
- v1 `report/uni_promotion/get/` + marketing_goal 汇总 → 11-07 后服务端对全部 45 户返回 0 行
- v2 `report/uni_promotion/data/get/` + `OVERALL_ROI_*` 按天聚合 → 只覆盖全域推广消耗，素材线大户返回 0
- v3 `report/all_promotion/get/` + `adlab_scene ∈ {UNI_PROJECT, OVERALL_PROJECT}` 双场景求和 → 实测才是账户全口径

**overall / prod_dim 别和素材线相加**：`OVERALL_ROI_PRODUCT_PRODUCT` 与 `SITE_PROMOTION_PRODUCT_PRODUCT` 是两套口径、部分重叠（欧海涵-商品卡实测重叠 754 元）。D 只用于「补 A/B 覆盖不到的账户」，不做全量叠加。

## 官方文档全量清单

`node scripts/fetch-api-inventory.mjs` 会从文档站拉全量（免登录），产出 `data/qianchuan-api-inventory.json`。
2026-11-07 基线：**251 个文档节点 / 175 个接口 / 26 个分组**，当前接入 16 个源（覆盖核心投放口径，未接的多为工具类/素材管理类接口）。
想接新主题先跑这个，再改 `data/uni-config-extra.json`（词表外置，不动老的 `qc-uni-config-20261104.json`）。

## 计划层只有一半：全域推广 vs 标准计划（2026-11-07 发现，已更正）

`qianchuan/uni_promotion/list/` 只返回「全域推广」计划。当天曾怀疑还有一条「标准计划（专业推广）」线要走 `qianchuan/ad/get/`，**此结论已作废**：新版文档目录里没有这个接口，属旧版专业推广，已下线；查到的 133 条是老计划壳，不必再拉。

| | 端点 | 必填 | 返回形态 |
|---|---|---|---|
| 全域推广 | `uni_promotion/list/` | 无 filtering | 嵌套 `{ad_info, room_info, product_info, stats_info}` |
| 标准计划 | `ad/get/` | **`filtering` 必填**（空对象返回 0 行，不报错） | 扁平 `{ad_id, name, status, opt_status, delivery_setting{...}}` |

- `filtering` 可传 `{marketing_goal:"LIVE_PROM_GOODS"}` / `VIDEO_PROM_GOODS`；不传报 40000 `parameter "filtering" is required`
- 标准报表 `qianchuan/report/ad/get/`：`filtering` **必须含 `marketing_goal`**；指标名与全域不同（`stat_cost` 可用，`total_pay_order_gmv_for_roi2` 报"非法数据报表指标"）
- 实测量级：乔续续官旗一户 全域 3 个 / **标准 133 个**
- 全域列表不保留已删除计划（曾出现的 2 个 "9.19" 计划现已消失）→ 计划的历史过程只能靠操作日志还原

## 已知事项

- **计划状态 ≠ 消耗归属**：11/07 复核发现乔续续官旗户 11/05 花 8,548、11/06 花 18,523，但 3 个全域计划全 `SYSTEM_DISABLE`、133 个标准计划在投为 0、标准报表同期消耗 0。推断为「关停→手动重开→再关停」的循环，API 只留当前状态。补操作日志前，任何"在投计划数"的结论都要标注这个不确定性。
- **同日二次刷新会被判 SKIP**：新鲜度判定只比到"日期"，当天数据拉到 11-07（哪怕是上午的半天）之后再跑就认为已覆盖。要盘中刷新必须 `--refetch` 显式旁路。这是有意的取舍——避免一天内反复全量重拉打爆频控。
- `near_realtime_cost`、`project_diagnosis`、DPA 权限点未授（需重新授权勾选）
- 抖店（dy）连接器：另立开发者注册，未开工
- SPI 实时推送未申请（千川全域计划/客户报表实时数据订阅）——直播轮询的替代路径
- uni_live 个别主播 400153 参数错（1/506，边角案例未深究）
- 同机器其他 AI 会话可能在跑任务：启动前 `Get-Process node` 确认无 run.mjs 残留（锁会兜底）。**注意锁只防 run.mjs 自己，不防临时脚本**——并发调用同一个 token 会触发 40105 风暴，临时探针脚本要等主流程跑完再跑。

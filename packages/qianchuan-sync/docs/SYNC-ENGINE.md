# 同步引擎设计规格（qianchuan-sync，千川连接器）

> 文档定位（2026-11-05）：morchat **千川连接器**的数据同步引擎设计稿——技术资料与工程规格，不构成执行授权（遵循 [导航与决策状态](D:/dev/morchat.co/docs/README.md) 的生效规则；生产调用与部署随连接器实施另行立项）。
> 设计原则（连接器范围内）：引擎是**千川 API 的唯一出口**——爬虫/拟案/写路径/漂移检测共用一个 client，纪律写一次处处生效。
> 配套：API 配方见 [QIANCHUAN-API-DEV](D:/dev/morchat.co/docs/QIANCHUAN-API-DEV.md)（历史实测），数据面见 [QIANCHUAN-DATA](D:/dev/morchat.co/docs/QIANCHUAN-DATA.md)；数据仓表结构随连接器实施定义（历史设计参考 archive 版 ARCHITECTURE v4.0 §4）。

---

## 1. 实测校验结论（设计依据，非假设）

| 假设 | 实测 | 结论 |
|---|---|---|
| 区间查询带 `stat_time_day` 维度返回逐日行 | ✅ 8 天 8 行 | **漂移重拉与当日拉取合并为一次区间调用**，零额外成本 |
| anchor 筛选可传多值 | ❌ 官方原文"抖音号只支持一次传入一个" | LIVE 主题=**每户×每主播×一调**；IMAGE/VIDEO 空筛选可过不受限 |
| 历史回看 | 180 天滚动窗（UI 同限，分段倒退被封死） | 回填窗口=[今天-180天, 今天]，每天收缩 |
| 重新授权 | 40103 作废旧 token 集 | 单活 token 模型，auth-service 须处理"授权被替换" |
| 结算漂移 | 1h/7d/14d/30d/90d 五档窗口 | 数字未来 90 天会变，必须重拉覆盖 |

## 2. 架构（四层）

```text
调度层   cron 触发 + sync_state 水位表（source, last_success_at, last_date,
         status, call_count, retry_count）← 游标/断点/失败队列/退避
配方层   声明式插件卡：endpoint+参数构造+分页器+去重键+sink+节奏+依赖
拉取核心 envelope code 判定（HTTP200≠成功）· request_id 落审计 ·
         per-interface 令牌桶 · 禁传输层重试 · 超时先查后重试 · 全局串行队列
落地层   Layer0 raw：响应原样 JSONL（pull_id 追加，按月分目录 gzip，30天热+归档）
         Layer1 fact/dim：唯一键幂等 upsert（ON CONFLICT DO UPDATE + synced_at）
```

## 3. 调用预算（修正版）

| 任务 | 调用/次 | 频率 |
|---|---|---|
| IMAGE+VIDEO 主题（45 户） | 90 | 每日 05:00（区间=[T-8, T] 一次拉） |
| LIVE 主题 | Σ各户主播数（估 150-400，回填时精确） | 每日 |
| 计划快照+余额+财务 | 135 | 每日 |
| 台账对账（账户/主播） | ~10 | 每日 |
| **日常合计** | **~500-600** | 凌晨低峰串行 |
| 95 天全窗重拉 | ≈当日同量（区间合并） | 每周日 |
| 一次性回填 | ~600-1000（含违规全史到 2023） | 一次 |
| 今日直播轮询 | 只轮"当日 uni 消耗>0"户的主播 | 直播时段每小时 |

## 4. 插件契约（拔插核心）

```text
plugins/<source_id>/
├── recipe.json    # 声明（见下）
├── params.mjs     # 可选：动态参数构造（如 anchor 从 auth_list 注入）
└── parse.mjs      # 可选：非标准响应解析（默认走通用 rows 解析）
```

```json
{ "id": "uni_live",
  "endpoint": "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/",
  "method": "GET", "pager": "page",
  "schedule": "daily", "dateRange": "drift8",
  "requires": ["accounts", "anchors"],
  "paramBuilder": "./params.mjs",
  "sink": { "table": "fact_delivery_daily",
            "uniqueKey": ["advertiser_id","stat_date","topic","anchor_id","material_id"] },
  "retryBudget": 3, "isolated": true }
```

**规则**：目录扫描自动注册；插件**无状态**（状态全在 sync_state）——删目录即停用、丢目录即新增；`requires` 声明前置依赖，调度器按依赖图排序。

## 5. 调用方式（CLI）

```bash
node run.mjs --list                        # 已注册插件一览
node run.mjs --source uni_live             # 单源手动（调试）
node run.mjs --all --date 2026-11-04       # 按调度全跑（cron/计划任务入口）
node run.mjs --backfill --from 2026-05-09 --to 2026-11-04
node run.mjs --health                      # 水位/失败队列/调用计数/令牌桶余量
```

## 6. 对接方式（三面）

1. **CLI**：schtasks/cron 直调（MVP 形态，零依赖）
2. **库模式**：`import { runSync, getClient } from '@app/qianchuan-sync'`——stats-api / 拟案执行器 / 写路径复用同一引擎与 client
3. **事件面**：每配方完成 → `sync_events` 表 + webhook（调度面板/告警订阅）

**消费纪律**：任何服务不得绕过本引擎直调千川 API；读数据一律查仓（仓库扇出制）。

## 7. 幂等与去重（四杀）

1. 事实表唯一键 upsert——重复拉取/分页重行天然被吃
2. Raw 层故意不去重（pull_id 追加，证据链优先）
3. 实体按 id upsert + last_seen（主播跨户重复、列表内重复都归一）
4. 每实体指定唯一正本源（计划=uni_promotion/list；消耗业务口径=uni 主题；对账正本=财务流水），fact 带 `source` 字段，同指标双源不进同表

## 8. 失败处理

- 每配方独立 `retryBudget`（连败 N 次降级"跳过+告警"，不阻塞其他配方——毒丸隔离）
- 失败进 sync_state 队列，指数退避；重试前先查（写）/先读水位（读）
- 令牌桶：全局 5 QPS、单接口 2 QPS 保守起步；`call_count` 日计数逼近阈值自动降速+告警（频控数字官方不公开，用计数器实测出来）

## 9. 运维注意

- **时区钉死 Asia/Shanghai**（"昨天"边界、直播时段判断全依赖）
- token：单活集（重授权即替换，40103），刷新互斥、每次落盘（现由 `scripts/qc-token-refresh.mjs` 每日 08:30 先行，引擎内建后接管）
- raw 轮转：月目录 + gzip；30 天热数据 + 冷归档
- 分页一致性：尽力而为（直播中数据在变），幂等键吃重行、次日重拉补漏行

## 10. 首批插件清单（10 张卡）

`accounts`（shop/advertiser/list）· `anchors`（aweme_auth_list，页大小枚举注意）· `plans`（uni_promotion/list 快照）· `uni_live` · `uni_image` · `uni_video`（三主题）· `balance` · `finance`（流水）· `violations`（全史，event_id 幂等）· `today_live`（直播时段条件轮询）
第二批：search_words · audiences（周）· materials · products · reject_reasons（需 ad_ids）· brand

## 11. 复用性边界（给未来接平台的人）

配方抽象平台无关——接腾讯广告/快手磁力时：新建 `plugins-tencent/` 目录族复用 core 四件（水位/幂等/令牌桶/审计），只写配方卡。**引擎不为千川特化的部分**仅限：envelope 判定（code!=0）与认证头（Access-Token）——这两个点做成 client 适配器即可换平台。

## 12. 推送通道与直播同步（2026-11-05 官方文档收割）

**结论：无 WebSocket/长连接（全文档库零命中）。推送只有 SPI HTTP 回调 + RDS 报表同步；直播无开播/下播事件，检测=轮询。**

**官方支持架构：push-notify（活动信号）+ poll-pull（数据）**
1. SPI 订阅 `report.qianchuan.ad.activeprogram`（变更只推 ID 不推值）→ 得知哪些户/计划活跃
2. 对活跃户轮询 `today_live/room/get?room_status=LIVING`——**周期用户自定义，建议默认 5 分钟（可选 2 分钟）**
3. 命中开播 → 大屏 `room/data/get`（流量/商品 topic）取指标

**SPI 机制要点**（施工时照此）：任务制（每应用每类型 10 个）；回调 URL 需同时支持 GET/POST，创建时 Challenge 验证（回 `{challenge}`）；`X-Open-Signature` 签名（secret_key 配在任务上）；`timestamp+nonce` 防重放；重试策略可配（超时/间隔/次数）；**漏推补拉窗口仅 2 天**（`/2/spi_task/get/`，APP-Access-Token）；账户管理 500/请求。

**频控三层规则（文档实数）**：40130 客户频控（不活跃户）/ 40110 开发者频控（每接口滑动窗 QPS，配额在开发者后台可见，每月 1/15 可提额）/ 40100 全局动态；**分钟上限=QPS 配额×100，超出罚 5 分钟连续报错**；轮询不活跃户会触发配额降级。直播轮询预算：每房间 ~3 调/5 分钟 ≈ 36 调/小时/房间，百房并播仍在安全线内。

**直播检测的辅助信号**：DOU+ 订单 `task_status=TIME_NO_REACH`（待开播，间接）；`status.promotion.realtime` 的 `LIVE_ROOM_OFF`（广告侧不可投，非房间生命周期）；T+1 直播间分析报表（`/v3.0/report/live_room/analysis/get/`）用于复盘不用于实时。

## 13. 调度策略（2026-11-05 按 Ethan 确认更新）

**默认全手动，不自动**：数据同步以 `run.mjs --all / --source` 用户触发为准；插件卡 `schedule` 字段保留为**可选自定义**（配了 cron 才定时，不配纯手动）。**唯一例外**：token 刷新（凭证生命线，非数据同步）保持每日 08:30 自动。

## 14. 新入册接口族（2026-11-05 文档批次）

评论三件套（`/v3.0/tools/comment/get|comment_reply|comment_metrics`）· 诊断族（单元诊断/项目重复投放建议）· 拒审素材 AI 修复建议（近 7 天）· DPA 商品库（meta/clue_product）· 达人查询五件套（相似账号/达人信息/类目达人推荐）· DOU+ 订单（含待开播态）· 授权直播达人列表（`/2/tools/live_authorize/list/`）· 直播间受众分析（T+1）。OE 文档可编程收割：`/skiff/api/doc/client/node/get/?doc_id=<id>&identify_key=<key>`（identify_key 在站点 bundle 内，ad/qc 各一枚）。

## 15. 惰性 token 与新接口实弹记录（2026-11-05）

**token 策略改为惰性**（撤每日定时）：引擎每次运行前 `ensureToken()`——access 剩余 >2h 直接用，否则刷新（refresh 轮换重置 30d）；refresh 过期才需人工重扫。**唯一约束：每月至少跑一次同步，链就不断**。`scripts/token-refresh.mjs` 保留为手动工具。

**直播检测与追踪分离**：检测=消耗触发（uni 当日消耗>0 的户才查 `room_status=LIVING`，低频）；追踪=命中开播的房间才进 2-5 分钟轮询名单（用户自定义周期）。

**新接口实弹（2026-11-05）**：
| 接口 | 结果 |
|---|---|
| 评论列表 `/v3.0/tools/comment/get/`（ad 域） | ✅ code:0——**时间参数要纯日期**（`2026-10-29` 非 datetime） |
| 相似达人 `/2/tools/aweme_similar_author_search/`（ad 域） | ✅ code:0 |
| 授权直播达人 `/2/tools/live_authorize/list/`（open 域） | ⚠️ 机制通；status 枚举=`AUTHORIZE_OVERDUE/APPLYING/AUTHORIZING/APPLY_OVERDUE`——**授权流程追踪器**（查在途/过期，已授权走 aweme_auth_list） |
| 项目诊断/重复投放 `/v3.0/tools/project_diagnosis/suggestion/list/` | ❌ 40002 权限未授 |
| DPA 元信息 `/2/dpa/meta/get/` | ❌ 40002 权限未授 |

**下次重授权权限清单（+2）**：`tools/project_diagnosis/suggestion/list` · `dpa/meta/get`（连同此前欠的 near_realtime 一并勾选）。

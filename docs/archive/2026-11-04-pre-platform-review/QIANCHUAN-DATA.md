# 千川官方数据面与时效性 — 数据可得性文档

> 生成：2026-11-03 · 依据：`ad_open_sdk_java` pin `e8c324c`（官方 OpenAPI 规格生成物，本地可 grep 复现）+ 官方文档验证
> 配套：`PLAN.md`（主线方案）· `REFS.md`（参考项目清单）· `.env.local`（app 凭证）
> 状态标注：✅=SDK 源码证实 · 📄=官方文档证实 · ⏳=待 token 实测

---

## 0. 一句话结论（实时性）

**不是全实时，是四档时效阶梯**。消耗有专门的准实时接口（分钟级）；直播大屏族是"今日"口径（UI 秒级、API 更新频率待实测）；通用报表小时级封顶；结算与归因 T+1。够做中场调投（小时级决策）和实时哨核（余额+准实时消耗），不够做秒级控场。

---

## 1. 时效阶梯总表

| 档 | 数据 | 证据 | 用途 |
|---|---|---|---|
| **准实时（分钟级）** | 账户当日消耗：`GET /open_api/v3.0/near_realtime_cost/get/` → `{account_id, cost, date, shared_wallet_id}` 分页 | ✅ SDK `NearRealtimeCostGetV30Api` | 投流哨核（超支检测、执行验证） |
| **准实时（分钟级）** | 账户余额 `AccountBalanceGet`（拉取制） | ✅ SDK | 哨核地板校验 |
| **今日实时（UI 秒级，API 频率⏳）** | 今日直播全家桶（房间状态/商品实时/流量结构/观众画像） | ✅ 接口存在 · ⏳ 更新频率 | 直播监测线中场报告 |
| **小时级** | 通用报表族：粒度枚举 `TIME_GRANULARITY_DAILY / HOURLY` 两档封顶 | ✅ SDK 枚举原文 | 小时级复盘、拟案输入 |
| **T+1 / 7D** | 结算口径（商品 `LIVE_ORDER_SETTLE_*_7D`）、长周期转化 `LongTransferOrder*`、资金流水 `FinanceDetailGet` | ✅ 字段名证实 · 📄 结算口径 | 核销、对账 job |
| **事件推送（秒~分钟级，仅信号）** | 订阅 SPI/RDS：17 种事件，**只推变更 ID 与停投状态，不推值** | 📄 官方文档全表 | 停投告警、变更触发回读 |

**已证实的硬限制**：无分钟以下报表粒度；无预算/余额推送事件；无回放下载/拉流/弹幕 API；多合一数据报表历史回溯仅 ~30 天（📄 ThinkingData 集成文档口径，官方原文待查）。

---

## 2. 接入前提

- **应用**：`app_id=1877632074746032`（凭证在 `.env.local`，secret 建议集成后轮换）
- **授权页**：`qianchuan.jinritemai.com/openapi/qc/audit/oauth.html?app_id=…&material_auth=1`——授权必须从 BC业绩系统（kpi.limotea.cn）会话内发起，裸 URL 会报"授权会话无效"
- **端点**（✅ SDK 证实）：换取 `POST /open_api/oauth2/access_token/`（{app_id, secret, grant_type=authorization_code, auth_code}）· 刷新 `/oauth2/refresh_token/` · 已授权账户 `/oauth2/advertiser/get/`
- **token 生命周期**：access ~24h · refresh ~30d **且轮换**（每~5次刷新换新，每次必须落盘——单持有者原则，与 BC 系统的 token 归属需二选一）
- **权限点**：接口逐个 scope 审批（lead time）；千川有独立文档集（open.oceanengine.com labels/12），OE 通用类型不保证对千川账户生效 ⏳
- **回调**：`https://kpi.limotea.cn/api/qianchuan/oauth/callback`（BC 系统持有）

---

## 3. 数据域总目录（1269 API 类，按域）

| 域 | 规模 | 代表接口（类名去 V 版本后缀） |
|---|---|---|
| 投放管理 | 全套 | Project*/Promotion*/Campaign*/Ad* CRUD + 批量预算/状态 |
| 全域推广控制 | 20+ | UniPromotionAdControlTask*（create/update/budget/status/**SmartControlCreate** 智能托管） |
| 建议引擎 | 8+ | SuggestBid/SuggestBudget/SuggestRoiGoal/EstimateEffect/AwemeSuggestBid |
| 直播大屏 | 10+ | TodayLiveRoom*/ConfigGet/DataGet/ReportLive/ReportTodayLive* |
| 报表 | 42 个 Report* | Custom+Config、Ad、Material、**SearchWord 搜索词**、**VideoUserLose 流失**、UniPromotion 按达人/按直播间切片 |
| 资金 | 含流水 | AccountBalance/FinanceWallet/**FinanceDetail 资金流水**/AccountBudget/代理转账族 |
| 达人 | 15+ | **AwemeAuthList 达人授权**/**AwemeEstimateProfit 预估收益**/AwemeOrder*（订单/配额/建议时段）/VideoStar 星图 |
| 人群 DMP | 16 | Audience 包上传/推送/管理、Orientation 定向包 |
| 素材 | 47 | 视频/图片/卡点、**FileVideoEfficiency 素材效率**、MaterialAd 素材级报表 |
| 电商联动 | 6+ | Shop/ShopAuthorized/ShopAdvertiserList/ProductAvailable/Brand 授权 |

---

## 4. 重点域字段级明细

### 4.1 直播大屏（监测线核心）

**基础族**：
- `TodayLiveRoomGet`（今日直播间列表）/ `TodayLiveRoomDetailGet`（详情：`aweme_id/name/avatar` 主播账号、`room_id/room_status/room_cover/room_title`、`start_time/end_time`、`room_delivery`）
- `FlowPerformanceGet` 流量来源结构，来源枚举全表：`HOMEPAGE_FOLLOW 关注 / HOMEPAGE_FRESH / HOMEPAGE_HOT 推荐 / LIVE_MERGE 直播聚合 / LIVE_PC_QIAN_CHUAN / LIVE_XIAO_DIAN_QIAN_CHUAN 千川 / ECOM_AD_THIRD_QC_BRAND 千川品牌 / GENERAL_SEARCH 搜索 / VIDEO_TO_LIVE 视频引流 / DOUYIN_SHOPPING_CENTER 商城 / TOUXI_SAAS / OTHERS_*` ✅
- `TodayLiveRoomUserGet` / `TodayLiveV2RoomUserGet` 观众画像：`age / gender / city` ✅

**大屏自定义报表引擎**（关键机制）：
```
ReportTodayLiveRoomConfigGet → topics[] → customConfigDatas[]:
    dimensions[] (含 filterConfig.rangeValues)
    metrics[]    (字段: name / description / unit / exclusion_dims)   ← 指标目录运行时下发
ReportTodayLiveRoomDataGet({topic, dimensions, metrics}) → rows[{dimensions, metrics}] + pageInfo
```
✅ 结构证实；**指标全集（在线人数/GMV/千川消耗等是否全在）⏳ token 后第一次调用即全量枚举**。

### 4.2 商品级实时表现（`TodayLiveRoomProductListGet`，字段全录）✅

```
支付/成交: LIVE_PAY_ORDER_COUNT_ALIAS · LIVE_PAY_ORDER_GMV_ALIAS · LUBAN_LIVE_PAY_ORDER_COUNT/GMV
          TOTAL_LIVE_PAY_ORDER_GPM_ECOM（GPM）· PRODUCT_CLICK_PAY_UCNT_RATIO（点击成交率）
消耗分摊: LIVE_COST_PER_PRODUCT（该商品分摊消耗）
结算7日:  LIVE_ORDER_SETTLE_AMOUNT7D · _COUNT7D · _COUNT_RATE7D · _ROI_PER_PRODUCT7D
          AD_LIVE_ORDER_SETTLE_COST_PER_PRODUCT7D · _ROI_PER_PRODUCT7D · 退款 LIVE_ORDER_REFUND_AMOUNT
讲解/货架: LIVE_PRODUCT_EXPLAIN_CNT（讲解次数）· LIVE_PRODUCT_BIND_TIME · EXPLAIN_STATUS
商品档案: PRODUCT_ID · TITLE · IMG_URL · LIVE_PRODUCT_PRICE · LIVE_PRODUCT_INVENTORY
```

**价值**：商品级 ROI 给到**支付与结算双口径**——"哪个品值得加投"的判断素材官方直供。

### 4.3 投放管理（预算闭环的手）

- 批量预算：`/open_api/v3.0/project/budget/update/` `{project_id, budget: Double, budget_mode: DAY|INFINITE}`；批量状态 `{project_id, opt_status: ENABLE|DISABLE}`；千川 v1.0 族含 `budget+revive_budget` 一次性恢复；账户级 `/2/advertiser/update/budget/`
- ⚠️ 约束未在 SDK 注释中体现（预算下限/频次在规则中心，实装前以预检接口+实测为准）；`budget` 是 `Double`——**金额以元为单位浮点，我方账本以分整数记账，边界处必须换算并处理舍入**

### 4.4 资金与对账

`AccountBalanceGet` 余额 · `FinanceWalletGet` 钱包 · `FinanceDetailGet` **流水明细**（对账 job 的正本输入）· 代理商转账/充值校验族 · `NearRealtimeCostGet` 准实时消耗（§1）

### 4.5 订阅事件（信号，不是值）📄

17 种事件：`settings.project/promotion.realtime`（配置变更→**只给 ID**，回读取值）、`status.project/promotion.realtime`（状态，停投原因枚举 `OFFLINE_BALANCE / BALANCE_OFFLINE_BUDGET / PROJECT_OFFLINE_BUDGET / PROMOTION_OFFLINE_BUDGET / PROJECT_STATUS_BUDGET_EXCEED / DISABLE_BY_QUOTA`）、`action.quota.realtime` 配额、`compensate.status.realtime` 成本保障、素材/违规/落地页族。SPI 补拉窗口 **2 天**；RDS（连山）为高时效通道；加号 500 账户/请求，AGENT 维度一等公民。

### 4.6 账户体系与子账号数据（BC/代理）✅

**我们是 BC（商务中心）体系**（BC业绩系统即证据）。子账号=BC 下的广告主账户：

| 能力 | 接口 |
|---|---|
| BC 账户列表 | `CustomerCenterAccountListV30` / 下线账户 `AccountOfflineListV30` |
| BC 下广告主列表/可转账列表 | `CustomerCenterAdvertiserListV2` / `AdvertiserTransferableListV2` |
| BC 资金调拨 | `CustomerCenterFundTransferSeqCreate/CommitV2` |
| BC 账户复制 | `CustomerCenterAdvertiserCopyV2` |
| 代理侧客户列表 | `/agent/advertiser/select/` · 二级代理 `/agent/child_agent/select/` |
| 代理消耗报表 | `/report/agent/get_v2/` · `/agent/adv/cost_report/list/query/` |
| token 可操作账户枚举 | `/oauth2/advertiser/get/` |

**取数模型**：无单次跨账户聚合查询——先枚举账户（BC/代理两套），再**逐账户参数化拉取**（所有业务 API 带 `advertiser_id`）。跨账户聚合要么走 BC/代理报表，要么自己汇总。每账户数据：`/v1.0/qianchuan/report/advertiser/get/`（账户报表）+ 自定义报表 `BASIC_DATA` 主题按账户维度。

### 4.7 计划的视频/素材级数据 ✅

**自定义报表主题**（`ReportCustomGetV30DataTopic` 枚举原文，注意官方把 DURATION 拼成 DUARATION）：

```
MATERIAL_DATA · STD_MATERIAL_DATA            素材数据
UNI_PROJECT_DATA · UNI_PROJECT_MATERIAL_DATA 全域计划/全域素材
VIDEO_DUARATION_DATA                          视频时长分析
DPA_VIDEO_DATA                                DPA 视频
PRODUCT_DATA · STD_PRODUCT_DATA              商品维度
QUERY_DATA · STD_QUERY_DATA                   搜索词
BIDWORD_DATA                                  出价词
DMP_DATA                                      人群
MATERIAL_BOOST_DATA · ONE_KEY_BOOST_DATA      素材加热/一键加热(随心推)
BASIC_DATA · STD_BASIC_DATA                   基础数据
```

**专用素材报表**：
- `/v1.0/qianchuan/report/ad/material/get/` 计划素材报表，行 = `{aweme_id, material_id, metrics}`——**可按达人号 × 素材下钻**
- `QianchuanMaterialAdGetV10` 素材级投放数据；素材形态枚举 `VIDEO / IMAGE / LIVE_ROOM / TITLE`；营销场景 `FEED / SEARCH / SHOPPING_MALL`
- `FileVideoEfficiencyGetV10` 视频效率
- `ReportCustomCreativeGetV30` **创意级自定义报表**（dimensions+metrics 目录制，同大屏引擎模式）
- 内容侧：`AdGetV2` 返回计划创意（视频/图片明细），`VideoGet / FileVideoAwemeGet` 视频档案

**大吞吐**：`ReportCustomAsyncTaskCreate/Get/DownloadV30`——异步报表任务（建任务→轮询→下载），回填/日拉全量走这条，避开同步接口频控。

### 4.8 商品卡投放数据 ✅（定位法）

无独立"商品卡"报表——靠两级枚举定位：

- **推广目的**（`AdGetV2DataPromotionType`）：`LIVE`（直播间）/ **`GOODS`（商品——商品卡与短视频带货都在此目的下）** / `AWEME_HOME_PAGE` / `LANDING_PAGE_LINK`
- **素材形态**（`MaterialAdGetV10MaterialType`）：`VIDEO / IMAGE / LIVE_ROOM / TITLE`——商品卡 ≈ GOODS 目的 × IMAGE/卡片形态

**取数路径**：`promotion_type=GOODS` 过滤计划 → 素材形态细分（IMAGE vs VIDEO 区分商品卡与短视频带货）→ `PRODUCT_DATA` 主题按商品下钻 → 指标目录运行时枚举（`ReportCustomConfigGetV30`）。直播中实时商品表现走 `TodayLiveRoomProductListGet`（§4.2）。

### 4.9 商品卡有专属数据主题（V10 枚举原文，§4.8 的升级答案）✅

千川 V10 自定义报表（`QianchuanReportCustomGetV10DataTopic`）主题族按"推广目的×素材形态"直接分好了：

```
SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE   ← 商品卡（图文）专属数据主题
SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO   商品-短视频带货
SITE_PROMOTION_PRODUCT_POST_DATA_TITLE   商品-标题卡
SITE_PROMOTION_PRODUCT_POST_DATA_OTHER   商品-其他形态
SITE_PROMOTION_POST_DATA_LIVE            直播推广-直播间
SITE_PROMOTION_POST_DATA_VIDEO/OTHER/TITLE  直播推广-视频等
ECP_BASIC_DATA                           电商基础
```

**商品卡取数不再需要两步定位——直接拉 `SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE` 主题**。指标目录条目五元组：`{name, description, unit, exclusion_dims, field}`（`ConfigGet` 运行时下发）。

### 4.10 计划级报表字段全录（`/v1.0/qianchuan/report/ad/get/` 行模型）✅

按类归组的完整指标目录（SDK `QianchuanReportAdGetV10ResponseDataListInner` 原文）：

**维度**：`ADVERTISER_ID · AD_ID · STAT_DATETIME`

**消耗与曝光**：`STAT_COST · SHOW_CNT · CLICK_CNT · CTR · CPM_PLATFORM · CPC_PLATFORM`

**转化（浅/深/归因）**：`CONVERT_CNT/COST/RATE · DEEP_CONVERT_CNT/COST/RATE · ATTRIBUTION_CONVERT_CNT/COST/RATE（+DEEP）`

**成交（支付口径）**：`PAY_ORDER_COUNT/AMOUNT/COUPON_AMOUNT/COST_PER_ORDER · PREPAY_ORDER_COUNT/AMOUNT · PREPAY_AND_PAY_ORDER_ROI · CREATE_ORDER_COUNT/AMOUNT/COUPON_AMOUNT/ROI`

**结算口径 7D/14D（对账正本）**：`AD_ALL_ORDER_SETTLE_AMOUNT/COUNT/COST/ROI/RATE_{7D,14D} · AD_ORDER_REFUND_RATE · AD_ORDER_GMV_REFUND_RATE · ALL_ORDER_REFUND_AMOUNT/COUNT_{7D,14D}`

**7 日支付族**：`ALL_ORDER_PAY_COUNT/GMV/ROI_7DAYS · ALL_ORDER_CREATE_ROI_7DAYS`

**间接成交**：`INDIRECT_ORDER_CREATE/PAY/PREPAY_{COUNT,GMV}_7DAYS · INDIRECT_ORDER_UNFINISHED_ESTIMATE_GMV_7DAYS · UNFINISHED_ESTIMATE_ORDER_GMV`

**直播互动**：`LUBAN_LIVE_ENTER/COMMENT/SHARE_CNT · LUBAN_LIVE_GIFT_AMOUNT/CNT · LUBAN_LIVE_SLIDECART_CLICK_CNT（滑出购物车点击）· LUBAN_LIVE_CLICK_PRODUCT_CNT · LIVE_PAY_ORDER_COST_PER_ORDER · LIVE_WATCH_ONE_MINUTE_COUNT（1分钟观看）· LIVE_FANS_CLUB_JOIN_CNT（粉丝团加入）`

**抖音侧互动**：`DY_COMMENT/FOLLOW/LIKE/SHARE`

**视频播放**：`TOTAL_PLAY · PLAY_DURATION3S · PLAY25/50/75_FEED_BREAK（完播进度）· PLAY_OVER · PLAY_OVER_RATE`

**首单与 LTV（含达人/品牌变体）**：`QIANCHUAN_FIRST_ORDER_CNT/CONVERT_COST/DIRECT_PAY_GMV/DIRECT_PAY_ORDER_ROI/LTV30/RATE/ROI30` + 同构 `AUTHOR_*`（达人首单）与 `BRAND_*`（品牌首单）变体

**ECP**：`ECP_CONVERT_CNT/RATE · ECP_CPA_PLATFORM`

**筛选器**（`Filtering` 模型）：`campaign_scene / marketing_goal / marketing_scene / status / order_platform / smart_bid_type`——按推广目的、营销场景、状态、托管类型过滤。





---

## 5. 用例映射

### 投流预算调整闭环（MVP P0）
| 环节 | 数据源 |
|---|---|
| 拟案输入 | SuggestBudget/SuggestRoi + ReportCustom（小时级）+ NearRealtimeCost + Balance |
| 质量门证据 | NearRealtimeCost（执行前后对比）+ project/list 回读（budget/opt_status 值验证） |
| 派单执行 | project/budget/update · project/status/update · UniPromotion ControlTask |
| 哨核 | Balance 轮询 + NearRealtimeCost + status.*.realtime 停投信号 |
| T+1 核销 | FinanceDetail + ReportAd（日粒度）+ 订阅补拉（2 天窗口内） |

### 直播监测线
| 环节 | 数据源 |
|---|---|
| 开播检测（无 webhook，轮询） | TodayLiveRoomGet（1min 拍频起步） |
| 中场报告 | 大屏族（Detail/Flow/Product/User）+ NearRealtimeCost + 订阅状态事件 |
| 建议=拟案 | 同投流闭环（同一套门-签-派-验-审） |
| 下播复盘 | ReportTodayLive + 结算字段 7D + 视频腿（自录） |
| 排班/主播档案 | **BC 业绩系统**（schedule/part-time-anchors/trader 模块，已存在） |

### 达人线（第三产线，接入成本低于预期）
AwemeAuthList（授权台账）+ AwemeEstimateProfit + AwemeOrder*（合作订单）+ ReportUniPromotionDimensionDataAuthor（按达人切片报表）

---

## 6. 待实测清单（token 到手后，一次跑完）

1. `ReportTodayLiveRoomConfigGet` → **枚举大屏指标全目录**（一举定可得性边界）
2. `TodayLiveRoomDataGet` → 实测数据点密度/更新频率（分钟级？）⏳ 决定中场调投拍频
3. `NearRealtimeCostGet` → 实测延迟（UI 口径 ~3min，API 实测为准）
4. `TodayLiveRoomGet` 轮询开播检测的稳定性 + 频控余量
5. 千川 scope 后台核对（本 app material_auth=1 维度下能开哪些权限点）
6. budget `Double` 换算边界（元↔分舍入）+ 预算下限/频次实测

---

## 8. 实测记录（2026-11-04，token 已落地）✅

### 8.1 OAuth 实战——方案 B 无痛落地

直接打开授权页 `qianchuan.jinritemai.com/openapi/qc/audit/oauth.html?app_id=…&state=<自定义>&material_auth=1`（**无需 BC 登录**）→ 授权后千川跳回调 URL，**auth_code 就在地址栏**，从浏览器截取即可自换 token——BC 代码零改动。换 token：`POST open.oceanengine.com/open_api/oauth2/access_token/` 一次成功（code:0）。token 已存 `.env.local`（QC_ACCESS_TOKEN 24h / QC_REFRESH_TOKEN 30d，**refresh 轮换制，每次刷新必须落盘**）。授权带回 22 个 scope 权限点 + uid。

### 8.2 账户结构实测

- OAuth 层 3 账户：李陌茶业(1868699836561623, 企业BP管理) · 李陌茶官方旗舰店(59589091, 店铺账号) · BP-CUSTOMER_ADMIN
- **token exchange 的 `advertiser_ids` 返回空——账户清单必须调 `oauth2/advertiser/get`**
- 投放子账户：`/v1.0/qianchuan/shop/advertiser/list/?shop_id=59589091`（**参数是 shop_id=店铺账号id，不是 advertiser_id；page_size≤100**）→ **45 个投放户**（存档 `data/qc-accounts-20261104.txt`）
- 组织形态：按投手分户（投手-陈小苗/王栋/欧海涵…）· 按形态分户（商品卡专户×6、全域户、品专户、手播户×7）· 子品牌（小咖秀茶膏、研茶小二、李陌茶科院茶研室、迪士尼投放）
- **店铺账号(59589091)不能直接当千川接口的 advertiser_id**（40002 role wrong）——投放接口用 45 户的 id

### 8.3 接口参数陷阱（血泪实测，后续开发照此写）

| 接口 | 陷阱与正确姿势 |
|---|---|
| `report/advertiser/get` | filtering **必填三项**：`campaign_scene`（六值：DAILY_SALE/LIVE_HEAT/NEW_CUSTOMER_TRANSFORMATION/NEW_PRODUCT_BOOST/PLANT_GRASS/PRODUCT_HEAT，**字符串非数组**）+ `marketing_goal`（ALL/LIVE_PROM_GOODS/VIDEO_PROM_GOODS）+ `marketing_scene`（ALL/FEED/SEARCH/SHOPPING_MALL）；`time_granularity=TIME_GRANULARITY_DAILY|HOURLY`（**无 STAT_ 前缀**）；fields 用 `stat_cost/show_cnt/click_cnt/ctr/cpc_platform`（`cost`、`pay_gmv` 非法） |
| `account/balance/get` | `/v1.0/qianchuan/account/balance/get/?advertiser_id=<投放户>` 直通（旗舰店户余额为 0） |
| `today_live/room/get` | **需要 `aweme_id`（主播抖音号）**——不能只按账户查全部房间 |
| `report/uni_promotion/get` | `marketing_goal≠ALL` 时 `order_platform` 仅支持 `QIANCHUAN`；fields 词表与标准报表不同（stat_cost 也触发 50000）——**词表待 ConfigGet 枚举** |
| 标准报表实测 | 旗舰店/投手户/全域户昨日 DAILY_SALE+LIVE_HEAT 均 code:0 但**空数据** → 大概率投放以全域计划为主，**全域报表是主战场** |

### 8.4 下一步（已具备条件）

1. `ReportCustomConfigGet`（V10/V30）拉运行时指标目录——全域报表字段词表的官方答案
2. `aweme_id` 来源：达人授权列表 `AwemeAuthListGet` 或 BC 排班模块
3. `near_realtime_cost/get`（v3.0）准实时消耗首调
4. 45 户全量日报的异步任务（ReportCustomAsyncTask）管道

## 9. 证据索引

- 本地：`D:\dev\refs\ad_open_sdk_java`（pin e8c324c）——所有 ✅ 项可 grep 复现（`src/main/java/com/bytedance/ads/{api,model}/`）
- 文档：千川 API 列表 open.oceanengine.com/labels/12/docs/1697459486216200 · 订阅服务 labels/7/docs/1732513335286795 · Scope 清单 labels/7/docs/1699352157034496 · 自定义报表 labels/7/docs/1741387668314126
- 历史回溯 30 天限制：ThinkingData 集成文档（📄 第三方口径，官方原文待查）

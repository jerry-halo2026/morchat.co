# 千川 API 开发手册（实测版）

> 文档定位更新（2026-11-04）：本文件仅为 morchat 首个业务场景的技术资料，不定义平台定位或 MVP 建设顺序。接口/实测结论保留原记录日期，本轮未重新调用验证。历史“下一步”、排期和部署描述不构成当前执行授权；当前只读场景范围以 [平台 PRD](D:/dev/morchat.co/docs/PRD.md) 和 [建设路线](D:/dev/morchat.co/docs/PLAN.md) 为准。生产写入、预算审批、直播监测另行立项。

> 历史内部开发记录：原稿记录了 **2026-11-04 真实 token 实测**及资料汇总；具体条目按其证据判断。本轮只整理定位，不复验运行状态。
> 配套：[数据面与字段语义](D:/dev/morchat.co/docs/QIANCHUAN-DATA.md)；历史证据目录为 D:/dev/morchat.co/data，凭据不随文档分发。
> 原则：**每个配方都附实测可用的 curl；每个陷阱都写明报错原文。**

---

## 1. 鉴权

### 1.1 Token 获取（OAuth）

授权页（无需 BC 系统，直接开）：
```
https://qianchuan.jinritemai.com/openapi/qc/audit/oauth.html?app_id=<APP_ID>&state=<自定义随机>&material_auth=1
```
授权完成后千川跳回调，**`auth_code` 在回调 URL 参数里**（浏览器地址栏可截取；BC 页面显示"会话无效"不影响）。

换取（auth_code 单次有效，几分钟内）：
```bash
curl -X POST https://open.oceanengine.com/open_api/oauth2/access_token/ \
  -H "Content-Type: application/json" \
  -d '{"app_id": <APP_ID>, "secret": "<SECRET>", "grant_type": "authorization_code", "auth_code": "<CODE>"}'
```
返回：`access_token`(24h) + `refresh_token`(30d) + `advertiser_ids`(实测返回**空数组**，账户清单要另查)。

### 1.2 Token 刷新（轮换制！）

```bash
curl -X POST https://open.oceanengine.com/open_api/oauth2/refresh_token/ \
  -H "Content-Type: application/json" \
  -d '{"app_id": <APP_ID>, "secret": "<SECRET>", "grant_type": "refresh_token", "refresh_token": "<RT>"}'
```
**⚠️ refresh_token 每次刷新返回新值（约每5次轮换），必须每次落盘。单持有者原则。**

### 1.3 调用规范

- 请求头：`Access-Token: <access_token>`
- 返回信封：`{"code":0,"message":"OK","request_id":"...","data":{...}}`——**HTTP 200 不代表成功，必须判 code**
- `request_id` 是平台侧唯一追溯号，**每次调用落审计日志**
- 域名：`open.oceanengine.com` 服务 v1.0/oauth；`ad.oceanengine.com` 服务 v3.0 业务端点（`near_realtime_cost` 在 open 域 404 实测）
- 分页：`page` + `page_size`；各接口 page_size 上限不一（shop/advertiser/list 上限 100）

---

## 2. 调用配方（全部实测通过）

### 2.1 账户枚举链

**① OAuth 层账户**（BP 管理/店铺/CUSTOMER_ADMIN）：
```bash
curl "https://open.oceanengine.com/open_api/oauth2/advertiser/get/?app_id=<APP_ID>" -H "Access-Token: $T"
```
实测：3 户——李陌茶业(1868699836561623 企业BP) · 李陌茶官方旗舰店(59589091 店铺) · BP-CUSTOMER_ADMIN。

**② 投放子账户**（真正投放用的 45 户）：
```bash
curl "https://open.oceanengine.com/open_api/v1.0/qianchuan/shop/advertiser/list/?shop_id=<店铺账号ID>&page=1&page_size=100" -H "Access-Token: $T"
```
⚠️ 参数是 **`shop_id`**（=店铺账号 ID），不是 advertiser_id；page_size≤100。45 户清单存档 `data/qc-accounts-20261104.txt`。
⚠️ **店铺账号(59589091)不能当投放接口的 advertiser_id**（报 40002 role wrong）。

### 2.2 主播（达人）清单

```bash
curl "https://open.oceanengine.com/open_api/v1.0/qianchuan/aweme_auth_list/get/?advertiser_id=<投放户>&page=1&page_size=50" -H "Access-Token: $T"
```
⚠️ 路径是 `aweme_auth_list/get`（下划线），`aweme/auth/list` 404。
返回：`authorization_infos[]` 含 `aweme_id/aweme_name/auth_status/auth_range`。实测旗舰店户 4 个授权主播：官方旗舰店(870435004886184) · 阿峰茶厂 · 小尹有好茶 · 屈屈有好茶。

### 2.3 今日直播（谁在播/播了什么）

```bash
curl -G "https://open.oceanengine.com/open_api/v1.0/qianchuan/today_live/room/get/" \
  --data-urlencode "advertiser_id=<投放户>" \
  --data-urlencode "aweme_id=<主播ID>" \
  --data-urlencode "date_time=2026-11-04" \
  --data-urlencode 'fields=["room_id","room_title","room_status","start_time","end_time","target_online_status"]' \
  --data-urlencode "page=1" --data-urlencode "page_size=20" -H "Access-Token: $T"
```
⚠️ **`aweme_id` 必填**（接口按主播维度查）；**`fields` 必填**。
实测返回：`李陌茶4周年，双11狂欢盛典！！！` 10:08:26-14:09:03，room_id=7704132348199832383，FINISH。
**"今天谁在播"的正确姿势：主播清单(2.2) × today_live/room/get 逐主播轮询**（无按账户直查全部房间的接口）。

### 2.4 房间详情

```bash
curl "https://open.oceanengine.com/open_api/v1.0/qianchuan/today_live/room/detail/get/?advertiser_id=<投放户>&room_id=<房间ID>" -H "Access-Token: $T"
```
返回主播信息/房间状态/起止时间/封面。

### 2.5 直播大屏：先目录后取数

**① 指标目录**（每个指标的官方中文名/口径/单位）：
```bash
curl -G "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/today_live/room/config/get/" \
  --data-urlencode "advertiser_id=<投放户>" \
  --data-urlencode 'data_topics=["ROOM_FLOW_PERFORMANCE","ROOM_PRODUCT_LIST"]' -H "Access-Token: $T"
```
⚠️ `data_topics` 是**数组**且必填；topic 枚举仅两值。目录 JSON 已存档 `data/qc-dashboard-config-20261104.json`。

**② 取数**（DataGet）：
```bash
curl -G "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/today_live/room/data/get/" \
  --data-urlencode "advertiser_id=<投放户>" \
  --data-urlencode "data_topic=ROOM_FLOW_PERFORMANCE" \
  --data-urlencode 'dimensions=["room_id"]' \
  --data-urlencode 'metrics=["total_live_watch_cnt_flow_ecom","total_live_pay_order_gmv_flow_ecom"]' \
  --data-urlencode 'filters=[]' \
  --data-urlencode 'order_by=[...]' \
  --data-urlencode "start_time=2026-11-04 00:00:00" --data-urlencode "end_time=2026-11-04 23:59:59" \
  --data-urlencode "page=1" --data-urlencode "page_size=10" -H "Access-Token: $T"
```
⚠️ 必填链逐个报错揭示：`dimensions` → `metrics` → `filters` → `order_by`。**全部已解**：
- `filters` 必须含 **room_id 筛选**：`[{"field":"room_id","operator":7,"values":["<房间ID>"]}]`
- `order_by`：`[{"field":"<指标>","type":2}]`，**type 是整数**（1/2）
- **实测通过**（4周年房间）：自然流量进入 7,288 · 成交 GMV ¥15,679.20
- **商品行同引擎**：`data_topic=ROOM_PRODUCT_LIST` + dims=[product_id,product_name] + room 筛选 → **56 商品/6页**，每商品消耗/GMV/订单（product_list/get 的替代路径，后者 fields 词表=大屏商品维度名但实测空数据）

### 2.6 标准报表（账户/计划）

```bash
curl -G "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/advertiser/get/" \
  --data-urlencode "advertiser_id=<投放户>" \
  --data-urlencode "start_date=2026-11-04" --data-urlencode "end_date=2026-11-04" \
  --data-urlencode 'filtering={"campaign_scene":"DAILY_SALE","marketing_goal":"ALL","marketing_scene":"ALL"}' \
  --data-urlencode "time_granularity=TIME_GRANULARITY_DAILY" \
  --data-urlencode 'fields=["stat_cost","show_cnt","click_cnt","ctr","cpc_platform"]' \
  -H "Access-Token: $T"
```
**filtering 三项必填**（缺一逐个报错）：
- `campaign_scene`（字符串非数组）：`DAILY_SALE | LIVE_HEAT | NEW_CUSTOMER_TRANSFORMATION | NEW_PRODUCT_BOOST | PLANT_GRASS | PRODUCT_HEAT`
- `marketing_goal`：`ALL | LIVE_PROM_GOODS | VIDEO_PROM_GOODS`
- `marketing_scene`：`ALL | FEED | SEARCH | SHOPPING_MALL`
**fields 词表**：`stat_cost/show_cnt/click_cnt/ctr/cpc_platform`（`cost`、`pay_gmv` 非法会报"非法数据报表指标入参"）。
粒度：`TIME_GRANULARITY_DAILY | TIME_GRANULARITY_HOURLY`（**无 STAT_ 前缀**）。
实测：code:0 但 DAILY_SALE/LIVE_HEAT 场景空数据——投放疑似以全域计划为主，见 §4 待解。

### 2.7 账户余额

```bash
curl "https://open.oceanengine.com/open_api/v1.0/qianchuan/account/balance/get/?advertiser_id=<投放户>" -H "Access-Token: $T"
```
返回总余额/通用/品牌/竞价账户的 total/valid/frozen 分解。

---

## 3. 实测收割的字段目录

### 3.1 大屏·商品 topic（board_product_list）——14 指标全录（官方口径原文节选）

| field | 名称 | 口径要点 |
|---|---|---|
| `live_cost_per_product` | 消耗 | 按商品点击次数拆分直播间总消耗 |
| `luban_live_pay_order_gmv` | 投放GMV | 投放引导直播间下单累积（含预售） |
| `luban_live_pay_order_count` | 投放成交订单 | 投放引导累积订单（含预售） |
| `live_pay_order_roi_per_product` | 直接支付ROI | (直接成交+智能券)/消耗 |
| `live_order_settle_amount_7d` | 投放直接结算金额(7天) | 成交后7天未退款 |
| `live_order_settle_count_7d` | 结算订单数(7天) | 同上 |
| `live_order_settle_count_rate_7d` | 订单结算率(7天) | 结算/成交 |
| `ad_live_order_settle_roi_per_product_7d` | 结算ROI(7天) | 结算金额/消耗 |
| `ad_live_order_settle_cost_per_product_7d` | 结算成本(7天) | 消耗/结算订单 |
| `live_order_refund_amount` | 投放实时退款金额 | 实时退款千川销售金额 |
| `all_order_refund_amount_7d` / `ad_order_gmv_refund_rate_7d` / `ad_order_refund_rate_7d` | 退款三件套(7天) | 金额/金额率/订单率 |

维度：`product_id/名称/封面/价格/库存/讲解次数/讲解状态/上架时间/点击-成交转化率/GPM/累积GMV/累积订单/room_id/投放来源`

### 3.2 大屏·流量 topic（board_traffic_source）

- 维度：`combined_third_flow_category_expand_ecom_nature`（流量来源拆自然，25 个标签：直播广场/搜索/推荐feeds/同城/抖音商城/千川品牌各形态/DOU+/随心推…全枚举在 config JSON）+ `room_id`
- 指标：`total_live_watch_cnt_flow_ecom`（自然流量进入次数）· `total_live_pay_order_gmv_flow_ecom`（直播间整体成交金额）

### 3.3 计划级报表字段与全套枚举

见 `QIANCHUAN-DATA.md` §4.10（100+ 字段按 12 类）——SDK 模型证实，词表以本手册 §2.6 实测格式为准。

---

## 6. 三大板块数据面（全域体系实测，2026-11-04 下午追加）

### 6.1 关键架构事实：这家已迁全域，标准接口是空的

- ECP/标准报表接口（`report/advertiser/get`、custom ECP_BASIC_DATA）对全部实测账户返回 **code:0 + 空数据**
- custom/get 查 SITE_PROMOTION 主题报官方迁移公告：**"全域素材数据主题已下线…请迁移至【获取全域数据】接口"**
- **结论：本公司数据主战场 = `report/uni_promotion/*` 全域族**（config → data/get），标准族保留给品牌/历史

### 6.2 全域数据配方（实测拉到真数据 ✅）

**① 目录**（维度/指标/筛选枚举全量，135KB 存档 `data/qc-uni-config-20261104.json`）：
```bash
curl -G ".../open_api/v1.0/qianchuan/report/uni_promotion/config/get/" \
  --data-urlencode "advertiser_id=<投放户>" \
  --data-urlencode 'data_topics=["SITE_PROMOTION_POST_DATA_LIVE","SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE","SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO"]' \
  -H "Access-Token: $T"
```

**② 取数**（三个必填筛选逐个报错揭示，无 ALL 值）：
```bash
curl -G ".../open_api/v1.0/qianchuan/report/uni_promotion/data/get/" \
  --data-urlencode "advertiser_id=1786139492330569" \
  --data-urlencode "data_topic=SITE_PROMOTION_POST_DATA_LIVE" \
  --data-urlencode 'dimensions=["anchor_id","roi2_material_anchor_name"]' \
  --data-urlencode 'metrics=["stat_cost_for_roi2_fork","live_watch_count_exclude_video_for_roi2","total_pay_order_gmv_for_roi2_fork","total_prepay_and_pay_order_roi2_fork"]' \
  --data-urlencode 'filters=[{"field":"ecp_app_id","operator":7,"values":["1"]},{"field":"anchor_id","operator":7,"values":["870435004886184"]},{"field":"aggregate_smart_bid_type","operator":7,"values":["0"]}]' \
  --data-urlencode 'order_by=[{"field":"stat_cost_for_roi2_fork","type":2}]' \
  --data-urlencode "start_time=2026-11-04 00:00:00" --data-urlencode "end_time=2026-11-04 23:59:59" \
  --data-urlencode "page=1" --data-urlencode "page_size=20" -H "Access-Token: $T"
```
**实测返回（今天 4 周年直播间）**：消耗 ¥2,358.60 · 观看 5,358 · GMV ¥8,444.30 · ROI 3.81

**铁律**：
- page_size ∈ {10,20,50,100,200}（其余值拒收）
- `filters` 三必填：`ecp_app_id`(**1**=千川pc / **2**=小店随心推) + `anchor_id`(必填且要**真实主播ID**，来自 2.2 主播清单) + `aggregate_smart_bid_type`(**0**=控成本 / **7**=放量)
- `order_by` 格式：`[{"field":"<指标名>","type":<1|2>}]`——**type 是整数**（1/2，字符串 DESC 报错）
- 响应行结构：`rows[].dimensions.{field:{Value,ValueStr}}` + `rows[].metrics.{field:{Value,ValueStr,ShortValueStr,ShortValueUnit}}`

### 6.3 三大板块字段目录（uni config 实测收割）

| topic | 维度 | 指标数 | 板块 |
|---|---|---|---|
| `SITE_PROMOTION_POST_DATA_LIVE` | 日期 · **抖音号ID/名称/展示id** · roi2投放类型 · 下单平台 | **98** | 直播推广（含 37 个 `additional_delivery_*_assist` 协同助攻指标） |
| `SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE` | **素材ID · 图片名称** · 日期 · 素材创建时间 · 下单平台 · 全域素材搜索 | **55** | 商品卡 |
| `SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO` | **素材ID · 视频名称 · 素材建议** · 日期 · 创建时间 · 下单平台 | **65** | 短视频带货（55+10 个视频播放指标：完播率×4档/点赞/评论/关注/平均时长） |

**公共商业指标族**（三 topic 同构，`_for_roi2` 后缀）：展示/点击/CVR/转化/消耗/eCPM/CPC → 支付订单/GMV(含券)/ROI/券金额/平台补贴/未完成预估 → **结算五档窗口 ROI 1h/7d/14d/30d/90d** + 退款三件套 → 佣金成本。
**视频专属**：`video_play_count/finish_rate/like/comment/follow/avg_watch_duration/play_duration_{2,3,5,10}s_rate`。
**直播专属**：`live_{show,watch}_count_exclude_video / cvr / convert_rate` + 互动族 + `additional_delivery_*_assist`（追加投放协同效果——**多计划助攻归因官方直供**）。

### 6.4 自定义报表配方（标准体系的备用通道）

`report/custom/config/get`（目录，160KB 存档 `data/qc-custom-report-catalog-20261104.json`）+ `report/custom/get`（取数）。参数链与全域族相同（dimensions/metrics/filters/order_by/start_time 格式 `YYYY-MM-DD HH:mm:ss`），响应带 **`total_metrics` 汇总行**。ECP_BASIC_DATA 有 **21 个维度**（含 ad_id/ad_name/campaign_id/name/主播/商品/智能出价/状态）——**按计划下钻的标准体系入口**，本店实测空数据（已迁全域）。

### 6.5 品牌种草

`brand/report/ad/get`（品牌报表，参数同标准报表族）；星图侧 `QianchuanVideoStarGet`/`StarReportCustom*`。**未实测**——本店品牌户（品专户 1786143060693059）数据待拉。

### 6.6 全域计划列表（计划配置面）与主播枚举（实测 ✅）

**全域计划列表**（每计划的预算/ROI目标/状态/绑定主播——"每个计划"的内容侧）：
```bash
curl -G ".../open_api/v1.0/qianchuan/uni_promotion/list/" \
  --data-urlencode "advertiser_id=1786139492330569" \
  --data-urlencode "start_time=2026-11-04 00:00:00" --data-urlencode "end_time=2026-11-04 23:59:59" \
  --data-urlencode "marketing_goal=LIVE_PROM_GOODS" \
  --data-urlencode "order_type=DESC" --data-urlencode "order_field=stat_cost" \
  --data-urlencode "page=1" --data-urlencode "page_size=10" -H "Access-Token: $T"
```
⚠️ 此接口 `order_type` 是**字符串 ASC/DESC**（与 data/get 的整数 type 不同——两套规范并存）。
返回 `ad_info`{id,name,**budget**/budget_mode,**roi2_goal** 目标ROI,smart_bid_type,opt_status,deep_external_action} + `room_info`{anchor 绑定}。实测拿到全域户计划：日预算、ROI 目标 4.1/4.4、绑定旗舰店号。

**anchor 枚举（#7 已解）**：每投放户调 `aweme_auth_list/get`（§2.2）即该户全部可选主播。实测全域户 ~30 个授权号：官方旗舰店/阿峰茶厂/小尹系/屈屈系/科院系/**明星达人（吕良伟/马德钟JM/演员郑家生/长江日报）**——达人网络全名单的官方来源。

### 6.7 品牌种草（#6 机制验证 ✅）

`brand/report/ad/get`：参数同标准报表族，`campaign_scene` 仅 **LIVE_HEAT / PLANT_GRASS** 两值。实测品专户 code:0（近 4 日无品牌投放数据，机制通）。星图族（`QianchuanVideoStarGet`/`StarReportCustom*`）未测。

### 6.8 违规/搜索词/财务/审核（2026-11-05 实测）

**① 违规记录 ✅（重大发现：历史深度超报表，实测回溯到 2023）**
```bash
curl -G "https://ad.oceanengine.com/open_api/v3.0/security/score_violation_event/get/" \
  --data-urlencode "advertiser_id=<投放户>" --data-urlencode "business_line=QIANCHUAN" \
  --data-urlencode "page=1" --data-urlencode "page_size=20" -H "Access-Token: $T"
```
⚠️ v3.0 端点在 **ad 域**；business_line 枚举 `AD|LOCALAD|QIANCHUAN`。返回：`ad_id · material_id · illegal_type · reject_reason 全文 · create_time`——实测拉到 2023-12 的茶类功效违规全文。实时补充：订阅事件 `adv.violation.score` / `adv.disposal.score` / `agent_reject_promotion`。

**② 搜索词报表 ✅**
```bash
curl -G ".../open_api/v1.0/qianchuan/report/search_word/get/" \
  --data-urlencode "advertiser_id=<户>" --data-urlencode "start_date=…" --data-urlencode "end_date=…" \
  --data-urlencode "time_granularity=TIME_GRANULARITY_DAILY" \
  --data-urlencode "word_type=SEARCH_WORD"   # 或 KEY_WORD(出价词)
  --data-urlencode 'fields=["show_cnt","click_cnt","stat_cost","convert_cnt"]' \
  --data-urlencode 'filtering={"campaign_scene":"DAILY_SALE","marketing_goal":"LIVE_PROM_GOODS","marketing_scene":"SEARCH"}'  # 此接口 marketing_goal 无 ALL
  --data-urlencode "order_field=stat_cost" --data-urlencode "order_type=DESC" -H "Access-Token: $T"
```

**③ 财务流水 ✅**：`/v1.0/qianchuan/finance/detail/get/` {advertiser_id, start_date, end_date, page, page_size}。另有 fund 族（AdvertiserFundGet/FundDailyStat/FundTransaction）。

**④ 广告审核记录 ✅（2026-11-05 重授权后打通）**：`/v1.0/qianchuan/ad/reject_reason/?advertiser_id=…&ad_ids=[计划ID]`——**live API 要求 `ad_ids`（SDK 未列，参数漂移）**。实测 code:0 有数据。
**⚠️ Token 生命周期新机制（实测 40103 原文）**：重新授权会**作废旧 token 集**——同 app+授权用户同时仅一套活 token。auth-service 必须处理"授权被替换"事件：换新集即用，旧集不恋战。

**⑤ 历史深度终局结论**：报表族（uni/custom）**滚动 180 天**（UI 同限，无法手动导出更老；分段倒退被"起点必须近180天"规则封死）；**违规事件不受此限**（实测 2023）；财务/台账类深度待逐个验证。

---

## 4. 待解清单（2026-11-04 终态）

| # | 问题 | 结论 |
|---|---|---|
| 1 | ~~大屏 DataGet~~ | **✅ 已解**：必填 `room_id` 筛选 + order_by 整数 type。实测拉到真数据（§2.5） |
| 2 | ~~全域报表 500~~ | **✅ 已解**：正确入口 `uni_promotion/data/get`（§6.2），三必填筛选 |
| 3 | `near_realtime_cost/get` | **❌ 未解**：参数名穷举（advertiser_id/ids/account_id/逗号串）+ 双 token（用户/App-Access-Token，App token 已铸通 `oauth2/app_access_token/`）+ 双域名均报 advertiser required——判定为**权限点缺失伪装成参数错误**。后续：对 22 个已授 scope 与接口权限点清单，或可视化调试看真实参数规格 |
| 4 | ~~商品字段词表~~ | **✅ 已解**：走大屏 `ROOM_PRODUCT_LIST` topic（56 商品实测）；`product_list/get` 的 fields=大屏商品维度名但空数据 |
| 5 | ~~标准报表空数据~~ | **✅ 已解**：本店已迁全域体系（官方迁移公告 §6.1） |
| 6 | 品牌种草 | **⚠️ 机制✅**（brand/report code:0，scene 枚举 LIVE_HEAT/PLANT_GRASS）；品专户近期无数据，待有品牌投放的时段拉数；星图族未测 |
| 7 | ~~anchor 枚举~~ | **✅ 已解**：每户 `aweme_auth_list/get` = 该户主播全名单（全域户 ~30 号含明星达人） |
| 8 | 新增：plan 级别的全域计划配置 | **✅ 已解**：`uni_promotion/list`（§6.6）——预算/ROI目标/状态/绑定主播 |

## 5. 开发约定（写进 adapter 代码）

1. **判 code 不判 HTTP**：envelope `code!=0` 即失败，`request_id` 落审计链
2. **写操作前置读后验**：改预算前 project/list 读现值，改后回读 diff（飞单检测共用）
3. **关传输层重试**；超时先查后重试（平台无幂等）
4. **token 单持有者**：刷新即落盘 `.env.local`，刷新任务互斥
5. **字段名以本手册实测为准**，SDK 模型名（SERIALIZED_NAME）做交叉验证；报错信息常自带正确枚举（campaign_scene 六值就是这么拿的）——**用错误驱动探参是官方认可的调试路径**（可视化调试工具同款行为）

---

## 7. 调用形状裁定（2026-11-06 全参数探测，修复 plans 静默丢失后固化）

> 背景：45 账户 180 天回填跑了 ~1000 次调用，逐一验证"能不能一口气抓完"。结论：**调用矩阵是 API 形状决定的下限，不是客户端可优化项**。以下全部为当日实测（错误驱动探参，报错原文为准）。

### 7.1 硬约束（实测裁定）

| # | 问题 | 裁定 | 证据 |
|---|---|---|---|
| 1 | plans `page_size` 上限 | **100**（SDK 注释写 10/20/50/100/200 已过时） | `code=40000 msg=pageSize is invalid.`（200 被拒） |
| 2 | plans 不传 `marketing_goal` | **必填**，45 户 × 2 目标 = 90 次是下限 | `marketing_goal: value is required but missing` |
| 3 | LIVE 报表去掉 anchor 过滤一次拉全部主播 | **不可能**，anchor_id 是必填筛选项 | `参数错误：筛选条件中缺少必填项: anchor_id`（此前先报 `缺少必填项: ecp_app_id`） |
| 4 | `dimension_data/author/get` 不传 aweme_id | **必填**，该族接口按实体逐个查 | `aweme_id: value is required but missing` |
| 5 | data/get 长跨度 | **179 天整段一次请求 OK**（无 30 天切块需求；30 天上限只存在于 dimension_data 族） | 44 个 uni_image 文件 code=0，行内含 2026-05 至今日期 |
| 6 | data/get 必填项 | `filters`（可空数组）+ `order_by`（排序字段必须在 metrics/dimensions 里）+ topic 专属维度（VIDEO 必带 `roi2_material_video_name`） | 报错原文逐条见探测记录 |
| 7 | plans 返回行键名 | **`data.ad_list`**（不是 list/rows）——曾致 88 个文件全 0 行静默丢失 | 实测 shape：`{ad_list, page_info}`；1756451153073160 LIVE 2 条计划落盘 0 行实锤 |

### 7.2 可优化项（已实施）

| # | 项 | 前 → 后 | 接口 |
|---|---|---|---|
| 1 | 余额 | 45 次/户 → **1 次批量**（每 50 户一批） | `GET /open_api/v3.0/account/fund/get/?account_ids=[...]&account_type=AD` 实测 code=0，返回 `data.list` |
| 2 | anchors 翻页 | 生成器空页停止（省 ~88 次） | 已上线 |
| 3 | 指标 | 单请求全带（LIVE 98 指标一次） | 已上线 |

### 7.3 本次同步引擎新修（#17-#20）

- **#17 P0** `callOEPaged` 只读 `list`/`rows`，漏 `ad_list` → plans 全量静默丢失。修复：`data.list || data.rows || data.ad_list`
- **#18 P1** 40105（token 被吊销）不触发刷新，只按时间刷新 → 双进程竞态时 40105 风暴不自愈。修复：`invalidateToken()` + 重试内强刷
- **#19 P1** 无进程互斥 → 双回填并行互刷 token。修复：`data/sync.lock` PID 锁
- **#20 P2** 坏文件（code=0 但内容错）无法断点重拉。修复：`--refetch <source>` 旁路

### 7.4 后续机会（未实施，记录待用）

- **SPI 实时推送**：官方有「千川全域计划报表实时数据」「千川全域客户报表实时数据」订阅（数据推送服务/SPI 消息订阅）——直播轮询场景可换推送，免轮询
- **61002**：开发者日累计调用量上限存在（错误码附录），大规模并发前查开发者后台配额
- 官方 MCP 工具列表（doc 1847297003631945）可作为接口 path 速查表

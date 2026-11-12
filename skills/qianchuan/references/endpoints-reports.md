# 端点：直播大屏 · 标准报表

`$T` 是 `access_token`。请求头统一 `-H "Access-Token: $T"`。

## 1. 直播大屏：先目录，后取数

### ① 指标目录（官方中文名 / 口径 / 单位）

```bash
curl -G "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/today_live/room/config/get/" \
  --data-urlencode "advertiser_id=<投放户>" \
  --data-urlencode 'data_topics=["ROOM_FLOW_PERFORMANCE","ROOM_PRODUCT_LIST"]' -H "Access-Token: $T"
```

`data_topics` 是**数组**且必填，枚举只有这两个值。

### ② 取数

```bash
curl -G "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/today_live/room/data/get/" \
  --data-urlencode "advertiser_id=<投放户>" \
  --data-urlencode "data_topic=ROOM_FLOW_PERFORMANCE" \
  --data-urlencode 'dimensions=["room_id"]' \
  --data-urlencode 'metrics=["total_live_watch_cnt_flow_ecom","total_live_pay_order_gmv_flow_ecom"]' \
  --data-urlencode 'filters=[{"field":"room_id","operator":7,"values":["<房间ID>"]}]' \
  --data-urlencode 'order_by=[{"field":"total_live_pay_order_gmv_flow_ecom","type":2}]' \
  --data-urlencode "start_time=2026-11-04 00:00:00" --data-urlencode "end_time=2026-11-04 23:59:59" \
  --data-urlencode "page=1" --data-urlencode "page_size=10" -H "Access-Token: $T"
```

必填链（缺一个就报参数错误，且不告诉你缺哪个）：
- `dimensions` → `metrics` → `filters` → `order_by`
- `filters` **必须含 room_id 筛选**，`operator` 用 `7`
- `order_by[].type` 是**整数**（1 或 2）

商品行同引擎：`data_topic=ROOM_PRODUCT_LIST`，`dimensions=["product_id","product_name"]`，同样带 room 筛选 → 每行的消耗 / GMV / 订单。

## 2. 标准报表（账户 / 计划）

```bash
curl -G "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/advertiser/get/" \
  --data-urlencode "advertiser_id=<投放户>" \
  --data-urlencode "start_date=2026-11-04" --data-urlencode "end_date=2026-11-04" \
  --data-urlencode 'filtering={"campaign_scene":"DAILY_SALE","marketing_goal":"ALL","marketing_scene":"ALL"}' \
  --data-urlencode "time_granularity=TIME_GRANULARITY_DAILY" \
  --data-urlencode 'fields=["stat_cost","show_cnt","click_cnt","ctr","cpc_platform"]' \
  -H "Access-Token: $T"
```

- `filtering` **三项必填**：`campaign_scene`（字符串，不是数组）、`marketing_goal`、`marketing_scene`
- `fields` 词表：`stat_cost` / `show_cnt` / `click_cnt` / `ctr` / `cpc_platform`
  （写 `cost`、`pay_gmv` 会报"非法数据报表指标入参"）
- 粒度：`TIME_GRANULARITY_DAILY` | `TIME_GRANULARITY_HOURLY`（**没有 `STAT_` 前缀**）

取值枚举：

| 字段 | 可选值 |
|---|---|
| `campaign_scene` | `DAILY_SALE` `LIVE_HEAT` `NEW_CUSTOMER_TRANSFORMATION` `NEW_PRODUCT_BOOST` `PLANT_GRASS` `PRODUCT_HEAT` |
| `marketing_goal` | `ALL` `LIVE_PROM_GOODS` `VIDEO_PROM_GOODS` |
| `marketing_scene` | `ALL` `FEED` `SEARCH` `SHOPPING_MALL` |

## 3. 两个已知的"空数据"

- `DAILY_SALE` / `LIVE_HEAT` 场景实测返回 `code:0` 但数据为空——投放疑似以全域计划为主，换 `campaign_scene` 再试。
- `product_list/get` 的 `fields` 词表与大屏商品维度同名，但实测返回空数据 → 用大屏商品行（上一节）替代。

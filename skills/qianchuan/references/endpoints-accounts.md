# 端点：账户 · 主播 · 直播房间

`$T` 是 `access_token`。所有调用都带 `-H "Access-Token: $T"`。

## 1. 账户枚举

### ① OAuth 层账户（BP 管理 / 店铺 / CUSTOMER_ADMIN）

```bash
curl "https://open.oceanengine.com/open_api/oauth2/advertiser/get/?app_id=<APP_ID>" -H "Access-Token: $T"
```

### ② 投放子账户（真正拿来投放的那批）

```bash
curl "https://open.oceanengine.com/open_api/v1.0/qianchuan/shop/advertiser/list/?shop_id=<店铺账号ID>&page=1&page_size=100" -H "Access-Token: $T"
```

- 参数是 **`shop_id`**（店铺账号 ID），不是 `advertiser_id`
- `page_size` ≤ 100
- **店铺账号不能当投放接口的 `advertiser_id`**（会报 40002 role wrong），要用子账户 id

## 2. 主播（达人）清单

```bash
curl "https://open.oceanengine.com/open_api/v1.0/qianchuan/aweme_auth_list/get/?advertiser_id=<投放户>&page=1&page_size=50" -H "Access-Token: $T"
```

- 路径是 `aweme_auth_list/get`（下划线），写成 `aweme/auth/list` 会 404
- 返回 `authorization_infos[]`，含 `aweme_id` / `aweme_name` / `auth_status` / `auth_range`

## 3. 今日直播：谁在播、播了什么

```bash
curl -G "https://open.oceanengine.com/open_api/v1.0/qianchuan/today_live/room/get/" \
  --data-urlencode "advertiser_id=<投放户>" \
  --data-urlencode "aweme_id=<主播ID>" \
  --data-urlencode "date_time=2026-11-04" \
  --data-urlencode 'fields=["room_id","room_title","room_status","start_time","end_time","target_online_status"]' \
  --data-urlencode "page=1" --data-urlencode "page_size=20" -H "Access-Token: $T"
```

- **`aweme_id` 必填**（接口按主播维度查）、**`fields` 必填**
- 没有"按账户直查全部房间"的接口 → **"今天谁在播" = 主播清单 × 逐主播轮询**

## 4. 房间详情

```bash
curl "https://open.oceanengine.com/open_api/v1.0/qianchuan/today_live/room/detail/get/?advertiser_id=<投放户>&room_id=<房间ID>" -H "Access-Token: $T"
```

返回主播信息、房间状态、起止时间、封面。

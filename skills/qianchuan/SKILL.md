---
name: qianchuan
description: 调用巨量千川（抖音电商广告）开放接口取数：账户/主播清单、今日直播与房间详情、直播大屏指标、标准报表。用户要拉千川的投放或直播数据、排查接口报错时使用。需要 QIANCHUAN_APP_ID / QIANCHUAN_SECRET / QIANCHUAN_REFRESH_TOKEN 三个环境变量。
---

# 千川取数

这套接口全部**实测通过**，坑都写在 references 里。按下面三步走，不要凭记忆拼参数。

## 第一步：拿 token（先读 `references/auth.md`）

```bash
curl -X POST https://open.oceanengine.com/open_api/oauth2/refresh_token/ \
  -H "Content-Type: application/json" \
  -d "{\"app_id\": ${QIANCHUAN_APP_ID}, \"secret\": \"${QIANCHUAN_SECRET}\", \"grant_type\": \"refresh_token\", \"refresh_token\": \"${QIANCHUAN_REFRESH_TOKEN}\"}"
```

- `access_token` 有效 24 小时；**`refresh_token` 每次刷新会换新值**，刷完必须立刻把新的写回环境变量，否则下一次就废了。
- 首次授权（没有 refresh_token）走 `references/auth.md` 的授权页流程。

## 第二步：按需求查端点

| 要什么 | 端点 | 读哪篇 |
|---|---|---|
| 有哪些账户 | `oauth2/advertiser/get`／`qianchuan/shop/advertiser/list` | `references/endpoints-accounts.md` §1 |
| 有哪些主播 | `qianchuan/aweme_auth_list/get` | 同上 §2 |
| 今天谁在播、播了什么 | `qianchuan/today_live/room/get`（**必须带 aweme_id**） | 同上 §3 |
| 某个房间的详情 | `qianchuan/today_live/room/detail/get` | 同上 §4 |
| 直播大屏指标与数值 | `qianchuan/report/today_live/room/{config,data}/get` | `references/endpoints-reports.md` §1 |
| 账户/计划的标准报表 | `qianchuan/report/advertiser/get` | 同上 §2 |

## 第三步：判结果，别只看 HTTP 状态

返回信封固定是 `{"code":0,"message":"OK","request_id":"…","data":{…}}`。

- **HTTP 200 不代表成功**，必须判 `code`；非 0 时把 `code` + `message` + 端点原文回报给用户。
- `request_id` 是平台侧的追溯号，出问题时要带上它。
- 大额或长周期取数**先小页试一次**（`page_size` 调小）确认字段对，再翻页。

## 硬规则

- 凭据只从环境变量读，**不写进任何文件、不贴进回复**。
- 不猜参数：每个端点的必填项在 references 里都列了，缺一个就报"参数错误"，而错误信息不会告诉你缺哪个。
- 拉到的数据要落到工作区（文件或知识库），并在回复里说明时间范围与账户维度，否则数字没有意义。

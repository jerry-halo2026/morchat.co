# 鉴权：拿 token、刷新、以及轮换的坑

## 凭据

三个环境变量，由 agent 的 `custom_env` 提供，**不进仓库**：

| 变量 | 含义 |
|---|---|
| `QIANCHUAN_APP_ID` | 千川应用 id |
| `QIANCHUAN_SECRET` | 应用密钥 |
| `QIANCHUAN_REFRESH_TOKEN` | 长效刷新令牌（30 天，每次刷新会换） |

## 首次授权（没有 refresh_token 时）

1. 浏览器打开授权页：

```
https://qianchuan.jinritemai.com/openapi/qc/audit/oauth.html?app_id=<APP_ID>&state=<随机串>&material_auth=1
```

2. 授权完成后千川会跳转回调，**`auth_code` 在回调 URL 的查询参数里**（从地址栏截取即可；BC 页面提示"会话无效"不影响）。
3. `auth_code` **单次有效、几分钟过期**，拿到立刻换取：

```bash
curl -X POST https://open.oceanengine.com/open_api/oauth2/access_token/ \
  -H "Content-Type: application/json" \
  -d '{"app_id": <APP_ID>, "secret": "<SECRET>", "grant_type": "authorization_code", "auth_code": "<CODE>"}'
```

返回 `access_token`（24h）+ `refresh_token`（30d）+ `advertiser_ids`。

> 注意：实测 `advertiser_ids` 返回**空数组**。账户清单要另查（见 `endpoints.md` 的账户枚举）。

## 刷新（轮换制，这条最容易踩）

```bash
curl -X POST https://open.oceanengine.com/open_api/oauth2/refresh_token/ \
  -H "Content-Type: application/json" \
  -d '{"app_id": <APP_ID>, "secret": "<SECRET>", "grant_type": "refresh_token", "refresh_token": "<RT>"}'
```

- **`refresh_token` 每次刷新都返回新值**（约每 5 次轮换），必须每次落盘/写回环境。
- **单持有者原则**：同一个 refresh_token 被两个地方同时刷新，先刷的那个把旧的作废，另一个立刻失效。
- 因此：刷新动作要在一个地方做（一个脚本、一个 run），刷完把新值交回给配置。

## 调用规范

- 请求头：`Access-Token: <access_token>`
- 返回信封：`{"code":0,"message":"OK","request_id":"…","data":{…}}`，**HTTP 200 也可能是失败**，必须判 `code`
- 域名分工：`open.oceanengine.com` 服务 v1.0 与 oauth；`ad.oceanengine.com` 服务 v3.0 业务端点（实测 `near_realtime_cost` 在 open 域 404）
- 分页：`page` + `page_size`，各接口上限不同（`shop/advertiser/list` 上限 100）

## 失败怎么报

把三样给用户：**端点**、**`code` + `message`**、**`request_id`**。不要只说"接口报错"。

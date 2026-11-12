---
purpose: 桌面 → 服务端 → DSH 的公司网关凭据链路（实现状态与手工验证步骤）
owner: lead
status: draft
updated: 2026-11-12
related: [docs/engineering/CONTRACTS.md]
---
# 网关凭据链路（Desktop → Server → 网关 Key）

记录桌面端把「已登录会话」换成「本机公司网关 Key」的唯一链路、失败矩阵与手工验证方式。
代码：`apps/desktop/src/main/runtime-configurator/gateway-credentials.ts`（mint）
+ `apps/desktop/src/main/daemon-manager.ts`（触发与落盘）。

## 1. 为什么需要这条链路

`runtime-configurator` 只有在主进程 env 里有 `MORECHAT_RELAY_BASE_URL` 时才会配置
（`bootstrap.ts:187`），而桌面端从不设置它，也从没调用过 `/api/runtime/credentials`，
所以 dev 客户端一直显示 `gateway_configured:false`。主进程其实在启动 daemon 时就已经
拿到了需要的全部输入：renderer 的会话 token、API 地址、稳定设备标识。

## 2. 链路图

```
renderer（登录态）
   │  ipc  daemon:sync-token  (token, userId)
   ▼
daemon-manager.syncToken()
   ├─ mintPat()                     POST {api}/api/tokens            → mul_ PAT（写入 profile config）
   ├─ readOrCreateDeviceId({dir:userData})   <userData>/device-id    → mcdev-<uuid>（稳定、非硬件指纹）
   ├─ mintCompanyCredential()       POST {api}/api/runtime/credentials
   │      Authorization: Bearer <会话 token / PAT>
   │      { device_id, workspace_id? }
   │      4s 超时（AbortController）→ { base_url, api_key(48), api_key_suffix, models, token_name }
   ├─ companyCredentialSink()       storeCompanyCredential(keychain, `company:<userId>`, api_key)
   │                                → <userData>/runtime-configurator/keychain.json（safeStorage 加密）
   └─ companyCredentialObserver()   index.ts 注入：runtimeConfigurator.applyForUser(userId, { baseUrl, models })
                                    → 把 harness provider 指向签发这把 key 的网关
   ▼
daemon 启动（失败不阻塞）→ runtime-configurator 解析 company 凭据 → 注入 CLI/daemon env
```

关键约束：

- `api_key` 明文只出现一次，服务端不存。它只作为返回值流向 keychain，**不进日志、不进错误、
  不进 IPC**；`MintError.message` 只含 code 与 HTTP status。
- 已存在 `company:<userId>` 时不再 mint（避免每次启动轮换网关 token）；`daemon:reauthenticate`
  会强制刷新，因为被 401 的正是那把旧 key。
- mint 失败不阻塞 daemon 启动：`console.warn("[daemon] gateway credential unavailable", { code })`。
- 调 mint 用的是 **renderer 的会话 token**，不是刚铸的 `mul_` PAT：`/api/runtime/credentials`
  只接受人类主体（`RequireHumanActor`），长寿命 agent token 会被直接拒绝。
- 默认 sink 自带 keychain（与 `bootstrap.ts` 同一路径、同一 `safeStorage` 密码器）；
  `setCompanyCredentialSink(fn)` 可覆盖落盘位置，`setCompanyCredentialObserver(fn)` 在落盘成功后
  通知入口（index.ts 用它把 gateway 交给 configurator 重跑 apply），避免 daemon-manager ↔
  index.ts 循环依赖。

## 3. 失败矩阵

| 服务端/客户端情况 | `MintError.code` | status | 调用方动作 |
| --- | --- | --- | --- |
| 无 `apiBaseUrl`，或服务端 503（网关未配置） | `gateway_not_configured` | 503 / 无 | 不重试；等运维配置。Settings 显示「未配置」 |
| 401 / 403（会话失效、无权限、非人类主体） | `unauthorized` | 401/403 | 引导重新登录（daemon `session_invalid` 路径） |
| DNS/连接/TLS 失败、4s 超时、abort | `network` | 无 | 可重试；本次启动降级 |
| 200 但 `models` 为空 | `no_models` | 200 | 拒绝该 key，否则每次运行都会以更难懂的错误失败 |
| 其它非 2xx | `unexpected` | 原样 | 记录状态码，人工排查 |
| 2xx 但 body 不是 JSON / 缺 `api_key` | `unexpected` | 2xx | 同上；body 内容不回显 |
| keychain 不可用（`safeStorage` 无后端） | 记 `keychain_unavailable`（非 MintError） | — | 该机器无法保存公司 key，改走个人 key |
| 已存在公司 key | 不发起请求 | — | 幂等跳过 |

## 4. 手工验证

单测（15 例，含「不泄漏 key」与各状态码映射）：

```bash
cd apps/desktop
pnpm exec vitest run gateway-credentials --testTimeout=30000
pnpm run typecheck:node
```

真实 mint（不提交，`.local/`）：

```bash
node --experimental-strip-types .local/gateway-credential-live.mjs
```

脚本流程：`POST /auth/send-code` → `POST /auth/verify-code`（dev 实例接受
`MULTICA_DEV_VERIFICATION_CODE`，本机 `.env` 为 `123456`；验证码 60s 一次、一次使用，
必要时从 `public.verification_code` 取最新未使用码，或以 `MULTICA_DEV_VERIFICATION_CODE=<code>`
传入）→ 调真实模块 `mintCompanyCredential()` → 只打印 `base_url`、key 前 4 位与长度、suffix。

2026-11-12 实测（`http://127.0.0.1:8080`，账号 `pw-test@morechat.co`）：

```
mint ok
  base_url  : https://api.mxou.cn/v1
  api_key   : o2SS…(48 chars)
  suffix    : 8XKH
  models    : deepseek-v4-pro, deepseek-v4-flash, …, mimo-v2.5-pro
  token_name: mul:715396d6:82056626
```

延迟提示：冷启动时该请求实测 ~2.5s；若超过 `DEFAULT_MINT_TIMEOUT_MS`（4s）会归类为
`network`（降级而非报错），排查时先看这里而不是先怀疑网络。

抓原始响应（同样不打印完整 key）：`.local/gateway-credential-probe.mjs`。

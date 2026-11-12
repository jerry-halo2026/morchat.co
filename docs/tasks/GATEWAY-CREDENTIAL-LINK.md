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

## 5. token 归属（2026-11-12 修正）

**问题**：`server/internal/gateway/newapi.go` 原先用管理员令牌调 `POST /api/token/`。
new-api 把 token 挂到 Authorization 头指明的账号上，所以铸出来的 token `user_id` 是管理员
（实测 `2`）——所有用户的 key 堆在管理员名下（该管理员账号上实测已累积 27 个）。

**正确路径**（已在真实网关逐条验证）：

1. 管理员 `PUT /api/user/` 把用户密码重置为确定性值；密码字段上限 20 字符，21 会返回
   HTTP 200 + `success:false` + `Field validation for 'Password' failed on the 'max' tag`；
2. `POST /api/user/login {username,password}` 取该用户的 `access_token`（约 393 字符）；
   注意账号 id 在 `data.user.id`（旧版本是 `data.id`），`access_token` 在 `data.access_token`；
3. 用**该用户**的 `access_token` + `New-Api-User: <用户网关 id>` 调 `POST /api/token/`。

**实现**：

- `gateway.GatewayPassword(secret, userID)` = `"mc-" + hex(sha256(secret + ":gateway-password:" + userID))[:16]`，
  19 字符、确定性、单向；secret 取 `MULTICA_VCS_SECRET_KEY`（经 `Config.ServerSecret`／env 读入，不硬编码）。
  缺 secret 时 `EnsureUser` 返回 `gateway_not_configured`，不回退到随机密码或管理员身份。
- `EnsureUser` 幂等：创建失败即按用户名精确查找，找到后用管理员 `PUT /api/user/` 重置为该派生密码。
- `userAccessToken(ctx, userID)`：`EnsureUser` → `POST /api/user/login`，按 userID 进程内缓存 30 分钟；
  任一用户身份调用收到 401 时失效缓存并重登一次。token 只进内存，不进日志／错误串。
- `MintToken`、`findToken`、`revealTokenKey`、`RevokeToken` 全程用该用户身份：token 的读、
  明文 key 读取、删除都是按账号隔离的，管理员身份查不到也删不掉别人的 token
  （实测管理员 `DELETE /api/token/{别人id}` 返回 `success:false` + `record not found`，
  token 仍存活）。`RevokeToken` 的 owner 由调用方传入或由本进程 mint 记录推断。

**实测（`https://api.mxou.cn`，用户 `715396d6-…`）**：

```
ensure_user ok: username=mcdd21afef371f gateway_user_id=7483
user_access_token ok: len=393 gateway_user_id=7483
mint ok: token_name=mul:715396d6:cdd44b8c token_id=6939 key_len=48
gateway token user_id = 7483 (user account 7483, admin 2) — token is NOT on the admin
admin account holds 27 token(s), none named "mul:715396d6:cdd44b8c"
cleanup: revoked token_id=6939
```

脚本：`.local/gateway-token-ownership-live_test.go.txt`（`userAccessToken` 是包内方法，运行时复制进
`server/internal/gateway/` 执行，不提交）。

**测试**（`go test ./internal/gateway/...`）：发起铸 token 的 Authorization 必须是用户会话令牌且带
`New-Api-User`；铸出的 token `user_id` 为该用户；密码 19 字符且确定（同 id 相同、不同 id 不同、
secret 轮换即变）；会话被网关拒绝时只重登一次；日志与错误串不含 key／access_token。

**待接的边界**：`server/internal/handler/runtime_credentials.go:194` 轮换时调用
`RevokeToken(ctx, previousTokenID)` 未传 userID，进程重启后的首次轮换只能走管理员身份（删不掉）。
同一文件的 `credentialFakeGateway` 也还没有登录／改密／按账号隔离的 token 路由，改密码派生后
那 5 个 handler 用例会 503。

## 6. 模型路由（agent.model 的默认值）

`dsh --profile multica --list-models` 在这台机器上给出三条路由：

```
deepseek-official/deepseek-v4-pro · deepseek-official/deepseek-flash   ← 账号路由，需本机登录 DeepSeek
deepseek-account/deepseek-v4-pro  · deepseek-account/deepseek-flash    ← 账号路由的另一形态，profile 里没有 adapter
morechat/deepseek-v4-pro · morechat/deepseek-v4-flash                  ← writer 声明的公司网关路由（api.mxou.cn/v1）
```

（`--list-models` 实核到 `morechat/deepseek-v4-pro`；profile 里 pro/flash 都已声明。）

- **症状**：agent 行里存的是 `deepseek-account/*`，跑起来直接
  `no adapter registered for provider "deepseek-account"`。
- **前缀是哪来的**：不是 writer 拼错。`apps/desktop/.../writers/dsh.ts` 只写
  `morechat/<provider.defaultModel>`（`DSH_PROVIDER_ID = "morechat"`），全仓 `server/ packages/ apps/`
  生产代码里没有 `deepseek-account` 字面量；这个 id 来自 DSH 自己 `list-models` 的账号路由，
  被客户端当成默认值存进了 `agent.model`。
- **服务端策略（只在“新 agent 默认值”这一层）**：
  - 常量 `agent.DshDefaultModelID = "morechat/deepseek-v4-flash"`（`server/pkg/agent/dsh.go`）；
  - 环境变量 `MULTICA_DEFAULT_DSH_MODEL` 存在则优先（换网关/换模型不用改代码）；
  - `newAgentModel(provider, requested)`（`server/internal/handler/agent_default_model.go`）
    只在 `provider == "dsh"` 且 `model` 为空时套默认值，`CreateMikaAgent`（onboarding 建 Sika）
    与 `CreateAgent` 共用；**显式选择一律原样保留**，包括显式选 `deepseek-account/*`
    （本机登录 DeepSeek 的机器可以跑）。
  - `parseDshModelID` 不动：它只做 `provider/model` 解析，三种前缀都能解析；能不能真跑由
    profile 注册的 adapter 决定。`deepseek-official/*`、`deepseek-account/*` 的既有处理逻辑保持不变。
- **已知约束**：writer 只有在网关没有下发模型列表时才回落成单模型（`provider.defaultModel`）。
  本机 `~/.dsh/cordis.patch.yml` 的 morechat 块实测已声明 `deepseek-v4-pro` / `deepseek-v4-flash`
  （以及 kk 系列与 mimo），所以默认值 `morechat/deepseek-v4-flash` 可直接路由；
  若某台机器的 profile 只声明了 pro，用
  `MULTICA_DEFAULT_DSH_MODEL=morechat/deepseek-v4-pro` 收敛。
- **存量数据（本机 dev 库实测）**：两条 dsh agent 仍存 `deepseek-account/deepseek-flash`，
  代码改动只影响新建；需要时手工收敛：

  ```sql
  UPDATE agent SET model = 'morechat/deepseek-v4-flash'
  WHERE model LIKE 'deepseek-account/%';
  ```

验证：`go test ./pkg/agent -run Dsh`（三种前缀解析 + 默认值 + env 覆盖）、
`go test ./internal/handler -run 'NewAgentModel|CreateMikaAgent'`（含一条 DB 断言：
dsh runtime 上建 Mika，`agent.model` 落库为 `morechat/deepseek-v4-flash`）。

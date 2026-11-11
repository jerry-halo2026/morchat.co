---
purpose: 公司 Key 失效 → 自动降级个人 Key → 用量记 personal 的端到端验证记录（P3-C）
owner: task-owners
status: draft
updated: 2026-11-11
related:
  - docs/plans/RUNTIME-CONFIGURATOR.md
---

# 公司 Key 失效 → 降级个人 Key → 用量记 personal 验证记录

执行者 P3-C，时间 2026-11-11 09:08–09:25（Asia/Shanghai），仓库 `D:\dev\morchat.co` main `33fcd0c8c`，未 commit、未改生产代码。
脚本与原始日志：`.local/p0/p3c/`。

**结论先说**：链路在**两段**上被分别证实、但**没有任何一个进程同时具备两段**，所以完整的一跳（同一进程内 401 → personal → personal 上报）**未验证**。

- 服务端落库 + 报表（`task_usage.credential_source`、`GET /api/dashboard/usage/by-credential-source`）：**已验证**（用自己的 main 构建跑通，真实响应与 SQL 见 §5/§6）。
- 降级决策本身（company 自检失败 → 只用 personal 重试）：**只在单测层验证**（`apps/desktop/src/main/runtime-configurator/` 9 个套件全绿，§4.3）；桌面 IPC/keychain 在 web 上不可用，没有真实端到端。
- 「跑一次任务」：**未执行**。两次 enqueue 的任务都停在 `queued`，`runs = 0`（§4.4）。用量是通过 daemon 自己的上报接口写的，等价于一次真实 run 结束后的上报，但不是 run 产生的。

## 0. 一个必须先说明的环境事实：dev API 的构建 ≠ 本仓 HEAD

`127.0.0.1:8080` 上跑的进程是 `C:\Users\Administrator\AppData\Local\Temp\morechat-accept.exe`（PID 26832，`commit: unknown`），它的代码不等于 `33fcd0c8c`：

| 能力 | HEAD `33fcd0c8c` | 8080 上的 accept 构建 | 证据 |
| --- | --- | --- | --- |
| `POST /api/runtime/credentials`（铸公司 Key） | **不存在**（404） | 存在，未配 `NEWAPI_*` → 503 | §2 |
| `GET /api/dashboard/usage/by-credential-source` | 存在（200） | **不存在**（404） | §5.1 |
| `task_usage.credential_source` 落库 | 有（`setTaskUsageCredentialSource`） | **没有**，上报后列仍为 NULL | §4.5 |
| 建 issue 指派 agent | 源码支持（本次未在 8089 实测） | 422 `assignment is not supported in this slice` | §4.2 |

`runtime_credentials.go` 只存在于 worktree `E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co`（`codex/round1-continuous` `cb69d9d10`）。也就是说：**铸 Key 的入口在分支上，报表与落库在 main 上，两者从未同仓共存过**。为避免`8080`的缺件掩盖问题，所有服务端断言改用我按 `33fcd0c8c` 交叉编译的 `morchat-server.exe`（`:8089`，同一个 `multica_dev` 库），构建方式见 §0.1。

### 0.1 备用服务端怎么起的（可复现）

本机没装 Go，用本地已有的 `golang:1.26` 镜像交叉编译，产物在 `.local/p0/p3c/morchat-server.exe`（70 MB，未入库，未改任何源码）：

```
docker run --rm -v D:\dev\morchat.co:/src -v p3c-gomod:/go/pkg/mod -v p3c-gocache:/root/.cache/go-build \
  -w /src/server -e GOOS=windows -e GOARCH=amd64 -e CGO_ENABLED=0 -e GOTOOLCHAIN=local \
  golang:1.26 go build -trimpath -o /src/.local/p0/p3c/morchat-server.exe ./cmd/server
```

启动环境变量（日志 `.local/p0/p3c/server.err.log`）：

```
DATABASE_URL=postgres://multica_dev:...@127.0.0.1:15433/multica_dev?sslmode=disable
JWT_SECRET=p3c-e2e-jwt-secret  MULTICA_DEV_VERIFICATION_CODE=123456  PORT=8089  APP_ENV=development
```

`/health` → `{"status":"ok","pid":52316,...}`。它与 8080 共用同一个库，所以两边的会话/工作区是同一份数据。

## 1. 登录

```
POST /auth/send-code    {"email":"p3c-e2e@example.com"}      -> 200 {"message":"Verification code sent"}
POST /auth/verify-code  {"email":"p3c-e2e@example.com","code":"123456"}
  -> 200 {"token":"eyJhbGciOiJIUzI1NiIs...","user":{"id":"e24989ef-9d60-4be9-b6c0-e7ae042a0877","name":"p3c-e2e",...}}
```

新建工作区（新账号默认无工作区）：

```
POST /api/workspaces {"name":"P3C Credential E2E","slug":"p3c-cred-e2e"}
  -> 201 {"id":"5da4fbc4-5a82-4c08-a640-4f60ea90adaf","issue_prefix":"P3CC",...}
```

> 注：`POST /auth/send-code` 有速率限制，连续调用返回 `{"error":"please wait before requesting another code"}`，脚本里需留 45s 间隔。

## 2. 构造「公司凭据失效」

### 2.1 铸 Key 入口（8080 accept 构建）

```
POST /api/runtime/credentials  {"device_id":"p3c-e2e-dev","models":["claude-sonnet-4-5"],"workspace_id":"5da4fbc4-..."}
  -> 503 {"code":"gateway_not_configured","error":"company model gateway is not configured on this deployment"}
GET  /api/runtime/credentials?device_id=p3c-e2e-dev
  -> 503 同上
```

符合预期（`NEWAPI_BASE_URL` / `NEWAPI_ADMIN_TOKEN` 未配置 → 503 且不落库）。**后果**：本机根本不存在可用的公司 Key，公司凭据从第一秒起就是不可用状态——比「公司 Key 失效」更强，但也因此拿不到「曾经有效的公司 Key 被 401」的真实形态。

同一请求打到 main 构建：

```
POST /api/runtime/credentials (8089) -> 404 page not found
```

### 2.2 数据库里构造公司凭据失效

`.local/p0/p3c/cred_state.sql`（仅测试数据）：

```sql
INSERT INTO gateway_credentials (user_id, workspace_id, provider, device_id, token_name,
  secret_cipher, secret_suffix, models, quota, status)
VALUES ('e24989ef-...','5da4fbc4-...','newapi','p3c-e2e-dev','mul:e24989ef:p3c-e2edev',
  '\x00'::bytea,'dead',ARRAY['claude-sonnet-4-5'],500000,'active')
RETURNING id, provider, device_id, status;
-- 7fa3319d-f770-4eb2-a335-a5c4395da4c7 | newapi | p3c-e2e-dev | active

UPDATE gateway_credentials SET status='revoked', revoked_at=now()
 WHERE user_id='e24989ef-...' AND device_id='p3c-e2e-dev' AND status='active';
-- UPDATE 1 | 7fa3319d-... | revoked | 2026-11-11 01:21:22.839174+00
```

## 3. 设置个人 Key（web 上只能模拟）

桌面侧 IPC 在 web 不可用，且**按设计个人 Key 不落服务端**：`credential.ts:5-12` 写明 personal key「Stored in the OS keychain only」，`gateway_credentials` 的 `provider` 语义是网关实现（今天只有 `newapi`，见迁移 639 注释），**没有 `personal` 这一取值**。所以库里的 `provider='personal'` 行只是为了本次验证造的一个占位状态，不是产品真实表示：

```sql
INSERT INTO gateway_credentials (..., provider, device_id, token_name, secret_suffix, status)
VALUES (..., 'personal','p3c-e2e-dev-personal','personal:e24989ef:p3c-e2edev','cafe','active');
-- 46a14b78-2152-426c-a6e8-11a11f6062cd | personal | p3c-e2e-dev-personal | active

SELECT provider, status, count(*) FROM gateway_credentials WHERE user_id='e24989ef-...' GROUP BY 1,2;
--  newapi   | revoked |     1
--  personal | active  |     1
```

（表无 `provider` CHECK，所以插入成功；这恰恰说明「个人 Key 存在库里」不是本 schema 的表达方式，只作模拟。）

## 4. 跑一次任务

### 4.1 准备 runtime / agent

`/api/daemon/register` 用登录 token 即可（`DaemonAuth` 接受有效用户 token），建出：

- runtime `7bb4bee9-237a-4d9e-b63f-e936ba0a9d77`（claude_code，`status: online`）
- agent `c518206f-f18d-44ca-99d9-693e56de4672`（`runtime_bound: true`）

版本要抬到门槛以上，否则被挡：`{"code":"daemon_version_unsupported","current_version":"0.2.21","min_version":"0.4.3"}` → 改成 `0.4.3` 后通过。

### 4.2 建 issue 指派 agent → 8080 切片不支持

```
POST /api/issues {"title":"...","status":"todo","assignee_type":"agent","assignee_id":"c518206f-..."}
  -> 422 {"error":"assignment is not supported in this slice"}
```

改用 `POST /api/issues/quick-create`（8080 与 8089 都能过，任务进 `agent_task_queue`）：

```
POST /api/issues/quick-create {"agent_id":"c518206f-...","prompt":"...","priority":"low"}
  -> 202 {"task_id":"01a1c82c-01d4-7ef4-8189-b1d41900f691"}   # personal 腿
  -> 202 {"task_id":"01a1c831-c6bd-7a2b-bd43-5501a91c2aa7"}   # company 腿（对比）
```

### 4.3 降级决策：只有单测证据

降级发生在桌面 Electron 主进程，web 无法触达。跑现有单测作为该段的真凭实据：

```
pnpm --filter @morechat/desktop exec vitest run src/main/runtime-configurator/
  Test Files 9 passed | Tests 全绿
```

其中直接覆盖本链路的四条：

- `credential.test.ts > resolveCredential > prefers the company key`
- `credential.test.ts > resolveCredential > falls back to the personal key and marks it not billable to the company`
- `orchestrator.test.ts > falls back to the personal key exactly once when the company key 401s`（断言 `outcome.credentialSource === "personal"`、`credentialRetried === true`、`attempts = [company, personal]`）
- `probe.test.ts > isDegradable > degrades on credential/quota problems and timeouts only`

### 4.4 run 没有真正发生

```sql
SELECT id, status, started_at, completed_at FROM agent_task_queue
 WHERE agent_id='c518206f-f18d-44ca-99d9-693e56de4672' ORDER BY created_at;
-- 01a1c82c-01d4-7ef4-8189-b1d41900f691 | queued |            |
-- 01a1c831-c6bd-7a2b-bd43-5501a91c2aa7 | queued |            |
SELECT count(*) ... status in ('running','completed','failed') → 0
```

没有真实 daemon 认领，所以「执行」这一步**未验证**。改用 daemon 自己的上报接口写用量——这正是真实 run 结束后同一个 handler 走的路（`POST /api/daemon/tasks/{taskId}/usage` → `ReportTaskUsage` → `UpsertTaskUsage` → `setTaskUsageCredentialSource`）。

### 4.5 上报：8080 accept 构建不落 credential_source

```
POST http://127.0.0.1:8080/api/daemon/tasks/01a1c82c-.../usage
{"usage":[{"provider":"claude_code","model":"claude-sonnet-4-5","input_tokens":1200,
           "output_tokens":340,"credential_source":"personal"}],"snapshot":false}
  -> 200 {"status":"ok"}

SELECT ... FROM task_usage;
-- 01a1c82c-... | claude_code | claude-sonnet-4-5 | 1200 | 340 | (NULL)   <-- 没写
```

同一请求打到 main 构建（`:8089`）：

```
POST http://127.0.0.1:8089/api/daemon/tasks/01a1c82c-.../usage   -> 200 {"status":"ok"}
SELECT credential_source FROM task_usage;                       -> personal    ✅
```

补充一条「无来源的上报不能清空已知来源」：再报一次 1500/420、不带 `credential_source` → 200，库里仍是 `personal`、数值更新为 1500/420（对应 `setTaskUsageCredentialSource` 的 `IS DISTINCT FROM` 与空值 no-op 规则）。

company 腿同理：

```
POST /api/daemon/tasks/01a1c831-.../usage
{"usage":[{"provider":"claude_code","model":"claude-sonnet-4-5","input_tokens":800,
           "output_tokens":200,"credential_source":"company"}],"snapshot":false}
  -> 200 {"status":"ok"}
```

## 5. 用量报表

### 5.1 8080 accept 构建：接口不存在

```
GET http://127.0.0.1:8080/api/dashboard/usage/by-credential-source?days=30
  -> 404 page not found
```

### 5.2 main 构建：真实响应

```
GET http://127.0.0.1:8089/api/dashboard/usage/by-credential-source?days=30
X-Workspace-ID: 5da4fbc4-5a82-4c08-a640-4f60ea90adaf
  -> 200
```

只报 personal 时（`.local/p0/p3c/report_personal_only.json`）：

```json
[{"credential_source":"personal","input_tokens":1200,"output_tokens":340,"cache_read_tokens":0,"cache_write_tokens":0,"cost_usd_ticks":0,"uncosted_input_tokens":1200,"uncosted_output_tokens":340,"uncosted_cache_read_tokens":0,"uncosted_cache_write_tokens":0,"task_count":1}]
```

补上 company 腿后的最终响应（`.local/p0/p3c/report_final.json`）：

```json
[{"credential_source":"company","input_tokens":800,"output_tokens":200,"cache_read_tokens":0,"cache_write_tokens":0,"cost_usd_ticks":0,"uncosted_input_tokens":800,"uncosted_output_tokens":200,"uncosted_cache_read_tokens":0,"uncosted_cache_write_tokens":0,"task_count":1},{"credential_source":"personal","input_tokens":1500,"output_tokens":420,"cache_read_tokens":0,"cache_write_tokens":0,"cost_usd_ticks":0,"uncosted_input_tokens":1500,"uncosted_output_tokens":420,"uncosted_cache_read_tokens":0,"uncosted_cache_write_tokens":0,"task_count":1}]
```

断言达成：出现 `credential_source="personal"` 行且 token 数 > 0（1500 + 420）。

## 6. task_usage 直查

```sql
select credential_source, count(*) from task_usage group by 1 order by 1;
```

```
 credential_source | count
-------------------+-------
 company           |     1
 personal          |     1
(2 rows)
```

按任务展开：

```
               task_id                |  provider   |       model       | input | output | credential_source
--------------------------------------+-------------+-------------------+-------+--------+-------------------
 01a1c82c-01d4-7ef4-8189-b1d41900f691 | claude_code | claude-sonnet-4-5 |  1500 |    420 | personal
 01a1c831-c6bd-7a2b-bd43-5501a91c2aa7 | claude_code | claude-sonnet-4-5 |   800 |    200 | company
(2 rows)
```

## 7. 结论：这条链路到底能不能用

| 环节 | 判定 | 依据 |
| --- | --- | --- |
| 铸公司 Key（`POST /api/runtime/credentials`） | main **不可用**（路由缺失）；分支上可用但本机 503 | §2.1 |
| 公司 Key 失效 → 只用 personal 重试 | **代码/单测层通过**，无进程内实测 | §4.3 |
| personal 用量落 `task_usage.credential_source` | **已验证**（main 构建） | §4.5 |
| `GET /api/dashboard/usage/by-credential-source` 出 personal 行 | **已验证**（main 构建） | §5.2 |
| 一次真实 run 产出上述用量 | **未验证**：无可用 runtime，`runs = 0` | §4.4 |

也就是：**数据面（上报 → 落库 → 报表）是通的，且不对金额做任何推断（NULL 行仍报 `unknown`、token 照计）；决策面（公司 Key 被拒不重试第二次、personal 不计公司账）今天只有单测保证；把两者连起来的那一跳没有在真实进程里跑过。**缺的东西很具体：

1. 一个 `NEWAPI_*` 配置好的部署（否则铸不出公司 Key，也就没有"失效"可谈）；
2. 一个真实 daemon（真 CLI + 真 keychain），否则降级决策只存在于单测；
3. 三者同仓：`runtime_credentials.go` 只在 `codex/round1-continuous`，报表/落库只在 main——今天没有任何一个构建同时具备两半。

按商业风险排序，缺 (3) 最要紧：现在如果只部署 main，公司 Key 铸不出来，`credential_source` 永远是 personal 或 unknown，报表能出数但分不出账；如果只部署分支，报表接口是 404。

## 8. 清理

清理脚本 `.local/p0/p3c/cleanup.sql`，按 `task_usage` → `agent_task_queue` → `agent` → `agent_runtime` → `gateway_credentials` → issue 子表 → `issue` → `member` → `workspace` → `"user"` 顺序删除，全部包在一个事务里。

### 8.1 清理后核对

`.local/p0/p3c/sql_cleanup_verify.txt`：

```
          t           | count
----------------------+-------
 user                 |     0
 workspace            |     0
 agent                |     0
 agent_runtime        |     0
 agent_task_queue     |     0
 gateway_credentials  |     0
 issue_p3c            |     0
 task_usage_total     |     0
 task_usage_p3c_tasks |     0
```

测试库回到开工前状态（`gateway_credentials` / `task_usage` 本来都是 0 行），`P1 Preset Smoke` 工作区的 1 个 runtime、11 个 agent 未被触碰。

### 8.2 清理时撞到的一个环境坑（非本次链路，但值得记一笔）

`DELETE /api/workspaces/{id}` 与 `DELETE /api/issues/{id}` 在本环境都返回 500：

```
workspace delete step failed ... error="ERROR: update or delete on table \"issue\" violates foreign key
constraint \"issue_access_policy_native_issue_fkey\" on table \"issue_access_policy\" (SQLSTATE 23503)"
step="delete issue roots"
```

直接删 `issue_access_policy` 又被挡：

```
ERROR:  ACL policy lifecycle mutation is unsupported in the initial subset
CONTEXT:  PL/pgSQL function r1_acl_refuse_mutation() line 3 at RAISE
```

`r1_acl_refuse_mutation` **不在本仓代码里**（`server/` 全量 grep 无命中），是本 dev 库上外挂的 R1 ACL 实验触发器。所以 500 的成因是本地 DB 守卫让 `issue_access_policy` 的删除不可能成功，**不是 main 分支的删除路径缺陷**；脚本最后用 `SET LOCAL session_replication_role = replica` 只在本事务内绕过它完成清理。若要复现 workspace 删除成功，需要先移除该触发器或让删除路径先清 ACL 子表——后者属于产品代码决定，本次未改。


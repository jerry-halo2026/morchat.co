---
purpose: "邮箱 + 密码登录的原生实现：Argon2id 凭据、登录/改密/重置三个接口、失败锁定、CLI 供给与审计落点"
owner: task-owners
status: draft
updated: 2026-11-11
related:
  - docs/engineering/CONTRACTS.md
  - server/migrations/643_user_password.up.sql
  - server/internal/auth/password.go
  - server/internal/handler/auth_password.go
  - server/internal/handler/user_password.go
  - server/cmd/multica/cmd_user_password.go
---

# 密码登录（不依赖 Supabase）

契约在 [CONTRACTS.md](../engineering/CONTRACTS.md) 的「登录契约」一节冻结，本文只记录实现落点、
取舍和验证方式。Supabase 只保留为历史路径：`packages/core/api/supabase-password*`
已经不是登录链路的依赖。

## 凭据

- `server/internal/auth/password.go`：Argon2id，参数固定 `m=64MiB, t=3, p=1`，PHC 字符串
  `$argon2id$v=19$m=65536,t=3,p=1$<salt>$<key>`（raw std base64，无 padding）。
- `Hash` / `Verify` / `NeedsRehash`。`Verify` 从字符串本身解析参数，所以旧参数写下的哈希仍能校验；
  `NeedsRehash` 报告它，登录成功时就地重写为契约参数。
- 未识别的格式（bcrypt、截断、空串）返回 `ErrMalformedPasswordHash`，调用方一律映射成
  `401 invalid_credentials` —— 外部系统直插了别的格式是「密码不对」，不是 500。
- `user.password_hash IS NULL` 表示「还没设密码」，这些账号继续走邮箱验证码。

## 接口

| 接口 | 文件 | 说明 |
| --- | --- | --- |
| `POST /auth/password/login` | `handler/auth_password.go` | 复用 `issueJWT` + `auth.SetAuthCookies`，响应额外带 `must_change_password` |
| `POST /api/me/password` | `handler/user_password.go` | 有哈希时必须给 `current_password`；无哈希是首次设置 |
| `POST /api/users/{id}/password` | `handler/user_password.go` | workspace 的 owner/admin；写入 `must_change_password=true` |
| `GET /api/config` | `handler/config.go` | `auth.password_enabled` / `auth.code_login_enabled` |

错误码：`401 invalid_credentials`、`429 too_many_attempts`、`400 weak_password`（按字符数 < 10）。

配置开关：`AUTH_PASSWORD_ENABLED`（默认 true）、`AUTH_CODE_LOGIN_ENABLED`（默认 true）。

## 失败锁定：为什么不是 authRL

`middleware.RateLimit`（挂在 `/auth/send-code`、`/auth/google` 上的 `authRL`）是**按 IP 的请求节流**：
预算耗尽后连正确密码也拒绝，而且没有「只记失败」「成功后清零」的概念。契约要的正好相反：

- 键是 `email|ip` 的组合；
- 只有失败计数，成功无限且会清零；
- 5 次失败后锁 15 分钟。

因此 `auth_password.go` 里的 `passwordLoginFailureGate` 用了与 `memoryWebhookRateLimiter`
相同的滑动窗口形态（`SlidingWindowRateLimit` 的语义、按时间戳裁剪、Retry-After），只把账务换成
「失败才记账 + 成功清零」。`/auth/password/login` 因此**不**再叠一层 `authRL`，路由上有一段注释说明原因。

单进程内存实现是多副本部署的已知边界：每个副本各有一份预算。要共享预算需要把 Redis 客户端接进
这个 gate（现有 webhook 限流器就是这样做的），契约本身不变。

## 审计

`activity_log.workspace_id` 是 NOT NULL 且引用真实 workspace，所以账号级事件挂在**该用户的第一个
workspace** 上（`auditWorkspaceForUser`）：
`user_login_succeeded`、`user_login_failed`、`user_password_changed`、`user_password_change_failed`、
`user_password_reset`、`user_imported`。没有任何 workspace 的账号（例如刚用 CLI 建出来的空账号）
无处可挂，事件只留 slog —— 这是表结构决定的，不是遗漏。

## CLI（直连数据库）

`multica user create|password|import` 在 `cmd/multica/cmd_user_password.go`，用 `--database-url`，
缺省读 `DATABASE_URL` / `MULTICA_DATABASE_URL`。选择直连而不加一个「创建用户」HTTP 接口，是因为
服务器上多一个无需登录就能建账号的端点比给运维一个本地命令危险得多。

- `create`：已存在的 email 直接报错并提示用 `user password`（不做静默覆盖）。
- `password`：`--password`，或用 stdin 一行（避免进 shell history）。
- `import --csv --workspace`：列 `email,name,role,password`（后三列可选）。按 email 幂等
  （已存在则跳过用户），member 行按 `(workspace,user)` 幂等，变更过的行写 `user_imported` 审计。

## 验证

```
cd server
go build ./...
go vet ./internal/auth ./internal/handler ./cmd/multica
go test ./internal/auth/... -run 'Password' -count=1
DATABASE_URL=... go test ./internal/handler -run 'Password' -count=1
```

迁移往返（在一次性库上跑，避免 `down` 把共享开发库一路回滚）：

```
createdb pw643_roundtrip
DATABASE_URL=.../pw643_roundtrip go run ./cmd/migrate up     # 到 643_user_password
DATABASE_URL=.../pw643_roundtrip go run ./cmd/migrate down   # 打印 down 643_user_password
DATABASE_URL=.../pw643_roundtrip go run ./cmd/migrate up     # 重新到 643
```

`cmd/migrate` 没有「只回滚一个版本」的参数，`down` 会连续回滚到遇到 forward-only 迁移为止（494 会
主动报错停住）。所以在临时库上跑，`schema_migrations` 与 `user` 的密码列在 down 后消失、up 后恢复。

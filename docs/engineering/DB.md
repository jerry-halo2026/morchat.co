---
purpose: 数据库的版本底线、扩展依赖与"缺扩展时的降级行为"（保持自建 Postgres，不做跨方言适配）
owner: lead
status: current
updated: 2026-11-11
related: [docs/engineering/CONTRACTS.md]
---

# 数据库

## 版本与形态

- **PostgreSQL ≥ 15**（`jsonb` 路径运算、生成列、`CREATE INDEX CONCURRENTLY`、部分索引都要用）。
- schema 的**唯一真值**是 `server/migrations/`（当前到 **643**），由 `cmd/migrate` 执行；sqlc 从同一目录生成类型。
- 没有 ORM：SQL 手写、类型生成，因此"换实例"= 换 `DATABASE_URL` + 跑迁移，不涉及代码改动。

## 连接要求

- **迁移必须用 session 模式连接**（直连 5432 或 session 池）：`cmd/migrate` 依赖 session 级 advisory lock，
  transaction 模式池化器会让锁失效。应用运行时可以用池化连接。
- 云端实例需要 `sslmode=require`；本地 dev 容器是 `sslmode=disable`。
- **托管池化器（Supabase pgbouncer 等）只能用 `default_query_exec_mode=simple_protocol`**：transaction 模式下
  `describe_exec` 的第二条语句就会 `unnamed prepared statement does not exist`，`exec` 又不能把参数按 text 发送
  （见下节）。simple protocol 的代价是参数一律走文本编码，因此**每个 jsonb 参数都必须是 Go `string`**。

## 为什么 jsonb 参数必须是 string（不是 `[]byte`）

**事实**：pgx 在 simple protocol 下把 Go `[]byte` 编码成 bytea 的十六进制文本（`\x7b7d`），不是原始字节。
把这样的参数交给 jsonb 列（或 `::jsonb` 强转）时，PostgreSQL 解析的是这串十六进制字面量：

```
select $1::jsonb::text  参数 []byte("{}")        -> ERROR: invalid input syntax for type json (22P02)
select $1::text::jsonb  参数 []byte("{}")        -> ERROR: invalid input syntax for type json (22P02)
select $1::text::jsonb  参数 "{}"                -> "{}"        ok
```

所以「加一个 `::text::jsonb` 强转」在 **Go 侧仍是 `[]byte`** 时并不能解决问题；真正的修法是把 sqlc 生成的参数类型
从 `[]byte` 改成 `string`（可空列则是 `pgtype.Text`），让 pgx 按文本发送 JSON 文档本身。

**SQL 写法**：参数一律显式经 text 中转，sqlc 才会推出 `string`/`pgtype.Text`：

```sql
sqlc.arg('payload')::text::jsonb        -- Go string
sqlc.narg('payload')::text::jsonb       -- Go pgtype.Text（NULL 仍是 NULL）
```

注意 `$1::text::jsonb` 和 `@name::text::jsonb` 在 **sqlc 里不成立**（它把 `$N::text` 当成参数类型注解，
链式强转会把它拼坏，报 `syntax error at or near "xt"`）。位置参数或 `@name` 的参数要改写成
`sqlc.arg('列名')::text::jsonb`；若该语句还有位置参数，把**从该参数起直到语句结尾**的参数一并改成命名参数，
避免命名参数与 `$N` 混用导致编号错位。

**可空性**：原来 `[]byte` 的 jsonb 参数允许 nil（= SQL NULL）。改类型时必须保留这一点——`sqlc.narg` + `pgtype.Text`
（`Valid:false` 即 NULL），不要用 `sqlc.arg` + 空字符串（`''::jsonb` 是非法 JSON，会把「不过滤」变成 500）。
`issue.sql` 的 `metadata_filter` / `properties_filter` 就是典型：它们出现在 `WHERE ... IS NULL` 与
`jsonb_array_elements(...)` 里，nullability 丢了语义就反了。

**调用点**：`server/internal/service` 等包用 `jsonbText([]byte)` / `jsonbRaw(json.RawMessage)` 两个小助手
（`internal/service/jsonb_params.go`）保持「nil → NULL」；`pgtype.Text{String: string(x), Valid: x != nil}` 是同一件事。
**不要**改回 `[]byte(...)`，也不要在 SQL 里改成字符串拼接。

**覆盖范围**：这条规则适用于 `server/pkg/db/queries/*.sql` 里**所有**绑定 jsonb 的参数——2026-11 的修复把
**112 处**参数统一改成 `::text::jsonb`（15 个文件，含 issue / issue_property / issue_workflow / agent /
autopilot / connected_apps / channel / plugin / workbench_media / workbench_hr / workbench_guide /
workbench_doc / workbench_offboard / workbench_creator_health / orange_sync）。当时先用 `sqlc.arg/narg(...)::jsonb`
统计出的 49 处只是**显式带强转**的那部分；另外 63 处是位置参数或 `@name`，同样坏，
只是因为本地库走扩展协议、参数按二进制发送，谁都没发现。

`plugin_package_file.content`、`plugin_secret.ciphertext`、`webhook_delivery.raw_body` 三列是真正的 **bytea**，
它们的参数保持 `[]byte`——不要「顺手统一」。

**回归护栏**：把同一批用例用
`DATABASE_URL=...&default_query_exec_mode=simple_protocol` 再跑一遍。扩展协议下 `[]byte` 参数是二进制，
两种协议只有在这条连接串下才会暴露编码差异；测试夹具（`testutil.Cols` / 手写 INSERT）同样要传 `string`，
否则夹具会先于被测代码失败。


## 扩展与降级

| 扩展 | 用途 | 缺失时 |
|---|---|---|
| `pgcrypto` | `gen_random_uuid()` 等 | 必需，缺失则迁移失败（托管 PG 默认可用） |
| `pg_trgm` | Issue / 知识检索的相似度 | 相似度通道关闭，退回全文与 LIKE；日志说明 |
| `pgvector` | 知识检索向量通道 | `vector_degraded=true`，只用关键词通道 |
| `pg_bigm` | 中文 bigram 索引 | 迁移内 `DO/EXCEPTION` 优雅跳过（托管 PG 通常没有） |
| `pg_cron` | 定时回收 | 退化为服务端内置定时器 |

## 批量开账号

外部 SQL 系统可以直接写库，但必须遵守：

1. `user` 行：`id`（uuid，必须由调用方生成）、`email`（唯一）、`name`、`created_at/updated_at=now()`；
2. **同时写 `member` 行**（`workspace_id` + `user_id` + `role`），否则登录后看不到工作区；
3. 若要预置密码，`password_hash` 必须是 Argon2id（m=64MiB,t=3,p=1）的 PHC 字符串，否则视为"未设密码"；
4. 新增列必须可空或有默认值（见 CONTRACTS.md），以保证外部插入语句不会因 schema 演进而报错。

更省事的方式是 `morechat user import --csv`：它按同一份契约成对写入并记审计。

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

更省事的方式是 `multica user import --csv`：它按同一份契约成对写入并记审计。

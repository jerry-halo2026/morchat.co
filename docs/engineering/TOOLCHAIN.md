---
purpose: 三层工具链的职责与协作规则（pnpm/turbo、Go、Postgres、入口胶水）
owner: lead
status: current
updated: 2026-11-11
related: [docs/engineering/CONTRACTS.md]
---

# 工具链

## 三层职责

| 层 | 工具 | 唯一真值 | 约束 |
|---|---|---|---|
| JS 依赖与构建 | pnpm workspaces + `catalog` | 版本只在 `pnpm-workspace.yaml#catalog` | 新依赖用 `catalog:`；内部包用 `workspace:*` |
| 任务编排 | turbo | `turbo.json#tasks` | `typecheck/test/build` 进 turbo；`dev` 不进（长进程） |
| 后端 | Go 1.26.9（go.mod 下限） | `server/go.mod`、`sqlc.yaml`、`migrations/` | SQL 改动后重新生成 sqlc；迁移只由 `cmd/migrate` 执行 |
| 数据 | Docker Postgres(pgvector) | `deploy/quickstart`（部署）、dev 容器（开发） | dev 与部署 compose 分离 |
| 胶水 | `scripts/dev.mjs` → `scripts/dev-env.sh` | 后者是唯一编排实现 | 前者只做：定位 Git Bash、定位 go、补 `.env`、透传退出码 |

## 入口

```bash
pnpm dev            # 起 api + web
pnpm dev:api        # 仅 api
pnpm dev:web        # 仅 web（apps/web/scripts/dev-server.mjs，不依赖 sh）
pnpm dev:daemon     # 仅 daemon
pnpm dev:desktop    # 仅 desktop
pnpm dev:status     # 本 checkout 在跑什么
pnpm dev:stop       # 停
pnpm db:migrate up|down
pnpm dev:env        # 打印解析到的 bash/go 路径
```

`make up|down|status` 是上面命令的一行封装（Linux/CI 语义不变）。

## Windows 注意

- PATH 上的 `bash` 常是 WSL 启动器，而 `scripts/dev-env.sh` 是给 **Git Bash（MINGW/MSYS）** 写的。`dev.mjs` 会校验 `uname -s`，用 WSL 时直接报错，或用 `BASH_BIN` 指定 Git Bash。
- `go` 常不在 PATH：用 `GO_BIN`，或让 `dev.mjs` 在已知安装位置找到它。
- `.env` 缺失时由 `dev.mjs` 从 `.env.example` 生成，并把 `DATABASE_URL` 对齐到实际运行的 dev 容器端口。

## 依赖规则（Context7 / pnpm 文档）

- `catalog:` 引用共享版本；`overrides` 也可写 `catalog:`，保持单一来源；
- `workspace:` 协议用于内部包；
- 不要在包内写死一个与 catalog 冲突的版本。

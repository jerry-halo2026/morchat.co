---
purpose: 接口唯一性与命名规则（一个能力一个入口），PR 时逐条对照
owner: lead
status: current
updated: 2026-11-11
related: [docs/engineering/TOOLCHAIN.md, docs/upstream/SEAMS.md]
---

# 接口契约

## 5 条硬规则

1. **一个能力一个入口**：同一能力只允许「一个 agent 面 + 一个 人/脚本面」。
   - 知识：agent 面 = MCP（`POST /api/mcp/knowledge`）；人面 = REST `GET/POST /api/knowledge/*` 与 `multica knowledge` CLI。
   - 运行：只经 `multica daemon …`，不自建执行器。
2. **实现只有一份**：所有面都落到 `server/internal/knowledge` 的同一函数；权限校验只在该层实现一次。
3. **鉴权只有一种语义**：运行期用 `mat_` 临时令牌（绑定 user+workspace+agent+run，≤24h），人用 `mul_` PAT；MCP 与 REST 都从令牌解析身份，不额外发明 header 作为唯一凭据。
4. **命名只有一套**：REST `/api/<domain>/<resource>`；MCP server `morechat-<domain>`；MCP 工具 `<domain>_<verb>`（`knowledge_search`、`knowledge_get`）；迁移 `<N>_<snake>.up|down.sql` 连续编号（当前到 642，新增从 643 起）。
5. **入口只有一个**：`pnpm dev`、`dev:api`、`dev:web`、`dev:daemon`、`dev:desktop`、`dev:status`、`dev:stop`、`db:migrate`；`make` 目标为一行封装，不得另开进程管理。

## 接口表

| 能力 | agent 面 | 人/脚本面 |
|---|---|---|
| 知识检索/读取 | MCP `knowledge_search` / `knowledge_get` | `GET /api/knowledge/search`、`multica knowledge search` |
| 知识条目管理 | —（agent 只读） | `POST/PATCH /api/knowledge/items`、`multica knowledge items` |
| 知识导入 | — | `POST /api/knowledge/upload-url` → `/import`、`multica knowledge import` |
| MCP 注册/绑定 | — | `POST /api/workspaces/{id}/mcp-servers`、`multica agent mcp add/enable` |
| 运行控制 | — | `multica daemon start/status/logs/restart/stop` |

## MCP 契约（唯一 agent 面）

`POST /api/mcp/knowledge`，JSON-RPC 2.0，`Authorization: Bearer <mat_|mul_>`。

- `initialize` → `{protocolVersion, capabilities:{tools:{}}, serverInfo:{name:"morechat-knowledge"}}`
- `tools/list` → `knowledge_search{query, space_id?, top_k?}`、`knowledge_get{item_id}`
- `tools/call` → 转 `Service.InvokeTool`
- 错误：`-32602` 参数错、`-32001 knowledge_forbidden`、`-32002 mat_token_expired`

## 门禁

```bash
node scripts/check-contracts.mjs            # 报告
node scripts/check-contracts.mjs --strict   # CI 阻断
```

检查项：重复路由、知识 REST/MCP 面是否唯一、`dev*` 是否都走 `scripts/dev.mjs`、`apps/web` 是否还依赖 `sh -c`。

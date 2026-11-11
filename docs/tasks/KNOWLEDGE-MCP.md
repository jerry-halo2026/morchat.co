---
purpose: "把知识库工具面暴露成 MCP 端点（POST /api/mcp/knowledge，JSON-RPC 2.0 over HTTP）：契约、鉴权、工作区 MCP server 注册步骤，以及本机真实 run 的结论与缺口"
owner: task-owners
status: current
updated: 2026-11-11
related:
  - docs/tasks/KNOWLEDGE-CONTRACT-FIX.md
  - docs/tasks/KNOWLEDGE-BENCH.md
  - docs/tasks/DSH-PROFILE-BUNDLE.md
---

# KNOWLEDGE-MCP：知识工具面的 MCP 端点（AG-8 / W3）

基线 `main` @ `760e87067`。写域：`server/internal/handler/mcp_knowledge.go`（新增）+ 同名测试、`server/cmd/server/router.go`（新增路由组）、`server/internal/daemon/agents_probe.go`（仅 dsh `--list-models` 参数）、本文件。**未 commit**。

执行时间 2026-11-11 16:08–16:30（Asia/Shanghai）。

## 0. 结论

| 交付项 | 状态 | 证据 |
| --- | --- | --- |
| `POST /api/mcp/knowledge` 三方法 | 完成 | 本机 8080 上 curl `initialize` / `tools/list` / `tools/call` 全通（§4） |
| 工具面与 `internal/knowledge/tools.go` 同源 | 完成 | `tools/list` 由 `Service.Tools()` 生成，只改名与时序，不重写 schema（§2） |
| 权限 = token 绑定用户 + `canViewItem` | 完成 | 全部走 `Service.InvokeTool`，端内无第二套权限判断；越权用例 `-32001`（§4E） |
| 鉴权不接受「仅 X-Workspace-ID」 | 完成 | 仅带头 → 401 `missing authorization`；mat_/mul_ 都经 `middleware.Auth` + `RequireWorkspaceMember`（§3、§4C） |
| 过期 mat_ → `-32002` | 完成 | 端点前一道 `MCPTokenExpiryGate` + 真 HTTP 复现（§4A） |
| dsh `--list-models` 带 `--profile multica` | **已满足，无需改动** | 调用点在 `pkg/agent/dsh.go:440`（`--profile multica --list-models`）；`agents_probe.go` 内不存在 `--list-models`（§6） |
| 工作区 MCP server 注册 + 绑 agent | 完成 | `POST /api/workspaces/{id}/mcp-servers` → `POST /api/agents/{id}/mcp-servers` → `enabled:true`（§5） |
| 真实 dsh run 跑通 | **未跑通（环境缺口）** | 本机无注册 daemon；`dsh` 存在但**没有 `multica` profile**（§7） |

验证：`go build ./...` 0；`go vet ./internal/handler ./internal/daemon` 0；`go test ./internal/handler -run 'MCP|Knowledge' -count=1` 全绿（§4、§4-表）。

## 1. 为什么是「第二个协议，不是第二道门」

`dsh` 等运行时通过 multica 管理的 MCP 取工具，而知识检索的权限只有一处实现：`internal/knowledge` 的 `canViewItem`。因此端点只做三件事——握手、列工具、转发调用：

- `tools/list` 的 name/description/input_schema 直接来自 `knowledge.Service.Tools()`，仅把 `knowledge.search` 映射成 MCP 习惯的 `knowledge_search`，`input_schema` 映射成 `inputSchema`。
- `tools/call` 只调 `Service.InvokeTool`。工具名两种写法都接受（`knowledge_search` 与注册表里的 `knowledge.search`），因此按 `/api/knowledge/tools` 写的配置不必重写。
- 端点内没有任何 workspace/ACL 判断：workspace 与 viewer 来自中间件已授权的请求。

## 2. 契约

单一端点 `POST /api/mcp/knowledge`，请求体是一帧 JSON-RPC 2.0（不批量）。

| method | 结果 |
| --- | --- |
| `initialize` | `{protocolVersion, capabilities:{tools:{}}, serverInfo:{name:"morechat-knowledge",version:"0.1.2"}}`；`protocolVersion` 在客户端请求的版本属于 `2025-06-18 / 2025-03-26 / 2024-11-05` 时回显该版本，否则答默认 `2025-03-26` |
| `ping` | `{}` |
| `tools/list` | `{tools:[{name,description,inputSchema}]}`，两个工具：`knowledge_search{query,space_id?,top_k?,mode?,score_threshold?,rerank?}`（required: `query`）、`knowledge_get{item_id,document_id?,include_chunks?,chunk_limit?}`（required: `item_id`） |
| `tools/call` | `{content:[{type:"text",text:"<result 的 JSON>"}],isError:false}` |
| `notifications/*` | 无 id 的帧一律 `202 Accepted`、空 body（客户端 `initialize` 后会发 `notifications/initialized`） |
| 其它 | `-32601` |

错误码（HTTP 恒 200，只有「body 不是 JSON-RPC 帧」也仍是 200 + `-32700`；凭据缺失/无效才 401）：

| code | 含义 |
| --- | --- |
| `-32700` | 请求体不是 JSON-RPC 帧 |
| `-32600` | `jsonrpc` 不是 `"2.0"` |
| `-32601` | 未知 method |
| `-32602` | 参数错：`tools/call` 缺 `name`、未知工具名、工具自己的参数校验失败（`ErrInvalidField`） |
| `-32001` | `knowledge_forbidden`：`GetItemForViewer`/检索层拒绝（含「不在本工作区」——该包刻意把 not-found 与不可见合并成同一答案，避免探测存在性） |
| `-32002` | `mat_token_expired`：agent task token 已过期（见 §3） |
| `-32603` | 其它内部错误；被取消的调用也落这里，绝不误报 forbidden |

无会话状态：不签发也不要求 `Mcp-Session-Id`（每帧自带凭据）；客户端若带该头则忽略。不实现批量数组（`pkg/remotemcp` 的客户端按单帧发）。

## 3. 鉴权与挂载

`router.go` 在该组外新增一个组（`/api/apps/mcp` 之后）：

```go
r.Group(func(r chi.Router) {
    r.Use(h.MCPTokenExpiryGate)
    r.Use(middleware.Auth(queries, patCache, cloudPATVerifier, cfSigner))
    r.Use(middleware.RequireWorkspaceMember(queries))
    r.Post("/api/mcp/knowledge", h.KnowledgeMCP)
})
```

- `Authorization: Bearer mat_…`：`middleware.Auth` 用 token 行改写 `X-Workspace-ID`/`X-User-ID`（agent、task 也一并钉住），客户端自己给的 `X-Workspace-ID` 不能扩张工作区；随后 `RequireWorkspaceMember` 仍按绑定工作区校验成员身份。
- `Authorization: Bearer mul_…`：用户来自 PAT，工作区按仓库既有规则选（`X-Workspace-ID`/slug/query），成员身份由 `RequireWorkspaceMember` 校验。**只给 `X-Workspace-ID` 而无 token 走不到 handler**。
- `MCPTokenExpiryGate`（`mcp_knowledge.go`）放在 `middleware.Auth` 之前，只看一件事：`mat_` 前缀的 token 若在 `task_token` 里有行且 `expires_at` 已过，直接答 `-32002`。它不做任何认证/授权，其它状态一律原样交给中间件（未知/已撤销 token 仍是 401）。放在中间件之前是必须的：Auth 的通用 401 会让客户端把「需要续签」误判成「凭据错误」。

## 4. 本机真跑（HTTP 8080，`multica_dev`）

起法：`node scripts/dev.mjs migrate up`（已 applied）+ `go run ./cmd/server`（`.env` 的 `DATABASE_URL`、`PORT=8080`）。客户端用真实账号 `/auth/verify-code`（dev code）登录后铸的 `mul_` PAT，工作区 `mcp-verify`。

工具面/调用响应（节选，`-s -i` 的 200 与 `Content-Type: application/json` 已确认）：

```
### initialize
{"jsonrpc":"2.0","id":1,"result":{"capabilities":{"tools":{}},"protocolVersion":"2025-03-26","serverInfo":{"name":"morechat-knowledge","version":"0.1.2"}}}

### tools/list
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"knowledge_search","description":"Search the workspace knowledge base. …","inputSchema":{"type":"object","properties":{"query":…,"top_k":…,"mode":…,"space_id":…,"score_threshold":…,"rerank":…},"required":["query"],"additionalProperties":false}},{"name":"knowledge_get",…,"required":["item_id"]}]}}

### tools/call knowledge_search {"query":"JSON-RPC 2.0","top_k":3}
{"jsonrpc":"2.0","id":3,"result":{"content":[{"text":"{\"hits\":[{\"chunk_id\":\"71c4b89b…\",\"item_id\":\"c292acc3…\",\"item_title\":\"MCP endpoint notes\",\"heading_path\":\"MCP endpoint\",\"score\":0.016393,\"channels\":[\"keyword\"],\"acl_mode\":\"workspace\"}],\"debug\":{\"index_layer\":\"empty\",\"visible_items\":1,\"total_items\":1,\"keyword_hits\":1,\"vector_degraded\":true,\"mode\":\"hybrid\"}}","type":"text"}],"isError":false}}

### tools/call knowledge_get {"item_id":"c292acc3…","include_chunks":false}
{"jsonrpc":"2.0","id":4,"result":{"content":[{"text":"{\"item\":{\"id\":\"c292acc3…\",\"workspace_id\":\"8e1fe133…\",\"title\":\"MCP endpoint notes\",\"acl_mode\":\"workspace\",…}}","type":"text"}],"isError":false}}

### 未知方法
{"jsonrpc":"2.0","id":5,"error":{"code":-32601,"message":"unknown method resources/list"}}

### notifications/initialized
HTTP/1.1 202 Accepted  （Content-Length: 0）
```

鉴权矩阵（同一端点、同一 payload）：

| 场景 | 结果 |
| --- | --- |
| A 过期 `mat_`（DB 里 `expires_at = now() - 5min`） | `{"error":{"code":-32002,"message":"mat_token_expired: …"}}` |
| B 有效 `mat_`，**不带** `X-Workspace-ID` | `initialize` 正常，工作区由 token 绑定决定 |
| C 只有 `X-Workspace-ID`、无 token | HTTP 401 `{"error":"missing authorization"}` |
| D `Bearer mul_deadbeef` | HTTP 401 `{"error":"invalid token"}` |
| E 同一用户、工作区 B（item 在 A），`knowledge_get` | `{"code":-32001,"message":"knowledge_forbidden: item is not visible to this caller"}` |

`go test ./internal/handler -run 'MCP|Knowledge' -count=1 -v`（`ok … 3.15s`，0 FAIL）中本文件新增的用例：

| 用例 | 断言 |
| --- | --- |
| `TestKnowledgeMCPInitialize` | 版本回显、`capabilities.tools`、`morechat-knowledge/0.1.2` |
| `TestKnowledgeMCPInitializeFallsBackOnUnknownRevision` | 未知版本 → 默认 `2025-03-26` |
| `TestKnowledgeMCPToolsList` | 两个工具名 + `required` 与 `properties` 齐全 |
| `TestKnowledgeMCPToolsCallGet` | 真 item 读回；`knowledge.search` 点号写法同效 |
| `TestKnowledgeMCPToolsCallSearch` | 返回 `hits`/`debug.mode` |
| `TestKnowledgeMCPUnknownMethod` | `-32601`，id 原样回显 |
| `TestKnowledgeMCPInvalidParams`（3 子用例） | 缺 name / 未知工具 / 缺 query → `-32602` |
| `TestKnowledgeMCPForbiddenForForeignWorkspaceItem` | 跨工作区 `knowledge_get` → `-32001` |
| `TestKnowledgeMCPExpiredTaskToken` | 真过期 token 行 → `-32002` |
| `TestKnowledgeMCPTokenGateIgnoresLiveAndUnknownTokens` | 有效/未知 `mat_`、`mul_` 不被 gate 拦下 |
| `TestKnowledgeMCPNotificationAccepted` | 通知 → 202、无错误帧 |
| `TestKnowledgeMCPParseError` | 坏 JSON → `-32700` |

## 5. 注册成工作区 MCP server 并绑 agent（已跑）

```bash
# 1) 注册（name 即运行时挂载名，也是本端点 initialize 的 serverInfo.name）
POST /api/workspaces/{ws}/mcp-servers
{"name":"morechat-knowledge",
 "config":{"url":"http://127.0.0.1:8080/api/mcp/knowledge",
           "headers":{"Authorization":"Bearer <token>","X-Workspace-ID":"<ws>"}}}
# → {"id":"a7a09781…","name":"morechat-knowledge","transport":"http","enabled":true,…}

# 2) 绑到 agent（库条目本身不授予任何人）
POST /api/agents/{agent}/mcp-servers   {"server_id":"a7a09781…"}
# → 同一条记录，enabled:true

# 3) 开关（幂等）
PUT  /api/agents/{agent}/mcp-servers/{server}/enabled   {"enabled":true}
```

`GET /api/agents/{agent}/mcp-servers` 读回同一条绑定。`multica` CLI 本机未安装，故按任务允许用 API 完成。

声明顺序（`ResolveAgentMcpConfig`）：绑定 server ＜ agent 自己的 `mcp_config` ＜ 每任务 overlay；绑定只在 claim 时折进任务的 mcp 配置，因此「注册成功」≠「某次 run 一定带上它」——真正生效要在 claim 之后看运行时收到的配置（§7）。

**静态凭据限制（真实缺口，非本端点引入）**：工作区 MCP server 的 `config` 是不透明 JSON，daemon 不做凭据代理也不做占位符替换，所以上面只能写长期 `mul_` PAT。也就是说凡挂这个 server 的 run 都以上述用户身份调知识库，拿不到「每 run 的 mat_ 作用域」。要按 run 收窄，需要 daemon 在折入时把 `MULTICA_TOKEN`（该 run 的 mat_）注入 header 的机制——属于 daemon/产品侧后续项，本轮写域内做不到。

## 6. dsh `--list-models` 的 `--profile multica`（已满足，未改代码）

- 实际调用点：`server/pkg/agent/dsh.go:440` → `runtimeCmd.exec(ctx, "--profile", dshProfile, "--list-models")`，`dshProfile = "multica"`（同文件 :19）。`discoverDshModels` 是唯一路径（`pkg/agent/models.go:257` 调用）。
- `server/internal/daemon/agents_probe.go` 里**没有** `--list-models`：它只跑 `--profile multica --probe`（:492）。因此本项无可改之处，未做「为改而改」的提交。
- 参数必要性的实测：本机 `dsh --list-models` 直接报 `error: --profile <name> is required`；`dsh --profile multica --list-models` 报 `profile "multica" does not exist`（§7）。即：**不带 profile 的裸调用根本无效**，代码里的参数是必需的，`provider/model` 形态的 id 由该 profile 的模型帧给出（本机无 profile，未能取到真实 id 列表，不臆造）。

## 7. 真实 run：结论与缺口

**结论：本机无法跑通一次真正的 agent run**，缺的是环境，不是本端点。已核实的缺口：

1. **`dsh` 的 `multica` profile 未安装**。`dsh --version` = `0.2.2-rc.1`；`~/.dsh/profiles/` 只有 `desktop/headless/sdk/web`，`~/.dsh/profiles/multica/package.json` 不存在。daemon 的 `probeDshMulticaProfile` 会判成 `dshProbeMissingProfile`（`internal/daemon/agents_probe.go`）。修法：`dsh plugin --profile multica add <@multica-ai/dsh-runtime 包>`，或让 daemon 用本地 bundle 自动装（见 `docs/tasks/DSH-PROFILE-BUNDLE.md`；该 bundle 目前未发布）。
2. **没有注册/在线的 daemon**。本机只起了 API（8080）；`/api/daemon/*` 没有 daemon 心跳，任务无法 claim，claim 就不会把绑定的 MCP server 折进运行时配置。
3. **没有模型凭据**：即使 profile 装好，还需要该 profile 的 provider 凭据（`dsh` 侧的登录/密钥）才能起 run。

补齐后要跑通的链路（每一步都是现成的）：

```bash
# 1) 装 multica profile 并确认探测帧
dsh plugin --profile multica add <package>
dsh --profile multica --probe        # 期望 {"v":1,"type":"probe","runtime":"dsh","protocol_version":<DshProtocolVersion>}
dsh --profile multica --list-models  # 期望 provider/model 形态的 id

# 2) 起 daemon（同一 workspace 的 mul_ / daemon token）
node scripts/dev.mjs daemon           # 或 daemon 二进制 + MULTICA_* 环境

# 3) 建 issue 派给已绑定 morechat-knowledge 的 agent，claim 后看运行时配置里出现
#    "morechat-knowledge": {"type":"http","url":"http://127.0.0.1:8080/api/mcp/knowledge","headers":{…}}
#    并看到 dsh 调 tools/list → tools/call knowledge_search
```

在那之前，「端点被真实 MCP 客户端消费」的证据只有 §4 的 curl 全过程（真实 HTTP、真实 token、真实 DB 数据），这一点不再往上包装。

## 8. 后续（未做，避免超写域）

- 每 run 凭据：workspace MCP server header 支持该 run 的 `mat_`（daemon 侧折入时注入），取代静态 PAT。
- 批量/流式：`pkg/remotemcp` 客户端按单帧调用，故未实现数组批量与 SSE；若日后接入会发数组的客户端，需在 `KnowledgeMCP` 里加批量分支（`connectedapps` 的网关已有可抄的形状）。
- 结果截断：大文档的 `knowledge_get`（`chunk_limit` 最大 500）可能超过单帧可读性上限；目前不限长，后续可按 `connectedapps` 的 `maxResultBytes` 截断并在 text 里注明。

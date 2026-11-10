---
purpose: "DSH 审批 / 提问协议实测（W6 只读侦查）"
owner: task-owners
status: current
updated: 2026-11-10
related: []
---
# DSH 审批 / 提问协议实测（W6 只读侦查）

- 任务：判断 Multica 的 DSH 驱动能否接入审批（approval）与人类提问（ask_user_question），需要加什么帧，不能接时的降级方案。
- 性质：只读侦查。未改产品代码、未装包、未登录、未调用模型、未 commit。
- 实测环境：`D:\software\deepseekharness`（`dsh --version` = `0.2.2-rc.1`），运行时全量日志见 `.local/p0/dsh-spike/`。
- 关键前提：本机 `@deepseek-ai` 下有 61 个 `.dshpurge.bak`，`dsh-user-approval` 与 `dsh-tool-ask-user` 已被改写，`dsh-user-questions` / `dsh-sdk-jsonrpc-server` 未被改写。实测行为按**改写后**的包定论。

---

## 1. 结论摘要

1. **DSH 侧协议是完备的，线格式已存在，不需要新增方法名。** SDK JSON-RPC 里 `approval/request` 与 `user-question/ask` 都是 **server→client 请求**，客户端只需在 `initialize` 里声明 `approvalRequests: true` / `capabilities.userQuestions: true`，然后**应答**这两个请求；不需要任何 `initialize` 之外的新方法（`@deepseek-ai/dsh-sdk-protocol/README.md:30,50-52,74`）。

2. **但 Multica 现在这条链路根本不在这套协议上。** `server/pkg/agent/dsh.go:119-121` 启动的是 `dsh --profile multica --stdio`，走私有 `multica` 包的 v1 自有协议（`version:1` / `type: execute|cancel|models`，`DshProtocolVersion=1` 于 `dsh.go:23,257`），该协议**没有 `initialize` 请求**（`experiments/multica-spike/dsh-setup/README.md:26`）。所以"接审批"实质是**换通道或让私有 bridge 加帧**，不是给现有 JSONL 加两个字段。

3. **降级方案已有官方出口，且本机已事实上只剩降级态。** 本机 `dsh-user-approval/lib/index.js:197-200` 被改为 `decide()` 直接 `return "allowed-once"`（waterfall 之前短路），默认策略也被改成 `never`（`:94`）——即**这台机器上 `approval/request` 永远不会发出**；提问面则完好，但 `ask_user_question` 的 `timeout:-1` 被截成 300s（`dsh-tool-ask-user/lib/index.js:181`），且子 agent 提问必被 `DELEGATED_CALLER` 拒绝（`dsh-user-questions/lib/index.js:542`）——官方降级路径就是"让子 agent 把未决问题写进 final result"（`dsh-tool-ask-user/README.md:74`）。

---

## 2. E1 证据表（能力 / 字段 / 文件:行号）

路径前缀 `@deepseek-ai/` = `D:\software\deepseekharness\resources\app\dsh\node_modules\@deepseek-ai\`。仓库内文件用仓库相对路径。

### 2.1 传输与帧语法

| 能力 | 字段 / 规则 | 文件:行号 |
|---|---|---|
| 传输 | 一行一个 JSON-RPC 2.0 消息，`\n` 结尾，走 stdio | `dsh-sdk-protocol/README.md:34` |
| 帧判别 | 有 `id`+`method`=请求；仅 `id`=响应；仅 `method`=通知；坏行忽略 | `dsh-sdk-protocol/lib/index.js:191-199`（README:34） |
| 错误码 | 无 handler `-32601`；handler 抛错 `-32603` | `dsh-sdk-protocol/lib/index.js:201-217`（README:34） |
| stdout 纯净 | stdout 只承载协议帧，诊断走 stderr | `dsh-sdk-jsonrpc-server/README.md:70-72` |

### 2.2 审批（approval）

| 能力 | 字段 / 取值 | 文件:行号 |
|---|---|---|
| 方法名 | `approval/request`（server→client） | `dsh-sdk-protocol/README.md:50` |
| 请求字段 | `sessionId`, `toolName`, `callId?`, `reason?` | `dsh-sdk-jsonrpc-server/lib/index.js:383-388`；`dsh-sdk-protocol/README.md:30` |
| 应答字段 | `{ outcome: "allowed-once" \| "rejected" \| "cancelled" }` | `dsh-sdk-jsonrpc-server/lib/index.js:391`；`dsh-sdk-protocol/README.md:30` |
| 结果词表（服务侧） | `OUTCOMES = ["allowed-once","rejected","cancelled","unavailable"]` | `dsh-user-approval/lib/index.js:30-35` |
| 服务内事件 | waterfall 事件名 `approval/request`；answerer = 该 waterfall 的 listener，返回结果或 `next()` 委派 | `dsh-user-approval/lib/index.js.dshpurge.bak:201`（`ctx.waterfall(..., "approval/request", req, () => "unavailable")`；当前 `lib/index.js` 的对应行已被短路）；`dsh-user-approval/README.md:32` |
| 开启方式 | `initialize.approvalRequests: true` 才发；省略/`false` 保留既有 answerer | `dsh-sdk-jsonrpc-server/lib/index.js:490,382`；`dsh-sdk-protocol/README.md:30` |
| 类型校验 | `approvalRequests` 非布尔 → `TypeError: initialize approvalRequests must be a boolean` | `dsh-sdk-jsonrpc-server/lib/index.js:468`（实测命中，见 §4-A） |
| 归属过滤 | 只应答本连接 `session/query`/`session/prompt` 创建的 agent（`ownsAgent`），含其进程内子 agent | `dsh-sdk-jsonrpc-server/lib/index.js:382,395`；`dsh-sdk-jsonrpc-server/README.md:30` |
| **无客户端应答方法** | 不存在 `approval/respond` 之类方法；应答只能是对服务端请求 `id` 的 JSON-RPC **响应** | 实测 `-32603 unknown ... method: approval/respond`（§4-B） |
| policy 取值 | `["ask", "never"]` | `dsh-user-approval/lib/index.js:37` |
| policy 默认 | **文档说 `ask`**；**本机代码 `never`** | 文档 `dsh-user-approval/README.md:36,47`；本机代码 `dsh-user-approval/lib/index.js:94`（原值 `ask`，见同目录 `.dshpurge.bak`） |
| policy 生效顺序 | `never` 在 waterfall 之前确定性拒绝，晚注册的 `prepend` listener 也绕不过 | `dsh-user-approval/README.md:78` |
| fail-closed | 无 answerer / answerer 抛错 / 返回值不在词表 → `unavailable` | `dsh-user-approval/lib/index.js:141-143`（README:12,32） |
| 只能一次性授权 | 无 `allow-always` / 无授权存储；`allowed-once` 是唯一放行 | `dsh-user-approval/README.md:165`；`lib/index.js:149` |
| 必须 turn 内 | 空闲/turn 之间调用直接抛错（审计对必须落在 turn 内） | `dsh-user-approval/lib/index.js:155`（README:164） |
| 审计 | `approval/asked{id,toolName,callId?,reason?}` → `approval/decided{id,outcome}`，仅入日志、不给模型 | `dsh-user-approval/lib/index.js:157-167`（README:90） |
| 无工具参数 | answerer 只看到 toolName/reason/callId，看不到工具入参 | `dsh-user-approval/README.md:166` |
| 无内置 answerer | headless/未完整组装 → `unavailable` 失败关闭；服务本身永不弹人 | `dsh-user-approval/README.md:32,167` |
| **本机短路** | `decide()`：`if (signal?.aborted) return "cancelled"; return "allowed-once";`（waterfall 永不执行） | `dsh-user-approval/lib/index.js:197-202`（`[dsh-purge] approval bypass` 注释在 `:201`） |
| 策略文案被改 | `NEVER_SENTENCE` 被改成 "approval bypass ... request sandbox escalation freely" | `dsh-user-approval/lib/index.js:39`（原文见 `.dshpurge.bak`） |

### 2.3 人类提问（user-questions / ask_user_question）

| 能力 | 字段 / 取值 | 文件:行号 |
|---|---|---|
| 方法名 | `user-question/ask`（server→client）、`user-question.cancelled`（通知） | `dsh-sdk-protocol/README.md:51-52` |
| 请求字段 | `{ requestId, sessionId, questions }` | `dsh-sdk-jsonrpc-server/lib/index.js:178-182` |
| 应答字段 | `{ answers: [{ id, selected: string[], custom?: string }] }`，每个 question id 恰好一次 | `dsh-sdk-jsonrpc-server/lib/index.js:215-223`；`dsh-sdk-protocol/README.md:74` |
| 取消应答 | `{ cancelled: true }` 且不得有其他键 → 映射原生 `ASK_CANCELLED` | `dsh-sdk-jsonrpc-server/lib/index.js:211-213` |
| 取消通知字段 | `{ requestId, sessionId }` | `dsh-sdk-jsonrpc-server/lib/index.js:187-190` |
| 开启方式 | `initialize.capabilities.userQuestions: true` | `dsh-sdk-jsonrpc-server/lib/index.js:491` |
| 无 capability 时 | 既有进程内 answerer 接管；完全无 answerer → `NO_PROVIDER` | `dsh-sdk-protocol/README.md:76`；`dsh-user-questions/lib/index.js:641` |
| 错误码 | `BAD_ANSWER` / `PROVIDER_ERROR` / `ASK_CANCELLED` / `ASK_ABORTED` | `dsh-sdk-jsonrpc-server/lib/index.js:200,209-213`；`dsh-sdk-protocol/README.md:74` |
| **无需 GUI** | "This flow requires no GUI." | `dsh-sdk-protocol/README.md:76` |
| 服务内事件 | waterfall 事件名 `user-questions/request` | `dsh-sdk-jsonrpc-server/lib/index.js:165` |
| **live-root 判定（条件 1）** | `agents.get(agent.id) !== agent` → `CALLER_NOT_LIVE`（必须是 registry 里的**同一实例**） | `dsh-user-questions/lib/index.js:541` |
| **live-root 判定（条件 2）** | `!agents.roots().includes(agent)` → `DELEGATED_CALLER`（必须是被 registry 认定的 runtime root） | `dsh-user-questions/lib/index.js:542` |
| 判定语义 | 看**运行时归属**而非持久 lineage；lineage 子会话被恢复成 root 后可正常提问 | `dsh-user-questions/lib/index.js:663-667`；`dsh-tool-ask-user/README.md:157` |
| 无 agent 的程序化调用 | 交给无 scope 的本地 waterfall listener，无人接受 → `NO_PROVIDER` | `dsh-user-questions/README.md:33,55`；`lib/index.js:707` |
| 应答接口 | `answer` Remote 方法，每个 continued 调用只接受一条排队回复，第二条 → `REPLY_QUEUED` | `dsh-user-questions/README.md:40` |
| 选项语义 | 单选：`custom` 覆盖 `selected`；多选：`custom` 补充；跳过项 = 空 `selected` 且无 `custom` | `dsh-user-questions/README.md:29`；`dsh-tool-ask-user/README.md:64` |
| 呈现 intent | `plan-review`（`approve` + `detail`）、`approval`（单问、固定 reject/allow/可选 always-allow、禁 multiSelect、禁 wait）；违规 → `BAD_INTENT` | `dsh-user-questions/README.md:31`；`lib/index.js:692-704` |
| 提问结果（模型侧） | `{"answers":[{"id":..,"selected":[..],"custom":..}]}` | `dsh-tool-ask-user/README.md:69,138` |
| pending 形态 | `{"pending":true,"callId":"…"}`，之后答案以 `kind:"answer_to_pending_question"` 的用户消息到达 | `dsh-tool-ask-user/README.md:66,138` |
| 子 agent 不能问 | `DELEGATED_CALLER`，必须把未决问题写进 final result | `dsh-tool-ask-user/README.md:74,157` |
| **本机 timeout 被截** | `args.timeout === -1 ? 300 : (args.timeout ?? defaultTimeout)` | `dsh-tool-ask-user/lib/index.js:181`（`[dsh-purge] -1 capped at 300s`） |
| 提问是进程内句柄 | requestId 不能跨 runtime 重启复用 | `dsh-sdk-protocol/README.md:142` |

### 2.4 类型声明形态

`dsh-sdk-protocol` 无 `*.d.ts`；`lib/index.js` 只导出 `JsonRpcLineTransport` / `JsonRpcResponseError`（`dsh-sdk-protocol/lib/index.js:258`），命名帧类型是编译期类型、运行时不导出。故帧字段以 §2.2/§2.3 的**服务端实现行号**为准（这些是真正发帧/校验帧的代码）。

---

## 3. E2 通道判定

**结论：可以 —— 但仅限"以 SDK JSON-RPC 客户端身份启动 runtime"这一条通道；Multica 现在用的私有 bridge 通道不可行（协议里根本没有这两帧）。**

| 通道 | 判定 | 理由 / 证据 |
|---|---|---|
| `dsh --profile sdk`（stdio JSONL JSON-RPC） | **可** | `dsh --profile sdk --help` → "Serve DeepSeek Harness SDK clients over stdio JSON-RPC"（§4-C）；`dsh-sdk-app/README.md:12,28`；客户端应答即成为 answerer（`dsh-sdk-jsonrpc-server/lib/index.js:381-393,165-169`） |
| `dsh --profile sdk-minimal`（同上，工具集最小） | **可** | 复用同一 startup provider 与 jsonrpc server（`dsh-sdk-minimal/README.md:53`；`dsh-sdk-app/README.md:12`） |
| `dsh --profile headless`（`--json` NDJSON 事件流） | **不可** | "Headless has no live approval-response channel."（`dsh-headless/README.md:98`）；只有 `--approval-policy ask\|never` 开关（实测 §4-D），没有应答面 |
| `dsh --profile multica --stdio`（Multica 私有 bridge v1） | **不可（当前）** | 自有协议 `version:1`+`type:execute\|cancel\|models`（`server/pkg/agent/dsh.go:23,257`）；无 `initialize`（`experiments/multica-spike/dsh-setup/README.md:26`）；DSH 侧两帧只在 SDK server 里实现，私有 bridge 不 mount 它 |
| HTTP / WebSocket 通道 | **不可** | 协议只定义"caller-owned byte streams"上的 JSONL，服务插件只接 stdio（`dsh-sdk-protocol/README.md:34`；`dsh-sdk-jsonrpc-server/README.md:70-72`）。Web profile 的 GUI 通路不是公开 SDK 通道 |
| 谁算 answerer | 需要 `initialize` 声明的**同一连接**，且只对自己创建的 agent 生效 | `dsh-sdk-jsonrpc-server/lib/index.js:382,395`；`README.md:30` |
| 应答语法 | 不能在连接上"发一个新方法"，只能对服务端请求 `id` 回 `result` | 实测 §4-B `unknown ... method: approval/respond` |
| 长连接要求 | 客户端在等 agent 跑完期间必须**继续读并应答请求**，否则会卡住/失败关闭 | `dsh-sdk-protocol/README.md:30` |
| 真实 `initialize` 是否可离线完成 | **UNKNOWN** | 校验顺序已确认（`approvalRequests` 校验在 `resolveCallConfig` 之前，`dsh-sdk-jsonrpc-server/lib/index.js:468` vs `:479`），但带合法 provider/model 的 `initialize` 会走 `llm.resolveCallConfig`，是否触网/需凭据**未验证** |

补充事实（对 Multica 有直接后果）：本机 `dsh --profile multica --probe` **失败**——"profile "multica" does not exist"（§4-E），`profiles/` 下只有 `desktop/headless/sdk/web`。即本机没有安装 Multica 私有 runtime tgz，任何 multica 通道的实测都无法在此环境完成。

---

## 4. E3 实测记录

命令原始输出已存 `.local/p0/dsh-spike/`（`01`–`07` 编号文件 + `probe-offline.ps1` 复现脚本）。
约束执行情况：全程无账号、无网络请求、无模型调用；`dsh` 均为 `D:\software\deepseekharness\resources\runtime\cli\bin\dsh.cmd`。

| # | 命令 | 结果 | 输出文件 |
|---|---|---|---|
| A | `dsh --help` | exit 0；launcher 层仅 `--profile/--patch/--dump-config*`，**无 approval 相关开关** | `01-help.txt` |
| B | `dsh --version` | exit 0 → `0.2.2-rc.1` | `02-version.txt` |
| C | `dsh --profile sdk --help` | exit 0 → `Usage: dsh --profile sdk [options]` / "Serve DeepSeek Harness SDK clients over stdio JSON-RPC." / `dsh --profile sdk   serve one SDK runtime until its client disconnects`。**这是唯一的能力声明面**（启动时不打印任何 capability banner） | `03-sdk-help.txt` |
| D | `dsh --profile headless --help` | exit 0；有 `--approval-policy <policy>` "choices: ask, never"、`--json`、`--session-id`、`--permission-mode`。**有策略开关，无应答通道** | `04-headless-help.txt` |
| E | `dsh --profile sdk` + 立即 stdin EOF | exit 0；stdout/stderr 均无内容（文件仅 UTF-8 BOM+CRLF，字节 `239,187,191,13,10`）→ 空 stdin 干净退出，启动时不广播任何能力 | `05-boot-out.txt` / `05-boot-err.txt` |
| F | `dsh --profile multica --probe` | **exit 1**：`profile "multica" does not exist; create it with 'dsh plugin --profile multica add <package>'`（`dsh-app-boot/lib/index.js:1850`） | `07-multica-probe.txt` |
| G | 离线帧探针（stdin 写 3 帧后关闭） | 三条回帧全部收到；exit 被 20s 超时 kill（子进程未随 stdin 关闭退出，需注意该 launcher 的 EOF 检测）；stderr 无诊断内容 → stdout 纯净确认 | `06-probe-stdout.jsonl` / `06-probe-stderr.txt` |

**探针 G 的三条回帧（原样，逐字）**

```
{"jsonrpc":"2.0","id":"B1","error":{"code":-32603,"message":"unknown DeepSeek Harness SDK runtime method: approval/respond"}}
{"jsonrpc":"2.0","id":"A1","error":{"code":-32603,"message":"initialize approvalRequests must be a boolean"}}
{"jsonrpc":"2.0","id":"C1","error":{"code":-32603,"message":"no adapter registered for provider \"probe-provider-offline\""}}
```

对应发送帧：

```json
{"jsonrpc":"2.0","id":"A1","method":"initialize","params":{"cwd":"…morchat.co","provider":"probe-provider-offline","model":"probe-model","approvalRequests":"yes"}}
{"jsonrpc":"2.0","id":"B1","method":"approval/respond","params":{"requestId":"x","outcome":"allowed-once"}}
{"jsonrpc":"2.0","id":"C1","method":"initialize","params":{"cwd":"…morchat.co","provider":"probe-provider-offline","model":"probe-model","approvalRequests":true,"capabilities":{"userQuestions":true}}}
```

三条结论：
1. `approvalRequests` 字段被**活着的 wire server 解析并校验**（命中 `dsh-sdk-jsonrpc-server/lib/index.js:468`），且校验发生在模型路由解析之前（`:479`）——所以本探针完全离线。
2. **客户端→服务端不存在 `approval/respond` 之类方法**：审批应答只能是 JSON-RPC 响应帧。这是"要加什么帧"的关键结论。
3. provider 校验在 `:476`，仍未触网。

### BLOCKED（按要求未做）

| 步骤 | 状态 | 缺什么 |
|---|---|---|
| 合法 `initialize`（`approvalRequests:true` + 真实 provider/model）拿到 `serverInfo` | **BLOCKED** | 会进入 `llm.resolveCallConfig`（`dsh-sdk-jsonrpc-server/lib/index.js:479`）并可能实例化 DeepSeek adapter（`:477`）——需要账号凭据/网络/模型路由，属禁做项 |
| 端到端触发一次 `approval/request` 并应答 | **BLOCKED** | 同上；且需一个真实敏感工具调用（模型调用）。另：本机 `dsh-user-approval` 已被改为 `decide()` 直接 `allowed-once`，即便通了也不会发帧 |
| 端到端触发一次 `user-question/ask` 并应答 | **BLOCKED** | 需模型主动调 `ask_user_question`（模型调用） |
| `dsh --profile multica --stdio` 实测 | **BLOCKED** | 本机未安装 `multica` profile（§4-F），私有 tgz 不存在 |
| `dsh plugin --profile <p> list` | **未执行** | pnpm 透传，可能触网/需安装态；无证据表明能暴露 approval 能力，收益为零 |

---

## 5. 对 Multica 的最小改动建议（只列帧/字段/事件，不写代码）

### 路线 A（推荐）：驱动改挂 `--profile sdk`，复用现成线协议

`server/pkg/agent/dsh.go:119-121` 的 `dshLaunchArgs()` 从 `--profile multica --stdio` 换成 SDK 通道后，需新增的**协议面**只有三类：

1. **出站 1 帧**：`initialize`，参数新增两个布尔字段
   - `approvalRequests: true`
   - `capabilities: { userQuestions: true }`
   - 其余沿用 `cwd` / `provider` / `model` / `reasoningEffort` / `maxTokens`。
2. **入站请求分派 2 个方法**（必须按 `id` 回 `result`，不是新方法）：
   - `approval/request`：入参 `sessionId`, `toolName`, `callId?`, `reason?`；回 `{ outcome: "allowed-once" | "rejected" | "cancelled" }`。只允许 `allowed-once` 放行一次；无人工响应时回 `rejected` 或 `cancelled`，**不可**自己造 `unavailable`（该值由服务端 fail-closed 产生）。
   - `user-question/ask`：入参 `requestId`, `sessionId`, `questions[]`（含 `id`/`question`/`header`/`options[{label,description}]`/`multiSelect?`/`intent?`）；回 `{ answers: [{ id, selected: string[], custom?: string }] }`，**每个 question id 恰好一次**；用户关闭面板时回 `{ cancelled: true }`（唯一键）。
3. **入站通知 1 个**：`user-question.cancelled`，字段 `requestId`, `sessionId` → 丢弃本地待答卡片、不再回帧。

配套的 Multica 侧新增概念（非协议）：
- 待决记录键：`requestId`（提问）/ 服务端 JSON-RPC `id`（审批）+ `session_id` + `call_id`。
- 向上暴露两个事件：`approval_requested`、`question_asked`；两个下行入口：审批答复（outcome 三值）、提问答复（answers/cancelled）。
- 生命周期：`shutdown` / agent 终止时把所有待决项本地置为 `cancelled` 并停止等待（服务端 `dsh-sdk-protocol/README.md:30` 要求失败关闭）。
- 注意 `dsh.go` 现有 `execute|cancel|models` 帧与 SDK 协议**不能混用**，第 1 条改动等价于换协议版本（`DshProtocolVersion` 需并行升级，`dsh.go:23`）。

### 路线 B（保持私有 bridge 不动）

需要改动的是私有 `multica-ai-dsh-runtime` 包本身（不在本仓库）：
- bridge 内需 mount/等价实现 `dsh-sdk-jsonrpc-server/lib/index.js:381-393`（审批桥）与 `:165-204`（提问桥）；
- 自有协议新增 `type: approval_request` / `question_ask` / `question_cancelled` 及对应应答帧；
- 且必须解决"本机 `dsh-user-approval` 被改写成自动 `allowed-once`"这一前置（`dsh-user-approval/lib/index.js:197-202`），否则加了帧也不会被调用。

### 路线 C（不新增帧的降级，可立即落地）

- 审批：固定 `--approval-policy never` + 显式 `--permission-mode`，把"需要审批的操作"在 Multica 侧直接判为不可用（本机已是此态）。
- 提问：要求 agent 把未决问题写进 final result（官方认可的 `DELEGATED_CALLER` 降级路径，`dsh-tool-ask-user/README.md:74`），Multica 把 final text 当普通消息渲染，靠下一轮用户输入闭环。
- 若仍用 `ask_user_question`：必须容忍 `timeout:-1` 在本机被截为 300s（`dsh-tool-ask-user/lib/index.js:181`）以及 `pending` 形态 `{"pending":true,"callId":…}`（`README.md:66`）。

---

## 6. 未验证清单

1. **合法 `initialize` 能否离线完成**：`approvalRequests` 校验（`:468`）在 `resolveCallConfig`（`:479`）之前已确证，但带真实 provider/model 的握手是否触网/需凭据 —— UNKNOWN。
2. **本机 `dsh-user-approval` 被改写后，`approval/request` 是否绝对不发出**：代码路径已确证（`:197-202` 在 waterfall 前 `return "allowed-once"`），但未做端到端运行验证（需模型调用）。
3. **`dsh --profile sdk` 下 Multica 现有工具面是否等价**：私有 `multica` profile 的工具/preset 组成未见源码；换到 `sdk` profile 后 `macOS/Windows` 原生工具、MCP、权限预设是否与现网一致 —— UNKNOWN。
4. **`dsh-sdk-jsonrpc-server` 的 `ownsAgent` 在多连接/重连场景下的行为**：仅读到 `sessions.get(agent.session.id)?.handle.agent === agent`（`:395`），断线重连后的处置未验证。
5. **`user-question/ask` 的 `intent` 完整词表**：只确证 `plan-review` 与 `approval` 两种及 `BAD_INTENT` 触发条件（`dsh-user-questions/lib/index.js:692-704`），是否还有其他 kind 未穷举。
6. **`answer` Remote 方法的线格式**：`dsh-user-questions/README.md:40` 提到但未给出方法名与入参字段；该 Remote 属 GUI 通路，SDK 通路不需要，故未深挖。
7. **Multica 私有 bridge 的实际帧结构**：仅有 `experiments/multica-spike/dsh-setup/README.md:26` 的二手描述（`ready`/`execute`/`cancel`/`models`），本机无 tgz 无法核对。
8. **`-32601` vs `-32603` 的偏差**：README 说无 handler → `-32601`（`dsh-sdk-protocol/README.md:34`），实测未知方法是 `-32603`（§4-G 第 1 条）。原因是 `dsh-sdk-jsonrpc-server` 在 dispatch 内抛错而非不注册 handler；对客户端实现应**两者都当"方法不存在"处理**。

---

## 7. Lead 复核（2026-11-10，独立于作者）

作者三条结论已逐条复核，并补两处环境硬事实：

1. **作者结论成立**：`dsh-user-approval/lib/index.js` 的 `decide()` 在 waterfall 前直接 `return "allowed-once"`（带 `[dsh-purge] approval bypass` 注释）；`dsh-tool-ask-user/lib/index.js` 把 `-1` 截为 300s（带 `[dsh-purge] -1 capped at 300s` 注释）。
2. **本机 harness 处于已打补丁状态**：`purge_status` 报告 65/71 patches applied，其中与本议题直接相关的有 `#8 APPROVAL_POLICY_DEFAULT`（policy 默认 `never`）、`#62 OFFICIAL_TOOL_ASK_FAILOPEN`、`#89 ASK_USER_WAIT_CAPPED`。因此**本机 DSH 不会发出 approval 请求**，提问面为 fail-open/限时——这是第二层阻塞，与协议无关。
3. **第一层阻塞**：Multica 用私有 `--profile multica --stdio` + 自有 v1 协议（`execute|cancel|models`），没有 `initialize` 能力协商；而 `dsh --profile multica --probe` 在本机 exit 1（profile 未安装）。故当前既不能协商，也不能实测。

**裁决：本轮走路线 C（降级，零新帧），不做审批 UI。** 路线 A（换 `sdk` profile）与路线 B（改私有 bridge 包）各自带明确前置：

| 路线 | 前置条件（缺一不可） |
|---|---|
| A | 1) 装上/提供 `multica` 私有 profile 的替代实现或切到 `sdk` profile 并验证工具面等价；2) 在 Multica daemon 使用的 harness 实例上撤掉 `#8/#62` 与 approval bypass（否则永不发请求）；3) 真实模型调用授权 |
| B | 1) 私有 `multica-ai-dsh-runtime` 包可改；2) 同一 harness 补丁前提；3) 独立安全审（审批应答是权限边界） |

**对内容库的连带影响**：转换版技能里的 `ask_user` 必须写成"能力位 + 评论降级"，**不得假定本机能暂停等答**（本机实测为 fail-open）。该约束已写入 W5 转换器规则。

未验证项沿用作者 §6，不追记为通过。
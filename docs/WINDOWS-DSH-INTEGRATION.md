# Windows 原生 DSH：隔离组件复用与 Paperclip 最小接入

> **〔2026-11-06 基座切换注记〕** 任务/run 权威已由 Paperclip 切换为 Multica fork（基线 164290ee），新基座契约见 [MULTICA-BASE](D:/dev/morchat.co/docs/MULTICA-BASE.md)。本文中 Paperclip/相关机制研究保留为参考；受影响条款的等价契约在 MC 门禁族重定位（DISCOVERY D11）完成前暂缓作为权威引用。

> 2026-11-05，静态研究与设计评审稿。Ethan 已确认先按 DeepSeek Harness 优先方向研究，两台 Windows 11 x64 原生设备，Mac 预备；没有授权实现、安装、修改系统权限、调用模型或故障试验。本文细化现有 NG/DV 门禁，不替代原有公司权限、并行、自动保存及资产规则。所有实测结果仍为 NOT RUN。

## 1. Paperclip 不是模型—工具循环的 Harness

按本项目的分层定义，Paperclip 是公司任务和 AI 运行的控制/治理面：保存目标、任务、运行、指令/skill、审批、预算和历史，通过 adapter/Runner 连接执行环境。它不只是 HTTP 调用转发器，但不负责代替 DSH 的 agent loop。Runner 是进程/协议/工作区等运行基础设施，也不能因为名称包含 runtime 就当作云模型或完整的企业安全边界。[官方 adapters](https://docs.paperclip.ing/reference/adapters/overview/)、[固定 README](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/README.md)

| 层 | 本轮归属 | 不能混同 |
|---|---|---|
| 企业协作与权限 | morchat 公司/部门/群/人、设备授权、资产策略 | Paperclip Agent 汇报树不是完整人类部门模型 |
| 任务与运行控制 | Paperclip task/run、skill版本、成本账；扩展设备派发契约 | 不是每个员工另装一套 Paperclip，也不是默认服务器运行 Agent |
| 设备监督与运行适配 | 公司受管理本地 supervisor＋远程 adapter | 不再建设 agent loop 或第二套任务数据库 |
| Agent harness | 本地 DSH 的上下文、模型—工具循环、会话与事件 | 不等于模型供应商，也不等于安全沙箱 |
| 操作系统隔离 | 优先验证 Microsoft MXC ProcessContainer | 控制文件/网络/进程，不决定公司业务权限 |
| 模型与用量 | 云模型；公司网关保存原始 Key、准入/转发/回执 | 网关不在中央跑员工完整 harness |

## 2. 推荐最小组合与备选

**推荐验证组合：Paperclip 外部远程 adapter＋公司本地 supervisor＋官方 ACP 客户端＋每个 run/attempt 独立 DSH 进程＋MXC 原生 ProcessContainer。** 公司模型网关与 PCWS 保存链保持既有设计。不是把 Paperclip Runner 全部移植到 Windows，也不是另做一套 OpenMausBot/DSH Desktop 后台。

选择理由：DSH 已有循环和多协议模型适配；ACP 已有双向协议 SDK；MXC 已有正式 SDK、原生进程约束和流式标准输入/输出；Paperclip 已有任务/用量及中央快照事务。我们集中补这些边界之间的契约，而不是重写它们内部的实现。已有正式组件不等于组合已经成熟上线。

| 方案 | 取舍 | 本轮处理 |
|---|---|---|
| 整个 DSH 执行域置于 MXC，run 内共享最低获准权限 | 同时约束 DSH 内建文件读取与工具，少改 harness；run 内代码可能访问该 run 获准模型通道，必须明示 | 优先验证；公司政策必须接受这一 run 级权限粒度，否则不能按此方案通过 |
| 整个 DSH＋独立无网代码工具域，经受控 broker 委托 | 可使 Python/Node 连模型通道也不能访问；需要替换/关闭所有内建 exec 旁路，并处理跨域文件、取消和 IPC | 若公司要求工具级更细隔离则采用；不是只删环境变量即可实现，不在首轮同时建设两方案 |
| DSH 仅使用自带 Windows ACL / 仅隔离 shell | 现成部分更多，但内建读取、宿主插件、网络与其他 spawn 路径未全覆盖 | 不满足当前隐私/网络边界，不作为上线组合 |
| 全面移植 Paperclip Runner ACPX，或从 Codex 抽整套 Windows 沙箱 | 平台/安装完整性/IPC/配置耦合面较大；直接消费 MXC 更少分叉 | 不作为首轮默认；推荐路径失败后再比较，不删除已有安全检查强行通过 |

### 2.1 版本与 Windows 入池前提

- Paperclip 固定研究样本：40ea7a9b8994e9bdb3d13794b5847388be0f7a92；OpenMausBot：597e70d7930db632747acfb4ea047ca520bd958c；DSH：fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159。实际包/安装发行物还需锁摘要，不将研究 commit 当已安装版本。
- MXC 使用正式 [v1.0.1](https://github.com/microsoft/mxc/releases/tag/v1.0.1) 为验证候选，固定源码 fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2，V1 schema 1.0.0；Node 入口 @microsoft/mxc-sdk/v1。核心 MIT，分发仍核对依赖、原生二进制与第三方 notice。
- 首轮建议两台都选 Windows 11 25H2 x64、build 不低于 26200.9550，并在执行前冻结实际完整 build；这是为减少 OS 差异和覆盖所需 loopback 能力的建议，不是声称所有 Windows 11 支持。[固定支持表](https://github.com/microsoft/mxc/blob/fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2/docs/backends/process-container/os-version-support.md) 将 25H2 Process Isolation 的最低项列为 26200.9278；后续补丁和具体策略仍需逐机 probe。
- Node SDK 原生标准流要求采用 [官方 quickstart](https://learn.microsoft.com/en-us/windows/apps/develop/mxc/quickstart) 支持的 Node 24.21.0+（24 系列）或 26.8.0+；首轮建议受管理 Node 24 系列兼容版本，经 DSH 与原生依赖共同验证后锁定。不能凭 package 的粗略 engines 字段继承员工任意 Node。
- 固定 containment=ProcessContainer，仅用原生进程后端；不自动切 WSLc、Windows Sandbox、VM 或不同用户桌面会话来凑通过。MXC 的 Container 是抽象名称，不意味着本方案使用虚拟机/镜像。
- 逐机检查有效后端、文件/网络策略及 live stdio 能力，首轮只接受预检确认的 PSEC/BaseContainer 路径。禁止 DACL mutation fallback；其他降级也不能只凭“isSupported=true”放行。AppContainer/DACL 回退可能需管理员 host-prep、修改宿主 ACL及每次开机重做 NUL 准备，本轮不静默采用。[平台支持](https://learn.microsoft.com/en-us/windows/apps/develop/mxc/platform-support)
- 不组合不存在的能力：固定 MXC 的 PSEC/BaseContainer 不支持 LPAC 开关；手写 CreateProcessInSandbox 是实验接口，不自建其替代封装。缺少能力时报告不支持并停止，不自动以管理员身份运行完整 harness。

## 3. Windows 的最小权限边界

### 3.1 覆盖整个执行域，不只拦一条 shell 命令

外部受管理 supervisor 保留公司授权、ACP、网关/资产连接与 MXC 生命周期。它只持所需设备/运行权限，不持整个公司管理员权。每个 Paperclip run/attempt 创建唯一 MXC 身份、Job、工作目录、独立公司 HOME 状态目录和浏览器关联；两个并行任务不复用可变 profile、容器身份或全局 cwd/env。一个 run 一个进程不等于一台设备一个任务，多组可并行。公司启动策略、批准 profile/插件清单与运行依赖只读，日志/会话/临时缓存单独可写；不能把安全配置放在任意代码可写目录，或自动加载工作区可改的配置去覆盖公司策略。布局与DSH解析优先级须预检，不能隔离就判失败。

DSH 主进程、内建文件工具及其受控子进程在同一外层原生边界内；明确只读运行依赖/批准 skills、可写该次工作目录/专用临时目录。其他任务、个人 HOME、浏览器默认 profile、公司秘密目录、其他盘及未批准共享路径不默认可读。所有权限授予由公司策略和员工设备授权取交集，不能把选中工作目录当全盘授权。

首轮测试只用假隐私标记，不触碰真实私人资料。员工保留本机管理员权限是已确认环境，正常 harness/工具仍须以受限权限运行；不要求员工交出整机管理权，也不因账号属于管理员组而关闭隔离。威胁模型覆盖不可信提示/文件/模型生成命令和受限执行内的恶意工具代码；不承诺抵御本机管理员主动篡改或已失陷宿主。公用 Bot 的设备及管理人均须有对应资料授权，UI 隐藏不能代替选机检查。安装/修复所需一次性系统授权独立说明，不成为持续提权、修改整盘 ACL 或管理员 harness 的许可。

DSH 自带 ACL 主要是写限制，不可与 MXC AppContainer 默认层层叠加：旧 Low-token/包 SID 与孙进程 stdio 限制可能导致工具不可用。公司固定 profile 只保留一种经过验证的 OS 执行边界；优先预检固定公司 profile 将内层 pwsh-sandbox 换为兼容的 pwsh-local 等 provider，保留文件写入检查、公司 native guards、审批与工具允许清单；不修改主 loop。默认 danger-full-access 会影响审批配置，不能用这个总开关代替逐项适配。不因某工具失败就退回外层未隔离的宿主执行，也不将 danger-full-access 当成功标准。

### 3.2 网络与模型凭证：明确最小方案的粒度

默认不开放任意互联网、内网和宿主 loopback 服务。模型出口只到受认证、按 run/租约/预算限定的公司模型通道；不能仅设置 HTTP_PROXY 后仍允许直连，也不能把整个 127.0.0.1 或私网当作模型服务。代理必须限定目标、模型协议与操作，不能成为通用 CONNECT/任意转发器；DNS、IPv6、重定向、WebSocket 和已建立连接的撤权均纳入负例。

最小 run 级方案允许同一隔离执行树中的 Python/Node 请求该 run 已获准的模型通道；这不是任意外网权限，但也不是“工具完全无网”或“网关凭证对子工具保密”。所有请求仍经中央鉴权、归属、限额和审计，不信任客户端自报的 task/run header；供应商原始 Key 从不下发。模型通道可访问的资料范围必须与 run 外发授权一致。若业务要求只有 DSH 而非工具代码可使用此通道，必须选择 §2 的独立工具域/broker 方案，不能靠提示词或环境变量隔离冒充满足。

MXC 网络规则是 IP/协议/端口级，不等于持久 DNS 域名或业务 L7 规则；域名、TLS、协议/方法与数据外发仍由模型/浏览器 broker 校验，不能只写一个域名白名单就宣称 OS 已拦截全部路径。

首轮不预设本机 HTTP 代理一定可行：先证明 MXC 精确 egress 或身份受限代理路径能只开放必要入口；任何为了接模型而同时开放其他本机服务的配置均失败。在线模型发现、辅助摘要/压缩、子 Agent 推理纳入同一契约；无独立归属的自动模型功能关闭。

浏览器单独具备受控站点权限、独立工作 profile 和 run 归属；不把浏览器网络能力授给整个任意代码域，不暴露通用 CDP/调试端口。优先复用已有浏览器驱动，受管理 broker 负责授权/文件出口/取消关联；具体组件与只读业务语义待预检，不能拿 DSH Windows Desktop 当通用 GUI 已完备。暂缓任意桌面软件操作的范围不变。

### 3.3 启停与标准流

采用 MXC V1 spawn 返回的 standardInput、standardOutput、standardError 对接 ACP；三个流及时取用/排空，再进入 wait。首轮不依赖 PTY 或 ProcessContainer 的复用容器 lifecycle API，官方 lifecycle 只覆盖其他后端。[V1 spawn](https://github.com/microsoft/mxc/blob/fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2/docs/api-reference/node/v1/api.md#L170-L175)、[进程句柄](https://github.com/microsoft/mxc/blob/fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2/docs/api-reference/node/v1/types.md#L447-L463)

取消顺序为停止新授权/模型请求，发 ACP cancel，关闭对应 session，限时等待，再由 supervisor 使用 MXC Job 终止整树并验证实际停止；独立浏览器/工具 broker 的 run 资源也要关闭对账。只收到取消 ACK、看到根 PID 消失、调用 kill 未报错或租约过期都不能作为整树停止证明。supervisor 崩溃/管道阻塞/重复取消也须覆盖。不得使用会先短暂运行后再入 Job 的竞态启动；未能纳入 Job 的进程不允许继续运行。

## 4. Paperclip 接入：已有接口不等于完整设备方案

### 4.1 复用外部 adapter，不伪装成原生 Runner

Paperclip 外部包的 createServerAdapter() / ServerAdapterModule 已有 execute、testEnvironment、sessionCodec；execute context 已包含 runId、taskKey/sessionParams、executionTarget、signal、onCancellationReady、onDispatch、onProviderStopped、onLog/onEvent/onUsage。优先映射这些契约，再补必要的设备派发协议，不造一套同义任务状态。[接口 L237–286、L508–521](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/adapter-utils/src/types.ts#L237-L286)

仅在可信确认 provider 停止后调用 onProviderStopped 以衔接收集，不能在未知超时调用。ctx 中的 authToken、agentIdentity、observability 等可能含服务端凭据，禁止把整个 context 序列化下发；设备只得到显式允许的运行描述和受限凭证。

必须补的窄边界：

| 单元 | 最小责任 | 不得冒充已有 |
|---|---|---|
| 远程运行 adapter | 将每次 run 的目标、取消信号、会话与结果关联到获准设备；准确声明工具/skill能力 | 内置 HTTP adapter 的 HTTP 200 不是远端任务完成；远端启动/结果/取消必须另有回执 |
| 设备监督/控制协议 | 出站认证连接、授权池选机、attempt/租约代次、幂等领取与启动、持久 outbox/游标、重连对账、隔离进程所有权 | 不自称继承 Runner PRP replay/finalization；不让 OpenMausBot/Runner/自家三方同时拥有同一进程 |
| 公司 DSH profile | 独立 HOME/config、固定插件/模型、ACP session 映射、最小工具与网关访问 | 个人凭据探测、默认模型回退、远程热装插件必须关闭；不重写 DSH loop |
| 公司模型回执桥 | 中央网关保存逐请求可恢复回执，关联 Paperclip run 并幂等记账 | ACP context 占用不等于消费，不能把 adapter 汇总和网关明细相加 |
| PCWS 节点传输/保存扩展 | Windows capture/restore、自动一致保存、可靠上传、中央条件发布、恢复验权 | 外部 task adapter 不会自动得到原生 workspace/snapshot 链；不能只删入口限制 |

内置 HTTP adapter 只发请求并按 HTTP 结果返回，没有完整远端结果/usage/session/取消契约。[固定实现](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/adapters/http/execute.ts#L14-L50)

### 4.2 ACP 与 SDK 的实际取舍

优先使用官方 @agentclientprotocol/sdk 1.4.0 的现成双向流客户端，版本与固定 DSH ACP 依赖一致；固定官方 SDK 样本 e6463f444093ed7c5f1cc937c3f32afb5853e906，Apache-2.0。[官方版本/许可](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/package.json#L1-L17)、[Node 双向流示例](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/src/examples/client.ts#L111-L133)。DSH ACP 控制面支持 session/new、prompt、cancel、close；DSH SDK 的固定 wire 没有 per-prompt cancel/session close，且 client 自行 spawn 进程、没有公开外部 launcher 注入。首轮 ACP＋MXC stdio 少一层启动器改造，不复制 OpenMausBot 的通用 ACP core 或手写 JSON-RPC。[DSH ACP 依赖](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/acp/acp/package.json)、[SDK 限制](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/sdk/protocol/README.md#L138-L142)

一个 attempt 独立进程和会话，逻辑 Agent 可同时有多个 attempt；会话绑定 company/Agent/taskKey/run/设备/工作区/profile/model。换机默认从公司保存点新建会话，不复制旧进程。用户审批/问答由 morchat 关联 run 和审批状态；ACP 未暴露的 DSH UI/plan/question 能力不宣称已经接入。无支持的交互必须可见阻塞，不能默认批准。

ACP cancel 只停止当时 prompt-owned 活动，后续子消息仍可能引起工作；close 才进行后代 drain 和持久化清理。两者都不能替代 OS 进程树和外部效果证明。[取消/关闭合约](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/acp/acp/README.md#L60-L82)

### 4.3 成本与权限不是“接上 ACP 就有”

固定 DSH ACP usage_update 仅表达上下文 tokenMeter 的 used/size，prompt 返回 stopReason；不能当作逐请求输入/输出 token 或实际费用。公司网关回执对接 Paperclip cost_events 的 heartbeatRunId、providerRequestId、idempotencyKey、receiptHash 等字段；公司＋幂等键约束用于去重。adapter 的估算/显示信息不得再次入账。取消/重试/撤销设备后的真实费用仍要可对账，未知标未知，不能记零。[ACP usage 源码](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/acp/acp/src/updates.ts#L87-L101)、[Paperclip 成本模型](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/cost_events.ts#L15-L45)

DSH 已有 llm-pi-ai/request-headers 钩子用于不进入模型上下文的请求元数据，异常可在 dispatch 前停止，但不涵盖 model discovery；显式 apiKeyEnv 引用与独立公司配置避免个人回退。钩子是集成点，不是授权权威：网关从受限凭证决定真实归属，不信任任意客户端 header。[官方模型适配扩展](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/llm/llm-pi-ai/README.md#L147-L152)

Paperclip 已有 run 查询、事件游标和取消 API，但固定取消路由是 Board-only。员工操作必须先由企业资源权限校验，再经受控服务或必要的最小权限扩展代理，原始 Board/管理员 token 不下发、不通过共享身份绕过部门限制。[取消路由](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/agents.ts#L7179-L7195)

### 4.4 PCWS 是本路线必须单独补齐的接口

固定 shouldUseRemoteWorkspaces 绑定 paperclip_runner＋sandbox；transport 又要求 remote+sandbox、execute/syncIn/syncOut 并排除 runnerTask，含 POSIX 路径假设。因此不能声称新外部 adapter 可零改动复用整个快照入口。[资格条件](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspaces.ts#L62-L73)、[transport](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspace-transport.ts#L11-L41)

保留 PCWS 归档格式、Git refs/objects/HEAD/index/dirty 清单、哈希、对象存储和中央版本事实。拟增加明确的授权节点 capture/restore/transport 能力及支持入口；上传后仍走现有 epoch/writerRunId/parentSnapshotId 条件事务，不跨库写表、不另建任务或版本权威。[发布事务](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspaces.ts#L553-L595)

保留一致写边界、事件触发/周期兜底、不可变暂存和中央提交确认；文件稳定读取或 session JSONL 持久化不能代替多文件一致截面。若该版本没有可用公开扩展面，要显式评审最小上游补丁/维护分支；禁止既声称完全不改 Paperclip，又声称原生 PCWS 已接通。快照扩展或正确性证明未完成则 NG-06 BLOCKED，不开始计分 DV。

## 5. 复用清单与不要重造的部分

| 组件 | 复用结论 | 还缺什么 |
|---|---|---|
| MXC 正式 SDK＋Windows 原生隔离/Job | 直接消费优先；不自写 token/Job/文件系统或 WFP 驱动 | 公司策略、实际 tier 检查、stdio/DSH/Python/Node/浏览器组合验收；配额不因有 Job 自动具备 |
| DSH loop、模型适配、ACP、会话持久化 | 复用，固定 profile/插件版本 | 公司凭据、审批/事件映射、外层隔离兼容；会话日志不是公司文件保存点 |
| 官方 ACP SDK | 复用流与协议实现，Apache-2.0 | run/session 生命周期与审批映射；依赖 lock、notice 随分发核查 |
| DSH Win32 process 包 | 有 suspended→Job→resume 与活动进程检查的可用基础 | 若外层 MXC 已拥有生命周期，不再并列创建第二个主监督器；其他直接 spawn 路径也需外层覆盖 |
| OpenMausBot | 抽取/参考原生安装、引擎目录、诊断、ACP兼容经验 | 旧 DSH driver 是 0.2.1-rc.2；个人 HOME/模型 fallback、taskkill 宽松成功不能照搬；不抽整套后台 |
| Paperclip | 保留任务/run/skill/预算/成本/PCWS中央事实 | 远程节点协议、身份/取消代理和显式快照入口扩展 |

DSH 普通 hook 插件不一定失败关闭，Node 插件还能自行 I/O/spawn；tools/pre-execute 不覆盖这些路径。[fs读取与修改fence](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/fs/fs-sandbox/src/index.ts#L1-L24)、[hook失败行为](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/experimental/hook-protocol/README.md#L34-L48)、[DSH Win32进程原语](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/subprocess/win32-process/README.md#L27-L33)。公司批准插件是可信计算基的一部分，禁止运行期任意安装和自动放宽配置；外层隔离必须覆盖它们。经验 skill 的自动沉淀与高权限执行插件发布分别治理。

新组件的许可、原生包完整性/签名、分发与升级回滚均须清单化；正式 SDK、官方测试和固定源码是复用证据，不是本项目运行结果。首轮不自建第二 agent loop、ACP栈、任务库、成本总账、通用低代码工作流或通用虚拟化平台。

## 6. 最小证伪条件（WI）

所有用例用合成资料与专用原生设备；正常路径和反例都必须实测，不用单次截图或模型自报作证。下列只细化组件/接入门禁，自动保存/双设备故障参数仍以 [DUAL-DEVICE-VALIDATION](D:/dev/morchat.co/docs/DUAL-DEVICE-VALIDATION.md) 为唯一来源。

| 编号 | 必测与明确判失败条件 | 关联 |
|---|---|---|
| WI-01 平台/降级 | 每台记录 OS/包摘要、实际 tier、请求策略与警告；不支持时仍运行、自动 DACL/BFS/VM 回退、audit/无隔离模式或管理员 harness 才可用，均失败 | NG-01/02 |
| WI-02 文件与凭据 | DSH 内建 filetools、Python/Node、插件/MCP路径分别尝试私密假标记、其他run/HOME/profile/凭据；路径替换、junction/symlink/hardlink、已开句柄逃逸；任一越权读写即失败 | NG-02 |
| WI-03 网络与外发 | 直连供应商、其他域/IP、IPv6/DNS/UDP、内网、宿主服务、重定向/CONNECT/代理复用均拒；允许的模型route有准入与计量；工具可达范围与选定run级/工具级策略不符即失败 | NG-02/04 |
| WI-04 生命周期 | 创建与Job绑定各切点、supervisor/DSH崩溃、取消/超时/休眠唤醒、迟到子消息；取消只凭ACK/PID退出报成功、仍有有效动作或误杀另一run，失败 | NG-03 |
| WI-05 原生工具与并行 | 同机至少两个run独立身份/profile/workspace，真实ACP双向流、Python/Node与受控浏览器能跑；只能串行、靠无限权限、日志饱和阻塞取消，失败 | NG-01/02/03/06、DC |
| WI-06 派发/授权 | 重复派发、启动许可ACK丢失、重连乱序、错误设备/部门/会话、撤权后旧审批/旧代次继续生效；重复启动或越权读/取消/提交任一出现即失败 | NG-06、DC |
| WI-07 模型/费用 | Chat Completions与Messages真实工具循环；公司配置缺失、个人Key残留、发现/辅助请求、断流取消重试；个人回退、ACP占用当账、重复/丢失费用或未知记零均失败 | NG-04 |
| WI-08 保存/接续 | Git脏状态及普通文件无需人工提交，真实中央确认后另一Win恢复；task-only代替PCWS、混合文件版本、旧代次发布成功、原机必须在线或靠手动补传均失败 | NG-05/06、DV、WC |
| WI-09 幂等与未知效果 | 只断控制通道而模型/工具仍通、已提交效果保存未成、浏览器未知动作；旧机继续有效共享写、未知效果被新attempt重放或把租约到期当已终止，失败 | DC、WC、R1/R2 |
| WI-10 分发/策略 | 固定版本/插件/公司profile，清洁账号无个人CLI/Key；热更新绕审、任意代码改写公司profile或加载工作区配置覆盖策略、私自替换模型或插件、更新后不复验受影响边界，失败 | NG-01、工程发布 |

失败否决的是当前组件组合或实现路径，不自动否决“人和 AI 公司协作”这个需求。可以在原约束内修复并复测；若只有扩大权限、隐藏损失、全局串行、VM或服务器代跑才能成立，当前候选方案被否决，提交替代路线或明确范围变更，不能移到上线后再解决。

## 7. 最小补齐顺序与当前状态

本节是组件接入顺序；总体放行以 [Discovery G0–G5](D:/dev/morchat.co/docs/DISCOVERY-BASELINE.md) 为准。版本生效 G2 和权限撤销 G3 是计分双设备 G4 的前提，不能等保存演示成功后才补；各套门禁共用同一 fixture/证据链。

1. **范围/契约冻结：**确认两台 Windows build、候选发行物、模型协议与选定出口粒度。源码只读核查不能证明实际 tier/stdio；真实启动与策略预检必须在另获授权的下一步实施，不要求尚未建设的 PCWS 桥已通过。
2. **另行实施授权后做隔离纵向切片：**公司 supervisor＋MXC＋官方 ACP＋一个 DSH；先 WI-01–05 与模型准入负例，证明原生工具和同机并行，不先做整套客户端界面。
3. **补中央接入：**外部 adapter、设备授权/领取/取消/事件 outbox、公司模型回执；验证 WI-06/07/09/10，保持唯一任务/成本账。
4. **补 PCWS 节点扩展与自动保存：**中央事务不变，补 Windows capture/restore/transport、一致边界与补传；完成 WI-08 及 NG-01–06 全部门禁。
5. **再做双 Windows 故障规程：**W1→W2、W2→W1 的 DV-01–08，随后完整 DC/WC 和规模/发布门禁；Mac 后续单独评审，不阻塞首轮。

本轮仍是讨论稿；上述“补齐”不是已经编写代码，也不表示固定时间内必能完成。最需要先证伪的是：MXC 下完整 DSH 与其工具的原生可用性、精确模型出口不扩大本机权限、以及 Paperclip 快照扩展能否保留原有事务/保存语义。没有实测证据前，均保持 NOT RUN 或因缺口 BLOCKED，不新增 PASS。

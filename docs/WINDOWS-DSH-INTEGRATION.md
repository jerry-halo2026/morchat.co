---
purpose: "Windows 原生 DSH：Multica 官方路径与隔离验证"
owner: b05-runtime
status: current
updated: 2026-11-06
related:
  - docs/REFERENCE-REUSE.md
  - docs/DUAL-DEVICE-VALIDATION.md
  - docs/DISCOVERY-BASELINE.md
---
# Windows 原生 DSH：Multica 官方路径与隔离验证

> **2026-11-06 当前基线：Multica 是统一客户端/后台及唯一 task/run/调度权威；DSH 完整 harness 在员工 Windows 本机运行，云模型经公司网关调用。** Paperclip 只作治理参考或经许可/依赖/安全审查后的独立源码候选，不要求其 remote adapter、Runner 或 PCWS；OpenMausBot 仅作协作参考，不导入 runtime。Multica 原生 Web @→本地 DSH 文件/回复/token 已实测通过；自动归档失败、手动上传通过、匿名 uploads 返回 200 是 P0 失败，不能称端到端通过。企业隔离/权限/自动保存/接续仍待验证。

> 本文是接入/隔离评审与 WI 门禁，不是已完成实现。两台 Windows 11 x64 原生设备首轮、Mac 预备；已有功能实验不等于授权生产故障、修改整机安全或全量开发。正式 WI/NG/DV 仍未通过。

## 1. 当前分层与唯一权威

| 层 | 本轮归属 | 不能混同 |
|---|---|---|
| 统一客户端/后台与任务调度 | Multica 唯一 task/run/调度；企业组织/权限/版本/预算缺口在该底座补齐 | 不并列 Paperclip 控制面、任务库或调度器 |
| 本地接入 | 优先 Multica 官方 daemon 的 DSH 路径，核查实际生命周期/事件接口 | 不预设有设备池、租约或企业保存机制 |
| Agent harness | 员工 Windows 本机完整 DSH 模型—工具循环 | 不是中央 loop，不是云端模型，不是安全沙箱 |
| 安全隔离 | MXC 等原生组件仅是候选 | 必须证明完整执行域、文件/网络/进程边界与官方路径兼容 |
| 模型/数据/日志/治理 | 公司中央模型网关持 Key、控制与资产持久化，模型云端 | 公司 Key 不进入通用 harness；无云端 harness 兜底 |

管理员员工权限不传给 Agent，公司不接管整机。个人 Bot 默认本人设备；公用 Bot 只选设备及管理人均获对应资料授权的设备。无合格在线设备明确等待，全关机停止；同机独立任务可并行，互斥只落在冲突资源。

当前主链固定源码与官方 bundle SHA、JSONL v1 driver 以 [REFERENCE-REUSE §1–2](REFERENCE-REUSE.md) 为证据入口；实际安装发行物和 Windows 隔离组合另行锁定，不能拿历史 ACP 研究样本替代。

## 2. 优先路径与隔离候选

**优先验证组合：Multica 统一客户端/后台 → 官方 daemon 的 DSH 入口 → 员工 Windows 本机完整 DSH → 公司模型网关 → 云模型。** 已验证原生 Web @、本地文件、回复/token；这只证明功能可达。不得先引入 Paperclip remote adapter/PCWS，也不得从 OpenMausBot 导入 runtime。ACP 是可选控制协议，不是该路径必需前置。

先核查官方 daemon 的 DSH 启动与监督接口是否能纳入完整 OS 隔离；不能因已有 SDK 就宣称兼容。MXC ProcessContainer 是优先研究候选而非既定生产依赖，以下具体版本/策略均须实测。

| 候选 | 取舍 | 未通过时 |
|---|---|---|
| 整个 DSH 执行域置于原生隔离，run 内共享最低授权 | 同时约束内建读取与工具；工具可能可用本 run 模型通道 | 先冻结权限粒度，不冒称工具完全无网 |
| DSH＋独立无网代码工具域/broker | 可进一步限制工具模型出口；须堵住全部 exec/插件旁路 | 无可信全覆盖则不放行，不靠删环境变量 |
| 仅 DSH 自带 ACL 或只隔离 shell | 读取、网络、插件/spawn 未充分覆盖 | 不满足上线边界 |
| ACP＋官方 SDK | 若官方 daemon 路径实际需要则单独评估，不重写协议 | ACP cancel/usage 不可冒充整树终止/计费 |

### 2.1 版本与 Windows 入池前提

- 历史参考（非运行依赖）Paperclip 固定研究样本：40ea7a9b8994e9bdb3d13794b5847388be0f7a92；OpenMausBot：597e70d7930db632747acfb4ea047ca520bd958c；DSH：fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159。实际包/安装发行物还需锁摘要，不将研究 commit 当已安装版本。
- MXC 使用正式 [v1.0.1](https://github.com/microsoft/mxc/releases/tag/v1.0.1) 为验证候选，固定源码 fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2，V1 schema 1.0.0；Node 入口 @microsoft/mxc-sdk/v1。核心 MIT，分发仍核对依赖、原生二进制与第三方 notice。
- 若选择该 MXC 组合，首轮建议两台都选 Windows 11 25H2 x64、build 不低于 26200.9550，并在执行前冻结实际完整 build；这是为减少 OS 差异和覆盖所需 loopback 能力的建议，不是声称所有 Windows 11 支持。[固定支持表](https://github.com/microsoft/mxc/blob/fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2/docs/backends/process-container/os-version-support.md) 将 25H2 Process Isolation 的最低项列为 26200.9278；后续补丁和具体策略仍需逐机 probe。
- 该 MXC Node SDK 原生标准流要求采用 [官方 quickstart](https://learn.microsoft.com/en-us/windows/apps/develop/mxc/quickstart) 支持的 Node 24.21.0+（24 系列）或 26.8.0+；首轮建议受管理 Node 24 系列兼容版本，经 DSH 与原生依赖共同验证后锁定。不能凭 package 的粗略 engines 字段继承员工任意 Node。
- 若选择上述 MXC 候选组合，固定 containment=ProcessContainer，仅用原生进程后端；不自动切 WSLc、Windows Sandbox、VM 或不同用户桌面会话来凑通过。MXC 的 Container 是抽象名称，不意味着本方案使用虚拟机/镜像。
- 对该 MXC 候选组合逐机检查有效后端、文件/网络策略及 live stdio 能力，此组合的首轮只接受预检确认的 PSEC/BaseContainer 路径。禁止 DACL mutation fallback；其他降级也不能只凭“isSupported=true”放行。AppContainer/DACL 回退可能需管理员 host-prep、修改宿主 ACL及每次开机重做 NUL 准备，本轮不静默采用。[平台支持](https://learn.microsoft.com/en-us/windows/apps/develop/mxc/platform-support)
- 不组合不存在的能力：固定 MXC 的 PSEC/BaseContainer 不支持 LPAC 开关；手写 CreateProcessInSandbox 是实验接口，不自建其替代封装。缺少能力时报告不支持并停止，不自动以管理员身份运行完整 harness。

## 3. Windows 的最小权限边界（MXC 方案待验证）

### 3.1 覆盖整个执行域，不只拦一条 shell 命令

若采用 MXC，官方 daemon 接入/最小 supervisor 必须明确唯一进程所有权，保留公司授权、所选控制协议、网关/资产连接与 MXC 生命周期；现有官方路径是否支持尚待验证。它只持所需设备/运行权限，不持整个公司管理员权。每个 Multica run/attempt 创建唯一 MXC 身份、Job、工作目录、独立公司 HOME 状态目录和浏览器关联；两个并行任务不复用可变 profile、容器身份或全局 cwd/env。一个 run 一个进程不等于一台设备一个任务，多组可并行。公司启动策略、批准 profile/插件清单与运行依赖只读，日志/会话/临时缓存单独可写；不能把安全配置放在任意代码可写目录，或自动加载工作区可改的配置去覆盖公司策略。布局与DSH解析优先级须预检，不能隔离就判失败。

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

若选择 MXC＋ACP，可用 V1 spawn 返回的 standardInput、standardOutput、standardError 对接 ACP；三个流及时取用/排空，再进入 wait。首轮不依赖 PTY 或 ProcessContainer 的复用容器 lifecycle API，官方 lifecycle 只覆盖其他后端。[V1 spawn](https://github.com/microsoft/mxc/blob/fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2/docs/api-reference/node/v1/api.md#L170-L175)、[进程句柄](https://github.com/microsoft/mxc/blob/fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2/docs/api-reference/node/v1/types.md#L447-L463)

取消顺序为停止新授权/模型请求，按实际协议取消/关闭对应 session（ACP 分支才发 cancel/close），限时等待，再由 supervisor 使用 MXC Job 终止整树并验证实际停止；独立浏览器/工具 broker 的 run 资源也要关闭对账。只收到取消 ACK、看到根 PID 消失、调用 kill 未报错或租约过期都不能作为整树停止证明。supervisor 崩溃/管道阻塞/重复取消也须覆盖。不得使用会先短暂运行后再入 Job 的竞态启动；未能纳入 Job 的进程不允许继续运行。

## 4. Multica 接入：已实测功能与企业缺口分开

### 4.1 官方 daemon 优先，不引入第二调度

| 边界 | 必须验证/补齐 | 不能声称已有 |
|---|---|---|
| task/run 与本地执行 | 唯一 Multica 身份、设备目标、幂等领取/启动、事件及取消回执 | 一次 @ 回复不证明设备池、防重与取消正确 |
| 设备权限 | 出站认证、设备及管理人资料双授权、attempt/epoch、有效租约与重连对账 | daemon 注册不等于有权读取任何任务资料 |
| DSH 公司 profile | 独立 HOME/config、固定引擎/插件/模型、任务/session/工作区关联 | 不回退个人凭据、默认模型或未授权插件 |
| 人工介入 | 追问/工具许可/补充的持久关联与消费回执；unsupported 可见 | 不把 Paperclip 的交互 API/原生 steer 改名当现成 |
| 模型用量 | 网关逐请求回执、任务归属、防重、迟到/失败用量对账 | token 展示不是完整费用/预算闭环 |
| 自动保存 | 一致采集、可靠上传、权威条件发布、恢复验权 | 手动上传、daemon/session JSONL 不等于自动保存点 |

本地只保有界队列/缓存，不成为第二任务权威。服务端管理员凭据不整体序列化下发；只下发明确受限的任务/设备授权。取消/撤销后，迟到证据进入隔离核对，不复活执行权。

### 4.2 ACP / SDK 是可选接入证据

固定 DSH 官方 SDK/ACP 均是已有控制接口，不应重写 agent loop；实际官方 daemon DSH 路径优先。若选择 ACP，可复用官方 @agentclientprotocol/sdk 1.4.0（固定样本 e6463f444093ed7c5f1cc937c3f32afb5853e906，Apache-2.0），但须锁版本并验证生命周期。[官方 SDK](https://github.com/agentclientprotocol/typescript-sdk/blob/e6463f444093ed7c5f1cc937c3f32afb5853e906/package.json)

历史固定 DSH 样本 fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159 的 SDK wire 未提供 per-prompt cancel/session close，客户端自行 spawn 且无公开外部 launcher 注入；不推断新版或 daemon 永远没有，也不能假设已有 MXC seam。[固定 SDK 限制](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/sdk/protocol/README.md#L138-L142)

ACP cancel 只停当时 prompt-owned 活动，close 才进行后代 drain/清理；两者都不替代 OS 整树与外部效果证明。usage_update 是上下文 tokenMeter used/size，不是逐请求输入/输出 token 或实际费用。[ACP 合约](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/acp/acp/README.md#L60-L82)、[usage 源码](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/acp/acp/src/updates.ts#L87-L101)

### 4.3 公司模型与用量

公司 Key 只在中央网关/秘密服务，DSH 使用绑定 task/run/设备/模型/租约的短期凭证；个人 HOME/账号回退、未纳管发现/辅助请求和直连均禁止。公司 Key 不进入通用 harness。账号/设备撤销立即拒绝新的网关准入，在途请求仍对账。

统一用量记录关联 Multica task/run，固定唯一入账粒度与来源；原生事件、daemon 汇总和网关明细不能相加重复计费。支持真实请求 ID/回执哈希/幂等键等语义并不表示 Multica 已有同名字段，须核查映射。未知金额保留 pending/unpriced，不写零。公司预算、逐部门权限与取消授权尚待验证。

### 4.4 自动保存：协议必需，PCWS 非必需

必须实现：受管理安全边界 → 不可变内容/清单 → 校验和受保护保留引用 → Multica 权威端条件发布当前 epoch、父保存点、任务版本与授权 → 可查询回执。先上传对象再发布指针，不假装跨库事务，未确认不显示“公司已保存”。恢复在新尝试空目录校验后激活；旧 epoch 在提交生效处拒绝，冲突保留，副作用先对账。

Paperclip PCWS 的 Git refs/objects/HEAD/index、哈希、epoch/writerRunId/parentSnapshotId 事务仅是固定源码研究证据/独立提取候选。它依赖 runner/sandbox 等入口，不能直接改名为 Multica 已有能力；采用与否独立评审，不作为产品运行依赖。[历史发布事务](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspaces.ts#L553-L595)

自动触发、补传、Git 脏状态与普通文件完整恢复未证实则 NG-06 BLOCKED，不计分 DV；匿名 uploads 200 必须修复并通过权限负例后才能放行。

## 5. 复用清单与不要重造的部分

| 组件 | 复用结论 | 还缺什么 |
|---|---|---|
| MXC 正式 SDK＋Windows 原生隔离/Job | 直接消费优先；不自写 token/Job/文件系统或 WFP 驱动 | 公司策略、实际 tier 检查、stdio/DSH/Python/Node/浏览器组合验收；配额不因有 Job 自动具备 |
| DSH loop、模型适配、ACP、会话持久化 | 复用，固定 profile/插件版本 | 公司凭据、审批/事件映射、外层隔离兼容；会话日志不是公司文件保存点 |
| 官方 ACP SDK | 可选协议实现，Apache-2.0；非必需依赖 | run/session 生命周期与审批映射；依赖 lock、notice 随分发核查 |
| DSH Win32 process 包 | 有 suspended→Job→resume 与活动进程检查的可用基础 | 若外层 MXC 已拥有生命周期，不再并列创建第二个主监督器；其他直接 spawn 路径也需外层覆盖 |
| OpenMausBot | 仅协作交互参考，不导入 runtime/驱动 | 历史安装/driver 仅证据，不能成为运行依赖 |
| Paperclip | 治理参考/独立源码候选，无运行权威 | 许可/依赖/正确性审查，不要求 remote adapter 或 PCWS |

DSH 普通 hook 插件不一定失败关闭，Node 插件还能自行 I/O/spawn；tools/pre-execute 不覆盖这些路径。[fs读取与修改fence](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/fs/fs-sandbox/src/index.ts#L1-L24)、[hook失败行为](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/experimental/hook-protocol/README.md#L34-L48)、[DSH Win32进程原语](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/subprocess/win32-process/README.md#L27-L33)。公司批准插件是可信计算基的一部分，禁止运行期任意安装和自动放宽配置；外层隔离必须覆盖它们。经验 skill 的自动沉淀与高权限执行插件发布分别治理。

新组件的许可、原生包完整性/签名、分发与升级回滚均须清单化；正式 SDK、官方测试和固定源码是复用证据，不是本项目运行结果。首轮不自建第二 agent loop、ACP栈、任务库、成本总账、通用低代码工作流或通用虚拟化平台。

## 6. 最小证伪条件（WI）

所有用例用合成资料与专用原生设备；正常路径和反例都必须实测，不用单次截图或模型自报作证。下列只细化组件/接入门禁，自动保存/双设备故障参数仍以 [DUAL-DEVICE-VALIDATION](DUAL-DEVICE-VALIDATION.md) 为唯一来源。

| 编号 | 必测与明确判失败条件 | 关联 |
|---|---|---|
| WI-01 平台/降级 | 每台记录 OS/包摘要、实际 tier、请求策略与警告；不支持时仍运行、自动 DACL/BFS/VM 回退、audit/无隔离模式或管理员 harness 才可用，均失败 | NG-01/02 |
| WI-02 文件与凭据 | DSH 内建 filetools、Python/Node、插件/MCP路径分别尝试私密假标记、其他run/HOME/profile/凭据；路径替换、junction/symlink/hardlink、已开句柄逃逸；任一越权读写即失败 | NG-02 |
| WI-03 网络与外发 | 直连供应商、其他域/IP、IPv6/DNS/UDP、内网、宿主服务、重定向/CONNECT/代理复用均拒；允许的模型route有准入与计量；工具可达范围与选定run级/工具级策略不符即失败 | NG-02/04 |
| WI-04 生命周期 | 创建与Job绑定各切点、supervisor/DSH崩溃、取消/超时/休眠唤醒、迟到子消息；取消只凭ACK/PID退出报成功、仍有有效动作或误杀另一run，失败 | NG-03 |
| WI-05 原生工具与并行 | 同机至少两个run独立身份/profile/workspace，所选官方路径的真实双向事件流、Python/Node与受控浏览器能跑；只能串行、靠无限权限、日志饱和阻塞取消，失败 | NG-01/02/03/06、DC |
| WI-06 派发/授权 | 重复派发、启动许可ACK丢失、重连乱序、错误设备/部门/会话、撤权后旧审批/旧代次继续生效；重复启动或越权读/取消/提交任一出现即失败 | NG-06、DC |
| WI-07 模型/费用 | Chat Completions与Messages真实工具循环；公司配置缺失、个人Key残留、发现/辅助请求、断流取消重试；个人回退、ACP占用当账、重复/丢失费用或未知记零均失败 | NG-04 |
| WI-08 保存/接续 | Git脏状态及普通文件无需人工提交，真实中央确认后另一Win恢复；只跑任务/上传文件冒充完整保存点、混合文件版本、旧代次发布成功、原机必须在线或靠手动补传均失败 | NG-05/06、DV、WC |
| WI-09 幂等与未知效果 | 只断控制通道而模型/工具仍通、已提交效果保存未成、浏览器未知动作；旧机继续有效共享写、未知效果被新attempt重放或把租约到期当已终止，失败 | DC、WC、R1/R2 |
| WI-10 分发/策略 | 固定版本/插件/公司profile，清洁账号无个人CLI/Key；热更新绕审、任意代码改写公司profile或加载工作区配置覆盖策略、私自替换模型或插件、更新后不复验受影响边界，失败 | NG-01、工程发布 |

失败否决的是当前组件组合或实现路径，不自动否决“人和 AI 公司协作”这个需求。可以在原约束内修复并复测；若只有扩大权限、隐藏损失、全局串行、VM或服务器代跑才能成立，当前候选方案被否决，提交替代路线或明确范围变更，不能移到上线后再解决。

## 7. 最小补齐顺序与当前状态

本节是组件接入顺序；总体放行以 [Discovery G0–G5](DISCOVERY-BASELINE.md) 为准。版本生效 G2 和权限撤销 G3 是计分双设备 G4 的前提，不能等保存演示成功后才补；各套门禁共用同一 fixture/证据链。

1. **范围与官方路径冻结：**核对两台 Windows build、Multica daemon/DSH 发行物、模型协议与出口粒度，不要求尚未建设的保存桥先通过。
2. **隔离纵向切片：**先核查官方 DSH 启动/监督 seam，再验证所选隔离组件覆盖完整执行域；WI-01–05 及模型准入负例，不引入第二 runtime 或默认 ACP。
3. **企业接入：**在 Multica 唯一权威下补设备授权/领取/取消、epoch、事件 outbox、模型回执，验证 WI-06/07/09/10。
4. **自动保存/恢复：**验证一致边界、可靠上传与权威条件提交，完成 WI-08 和全部 NG；PCWS 非必需。
5. **双 Windows 故障：**完成 W1→W2/W2→W1 DV-01–08，再做完整 DC/WC 与规模门禁；Mac 不阻塞首轮。

C05/B05 runtime、C06/B06 派发、C07 接续/B07 保存、C08/B08 模型用量以 Discovery 为准。所有生产补齐仍待验证，官方功能可达不能代替隔离/权限/保存/接续验收。撤权后停止新准入，在线受控缓存清理留证；离线不能承诺立即抹除，不清员工私人范围。

### 功能实验与历史证据（只读）

Multica 当前实验是原生 Web @→本地 Windows DSH 文件/回复/token 实测通过；自动归档失败、手动上传通过、匿名 uploads 200 为 P0 失败，端到端未通过。详见 [Multica 实验](../experiments/multica-spike/README.md)。

早期 Paperclip 首页/显式测试桥与 DSH 的实验仅为历史证据，不再作为唯一界面或产品执行路线；不把其原生 cost_events/heartbeat 记账机制套给 Multica。详见 [历史 integration-spike](../experiments/integration-spike/README.md)。两个实验目录及 D:/dev/refs 均只读，本文迁移不改实验/参考/产品代码。

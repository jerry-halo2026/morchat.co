---
purpose: "原生双设备运行与 Harness 选型核查"
owner: b05-runtime
status: reference
updated: 2026-11-06
related:
  - docs/WINDOWS-DSH-INTEGRATION.md
  - docs/REFERENCE-REUSE.md
  - docs/DUAL-DEVICE-VALIDATION.md
---
# 原生双设备运行与 Harness 选型核查

> **2026-11-06 当前基线：Multica 是统一客户端/后台及唯一 task/run/调度权威；DSH 完整 harness 在员工 Windows 本机运行，云模型经公司网关调用。** Paperclip 只作治理参考或经许可/依赖/安全审查后的独立源码候选，不要求其 remote adapter、Runner 或 PCWS；OpenMausBot 仅作协作参考，不导入 runtime。Multica 原生 Web @→本地 DSH 文件/回复/token 已实测通过；自动归档失败、手动上传通过、匿名 uploads 返回 200 是 P0 失败，不能称端到端通过。企业隔离/权限/自动保存/接续仍待验证。

> 历史静态核查保留固定源码及版本证据，不是当前实施规范。两台 Windows 11 x64 首轮，Mac 预备；不以 VM/WSL/Docker 或中央代跑为使用前提。所有 NG/DV 正式门禁仍 NOT RUN；功能实测与门禁分开。

## 1. 当前结论与验证路线

**Multica 统一客户端/后台和唯一 task/run/调度，官方 daemon 的 DSH 路径优先。** DSH 完整 loop 在员工 Windows 本机，模型云端、Key 在公司网关。员工管理员权限不等于 Agent 权限；不接管整机。个人 Bot 默认本人设备，公用 Bot 要设备及管理人均有对应资料权；同机独立任务可并行，只有冲突资源局部互斥。无合格在线设备明确等待，全关机停止，不设云端 harness 兜底。

| 路线 | 当前处理 |
|---|---|
| Multica 官方 daemon＋DSH | 优先。原生 @/文件/回复/token 已验证；隔离、模型治理、自动归档/恢复尚未通过 |
| ACP / DSH SDK | 可选控制接口，取决于官方路径的真实接口与缺口；不强制 ACP，不重写 loop |
| MXC 等 Windows 原生隔离 | 候选组件；完整执行域、真实 build/tier、启动/取消、文件与网络策略须实测，不假定 daemon 已有注入 seam |
| Codex App Server | 同层对照/备选，不同时建设第二引擎 |
| 旧 Paperclip A/B/C 接入方案 | 当前作废；只保留历史固定源码证据，不要求 remote adapter/Runner/PCWS |

P0 顺序：核查官方路径与原生/模型协议 → 冻结一个引擎、载体和发行物 → 经授权补齐最薄企业契约 → NG-01–06 → 双向 DV。NG-06 是真实 Multica 任务关联/保存链验收，不要求建设前已完成。无法满足原生、权限、自动保存和并行则修正/重选，不降低门槛。

DeepSeek、MiniMax、Qwen、GLM、Kimi 是目标供应商范围，不是全部型号通过清单；具体型号/协议、外发权限与费用逐项核验。详见 [Windows DSH 接入](WINDOWS-DSH-INTEGRATION.md)。

DSH 内建读取不受写 fence 完整限制；ACP cancel 不是整树终止、usage_update 不是费用；固定 SDK launcher seam 的限制仅适用于固定样本。不能把官方功能可达、插件钩子或独立 HOME 视为隔离证明。

### 版本证据而非安装指令

- Paperclip：40ea7a9b8994e9bdb3d13794b5847388be0f7a92；其 runner 依赖 @openai/codex 0.160.0。该值是兼容候选，不是已经完成 Windows 验证的锁版。
- OpenMausBot：597e70d7930db632747acfb4ea047ca520bd958c；DeepSeek driver 自述核验的是 @deepseek-ai/dsh 0.2.1-rc.2（2026-10-22），不是下述新样本。
- DeepSeek Harness：官方 deepseek-ai/deepseek-harness，读取 master 当时提交 fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159（2026-11-04，合入 0.2.2-rc.1 分支）。提交、npm 包与 Desktop 安装包不是同一交付物；执行前核对实际版本/摘要，不混用旧驱动验证结论。
- 两端 OS build、架构、引擎/Node/Python/Git、浏览器工具、gateway、adapter 与安装包摘要均在执行前记录；不使用 latest 自动漂移。

## 2. 历史证据：Paperclip Runner 的原生缺口（非实施路线）

下表仅解释旧方案为何不能直接使用，针对固定源码，不将没发布、没验证和明确拒绝混为一谈。表内适配项是当时研究判断，不构成当前建设任务；当前不部署该 Runner，也不要求补其 Windows transport。

| 层次 | 证据与判定 | 对本项目的处理 |
|---|---|---|
| 发布 | [release-runner-targets](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/paperclip-runner/release-runner-targets.json) 仅 darwin/linux；[README L311–315](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/paperclip-runner/README.md#L311-L315) 明确 Windows CI 不资格认证 Agent 运行 | Windows 原生发布、安装与真实任务都要验；macOS arm64 有发布目标仍不是双机恢复证据 |
| ACPX | [installation-integrity L559–567](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/paperclip-runner/src/drivers/acpx/installation-integrity.ts#L559-L567) 缺 atomic no-follow 而拒绝 win32；codex-runtime-adapter 同样拒绝 | 首轮不从 ACPX 绕路，不删除检查冒充支持 |
| 可信启动与进程树 | [process_supervisor L975–1014](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/paperclip-runner/runner/crates/runner-core/src/process_supervisor.rs#L975-L1014) verified launch 只有 Linux/macOS；[L1238–1266](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/paperclip-runner/runner/crates/runner-core/src/process_supervisor.rs#L1238-L1266) 非 Unix 仅 kill 主进程 | 子孙进程可能仍在；R2 必须有可信整树终止证据，R1 仍要隔离所有共享效果 |
| 直接 Codex 分支 | [codex_provider L1053–1083](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/paperclip-runner/runner/crates/runner-core/src/codex_provider.rs#L1053-L1083) 区分直接 Codex 普通受管理启动与 OpenCode verified launch | 不能写所有 Codex 在 Windows 必然启动失败；实际问题是发布、生命周期及端到端资格未成立 |
| 指派工具通信 | [stdio_mcp L141–146](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/paperclip-runner/runner/crates/runner-core/src/stdio_mcp.rs#L141-L146) 有 assigned stdio 绑定时非 Unix 报错 | 所选工具用到这条桥则是前置阻断；另选受支持协议也须同等授权，不能暴露调试端口 |
| 通用隔离 | [local-process-sandbox L341–349](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/adapter-utils/src/local-process-sandbox.ts#L341-L349) 通用文件/网络 scope 仅 Linux | Win/Mac 必须验证所选 harness/工具的原生边界；独立 HOME、venv 和目录不是安全证明 |
| 快照传输 | [transport L11–41](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspace-transport.ts#L11-L41) 要 remote+sandbox、execute/syncIn/syncOut 且排除 runnerTask；路径处理含 POSIX 根与 /dev/null | task plugin 可跑任务不等于可用该存储链；补显式平台 capture/restore/transport 契约，必要扩展需单独评审 |

**可借鉴的是正确性语义，不是运行依赖：**固定 PCWS 的 Git refs/对象/HEAD/index、哈希、epoch/writerRunId/父 snapshot 条件发布是源码证据；不证明 Multica 已有同名能力。仅在许可、依赖和安全审查后可独立提取算法/模块，不要求 PCWS 格式、Paperclip 数据库或 Runner。当前必须在唯一 Multica 权威下证明同等保存/旧写隔离语义。

原生归档的稳定读取不等于所有文件及任务事件的原子截面；仍需受管理写入边界。Runner 状态检查点、provider 会话日志、项目文件保存点是三个对象，只有最后一个与任务/效果一起确认后，才能显示“公司已保存”。

## 3. 历史证据：OpenMausBot 原生能力（不导入 runtime）

OpenMausBot 的原生宿主/驱动事实仅保留为历史证据。当前只参考组队、分工、协作交互，不抽取安装器、driver、引擎目录、进程控制或其他 runtime，也不接入身份/任务/Team Cloud 后台。下表说明历史能力及限制，不是复用任务单。

具体分发证据：[electron-builder.yml](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/electron-builder.yml#L95-L190) 声明 Windows x64 NSIS/ZIP 与 macOS arm64/x64 DMG/ZIP；[main.mjs L1131–1215](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/electron/main.mjs#L1131-L1215) 以 Electron utilityProcess 启动本地宿主。Codex/DSH 安装描述均需要 Node，不是所有引擎都已提供独立二进制。Windows 签名、macOS notarization、第三方 CUA 分发及目标设备实际安装需单独验收，不由打包配置自动证明。

| 可利用部分 | 源码与边界 |
|---|---|
| 桌面与引擎准备 | 历史曾评估 Electron 桌面、引擎目录、安装与可执行性诊断；当前不导入；[engine-install](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/engine-install.ts)、[engine-roots](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/engine-roots.ts)。固定版本/完整性/回退是当前客户端的独立要求，不表示需要移植这些模块 |
| Codex App Server | [codex driver](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/drivers/codex.ts) 已处理进程、会话与协议，并有公司配置路径；仅为历史驱动证据，当前不导入；所选 Multica 官方路径独占会话生命周期 |
| DeepSeek ACP | [deepseek.ts L1–21](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/drivers/acp/deepseek.ts#L1-L21) 与通用 acp/core.ts 已实现 dsh --profile acp、配置选择、resume/cancel；当前不导入此 driver，若选择 ACP 则使用官方协议实现并锁版本 |
| Windows 进程处理 | [procs.ts L369–384](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/procs.ts#L369-L384) 已有 taskkill /T /F；失败可退为主进程退出也算成功，不能直接复用为“整树停止”的验收证据 |
| 公司认证隔离 | Codex 已有独立配置可参考；[DeepSeek L68–118](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/drivers/acp/deepseek.ts#L68-L118) 会探测 DSH_HOME/个人目录和存储凭据，旧驱动注明存储凭据优先环境。公司 DSH 需要独立 home、固定 profile、明确网关且禁止个人回退；仅注入一个环境变量不够 |

不能照搬的默认：Client 连接 Host 会关闭本机 harness；bot-box 的额外隔离依赖 Linux bubblewrap；工具 scope 中 mcp 范围不保证可关掉 harness 原生 shell/file；DeepSeek 旧驱动未声明图像输入，不应外推到全部当前 DSH 版本。浏览器自动化与任意桌面应用控制分开验收，首版仍暂缓通用 GUI 操作。

当前不抽取 OpenMausBot runtime。其核心与 enterprise 许可差异仅作历史风险记录，不能因 imports 可解析就当可直接嵌入组件。协作参考边界见 [参考边界](REFERENCE-REUSE.md)。

## 4. Codex 与 DeepSeek Harness 的同层比较

DeepSeek 官方 [项目入口](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/README.md) 明确 dsh 是独立 harness。harness 与模型供应商分开选：选 Codex 不等于将公司架构绑定单一模型；选 DSH 也不等于所有运行只能使用 DeepSeek 模型，更不需要本地部署模型。

| 维度 | Codex App Server | DeepSeek Harness |
|---|---|---|
| 集成接口 | 官方 App Server：会话、审批、流式事件、工具交互；两参考项目已有接入 | SDK JSON-RPC、ACP、插件扩展；OpenMausBot 已有 ACP driver |
| 原生桌面 | 官方有 Windows 原生路径；具体固定版本及我们的工具链仍要测，Paperclip Windows资格不能借用官方结论 | 有官方 Electron Desktop 与原生执行后端；CLI、SDK、ACP、Desktop 是不同载体，不能互借验收结果 |
| 公司模型通道 | 当前自定义 provider 的 wire_api 仅 Responses；只提供 Chat Completions 或 Messages 时需要额外协议桥及语义验证，不能只换 base_url | pi-ai 手工路由支持 Chat Completions、Responses、Anthropic Messages；可接公司同协议网关，仍须逐模型验证并禁止个人凭据/辅助模型旁路 |
| 扩展与知识 | 复用 skills、工具及已有运行协议；企业发布/评估闭环另建规则 | 插件化的 loop、工具、会话和模型适配更可替换；灵活性同时增加插件治理与升级面 |
| Windows 隔离 | 需对选定版本做原生读/写/网络/子进程实测，不能因有 sandbox 就判通过 | ACL backend明确只约束部分写入，读取、网络和进程可见性未限制；不能满足公司隐私边界而原样上线 |
| 保存与跨机 | 原生 session resume 不等于公司文件保存和异机工作接续 | JSONL 持久事件及 crash recovery 不等于任务工作区已上传或旧机已隔离；同样需要统一保存/接续协议 |
| 本轮结论 | 对照/备选；公司通道已有合格 Responses 能力时再比较总接入成本 | 优先验证候选，更贴合多协议与企业插件扩展；不是已验收或同时建设第二套引擎 |

### 官方证据及需要特别防止的误读

- Codex：[App Server](https://learn.chatgpt.com/docs/app-server)、[Windows 原生说明](https://learn.chatgpt.com/docs/windows/windows-app)、[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)。这些是线上说明，不自动证明 @openai/codex 0.160.0 的全部当前接口。
- DSH [SDK profile](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/bundle/sdk-app/README.md) 和 [ACP profile](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/bundle/acp-app/README.md) 已有外部驱动面；不要为了嵌入产品再实现一次 agent loop。不同实例必须隔离 profile/home；关闭不需要的插件管理和辅助请求。
- DSH [多供应商适配](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/llm/llm-pi-ai/README.md) 已支持手工网关路由。缺少明确凭据引用时可能使用环境/原有认证；公司模式应显式绑定受限凭证并失败关闭。不能用“OpenAI compatible”推定 Responses/工具/图像/推理状态全部兼容。
- DSH [Windows ACL](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/sandbox/sandbox-windows-acl/README.md) 与 [源码](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/sandbox/sandbox-windows-acl/src/index.ts) 有受限 token 和 Job 控制基础，但不限制读取/网络；硬链接可能别名到同一对象，workspace Low 标签持久保留，受限孙进程 piped stdio 有限制。这直接影响隐私及 Python/Node，不是界面层可补齐的缺口。
- DSH [会话持久化](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/session/session-persistence-jsonl/README.md) 有 fsync、断尾修复与未知工具结果表达，值得复用，但模型被提示“核对后重试”不等于中央效果幂等已实现。
- DSH [CUA](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/experimental/cua/README.md) 当前原生实现为 macOS，Windows 在开发；不能把有 Windows Desktop 理解为 Windows 通用电脑操作已完备。[安全说明](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/SAFETY.md) 明确 developer preview 且未安全审计，不可作为唯一安全边界。实验可用专用原生测试电脑，不改成依赖虚拟机。

### 4.1 多供应商接入契约：能连通不等于 Agent 可用

Ethan 的“标准 OpenAI 接口或者 Anthropic 接口”按具体协议记录，不把 OpenAI-compatible 当作单一协议。优先支持 OpenAI Chat Completions 与 Anthropic Messages；Responses 作为可选通道，不能强迫所有供应商先转换成 Responses 才可进入平台。DSH 固定样本的 [provider.ts](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/llm/llm-pi-ai/src/provider.ts) 明确列出 openai-completions、openai-responses、anthropic-messages 三种手工路由协议。Codex 当前官方配置只允许 Responses；这不等于 Codex 只能用 OpenAI 模型，但增加了只提供另外两种协议时的适配面。

建议链路：Windows 公司客户端 → 本机 DSH 模型适配插件 → 公司统一模型网关（同协议入口、准入/限额/归属）→ 获准云模型；工具及完整循环仍在本地。网关尽量保持协议语义，不自建第二套模型循环，不先造全协议互转系统。是否采用已有网关产品另行评估。

- 公司管理供应商原始 Key；客户端只拿短期、绑定公司/任务/run/设备和模型范围的网关凭证，不能据此访问其他部门。客户端不直连供应商，禁止个人 Key/OAuth/订阅回退；供应商原始 Key 不进入任务环境。模型发现、摘要/压缩、子 Agent 等所有启用推理入口同样受管，未纳管入口关闭。
- 模型注册项至少包括供应商/端点地区、协议、精确 model ID/版本、上下文/输出限制、工具调用与图像能力、推理状态处理、参数映射、计费口径及验证状态。模型品牌或列表接口返回成功不等于整家供应商通过。
- 首个验证子集建议选一个真实 Chat Completions 路由和一个真实 Messages 路由，使用同一 DSH 引擎和合成任务。具体供应商/型号待公司可用通道确认；这不是同时集成五家全部型号，也不要求每个故障用例乘以全部供应商。NG-04 先覆盖两个通道，选定其中一个冻结执行双设备 DV；替换模型组合后复核受影响断言。
- 每个放行组合验证：流式文本/工具参数、完整工具调用与结果回填、多轮继续、推理字段/签名与截断、支持的图像/结构化输出、超时/429/断流/取消、用量含缓存与重试、撤权及预算。未知或不支持的能力明确禁用，不能静默丢字段、假报工具成功或将未知费用记为零。
- 模型选择范围由公司/部门/任务政策限制，模型本身不决定权限。接续/切换模型只在受控边界从可移植任务摘要和文件重建上下文；不直接向不同协议重放私有推理块、工具 ID 或整份会话，不在进行中的工具动作里悄悄换供应商。

插件化自由属于平台研发可替换的扩展面，不是员工/AI 可随意安装任意代码。公司固定插件/profile/依赖版本、允许清单和可核对来源，变更经过评估、审批、灰度与回滚；不得让普通群消息或 skill 改写这些规则。审批、保存事件和模型计量可以利用插件钩子接入，但钩子不等于 Windows 进程隔离，也不自动保证所有副作用只执行一次。经验 skill 是受权限和版本管理的知识/流程资产，不等同拥有宿主权限的执行插件；自动沉淀不等于自动发布高权限升级。

### 怎么公平比较，而不是按品牌或 token 单价选

未来获授权后，两候选用同一原生设备、任务包、权限边界、公司网关和验收断言。先测资格，再测：工具任务完成率、人工介入、取消/重连、隔离负例、自动保存、费用完整性、每个验收交付的总成本与耗时（含重试/返工）。同模型且两接口语义都可验证时，才将差异主要归因于 harness；否则标为“模型＋harness 组合对比”，不宣称是纯 harness 排名。供应商价格/账号可用性和地区服务条件另核验；本轮不下费用或性能胜负结论。

## 5. 原生实验前置门禁 NG

每个门禁均在两台独立 Windows 11 x64 设备 W1、W2 上分别记录，随后做 W1→W2 与 W2→W1 恢复；Mac 不进入首轮通过条件。使用专用标准权限测试账号与合成资料；不操作日常工作机的生产凭据/真实私人文件。

| 编号 | 必测内容 | 失败条件 |
|---|---|---|
| NG-01 | 固定发行物/完整性、干净账号、无个人 CLI/Key/订阅、公司独立 HOME/config；本地完整模型—工具循环；没有 VM/WSL/Docker 依赖 | 只能在 Linux 中启动、读取个人认证兜底、服务器代跑或没有版本证据 |
| NG-02 | Python/Node/文件及选定浏览器工具真实可用；未授权目录中的合成私密标记读写、网络旁路、junction/symlink/hardlink逃逸被拒；必要 OS 授权有明确入口 | 普通 shell 可读取其他工作区/个人资料或绕网关；用模型自律代替限制；核心工具只能无限权限运行 |
| NG-03 | 单任务取消、主进程崩溃、子孙/后台工具、休眠/唤醒、锁屏/解锁；同机第二任务不被误杀 | 父进程退出即报整树终止；旧授权唤醒后恢复有效写入；取消误伤无关任务。锁屏对 GUI 可阻塞但普通任务按实际能力处理 |
| NG-04 | 公司网关 Chat Completions 与 Messages 路由按 §4.1 验证流式工具调用、限额/撤销、全部启用模型入口与 usage；错/缺公司配置、遗留个人配置、假凭据标记的负例 | 原始 Key 下发、个人回退、未归属请求、成本丢失或重复；无凭据的探针不冒充真实通道验证 |
| NG-05 | W1→W2、W2→W1：独立 Windows 目录的相对路径映射、中文/空格、大小写/Unicode、CRLF/LF、Git HEAD/index/工作层、二进制、文件占用与名称不兼容拒绝 | 字节或 Git 状态静默变化、跳过不支持文件仍报完整、路径逃逸；不搬 OS ACL/整份 HOME/venv/node_modules/Cookie，依赖按已锁定清单重建 |
| NG-06 | 所选官方路径接通真实 Multica 任务/run、每次运行设备目标、公司快照运输/事务发布、旧代次隔离；浏览器 profile 与任务目录独立，接手机先验权限 | 用 mock task库、task-only RPC 当完整快照、普通上传当中央确认、两个任务共享可变全局 cwd/env；候选适配依赖未解决则 BLOCKED |

NG-02 不能因 dedicated 测试账号没有真实秘密就省略：用假标记检验边界；如果只能靠用户手工隔离电脑才能通过，属于产品前提变更，不算当前员工原生方案成立。浏览器优先受控独立工作 profile，范围为授权读取/导航/下载；通用桌面 GUI 暂缓，不将它混入首轮必须完成的任意应用支持。

## 6. 与自动保存实验的衔接

参数和故障规程以 [DUAL-DEVICE-VALIDATION](DUAL-DEVICE-VALIDATION.md) 为单一来源。周期、保存期限、未确认窗口/大小和恢复时限只引用该文 §3，本文不复制数值；已确认保存点零丢失是要求，建议阈值须事前签认，不是上线 SLA。

总体顺序按 [Discovery G0–G5](DISCOVERY-BASELINE.md)，版本生效和权限撤销前提不得被原生工具演示替代。NG-06 在获授权的最小节点扩展之后验证，不是禁止编写该验证适配的循环前置。NG 通过才能开始计入 DV-01–08；W1→W2、W2→W1 分别执行，不用单方向代替另一方向。两台 Windows 的成绩不证明 macOS、跨系统恢复或全部 Windows build 可用。Mac 后续单独资格认证，不阻塞本轮。

Mac 预备只保留平台接口与数据契约：进程树/取消、安全存储、路径/名称、工具授权及 capture/restore 分开；中央资产使用相对路径和显式能力清单，不写死盘符或 POSIX 语义。不为此先开发第二平台实现，也不承诺以后零成本移植；macOS 发布、权限和跨系统 NG/DV 后续单列。

接续目标是工作：代码/文档满足目标设备能力才可跨系统；即使都是 Windows，特定应用、账号或硬件绑定步骤也只能去另一台具备对应能力且获授权的设备。没有合格设备时等待是正确行为，但不允许用这个负例抵消可移植 R1 正向任务必须接续的要求。

## 7. 避免重复建设与当前交付状态

不自建第二套模型循环、任务/身份权威或并列 skill 版本库；不把 Multica、Paperclip、OpenMausBot 三套后台拼接。Multica 官方 daemon/DSH 路径优先，Paperclip 只作治理/独立源码候选，OpenMausBot 只作协作参考、不导入 runtime。自动保存和条件发布须真实验证，不能把 PCWS 能力改名当现成。C05/B05 runtime、C06/B06 派发、C07/B07 接续保存、C08/B08 模型用量以 Discovery 为准，旧 PC 绑定作废。

确需自建/适配的是企业设备授权与池路由、受控原生生命周期/工具边界、自动一致保存策略、跨设备效果/权限对账、员工协作界面与组织资产规则。已有能力与缺口分层后再估工作量，不以“薄适配”一词代替实现成本评估。

本轮交付为源码/官方文档证据与调整后的设计，不新增运行模块、测试脚本、密钥或模型请求。NG/DV/WC/DC 均没有新增 PASS；真实执行和安装需另行授权。

撤权立即阻止新的中央准入，清理在线受管理缓存并记录结果；离线设备不承诺立即抹除。旧 epoch 拒绝、冲突不覆盖、外部效果对账及所有 DV 推荐参数/失败门槛保持不变。研究来源及 experiments/multica-spike、experiments/integration-spike、D:/dev/refs 只读。

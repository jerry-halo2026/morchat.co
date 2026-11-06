# morchat 文档导航与决策状态

> 更新：2026-11-05。产品定位与总体分工已由 Ethan 确认；本文档集是重新整理后的设计评审稿，不是开工授权，也不表示相关能力已实现或集成验证。

## 产品定位

morchat 是公司内人与 AI 共同工作的协作平台。公司与部门组织工作，负责人和员工均可组建人机小组，目标拆成任务，任务形成成果，经验逐步沉淀为公司可复用的知识与 skill。先服务自己的公司，保留后续对外产品化能力。

千川是第一个业务场景，不是平台定义。工作相关内容默认按公司资产策略保留，个人隐私除外；留存、查看、使用、修改和发布是不同权限。

### 全文统一用词

**Bot 就是 AI 同事。**正式 Bot 实例映射同一 Paperclip Agent；产品界面称 Bot/AI 同事，工程文档、源码与 API 保留 Agent，不批量改上游术语。Bot 模板是创建配方；小队模板是人和 Bot 的分工配方；小队实例绑定真实成员；task/run/attempt 是工作及运行/设备尝试，不是新增 Bot。临时子 Agent 不自动进入公司名册。

岗位包是职责/材料/就绪检查，供真人或 Bot 引用，不是另一种身份。稳定 Bot 可加入多个获授权小队、执行多个隔离任务；换设备、升级能力、创建新任务都不等于重新招一位 AI 同事。对象关系和版本记录统一以 [产品流程 §1、§3.6](D:/dev/morchat.co/docs/PRODUCT-LIFECYCLE.md) 为准。

**版本事实更正：**复用 Paperclip 已有配置历史、skill 版本/测试和 AGENTS/TEAM 包；新 managed 指令文件保存不再追加完整历史，旧 history 接口不能当新版本保证。指令持久化已有 durable blob/manifest，须补历史 GC 保留根或复用既有保留资产；模板缺失历史用固定来源/既有版本资产自动归档，morchat 只保存组合与生效关联；不是另造 Bot、模板或版本引擎。

## 已确认与待确认

| 状态 | 内容 |
|---|---|
| 已确认工作首页与消息协作 | 默认“我的工作”首页，侧边栏进入对话等功能；各 Bot 对授权受众的回复独立可见，任务线程承接讨论；显示/上下文/唤醒分离，群内普通消息不派工；@ 选中 Bot 后直接发送，无模式选择；有效委派与约定结果事件才定向启动；Paperclip 保持唯一任务/run 底座 |
| 已确认方向 | 自有企业扩展 + Paperclip 整体前端与任务/运行权威；OpenMausBot 选件复用；Multica 参考模式；不拼接三套独立产品 |
| 已确认 Bot 定位 | Bot 是 AI 同事，实例映射原生 Agent；模板/实例/小队/运行分开，已有模板和配置/skill 版本能力优先复用；每次受控生效须可追溯，指令历史缺口待接入验证 |
| 已确认产品主线 | 提出目标→组建人和 AI 团队→拆分认领任务→协作交付→复盘沉淀→下次复用；员工与负责人均可使用组织助手、维护获授权岗位包/小队模板，具体发布策略与验收为本轮设计建议 |
| 已确认范围 | 本期不建设通用工作流、低代码画布；未来可评估接 Coze 云等外部能力 |
| 已确认面板与可见性规则 | 面板不是老板独享；部门内普通任务明细默认同部门可见，敏感内容和私密群单独授权；跨部门仅开放获授权项目或任务及其对应业务流转，不开放对方整个部门 |
| 已确认经营前提 | 先内部使用，保留公司边界、连接器和资产可迁移性；不提前做完整 SaaS 商业系统 |
| 已确认客户端与运行方向 | 员工、负责人、老板使用同一客户端，面板内嵌；中央协作控制 + 员工本地完整 harness + 云端模型；本地 runtime 管理获授权浏览器、Python、Node 与文件，不先限定具体办公软件；撤回中央 harness 优先/服务器默认代跑 |
| 已确认群协作与设备路由 | 员工助手默认本人授权设备；公用 Bot 仅在设备和管理人均有对应资料授权的池节点自动选机；入群不授予电脑使用权，资料增量/恢复/接续均重验 |
| 已确认设备控制边界 | 员工保留电脑管理员权限；平台只管 Agent，不接管整机。Agent 不继承宿主全部权限；不承诺阻止管理员主动篡改或复制已落地资料，中央授权和提交检查仍独立执行 |
| 已确认并行方向 | 跨设备及同机无冲突任务允许并行；撤回每设备默认单任务，按资源局部互斥/容量限流；离线区分未启动改选、安全接续和未知阻塞 |
| 已确认关机与连续性范围 | 不要求全部员工关机后继续执行，不建设常在线执行节点作为首版兜底；无合格在线设备时工作等待，中央继续协作与数据治理，不代跑 harness。原有在线授权池协作/安全接续规则不变 |
| 已确认模型与凭据方向 | 大模型在云端推理，公司统一管理 LLM Key；员工不自备 Key，供应商原始 Key 不下发客户端或本地工具环境 |
| 本轮建议，待评审 | 公司模型访问层、远程派发/租约、离线资产交接与容量准入契约；MVP 分期和验收门槛；管理员与 Agent 权限分离、设备及管理人资料双授权已定；具体入池登记/能力预检/资源配额、壳/引擎分发/隔离在 P0 确定，首轮已明确为两台 Windows 11 x64 原生设备、Mac 预备；DC-01–08 未测不得宣称可行 |
| 已确认工作接续与自动保存 | 接续工作而非搬进程；系统自动形成并确认保存点，不依赖员工手动保存/提交/补传；未确认内容不承诺零损失 |
| 技术细节与实验待评审 | 独立工作区、Git＋版本资产、R1/R2 接续实现及 DV 双设备参数/规程；先做最小实验，再完成 WC/DC 全部门禁，尚未运行验证 |
| 未验证 | 身份代理、任务写入契约、事件同步、远程设备派发与本地完整 runtime、模型网关兼容、设备隔离/撤销、成本回执、组件拆用成本、恢复语义、同机/公司并发与真实运行性能；均不得写成已交付 |

**2026-11-05 最新确认与推荐分开记录：**Ethan 确认首轮用两台 Windows 11 x64 原生设备双向接续，Mac 预备但不阻塞；不以 VM/WSL/Docker 为使用前提。模型接入面向 OpenAI Chat Completions／Anthropic Messages 等协议，目标包括 DeepSeek、MiniMax、Qwen、GLM、Kimi，具体型号尚未实测。基于此，Ethan 已确认 DSH 优先研究、Codex 对照/备选，撤回 Codex 默认优先；具体发行物与安全组合尚未验收。Paperclip Runner Windows 适配、OpenMausBot 模块、公司网关与实验参数均待验证。

## 阅读顺序与各文档职责

**开工前先读：[Discovery 基线](D:/dev/morchat.co/docs/DISCOVERY-BASELINE.md)（八项边界、原生缺口、契约状态、P0 与未决项）→[工程基线 §5](D:/dev/morchat.co/docs/ENGINEERING-BASELINE.md)（权威、owner、任务卡、模型、worktree、合并）。**

| 文档 | 回答的问题 |
|---|---|
| [文档重整与取舍](D:/dev/morchat.co/docs/DOCS-REBASE.md) | 旧方案哪些保留、推翻、收窄、延期或补充 |
| [产品需求与 MVP](D:/dev/morchat.co/docs/PRD.md) | 为谁做、做什么、首版不做什么、如何验收 |
| [六步产品流程与能力落地](D:/dev/morchat.co/docs/PRODUCT-LIFECYCLE.md) | Bot 模板/实例、小队模板/实例、task/run/attempt 与版本清单；组织助手、岗位包和 skill 如何形成完整工作；LC-01–12 判失败条件 |
| [统一前端与工作首页](D:/dev/morchat.co/docs/PRODUCT-EXPERIENCE.md) | Paperclip 整体前端＋OpenMausBot 对话源码方向；工作首页/对话/看板/只读计划甘特/成果与员工负责人走查；单一身份/任务权威 |
| [统一客户端与执行环境](D:/dev/morchat.co/docs/CLIENT-RUNTIME.md) | 完整本地 harness 的安装/配置、中央派发、云端模型、公司 Key、容量/离线与资产交接 |
| [群内 Agent 与授权设备池](D:/dev/morchat.co/docs/DISTRIBUTED-COLLABORATION.md) | 群里 AI 用谁的电脑、自动选机、共享上下文、并行/离线边界及可证伪门槛 |
| [任务与工作空间接续](D:/dev/morchat.co/docs/WORKSPACE-CONTINUITY.md) | 任务做到一半如何保存文件/Git 状态，换人换机接手及旧设备回归；WC-01–12 反例 |
| [自动保存与最小双设备证伪方案](D:/dev/morchat.co/docs/DUAL-DEVICE-VALIDATION.md) | 无手动提交的自动保存、断电/断网/旧机重连/文件冲突怎样测，什么算失败 |
| [原生运行与 Harness 核查](D:/dev/morchat.co/docs/NATIVE-RUNTIME-RESEARCH.md) | Paperclip Windows 实质缺口、OpenMausBot 原生选件、Codex 与 DeepSeek Harness 对比、NG-01–06 前置门禁 |
| [Windows DSH 最小接入](D:/dev/morchat.co/docs/WINDOWS-DSH-INTEGRATION.md) | Paperclip与harness分层、MXC/ACP直接复用、Windows权限/取消/成本/PCWS缺口和 WI-01–10判失败条件 |
| [跨设备参考研究](D:/dev/morchat.co/docs/CROSS-DEVICE-REFERENCE-RESEARCH.md) | Paperclip、OpenMausBot、Horde 等固定源码已解决什么、明确没覆盖什么 |
| [整体架构](D:/dev/morchat.co/docs/ARCHITECTURE.md) | 模块职责、权威数据、身份权限、协作与执行如何接线 |
| [资产与持续升级](D:/dev/morchat.co/docs/ASSETS-AND-LEARNING.md) | 留存、知识、skill、权限继承和离职交接 |
| [参考项目复用边界](D:/dev/morchat.co/docs/REFERENCE-REUSE.md) | 固定源码证据、哪些直接复用、哪些适配、哪些仅借鉴 |
| [Paperclip 接入边界](D:/dev/morchat.co/docs/PAPERCLIP-BASE.md) | 原生能力、缺口、管理台限制与接入门禁 |
| [Discovery 基线与证伪登记](D:/dev/morchat.co/docs/DISCOVERY-BASELINE.md) | 八项最小边界、主反例与 OP-01–08、C01–C08 冻结、P0 顺序及 D01–D10 未决项 |
| [工程与验证基线](D:/dev/morchat.co/docs/ENGINEERING-BASELINE.md) | 文档权威、模块 owner、任务卡、模型分级、subagent/工作树、提交追溯与合并门禁；安全、测试、发布和恢复 |
| [分阶段建设顺序](D:/dev/morchat.co/docs/PLAN.md) | P0 到 P3 的交付、依赖、退出标准和阻塞决策 |
| [千川数据面](D:/dev/morchat.co/docs/QIANCHUAN-DATA.md) / [千川接口资料](D:/dev/morchat.co/docs/QIANCHUAN-API-DEV.md) | 首个业务连接器的历史技术证据，不定义平台定位和排期 |
| [edict 参考边界](D:/dev/morchat.co/docs/EDICT-FLOW.md) | 可借鉴的治理原则与不得照搬的机制 |

### 全产品界面盘点入口（2026-11-05）

[参考项目 §4.6](D:/dev/morchat.co/docs/REFERENCE-REUSE.md) 按官方文档、固定源码实际路由/开关、保留/适配/参考/暂缓盘点 Paperclip、OpenMausBot、Multica、Nodo；工作流项目仍延后。[统一体验 §3.1、§3.6](D:/dev/morchat.co/docs/PRODUCT-EXPERIENCE.md) 给出完整分组提案与员工/负责人走查，不把已有五屏低保真当全产品目录。Paperclip 的成员、Inbox/决策、技能工作室、连接审查和审计属于整体底座，不因八项差异自建清单未单列就删掉。页面/开关/权限与真实集成分开登记；本轮只读研究和文档修订，未新绘完整页面或运行集成。

## 当前可行性与开发状态

本轮证伪结论已按 [Discovery 基线](D:/dev/morchat.co/docs/DISCOVERY-BASELINE.md) 收敛：八项最小工作边界、十类主反例及完整操作链补充反例、原生复用/适配/必要补丁分工。产品方向未被否定；“现成项目仅接配置/API 即完整闭环”的假设不成立。不能把保存点、能力清单、模板 preview 或任务 succeeded 分别当成交付、实际版本加载、原子安装或业务评估通过。

P0 统一 G0 契约/准备→G1 原生安全预检→G2 版本生效→G3 权限撤销→G4 完整节点、双向接续与消息触发验证→G5 合流。保留 PC、NG/WI、DV、DC/WC、MSG-01–08、OP-01–08 和 LC 契约子集；完整产品 US/LC 仍在 P1–P3 验收。保存/接续参数只见 DV §3；消息防风暴参数按群协作 §4.5 在 G0 冻结。实际故障实验尚未运行。

**C01–C08 当前全是 DRAFT；G0–G5 均未实测放行。**本轮只读检查已发现工作区 .git；其归属、remote、分支保护和 CI 未核验。本轮没有初始化仓库、创建工作树、设置提交身份或 CI。后续并行受 [工程基线 §5](D:/dev/morchat.co/docs/ENGINEERING-BASELINE.md) 约束：主题权威、owner、冻结契约、任务卡、独立工作流、模型分级、实际 agent 追溯、独立审核与串行集成。规则已写明不等于机器门禁已实施；discovery 尚有 D01–D10 待决，不称全部完成。

**完整操作链本轮结论：**Paperclip 已有追问/回答投递、审批、待处理补充及取消，不重复造后台；OMB 优先吸收对话、附件、配置/维护的具体操作体验。知识维护复用 Paperclip 文档修订，不另建记忆库。复用边界和源码见 [REFERENCE-REUSE §4.5](D:/dev/morchat.co/docs/REFERENCE-REUSE.md)，员工/负责人走查见 [PRODUCT-EXPERIENCE §3.5–4.2](D:/dev/morchat.co/docs/PRODUCT-EXPERIENCE.md)。P1 最小操作链、P2 知识/skill 维护均按 OP 门禁验证；即时 steer 的 DSH 能力尚未成立。此次只改 docs，OP/FE/P0 均为 NOT RUN（未运行），不改变 C01–C08 DRAFT。

## 生效与冲突规则

1. 用户最新明确确认先同步权威正文；文档按 [工程基线 §5.1](D:/dev/morchat.co/docs/ENGINEERING-BASELINE.md) 分主题管辖，不用时间戳决定谁覆盖谁。遇冲突修权威和受影响引用，再开依赖任务。
2. [Discovery 基线](D:/dev/morchat.co/docs/DISCOVERY-BASELINE.md) 只登记边界、契约/证据状态和未决项；具体参数/协议仍由专项唯一正文定义。任务卡与实施计划不得自行改产品范围、安全边界或冻结契约。
3. 千川历史实测保留原日期，不因整理获得新验证或业务调用授权。[旧稿归档](D:/dev/morchat.co/docs/archive/2026-11-04-pre-platform-review/README.md) 仅追溯，旧稿“锁定/唯一施工图/开工”失效。
4. 参考源码与本机技能是证据/流程来源，不替代企业需求、授权或验收。Superpowers 单计划串行实现；真正独立工作流才可各自隔离并行，不把工作树当逻辑冲突解法。
5. 本轮只改 docs。没有代码、配置、凭据、安装、部署、模型请求或故障实验；后续实施计划与执行需另获授权。

# 参考项目的复用与非复用边界

> 2026-11-05。基于固定源码样本及此前官方文档研究；“存在实现”不等于 morchat 已完成集成验证。参考项目不是同时运行的产品清单。

## 1. 核心结论

| 项目 | 固定样本 | 本期角色 | 复用方式 |
|---|---|---|---|
| Paperclip | 40ea7a9b8994e9bdb3d13794b5847388be0f7a92 | 中央任务/run 与用量控制内核 | 独立服务 + API/远程派发适配；不把服务器 local adapter 当员工本地执行；原生 UI 限执行管理 |
| OpenMausBot | 597e70d7930db632747acfb4ea047ca520bd958c | 桌面交互、本地引擎管理/工具与记忆机制参考 | 可为零运行依赖；只择取有收益的体验/安装诊断等片段，不移植完整 skill store/importer；不部署第二套身份/任务系统，不原样采用关闭本地 harness 的 Client 模式 |
| Multica | 58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe | 小队与交接模式参考 | 独立实现产品规则，本期不引入源码或运行依赖 |
| DeepSeek Harness | fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159 | 官方独立 harness，已确认优先研究，发行物/安全组合未验收；不是仅模型 API | SDK/ACP 与插件可复用，原生安全/公司凭据门禁未过，不同时引入第二套运行平台 |
| Microsoft MXC | v1.0.1 / fda29ac63bc306b7f97f3b86b4b63d44f7f40cf2 | Windows原生隔离组件优先验证 | 直接消费正式SDK的ProcessContainer；MIT；实际build/tier/策略须验证，不用VM、不从Codex拆整套沙箱 |
| ACP TypeScript SDK | 1.4.0 / e6463f444093ed7c5f1cc937c3f32afb5853e906 | 客户端与DSH双向协议组件 | 官方SDK接MXC stdio，Apache-2.0；不抽整份OpenMausBot ACP core，不重造JSON-RPC |
| Nodo | 5c45fdf1c27f92d6369d03017dcea27e51040430 | 可选角色路由参考 | 不作为通用工作流或组织底座，不列为 MVP 必需依赖 |
| n8n / Coze Studio / FlowGram | 已有研究记录 | 本期全部暂缓 | 不安装、不建设画布或转换器；未来按需求重新评估 |
| Coze 云 | 未选具体产品/API/版本 | 未来外部能力候选 | 将来核验身份、输入输出、授权、数据传输和运行关联后再接入 |

新增组件、版本/许可证据、最小补齐与失败条件统一见 [Windows DSH接入](D:/dev/morchat.co/docs/WINDOWS-DSH-INTEGRATION.md)。正式SDK不等于本项目组合已经成熟；原生隔离、ACP生命周期/费用语义和PCWS接入必须分别验证。

首版收敛清单与本轮反例统一见 [Discovery §1–2](D:/dev/morchat.co/docs/DISCOVERY-BASELINE.md)：只做八项边界，复用原生资产/搜索条件、版本 blob/manifest/skill 测试；明确必要原生扩展，不新造内容库或评测平台。

## 2. Paperclip

可复用任务的真人/Agent 承接、目标层级、执行/唤醒/运行记录、Bot 配置历史、当前指令文件与 skill 版本，以及已验证的模型成本和公司/Agent/项目预算。必须补公司的人类部门、群协作、目标真人负责人、设备授权与调度、公司资产政策及部门费用归属。原始模型 Key 由公司集中管理，不因 adapter 允许环境变量就发给员工设备。

[任务字段](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/issues.ts)含人类和 Agent 执行者；[Agent 模型](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/agents.ts)的汇报关系不是人类部门树；[目标模型](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/goals.ts)的 owner 为 Agent；[skill 模型](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/company_skills.ts)已有版本基础。采用 MIT 不免除保留版权及依赖许可检查：[LICENSE](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/LICENSE)。

2026-11-04 补读用户提供的 [五分钟路径](https://docs.paperclip.ing/guides/getting-started/five-minute-path/)、[适配器](https://docs.paperclip.ing/reference/adapters/overview/)、[用量预算](https://docs.paperclip.ing/guides/day-to-day/costs/)和[密钥轮换](https://docs.paperclip.ing/how-to/rotate-provider-api-key/)。这些是线上文档，不自动代表固定源码样本或我们的集成状态；local 指运行位置，不是本地大模型。具体门禁见 [Paperclip 接入边界](D:/dev/morchat.co/docs/PAPERCLIP-BASE.md)。

本轮补读固定样本的 heartbeat 队列与 adapter 会话目标检查：已有按 Agent 的并发名额和执行目标匹配，部分 provider 路径仍有单外部 turn 限制。不能把 Paperclip 简化为“只能本机/一次一个”，也不能把这些实现等同员工设备池已完成。选定适配器必须通过公用 Agent 多任务隔离、per-run 自动选机和故障接续门禁，不能反复改共享配置或复制无审计影子身份。证据见 [Paperclip §4.2](D:/dev/morchat.co/docs/PAPERCLIP-BASE.md)。

本轮进一步确认：[AI 包规范](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/docs/companies/companies-spec.md#L38-L78)覆盖单 Agent/Team；[Reflection Coach](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/built-ins/agents/reflection-coach/AGENTS.md#L7-L30)已有证据→最小 diff→提案/replay 方法；[skill 测试 schema](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/shared/src/validators/company-skill.ts#L414-L529)与实际测试 issue 已实现。**撤回“评估执行流水线全部自建”的暗示**：直接消费原生版本/案例/测试运行，补业务判分、企业发布权限和证据保留。组队只扩展真人槽位与组合元数据，不另造 AI 包格式。

必须验证的原生限制：catalog 导入与 hire 审批不当然相同；真人并发认领不能套 Agent checkout 或状态单字段 CAS；普通新 run 历史 pin 受 Beta 开关影响，但已有 run 快照/Studio 固定测试版本原生存在；sync unsupported 不代表实际安装。逐项固定源码见 [Paperclip §2.1](D:/dev/morchat.co/docs/PAPERCLIP-BASE.md)。

**Bot 模板/小队模板与版本的复用结论：**产品中的 Bot 是 AI 同事，工程对应同一个 Agent。AGENTS/TEAM 等包和 Team Catalog 优先作为模板载体；配置 revision 与 skill 版本/测试直接消费。morchat 只补真人部门、版本组合/生效权限和实际 run 关联，不另建 Bot 配置库、模板格式或版本引擎。

**指令历史纠正：**固定样本的新 managed 指令保存写当前文件和活动日志，不向旧 revision 表追加完整正文；history/diff/restore 保留不代表每次新保存可回退。配置历史也不保存指令文件字节。允许交付的指令/资源优先复用原生 durable blob/manifest，补历史保留根或接既有保留资产；模板缺失历史用固定来源/既有版本资产。current manifest 的旧对象可能被 GC，不能仅存引用称永久保留；当前编辑仍走 Paperclip。[配置 schema](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/agent_config_revisions.ts#L5-L19)、[实际保存路径](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/agent-instruction-revisions.ts#L215-L350)、[官方文件历史说明](https://docs.paperclip.ing/reference/api/agents/#instructions-bundle)。模板 contentHash/可选 packageVersion 也不等于完整历史存储；不要重复开发已具备的功能，也不要把缺失的历史说成已经具备。

## 3. OpenMausBot

参考或选择性适配：聊天与任务卡、真人/AI 发言来源、AI 名册交互、记忆捕获/整理/修改日志与撤销、skill 改进候选机制。补充参考桌面壳、设备配对、电脑操作与文件回传；拆模块必须先确认依赖和第三方驱动授权，不承诺一个 npm 包即可接入。

不照搬：完整账号/Team Cloud 控制面、独立 bot 配置、任务状态、群授权与私聊留存。其 Team Cloud 个人私聊在成员离开时删除且排除于公司导出，和我们的“工作私密仍可属公司资产”不同：[Team Cloud](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/docs/team-cloud.md)。记忆整理与撤销可参考，但不等于组织级效果评估：[Memory](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/docs/memory.md)。

桌面 Client 模式连接另一台 Host 时，会停止本地 harness、电脑操作和浏览器宿主，因此不直接满足“连接公司后台并同时提供本机工具”；本期已选员工本地完整 harness，需要适配连接中央且保留本地运行的路径，不再保留中央 harness 优先分支：[Desktop companion](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/docs/desktop-companion.md)。文件冲突、校验与传输设计可以参考，但不能照搬个人云的整个同步/归属规则：[Files](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/docs/files.md)。

核心 Apache 2.0 与 enterprise 目录的授权不同；商标也不随代码许可转移。不得将企业目录功能混入“可直接复用”清单：[许可说明](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/LICENSING.md)。

### 3.1 已读到的本地引擎与公司模式证据

固定样本中 Codex driver 启动 App Server，Claude driver 管理独立配置及运行进程；公司模式对缺失公司凭证/配置有拒绝分支，且隔离个人认证。这说明“客户端管理本地引擎＋公司模型连接”有可参考实现，不意味着可以直接照搬其企业云服务或已验证 morchat 接入。[Codex driver](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/drivers/codex.ts)、[Claude driver](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/drivers/claude.ts)

引擎安装模块使用应用管理的工具目录、安装后检测可执行性，可借鉴安装/诊断结构；固定样本 npm 安装含 latest 选择，我们应改成固定已测版本、完整性/许可检查、兼容与回退，不照搬自动追最新版，也不让公司配置失败回退个人计费。是否复制模块需核验依赖和适用许可，不等于现在修改参考源码。[engine-install](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/engine-install.ts)、[engine-roots](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/engine-roots.ts)

自建/适配部分仍包括企业授权与群上下文、员工助手默认设备、公用 Agent 授权池自动选择、Paperclip per-run 派发/租约/回执、并行会话/资源隔离、公司网关准入/费用对账、离线分类接续和中央资产交接。不能因为参考项目能调用本地 CLI，就认定这些企业闭环均已具备。

### 3.2 原生能力与重复建设收敛

Windows x64 与 macOS arm64 均有 Electron 打包与本地宿主实现；安装器、CLI shim 解析、独立公司配置、诊断与监督可选件复用，但 Codex/DSH 安装仍需受管理 Node。已有 DeepSeek ACP driver 核验版本为 0.2.1-rc.2，不能套用官方 0.2.2-rc.1 样本。

不要将 taskkill 后父进程退出当整树终止，不把 Linux-only bot-box 当 Windows/macOS 隔离。公司 Codex 配置可参考，但 OpenMaus Admin 协议不能成为第二公司后台；DSH 要补独立 home/profile 与无个人认证回退。Native CUA 的打包存在不等于本项目已取得对应第三方分发资格或已覆盖真实应用。详细源码和对比见 [原生运行与 Harness 核查](D:/dev/morchat.co/docs/NATIVE-RUNTIME-RESEARCH.md)。

### 3.3 团队包、经验候选与评测：选择性复用，不整套移植

- [team-manifest 白名单](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/team-manifest.ts#L208-L228)、[导入新实例/另选范围](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/routes/teams.ts#L292-L361)值得复用；但 [PackageImportDeps](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/package-import.ts#L44-L65)耦合 Store、routines、skill、memory、MCP 等，并非现成独立 SDK。
- **新版包确实能带记忆。**[导出 seed.memory](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/package-export.ts#L593-L607)、[导入写入 memory](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/package-import.ts#L325-L349)存在；路径/大小限制不是公司隐私分类。morchat 剔除记忆、路径、凭据、grants/会话，获准知识改资产引用再验权；不能依据旧注释宣称模板天然无记忆。
- [/learn](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/skill-learn.ts#L46-L60)与 [候选/应用/撤销](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/skills.ts#L986-L1258)已有暂存、base hash、防旧建议覆盖和过期撤销，可提取规则/小组件，输出接 Paperclip。其[后台 direct review](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/index.ts#L5403-L5457)可直接应用，不是我们的授权评估发布链。
- [skill bench](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/evals/runners/run-skill-bench.ts#L16-L18)明示 alpha scripted-provider，[scorer](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/evals/scorers/skill-bench.ts#L29-L95)的 token 为估算；参考 with/without 和不确定性标记，不引入第二 runner，不当真实模型效果/成本证明。

纯组件抽取仍需保留 Apache/第三方 MIT notice；skill-review 含 Hermes 来源。enterprise 目录另授权，不能因内部首用忽略后续产品化。浮动 main 的模板目录也不算本次固定样本已审核内容。

## 4. Multica

借鉴小队成员包含人与 AI、明确派单、成员回报后再协调、避免自触发/重复唤醒、派单不等于交付。其 leader 必须为 Agent，是参考项目限制，不是我们的需求：[Squads](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/apps/docs/content/docs/squads.mdx)。

[许可证](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/LICENSE)对内部使用、对外托管/嵌入和品牌有不同条件，不应简称普通 Apache 2.0。为保留产品化空间，本期不复制源码，只以独立需求和实现吸收协作思想；未来若选用原产品须另核实适用条款。

核心源码进一步支持上述模式：[squad migration](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/server/migrations/084_squad.up.sql#L1-L33)包含 member/agent，但 leader 仍指 Agent；[briefing](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/server/internal/handler/squad_briefing.go#L114-L209)区分派单/交付/完成及防重复唤醒；[onboarding](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/server/internal/service/builtin_skills/multica-onboarding/SKILL.md#L108-L151)围绕真实目标交接，不证明复盘→skill 发布→新任务复用已闭环。action/no_action/failed 是协调记录，不是质量评估。

## 5. 跨设备与持久工作空间的补充研究

[跨设备参考研究](D:/dev/morchat.co/docs/CROSS-DEVICE-REFERENCE-RESEARCH.md) 记录本轮三路 subagent 的固定版本、核心文件、官方限制和许可初筛。新增优先参考 Horde 的真正设备派工/子任务验收；Code Coordinator 仅参考 issue→PR 模式；OpenHands SDK、Entire、Happy、Vibe Kanban 分别作归档、追溯、远控与 UX 对照，不把全部项目加入运行依赖。

两个重要澄清：OpenMausBot 已有原机离线文件副本/暂存回写；Paperclip 已有项目工作空间快照/恢复及 epoch 条件发布。前者不等于完整任务异机交接，后者仍需员工节点适配；Paperclip Agent 文件 last-sync-wins 不能直接当项目合并。优先复用已见底层能力，企业权限、保存点语义和 R1/R2 恢复协议按 [任务与工作空间接续](D:/dev/morchat.co/docs/WORKSPACE-CONTINUITY.md) 补齐并验证。

## 6. 选择性复用的工程规则

每个实际引入件记录来源仓库、路径、固定提交、许可、改动、依赖、替代成本、验证用例和维护责任。外部项目升级后，先重新核验，不把 README 宣传语当契约。

“有字段”“有前端按钮”“有示例”“有后端实现”“已在我们的环境验收”是不同证据等级。禁止把研究结论写成上线状态。

[edict 与调度参考](D:/dev/morchat.co/docs/EDICT-FLOW.md)只提供可选原则，不向平台强加官制、审批阈值或另一套状态机。

## 7. DSH 技能消费与 Grok 产品模式补充

DSH 固定样本的 skill registry/provider/tool 可直接消费；首版优先已有 filesystem provider，显式 includeDefaultRoots:false，只挂 run 只读投影，不先造新 provider。其 get 每次读文件、catalog hash 只含名称/说明/incomplete，均不保证批准正文版本。薄适配核对 Paperclip 版本、正文/资源实际 hash，覆盖工具与 slash 注入；缺项阻塞，不改 agent loop。[filesystem](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/skill-filesystem/src/index.ts#L44-L83)、[每次读取](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/skill-filesystem/src/index.ts#L205-L220)、[加载路径/目录 hash](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/tool-skill/src/index.ts#L123-L340)。

DSH preset 是 Cordis 插件配置，不开放为员工任意团队 YAML；本地 Teams 是 session 内部 DAG，不当公司小队或中央任务库，首版默认不启用。DSH MIT/developer preview 的成熟度与 Windows 安全组合边界不变。[preset](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/preset/agent-preset-registry/src/definition.ts#L4-L10)、[Teams](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/docs/subsystems/agent-team.md#L47-L70)。

Grok 官方的 [Lauren Tan / dr eggbot](https://x.ai/bot/marketplace/bots/dr-eggbot-v2)、[多团队实验](https://x.ai/bot/guides/how-i-run-multiple-teams-of-grok-bots)、[模板](https://x.ai/bot/guides/templates-for-grok-bot)、[工程实践](https://x.ai/bot/guides/grok-bot-for-engineering)支持澄清岗位、优先复用现有 AI、角色配方、交付证据和复盘建议。这些是产品模式，不是 morchat 的 API 依赖；CreateAgent/update_state 仅见内部工具，未核验公共接入契约。传播中的“50 Bot 等于20名工程师、90%员工”等数字未证实，不进入成本/收益或容量结论；不照搬云 worker、自动合并、自动全员升级。

落地取舍统一见 [六步产品流程](D:/dev/morchat.co/docs/PRODUCT-LIFECYCLE.md)。本轮三个 subagent 分别只读核查 Paperclip、OpenMausBot/Multica/DSH、Grok 产品资料；没有运行模型、安装组件、改代码或实测上述闭环。

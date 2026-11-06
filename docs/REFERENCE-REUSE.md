# 参考项目的复用与非复用边界

> 2026-11-05。基于固定源码样本及此前官方文档研究；“存在实现”不等于 morchat 已完成集成验证。参考项目不是同时运行的产品清单。

## 1. 核心结论

| 项目 | 固定样本 | 本期角色 | 复用方式 |
|---|---|---|---|
| Paperclip | 40ea7a9b8994e9bdb3d13794b5847388be0f7a92 | 公司工作台整体底座：组织/任务/人工决策/技能成果/连接治理 + 唯一任务/run/用量权威 | 复用 UI 布局/任务组件并适配企业授权；独立服务 + API/远程派发；原样管理员台仍受限，不把服务器 local adapter 当员工本地执行 |
| OpenMausBot | 597e70d7930db632747acfb4ea047ca520bd958c | 人机操作体验源码优先抽取适配；本地引擎/工具与维护机制参考 | 优先复用对话、输入、附件和维护差异的展示源码；Paperclip 已有同类卡片优先用原生，不并存两套；安装诊断等按独立收益选择，不移植完整 skill store/importer；不部署第二套身份/任务系统，不原样采用关闭本地 harness 的 Client 模式 |
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

### 2.1 消息接入必须覆盖原生自动唤醒

固定样本的 [普通评论判断](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/issue-comment-wakeup.ts#L1-L27)对非 self 且未终态任务，即使没有 @ 也可返回需要唤醒；[评论路由](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L19590-L19632)会提交 issue_commented。update 携带评论也有同类路径。因此不能把所有群回复同步为普通原生评论，再声称只会定向启动。

[子任务终态分支](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L16142-L16172)在满足原生父任务条件时发送 issue_children_completed，并携带 childIssueSummaries；评论引起终态也有 [对应分支](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L19672-L19702)。这是可复用的原生协调事实，但不证明资产已确认或接收者当前可读。企业结果就绪与原生通知须关联防重，输入摘要重新按权裁剪；不另造并行唤醒器。

首版应优先让自有群普通消息留在协作域，原生评论只投影已有事实或走已验证的明确操作；对仍开放的 native 入口统一企业准入，缺 hook 再评审最小扩展。MSG-03/05/06 覆盖这些实际路径，不能只测带 @ 的消息。上述是静态路径核查，未运行。

## 3. OpenMausBot

源码优先复用并适配：对话与回复展示、真人/AI 发言来源、输入与过程折叠；选择性抽取追问/审批/补充/停止、文件交付、AI 名册与模板预览、记忆编辑和 skill 候选的交互；原生问答/队列/审批优先 Paperclip。记忆日志/Undo 不作公司版本协议，完整证据及边界见 §4.5。补充参考桌面壳、设备配对、电脑操作与文件回传；拆模块必须先确认依赖和第三方驱动授权，不承诺一个 npm 包即可接入。

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

### 3.4 多 Bot 回复与防风暴：可借鉴什么，不保证什么

本轮由两个独立只读研究分别核查 OpenMausBot/Multica；以下均是固定 SHA 的静态证据，未执行其测试，不等于我们的 P0 通过。

- **群内可见：**[GroupView](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/GroupView.tsx#L484-L521)按 Bot 署名，过程说明可收起；[activity-runs](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/lib/activity-runs.ts#L112-L158)提供同轮折叠规则。不是只显示领队总结，也不是通用子 Agent 对话组件。固定群聊增量用于进度，完成文本才进入时间线，不能宣传为所有驱动都逐字输出。
- **发布不等于派工：**[post_to_room](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/index.ts#L14163-L14193)不启动 turn；[runtime 契约](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/docs/runtime-contract.md#L36-L46)有显式委派、拒绝祖先回流、防重复节点及子项结果合并唤醒。普通群根回合仍有文本提及追加一跳及全员模式；不照搬这些默认触发。
- **局部限流不等于全链保证：**[room-post-budget](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/room-post-budget.ts#L26-L103)有重复文本、速率、无人回应及三 Bot 环熔断；预算在该发布入口的进程内存中，非跨重启全入口防线。协调器的 64 请求/96 执行是无进展预算，不是整个工作生命周期硬上限，不能直接当公司总预算。

已确定优先抽取适配对话源码：署名/回复、输入、过程折叠及其必要纯函数，绑定 morchat 展示 DTO；不以重新实现相同 UI 为默认。限流判定与测试可选复用，但不是现成即插即用 SDK，也不引入独立 OpenMausBot 后台运行依赖。**不搬其完整 Store、群路由协调器或本地任务状态来替代 Paperclip。**群授权、跨设备持久消息/因果链、防重及预算必须接本项目 C01/C02/C06/C08。

静态测试证据：[只发布不唤醒](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/post-to-room.test.ts#L434-L457)、[派工重试不重复执行](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/room-coordination.e2e.test.ts#L438-L448)。这些是应移植为本项目反例的行为，不是已运行成绩。

## 4. Multica

借鉴小队成员包含人与 AI、明确派单、成员回报后再协调、避免自触发/重复唤醒、派单不等于交付。其 leader 必须为 Agent，是参考项目限制，不是我们的需求：[Squads](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/apps/docs/content/docs/squads.mdx)。

[许可证](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/LICENSE)对内部使用、对外托管/嵌入和品牌有不同条件，不应简称普通 Apache 2.0。为保留产品化空间，本期不复制源码，只以独立需求和实现吸收协作思想；未来若选用原产品须另核实适用条款。

核心源码进一步支持上述模式：[squad migration](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/server/migrations/084_squad.up.sql#L1-L33)包含 member/agent，但 leader 仍指 Agent；[briefing](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/server/internal/handler/squad_briefing.go#L114-L209)区分派单/交付/完成并提示避免双重派工，提示词本身不提供硬性防重保证；[onboarding](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/server/internal/service/builtin_skills/multica-onboarding/SKILL.md#L108-L151)围绕真实目标交接，不证明复盘→skill 发布→新任务复用已闭环。action/no_action/failed 是协调记录，不是质量评估。

### 4.1 工单协作而非通用群聊，按模式吸收

同工单时间线保留 author_type/author_id/source_task_id，并按事件/评论 ID 去重：[timeline](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/packages/views/issues/hooks/use-issue-timeline.ts#L50-L69)。这支持多人多 Bot 结果可见，不能当成所有 Bot 都消费同一收件箱。

[真实触发路由](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/server/internal/handler/comment.go#L2636-L2695)优先显式 Agent/Squad，单独 @all 不启动 Agent，无定向 worker 回报可唤醒负责人；显式交接不再同时唤醒负责人。固定文档 squads.mdx 第 72 行仍写 Agent 例外，会和上述实现及 [回归测试](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/server/internal/handler/squad_comment_trigger_test.go#L265-L308)冲突，本次按源码/测试意图记录，不用文档一句话证明行为。

局部合并不等于整条链已防风暴：[运行中自点名仍可排下一轮](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/server/internal/handler/mention_self_trigger_test.go#L177-L205)；[子任务分配加父任务提及会双跑](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/server/internal/handler/squad_briefing.go#L203-L209)目前有明确提示规则。不能因此说上游不能用，也不能说我们直接接入便保证无风暴。

### 4.2 首版统一复用决策

| 部分 | 首版方式 | 必须补齐/禁止重复 |
|---|---|---|
| Paperclip 任务、run、原生事件与费用 | 消费原生能力；不足的防重/准入入口由集成 owner 评审受支持扩展或最小补丁 | 不另造可写任务状态、负责人、运行和成本总账；原生自动评论/分配唤醒也纳入契约 |
| OpenMausBot 对话、署名、输入与过程折叠 | 源码抽取适配为首选；接 Paperclip 基础 UI 与统一协作契约 | 不启动完整应用/Store/协调器/Team Cloud；进程内限流不作为公司保证 |
| Multica 明确派工、成员交付、条件唤醒 | 只借鉴产品规则，独立实现，不引入源码/runtime | 不强制 AI leader，不把重复控制只写进模型提示词 |
| morchat 群/线程与事件投影 | B02 自建统一交互与持久协作记录，引用原生任务/run | 补消息/命令关联、授权推送/补拉、同意图防重与可见回执；不双写原生评论正文 |
| 根协作链与控制背压 | B02 会同 B01/B06/B08 适配中央准入、既有派发及费用账 | 持久限制、重启/换机不重置、取消/审批不被进度淹没；不是第二调度引擎 |

产品规则见 [体验 §3](D:/dev/morchat.co/docs/PRODUCT-EXPERIENCE.md)，执行规则见 [群协作 §4](D:/dev/morchat.co/docs/DISTRIBUTED-COLLABORATION.md)，反例见 [Discovery §4.4](D:/dev/morchat.co/docs/DISCOVERY-BASELINE.md)。

### 4.3 前端源码：直接复用、适配、自建的准确边界

2026-11-05 用户确认：Paperclip 整体前端＋OpenMausBot 对话模块，优先复用源码，不只是模仿外观。D＝在选定依赖/主题上下文内保留原组件；A＝保留源实现，修改接入边界；S＝仅补本项目缺失规则。以下是设计和静态研究结论，均未集成、构建或实测。“直接复用”不代表零依赖或零验收。

| 界面部分 | 方式与固定样本源码 | 必要边界 |
|---|---|---|
| 基础按钮/控件/图标体系 | D 候选：Paperclip [button.tsx](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/ui/button.tsx)，沿用已选基础组件，不重写同等控件 | 自带 Radix/cva/utils/主题依赖；按闭包复用，不盲拷单文件。基础样式和依赖锁只维护一份 |
| 全局布局、导航、面包屑 | A：Paperclip [Layout](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/Layout.tsx)、[Sidebar](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/Sidebar.tsx)、SidebarNavItem/Section、BreadcrumbBar | 改默认首页、分组/文案与按权入口；收敛上游 feature flag 分支，不把所有管理页面都暴露。公司上下文不能替代企业部门/内容权限 |
| 任务列表、看板、项目与详情属性 | A：Paperclip [Issues](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/Issues.tsx)、IssuesList/IssueRow、[KanbanBoard](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/KanbanBoard.tsx)、[IssueDetail](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/IssueDetail.tsx)、Projects/IssueProperties | 复用原 ID、状态与查询；接真人认领/部门筛选/企业命令。详情大页面按依赖拆接，不能原封不动承诺全部可用，也不另外写第二套详情/看板 |
| 对话列表、群内回复、输入与折叠 | A：选择性保留 OpenMausBot [GroupView](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/GroupView.tsx)、ChatView/ChatMarkdown、bot-access/RoomComposer、RoomClusterLabel、ToolActivity、[chat-bubble](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/chat-bubble.ts)、activity-runs | GroupView 直接依赖 useStore/api、Bot/Group/Message、group-routing、偏好/语音/调用等，不是独立 SDK；优先抽 RoomTextMessage/Transcript，而非原样挂载整页。RoomComposer 只是旧门控与 Composer 转发，应抽实际编辑器/提及源码。保留渲染能力、提取必要依赖，换 DTO/命令/附件授权接口；不复制完整全局 CSS、Store、自动触发或企业云后端。Paperclip 已有 IssueChatThread，不能再并列维护两份可写讨论流 |
| 任务附件、成果关联、运行/费用展示 | A：Paperclip IssueAttachmentsSection/IssueDocumentsSection/IssueRunLedger、Costs 等现有展示候选 | 先复用现有展示；补公司确认保存/验收/版本与部门归属，不重复建资产正文和成本账；下载与执行日志按权 |
| 我的工作、部门/跨部门范围与消息任务资产关联 | S 薄组合 + A 上述组件，归 B01/B02/B06/B08 原八项边界 | 自建的是企业规则、投影与受控命令，不是重做页面组件。复用一个 task/run/asset 身份；普通消息零唤醒，原生评论/分配等入口也受控 |
| 计划甘特 | S 计划视图适配/缺失日期契约；优先选许可兼容的现成绘制组件，组件本轮未选，不自建通用排程引擎 | Paperclip [Timeline](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/Timeline.tsx)展示 actor/run 活动，不是任务计划甘特；核心 issues 的 startedAt/completedAt 不能冒充计划日期。Multica gantt-view 使用 start_date/due_date，可参考交互但本期不复制其源码。首版只读，未排期单列，依赖和范围同源 |

**最小提取验证顺序（实现授权后，当前 NOT RUN）：**①固定 Paperclip UI/服务兼容版本，运行其基本布局＋一条真实 issue；②在同一主题/路由内提取 OpenMausBot 一个 Bot 回复、富文本附件与输入器，再扩群署名和折叠；③P1 接同 task ID 的首页/对话/看板/成果即运行越权/撤权/普通消息零唤醒/重复提交/离线负测，未过不能继续扩页；P1 首页若展示期限/逾期，最小截止日期来源与时区先按 C02 冻结；④P2 再冻结完整计划字段并补只读甘特，新增日期/依赖授权投影及跨视图回归。P0 无完整 UI 的安全/协议验证顺序不变，不等前端提取完成。不能因前端都用 React 就认定即插即用：Paperclip 与 OpenMausBot 的所查锁文件均为 React/ReactDOM 19.2.8；此前把 OpenMausBot package.json 的 ^19.1.0 声明范围当成实装版本不准确，现纠正。仍需核对构建、主题、路径别名和传递依赖。

提取失败条件：必须运行第二身份/任务服务才能展示；为组件直连不受控 API；两份任务状态/评论写权威；全局样式或路由冲突无法局部收口；普通消息引发隐式 run；无权元数据或附件露出；许可或必要传递依赖不可用。先替换最小耦合点并复验，不用“全盘重写”或“全部照搬”掩盖。若只读甘特日期契约未过，显示未排期/功能未开放，不拿执行时间伪造。

所有提取登记上游仓库/SHA/文件、许可/NOTICE、依赖闭包、本地目标、改动理由、验证和升级策略；Paperclip MIT 与 OpenMausBot 核心 Apache-2.0 及第三方通知保留，enterprise 目录不列入可复制边界。源码优先不是把三个完整前端同时装进客户端。工程约束见 [工程基线 §5.2.1](D:/dev/morchat.co/docs/ENGINEERING-BASELINE.md)。

### 4.4 源码依赖深查与最小适配方案（2026-11-05）

三路只读研究分别检查 Paperclip UI、OpenMausBot 对话依赖及 @→派发链。结论是**找到可以保留源码的切点，不支持“即插即用”，也未发现必须整套重写的证据**。尚未把组件提取后编译/启动，因此只能标“静态切点已核验，构建/运行 NOT RUN”，不能承诺已拆成可用 SDK。引用定位于本文件固定 SHA 的本地参考；HEAD 已核对，不宣称另行完成全工作树洁净或全依赖合规证明。本轮不改产品/参考源码，不安装依赖。

#### 4.4.1 Paperclip：保留一份应用基础，不反代整个管理员产品

- **应用入口不是只有 Layout。**[main.tsx:106–139](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/main.tsx#L106-L139) 包含 QueryClient、Theme、Router、Company、Breadcrumb、Sidebar、Panel、Dialog、实时与插件 Provider；[App.tsx:765–805、867](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/App.tsx#L765-L805) 有身份门及 Layout/Layout.production 分支。[Layout:1–67](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/Layout.tsx#L1-L67)、[Sidebar:75–125](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/Sidebar.tsx#L75-L125)、[BreadcrumbBar:17–50](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/BreadcrumbBar.tsx#L17-L50) 还带原生对话框、实例设置、运行/attention/插件。最小验证建议固定 Layout.tsx 和选定新版 IssuesList 路径，保留壳/响应式/详情栏，替换真实用户权限上下文，禁未选 feature 分支与插件/管理员菜单；不是维护两套 Layout。
- **列表/看板值得原样保留交互。**[Issues:295–385](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/Issues.tsx#L295-L385) 的真实分页/排序/更新链接 IssuesList；[IssuesList:703–784](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/IssuesList.tsx#L703-L784) 及 [935–977](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/IssuesList.tsx#L935-L977) 另依赖会话、目录、标签、workspace、搜索/关系。IssueRow/KanbanBoard 渲染和拖拽可保留；[KanbanBoard:392–458](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/KanbanBoard.tsx#L392-L458) 的 onUpdateIssue 在外层改接企业命令。ACL 要先于分页/搜索/计数，不能取原生一页再过滤而让 lastPage.length 假称已到尾。
- **详情保留结构与子组件，换控制器接缝。**[IssueDetail:3336–3377](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/IssueDetail.tsx#L3336-L3377) 先取核心再取详情/历史，随后仍读目录、run、Board 权限和实例设置；[1478–1483](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/IssueDetail.tsx#L1478-L1483) 还切 IssueChatThread/TaskChatThread。保留属性、附件/文档、RunLedger，裁未用 workspace/plugin/trace 和原生评论写入，接同一对话投影，不新增第二详情与第二可写评论流。RunLedger/Costs 的管理及供应商明细另授权，不当普通任务必需查询。
- **不只改 api/client 一个入口。**[client:130–196](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/api/client.ts#L130-L196) 同源 cookie 请求及按 URL 合并 GET；[queryKeys:376–415](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/lib/queryKeys.ts#L376-L415) 有仅对象 ID 的键；[cross-tab-poll:471–476](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/lib/cross-tab-poll.ts#L471-L476) 按公司共享。企业会话需 principal/company/授权与缓存代次隔离；切号/撤权取消旧请求、清理缓存/乐观状态，并拒绝迟到旧代次结果。首版关闭跨标签数据共享，未证明安全不启用。原生 [LiveUpdatesProvider](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/context/LiveUpdatesProvider.tsx#L2214-L2287) 的 WS 会更新缓存/通知，不能绕企业过滤直接接入；任务首轮可受控轮询或授权失效通知，消息仍按持久游标可靠补拉。
- **附件绕过通用 JSON client。**[IssueAttachmentsSection:39–84](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/IssueAttachmentsSection.tsx#L39-L84) 直接 fetch/contentPath、href，后续还有 src。所有预览、缩略图、下载、Range 都经受控不透明资产地址和当前权限；不可只替换列表 API 后保留文件直链。
- **构建基础沿用而非重复安装。**保留选定 Paperclip 包/锁/主题与别名；[index.css](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/index.css#L134-L208)、[ui/package.json](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/package.json#L31-L102)、[vite.config](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/vite.config.ts#L44-L49) 涉及 Tailwind、Router、Query、Radix、dnd-kit、@paperclipai/shared 运行时导出及 adapter/plugin 工作区依赖。裁入口后由真实构建确认闭包，不仅拷 JSX/类型，也不先为所有功能安装上游全栈。

#### 4.4.2 OpenMausBot：复用消息与编辑器源码，不搬 Store

| 保留的源码 | 需要替换/裁剪的接缝 |
|---|---|
| [GroupView:140–308、311–527](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/GroupView.tsx#L140-L527) 的 RoomTextMessage/Transcript、署名、气泡和折叠；ChatView 的必要 Bubble/groupTranscript 差异 | GroupView:332–369 的 Store/偏好/重试改 props/回调；整页后半的语音、群任务、文件夹与路由不移植。MessageBoundary 从独立文件取，避免经 ChatView 重导出牵入 EngineSetup；群/任务/单 Bot 共用一套消息行 |
| [MentionTextarea](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/MentionTextarea.tsx)、MentionText、mentionQueryAt/mentionChoicesForQuery、MentionMenu 的列表/键盘；[Composer:333–387](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/Composer.tsx#L333-L387) 的候选/插入及 869–907 IME 逻辑 | [RoomComposer:8–11](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/bot-access/RoomComposer.tsx#L8-L11) 只是旧 yourAccess 门控＋转发，不是独立编辑器。保留实际输入源码，去模式开关、原自动路由、@everyone/@devs/品牌及 TeamOwner 依赖，注入有权 Bot 候选与发送回调；提及稳定 ID/锚点是本项目新增适配 |
| RoomClusterLabel、chat-bubble 的形状/接角、ReplyQuote/复制、formatted-reply/ReplyBlocks、ActivityRun/TurnNarrationRun | 使用宿主头像/导航/翻译/工具回调；避免 Avatar→品牌图形及 chat-bubble→lib/failed-turn→EngineSetup。纯 failed-turn 可直接取 shared；不保留原账号/引擎设置/Team Cloud/TTS/置顶等不需要的动作 |
| [activity-runs:72–158](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/lib/activity-runs.ts#L72-L158) 的同轮旁白/工具折叠与 [ToolActivity:16–76](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/ToolActivity.tsx#L16-L76) 展开展示 | 旁白靠 turnId/terminal，但连续成功工具分组未检查 turnId；须按 task/run/turn 再切，同 Bot 并行两 run 不能混组，无可信关联不合并。旧 /api/threads/.../tool 改按权读脱敏输出；审批/失败/暂停/停止不能被折叠隐藏 |
| [ChatMarkdown](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/ChatMarkdown.tsx#L590-L647)、markdown-render-cache/tables/code-block、按需公式和 strict Mermaid | 裁 ThreadRefs→Store、page-open→store-ref/native、file/UNC/obsidian 等分支；链接/剪贴板走宿主白名单能力，不启用 rehype-raw，富文本不得触发 IPC/执行。只摘对话所需样式/token并作用域化，不复制全局字体/:root/skin |
| ComposerAttachments/AttachmentGallery/AttachmentPreview 的拖拽、缩略与预览交互 | [composer-attachments:312–358](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/lib/composer-attachments.ts#L312-L358) 的旧上传 API、683–740 的 attached-file/image 与宿主路径不是本项目存储协议；改资产/version ID。AttachmentPreview 的消息文件路由、源偏移/reveal 改受控读取；[外链图不自动加载:824–869](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/AttachmentPreview.tsx#L824-L869) 保留或更严。HTML/高级预览先后置，不为了展示引入整套 native |

所查核心 src/shared 字面导入链未发现必须引入 enterprise 的证据，但不是全依赖许可证扫描；最终裁剪闭包仍须保留 Apache-2.0、适用 NOTICE/修改说明，并排除品牌与 enterprise。若带引用选择器，NOTICE 的 T3 Code MIT 也保留。所查 [OpenMausBot lock:114–119](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/pnpm-lock.yaml#L114-L119) 锁 React/ReactDOM 19.2.8，不能把 package.json 范围 ^19.1.0 写成实际冲突。

#### 4.4.3 @ 的上游事实与我们的取舍

OpenMausBot 候选有 ID，但 [Composer:375–383](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/Composer.tsx#L375-L383) 只插 @name；[client store:2694–2707](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/state/store.tsx#L2694-L2707) POST text/replyToId/threadId/sendId/mode，没有稳定 mentions。服务端 [mentionedBots/roomResponders:210–286](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/store.ts#L210-L286) 扫原文、最长名字优先、同名取首个，@everyone 可广播，无 @ 也可启动默认 member/everyone/auto；[自动选择:10918–11052](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/index.ts#L10918-L11052) 还可能调用辅助模型。路由不解析 Markdown，所以引用/围栏中某些 @ 仍会命中，不以显示层高亮规则推断执行安全。

[Bot 最终文本接力:10656–10710](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/index.ts#L10656-L10710) 有条件允许最多一跳 @ 同群 Bot；[单 Bot 编辑:454–496](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/routes/bot-messages.ts#L454-L496) 可以重新 startTurn。@all 只在 [room-holds:67–79](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/room-holds.ts#L67-L79) 作停止/恢复别名，不是普通 @everyone 等价词。已有 sendId 指纹与消息 patch 思路可复用，但不是跨 Paperclip 的统一执行幂等证明。

**采纳它的 @ 输入体验，不采纳这些自动执行默认。**群内没有模式选择：@ 有权 Bot 并发送即可；后台接稳定目标、正文修订/锚点、真实发送者与统一意图回执。其他上游默认触发不用。完整产品/执行规则以 [群协作 §4.3.1](D:/dev/morchat.co/docs/DISTRIBUTED-COLLABORATION.md) 为唯一正文，不在前端另造规则。

Paperclip [单承接者约束](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/issues.ts#L10209-L10210) 禁止同 issue 同时真人/Agent 承接；@ 不能偷换真人 assignee。优先复用 [原生 children 入口](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L12969-L13046)，每目标独立 Bot 子任务、共享父工作/root；可继续的原 Bot 任务才沿用。[createChild 幂等](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/issues.ts#L9652-L9684) 后路由仍可能 [assignment wake](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L13189-L13199)，因此必须统一派发回执。多目标部分提交逐项显示，不伪称原子回滚。原生 [agent:// mention grant](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/authorization.ts#L1705-L1753) 可影响权限，不把普通引用自动转成该链接；当前已核实的唤醒是评论/分配等路径，保留 issue_comment_mentioned 原因枚举不证明当前独立 Agent mention 唤醒分支存在。

#### 4.4.4 四个最小接缝，不增加第九个模块

| 接缝 | 输入/输出与职责 | 所有权 |
|---|---|---|
| 企业会话与 UI 数据网关 | 真实 user/company/scope/授权代次；默认拒绝的路由/动作/字段白名单，返回选定 Paperclip 响应形状。读条件在分页前生效，写经过原生权限+企业准入，必要 hook 最小扩展；不做 /api/* 透明代理、不下发管理员凭据、不跨库写表 | B01＋B02；身份/原生不可绕过处由 Paperclip owner 联审 |
| 原生任务命令适配 | 原生 task/parent/assignee/revision/state/run；认领、状态迁移、@ 委派、重试与回执。沿用原 ID/状态/查询，只保存投递关联，不另存任务生命周期；一条委派只走一个有效派发路径 | B02＋B06，C02/C06；原生不足评审最小补丁 |
| 对话展示与消息桥 | thread/受众、消息 ID/revision/游标、真实 author、body/reply、稳定 mentions、assetRefs、task/run/turn/terminal、步骤/审批。组件收 DTO 和动作回调，不读旧 Store；消息/原生事件按来源投影，前端不猜 run，不把隐藏推理当正文 | B02；触发/限额遵循既有 C02，消息留存与任务权威分开 |
| 资产/工具输出展示桥 | 不透明 asset/version/message/step ID；upload/preview/download/readToolOutput、取消信号及当前权限。同源受控 URL，包括图片/Range/下载；富文本/本地路径不能直通 IPC。保留成功保存与正式验收区别 | B02＋B04，上传/自动保存接 B07，不重建文件库 |

候选 DTO/字段只表达边界，C01/C02/C04/C06 对应部分仍 DRAFT，不据此让各 agent 自行定接口。原生查询可复用而入口必须统一，企业层不伪造 Board 身份。现有 Windows 本地完整 harness、公司 Key 网关和唯一 Paperclip 调度均不变。

#### 4.4.5 最小提取验证与判失败（全部 NOT RUN）

以下是获实现授权后的 D08/P1 提取验收，不是要求先建设全 UI 才做 P0。P0 既有版本/权限/接续/MSG 顺序不变；真实桥接负测与第一条产品链路同步，不等甘特或最终上线。

| 验证 | 最小证明与判失败 |
|---|---|
| FE-01 构建/依赖闭包 | 一份 Paperclip UI 构建，挂载所选壳/列表/详情＋两 Bot 消息/输入。若仍须第二账号/任务后台、未批准 enterprise/native/engine setup、第二 Router/QueryClient/全局主题或一改 Store 即牵入整个旧应用，判提取失败；先修最小接缝，不直接宣布全重写 |
| FE-02 权限与缓存 | 同公司两用户不同范围；深链、目录、搜索/计数/分页、badge、实时/补拉、切号/撤权中的迟到请求与跨标签。任何越权正文/元数据、先取后隐藏、旧身份响应写入新缓存即失败；数据无法在分页前授权则不得宣称功能成立 |
| FE-03 @ 与单一任务 | 普通群消息零 run；有效 @ 唯一目标；同名/改名/隐藏/失权、引用/code/粘贴/Bot输出/编辑/@everyone；真人父任务、多 @、双击/重连/创建成功ACK丢失及原生评论/PATCH。错派/群播/覆盖真人负责人/多跑/未知结果报成功即失败；复用 MSG-01/03/04/06，不另造测试平台 |
| FE-04 归属与折叠 | 两 Bot 同线程、同 Bot 两并行 run、乱序重复事件、无 turnId、审批/失败/停止混入工具事件。串 run、按文本误删回复、伪造流式/完成、隐藏关键待决、混合不同受众即失败 |
| FE-05 附件/富文本 | 图片/src/href/Range/下载/缓存、撤权后再读、恶意 Markdown/HTML/file/UNC/外链图、工具原文含秘密。绕受控读取、自动加载不准外链、触发本机 IPC、泄露隐藏推理/凭据或待上传显示已交付即失败 |
| FE-06 同源写入/失败反馈 | 首页→对话→同 task 看板/详情→同版本成果；状态写被拒后回滚乐观展示，消息已收≠派工成功；多目标部分受理与未知逐项对账。双任务/双可写评论权威、状态漂移、静默新建意图重跑或用UI状态代替原生事实即失败 |

最短顺序：先 FE-01 的壳/真实任务，再嵌两条消息与 @ 编辑器，并立即 FE-02/03/05；再测并行/乱序 FE-04 与跨入口 FE-06。Gantt 只在 P2 日期契约通过后增加视图，不混入提取前提。若需原生扩展先归类为适配/核心 hook 缺口，测不过即阻塞相应功能；只有必须依赖第二任务权威、扩大权限或整套未获准服务才能成立时，否决当前组合。静态阅读不能替代这一步。

### 4.5 完整操作链深读：复用交互，不重复建设控制后台（2026-11-05）

三条独立只读审计覆盖人工介入、文件/组队、记忆/skill；固定 SHA 同 §1。以下是源码事实及设计取舍，**没有构建或运行测试，不能据此宣称拆出组件或 DSH 桥接已经通过**。D=原生能力直接消费或无状态展示片段可抽取；A=替换数据/命令/授权边界；S=必须补的企业语义，仍归 B01–B08，不增加新产品后台。完整 UI 容器不是 D。

| 操作链 | 已有轮子与可复用源码 | 最小适配 / 必须补齐 |
|---|---|---|
| Bot 追问 → 人回答 → 继续 | D Paperclip interaction、回答事务/投递 outbox、AttentionInteractionResolver/IssueThreadInteractionCard；OMB QuestionCard 的选项/自由回答交互 A | 同一原生 interaction 在首页与线程投影；当前有权回答者、原问题/run 对应、离线迟到答案与 DSH 回调桥。已记录答案不等于 harness 已消费 |
| 请求批准 → 决策 → 实际动作 | D Paperclip 原生决策/幂等与审计；A OMB PendingApproval 的动作详情呈现 | 区分治理审批、runtime 工具许可、业务验收，分别绑定实际原生对象；工具请求还绑定参数摘要/版本/期限/执行尝试。缺适合原生类型才做最小扩展；不建第二审批引擎 |
| 运行中补充 → 编辑/撤回 → 下一轮或中断 | D Paperclip queued-comments 的修改/删除、revision、steer/interrupt 回执；A OMB Composer 的待处理条目和冲突反馈 | 普通群消息不入执行队列；只为明确追加要求建原生条目。实际 driver 不支持同轮 steer 就等待安全下一轮或显式中断后续跑；不能另起可编辑输入队列 |
| 停止运行 / 停止本次协作 | D Paperclip 单 run cancel、人工停止归因；A OMB 停止/队友状态反馈 | S 仅补既有 root 范围上的停止准入与逐原生 run 取消聚合、设备真实停止证据；无权分支不可控制。不能把中断并续跑当停止，也不造第二调度器 |
| 文件产生 → 归档 → 提交 → 验收 | D Paperclip assets/issue attachments、TaskAttachmentPanel；A OMB ComposerAttachments、AttachmentPreview、ComputerFilesPane 展示 | 替换 window.ogb/本地路径与个人 Cloud；补上传幂等、不可变版本、当前来源权限交集和指定人验收。路径存在/上传成功不是验收 |
| Bot/小队草稿 → 预览 → 生效 | D Paperclip AGENTS/TEAM、catalog/portability preview、配置 revision；A OMB NewBotDialog/BotSettingsDialog/TeamImportDetails 等分区展示 | B03 只补真人槽位、复用已有 ID、变更预览、授权与版本组合。Bot 新建/更新显式区分，依赖失败可见；不移植 OMB importer/store 或自动升级 |
| 记忆纠正 → 版本 → 再使用 | D Paperclip documents/revisions/annotations 与既有资产；A OMB MemorySection 的加载预算/差异/冲突草稿展示 | B04 关联知识来源/范围，条件更新及恢复；B05 按 run 物化获准只读版本。不建第二 MEMORY 库，不把本地日志/Undo 当公司审计 |
| skill 提案 → 测试 → 发布 → 撤回 | D Paperclip fork、不可变版本、测试 issue 与成本；A OMB 暂存/base hash/过期 Undo 提示 | B03 补业务评审、传播授权和显式版本生效；普通运行只提交候选，不自改 live。固定版本及来源撤权贯穿后续运行 |

#### 4.5.1 人工介入：Paperclip 已有能力比“只做任务底座”更多

- **追问持久化：**OMB [QuestionCard](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/QuestionCard.tsx#L126-L134) 经 [respond 路由](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/routes/bot-messages.ts#L685-L712) 找原提问 Bot；其 [Codex 内存请求](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/drivers/codex.ts#L982-L998) 不是跨崩溃工作状态。Paperclip [回答路由](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L17804-L17880)、[回答与 outbox 事务](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/issue-thread-interactions.ts#L5335-L5437)及[原问题投递/旧答案不 steer 新 run](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/question-response-delivery.ts#L1110-L1174)应直接复用。已有 [AttentionInteractionResolver](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/AttentionInteractionResolver.tsx#L98-L180)，不要为了统一 OMB 外观重建同类控制卡。
- **批准与实际执行分离：**OMB [PendingApproval](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/PendingApproval.tsx#L258-L280) 的 once/session/always 按钮不等于公司授权模型；Paperclip [决策幂等](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/lib/approval-records.ts#L24-L68)及[批准后唤醒](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/approvals.ts#L296-L355)是已有能力，但不能把治理审批直接当任意 runtime 工具权限。不得搬默认 Full access、权限 max 继承或 Always allow；中文必须用结构化“需真人回答”，不能依赖 OMB [personOnly 语言词干判断](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/runtime/questions.ts#L4-L22)。文档声称“永不代答”和 runtime 允许 Bot/default 代答并不一致，不当安全保证。
- **补充与停止：**Paperclip [PATCH/队列中断](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L16653-L16779)、[steer](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L16791-L17064)、[DELETE](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L17072-L17105)已有 revision/审计；OMB [编辑先撤回再回填草稿](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/Composer.tsx#L441-L459)只作交互参考。原生 [steer 协议判定](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/issue-queued-comment-queue.ts#L133-L169)及[活动 native session 依赖](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/native-runtime/native-session-executor.ts#L7268-L7335)说明 DSH/remote **尚未证明同轮 steer**。原生 interrupt 明确含继续意图，不能绑定普通 Stop。
- OMB [停止后队友继续](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/host/person-stop.ts#L68-L79)、[待发队列 survives Stop](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/steer-queue.ts#L1-L12)不能照搬为“本次协作停止”。优先 Paperclip [单 run 取消](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/agents.ts#L7179-L7209)、[取消即撤提交权](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/agent-run-cancellation.ts#L5-L31)、[停止前输入不自动续跑测试源码](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/heartbeat/run-control.test.ts#L640-L674)。这些不证明原生已有整 root 级联停止；范围聚合是最小补齐，测试源码也不是本项目已运行成绩。

#### 4.5.2 文件和组队：出现、安装、归档、生效不是一回事

- OMB [ComputerFilesPane](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/ComputerFilesPane.tsx#L13-L136)是近期本机变化；[FilesView](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/FilesView.tsx#L59-L154)主要是 Desktop/My Cloud，不是任务交付库。[attach_file](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/bot-attachment.ts#L74-L150)会复制字节，和[历史 Markdown 路径打开当前工作区文件](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/routes/threads.ts#L167-L283)必须区分。采用原生 [TaskAttachmentPanel](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/task-side-panel/TaskAttachmentPanel.tsx#L19-L118)及[上传/资产关联](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L19857-L20028)，补业务幂等和保留规则；[原生删除](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L20126-L20175)不能裸露为已验收交付的历史删除。OMB [同 UUID 异字节冲突](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/attachments.ts#L452-L474)可借鉴，不搬个人目录存储。
- 预览/图片/Range/下载都验当前任务与所有来源政策，不能复制 OMB [任一引用可见/无引用文件放行规则](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/bot-visibility.ts#L290-L304)。原生 [asset-content-access](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/asset-content-access.ts#L21-L69)已有检查，但仍须接企业群/来源限制。个人 Cloud 的冲突覆盖及可传部分 gitignored 文件不适合作公司资产入口；不能让 .env 因忽略规则差异进入归档。
- OMB [TeamDialog](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/TeamDialog.tsx#L14-L103)主要编辑侧边栏 Bot 分组，不是人类+AI+交付关系小队。只抽成员选择、[导入预览](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/TeamImportDetails.tsx#L16-L111)和配置分栏；Paperclip [catalog 预览/安装](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/teams-catalog.ts#L95-L124)与[导入/外部 skill 安装](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/teams-catalog.ts#L902-L949)仍可能部分成功，不能承诺一个按钮全原子。
- OMB 包可以带记忆，文件导入虽关闭 skill/暂停 routine/禁用空 MCP，仍可建默认 full Bot；[导入代码](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/package-import.ts#L250-L349)、[测试源码](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/team-share.e2e.test.ts#L80-L97)说明“导入安全”不是我们的权限闭环。[Org release](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/org-library-releases.ts#L74-L253)会自动更新未本地修改的实例内容；本项目不采用。模板只引用获准资产，不带记忆正文、秘密、旧 grants/会话/绝对路径或自动启用例程；自然语言改配置只产生可审差异，不自批生效。

#### 4.5.3 记忆和 skill：不能用“有 Undo”证明安全升级

- OMB 个人记忆 [expectedHash 可选/旧 PUT 无 hash](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/routes/bot-memory.ts#L72-L117)，[journal Undo](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/memory-journal.ts#L356-L369)直接回写 before，不检查当前 afterHash；日志异步失败、截断或脱敏也不等于可完整恢复。相对地，[team-memory](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/team-memory.ts#L212-L289)采用 revision 条件且恢复追加版本，不能混称“所有记忆都有 CAS”。关闭 memory 仅停相关功能，不等于文件工具失去访问权，见[官方 memory 说明](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/docs/memory.md#L150-L156)。
- 公司知识纠正优先 Paperclip [documents 条件更新](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/documents.ts#L372-L415)和[annotations](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/document-annotations.ts#L411-L430)。但 [restore](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/documents.ts#L611-L692)无 expected base：须将历史正文通过当前 baseRevisionId 条件更新，或最小扩展原生恢复接口，不能直接无条件覆盖。历史查询仍要补企业来源 ACL。
- OMB [skill stage/apply/Undo](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/skills.ts#L986-L1258)有基线和防重复/过期检查，可以参考；**Ask 模式也可能 direct apply，不只 Full**，见[direct-apply](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/direct-apply.ts#L1-L20)。[自动 review](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/skill-review.ts#L426-L489)是模型建议/可直接应用，不是业务回归通过；[共享库更新当前正文](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/server/skill-library.ts#L401-L440)不保证旧 run 固定字节。故不移植 updater、第二 skill 库或自动发布。

**收敛结论：**本轮不增加第九个模块。P1 打通人工问答/工具许可、原生补充队列、单 run/本次协作停止、文件归档验收和最小模板预览；P1 支持原任务/文档的最小条件纠正及候选留存；P2 补完整维护入口、受控恢复与 skill 发布复用；同轮 steer 仅能力验证后开放，不作为 P1 唯一路径。自动整理/批量学习/模板静默升级不进入首版。协议见群协作 §4.6、资产 §2.6；OP-01–08 在 Discovery §4.5，全部 NOT RUN。

### 4.6 全产品界面与能力盘点（2026-11-05）

本节是本轮四项目界面盘点的登记处，§4.3–4.5 继续负责抽取依赖与完整操作契约。按官方介绍/文档、固定源码实际路由/调用、morchat 取舍三层核对；不是截图相似即可以复制，也不是官网列出即当前样本默认可用。这里盘点全部主要产品面与操作类型，不宣称逐按钮、所有平台、所有商业功能均已运行验收。

**四条产品主线必须保留：组织与人员 → 工作与人工决策 → 能力成长与交付 → 连接、执行与治理。**Paperclip 是这四条线的整体产品底座，不再缩成任务 API 或页面外壳。B01–B08 是差异工作，不是完整功能目录；已有功能也必须登记入口、责任人、权限适配和启用条件。功能保留基线不等于首版全部启用。

标签：**D**=保留既有实现/服务（仍需权限接入）；**A**=抽取或企业适配；**R**=只借交互/规则；**T**=本期暂缓。D/A 不是测试通过。源码以 §1 的 SHA 为准，线上官方文档可能领先或落后；冲突记录具体差异，不用 README 营销说明覆盖路由和实际条件。

#### 4.6.1 Paperclip：完整工作台基线

主证据：[官方快速路径](https://docs.paperclip.ing/guides/getting-started/five-minute-path/)、[生产路由](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/App.tsx)、[当前默认导航](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/components/Sidebar.tsx)、[功能默认值](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/instance-settings.ts#L245-L345)。默认 streamlined UI；下表入口省略公司前缀。导航隐藏不是鉴权，API 仍须企业政策检查。

| 功能域 / 官方文档 | 固定样本中的入口、操作与条件 | morchat 处置与落点 |
|---|---|---|
| 总览与查找：[Dashboard](https://docs.paperclip.ing/guides/day-to-day/dashboard/)、[命令面板](https://docs.paperclip.ing/guides/day-to-day/command-palette/) | dashboard / dashboard/live、search；运行/任务/活动总览及对象定位，正常挂载 | D+A：首页改为我的工作，原生总览成为获授权部门/公司视图；搜索、摘要和计数同样过滤 |
| Bot 与 AI 汇报图：[Org](https://docs.paperclip.ing/guides/org/org-structure/)、[Agents](https://docs.paperclip.ing/guides/org/agents/) | agents/all、新建/详情、职责/上级/指令/模型/运行/配置修订；默认 org 跳到 Agents。[OrgChart](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/OrgChart.tsx) 使用 Agent 节点 | D+A：组织与 AI 内保留 Bot 名册、配置和图；真人部门另作授权扩展，不把人事部门画成 Agent |
| 公司与真人：[成员](https://docs.paperclip.ing/guides/org/members-and-access/)、[角色](https://docs.paperclip.ing/administration/roles-and-permissions/) | Settings 成员/邀请/加入审核/角色/移除，用户页任务与用量；部分行为依部署/Cloud 条件。[CompanyAccess](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/CompanyAccess.tsx) | D+A：保留原生 company/user/membership 生命周期；补真人部门、负责人、逐资源授权。不是另建账号主库，加入项目也不等于全部内容授权 |
| 工作收件箱：[Blocked](https://docs.paperclip.ing/guides/day-to-day/blocked-inbox/) | inbox/mine、未读/最近/Blocked/All；Tasks 合并 Inbox 需 streamlined + enableCombinedInboxTasks，默认未开启。[Issues](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/Issues.tsx#L93-L178)；MyIssues.tsx 不在生产 App 挂载 | D+A：我的工作以原生 Inbox/任务/交互投影；不拿遗留 MyIssues 或“无 Agent 的任务”当真人责任判断，不造 todo 表 |
| 人工决策：[Decisions](https://docs.paperclip.ing/guides/day-to-day/decisions/) | decisions、专题 queue 路由已挂；导航/轮询需 enableDecisions（默认关）；处理/暂缓/回看原请求。[attention API](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/attention.ts#L20-L54) 仍有 board/company 门禁 | D+A：统一首页待我处理及线程处理卡，优先原生 interaction/approval；不能为员工入口发 board 凭据，也不把开关当授权 |
| 目标/项目/任务：[目标](https://docs.paperclip.ing/guides/projects-workflow/goals/)、[项目](https://docs.paperclip.ing/guides/projects-workflow/projects/)、[任务](https://docs.paperclip.ing/guides/day-to-day/issues/) | goals、projects、issues 正常挂载；目标树、项目、列表/看板/详情、责任/父子/依赖/附件/讨论；Goals 导航默认隐藏，路由并未禁用 | D+A：工作主区复用同一对象与编辑；补目标真人责任和部门范围。计划日期先冻 C02；[Timeline](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/Timeline.tsx#L1-L6) 是实际活动甘特，不是计划排程 |
| 评审、审批和执行控制：[Approvals](https://docs.paperclip.ing/guides/day-to-day/approvals/) | 任务 in_review/按策略质量门禁；approvals 待批/全部/详情可批、拒、修订；另有 interaction、queued-comments、单 run cancel | D+A：原生卡片和动作优先；业务验收、治理审批、工具许可分开。DSH 传输/消费及整次协作停止只补缺口，详见 §4.5 |
| 例行工作：[Routines](https://docs.paperclip.ing/guides/projects-workflow/routines/) | routines 列表/详情已挂，手动/时间/时区/签名 webhook、并发/错过策略、运行与修订；不是任意 DAG | D，启用待定：保留原生能力登记；首版不新增自动化编辑器。若另行批准例程，只创建原生任务并经本地设备准入，离线不中央代跑 |
| Skills / Sources / Studio：[Skills](https://docs.paperclip.ing/guides/org/skills/) | skills、sources、studio/new 与 studio/:id 正常挂载，无独立 Studio 开关；浏览/导入/来源同步、编辑/fork/版本/测试输入/测试 run。[SkillStudio](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/SkillStudio.tsx) | D+A：资产与能力里的同一技能库/测试页；候选、业务评判、发布和实际获准版本消费需企业门禁。普通 run 历史 pin 的 Beta 条件不因 Studio 可见而消失 |
| 团队包与导入：[Team Catalog](https://docs.paperclip.ing/guides/org/team-catalog/)、[Import/Export](https://docs.paperclip.ing/guides/power/export-import/) | 正式导入/导出/预览冲突存在（Cloud-managed 限制本地 Import）；catalog API 与 [TeamCatalog 组件](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/TeamCatalog.tsx) 存在，但该 SHA 无生产 /teams-catalog 路由，只见 DesignGuide 示例挂载 | D+A：优先既有包/preview/import，受控接入口或片段；不声称现成 Catalog 页可直接打开，也不新造包格式。仅补真人槽位、冻结来源、幂等应用与授权 |
| 成果与知识：[Artifacts](https://docs.paperclip.ing/guides/day-to-day/artifacts/) | artifacts 正常挂载，跨任务检索/回源；原生 documents/revisions/annotations，批注/解决/重开。[Artifacts](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/Artifacts.tsx)；V1 外观和 Conference Room 另有开关 | D+A：公司成果目录和任务内成果共享版本；补来源 ACL、保留及明确验收，文档正文不另建第二编辑库 |
| Apps / 连接 / 动作审查：[访问模型](https://docs.paperclip.ing/connectors/access-model/)、[权限](https://docs.paperclip.ing/connectors/action-permissions/) | apps 正常挂载，核心 enableApps 在源码固定 true；官方仍有实验栏目，不能因此写全部默认关闭。浏览/连接、按人/Agent/公司分享、Allowed/Ask/Off、Review、刷新/重连/断开；Chat/GitHub/Memory/BYO 等各有条件。[AppDetail](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/apps/AppDetail.tsx) | D+A：应用与连接复用原生连接/授权/审查，不移植 OMB 市场；补业务资源范围与调用时权限，首版生产外部只读。工具、消息通道、模型连接三类门禁不得混同 |
| 公司模型：[自定义供应商](https://docs.paperclip.ing/connectors/custom-model-providers/) | AI 连接、Bot harness 模型设置、Settings Connections 的 Decision Model/防注入/条件 Fast Response 是不同对象；[CompanyConnections](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/CompanyConnections.tsx) | D+A：公司 Key 服务端保管及 DSH run 准入另验；员工只选获准模型。原生 AI router 不是已验证的任意协议网关；首版关闭未绑定 task/run 的自动模型功能 |
| 活动/运行/费用/预算：[Activity](https://docs.paperclip.ing/guides/day-to-day/activity-log/)、[Costs](https://docs.paperclip.ing/guides/day-to-day/costs/) | Audit 汇合 Activity、Commentary、Runs、Costs、Budgets、Timeline；公司/项目/Agent 预算及用户费用，政策控制硬停。[AuditHub](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/audit/AuditHub.tsx) | D+A：用量与治理同源，按个人/部门/公司范围投影；不另造运行和成本账，不承诺原生有部门/个人硬预算，不向全员开放原始审计 |
| 工作区/执行环境：[Workspaces](https://docs.paperclip.ing/guides/projects-workflow/workspaces/)、[Adapters](https://docs.paperclip.ing/reference/adapters/overview/) | 项目工作区；隔离详情需 enableIsolatedWorkspaces；执行环境/adapter 安装、隐藏、重载等受设置条件和管理权限制。[AdapterManager](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/ui/src/pages/AdapterManager.tsx) | D+A：设备与运行复用能对齐的工作区/日志/配置，Windows 授权池与 PCWS 接续仍需补；不将 worktree 当隔离，不给员工任意安装 adapter |
| 设置/插件/实验：[Settings](https://docs.paperclip.ing/administration/settings/) | General、成员、Secrets、Profile、实例 Access、Adapter、Plugins、Experimental；Cases/Status Cards/Agent Chat/Conference Room 等有开关，DEV harness/DesignGuide 不算生产功能 | D 或 T：个人偏好与获权管理分开；新增插件/实验入口逐项登记，不跟随上游默认升级自动开放。决策训练有[快照/JSONL API](https://docs.paperclip.ing/reference/api/decision-training/)，本 SHA 未见产品消费页，T；不同于 Skill Studio 或模型训练 |

#### 4.6.2 OpenMausBot：补足工作对话，不搬第二个平台

官方入口来自其 README 与 docs 部署说明：[主站](https://www.openmausbot.com)（当前跳转 mausbot.com）、[文档](https://docs.openmausbot.com/docs)。以下按固定 SHA 检查；团队云/远端 Client/个人桌面功能不能混成所有安装都有。源码优先抽取仅适用于许可与依赖闭包可验证的展示子件，不表示完整 ChatView/Composer/Sidebar 可以无改动嵌入。

| 功能域 / 官方入口 | 实际操作与关键条件 | morchat 处置 |
|---|---|---|
| 导航、快速创建与搜索：[Quick Tour](https://docs.openmausbot.com/docs/getting-started/quick-tour) | Bot/群/模板、置顶/分组/搜索；Simple/Advanced 收纳方式不同；高级 Attention、工具和部分独立聊天入口 | R+A：借快捷入口/导航习惯，不搬第二侧栏或模式系统；我们的默认首页始终是我的工作 |
| 私聊、线程、群与共享：[Bots](https://docs.openmausbot.com/docs/features/bots-and-tasks)、[Teams](https://docs.openmausbot.com/docs/features/chat-and-teams) | 同 Bot 多线程、归档/提醒/移动/链接；Bot view/chat/edit；群选 Bot、说明/目录/谁答。文件夹不是权限墙，thread 不是 Paperclip issue | A：消息呈现/成员选择/范围标识可抽；群由企业协作域管理，任务引用 Paperclip；不用 OMB thread 另造任务 |
| @ 和路由：[群规则](https://docs.openmausbot.com/docs/features/chat-and-teams#groups) | 指定成员/Everyone/mentions-only/Auto；[Composer](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/Composer.tsx#L375-L385) 选中候选后插 @名字，发送文本；无 @ 也可走 lead/Auto | A：只抽候选呈现与键盘行为，改为稳定 Bot ID 意图和发送时验权；不移植名称解析、自动选人、Everyone 和普通发言唤醒 |
| 消息动作/查找/导出：[消息工具](https://docs.openmausbot.com/docs/features/attachments-and-search) | 当前聊天查找、全局搜索/跳原文、复制/固定/反应/历史操作/导出；[SearchResults](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/SearchResults.tsx) | A/R：首版保留必要搜索、回源和复制；复杂反应/分叉/批量聊天管理 T。跨入口按来源授权，不因搜索命中即能读正文 |
| Attention、Bell 与团队 Inbox：[团队 Inbox](https://docs.openmausbot.com/docs/features/chat-and-teams#your-inbox-teams) | Attention 是运行/等待聚合；Bell 是设备 opt-in Feed，remote client 不显示；Team Cloud Inbox 有 Needs you / For your info / Done，并回原问题处理 | R：统一投影 Paperclip 原请求；不复制三套待办、已读或审批状态。任务通知与独立普通群未读仍区分 |
| 追问/许可/登录接手：[审批与 Inspector](https://docs.openmausbot.com/docs/features/approvals-and-inspector) | 选项/自由答、工具参数、允许/拒绝、登录接手/Done、活动 Inspector；remote client/引擎限制；Ask 也可能 direct apply | D 优先用 Paperclip；A 仅补排版/必要操作体验。不移植审批引擎，不因 Ask 即认为技能/记忆变更已经受企业发布控制 |
| 补充/队列/steer/停止：[线程操作](https://docs.openmausbot.com/docs/features/bots-and-tasks) | 排队、编辑/撤回、依引擎 steer/中断续跑；群单 Bot Hold/Resume；Stop 当前不保证停队友，队列可留存 | A/R：Paperclip queue/cancel 正本；DSH 未验证同轮 steer 就下一安全轮；普通停止/中断继续/整次协作停止明确分开，不采其默认范围 |
| 附件、Computer Files、Library、My Cloud：[文件](https://docs.openmausbot.com/docs/features/attachments-and-search)、[维护说明](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/docs/files.md) | 粘贴/拖放/预览下载；会话 Library 汇总分享文件/页/应用；FilesView 须桌面桥且 My Cloud Ready，另有目录同步/冲突，不是公司资产库 | A：抽附件/预览子件，替换存储与 IPC；同一 Paperclip artifact/version。个人 Cloud 同步、发布站点/应用 T；本机路径不是历史版本 |
| Computer / Browser：[电脑](https://docs.openmausbot.com/docs/computers)、[Local VM](https://docs.openmausbot.com/docs/computers/local-vm) | Off/Auto/本机/VM/Cloud/VPS、实时预览/接管和独立浏览器；按 backend/授权/ready。Windows [capabilities](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/electron/capabilities.cjs#L61-L85) 与 [CUA](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/electron/cua.mjs#L131-L158) 有 embedded helper 分支，公开文档平台列表与 pin 不完全同步 | R/T：借运行地点/能力诊断/接手反馈；不移植 OMB runtime、CUA、VM 或 Cloud。不能说 Windows 能力不存在，也不能说已实测可用 |
| Bot 设置/模板/Team Map：[First Bot](https://docs.openmausbot.com/docs/getting-started/first-bot)、[Departments](https://docs.openmausbot.com/docs/features/chat-and-teams#departments) | 快速新建 Bot 与模板草稿不同；设置身份/职责/Soul/模型/工具/技能/历史。部门分组不是 ACL；模板导入可带 seed.memory，组织发布可静默更新未改实例 | A/R：借设置分栏、缺权/差异预览；正文配置仍用 Paperclip，模板部署用原生包。真人小队另绑定，禁止导入旧 grants/私人记忆/秘密及自动更新生产实例 |
| 记忆与 Skills：[Memory](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/docs/memory.md)、[SkillsSection](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/src/components/bot-settings/SkillsSection.tsx) | 来源/主题/预算/整理/Undo；个人 Undo 不检查当前 afterHash，团队 memory revision CAS 不同；技能私有/共享/本机/引擎来源，开关及学习/Stage/Apply/Undo 分属不同路径 | A/R：抽来源徽标/差异/冲突提示。Paperclip documents/skill/测试为正本，候选不改 live，不另起 memory/skill runtime；自动整理/自动巡检 T |
| 自动化与应用：[Automation](https://docs.openmausbot.com/docs/features/automation)、[Apps](https://docs.openmausbot.com/docs/connected-apps) | 例程列表/日历/手动/暂停/回卡/计划；webhook 接收器要在线，应用事件依连接服务。Apps OAuth、自建 MCP、网站登录不同；自带 Composio 不等于官方托管能力 | R/T：例程与连接选择 Paperclip 单一实现，不搬 OMB 调度/市场；复杂日历/任意 MCP/生产写工具不进首版 |
| 公司登录、设置、Host/Client、诊断：[Organisation](https://docs.openmausbot.com/docs/getting-started/organisation)、[Companion](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/docs/desktop-companion.md)、[Logs](https://docs.openmausbot.com/docs/troubleshooting/logs) | 公司模型网关、个人模型可并存；Host、远端桌面 Client、自托管和 My Cloud 不同；设置有用量/访问/备份/并发/超时/脱敏诊断 | A/R：借公司接入和就绪诊断，固定公司 DSH 路线；不让员工选个人 Key 回退，不移植 OMB 账号/运行/成本后台 |
| 语音、移动及偏好：[Voice](https://docs.openmausbot.com/docs/features/voice-and-memory#take-turns-or-live) | 朗读/便笺/听写/Take turns 与 Live 不同；前者部分 macOS 限制，Live 文档列桌面/iOS/Android，可能向服务发送对话/审批，服务/角色有条件 | T：首版文本、键盘和可读状态优先；不把全部语音误写成 macOS-only，不因上游支持就扩大公司数据出口 |

OMB 主体 Apache-2.0，enterprise/ 为另行授权，详见 [LICENSING](https://github.com/milind-soni/OpenMausBot/blob/597e70d7930db632747acfb4ea047ca520bd958c/LICENSING.md)。本期不复制 enterprise/，不带商标/吉祥物；每个拟抽文件仍查依赖与 NOTICE。整套 App/Store/Composer 控制逻辑不是可直接复用组件库，抽不净的局部按统一契约替换，不为保留外观引入第二控制面。

#### 4.6.3 Multica：工作组织与交付体验参考

[官方文档](https://multica.ai/docs)与固定 58402f5 样本交叉阅读；本项目继续 **R**，不复制代码、不部署后台。源码链接用于证明界面存在，不表示许可采用。上线官网与 pin 的差异单列。

| 功能域 / 官方文档 | 实际入口和操作 | 对我们的启发与不能照搬处 |
|---|---|---|
| Workspace / Members：[工作区](https://multica.ai/docs/workspaces)、[成员](https://multica.ai/docs/members-roles) | 切工作区、Team/Settings 成员邀请/角色/移除，owner/admin/member；工作区隔离任务/项目/agent/skill/run | 不等于人事多级部门；离职撤访问但保留工作成果，沿 Paperclip 成员生命周期补交接 |
| Agents：[Agents](https://multica.ai/docs/agents) | 名册、新建/AI 辅助、职责、机器/模型/技能、活动/聊天/运行取消/归档；可管理与可调用私人 Agent 分开 | Bot 名片必须显示职责、可用性、维护责任，查看/使用/管理/凭据权限不合并 |
| Squads：[Squads](https://multica.ai/docs/squads) | Agent Leader + 人/AI 成员、角色和路由说明；派 squad 唤醒 Leader，@squad 不改原 assignee；派单/回报/升级/送审 | 借显式交接和负责人验收；不是部门/权限组，不照搬单一 Agent Leader 的人事定义，不同时 mention+派单双跑 |
| Issues / 我的工作：[Issues](https://multica.ai/docs/issues) | All/My Issues、创建/状态/责任/日期/标签/属性/父子/订阅、保存视图/批改；分人不跑，分 Agent 可入队，Backlog 不跑 | 借清楚的建单/认领/派单反馈；task 状态、run 结果、业务验收三个概念不合并 |
| 项目/看板/甘特：[Projects](https://multica.ai/docs/projects)、[Resources](https://multica.ai/docs/project-resources) | 项目包含资源/负责人/时间/进度/工作流；[项目生产页](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/packages/views/projects/components/project-detail.tsx#L497-L499) 真正挂 Board/List/Table/Swimlane/Gantt；甘特按开始/到期日，未见拖动排期/依赖线/关键路径 | 不能再说只有甘特代码没入口；我们只读计划甘特沿同一任务/真实日期，不把此视图当调度器，不复制其实现 |
| 状态流程：[Workflows](https://multica.ai/docs/workflows) | 状态列、进入列后交给谁、退回/下一步；文档写 owner/admin 创建，pin [UI](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/packages/views/workflows/workflows-tab.tsx#L76-L119) 和服务允许成员用已有状态创建，owner/admin 编辑；新建状态及换项目流程另限权 | 借迁移前展示交接对象/旧运行处置；不是任意 DAG，不照搬在线文档与 pin 不一致的权限。run succeeded 不自动等于业务 done |
| Chat / Issue 评论 / Inbox：[Chat](https://multica.ai/docs/chat)、[Mention](https://multica.ai/docs/mentioning-agents)、[Inbox](https://multica.ai/docs/inbox) | 私聊与公开任务评论不同；线程/引用/解决讨论/评论转子任务/@预览；Inbox 聚合需要跟进事项；站内普通 issue 评论可能按线程/assignee 回退唤醒 | 借触发预览、回源与摘要，不复制隐式触发；我们群内普通讨论绝不执行，也不另建 Multica Inbox |
| Channels：[Channels](https://multica.ai/docs/channels) | 外部 Bot 绑定单一 Agent，核发件人身份/当前成员权限，群明确 @、DM 不必；/issue 显式建单；平台支持各异 | 借显式建单与逐次验权；不是本期上线全套 IM 接入，展示名不等于稳定身份 |
| Runs / Machines / Analytics：[Runs](https://multica.ai/docs/tasks)、[Runtimes](https://multica.ai/docs/daemon-runtimes)、[Analytics](https://multica.ai/docs/analytics) | 任务执行日志、来源/排队/失败/转录/停止/重试/估算费用；机器在线/并发/共享。离线有重连宽限/到期失败，非无限等待 | 借明确“等待何设备/为什么”，不移植 daemon 或成本库；我们的派发/接续只按已冻结企业协议 |
| Skills / Deliverables / 自动化：[Skills](https://multica.ai/docs/skills)、[成果](https://multica.ai/docs/issues#deliverables)、[Autopilots](https://multica.ai/docs/autopilots)、[Wakeups](https://multica.ai/docs/issue-wakeups) | Skills 手建/导入/刷新/绑定；任务侧栏[Deliverables](https://github.com/multica-ai/multica/blob/58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe/packages/views/issues/components/issue-detail.tsx#L3044-L3057) 汇总评论上传（描述附件为输入），同名同 MIME 分版本/跳来源，PR 另列；Autopilots 与任务 Wakeups 分开 | 重点借输入/过程/交付区分与历史来源，改用稳定 artifact/version，不能同名猜版本；技能沿 Paperclip，通用自动化 T |

#### 4.6.4 Nodo：角色路由与交接可视化，不是企业后台

[官方仓库介绍/演示](https://github.com/waikoeng234/Nodo#readme)、[固定架构说明](https://github.com/waikoeng234/Nodo/blob/5c45fdf1c27f92d6369d03017dcea27e51040430/docs/architecture.md)。它是 DSH 插件，主区/侧栏/会话插槽组成界面；本期 **R**，不引入第二编排器。

| 功能域 | 源码与真实行为 | morchat 处置 |
|---|---|---|
| 初始引导/引擎设置 | [engine-settings](D:/dev/refs/Nodo/orchestrator/src/client/engine-settings.js)：Agent/CLI 路径/模型提供方/连接诊断与本地项目 | 借就绪检查，不让员工任意选引擎/个人 Key；公司受控 DSH 一个首发路径 |
| 角色与团队图 | [roles](D:/dev/refs/Nodo/orchestrator/src/client/roles.tsx)、[teams](D:/dev/refs/Nodo/orchestrator/src/client/teams.tsx)：职责卡拖到固定 lead/member 槽；Team 的 lead/members/types/assign；主控引擎和成员身份有限制 | 是角色编组/指派图，不是人事组织图，更不是任意节点/连线/DAG；借岗位槽、缺口和成员选择，不搬拓扑引擎 |
| 任务分类路由 | [route](D:/dev/refs/Nodo/orchestrator/core/shared/route.js)：任务类型/情形→普通角色、困难覆盖及模型档位；主控分类，程序选确定角色，未配报错 | 借命中预览与缺口提示；决定交给 Paperclip，不另造 dispatch 状态库 |
| 团队会话/逐轮交接 | [lead](D:/dev/refs/Nodo/orchestrator/core/src/lead.js#L28)：主控逐项派发、报告回来再继续；含 queued/cancelled/running/done/failed/两类 interrupted/unconfirmed 共 8 类派单标签；重试与未确认停止可见 | 不再称六态，也不把逐轮串行当全公司并发模型；借派给谁/为什么/回报证据/真实停止反馈 |
| 询问/许可、项目侧栏与结果 | [run-cards](D:/dev/refs/Nodo/orchestrator/src/client/run-cards.js)、[approvals](D:/dev/refs/Nodo/orchestrator/core/src/approvals.js)、[right-panel](D:/dev/refs/Nodo/orchestrator/src/client/right-panel.tsx)：会话问题/一次许可，待处理在内存；本地目录/worktree、文件/变更/终端/浏览器及源会话引用 | 借证据回源；持久审批、公司项目与资产使用 Paperclip。文件路径/终端/转录不是公司资产正本，不做默认员工终端入口 |

#### 4.6.5 延后项目与单一实现选择

| 项目 | 官方产品面 | 当前决定 |
|---|---|---|
| n8n | [工作流文档](https://docs.n8n.io/build/understand-workflows.md)：节点编辑、模板、凭据、执行记录、发布/版本 | T：未来工作流候选，不为首版造画布/转换器，不接第二任务账 |
| Coze Studio / Coze 云 | [官方 Studio](https://github.com/coze-dev/coze-studio)：Agent/App、可视工作流、插件/知识/数据库/提示资源、调试发布/API | T：Studio 与未来云 API 接入分开；不把可云调用等同可直接嵌完整编辑器，不引进其后台 |
| FlowGram | [官方站](https://flowgram.ai/)：画布/表单/变量/物料框架，另有 Desktop Preview（官网披露预览分发限制） | T：框架不是企业任务/授权后台；不因已有桌面预览替换公司客户端 |
| DSH | 既定本地 harness/SDK/协议候选，研究见 [Windows 接入](D:/dev/morchat.co/docs/WINDOWS-DSH-INTEGRATION.md) | 执行引擎而非公司前端。员工不必操作 DSH CLI；对外只呈现公司准入/设备/运行状态 |

**同类功能只选一条权威实现：**任务/Inbox/人工决策/审批/队列/运行/配置/skill/文档/包/连接/成本优先 Paperclip；多人人机群、部门授权、稳定 @ 意图和设备治理补企业差异；OMB 补缺失对话展示/交互，Multica/Nodo 仅参考。遇到源组件绑定另一后台，只抽可分离子件，不能以复用名义运行第二套产品。

本轮补的是产品覆盖与静态证据，未安装、构建或运行四项目。完整导航提案见 [体验 §3.1、§3.6](D:/dev/morchat.co/docs/PRODUCT-EXPERIENCE.md)；实际路由、开关、角色动作和依赖闭包须逐页进 D08/FE，未查明或未通过的写入口不开放。新导航名称、原生例程是否首批启用等仍是建议，不自动扩张 MVP。

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

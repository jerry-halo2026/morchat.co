# Paperclip 接入边界与验证门禁

> v14 设计评审稿，2026-11-05。Paperclip 是整体公司工作台底座及任务/AI 运行权威，不只是 API 或页面外壳；原生公司/真人成员不等于完整人事部门系统。参考源码固定于 40ea7a9b8994e9bdb3d13794b5847388be0f7a92；上线版本需另选并重验契约。

## 0. Paperclip、Runner 与 Harness 的分层

产品中的 Bot（AI 同事）对应 Paperclip Agent，保留原生 API/字段名，不另造 Bot 配置与身份。Paperclip 是任务与 AI运行的控制/治理面，不是负责模型—工具循环的完整harness；但也不只是转发调用，它管理任务、运行、指令/skill、审批、预算与历史。Adapter和Runner连接具体执行环境，Runner还具有进程/协议/恢复基础；DSH在员工设备运行实际agent loop。Paperclip的“local”指其执行主机，不等于员工电脑自动接入。

## 1. 复用范围

| 能力 | 使用方式 | 不能外推的保证 |
|---|---|---|
| 目标/项目/任务与依赖 | 核心事实尽量使用原生对象；企业扩展以 ID 关联 | goal 的人类负责人、部门责任仍需扩展 |
| 人与 AI 任务承接 | 使用 assigneeUserId/assigneeAgentId、responsibleUserId 等已有字段 | 字段存在不等于全部认领/转派权限契约已验证 |
| Bot（原生 Agent）与运行 | 配置 revision、当前指令文件、适配器、唤醒、运行记录和执行锁 | 配置历史不包含全部文件；新 managed 指令保存不追加旧指令正文历史；不等于任意崩溃恢复或副作用 exactly-once |
| 人工追问与审批 | 原生 interaction、回答事务与 durable delivery、attention 卡片、审批决策幂等 | 治理审批、runtime 工具许可和成果验收不是同一类型；需企业动作授权及本地传输，不复制所有者/Full access 默认策略 |
| 执行中补充与停止 | queued-comments 的 revision/修改/删除/interrupt/steer 及单 run cancel | 同轮 steer 依赖实际 native session，DSH remote 未验证；单 run cancel 不是整 root 级联，interrupt 还包含继续意图 |
| 知识文档修订 | documents/revisions/annotations、条件更新与既有资产 | restore 不保证 expected base，企业来源 ACL/历史保留仍要补；不建第二记忆库 |
| 交付物与活动 | 关联工作成果、运行和必要证据 | 活动日志不是完整公司资产库或完整灾备 |
| skill 内容、版本与测试 | 复用不可变版本、managed fork、test-inputs/templates/runs 和真实测试 issue，引用其输出/费用 | succeeded 不等于业务评估通过；企业发布/范围/留存仍需补，不另建评测执行引擎 |
| Bot/小队模板载体 | AGENTS/TEAM/PROJECT/TASK/SKILL 包、配置历史、导入预览/来源与 hash；部分包有 packageVersion | Team manager 仍是 Agent；不具备真人岗位/部门与人机小队授权，不把所有安装视为同一审批入口 |
| 成员归档/任务转派 | 复用 archiveMember 的未完真人任务处理与授权/连接清理 | 不覆盖全部目标/资产/模板维护、设备与未上传缺口；清执行锁不证明旧运行已终止 |
| 用量与预算 | 复用成本事件、用户归集和公司/Agent/项目预算基础 | 不等于部门/个人独立硬预算、所有外部调用自动计量或绝不超支 |
| 模型凭据引用 | 复用可验证的 secret reference/版本轮换 | 不是默认可向员工设备下发原始 Key 的许可 |
| 项目 workspace 与快照 | 优先适配原生 snapshot、上传回执、恢复与 epoch 条件发布 | 当前 remote 路径依赖 runner＋sandbox；不是现成员工设备池，Agent 公共文件合并策略也不能替代项目冲突处理 |
| 前端源码 / 原样管理员台 | 前端布局、任务列表/看板/详情/项目/费用源码优先复用适配，形成统一员工工作台 | 原样管理员台继续受限；人类部门/群聊/权限由企业契约补齐，复用源码不开放管理员权限 |

源码证据：[任务模型](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/issues.ts)、[目标模型](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/goals.ts)、[Agent 汇报关系](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/agents.ts)、[skill 版本](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/company_skills.ts)。

### 1.1 整体产品能力不能被任务接入表漏掉

全产品静态盘点唯一见 [复用 §4.6.1](D:/dev/morchat.co/docs/REFERENCE-REUSE.md)，工作台入口见 [体验 §3.6](D:/dev/morchat.co/docs/PRODUCT-EXPERIENCE.md)。以下补能力选择，未改变原生唯一权威或开放企业管理员权限。

| 能力 | 优先复用 | 最小补齐 / 启用边界 |
|---|---|---|
| 公司、用户与成员 | company/user/membership、邀请/归档、个人任务与用量 | 人事部门/负责人和逐资源政策，原生身份对接；不另造账号系统 |
| Inbox / Decisions | mine/Blocked、attention/原请求、专题队列和处理动作 | 企业范围投影；Decisions 导航默认关且 API 有 board 门禁，不能管理员代理；MyIssues 是未挂载旧页面 |
| AI 组织与真人组织 | 原生 Bot/Agent 名册、reportsTo 及配置/历史 | 真人部门单独扩展，两张图关系显式；不把真人当 Agent |
| Skills / Sources / Studio | 正式页面、来源、版本、测试输入和测试 run | 业务评判/发布权及最终实际版本加载；普通 run 历史 pin 门禁单独验 |
| Apps / 连接与工具审查 | 正式 Apps、凭据引用、grants、Allowed/Ask/Off、工具动作请求/审查 | 当前 SHA 核心默认启用，子连接有条件；补业务范围和 Windows 受控传输，不另造连接/审批主库 |
| Routines / 包 / 管理 | 原生例程/触发修订、正式 Import/Export、adapter/设置/插件生命周期 | 例程是否首批启用待评审；Catalog 组件/API 存在但无正式页面路由，需获权接入口；插件不任意开放 |
| Artifacts / Audit | 原生成果、文档/批注、活动/运行/费用/预算/Timeline | 来源权限、保留/验收与部门归集；Timeline 是活动历史，不是计划甘特 |

固定路由、开关、受众和实际动作需进入 D08/FE 证据。同类原生能力足够时直接适配原生，不为 OMB 外观重造控制服务；未启用的原生写入口必须受控，不能只从导航藏起来。


## 2. 不借原生模型冒充企业能力

- reportsTo 指向 Agent，不能将老板、员工和部门映射为假 Agent 来获得组织图。
- 公司/user/membership 生命周期优先复用 Paperclip，外部 IdP 按 C01 映射；morchat 补真人部门/岗位/责任和企业政策，不另建公司账号主库，也不将原生 company 角色直接当部门 ACL。
- 群成员与群消息由 morchat 管理。原生评论可作任务讨论证据，但不冒充独立工作群。
- 部门知识、受限 skill 和公司资产的策略由 morchat 负责，原生能力不足时收窄开放。
- AI 推理预算与广告资金不是一套账；本期不建设广告资金账本。

### 2.1 六步产品流程的原生契约补读

固定样本已具备 AI 配置包与技能评测基础，不应再造一套。morchat 组合元数据和产品责任见 [产品流程](D:/dev/morchat.co/docs/PRODUCT-LIFECYCLE.md)；下列限制进入 LC 门禁，与 PC-01–20 一并验证。

- **身份与原子认领：**issue 只允许 user/Agent 单一承接；checkout 接收 agentId/expectedStatuses，成功可清真人 assignee，不是员工认领 API。expectedStatusVersion 仅允许状态单字段 backlog→todo，不能当承接/转派通用 CAS。responsibleUserId 是服务端派生责任身份，普通更新不可随意写。员工原子认领须用受支持扩展在原生权威处实现，不能另存一套负责人。证据：[checkout schema](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/shared/src/validators/issue.ts#L995-L998)、[状态条件限制](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/issues.ts#L13911-L13947)、[责任推导](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/issues.ts#L450-L513)。
- **组队入口：**AGENTS/TEAM 包优先复用，但 catalog 的 targetManager 是 Agent，portability 任务槽位也是 Agent slug。catalog install 调 agent_safe import，创建状态走 paused/idle；不能假设会执行 agent-hires 的 requireBoardApprovalForNewAgents。所有写入口需统一政策，未验前原始 import 不向员工/助手开放。hire 的同 company/run/payload 去重也不是跨进程通用操作幂等。证据：[catalog 导入](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/teams-catalog.ts#L902-L948)、[导入状态](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/company-portability.ts#L5751-L5765)、[hire 门禁](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/agents.ts#L4595-L4665)。
- **skill 测试：**原生 test-inputs、skill-test-run-templates、test-runs 支持 skillVersionId、输入/模板/Agent 快照，创建真实 skill_test issue；测试需 skills.test 与 tasks:assign。状态 succeeded 不评价业务正确性；同 input 重跑会 supersede，旧 harness issue 默认七天到期，发布证据必须按公司策略保留。证据：[验证结构](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/shared/src/validators/company-skill.ts#L414-L529)、[创建真实 issue](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/company-skills.ts#L774-L834)、[取代/保留](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/company-skills.ts#L6946-L6999)。
- **编辑不等于发布：**managed 文件编辑追加版本并推进 current；候选优先原生 fork，生产禁止随 latest。恢复 sourceVersionId＋expectedVersionId 仅 managed 支持，追加新版本不重写历史。内置 release 字段不是企业发布审批 API。证据：[恢复](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/company-skills.ts#L3750-L3781)、[内置 release](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/company-skills.ts#L3129-L3162)。
- **版本三关：**Agent 普通新 run 的历史 pin 受 enableBetaSkills 控制，关闭时配置 pin 被拒/已有选择可转 current；但准入时 contextSnapshot.skillVersions 原生留快照，恢复沿用，Studio test 固定保存版本独立于 Beta。skills/sync 可先登记再返回 unsupported，DSH 实际物化/加载另验；任何不符阻塞，不静默 latest。证据：[pin 门禁](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/agents.ts#L2863-L2867)、[普通选择](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/runtime-skill-selections.ts#L1-L6)、[运行快照](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/heartbeat/execution-configuration.ts#L248-L325)、[unsupported](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/agents.ts#L3870-L3908)。
- **范围不靠标签：**原生 private project/issue、source/project skill access 可复用；sharingScope=private 不等于部门 ACL，skill policy 默认 allow、主体/动作没有真实部门发布治理。必须检查直接 API/原生 UI 绕过；不能把仅隐藏按钮当企业边界。证据：[skill source ACL](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/skill-access.ts#L18-L95)、[默认 policy](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/company-skill-policy.ts#L156-L187)。
- **归档已有基础：**archiveMember 可转派未完真人任务并撤授权/连接；补齐设备、目标、AI/岗位包/模板/资产维护和保存缺口，而不是重写全部归档。证据：[成员归档](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/access.ts#L697-L794)。

### 2.2 Bot 版本不是一条历史接口就覆盖全部

复用优先级：**Bot 配置历史、skill 版本和包机制直接复用；指令历史优先复用 durable blob/manifest 加保留根，或接既有保留资产；缺失包历史用固定来源/既有版本资产；morchat 只关联一次生效所用的版本。**模板是配方，Bot 是稳定 Agent 身份，运行是 task/run；关系见 [产品定义](D:/dev/morchat.co/docs/PRODUCT-LIFECYCLE.md)。

- 原生 agent_config_revisions 保存操作者、时间、changedKeys、beforeConfig/afterConfig 和回滚来源，并有配置查询/rollback API。覆盖的是配置字段集合，不能当指令文件字节、整个 HOME、所有权限和秘密的统一历史。[schema](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/agent_config_revisions.ts#L5-L19)、[覆盖字段](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/lib/agent-records.ts#L22-L38)、[历史与回滚路由](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/routes/agents.ts#L4210-L4253)。
- **修正旧结论：当前 managed 指令/附属文件的新保存不再追加完整指令历史。**固定样本 commitInternal 写当前文件、持久化目录和活动日志；history 仍查旧 revision 表。因此表、路由名、返回的 revision 形状或 contentHash 存在，都不能证明每次新保存留下了可恢复正文。旧 history/diff/restore 用于兼容历史记录，不是新内容版本引擎。[保存与旧历史查询](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/agent-instruction-revisions.ts#L215-L350)、[官方说明](https://docs.paperclip.ing/reference/api/agents/#instructions-bundle)。
- 原生 current 指令仍是唯一编辑权威。受控生效前自动将允许交付的指令/资源字节保存为公司不可变快照，关联配置 revision 与 skill 版本；对原生 UI/API、Bot 自改/自动回写都实行同一门禁。无法收口的写入口先禁用。不能仅记 hash/文件路径，不能要求员工手动 Git，也不能把项目 workspace 保存自动当作 Bot 指令历史。
- 模板 contentHash 标识内容，部分 packageVersion 标识来源版本，都不自动保证任意历史包可取回。优先来源仓库固定提交/原生包，缺失内容才落公司既有版本资产；不另造 Bot/小队包格式或模板版本服务。[Team Catalog](https://docs.paperclip.ing/reference/api/teams-catalog/)。
- P0 验证配置变更、连续两次指令保存、模板升级、skill 更新的版本组合：一次归档失败不生效，旧 Bot/小队不被静默改写，新 run 实际使用正确版本；回退全组不得只恢复配置或复活撤销权限。以下 PC-06 与 LC-08/11 覆盖此缺口，未测试不得宣称已支持完整 Bot 版本。

### 2.3 本轮必须收口的原生路径

零核心改动不是目标。先使用受支持 policy hook/adapter；若不能覆盖真实入口，则由 Paperclip 集成 owner 维护最小原生扩展，不能只给 morchat 的按钮加校验。八项边界及固定反例见 [Discovery §1–2](D:/dev/morchat.co/docs/DISCOVERY-BASELINE.md)。

- durable Agent files 需要核对开关、S3 和已有 durable head；原生 head/事务与重新投影已有恢复基础。开关未启用且无 durable head 的路径，文件已写而后续失败可能不一致；不能泛称所有模式都无事务保证。GC 当前仅保当前根，旧对象按对象年龄超过 30 天可能删除，必须把获保留历史纳入根或既有保留资产。复用 skill-package-store 的不可变包/回执思路，但不把 Bot 包假冒 skill 绕 schema/ACL。
- 普通新 run 的当前配置/目录与已准入 native run 的 persisted input 分开；能力清单本身不完成历史执行选择。普通运行在 task mention、环境/插件技能注入之后核验最终集合/版本；可读候选不因此获得生产使用权。
- 原生指令工具直达 service，working-copy 的 warm checkpoint/stop 会 apply，且同文件 last-sync-wins。保留原生 run/user/consent 授权，在 common commit/apply 收口；首版正式能力只读，建议另存候选，不禁用项目文件保存。配置生效/回退接已有 revision CAS，而不是以普通 rollback API 存在当并发保证。
- catalog preview 与 install 会分别 prepare；源 hash、重写后的有效包 hash 和实际副作用都要绑定。显式 adapter/includes/collision/member mapping，不能默认 claude_local、rename 克隆或自动激活 routine。导入内含 skills 时同样执行发布政策，复用 SkillContentPublication.validate 等可用 hook；每一步失败可查询、可幂等补缺，不以 warning 当整体完成。
- skill test 输入/模板/快照/输出与历史读取要保留来源政策交集；任务清理不解除限制。source detach/disconnect 不是撤权 API。脱敏扩大受众使用独立 ACL 根的安全资产/skill，不能放宽旧 identity 导致旧私密版外露。
- public MCP 缓存 completed receipt 返回敏感结果前仍需当前资源授权，不能重放 mutation 解决。首版无业务需要则整体禁用该入口。原生资产目录/search 服务可接 issue/project 条件，优先复用服务，不开放仅 company-check 的原始路由给所有员工。

上述检查落入 PC-06/08/09/11/19、LC 契约子集以及 [G2/G3 反例](D:/dev/morchat.co/docs/DISCOVERY-BASELINE.md)，没有独立评测引擎；所有启用入口都须覆盖，关闭旁路必须证明服务端不可达。

## 3. 接入与运维原则

优先部署固定上游版本，通过受支持 API/适配器扩展；不把“绝不 fork”当成忽略缺陷的理由。必要补丁必须独立记录、测试并明确升级成本；当前没有授权改上游代码。

Paperclip 独立管理数据和迁移，自有服务不跨库写表。只有批准的网络入口可访问；所有员工业务写入经过真实身份授权和受控适配。不能用共享 Board 管理员 key 模拟所有人的权限。

Plugin 的能力逐项最小化，不能因历史记录发现某路径绕过策略，就永久写一个“必须仍可绕过”的测试。正确测试是：不允许的身份、操作和状态转换必须被拒；不同入口不得绕过已选策略。确需启用写能力时另做验证。

未经适配的原样管理台仅对有相应内容权限的人员开放；这不排斥将其前端源码改造成日常工作界面。适配后的 UI 必须走同一企业授权/命令入口，无法安全收口的页面或操作先不开放，不让普通员工绕过平台政策。

## 4. Paperclip 派发与员工本地完整 Harness

Paperclip 是中央任务/run 控制面；完整 harness 在员工设备驱动模型—工具循环，经公司模型网关调用云模型。撤回中央 harness 优先，不设服务器默认代跑。官方 local adapter 指运行主机上的进程：在服务器配置 codex_local/claude_local 不会自动访问员工电脑。[五分钟路径](https://docs.paperclip.ing/guides/getting-started/five-minute-path/)、[Adapters](https://docs.paperclip.ing/reference/adapters/overview/)

固定样本的 Codex/Claude local adapter 都会调用进程执行入口，可作为运行协议/解析器参考，但不能原样当成完整设备派发系统。[Codex execute](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/adapters/codex-local/src/server/execute.ts)、[Claude execute](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/adapters/claude-local/src/server/execute.ts)

### 4.1 复用核心，补设备派发契约

- Paperclip 保留任务、依赖、Bot/Agent 配置历史、当前指令、skill 版本和 run 权威；指令历史缺口以公司不可变快照补齐；morchat 只扩展 device、派发 attempt、租约代次、事件游标和恢复关联，不另建可写任务状态机或每人一套 Paperclip。
- 中央先确定逻辑 Agent：员工助手默认本人授权设备；部门公用 Agent 自动选择预授权池内数据/工具/本地资源/容量均合格的设备。设备重新验权、原子预留/领取并确认租约后启动完整本地 harness；入群不授予设备权，原始 Key 不入本机，收到派单不等于已执行。
- 必须验证任务等待、派发、领取、启动、等待人/子任务、待归档到 Paperclip API/事件/run 生命周期的映射。不假设上述都是原生状态，不用长时间占住活跃 heartbeat/run 冒充离线排队。设备在线心跳不自动唤醒收费 Agent。
- 设备回执携带已授权 task/run/attempt、租约代次与序号；中央验证后写回唯一事实。至少一次投递、幂等回执、失败可见、取消和断线对账均需契约测试。
- 旧代次不能覆盖当前任务、继续调用模型；迟到证据待核对，真实已发生的费用仍幂等入账。租约过期不证明旧动作没发生，未知副作用未查清不能自动重跑/转派。
- 队列用于可靠派发和真实容量/冲突等待，不把每设备或整个 Agent 固定为一次一个任务。不同 task/run 的 session、目录与产物隔离，等待释放资源；控制消息不被长执行占住。
- 员工助手离线默认等待本人设备；公用 Agent 未获启动权的任务自动改选池节点，满足 R1（共享写入已隔离且可安全重算）或 R2（旧执行/资源可信终止）的接续条件，检查点及其后已提交效果已对账且无未知项时自动新 run 接续；未知结果先阻塞核对。无合格设备不扩大池、不中央代跑，不保证原始 CLI 会话迁移。

官方 Runner 与 isolated workspace 带实验性标记；对齐固定版本、依赖及恢复语义后再决定是否复用，不能作为已具备企业设备 fleet 的证据。工作目录/worktree 不替代代码执行隔离。[Runner](https://docs.paperclip.ing/reference/adapters/paperclip-runner/)、[Workspaces](https://docs.paperclip.ing/guides/projects-workflow/workspaces/)

### 4.2 已见并发/会话实现不等于设备池已完成

固定源码的 heartbeat 队列按 Agent 的 maxConcurrentRuns 减去运行数来计算可用名额，并非一个全公司单执行槽；但 paperclip_runner 的 openai_dot/grok_bot/muse 分支明确限制为一个外部 turn。不能把该分支的限制推广为我们的设备规则，也不能只调数字就声称支持并发。[策略分支](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/heartbeat/queue.ts#L418-L430)、[按 Agent 计算名额](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/heartbeat/queue.ts#L2063-L2088)

固定 Codex/Claude adapter 已有 execution target 与会话匹配检查，目标不匹配时不直接恢复旧 session。因此不能称其完全没有远程执行路径，也不能推导员工设备池自动接续已经成立。[Codex 目标匹配](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/adapters/codex-local/src/server/execute.ts#L1126-L1142)、[Claude 目标匹配](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/adapters/claude-local/src/server/execute.ts#L775-L803)

P0 必须验证选定 adapter 的 per-run 执行目标、同一 Agent 多任务的任务键/session 隔离、工作区与输出防串用、取消是否误伤并行运行、费用归属和断线回执。不允许为每次选机改写共享 Agent 的全局 cwd/env/设备配置，不把复制很多影子 Agent 当成无审计的绕过；接口不足则受支持扩展或重评组件，不能暗建第二套 Agent 配置和任务事实。

还必须验证旧代次/旧版本在权威提交处失效，而非仅在请求发送前失效；任务状态、转派、子任务、交付关联及投递都不能绕过。优先条件写入；否则评估全入口受控的同资源顺序提交和超时待确认协议，跨库未知提交未收敛不放行冲突新代次。原生 UI/插件无法满足则不开写权限，不能通过第二套任务状态掩盖。具体可用 API 留 P0 核验，无法证明就不通过。

### 4.3 谁补什么

客户端 runtime 管理引擎安装/版本/配置、本地循环、受限工具和恢复缓存；中央企业层管理账号、设备、能力/租约、模型网关、资产与授权面板。Paperclip 接口不足时，优先扩展受支持 adapter/API，必要补丁单独评审；不能用绕过授权的管理员调用或第二套任务库掩盖。具体安装方案、等待语义和 API 合约在 P0 选定验证。

Paperclip secret reference/轮换可以复用，但把真实 secret 注入员工进程违反本方案的 Key 边界。[密钥轮换](https://docs.paperclip.ing/how-to/rotate-provider-api-key/)、[完整 runtime 契约](D:/dev/morchat.co/docs/CLIENT-RUNTIME.md)。

#### 群消息接入不是第二任务中台

morchat 保存自有群消息/线程与派工意图回执；已有 Paperclip 评论/事件只按原生 ID 投影，不另存可编辑副本。各 Bot 回复独立可见不等于都产生 run。群内单输入框 @ 选中具体 Bot 后发送，形成带稳定目标的明确意图，不再选择消息/执行模式；目标/任务/受众重新验权后才进入唯一原生派发路径。现有真人 issue 不改派为 Bot，复用其下真正 Bot 子任务；同 Bot 同工作且授权一致才延续已有 Bot 任务，多目标逐项记录受理/失败/未知。

P0 必须列清该部署版本中任务分配、评论/mention、heartbeat/wakeup、adapter 回传的自动触发关系；同一意图只能有一个有效派发。若发评论与分配都会触发，选择一条执行入口，另一条只作不触发的引用/投影；没有受支持的静默路径或幂等/查询能力时，由 Paperclip owner 评审最小补丁，不以模型“不要重复”代替保证。写入成功但 ACK 丢失须按同意图查询/对账，不能在 morchat 再创建一份任务。

固定样本的普通非 self、非终态评论即使无 @ 也可能唤醒 assignee，update-comment 同样需覆盖；子任务终态还有原生父任务唤醒及摘要输入。故普通群消息不逐条镜像为原生评论；父任务通知与企业依赖批次关联，摘要重新验权，未确认产物不当交付。另核实 children 创建的幂等不当然消除后续 assignment wake；普通引用不能转成影响权限的原生 agent:// mention grant。当前代码保留 issue_comment_mentioned 原因不等于已证明独立 mention 唤醒分支，部署入口须按实际路径核验。源码证据见 [复用研究 §2.1、§4.4](D:/dev/morchat.co/docs/REFERENCE-REUSE.md)。

企业 root/causation 与限额是原生运行的准入/关联，不是另一套运行状态机；成本仍进原生账。具体触发/回传唯一协议见 [群协作 §4](D:/dev/morchat.co/docs/DISTRIBUTED-COLLABORATION.md)，MSG-01–08 纳入 [P0](D:/dev/morchat.co/docs/DISCOVERY-BASELINE.md)。源码现有 hook 能否满足此组合尚待实测，不能标“纯配置直接可用”。

#### 人工介入也消费原生权威，不另建审批或补充队列

固定样本已有 issue-thread interactions、question-response-delivery outbox、queued-comments 的 revision/编辑/删除/排序/steer/interrupt，以及 run cancellation；对应原生卡片和 attention 查询优先复用。源码位置与 D/A/S 见 [复用 §4.5.1](D:/dev/morchat.co/docs/REFERENCE-REUSE.md)。企业层只加真实身份/来源权限、群投影和 runtime 回调关联；缺适合工具许可的类型或授权强制点时，由原生 owner 明确最小扩展，不能把任意治理 approval 包装成已具备工具授权语义。

原生“答案已记录”与“本地已消费”分开；原问答 ID 与原 run/请求绑定，晚到答案不能隐式注入另一个 run。待处理执行要求使用唯一原生队列及修订，不镜像普通群聊天，不增平行可编辑队列。外部传输 outbox/回执只记投递，不另存可写业务状态；决策过期/撤权后本地重验，不能凭已批准绕硬策略。

原生 steer 目前依赖 paperclip_runner_v1 和 active native session；DSH remote 不因 UI 有按钮就可用。P1 最低保证安全下一轮补充及明确的取消/继续，能力不足时只关闭同轮 steer，不伪造完成。单 run 取消直接消费；整 root 仅聚合已有成员关系和逐 run 原生控制，先关闭该范围新增派发/补充消费，再核对终止与未知效果。interrupt 是“中断后按新要求继续”，不作普通 Stop。精准语义见 [群协作 §4.6](D:/dev/morchat.co/docs/DISTRIBUTED-COLLABORATION.md)，OP-01–04 均未运行。

### 4.4 工作空间持久化不是从零自建

补读固定源码确认：remote-workspace-snapshot-archive 可保存 Git 对象/refs、所选 HEAD/index 与文件；remote-workspaces 在事务提交处校验 epoch/writerRunId/父保存点，更新持久指针与 run 引用。优先复用此契约，具体文件与限制见 [跨设备参考研究](D:/dev/morchat.co/docs/CROSS-DEVICE-REFERENCE-RESEARCH.md) §2。当前入口绑定 runner＋sandbox、旧 allocation dirty 时拒绝替换；不能打开开关就当员工池接续已完成。

Agent 文件目录是另一条路径：其增量捕获不保证任意活动写者的原子截面，apply 对同文件采用 last-sync-wins，不能当多人企业项目正式盘。morchat 需适配员工节点、一致采集、企业 ACL、Git/非 Git 资产和效果对账；条件提交无法通过原生 API 表达时须评审受支持扩展，不预检后普通写入、不绕过数据库。接续 R1/R2 与文件协议见 [任务与工作空间接续](D:/dev/morchat.co/docs/WORKSPACE-CONTINUITY.md)。

### 4.5 Windows 首轮与 Mac 预备边界

2026-11-05 补读确认 Windows 缺口不只是发布包：ACPX 的安装完整性/进程树路径明确拒绝 Windows；直接 Codex 分支存在，不可混称全部无法启动，但进程树终止、指定 stdio MCP 桥和生命周期证明未齐。通用 local-process-sandbox 的文件/网络 scope 仅 Linux，macOS/Windows 不能把独立 HOME 当隔离。

工作区现有 transport 还要求 remote+sandbox+execute/syncIn/syncOut、排除 runnerTask，并有 POSIX 路径假设；task-only 插件可跑任务不等于已有 Windows 文件接续。保留原生归档/哈希/事务发布，补平台能力与一致采集；不删安全检查、不另造权威。详见 [原生运行与 Harness 核查](D:/dev/morchat.co/docs/NATIVE-RUNTIME-RESEARCH.md) §2 与 NG-01–06。

按公司 Chat Completions／Messages 多供应商需求，DSH 调整为优先验证候选，Codex 保留对照/备选；最终只选一条路径。无论 SDK/ACP/直接 provider，均需接回 Paperclip 的任务/run、取消、用量与真实 workspace/snapshot 契约，不全面移植 ACPX，也不暗建第二任务后台。首轮为两台 Windows 11 x64；未过门禁不能用 VM 成绩替代。Mac 后续单独验收，保留接口准备；现有 macOS arm64 发布不证明跨系统接续。

### 4.6 DSH 优先的 Windows 接入缺口

首轮优先核查外部远程adapter＋本机MXC/DSH ACP，而不是全面移植Runner ACPX。复用 execute/context/sessionCodec等接口，但要补设备派发、取消/事件对账和明确PCWS节点入口；task-only/内置HTTP adapter不能冒充完整workspace通路。ctx内服务端凭据不整包下发，Board-only取消入口经企业权限代理，员工不拿共享管理员Key。

DSH ACP usage_update 是上下文占用，不是消费；公司网关逐请求可恢复回执映射原生cost_events并去重，adapter汇总不重复入账。原生PCWS准入目前绑定paperclip_runner/sandbox，需要单独评审扩展，保留epoch/writerRunId/parentSnapshot事务，不跨库写表。组件证据、最小五项补齐和失败门禁见 [Windows DSH 接入](D:/dev/morchat.co/docs/WINDOWS-DSH-INTEGRATION.md)。

## 5. 用量、预算与公司 LLM Key

### 5.1 已见原生能力

固定源码的成本事件包含公司、Agent、责任用户、任务、项目、run、供应商/模型、Token、费用、计费类型、价格状态及请求/幂等标识；预算服务按公司、Agent、项目匹配策略，策略包含预警、通知、硬停止与未知费用处理。应复用这些基础，而非重建一份模型成本总账。

源码：[cost_events](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/cost_events.ts)、[budget_policies](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/db/src/schema/budget_policies.ts)、[预算作用域](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/budgets.ts#L105-L202)。

2026-11-04 查阅的官方成本页另有按用户汇总与估算/未知/待计量说明；不能把缺少价格当作零，也不应把人员费用统计全部列为自建。线上文档可能领先于固定样本，采用时对齐版本。[Costs & Budgets](https://docs.paperclip.ing/guides/day-to-day/costs/)

### 5.2 morchat 补充的企业语义

| 项目 | 复用或自建边界 |
|---|---|
| 模型用量记录 | 优先 Paperclip 成本事件及原生汇总；runtime/gateway 提供完整回执，不声称自动捕获平台外调用 |
| 责任归属 | 复用 responsibleUserId 等字段，补发起人/委托人/承担部门及执行设备；跨部门任务明确费用归属，运行开始保存快照 |
| 部门/个人额度 | 首版提供归集和授权查看；硬预算使用已验证的公司/Agent/项目范围，不把部门伪装成项目或承诺原生个人硬预算 |
| 模型准入 | 公司访问层验证当前用户/run、模型允许列表、额度、速率与取消；与 Paperclip 预算协调，不另维护独立可写预算真相 |
| 非模型费用 | 虚拟机、存储、外部付费工具另按需要计量，和模型推理费、广告资金区分；不外推现有成本字段自动覆盖一切 |
| 密钥管理 | 选一个公司秘密权威存储，其他模块持引用；管理 Key、调用模型、查看费用分别授权 |

### 5.3 网关接入不能只换地址

固定样本 local adapter 的计费分类存在按环境变量判定的路径：Codex 看 OPENAI_API_KEY，Claude 在非 Bedrock 路径看 ANTHROPIC_API_KEY。使用替代网关认证/配置后不能未经测试就相信其 API/订阅分类与价格输出；应按公司连接的真实计费模式和网关/供应商回执校验，必要适配，但不伪造零成本。此为该固定版本的适配风险，不是宣称所有版本都错误。[Codex 计费判定](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/adapters/codex-local/src/server/execute.ts#L199-L202)、[Claude 计费判定](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/packages/adapters/claude-local/src/server/execute.ts#L172-L175)。

公司网关凭证不是供应商原始 Key；只改 base URL 不能证明认证、计量与全入口覆盖。独立公司配置和失败关闭必须阻止自动回退员工个人 OAuth/Key/订阅。

### 5.4 回执与预算的实施门禁

- 固定每条接入路径的记账权威与粒度：按请求记账就对齐 provider request/run 关联；若 adapter 只给运行汇总，就用幂等运行回执，网关明细只作核对，不再叠加成第二笔费用。
- 真正重试并产生消耗应记新费用；重复送达同一回执不能重复计费。失败、流式取消、超时和迟到用量均要对账，补记成本不重跑业务。
- 首版每个模型入口绑定真实 Paperclip 任务/run：明确向 AI 提问可形成可见轻量任务；摘要/skill 等若启用须真实立项、授权并派本地。任务外的自动标题等模型功能关闭，不伪造 Agent/run 凑计量。未来非任务服务用量另立身份/派发/取消/计量契约。
- 中央网关/供应商保留可恢复的调用证据，不以设备回传为唯一账单来源；设备损坏或撤销后仍能对账。所选 adapter 汇总若无法由中央重建，就不能作为唯一成本输入通过门禁。
- 并发运行需验证预算准入、预留/释放与结算配合；预算命中阻止后续受控调用，但在途调用或迟报可能超额，不承诺绝对零超支。费用缺失时不能先当零继续无限调用。
- 原生用量 UI 如不能满足部门/个人权限，使用受控汇总和组件；不能向部门负责人开放全公司成本明细。
- 密钥轮换需处理缓存和长会话；引用历史版本的连接不会因更新 latest 自动改变，供应商旧 Key 的吊销另行核验。

## 6. P0 契约测试清单

| 编号 | 验证目标 |
|---|---|
| PC-01 | company/user/agent 映射准确，实际请求身份可审计；缺失/错误公司或用户不可越权 |
| PC-02 | 两人并发认领/转派的结果确定，重复请求不重复建单或运行；不依赖未经证实的乐观锁字段 |
| PC-03 | 群消息→任务→运行→成果关联可恢复；跨系统超时不会留下无人知道的双任务 |
| PC-04 | 允许的状态转换和选择的审核策略在实际写入路径有效；拒绝绕过入口 |
| PC-05 | Agent 委派/唤醒有来源、授权、去重与循环限制；普通 @ 不被假设为可靠派单 |
| PC-06 | Bot 配置 revision、指令内容快照/hash、skill 版本关联实际 run；历史 GC 后可取、最终技能集准入、条件生效/回退和自动回写候选隔离，见 G2-V1–V5；新指令连续变更可追溯且自动归档失败不生效；不拿旧 history 路由或只回配置冒充完整 Bot 历史/回退；版本不改旧运行、不复活权限，受限内容不外泄 |
| PC-07 | 事件/API 同步可补偿和对账；断线后群卡、待办、面板可收敛，显示延迟 |
| PC-08 | 撤销用户/Agent 权限、取消任务后不能继续新的授权动作；最终准入/内部调用/缓存回执/历史/测试快照/下载都复核当前权限；已发生副作用另行处理，见 G3-R1–R5 |
| PC-09 | 原生 UI 的列表、详情、搜索、附件和写入都符合开放范围；管理角色的广泛权限被明确限制 |
| PC-10 | 数据库、对象、密钥引用与映射一致恢复；离职后原账号失效，接手者可续办 |
| PC-11 | 同部门普通任务明细默认可读；跨部门项目/任务授权覆盖相应业务流转；敏感内容/私密群独立授权，依赖不扩权；读取权限不自动授予写入或管理 |
| PC-12 | 云端模型经公司连接调用；秘密引用、轮换和撤销可用；客户端/本地工具/任务代码无原始 Key，个人登录态不能绕过计量 |
| PC-13 | 公司/Agent/项目预算在实际适配路径生效；并发预留、在途调用、未知费用和命中后的停止边界有证据 |
| PC-14 | 网关/adapter 成本粒度对齐且不双计；重复、迟到、失败、取消和实际重试计量正确；启用模型入口均有真实任务/run 和归属，非任务旁路关闭；设备失联/撤销后中央仍能恢复费用证据 |
| PC-15 | 所选完整 harness 在员工设备运行；派发/领取/启动/等待与 Paperclip 契约对应，服务器 local adapter 不冒充远程派发；无个人 CLI/Key 依赖且公司配置失败不回退个人身份 |
| PC-16 | 本地文件提交公司存储后才形成正式资产；hash/版本/权限与任务关联一致，用量面板和资产面板均按当前身份过滤 |
| PC-17 | 同逻辑派单多调度器/多 runtime 不重复启动；预检后冻结写请求再换代，迟到提交不能生效；启动许可 ACK 丢失判未知；检查点之后已提交效果对账不重做；离线分类、证据上传和费用独立验证 |
| PC-18 | 同机无冲突任务与跨设备独立任务实际并行；共享 Agent 多 task/run 会话/目录隔离，per-run 选机不改共享配置；控制通信不被执行占住，冲突局部互斥/超额限流，全池离线不中央代跑 |
| PC-19 | 员工助手默认设备/公用池自动选机；设备和管理人须均有对应资料授权，管理员身份不授 Agent 权；运行中升敏/撤权及工具新资料在送达宿主前校验，旧 session/同任务新身份不能绕过当前授权；群成员不决定电脑权限 |
| PC-20 | 原生 workspace/snapshot 的员工节点适配可保存/恢复 Git 与普通文件；权威提交验证代次/父版本/权限，ACK 丢失可查询同一回执；不引入第二任务权威，不把 Agent 文件 last-sync-wins 用于项目；对应 WC-02–11 有实证 |

这些测试尚未执行。PC-15、PC-17–20、WC-01–12 与 [DC-01–08](D:/dev/morchat.co/docs/DISTRIBUTED-COLLABORATION.md)共同作为架构否决门槛；源码字段存在不等于通过。失败项按 [P0 失败分支](D:/dev/morchat.co/docs/PLAN.md)处理，不用第二套任务数据库掩盖。


## 7. 升级策略

上游版本变化与业务变更分开提交/发布；记录 pin、变更说明、数据库兼容性、回滚路径和契约测试结果。按安全风险安排升级，不机械坚持“滞后一版”或固定日历。原生导出不等于全量备份，恢复必须演练。

相关：[整体架构](D:/dev/morchat.co/docs/ARCHITECTURE.md)、[员工端与面板](D:/dev/morchat.co/docs/PRODUCT-EXPERIENCE.md)。

---
purpose: "morchat 文档入口与权威顺序"
owner: docs-maintainers
status: current
updated: 2026-11-07
related: []
---
# morchat 文档入口与权威顺序

> **2026-11-07 当前执行入口更正（R48–R50）：** managed startup-cleanup 后，已独审的现有承接工作树为 E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co，分支 codex/round1-continuous，基线 5abcca9dabc421958b665e3c69331a27b1781357。下文原 morchat-round1 路径仅历史，不再执行；不重建/迁移/导入。源码窗口与当前任务以 ACTIVE 最新检查点和 R1-ISSUE-READ-GUARD-r2-test-frozen 为准；事故与证据缺失见 R1-INCIDENT-WORKTREE-01。D main 不变，旧忽略目录 raw/context 为 LOST/REVALIDATION_REQUIRED，不把当前入口修复当产品验收。

2026-11-06，Multica 统一基线。**R1-AUTH-r1 已批准准备→验证修复→三个首轮切片开发→集成验收连续推进；精确契约仍待逐子集冻结，企业 P0 未通过。** 当前正文不再以 Paperclip 为实现底座，也不以 OpenMausBot 为独立对话后台。

## 0. 本工作树与外部资料的边界

2026-11-06 Ethan 再次确认：当前仍是内部自托管＋员工本地完整harness＋云模型。最新 D:/evose-audit 已对齐该方向，旧 v3 云执行/商业里程碑降为研究存档；不能继续把旧建议描述成其最新路线。该参考目录由 Ethan 维护，本会话只读，不同步覆盖。四手册与新 fork 对照见 [REFERENCE-REUSE §7](REFERENCE-REUSE.md#7-四份深读手册与新-fork-对照2026-11-06)，本轮组织映射与更新差额见其 §8。

**本会话企业方案正文位于本独立工作树** E:/CodexData/worktrees/morchat-round1/morchat.co/docs。D:/dev/morchat.co/docs 最新已启动 Multica 切换，新增 MULTICA-BASE 与 D11，但仍有旧实现正文，尚未与本树合并；不能说它完全没更新，也不可混用。参考决策摘录及其“定案”标题不替代本树批准状态。Ethan 已确定现有 morchat.co 为唯一产品仓；这两处是同一仓的不同工作树，不是两个产品仓。R1-00 在专用分支形成可分发基线，只登记主树差异，不以合并 main 为前置，也不覆盖他人工作。

**编号防撞：**本树 MINIMUM-CHAIN 的 MC-00–08/01G/05G 是任务卡；外部主仓 MULTICA-BASE 的 MC-01–20 是门禁骨架，两者不同义。外部引用必须带文档名，本树保留 Discovery §4.7 的 PC 历史验收编号；禁止全局 PC→MC 替换或迁记成绩。Ethan 已确认公司=Workspace、部门/资源权限细分，以及项目授权覆盖后续普通任务、私密单授；取舍见 ARCHITECTURE §4.1。C01 实施契约仍 DRAFT，不把产品决定当测试放行。

D:/dev/multica@164290ee14f63fe009ca304db21de9879db104c8 只作上游样本，不作为第二产品仓；固定源码已根级导入，旧实验SHA58402f5…成绩不迁记。GitHub 公开空仓 https://github.com/jerry-halo2026/morchat.co 已创建、origin 已关联，尚未推送、运行 Actions 或配置保护；本地 bootstrap 工作流文件不等于云 CI 已部署。根级源码接入、Git/代码风格/测试/CI/CD 见 ENGINEERING §8–§11，任务与实测见 [MC-00](tasks/MC-00-engineering.md)、[执行记录](tasks/MC-00-results.md)。已批准范围见 [首轮连续授权](ROUND1-DELIVERY.md)；独立产品包仍需相应子集冻结与写集隔离，不能无门禁全量并行。

## 1. 产品定位

公司内部自托管的企业 Agent 协作平台：人和 AI 组成团队，目标拆成任务，任务形成成果，经验沉淀为可复用能力。员工、负责人和老板用同一客户端，默认“我的工作”，按当前权限看到对应任务与业务流转。千川是首个场景，不是平台本体。

- Multica：完整原生产品直接复用，统一客户端、中央协作后台、唯一 Issue/task/run/调度权威。首轮沿原生项目/任务评论/人机小队（S1-D 已确认），独立群入口后补；现成看板、甘特、阶段/工作流、收件箱、权限/撤销基础不重建。
- Paperclip：公司治理、组织/目标、批准/预算/审计及版本机制参考；独立源码仅候选，不部署第二后台。
- OpenMausBot：组队、@、线程、追问/许可/补充/停止、文件和记忆/skill 操作链参考；小型独立代码可评审提取，不导入完整 ChatView/Store/runtime。
- DSH：员工 Windows 本地完整 harness；Multica 原生 daemon/官方 JSONL driver 优先；云端大模型，公司集中管理 Key，原始供应商 Key 不下发通用工具环境。

## 2. 已确认的约束

1. **Bot 就是 AI 同事**，实例映射同一 Agent；模板、实例、小队模板、小队实例、任务、run/attempt 分开。版本须记录候选/批准/实际加载，不能静默热改在途运行。
2. 公司工作资产默认留存，个人隐私除外；留存不等于全员可见。部门普通任务同部可见；敏感/私密群另授权；跨部门只看获授权项目/任务及相关流转，读权不等于写权。
3. 公共 Bot 仅在设备和管理人均获对应资料授权的设备池运行；个人助手默认自己授权设备。同群不代表可用他人电脑；每次资料增量/接续仍重验。
4. 员工有本机管理员权，平台管 Agent、不接管整机；同机/跨机独立任务可并行，局部资源冲突才等待。无合格在线设备明确等待，全员关机停止执行，不中央代跑。
5. 自动保存并接续工作，不搬进程，不依赖员工手动 commit/补传；已确认资产不能丢，未上传内容不承诺零损失。自动归档、当前权限与副作用对账是必要条件。
6. 显示消息、读取上下文、启动 Bot 三件事分开；普通讨论不派工，结构化 @ 定向，所有 Bot 回复按权可见。停止需区分请求已记、设备收到、实际停止。
7. 知识/多维表已纳入未来整体产品；同表行/字段的查看和编辑分别授权，Bot 遵守交集。接受飞书作为内容主存储选项；腾讯/企微尚无租户实测，暂不替换飞书。**外部 CLI/MCP 接入后置，先客户端与 Agent 协作**；不自建办公编辑引擎。
8. 撤权严格验收受控客户端缓存、索引与 Bot 记忆；阻断访问和清理完成分别回执，公司原件/审计按权保留。敏感资料禁止离线使用；离线设备、员工另存/截图不承诺立即远程抹除。
9. 当前内部使用，不外销/外部托管；保留未来公司边界，不先做商业 SaaS 计费或白标。外部销售/改品牌另评许可。

## 3. 开工必读与唯一职责

新对话/Goal 从 [开发交接入口](DEVELOPMENT-HANDOFF.md) 和 [当前任务台账](tasks/ACTIVE.md) 接手；当前工程收束用 [MC-00执行计划](tasks/MC-00-closeout-plan.md)，新任务使用 [任务卡模板](tasks/TEMPLATE.md)。新增 [首轮连续授权](ROUND1-DELIVERY.md) 记录 Ethan 的范围/动作批准；技术契约状态继续以 Discovery 为准。当前执行 [连续计划](superpowers/plans/2026-11-06-round1-continuous.md)，不能再执行归档里的“准备即结束”提示词。

阅读顺序：本页→PRD/PRODUCT-EXPERIENCE→ARCHITECTURE→DISCOVERY-BASELINE→ENGINEERING-BASELINE→任务涉及的专项正文。不能把归档、实验或参考仓 README 当当前开发方案。

按用途分组，避免把“有文件”误当“要全部开发”：
- **权威入口与控制**：README、PRD、ARCHITECTURE、Discovery、ENGINEERING、PLAN、MINIMUM-CHAIN。
- **产品操作**：PRODUCT-EXPERIENCE、PRODUCT-LIFECYCLE。
- **专项契约/验证**：ASSETS、CLIENT-RUNTIME、DISTRIBUTED-COLLABORATION、WORKSPACE-CONTINUITY、WINDOWS-DSH、DUAL-DEVICE。
- **参考与证据**：REFERENCE-REUSE、MULTICA-BASE-EVALUATION、EVOSE、NATIVE-RUNTIME、CROSS-DEVICE、PAPERCLIP、EDICT；只给相关任务必要片段，不要求每个 agent 重读所有竞品。
- **业务资料**：两份 QIANCHUAN 文档仍被现有连接器使用，不因不是平台主线而误删。
- **历史**：DOCS-REBASE 原全文已归档，旧路径只导航；archive/experiments 不参与施工权威。

派发以同仓 docs/tasks 中的实际任务上下文包为准（工程准备时创建），须包括文档/契约 revision、未提交内容 hash、上游/本仓 SHA、写集、测试与审核；没有这些，不让 subagent 从聊天或旧参考目录自行补全。

| 文档 | 唯一职责 |
|---|---|
| [PRD](PRD.md) | 产品目标、首版范围、US 验收 |
| [产品体验](PRODUCT-EXPERIENCE.md) | 首页/侧栏/对话线程/看板/成果与角色使用流程、FE 验收 |
| [当前低保真 v4 与分期](PRODUCT-EXPERIENCE.md#37-项目工作面低保真-v4) | 项目工作面需求样例、员工/负责人合成走查；已按原生源码纠偏，不据图重建菜单/页面；首轮与后续区分，旧 v1–v3 非现行方向 |
| [产品生命周期](PRODUCT-LIFECYCLE.md) | 六步工作闭环、模板/实例/小队/发布与实际运行、LC 验收 |
| [架构](ARCHITECTURE.md) | 技术方向、原生数据权威、模块与权限强制点 |
| [Discovery](DISCOVERY-BASELINE.md) | B01–B08、C01–C08 状态、P0 顺序/失败条件、D01–D10 待决 |
| [最小链路契约与任务卡](MINIMUM-CHAIN.md) | MC-S1 多人群/多 Bot 首轮纵切、C 契约子集、MC-00–08（含 01G/05G）；S1-A/D 已确认，B 使用小包工程默认，C 真实模型费用仍待批准；草案不等于 READY |
| [无模型合成权限规程 NM-ACL-r1](MINIMUM-CHAIN.md#9-不调用模型的合成权限验证nm-acl-r1) | 已确认公司/部门映射和项目继承的正负样本、NM-01–12、零模型约束、撤权观察与失败出口；规程已写明，动态验证 NOT RUN |
| [工程基线](ENGINEERING-BASELINE.md) | 权威、owner、任务卡、模型分工、工作树、追溯、审核/合并门禁 |
| [群协作](DISTRIBUTED-COLLABORATION.md) | C02/C06、@与协作链、设备池/并行/离线、DC 验收 |
| [资产](ASSETS-AND-LEARNING.md) | C04、公司保留/版本/当前授权、受控清理和交接 |
| [客户端 runtime](CLIENT-RUNTIME.md) | 客户端/中央/本地/云模型职责、C05/C08、公司模型用量 |
| [Windows 接入](WINDOWS-DSH-INTEGRATION.md) | 官方 DSH 路径与 Agent 原生安全、WI 验收 |
| [工作接续](WORKSPACE-CONTINUITY.md) | C07 自动检查点与恢复/效果/冲突、WC 验收 |
| [双设备实验](DUAL-DEVICE-VALIDATION.md) | DV 操作、参数与 RPO/RTO 的唯一建议值，不能别处重复改值 |
| [原生运行研究](NATIVE-RUNTIME-RESEARCH.md) | 固定样本的能力/环境差距与 NG 验收 |
| [跨设备研究](CROSS-DEVICE-REFERENCE-RESEARCH.md) | 现成机制与算法候选，不建立新任务权威 |
| [参考复用](REFERENCE-REUSE.md) | 源码直接复用/适配/只参考、固定样本和外部候选研究 |
| [Evose 产品研究](EVOSE-PRODUCT-RESEARCH.md) | 登录态走查＋Ethan 深度报告及终版运行治理报告（§8）与 Multica 官方资料/固定源码逐域对照；补明 Autopilots、企微、插件/版本与企业治理差额，区分 UI、源码与实测，不作为实现权威 |
| [Paperclip 治理参考](PAPERCLIP-BASE.md) | 历史来源与可借鉴机制，非 API/运行权威 |
| [Multica 证据](MULTICA-BASE-EVALUATION.md) | 固定样本、已做与未做、已知失败，不定义新产品方向 |
| [建设顺序](PLAN.md) | G0/P0/P1–P4 顺序和退出条件 |
| [历史迁移记录入口](DOCS-REBASE.md) / 归档总索引 | 完整旧日志/快照只追溯，当前状态以本表权威正文和 Discovery 为准 |
| [千川资料](QIANCHUAN-DATA.md) / [接口历史](QIANCHUAN-API-DEV.md) | 原日期的业务证据，不决定平台范围或调用授权 |
| [edict](EDICT-FLOW.md) | 非运行依赖的机制参考 |

C03 的详细生效规则由 PRODUCT-LIFECYCLE 管；C01 在 ARCHITECTURE 定义身份/强制点、ASSETS 定义来源和保留；Discovery 只登记状态不另造协议。PC-01–20 沿用历史测试编号，当前要求迁至 Discovery §4.7，不表示 Paperclip 依赖。

## 4. 事实与文档状态

- [Multica 实测](../experiments/multica-spike/INTEGRATION-RESULT.md)：Web @→Windows DSH 本地文件/回复/token 已验证；自动归档未通过，人工上传单独通过；匿名裸 uploads 为 P0 FAIL。桌面仅构建/启动不等于交互验收。权限/版本/双设备/公司网关仍未通过完整门禁。
- [合成组队实测](MULTICA-BASE-EVALUATION.md#2026-11-06-合成组队实测权限-fail汇总未闭环)：2026-11-06 单机、双账号、7 个真实 DSH run；A 直调 403 而受托 Bot 修改 B 小队成功，创建归 B，委托子样本 FAIL。成员并行/回传局部成立，最终汇总截至采集未闭环；API/受限 CLI 实验不算 UI、公司 Key、归档或双设备通过。首轮按 MINIMUM-CHAIN r7 前置委托回归、先文本汇合后资产闭环。
- [OMB dev](../experiments/openmausbot-spike/DEV-RESULT.md)：合成引擎的组队、@、线程证据及 342 pass/3 fail；不是企业权限/真实模型链通过。跨会话摘要进入上下文是必须防范的反例。
- [Paperclip 实验](../experiments/integration-spike/README.md)：仅历史对照，不能给 Multica 记 PASS。
- [原生优先源码复核（早期只读阶段）](MULTICA-BASE-EVALUATION.md)：三路只读审查＋主审前端核对，纠正原生组队/多目标 @、阶段汇合/限频、权限撤销、Git/worktree 与甘特被低估的问题；新增 in_review 与 stage barrier 判定静态冲突待测。未新增运行测试，旧 FAIL 保留。

本轮同步 Evose 治理取舍与既有 Multica 组队失败，不增加产品范围、不重跑实验；旧阶段“未新增运行”只指该阶段，不能覆盖最新实测记录。**文档统一不等于契约冻结或实现完成。** C01–C08 仍 DRAFT；具体未决只看 Discovery D01–D10。外部 KD-01–08 全 NOT RUN，后续启用时验收。

## 5. 冲突和防漂移规则

根 [AGENTS.md](../AGENTS.md) 已作为后续 Agent 的薄入口，要求先读当前正文并禁止按归档施工；自动化 CI/路径门禁仍待工程准备实现。

用户最新确认先修入对应权威正文；事实优先于设计断言。范围看 PRD，交互看 PRODUCT-EXPERIENCE，协议看对应 C 正文，状态看 Discovery，分工/门禁看 ENGINEERING。发现冲突先暂停受影响卡，提变更并修正文和消费者，不由 agent 选对自己有利的一版。

本轮迁移前快照与其他 archive、实验报告、旧低保真只有追溯用途。它们不是“低优先级但仍能施工”的方案，而是**不得作为实现指令**。旧“Paperclip 唯一任务底座”“Paperclip 前端＋OMB 对话”“ACP/PCWS 必装”已经撤回。当前任务卡必须列本文档基线、所用 C 的版本/状态、模块 owner 和明确写集；无冻结切片不派产品实现任务。

## 文档索引（由脚本生成，勿手改）

<!-- docs-map:index:begin | generated by scripts/docs-map.mjs — do not edit by hand -->

### 根目录

| 文档 | purpose | owner | status | updated |
|---|---|---|---|---|
| [morchat 整体架构与职责边界](ARCHITECTURE.md) | morchat 整体架构与职责边界 | b01-permission | current | 2026-11-06 |
| [公司资产与持续升级闭环](ASSETS-AND-LEARNING.md) | 公司资产与持续升级闭环 | b04-assets | current | 2026-11-06 |
| [统一客户端与员工本地完整 Harness](CLIENT-RUNTIME.md) | 统一客户端与员工本地完整 Harness | b05-runtime | current | 2026-11-06 |
| [跨设备协作与工作空间接续：参考项目证据](CROSS-DEVICE-REFERENCE-RESEARCH.md) | 跨设备协作与工作空间接续：参考项目证据 | b07-continuity | reference | 2026-11-06 |
| [连续开发交接：准备到首轮验收](DEVELOPMENT-HANDOFF.md) | 连续开发交接：准备到首轮验收 | docs-maintainers | current | 2026-11-07 |
| [Discovery 基线、最小 MVP 与证伪登记](DISCOVERY-BASELINE.md) | Discovery 基线、最小 MVP 与证伪登记 | docs-maintainers | current | 2026-11-07 |
| [群内 Agent 协作与授权设备池](DISTRIBUTED-COLLABORATION.md) | 群内 Agent 协作与授权设备池 | b02-client | current | 2026-11-06 |
| [历史迁移记录入口](DOCS-REBASE.md) | 历史迁移记录入口 | docs-maintainers | reference | 2026-11-06 |
| [自动保存与最小双设备接续证伪方案](DUAL-DEVICE-VALIDATION.md) | 自动保存与最小双设备接续证伪方案 | b07-continuity | current | 2026-11-06 |
| [edict 与调度模式参考边界](EDICT-FLOW.md) | edict 与调度模式参考边界 | b06-dispatch | reference | 2026-11-06 |
| [工程与验证基线](ENGINEERING-BASELINE.md) | 工程与验证基线 | docs-maintainers | current | 2026-11-06 |
| [Evose 产品结构与企业协作研究](EVOSE-PRODUCT-RESEARCH.md) | Evose 产品结构与企业协作研究 | b02-client | reference | 2026-11-06 |
| [最小纵向链路：契约切片与任务卡草案](MINIMUM-CHAIN.md) | 最小纵向链路：契约切片与任务卡草案 | docs-maintainers | current | 2026-11-06 |
| [Multica 当前底座：事实、门禁与实测](MULTICA-BASE-EVALUATION.md) | Multica 当前底座：事实、门禁与实测 | docs-maintainers | reference | 2026-11-06 |
| [Multica 基座接入边界与验证门禁](MULTICA-BASE.md) | 上游基线评估与切换记录 | lead | reference | 2026-11-11 |
| [原生双设备运行与 Harness 选型核查](NATIVE-RUNTIME-RESEARCH.md) | 原生双设备运行与 Harness 选型核查 | b05-runtime | reference | 2026-11-06 |
| [Paperclip 治理参考与源码迁移边界](PAPERCLIP-BASE.md) | Paperclip 治理参考与源码迁移边界 | docs-maintainers | reference | 2026-11-06 |
| [morchat MVP 分阶段建设顺序](PLAN.md) | morchat MVP 分阶段建设顺序 | docs-maintainers | current | 2026-11-06 |
| [morchat 产品需求与首版 MVP](PRD.md) | morchat 产品需求与首版 MVP | b02-client | current | 2026-11-06 |
| [统一工作台、工作首页与角色面板](PRODUCT-EXPERIENCE.md) | 统一工作台、工作首页与角色面板 | b02-client | current | 2026-11-06 |
| [从目标到团队、交付和持续复用](PRODUCT-LIFECYCLE.md) | 从目标到团队、交付和持续复用 | b02-client | current | 2026-11-06 |
| [千川 API 开发手册（实测版）](QIANCHUAN-API-DEV.md) | 千川 API 开发手册（实测版） | integrations | current | 2026-11-06 |
| [千川官方数据面与时效性 — 数据可得性文档](QIANCHUAN-DATA.md) | 千川官方数据面与时效性 — 数据可得性文档 | integrations | current | 2026-11-06 |
| [morchat 文档入口与权威顺序](README.md) | morchat 文档入口与权威顺序 | docs-maintainers | current | 2026-11-07 |
| [参考项目的复用与非复用边界](REFERENCE-REUSE.md) | 参考项目的复用与非复用边界 | docs-maintainers | reference | 2026-11-06 |
| [首轮连续开发范围与授权](ROUND1-DELIVERY.md) | 首轮连续开发范围与授权 | docs-maintainers | current | 2026-11-06 |
| [Windows 原生 DSH：Multica 官方路径与隔离验证](WINDOWS-DSH-INTEGRATION.md) | Windows 原生 DSH：Multica 官方路径与隔离验证 | b05-runtime | current | 2026-11-06 |
| [任务进度、工作空间与跨设备接续设计](WORKSPACE-CONTINUITY.md) | 任务进度、工作空间与跨设备接续设计 | b07-continuity | current | 2026-11-06 |
| [Four-category issue lifecycle (MUL-7240)](issue-status-lifecycle-rollout.md) | Four-category issue lifecycle (MUL-7240) | platform | current | 2026-11-06 |
| [Lark inbound context media](lark-inbound-media.md) | Lark inbound context media | integrations | current | 2026-11-06 |
| [Lark outbound images and files](lark-outbound-media.md) | Lark outbound images and files | integrations | current | 2026-11-06 |
| [Lark Typing reaction cleanup](lark-typing-cleanup.md) | Lark Typing reaction cleanup | integrations | current | 2026-11-06 |
| [Operator-driven maintenance jobs](maintenance-jobs.md) | Operator-driven maintenance jobs | platform | current | 2026-11-06 |
| [Theming Multica](theming.md) | 主题包的构成：manifest、CSS 变量、稳定锚点与内置主题（上游 0.8.2 文档，随同步引入） | sync-0.8.2 | reference | 2026-11-10 |

### brand

| 文档 | purpose | owner | status | updated |
|---|---|---|---|---|
| [品牌、头像与内容库决定（2026-11-10，Ethan 口头批准后固化）](brand/DECISIONS.md) | 品牌、头像与内容库决定（2026-11-10，Ethan 口头批准后固化） | design | reference | 2026-11-10 |
| [首屏假看板（landing hero mock）](brand/mockups/hero/README.md) | 首屏假看板（landing hero mock） | design | reference | 2026-11-10 |
| [Aora 头像参考图](brand/reference/avatar-aora/README.md) | Aora Bot 头像的四档尺寸实拍与生成脚本（20/24/40/56） | lead | current | 2026-11-11 |
| [头像槽位图（avatar-sizes）](brand/reference/avatar-sizes/README.md) | 头像尺寸回归上游后的逐屏对比截图与说明（列表 20 / 评论 24 / 详情 40 / 主视觉 56） | lead | current | 2026-11-11 |
| [Knowledge UI — reference captures (B1)](brand/reference/knowledge-ui/README.md) | 知识库六屏的实拍与说明（S1 首页 / S2 阅读 / S4 条目 / S5 导入） | lead | current | 2026-11-11 |
| [Login → onboarding: reference shots](brand/reference/login-onboarding/README.md) | 登录到 onboarding 的参考截图采集说明（CDP 采集脚本 + 产物索引） | design | reference | 2026-11-10 |
| [Mobile login: reference shot](brand/reference/mobile/README.md) | 移动端登录页参考截图与采集脚本（web 导出 + Playwright，手机视口） | design | reference | 2026-11-11 |

### engineering

| 文档 | purpose | owner | status | updated |
|---|---|---|---|---|
| [提交批次计划（COMMIT-PLAN）](engineering/COMMIT-PLAN.md) | 把当前大型未提交改动拆成可独立回滚的提交批次（含文件区间与验证命令） | lead | draft | 2026-11-10 |
| [接口契约](engineering/CONTRACTS.md) | 接口唯一性与命名规则（一个能力一个入口），PR 时逐条对照 | lead | current | 2026-11-11 |
| [数据库](engineering/DB.md) | 数据库的版本底线、扩展依赖与"缺扩展时的降级行为"（保持自建 Postgres，不做跨方言适配） | lead | current | 2026-11-11 |
| [发布与版本](engineering/RELEASES.md) | 版本号与 tag 的纪律（什么时候才允许打 tag） | lead | current | 2026-11-12 |
| [工具链](engineering/TOOLCHAIN.md) | 三层工具链的职责与协作规则（pnpm/turbo、Go、Postgres、入口胶水） | lead | current | 2026-11-11 |
| [Issue wakeups](engineering/issue-wakeups.md) | Issue wakeups | engineering | current | 2026-11-06 |

### plans

| 文档 | purpose | owner | status | updated |
|---|---|---|---|---|
| [平台化计划：名称收口 / Supabase 统一数据面 / 资料库](plans/2026-11-10-platform-names-supabase-knowledge.md) | 平台化计划：名称收口 / Supabase 统一数据面 / 资料库 | docs-maintainers | current | 2026-11-10 |
| [知识能力集成方案（Evose 对标）— 调研与决策稿](plans/KNOWLEDGE-INTEGRATION-PLAN.md) | 知识能力集成方案（Evose 对标）— 调研与决策稿 | b04-assets | draft | 2026-11-10 |
| [Runtime Configurator 设计 + New API 集成评估](plans/RUNTIME-CONFIGURATOR.md) | Runtime Configurator 设计 + New API 集成评估 | docs-maintainers | current | 2026-11-10 |

### superpowers

| 文档 | purpose | owner | status | updated |
|---|---|---|---|---|
| [首轮连续交付 Implementation Plan](superpowers/plans/2026-11-06-round1-continuous.md) | 首轮连续交付 Implementation Plan | docs-maintainers | current | 2026-11-06 |
| [R1-02C-DSH-FOREIGN-FRAME Implementation Plan](superpowers/plans/2026-11-07-dsh-foreign-frame.md) | R1-02C-DSH-FOREIGN-FRAME Implementation Plan | docs-maintainers | current | 2026-11-07 |
| [Active MAT fixture and panic observation — one-file source implementation](superpowers/plans/2026-11-07-handler-active-mat-diagnostic.md) | Active MAT fixture and panic observation — one-file source implementation | docs-maintainers | current | 2026-11-10 |
| [Handler bootstrap lifecycle — reviewed one-file implementation](superpowers/plans/2026-11-07-handler-bootstrap-lifecycle.md) | Handler bootstrap lifecycle — reviewed one-file implementation | docs-maintainers | current | 2026-11-10 |
| [Issue GET guard — operational recovery binding r2](superpowers/plans/2026-11-07-issue-read-guard-recovery-r2.md) | Issue GET guard — operational recovery binding r2 | docs-maintainers | current | 2026-11-07 |
| [Native Issue GET read guard — detailed task implementation plan](superpowers/plans/2026-11-07-issue-read-guard.md) | Native Issue GET read guard — detailed task implementation plan | docs-maintainers | current | 2026-11-07 |
| [Leader foundation first — gated executable plan](superpowers/plans/2026-11-07-leader-foundation-first.md) | Leader foundation first — gated executable plan | docs-maintainers | current | 2026-11-10 |
| [Leader tests r1 — owner ACK / tests-first source plan](superpowers/plans/2026-11-07-leader-text-tests-first.md) | Leader tests r1 — owner ACK / tests-first source plan | docs-maintainers | current | 2026-11-10 |
| [R1-01D Native Router Clone Implementation Plan](superpowers/plans/2026-11-07-native-clone-guard.md) | R1-01D Native Router Clone Implementation Plan | docs-maintainers | current | 2026-11-10 |
| [Skill claim pin Implementation Plan](superpowers/plans/2026-11-07-skill-claim-pin.md) | Skill claim pin Implementation Plan | docs-maintainers | current | 2026-11-07 |
| [Approved narrow source plan: admin SQL compatibility](superpowers/plans/2026-11-08-admin-sqlcompat.md) | Approved narrow source plan: admin SQL compatibility | docs-maintainers | current | 2026-11-10 |
| [Final observer tests-first Implementation Plan](superpowers/plans/2026-11-08-final-observer-tdd.md) | Final observer tests-first Implementation Plan | docs-maintainers | current | 2026-11-10 |
| [Resource creator source plan](superpowers/plans/2026-11-08-sqlfix-resource.md) | Resource creator source plan | docs-maintainers | current | 2026-11-10 |
| [Windows DSH direct-process tests — source-only plan](superpowers/plans/2026-11-08-windows-dsh-process-tests.md) | Windows DSH direct-process tests — source-only plan | docs-maintainers | current | 2026-11-10 |
| [Four-source Windows containment plan](superpowers/plans/2026-11-08-windows-runtime-source.md) | Four-source Windows containment plan | docs-maintainers | current | 2026-11-10 |
| [Exact API-set diagnostic source Implementation Plan](superpowers/plans/2026-11-09-api-set-query-source.md) | Exact API-set diagnostic source Implementation Plan | docs-maintainers | current | 2026-11-10 |
| [NM03-A Workspace Bootstrap Implementation Plan](superpowers/plans/2026-11-09-nm03a-workspace-bootstrap.md) | NM03-A Workspace Bootstrap Implementation Plan | docs-maintainers | current | 2026-11-10 |
| [O0 helper CSC_R2 minimum epoch derivation](superpowers/plans/2026-11-09-o0-helper-compile-r2.md) | O0 helper CSCR2 minimum epoch derivation | docs-maintainers | current | 2026-11-10 |
| [Readonly O0 helper Library compile plan](superpowers/plans/2026-11-09-o0-helper-library-compile.md) | Readonly O0 helper Library compile plan | docs-maintainers | current | 2026-11-10 |
| [Persistent-host consumer implementation plan](superpowers/plans/2026-11-09-persistent-host-consumer.md) | Persistent-host consumer implementation plan | docs-maintainers | current | 2026-11-10 |

### tasks

| 文档 | purpose | owner | status | updated |
|---|---|---|---|---|
| [当前执行入口](tasks/ACTIVE.md) | 当前执行入口 | task-owners | draft | 2026-11-07 |
| [干净机器首启：内置 DSH 运行时验证（P3-B）](tasks/CLEAN-INSTALL.md) | 干净机器首启验证：安装包内置 DSH 运行时能否零依赖注册（P3-B） | task-owners | draft | 2026-11-11 |
| [CLIENT-GITHUB-INTEGRATION-UI-r1](tasks/CLIENT-GITHUB-INTEGRATION-UI-r1.md) | CLIENT-GITHUB-INTEGRATION-UI-r1 | task-owners | current | 2026-11-10 |
| [CLIENT-GITHUB-PROJECT-SKILL-UI-r1](tasks/CLIENT-GITHUB-PROJECT-SKILL-UI-r1.md) | CLIENT-GITHUB-PROJECT-SKILL-UI-r1 | task-owners | current | 2026-11-10 |
| [CLIENT-HELP-FEISHU-r1 — bounded client help destination](tasks/CLIENT-HELP-FEISHU-r1.md) | CLIENT-HELP-FEISHU-r1 — bounded client help destination | task-owners | current | 2026-11-10 |
| [COLLABORATION-NEXT — 先验证真人任务协作闭环](tasks/COLLABORATION-NEXT.md) | COLLABORATION-NEXT — 先验证真人任务协作闭环 | task-owners | current | 2026-11-10 |
| [当前确认目标（Ethan，2026-11-09）](tasks/CURRENT-GOAL.md) | 当前确认目标（Ethan，2026-11-09） | task-owners | current | 2026-11-09 |
| [Desktop dev actual run — 2026-11-09](tasks/DESKTOP-DEV-RUN.md) | Desktop dev actual run — 2026-11-09 | task-owners | current | 2026-11-10 |
| [DSH 审批 / 提问协议实测（W6 只读侦查）](tasks/DSH-ASK-SPIKE.md) | DSH 审批 / 提问协议实测（W6 只读侦查） | task-owners | current | 2026-11-10 |
| [DSH 桥接内置：S0 结论](tasks/DSH-BUNDLE-SPIKE.md) | 让安装包自带 DSH 桥接（S0 spike）的结论与两处裁剪修复 | lead | current | 2026-11-11 |
| [DSH live usage callback — LOCAL-DSH-LIVE-USAGE-r1](tasks/DSH-LIVE-USAGE-SLICE.md) | DSH live usage callback — LOCAL-DSH-LIVE-USAGE-r1 | task-owners | current | 2026-11-09 |
| [DSH profile bundle：把「可见」改成官方安装路径（AG-5）](tasks/DSH-PROFILE-BUNDLE.md) | 把打包内置的 DSH 从「守护进程能看见 dsh」改成对齐官方 profile bundle 安装路径：零 CLI 例外、本地 bundle 安装、装后 probe 复检 | task-owners | current | 2026-11-11 |
| [DSH 真实 run（已跑通）](tasks/DSH-REAL-RUN.md) | 用本仓库后端 + 本机 DSH 完成一次真实 run 的证据与复现步骤 | lead | current | 2026-11-11 |
| [DSH runtime dependency review — 2026-11-09](tasks/DSH-RUNTIME-REVIEW.md) | DSH runtime dependency review — 2026-11-09 | task-owners | current | 2026-11-10 |
| [E2E 运行记录](tasks/E2E-RUN.md) | Playwright 套件在本机的实际运行结论与阻塞点 | lead | current | 2026-11-11 |
| [Evose 知识库 API — 导入 / 分块 / 召回 实测记录](tasks/EVOSE-KB-API.md) | Evose 知识库 API — 导入 / 分块 / 召回 实测记录 | b02-client | current | 2026-11-10 |
| [首启运行时指引：两种状态、可读提示、可复制命令（W2-AG5）](tasks/FIRST-RUN-GUIDANCE.md) | 首启运行时状态的可读指引：把 daemon 的 dsh_profile reason 变成两种可读提示 + 可复制命令，八语言同步 | task-owners | current | 2026-11-11 |
| [GET guard isolated retest — 2026-11-09](tasks/GET-GUARD-LOCAL-RETEST.md) | GET guard isolated retest — 2026-11-09 | task-owners | current | 2026-11-10 |
| [Windows 安装包交付与 DSH profile bundle 语义对齐（W1-AG1）](tasks/INSTALLER.md) | Windows 安装包交付（--win --dir 可用产物）与 multica 官方 DSH profile bundle 语义对齐结论 | task-owners | current | 2026-11-11 |
| [KNOWLEDGE-BENCH：10 万 chunk 知识检索压测](tasks/KNOWLEDGE-BENCH.md) | 知识检索 10 万 chunk 压测：造数、查询集、四项指标与瓶颈归因 | task-owners | current | 2026-11-11 |
| [KNOWLEDGE-CONTRACT-FIX：以服务端为唯一契约的前端适配（AG-7）](tasks/KNOWLEDGE-CONTRACT-FIX.md) | 把知识库与预设画廊的前端改到服务端实际契约上：space_id 路由、列表/单页信封、search hits、catalog 带工作区与鉴权头 | task-owners | current | 2026-11-11 |
| [KNOWLEDGE-MCP：知识工具面的 MCP 端点（AG-8 / W3）](tasks/KNOWLEDGE-MCP.md) | 把知识库工具面暴露成 MCP 端点（POST /api/mcp/knowledge，JSON-RPC 2.0 over HTTP）：契约、鉴权、工作区 MCP server 注册步骤，以及本机真实 run 的结论与缺口 | task-owners | current | 2026-11-11 |
| [Local existing DeepSeek account connection — r1 candidate](tasks/LOCAL-DSH-ACCOUNT-CONNECTION.md) | Local existing DeepSeek account connection — r1 candidate | task-owners | current | 2026-11-09 |
| [本地第一阶段实机验收（2026-11-09）](tasks/LOCAL-FIRST-STAGE-ACCEPTANCE.md) | 本地第一阶段实机验收（2026-11-09） | task-owners | current | 2026-11-09 |
| [Native invitation collaboration — local existing-feature acceptance](tasks/LOCAL-INVITATION-COLLABORATION.md) | Native invitation collaboration — local existing-feature acceptance | task-owners | current | 2026-11-09 |
| [当前源码本机运行（2026-11-09）](tasks/LOCAL-RUN.md) | 当前源码本机运行（2026-11-09） | task-owners | current | 2026-11-09 |
| [MC-00 收束计划入口（授权已更新）](tasks/MC-00-closeout-plan.md) | MC-00 收束计划入口（授权已更新） | task-owners | current | 2026-11-06 |
| [MC-00 本地复验命令](tasks/MC-00-commands.md) | MC-00 本地复验命令 | task-owners | current | 2026-11-06 |
| [MC-00：工程接入与基线准备](tasks/MC-00-engineering.md) | MC-00：工程接入与基线准备 | task-owners | draft | 2026-11-06 |
| [MC-00 执行记录](tasks/MC-00-results.md) | MC-00 执行记录 | task-owners | current | 2026-11-06 |
| [MC-01G 无模型权限切片：工程交接](tasks/MC-01G-preflight.md) | MC-01G 无模型权限切片：工程交接 | task-owners | current | 2026-11-06 |
| [MOBILE-BUILD：移动端构建并启动到登录页](tasks/MOBILE-BUILD.md) | 移动端构建到登录页：web 导出的可分发物、图标断言、截图与已知卡点（含两处 web 打包修复） | mobile | current | 2026-11-11 |
| [Native authenticated project/task create → read, local slice](tasks/NATIVE-CREATE-READ-SLICE.md) | Native authenticated project/task create → read, local slice | task-owners | current | 2026-11-10 |
| [NM03 原生创建＋分类同事务候选](tasks/NATIVE-CREATION-CONTRACT.md) | NM03 原生创建＋分类同事务候选 | task-owners | draft | 2026-11-10 |
| [NM03 原生创建契约独立评审](tasks/NATIVE-CREATION-REVIEW.md) | NM03 原生创建契约独立评审 | task-owners | draft | 2026-11-10 |
| [NM03-A new-workspace atomic authorization bootstrap](tasks/NM03A-WORKSPACE-BOOTSTRAP.md) | NM03-A new-workspace atomic authorization bootstrap | task-owners | current | 2026-11-10 |
| [NM03-B：原生项目／普通任务创建→授权读回候选](tasks/NM03B-NATIVE-CREATE-READ.md) | NM03-B：原生项目／普通任务创建→授权读回候选 | task-owners | draft | 2026-11-10 |
| [密码登录（不依赖 Supabase）](tasks/PASSWORD-AUTH.md) | 邮箱 + 密码登录的原生实现：Argon2id 凭据、登录/改密/重置三个接口、失败锁定、CLI 供给与审计落点 | task-owners | draft | 2026-11-11 |
| [公司 Key 失效 → 降级个人 Key → 用量记 personal 验证记录](tasks/PERSONAL-KEY-E2E.md) | 公司 Key 失效 → 自动降级个人 Key → 用量记 personal 的端到端验证记录（P3-C） | task-owners | draft | 2026-11-11 |
| [PRESET-IMPORT-SMOKE — 内容仓预设 → Skill → Agent → Squad（本地 dev 实测）](tasks/PRESET-IMPORT-SMOKE.md) | 预设导入冒烟：技能→Agent→Squad 的真实调用记录 | lead | current | 2026-11-11 |
| [R1-00：恢复工程基线与可执行派工](tasks/R1-00-baseline.md) | R1-00：恢复工程基线与可执行派工 | task-owners | current | 2026-11-07 |
| [R1-00-PNPM-BOOTSTRAP](tasks/R1-00-pnpm-bootstrap.md) | R1-00-PNPM-BOOTSTRAP | task-owners | current | 2026-11-10 |
| [R1-00-PNPM-INSTALL-ARGV-COMPAT-R2](tasks/R1-00-pnpm-install-argv-compat-r2.md) | R1-00-PNPM-INSTALL-ARGV-COMPAT-R2 | task-owners | current | 2026-11-10 |
| [R1-00-PNPM-INSTALL-PROJECTLINK-R3](tasks/R1-00-pnpm-install-projectlink-r3.md) | R1-00-PNPM-INSTALL-PROJECTLINK-R3 | task-owners | current | 2026-11-10 |
| [R1-00-PNPM-INSTALL-RUNNER](tasks/R1-00-pnpm-install-runner.md) | R1-00-PNPM-INSTALL-RUNNER | task-owners | current | 2026-11-10 |
| [R1-00-PNPM-OFFLINE-EXTRACT](tasks/R1-00-pnpm-offline-extract.md) | R1-00-PNPM-OFFLINE-EXTRACT | task-owners | current | 2026-11-10 |
| [R1-00-PUBLIC-INVENTORY-PRIVACY r2](tasks/R1-00-public-inventory-privacy-r2.md) | R1-00-PUBLIC-INVENTORY-PRIVACY r2 | task-owners | current | 2026-11-10 |
| [R1-00 独立评审记录](tasks/R1-00-review.md) | R1-00 独立评审记录 | task-owners | current | 2026-11-06 |
| [R1-00-R4-PERSISTENT-HOST-CONSUMER](tasks/R1-00R4-persistent-host-consumer.md) | R1-00-R4-PERSISTENT-HOST-CONSUMER | task-owners | draft | 2026-11-10 |
| [R1-01：多人原生协作与企业权限](tasks/R1-01-collaboration.md) | R1-01：多人原生协作与企业权限 | task-owners | current | 2026-11-07 |
| [R1-01A 初始权限结构与真实夹具 Implementation Plan](tasks/R1-01A-schema.md) | R1-01A 初始权限结构与真实夹具 Implementation Plan | task-owners | draft | 2026-11-07 |
| [R1-01B-DB：首个真实 PAT→CLI HTTP RED](tasks/R1-01B-auth-db.md) | R1-01B-DB：首个真实 PAT→CLI HTTP RED | task-owners | draft | 2026-11-07 |
| [R1-01B-AUTH：同候选 M1+M2 与可信凭据来源修复](tasks/R1-01B-auth-foundation.md) | R1-01B-AUTH：同候选 M1+M2 与可信凭据来源修复 | task-owners | draft | 2026-11-07 |
| [R1-ISSUE-READ-RED：原生跨部门任务读取反例](tasks/R1-01C-issue-read.md) | R1-ISSUE-READ-RED：原生跨部门任务读取反例 | task-owners | draft | 2026-11-07 |
| [R1-01D / R1-ISSUE-READ-GUARD：最小原生GET权限修复](tasks/R1-01D-issue-guard.md) | R1-01D / R1-ISSUE-READ-GUARD：最小原生GET权限修复 | task-owners | current | 2026-11-07 |
| [R1-01D-NATIVE-CLONE — Issue-read 测试隔离目标适配](tasks/R1-01D-native-clone.md) | R1-01D-NATIVE-CLONE — Issue-read 测试隔离目标适配 | task-owners | current | 2026-11-10 |
| [R1-02：Windows 本地执行、自动归档与用量](tasks/R1-02-execution.md) | R1-02：Windows 本地执行、自动归档与用量 | task-owners | current | 2026-11-07 |
| [R1-02A-CACHE：拒绝无效输入并保护已有缓存](tasks/R1-02A-cache.md) | R1-02A-CACHE：拒绝无效输入并保护已有缓存 | task-owners | current | 2026-11-07 |
| [R1-02B — claim固定版本最小拒绝漂移](tasks/R1-02B-claim-pin.md) | R1-02B — claim固定版本最小拒绝漂移 | task-owners | current | 2026-11-07 |
| [R1-02B Manifest version regression r1](tasks/R1-02B-manifest-version-regression.md) | R1-02B Manifest version regression r1 | task-owners | current | 2026-11-10 |
| [R1-02C — DSH foreign-request 帧隔离](tasks/R1-02C-dsh-foreign-frame.md) | R1-02C — DSH foreign-request 帧隔离 | task-owners | current | 2026-11-07 |
| [R1-02D — Windows direct-process DSH coverage](tasks/R1-02D-windows-dsh-process.md) | R1-02D — Windows direct-process DSH coverage | task-owners | current | 2026-11-10 |
| [R1-02D2 — Windows ownership-denial tests before repair](tasks/R1-02D2-windows-failclosed-tests.md) | R1-02D2 — Windows ownership-denial tests before repair | task-owners | current | 2026-11-10 |
| [R1-02E single versioned APIset contract evidence](tasks/R1-02E-O0-api-set-contract.md) | R1-02E single versioned APIset contract evidence | task-owners | current | 2026-11-10 |
| [R1-02E O0 frontier evidence](tasks/R1-02E-O0-frontier-evidence.md) | R1-02E O0 frontier evidence | task-owners | current | 2026-11-10 |
| [R1-02E-NATIVE-O0-HELPER-COMPILE-R2-PREP](tasks/R1-02E-O0-helper-compile-r2.md) | R1-02E-NATIVE-O0-HELPER-COMPILE-R2-PREP | task-owners | current | 2026-11-10 |
| [R1-02E-NATIVE-O0-HELPER-COMPILE-PREP](tasks/R1-02E-O0-helper-compile.md) | R1-02E-NATIVE-O0-HELPER-COMPILE-PREP | task-owners | current | 2026-11-10 |
| [R1-02E-NATIVE-O0-SOURCE fix2/5](tasks/R1-02E-O0-source-fix2.md) | R1-02E-NATIVE-O0-SOURCE fix2/5 | task-owners | current | 2026-11-10 |
| [R1-02E-NATIVE-O0-SOURCE fix4/5](tasks/R1-02E-O0-source-fix4.md) | R1-02E-NATIVE-O0-SOURCE fix4/5 | task-owners | current | 2026-11-10 |
| [R1-02E-NATIVE-O0-SOURCE fix5/5](tasks/R1-02E-O0-source-fix5.md) | R1-02E-NATIVE-O0-SOURCE fix5/5 | task-owners | current | 2026-11-10 |
| [R1-02E O0 stored win32u candidate](tasks/R1-02E-O0-win32u-candidate.md) | R1-02E O0 stored win32u candidate | task-owners | current | 2026-11-10 |
| [R1-02E O0 win32u first DATA observation](tasks/R1-02E-O0-win32u-data.md) | R1-02E O0 win32u first DATA observation | task-owners | current | 2026-11-10 |
| [R1-02E APIset diagnostic separate library compile](tasks/R1-02E-api-set-query-compile.md) | R1-02E APIset diagnostic separate library compile | task-owners | current | 2026-11-10 |
| [R1-02E exact APIset query source](tasks/R1-02E-api-set-query-source.md) | R1-02E exact APIset query source | task-owners | current | 2026-11-10 |
| [R1-02E-APPHOST-ACQUISITION](tasks/R1-02E-apphost-acquisition.md) | R1-02E-APPHOST-ACQUISITION | task-owners | current | 2026-11-10 |
| [R1-02E-APPHOST-LINK](tasks/R1-02E-apphost-link.md) | R1-02E-APPHOST-LINK | task-owners | current | 2026-11-10 |
| [R1-02E-FINAL-OBSERVER — tests-first source slice](tasks/R1-02E-final-observer-tdd.md) | R1-02E-FINAL-OBSERVER — tests-first source slice | task-owners | current | 2026-11-10 |
| [R1-02E-RUNTIME-ADAPTERS r2](tasks/R1-02E-runtime-adapters-r2.md) | R1-02E-RUNTIME-ADAPTERS r2 | task-owners | current | 2026-11-10 |
| [R1-02E — Windows containment source](tasks/R1-02E-windows-runtime-source.md) | R1-02E — Windows containment source | task-owners | current | 2026-11-10 |
| [R1-03：Leader 回传闭环、版本与双设备可靠性](tasks/R1-03-reliability.md) | R1-03：Leader 回传闭环、版本与双设备可靠性 | task-owners | current | 2026-11-06 |
| [R1-03A — Leader原生文本产品纵切：tests-first](tasks/R1-03A-leader-text.md) | R1-03A — Leader原生文本产品纵切：tests-first | task-owners | current | 2026-11-10 |
| [R1-03B-ADMIN-SQLCOMPAT — PG native metadata compatibility repair](tasks/R1-03B-admin-sqlcompat.md) | R1-03B-ADMIN-SQLCOMPAT — PG native metadata compatibility repair | task-owners | current | 2026-11-10 |
| [R1-03B — Leader foundation，首个可运行生产基础切片](tasks/R1-03B-leader-foundation.md) | R1-03B — Leader foundation，首个可运行生产基础切片 | task-owners | current | 2026-11-10 |
| [R1-03B-LOADER-CAPTURE](tasks/R1-03B-loader-capture.md) | R1-03B-LOADER-CAPTURE | task-owners | current | 2026-11-10 |
| [R1-03B-NATIVE-PINS-DIAGNOSTIC](tasks/R1-03B-native-pins-diagnostic.md) | R1-03B-NATIVE-PINS-DIAGNOSTIC | task-owners | current | 2026-11-10 |
| [R1-03B-PUBLIC-ADAPTER-PROBE](tasks/R1-03B-public-adapter-probe.md) | R1-03B-PUBLIC-ADAPTER-PROBE | task-owners | current | 2026-11-10 |
| [R1-03B-PUBLIC-OBSERVABILITY](tasks/R1-03B-public-observability.md) | R1-03B-PUBLIC-OBSERVABILITY | task-owners | current | 2026-11-10 |
| [R1-03C — ONE SQLFIX replacement resource creator](tasks/R1-03C-sqlfix-resource.md) | R1-03C — ONE SQLFIX replacement resource creator | task-owners | current | 2026-11-10 |
| [R1-INCIDENT-WORKTREE-01 — startup-cleanup incident / recovery gate](tasks/R1-INCIDENT-WORKTREE-01.md) | R1-INCIDENT-WORKTREE-01 — startup-cleanup incident / recovery gate | task-owners | current | 2026-11-07 |
| [首轮恢复与连续开发记录](tasks/R1-results.md) | 首轮恢复与连续开发记录 | task-owners | draft | 2026-11-07 |
| [R1 交接文档独立审查](tasks/R1-review.md) | R1 交接文档独立审查 | task-owners | current | 2026-11-06 |
| [回归基线（main @ 0.8.2 之后）](tasks/REGRESSION-BASELINE.md) | 0.8.2 合并后 main 上的隐性回归盘点（门禁 fail-open 掩盖的问题），作为修复基线 | lead | current | 2026-11-11 |
| [本地启动与文档交付独立审核](tasks/STARTUP-DELIVERY-REVIEW.md) | 本地启动与文档交付独立审核 | task-owners | current | 2026-11-09 |
| [本地启动实际索引独立复核](tasks/STARTUP-STAGED-REVIEW.md) | 本地启动实际索引独立复核 | task-owners | current | 2026-11-10 |
| [SUPABASE-LOGIN independent review](tasks/SUPABASE-LOGIN-REVIEW.md) | SUPABASE-LOGIN independent review | task-owners | current | 2026-11-09 |
| [SUPABASE-LOGIN staged review — APPROVED](tasks/SUPABASE-LOGIN-STAGED-REVIEW.md) | SUPABASE-LOGIN staged review — APPROVED | task-owners | current | 2026-11-10 |
| [SUPABASE-LOGIN — email/password to native Multica session](tasks/SUPABASE-LOGIN.md) | SUPABASE-LOGIN — email/password to native Multica session | task-owners | current | 2026-11-09 |
| [TASK-DETAIL-404 — 自然创建与读取政策未接通](tasks/TASK-DETAIL-404.md) | TASK-DETAIL-404 — 自然创建与读取政策未接通 | task-owners | current | 2026-11-10 |
| [TASK-ID：任务标题](tasks/TEMPLATE.md) | TASK-ID：任务标题 | task-owners | current | 2026-11-06 |
| [UI-VERIFICATION：知识库与预设画廊真数据验收（W1-AG3）](tasks/UI-VERIFICATION.md) | W1-AG3 真数据验收：知识库六屏 + 预设画廊点击导入，记录可复现的请求/响应、截图与失败项 | task-owners | current | 2026-11-11 |
| [本地分支与工作树梳理](tasks/WORKTREE-STATUS.md) | 本地分支与工作树梳理 | task-owners | current | 2026-11-09 |
| [R1-02B-SKILL-CLAIM-PIN — r2 DRAFT exact component proposal](tasks/contracts/R1-02B-CLAIM-PIN-r2-spec.md) | R1-02B-SKILL-CLAIM-PIN — r2 DRAFT exact component proposal | task-owners | draft | 2026-11-07 |
| [R56 DSH foreign-frame owner specification (DRAFT pending Root TEST-FROZEN)](tasks/contracts/R1-02C-DSH-FOREIGN-FRAME-r1-spec.md) | R56 DSH foreign-frame owner specification (DRAFT pending Root TEST-FROZEN) | task-owners | draft | 2026-11-07 |
| [R1-ACL-r1: initial persisted NM-02a candidate](tasks/contracts/R1-ACL-r1.md) | R1-ACL-r1: initial persisted NM-02a candidate | task-owners | draft | 2026-11-06 |
| [R1-01B first HTTP RED: auth-only retained-DB fixture proposal](tasks/contracts/R1-AUTH-DB-r1-proposal.md) | R1-01B first HTTP RED: auth-only retained-DB fixture proposal | task-owners | draft | 2026-11-07 |
| [R1-01B-AUTH foundation task/card amendment — DRAFT](tasks/contracts/R1-AUTH-FOUNDATION-r1-proposal.md) | R1-01B-AUTH foundation task/card amendment — DRAFT | task-owners | draft | 2026-11-07 |
| [R1-01D-NATIVE-CLONE r1 owner specification](tasks/contracts/R1-ISSUE-READ-GUARD-native-clone-r1-spec.md) | R1-01D-NATIVE-CLONE r1 owner specification | task-owners | current | 2026-11-10 |
| [R1-ISSUE-READ-GUARD-r1 — owner source-contract proposal r2](tasks/contracts/R1-ISSUE-READ-GUARD-r2-spec.md) | R1-ISSUE-READ-GUARD-r1 — owner source-contract proposal r2 | task-owners | draft | 2026-11-07 |

### upstream

| 文档 | purpose | owner | status | updated |
|---|---|---|---|---|
| [漂移基线](upstream/DRIFT-BASELINE.md) | 与上游 v0.8.2 的既有差异基线（冻结），作为漂移门禁的起点 | lead | current | 2026-11-11 |
| [Multica 导入来源](upstream/README.md) | Multica 导入来源 | upstream | reference | 2026-11-06 |
| [接缝白名单](upstream/SEAMS.md) | 与上游允许存在差异的路径白名单（接缝），供 check-upstream-drift 使用 | lead | current | 2026-11-11 |
| [主线 8 提交移植到 `sync/0.8.2`（U6 执行）](upstream/SYNC-0.8.2-PORT.md) | U6 移植记录：把主线 8 个提交搬到 sync/0.8.2，逐提交冲突处理、641/642 迁移改号、丢弃的 hunk 与门禁输出 | u6-sync | current | 2026-11-11 |
| [v0.8.2 同步结果（U2 执行）](upstream/SYNC-0.8.2-RESULT.md) | multica v0.8.2 同步的执行记录：提交序列、迁移重编号、冲突决定、未合并项与验证输出 | u2-sync | current | 2026-11-10 |

<!-- docs-map:index:end -->

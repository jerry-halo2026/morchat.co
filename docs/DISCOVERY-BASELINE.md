# Discovery 基线、最小 MVP 与证伪登记

> 2026-11-05，评审稿。本轮只修订 docs。产品方向已确认；下列接口尚未冻结，P0 实验全部 NOT RUN。固定源码证据不等于部署版本或运行验收。本文是八项工作边界、契约状态、P0 依赖和未决项的唯一登记处；开发协作规则以 [工程基线](D:/dev/morchat.co/docs/ENGINEERING-BASELINE.md) 为准。

## 1. 本轮结论与首版边界

**未被否定的是产品方向；被静态反例否定的是“把参考项目配置连接起来就已经闭环”。**当前路线需要企业适配及受控的 Paperclip 原生扩展，不能承诺零核心改动，也不能把 Windows 节点、权限强制和接续协议统称为一个很薄的 adapter。

**设备前提已确认：**员工保留本机管理员权限；平台约束 Agent，不接管整机。公用 Bot 仅能在设备及管理人均获对应资料授权的节点运行；宿主管理员身份不授予 Agent 管理员权。权限要覆盖新增资料及换机接续，详细唯一规则见 [设备池 §3.1](D:/dev/morchat.co/docs/DISTRIBUTED-COLLABORATION.md)。这一确认不代表 Windows 隔离已验证，也不自动批准 run 级模型出口或工具域方案。

**执行时段已确认：**不要求全部员工关机后继续工作，撤回常在线执行节点提前进入首版的建议。无合格在线设备时等待，中央继续数据接收/校验、权限与任务治理、资产保留及费用对账，不运行员工 harness；在线授权池和既有安全接续要求不变。模型推理仍由云端供应商提供。此项不是恢复实验降标：有合格在线目标设备的正向接续仍须通过。

首版仍是企业人机协作平台：目标→组队→拆分认领→协作交付→复盘→复用。员工、负责人、老板同一客户端；个人/部门/获授权跨部门面板同源。中央协调、员工本地完整 harness、云端模型；公司统一 Key，工作资产按权保留。千川只读是场景之一，关闭它仍须完成非千川协作。

### 1.1 八项最小工作边界

八项是交付与所有权边界，**不是八个微服务、八套数据库或八套独立产品**。中央自有模块优先模块化单体；Paperclip 保持独立权威边界。D=已有能力直接消费；A=外围适配/企业语义；P=进入 Paperclip 原生服务/事务/运行准备路径的受控扩展，优先上游 hook，必要时维护最小补丁。

| ID / 边界 | D 直接复用 | A 最小自建或适配 | P 不能仅靠外围代理解决的点 |
|---|---|---|---|
| B01 企业权限桥 | 原生用户/Agent、project/issue/source ACL、原生指令授权 | 部门/群/资源/发布/设备政策及真实身份映射 | 导入副作用、最终运行准入、内部指令回写、测试证据读取等入口接企业政策；原生权限保留，不以管理员代理替代 |
| B02 统一协作客户端 | Paperclip 任务/运行/费用查询和受限管理组件；OpenMausBot 体验参考 | 群、@、任务卡、收件箱及同源角色面板；已有身份下操作 | 员工原子认领/转派若无受支持条件写接口，须在原生任务事务处扩展；不能另存负责人解决竞态 |
| B03 组合与受控发布 | AGENTS/TEAM 包、preview/import、配置 revision、skill fork/测试/恢复 | 一套有类型的组合元数据供岗位包/Bot 模板/小队模板/能力发布复用；真实成员映射、冻结包、步骤回执、业务评判、条件生效/回退 | import 同源冻结与逐效果政策；配置回退接原生 CAS；最终技能集合准入，不能只核查 Agent 页面绑定 |
| B04 版本证据与授权资产 | 原生 Agent files 的 blob/hash/current manifest、skill 包/版本、资产与搜索服务 | 历史保留引用、能力组合、来源 ACL、实际消费证据；仅自有消息/业务材料另建索引 | 历史引用进入 GC 保留根或复用公司保留资产；测试快照/历史/下载当前授权过滤；已有查询服务注入条件 |
| B05 Windows 本地 runtime | DSH agent loop、官方 ACP SDK、MXC ProcessContainer、受控浏览器组件 | 公司 supervisor、独立 profile/HOME、每 run 边界、安装更新/诊断 | 不自造 OS 隔离或 harness；具体 SDK 能力不足就阻塞/换候选，不绕权限 |
| B06 设备派发与远程 adapter | Paperclip 外部 adapter 生命周期、task/run、唤醒/取消基础 | 授权池、容量预留、claim、租约/代次、事件/取消/重连回执 | 接受派单不等于运行完成；现有入口不足时受支持扩展；不另建任务运行权威 |
| B07 自动保存与双设备接续 | PCWS 快照、上传回执、epoch/writer/parent 条件发布、Git/既有对象存储 | Windows 一致采集/恢复、自动触发、效果对账与接续桥 | 明确新增员工节点 PCWS 入口/transport，固定样本只认 paperrunner+sandbox 且有 POSIX 假设；不能只接 task RPC |
| B08 公司模型网关与成本回执 | provider 协议、公司秘密存储组件、Paperclip 成本/预算账 | run 限范围准入、公司路由/额度、真实 usage 归属与防重回执 | 入口计量和原生账一致；需要扩展时在既有成本入口做，不另起成本总账 |

首版缩减：一套 DSH/Windows 路线、两份岗位包及 Bot 模板示例、一个小队模板；两个真实模型协议路由先冒烟，再冻结一个模型组合做故障实验。OpenMausBot 可为 **零运行时依赖**，只择取确有价值且许可/依赖合适的片段；不移植其整套 skill store/importer。Multica 仅参考模式。原生资产/搜索服务能按权查询的内容不再复制成第二套库。所有门禁复用一套纵向 fixture、故障注入与证据格式，不为 NG/WI/DV/DC/WC/LC 各造一个测试平台。

不包含：公共模板市场、任意插件 YAML、DSH Teams、多 harness 同时建设、全供应商矩阵、多系统首发、低代码工作流、自动改平台源码、真实第三方业务写入。详见 [PRD](D:/dev/morchat.co/docs/PRD.md)。

## 2. 源码反例及必要修正

固定 Paperclip：40ea7a9b8994e9bdb3d13794b5847388be0f7a92；以下是静态代码路径与本项目要求的差距，不是动态复现报告，也不是泛称上游存在安全漏洞。原生策略不等于我们额外要求的企业策略。

| 发现 | 反例与已具备能力 | 首版收口 |
|---|---|---|
| F01 指令历史的字节未必保得住 | durable Agent files 已有 S3/hash/manifest；没有 durable head 且开关关闭时不走该持久化。GC 只保 current head，非当前对象按对象创建年龄超过 30 天可被删除；历史 manifest 本身不保字节 | 验证 durable 模式；复用 blob/manifest，增加历史保留根或接既有保留资产。不重造归档引擎；普通指令 history 路由不保证新保存历史 |
| F02 版本清单不等于执行选择 | 普通新 run 读当前 Agent/config/目录；已准入 native run 的 persisted input/skill map 则可保留，不能混为一谈。原生配置 rollback 并非所有路径都有 expected revision | 采用选定组合的 per-run 物化，生效/回退用原生条件事务；配置 revision、指令 manifest、skill 版本必须完整，不反复翻共享全局配置模拟历史并行 |
| F03 自动回写不天然产候选 | native instruction tool 可直达服务；warm checkpoint/停止回收均能 apply。Agent directory 同文件采用 last-sync-wins，旧 run 可能覆盖人工较新版 | 正常 run 的正式能力投影只读；建议以任务成果/候选提交。必要 hook 覆盖 commit/apply，不阻断任务工作文件保存；拒绝后候选仍须留存 |
| F04 最终技能超出页面绑定 | task 标题/描述/评论可临时扩充 run 的技能集合，环境插件可自动安装/同名覆盖；这不是永久修改 Agent 绑定 | 所有 mention/environment/connector 注入完成后，对最终集合与版本做用途准入，再物化；来源可读不等于获准生产使用 |
| F05 模板预览/安装不等于原子冻结 | preview/install 分别 prepare；来源重写使源 hash 不等于有效 hash。默认 claude_local、rename、新建对象、部分 warning、routine/trigger 生效均非我们所需语义 | 固定内部包，核验规范化最终效果；显式 remote adapter/include、bind-existing ID、步骤幂等、routine paused 且无活跃 trigger。未满足依赖 BLOCKED，不能只套 hire 审批 |
| F06 测试证据可能跨来源范围 | 原生 test detail/list/template 以 skill/company 范围取输入、Agent/输出快照及 issue 成果，不保证叠加原测试任务/素材 ACL | 测试输入/模板/输出/快照全部关联持久源政策，查询取权限交集。修复前共享测试只用合成/明确公开材料；issue 到期不消除快照权限义务 |
| F07 缓存幂等回执也要当前鉴权 | public MCP 普通操作经过原生授权，但 completed receipt 可直接返回旧 result；公司成员有效不等于仍有该资源读取权 | 保留防重，不重放 mutation；先验资源再返回正文，或仅返回无敏感回执再走当前授权读。MVP 不启用的 public MCP 整体关闭，不只是藏按钮 |
| F08 断开来源不等于撤权 | source detach/disconnect 保留来源限制有其语义；skill 历史一般按当前 skill ACL 读取，不是每版独立 ACL | 历史/缓存/派生材料按当前政策。私密方法脱敏后扩大传播，创建独立 ACL 根的安全资产/skill，不放宽旧 identity 导致旧版也外露 |
| F09 搜索/目录已有轮子 | 原生 company-artifacts/search 服务支持 issue/project 条件；某些公司级路由只校验公司 | 接服务的按权条件及下载授权，不把原始公司级 API 裸露员工；只补自有材料索引 |
| F10 task 接通不是 Windows 接续 | HTTP adapter 的 200 可直接成为 exit 0；PCWS remote 入口约束 paperrunner+sandbox，transport 有 POSIX 路径，但 epoch/writer/parent 条件发布已有 | 完整异步生命周期 + 员工节点扩展 + Windows capture/restore；复用提交 CAS，不新建第二快照/任务权威 |

### 2.1 固定源码定位

- F01：[durability 模式与 current head](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/agent-file-durability.ts#L21-L84)、[GC 保留根与删除](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/agent-file-maintenance.ts#L61-L98)。skill-version-retention 清的是可重建物化缓存，不要混成删除 skill 版本。
- F02/F03：[普通 run 准备](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/heartbeat.ts#L2025-L2047)、[已准入输入](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/heartbeat/runtime-selection.ts#L533-L558)、[配置条件事务](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/modules/agent-lifecycle/adapters/configuration.ts#L15-L23)、[working-copy apply](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/agent-directory-working-copies.ts#L417-L494)、[last-sync-wins](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/agent-file-store.ts#L255-L315)。
- F04：[任务提及](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/heartbeat/run-preparation.ts#L673-L780)、[环境技能](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/environment-skills.ts#L30-L62)。
- F05：[catalog 默认值/preview/install](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/teams-catalog.ts#L684-L950)、[导入 partial failure](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/company-portability.ts#L5751-L5773)、[routine 生效](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/company-portability.ts#L6066-L6141)。
- F06/F08：[测试输出读取](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/company-skills.ts#L7035-L7167)、[历史访问](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/company-skills.ts#L3515-L3527)、[来源权限](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/skill-access.ts#L18-L95)。
- F07：[MCP 缓存回执](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/public-mcp/capabilities.ts#L163-L197)。
- F09：[资产过滤条件](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/company-artifacts.ts#L319-L325)、[搜索过滤条件](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/company-search.ts#L553-L562)。
- F10：[PCWS 入口约束](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspaces.ts#L62-L73)、[原生条件发布](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/services/remote-workspaces.ts#L553-L595)、[HTTP adapter](https://github.com/paperclipai/paperclip/blob/40ea7a9b8994e9bdb3d13794b5847388be0f7a92/server/src/adapters/http/execute.ts#L14-L50)。

## 3. 共享契约登记与冻结

### 3.1 两个冻结点，不把文字变成运行保证

- DRAFT：可评审设计；当前 C01–C08 全在此状态。
- TEST-FROZEN：提供方 owner、所有受影响消费方和安全责任人签认实验契约/样例/负例、候选 SHA 与参数；只授权据此编写获准的验证切片，不代表业务功能可全面并行建设。
- BUILD-FROZEN：对应 P0 证据通过，真实接口/schema、测试命令、兼容策略及责任人冻结，才可解锁依赖它的产品任务。
- REOPENED / RETIRED：发生语义变更或退出；受影响任务停在已知安全点，不能继续引用旧冻结状态。

冻结 manifest 最少记：baseline ID、文档/schema/fixture 的版本及内容 hash、上游 SHA/补丁集、协议和实验参数、提供方/消费方签认、测试报告与提交区间。**本轮不伪造 hash、签字、commit 或 PASS，也没有创建可执行 schema。**字段名尚可讨论；下列语义不可被各模块各自解释。局部冻结只解锁列明依赖，不要求先冻结所有远期功能。

| ID | 唯一契约主题与权威正文 | 提供方角色 / 主要消费方 | 冻结必须包含 |
|---|---|---|---|
| C01 | 身份/企业政策：[架构 §4](D:/dev/morchat.co/docs/ARCHITECTURE.md)、[资产 §3](D:/dev/morchat.co/docs/ASSETS-AND-LEARNING.md) | B01 / 全部 | company/user/Agent/actor/delegation/resource/policy revision；设备及管理人资料双授权、身份不继承；默认拒绝、源与受众交集、撤销生效点、离线和缓存限制 |
| C02 | 任务命令/事件：[Paperclip §2、§4](D:/dev/morchat.co/docs/PAPERCLIP-BASE.md)、[群协作](D:/dev/morchat.co/docs/DISTRIBUTED-COLLABORATION.md) | B02 的任务接入 owner + Paperclip owner / B03、B06、客户端 | 原生 ID、真人原子认领/转派、expected revision、防重 key、状态/错误、事件游标与超时待确认；单任务权威 |
| C03 | 组合/生效：[产品流程 §3.3–3.6](D:/dev/morchat.co/docs/PRODUCT-LIFECYCLE.md) | B03 / B01、B04、B05、B06 | 原始包与有效包 hash、配置 revision/指令 manifest/skill map、base release、批准范围、原子生效点、per-run 加载、回退/候选保留 |
| C04 | 资产/证据：[资产](D:/dev/morchat.co/docs/ASSETS-AND-LEARNING.md) | B04 / 全部 | 不可变内容引用、hash、来源 ACL、保留根、测试快照、删除/撤权、索引/下载；归档/可接手/验收分离 |
| C05 | 本地 runtime：[Windows 接入](D:/dev/morchat.co/docs/WINDOWS-DSH-INTEGRATION.md)、[客户端](D:/dev/morchat.co/docs/CLIENT-RUNTIME.md) | B05 / B06、B07、B08 | platform/capability/协议版本、profile/插件摘要、身份/文件/网络域、stdio；管理员员工账号下 Agent 受限运行、安装/运行分权、取消及可信终止证据；不以自报作防篡改证明 |
| C06 | 派发/续租：[群协作 §6](D:/dev/morchat.co/docs/DISTRIBUTED-COLLABORATION.md) | B06 / B01、B05、B07、B08 | logical dispatch、task/run/attempt、epoch、pool、设备管理责任人及授权 revision、claim、ack、cursor；资料进入/恢复时重验，允许并行、局部互斥、ACK 丢失/重复/旧代次状态 |
| C07 | 保存/接续：[工作空间](D:/dev/morchat.co/docs/WORKSPACE-CONTINUITY.md)、参数只在 [DV §3](D:/dev/morchat.co/docs/DUAL-DEVICE-VALIDATION.md) | B07 + Paperclip owner / B04、B05、B06 | parent snapshot、writer run/epoch、manifest、完整 durable ACK、operation sequence/effect receipts、R1/R2、冲突/恢复/GC |
| C08 | 模型/成本：[Paperclip §5](D:/dev/morchat.co/docs/PAPERCLIP-BASE.md)、[客户端 §7](D:/dev/morchat.co/docs/CLIENT-RUNTIME.md) | B08 / B01、B05、B06、面板 | company/run/model route、短期授权、调用/重试/receipt ID、真实 usage 与未知、预算准入、唯一记账入口、迟到撤销后对账 |

引用关系：C01 是安全底线；C02/C04 先供真实对象/内容依据；C03 消费其版本与政策；C05/C08 的受控本地执行先验证；C06 消费 C01/C02/C05/C08；C07 消费 C02/C04/C05/C06。可并行设计、只读研究和独立测试准备；循环依赖的最小接口由共同 owner 先定，不能互等“对方全做完”或两个 agent 各做一份。

## 4. P0 验证顺序与判失败

**顺序是基础接入预检 → 版本生效 → 权限撤销 → 完整节点/双设备接续 → 汇总放行。**所有测试先获实施/实验授权，使用合成材料；本轮没有运行。测试切片不要求先完成产品 UI，也不要求 NG-06 在其自身最小适配实现之前通过。

| 波次 | 必要前置与执行 | 覆盖既有门禁 / 退出 |
|---|---|---|
| G0 设计及开工准备 | 解决 §5 阻塞项的当期部分，绑定 owner/审核人、准备仓库基线与任务卡；C01–C08 按切片 TEST-FROZEN，测试版本/阈值事前签认 | 文档、样例、拒绝用例与授权齐全；不把冻结标 PASS |
| G1 安全最小执行 | 两台 Windows 以员工有管理员权限但 Agent 受限运行的真实前提做 build/DSH/MXC/ACP 预检；公司网关两个真实协议路由、密钥隔离、取消/进程树与本地工具；最小 Paperclip 身份/任务路径 | NG-01–04，WI-01–04/07/10，PC-01/12–15 的基础项；失败不进入真实资料运行 |
| G2 版本生效 | 下表 V1–V5，包含候选、包导入、不可变内容、最终技能集合、条件生效/回退和本地实际加载 | PC-06，LC-03–05/08/11 的契约子集；不要求完整组队 UI |
| G3 权限撤销 | 下表 R1–R5；直接 HTTP/原生内部调用、缓存、历史、测试快照和运行中撤权都要测 | PC-08/09/11/19，LC-02/09/10 的权限子集；无当前授权不得续用历史组合 |
| G4 接续最小闭环 | 建 B06/B07 最小真实 adapter + PCWS 节点入口，先 NG-05/06，再按 DV-01→08 双向测试；补完整 DC-01–08/WC-01–12 | WI-05/06/08/09，PC-02/15/17–20；两台做 NG/DV，完整 DC/WC 另需第三不合格设备负例，不能拿两机成绩冒充 |
| G5 P0 合流 | 对同一冻结组合收齐 PC-01–20、NG-01–06、WI-01–10、DV-01–08、DC-01–08、WC-01–12 及上述 LC 契约子集；检查原生补丁和回归 | 全部适用关键项 PASS；形成 BUILD-FROZEN。完整 US-01–21/LC-01–12 的产品体验验收仍在 P1–P3，不要求 P0 先造完整应用 |

G2/G3 是“判定版本方案成立”的先后依赖，不允许先通过保存演示再忽略权限漏洞。G1 的平台预检与中央静态分析可以并行；G4 的 mock 可用于开发但不能计作 PCWS/接续通过。

### 4.1 版本生效反例

V1–V5 只是既有 PC/LC 门禁的子样本标签，不新建测试框架。

| 子样本 | 操作 | 任一出现即 FAIL |
|---|---|---|
| V1 历史持久 | 连续发布 A/B/C，修改配置+指令+资源+skill；分别注入存储/关联失败，推进对象年龄并执行受控 GC，再取回获保留的 A | 已生效版本字节取不回；仅凭 hash/活动日志称可回退；归档失败仍生效；把 skill cache 清理当删除历史 |
| V2 精确运行 | 同一 Bot 两个隔离任务分别消费已批准 A/B；验证普通新 run、已准入恢复、工具/slash 实际正文及资源，禁个人 roots | 共享配置来回翻；悄用 current/latest；必须 skill 缺失后降普通文本仍运行；目录 digest 冒充正文；版本不符仍可调用模型 |
| V3 条件生效/回退 | 两发布者同基线竞争；旧 run 的自改/warm/stop 回写在新版本生效后迟到；测试回退 | 双方成功覆盖；迟到自改污染正式版本；只回配置却称整组回退；拒绝回写丢候选；回退复活旧权限 |
| V4 导入冻结 | preview 后替换源、注入不允许 skill/adapter/routine；安装中断后重试并绑定现有 Bot/真人 | 校验源 hash 却执行不同最终包；自动 claude_local/rename 克隆；partial warning 当完整成功；重复对象；未经准许启用 trigger |
| V5 最终集合 | 页面只批准 S1；任务评论提及可读但未发布 S2，环境注入同名技能，再发普通 run/授权测试 run | 普通运行绕批准集合或同名覆盖；仅验绑定不验最终物化；测试例外泄漏为生产授权 |

### 4.2 撤权及传播反例

这里 R1–R5 是本节撤权子样本，不是工作空间的“恢复模式 R1/R2”；报告必须使用 G3-R1 等完整标签避免混淆。

| 子样本 | 操作 | 任一出现即 FAIL |
|---|---|---|
| G3-R1 读写/缓存 | 用户保留公司成员但失去项目/skill/群权限；重放同 requestId，读历史、索引、预览、下载、测试输入/输出和快照 | 返回任一无权正文/摘要/元数据；缓存旧授权；以重做 mutation 来恢复回执；仅前端隐藏 |
| G3-R2 测试/来源 | 公司可用 skill 用私密案例测试；撤案例权限、删除/到期测试 issue，另一人读取测试模板和快照 | 只校验 skill 可读就暴露私密 case/output；issue 清理同时抹掉源 ACL；保留变成全员可见 |
| G3-R3 发布边界 | 私密源生成候选，尝试断开来源/放宽旧 skill ACL 后共享；再用独立脱敏 identity 做正例 | 断开来源就当脱敏；新公开版本连带泄露旧私密历史；未批准扩大受众 |
| G3-R4 运行中撤权 | 输入已选但未送模型/设备、提交已预检但被挂起、旧 session 恢复等切点撤权；服务端先提交新 policy revision 再放行旧请求 | 已撤权的新读取/模型准入/权威提交仍成功；预检代替提交时校验；旧授权随版本恢复 |
| G3-R5 离线/终止 | 断控制链但保留模型/工具通路；分别撤设备授权/管理人资料权后重连；测终止 ACK、实际动作和迟到成本，覆盖设备与管理人双授权负例 | 租约到期当进程必死；超既定离线期限仍产生新的有效模型/共享动作；旧执行权复活；真成本因撤权丢失 |

服务端撤权以权威政策提交为生效点，新准入/提交必须校验当前版本；不能等待客户端 UI 刷新。已发生、已送模型或已获准在途效果不能倒带，记录/核对而非伪造零泄露。设备物理停止与离线限制分开度量，使用 [DV §3](D:/dev/morchat.co/docs/DUAL-DEVICE-VALIDATION.md) 的租约/断联参数；在线停止目标、数据外发和已缓存内容处置需 §5 的公司政策签认。员工管理员权限下不承诺远程擦除所有本地副本。

### 4.3 接续失败与证据规则

双设备按 [DV §4](D:/dev/morchat.co/docs/DUAL-DEVICE-VALIDATION.md) 操作，不另复制一份参数：自动保存/同机并行基线→确认后断电/ACK 丢失→采集中断电→断网但旧进程存活→旧机重连→文件冲突→容量/重试→未知效果与撤权。

已确认损失必须 0；建议未确认窗口 60 秒/5 MiB、恢复 180 秒、周期/保存期限各 30 秒等完整限定只以 DV §3 为准，仍待实验前签认，不是实测 SLA。旧代次写入成功、混合文件截面、人工 commit/补传依赖、未知效果自动重放、冲突静默覆盖、确认前伪称已保存、超预签门槛均失败。模型思考/未落盘内存不假称已保存。

证据统一包含 baseline/契约 revision、原生 SHA+补丁、任务/run/attempt/epoch、政策版本、内容 manifest/hash、原生对象/回执、注入切点、单调时序、实际拒绝/停止/加载结果、测试命令与退出码、PASS/FAIL/NOT RUN/BLOCKED。不得以截图或模型自报代替权威记录。冻结组合变化须重跑受影响项；每方向每切点至少三次，不用平均掩盖失败。

FAIL 先定位配置/适配/核心扩展/架构问题，允许同一已批准边界内修正后复验；关键 FAIL、NOT RUN、BLOCKED 一律不解锁依赖。若只能靠扩大权限、全局单任务、下发 Key、中央代跑或第二权威才能通过，否决当前组合并提变更，不降低门槛。

## 5. 尚未确定的方案和决策顺序

已确认的平台定位、同一客户端、部门与跨部门可见性、Bot=AI 同事、DSH 优先、Windows 优先、公司 Key、自动保存与授权池并行不是待决项。员工保留本机管理员权限、平台只管 Agent、公用 Bot 的设备与管理人资料双授权也已确认，不再问是否接管员工电脑。以下才是未决；“建议”尚未被当成已批准选择。

| ID / 待决 | 当前建议与取舍 | 决策角色 / 最晚阻塞点 |
|---|---|---|
| D01 仓库与集成基线 | morchat 应用一个受控仓库；Paperclip 独立固定上游+最小补丁维护线，不复制源码混进自有目录。确认当前真实 Git 归属、remote、分支保护、CI 与 bot 身份；本目录及已查父目录未发现 .git，不初始化冒充已建 | Ethan 指定技术集成人 / 任何实现任务前 |
| D02 企业身份代理与原生强制点 | 保留真实 user/Agent，复用原生 auth，优先受支持 hook；人员认领 CAS、import/final-admission/writeback/evidence/cache 各明确 owner 和补丁。部署版本不是直接等于研究 SHA | B01 + Paperclip owner + 安全审核 / G0-G2 |
| D03 历史保留与发布事务 | 首选启用并验原生 durable，历史引用纳入保留根；已有公司保留存储合适则复用。确定保留期/删除例外、GC、条件激活/回退和 Beta pin 策略 | B03/B04 + 公司资产责任人 / G2 |
| D04 Windows 实际组合与出口粒度 | DSH+ACP+MXC 是候选；确认实际 build/tier、发行/更新来源、浏览器域。选择 run 级模型出口（同 run 代码也可达）还是独立工具域/broker；不能同时宣传工具完全无网 | B05 + 安全责任人 / G1 |
| D05 云模型与凭据部署 | 两个实际协议路由的供应商/型号、数据外发、秘密存储、额度/在途容差、usage 与价格证据；先一个固定故障实验模型组合 | B08 + Ethan 指定数据/费用责任人 / G1 |
| D06 设备池与停止承诺（部分确认） | 已确认：员工保留管理员权、平台不接管整机、Agent 不继承权限、设备及管理人均需对应资料授权；全部合格设备关机可停工，不需常在线/云端执行兜底。待定：实际节点/管理人登记与变更通知、具体资料承载范围、并行配额、在线停止目标及 R1/R2 证据；不承诺抹除已落地副本 | B01/B05/B06 + 设备管理人 / G1/G3/G4 |
| D07 保存与恢复阈值 | DV §3 建议值、工作包边界、源/正式 Git 与恢复包保留策略；双机实验资源及完整 DC/WC 第三不合格设备；RPO/RTO 不在测试后放宽 | B07 + 业务/资产责任人 / G4 |
| D08 客户端壳与模块目录 | 比较满足受控桌面/runtime/发布的最小载体；业务 DTO 不绑定 OpenMausBot 壳。具体源码目录、包管理器、迁移编号/CI 命令须获实现授权再确认基线；本轮不生成工程骨架 | 技术集成人 + B02/B05 / 相应实现卡启动前 |
| D09 业务与发布责任 | 两部门试点人员、两岗位包/一小队模板材料、维护/发布/验收人、私密与留存政策；工作资产与个人隐私的申诉/纠正入口 | Ethan 指定业务及数据责任人 / 真实资料进入前 |
| D10 开发执行授权与人员绑定 | 本轮只 docs；确定各 owner、控制 agent、独立审核人、模型成本边界和获准实验动作。安全/权限/生产范围变更不由 agent 的 ruling 擅自批准 | Ethan + 技术集成人 / 任何实施派发前 |

**当前判断：文档主题和工作规则可以统一，但 discovery 不能标为全部完成，接口也不能标已冻结，更不能说已有 PR/CI/工作树门禁在运行。**下一轮优先决策 D01/D02/D04/D05 与当期 C01–C08 测试契约；D08 壳选择不应拖延无 UI 的 P0 验证设计，未解的安全/版本/接续硬条件不放到上线后。

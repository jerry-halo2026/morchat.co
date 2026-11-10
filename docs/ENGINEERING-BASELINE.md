---
purpose: "工程与验证基线"
owner: docs-maintainers
status: current
updated: 2026-11-06
related:
  - docs/DISTRIBUTED-COLLABORATION.md
  - docs/NATIVE-RUNTIME-RESEARCH.md
  - docs/WINDOWS-DSH-INTEGRATION.md
---
# 工程与验证基线

> 2026-11-06，现行工程约束；底座已统一 Multica，B01–B08 / C01–C08 均 DRAFT。本文规定未来实施纪律，不表示脚手架、所有权工具、CI、企业能力或测试已完成。本轮只同步文档，未新跑应用测试；此前已运行的合成组队失败见 MULTICA-BASE-EVALUATION，不能把“本轮未跑”解释为所有相关样本未测。

**事实与门禁分开：**真实 Web @→Multica 原生 task/run→Windows DSH→文件/回复/token 已通过；自动归档失败，人工辅助上传通过；匿名 /uploads 返回 200 是未解除 P0。桌面交互、企业权限、双设备接续、版本实际消费与真实费用仍须实测。不得把 token 当金额、人工上传当自动闭环、编译启动当产品验收。

**底座不变量：**Multica 为唯一统一客户端/后台/task/run 调度；Paperclip 仅治理参考和依赖/许可审查后的独立源码候选，不常驻、不持有权威任务/版本/成本；OMB 仅协作参考与纯 helper 候选，不引入全量 chat/store/runtime。公司内部自托管，不按外售产品开工。

**本轮派卡约束：**继承 MC-S1-r7；D02 映射及项目继承已确认、实施契约未冻；MC-01/01G 按 MINIMUM-CHAIN §9 的 NM-ACL-r1 先无模型权限与受托身份矩阵，MC-05G 先文本再资产闭环。负责人、接口/fixture、写集和独立审核未齐仍 NEEDS_CONTEXT；新增文档不是开工授权。权限补丁、队列/回传补丁共享原生热点，由同一集成 owner 顺序接入，不让不同 agent 各造一种委托或结果事件。研究报告里的假设、源码推导与已有实测必须分列；未冻结等待时限不能事后改口算 PASS。原始证据不覆盖、不回写，修复结果另行留证。

**新fork工程边界：**D:/dev/multica@164290ee…的AGENTS规定views→core+ui；core/UI独立，Next/Electron留app层，移动端是独立Expo而非同一Next页面。参考组件逐项审依赖/API/权限/状态/路由后适配，不以语言相同认定可搬。Go1.26.9、pnpm10.28.2、.nvmrc22仅为该SHA仓库声明，不是环境已验收；工具链由MC-00核现有便携来源，不先重复安装或强制Docker。未来迁移号由目标迁移机制/唯一owner分配，不用up文件总数推编号；研究DDL不直接进入migration。

## 1. 结构与契约

**仓库决定已更新：**唯一产品仓是现有 morchat.co；GitHub origin 为 https://github.com/jerry-halo2026/morchat.co.git（公开空仓已创建，尚未推送）。D:/dev/multica 仅作固定上游样本，不另立产品仓。源码根级接入、Git/CI 和开发就绪规则见本文 §8–§11；当前未导入源码或建立 CI。

- Multica 统一客户端/中央后台/唯一调度 + 员工 Windows 完整本地 DSH/runtime；企业差异优先扩展原生路径，不部署 Paperclip 独立服务。模块通过显式接口交互，不跨域直写表。云端模型、本地完整 harness 与工具宿主分别建边界，不为每位员工另建公司后台；中央 worker 仅承担协作、连接器、资产/索引等核心服务，不恢复员工任务 harness 执行池。
- 客户端、设备协议、harness/工具事件和资产/用量回执记录兼容版本；不兼容或未知设备能力拒绝执行，不能静默降级到无授权 shell。
- 请求、事件、权限和错误使用可版本化契约；外部 DTO 在适配层转换，不泄露为核心业务模型。
- 任务状态只有一个权威来源；界面和面板只读投影。异步同步有版本、时间、幂等键、修复入口。
- 人类身份、Agent、服务身份分开；不能从用户可编辑的角色名、prompt 或工具参数自断言权限。

## 2. 数据、安全与隐私

公司范围贯穿数据库、文件、缓存、队列、日志、检索和导出。开发测试使用合成或脱敏数据；生产连接和模型调用权限明确隔离。凭据不进入 prompt、聊天、skill、模板或普通日志。

文件上传和外部内容是不可信输入；限制类型/大小、内容处理权限和执行环境。模型生成代码、skill 附带脚本或工具调用不因“AI 建议”获得执行权。

受限资料的派生摘要与索引继承权限。检索前、模型输入前、向群投递前分别核验。成员降权后的后台任务也要重新授权。

日志记录必要事件，不无差别保存所有隐私或原始 prompt。管理操作审计与业务内容访问分离，特权访问需显式授权与留痕。

### 2.1 设备、代码运行与公司 Key

- 原始 LLM Key 只存在于公司受控服务与秘密存储；公司模型使用权不等于密钥读取权。任务代码/子进程不继承密钥宿主环境；必要时仅使用限范围短期网关凭证，验证轮换、撤销、泄露处置和费用限制。
- 设备主动建立认证加密连接；公司/设备/run/能力/租约绑定，命令防重，浏览器调试端口不暴露公网。本地登录凭据与公司模型 Key 分开管理。
- 桌面页面、IPC 与执行器隔离；远程网页不能获得 Node/任意文件能力。浏览器工作会话与个人会话分开，上传、下载和网络目标受控。
- Python venv、工作目录和 Git worktree 不是安全沙箱。验证真实文件/网络/进程边界，含路径穿越、符号链接、Windows junction、子进程与全局环境泄露。受限能力不足则停止开放，不能靠 prompt 限制任意代码。
- 依赖来源与锁定、运行时版本、进程超时、CPU/内存/输出限额可追溯，不默认全局安装或授予管理员权限。
- 账号开通设置默认边界，设备/目录/会话另行授权；调岗/离职使服务端授权和设备凭证失效。断联停止新动作，中央撤销对离线设备的传播受租约约束，必须测量而非声称即时。
- 员工拥有本机管理员权限是已确认前提，不要求移交整机控制。Agent/harness/工具不继承其管理员执行权限，仍须通过真实隔离负例；安装授权不等于运行授权。防护不承诺抵御管理员主动篡改宿主或远程抹除已落地副本，不能以此免除正常 Agent 的权限约束。公用 Bot 仅派到设备和管理人均有对应资料授权的节点；中央资源授权、短期凭证、Key 保管与代次校验独立执行。设备证明/停止证据异常则限制相关动作并核对，不把自报当可信终止。细则见 [设备池 §3.1](DISTRIBUTED-COLLABORATION.md)。

### 2.2 完整本地 Runtime 的可管理性

优先 Multica 原生 daemon/DSH 适配和 profile，固定所验证的版本，首轮在两台 Windows 11 x64 设备分别验证原生发行物或受控安装路径；Mac 预留平台接口，后续单独验收；不以 VM/WSL/Docker 作为使用前提。先完成 [原生运行与 Harness 核查](NATIVE-RUNTIME-RESEARCH.md) 的 NG-01–06；不依赖员工个人 CLI、OAuth、Key/订阅。独立公司配置及最小环境不得覆盖个人配置；公司模型连接失效就停止，不回退个人计费。已有 CLI 只能作为受验证的可选来源。设备认证、模型网关令牌和中央服务权限分开，不把后台管理员凭据发到本机。

引擎、Python/Node、工具与技能分别记录版本、依赖、来源和许可。安装与升级校验完整性，支持兼容检测和回退，不自动追 latest；运行中不强换引擎。UI、管理器、工具子进程按风险隔离，网关短期凭证只暴露给确需调用者。

### 2.3 Windows DSH 的组件与判失败门禁

先复用 Multica 原生 DSH JSONL 适配器，不为沿用旧方案另造 ACP/remote adapter。Windows 原生隔离方案（包括 MXC 等候选）须核对固定组件、依赖、许可和真实能力后评审，当前不等于已选定或通过。隔离覆盖整 DSH 与子孙工具而非只有 shell，每 run 独立身份/工作区和资源边界；文件/网络策略、stdio、取消和真实停止逐机验证。不得手写驱动来绕过缺口，不把工作目录/venv 或无人审查的 ACL/VM 回退算通过，不用 danger-full-access 掩盖失败。

浏览器独立权限域；最小run级模型出口会被同run代码共享，不能宣称工具零网或凭据隔离；若需更细隔离改独立工具域/broker并重验。生命周期必须覆盖创建前后、所有子孙/外部broker、双向stdio、取消/close与真实停止。上下文/token usage 不能作真实费用，task-only 不能作工作空间保存证明；Multica 原生任务通过不代表已有 Paperclip PCWS 或通用跨机 session。详见 [Windows DSH接入与WI-01–10](WINDOWS-DSH-INTEGRATION.md)。

## 3. 失败、幂等和人机交接

后台工作持久化，进程内等待不是公司待办。重复事件、重复点击与断线重连可测试；超时不等于失败，结果未知时要先查询/对账。

跨系统使用 outbox/inbox 或等效可靠投递，不能承诺跨服务原子事务。外部副作用必须有业务级防重、结果依据及补救策略；回滚数据库状态不等于撤回外部操作。

AI 自报完成需要成果或可核验结果支持。人类验收/反馈与 AI 运行完成是不同事实；具体业务允许的完成规则后续确定。

### 3.1 设备派发与失联

Multica task/run 是唯一权威；设备 attempt/租约代次/事件游标是关联扩展。派发、领取确认、启动和等待区分，重复唤醒不重复开跑；离线不标活跃运行。设备出站连接，断联停止新动作，在途动作尽力停止；短租约期限与可停止时限实测。重连核验授权/代次并对账后续跑，旧代次不覆盖新结果，迟到真实成本仍记账。未知副作用未查清不自动重派，不能以租约过期推断旧操作没有发生。

本地只留加密、有容量上限的检查点/回传队列，按工作单元/等待边界自动上传并周期兜底，失败自动有界重试，不依赖人工提交；满额暂停并提示，中央确认前不删除唯一待上传副本。换设备默认以中央资产与检查点新建接续 run，不保证 CLI 原始会话通用迁移。设备损坏前未上传内容可能丢失，恢复演练必须展示该边界。无在线授权设备则等待，不启动中央 harness 兜底。

员工助手默认本人授权设备；公用 Agent 从预授权池筛选当前身份、数据可承载性、能力、本地资源绑定和容量，再原子预留/领取。入群不入池，设备宿主的数据处理权必须匹配；所有拟落地资料都必须满足设备及管理人的对应授权，不以空闲、同部门或管理员组身份代替检查。未启动工作可自动改选；已领取失联先核对，满足 R1（共享写入已隔离且可安全重算）或 R2（旧执行/资源可信终止）的接续条件，检查点及其后已提交效果已对账且无未知项才能自动接续，否则阻塞。

终止后证据入口与执行入口分权：仍有效账号/设备重新鉴权可获旧 run 的限范围上传权；已撤销身份/设备拒收旧凭证，改由具业务材料权限的接管人恢复导入。异常/未知结果由任务管理与证据访问权兼具的责任人核对/批准，不能依赖运维万能权限；安全条件已验证的池任务按预授权策略自动接续。费用证据由中央网关/供应商保留，设备丢失不能使唯一计量凭证消失。

首版全部模型调用绑定真实任务/run，任务外自动标题等模型功能关闭；不伪造 Agent/run，不留未定义的服务主体旁路。

派单防重范围是逻辑派单/独立子任务，不能通过不同 attempt/run、同机多个 runtime 或多调度器绕过。当前代次/任务版本/权限的判断须在权威提交处有效；优先条件写入，否则必须证明全入口受控的同资源提交顺序及超时待确认协议，未知旧提交未收敛不放行冲突新写。不能用进程锁/预检/outbox 代替 fencing，也不能将局部提交顺序化变成整个设备执行串行。

恢复清单覆盖检查点操作序号及其后已提交效果，区分已完成应跳过/未完成可续做/未知要核对。启动许可提交但 ACK 丢失不是未开始；旧终止需受信进程树/工具收敛与资源结果证据，不能只看租约过期。数据承载授权在新上下文/工具数据/下载/session 首次进入宿主或取得能力前检查；收紧后暂停，旧 session 无法证明当前授权则重建。

### 3.2 并发与背压

撤回每设备默认单任务：同机无冲突任务与跨设备任务允许并行，多个客户端实例/子 Agent 共用真实资源配额。按 task/run 隔离 session、工作区、临时文件及输出；同一公用 Agent 的不同任务可并行，不反复改全局执行配置。浏览器会话、GUI、同文件写入只锁冲突资源，不加设备/公司全局执行锁。等待人或子任务要持久化并释放槽位，防止父任务占满导致子任务死等。等待前持久化快照、在途操作到安全点后释放浏览器控制和共享文件写锁；子任务用独立工作区。无法安全释放则资源阻塞，不让父子互相持锁等待；续跑重新取锁、核对版本/会话。限制 CPU/内存/磁盘/进程/超时/输出，允许员工暂停。

多设备仍共享公司模型 RPM/TPM/并发与预算：网关做准入、有限排队、退避/取消、预留释放/结算；中央日志、上传、推送与索引有界排队并背压。只合并可丢的进度噪声，不能静默丢审计/用量/资产提交。控制链路的连接、处理与持久化等共享瓶颈保留容量/优先级，测模型阻塞和日志/上传饱和时的收件、状态、取消 ACK 及实际安全停止。短租约只约束可信端新动作，不保证在途下载/子进程终止或攻陷宿主可控；测半开连接、休眠/时钟异常及脱离子进程。按试点目标压测，不以“在本机运行”作为无并发或性能保证。

## 4. 测试矩阵

| 类型 | 首版覆盖 |
|---|---|
| 单元/领域测试 | 权限决策、认领规则、资产来源/发布规则、状态映射 |
| 适配契约 | Multica 原生身份/任务/run/Agent/小队/daemon/DSH 路径与企业扩展；版本实际加载、条件写和事件/API 映射须逐项核查 |
| 集成 | 消息→任务→运行→成果→资产，重复/乱序/超时/重启与补偿 |
| 权限正向 | 同部门非参与者默认可读普通任务明细和流转；跨部门项目/任务授权后可读相应明细及进度、交接、阻塞、交付，群卡与面板同源 |
| 安全负向 | 未授权跨公司/部门/群访问被拒，同部门敏感内容/私密群未单独授权时拒绝；跨部门单任务授权不得扩张为项目、全部门或越界依赖；面板计数/导出、文件直链、搜索、摘要、AI 上下文及降权后 worker 同样受控 |
| 端到端 | 员工与负责人分别建群，人→AI→人、AI→AI；员工部门普通任务明细、负责人部门管理、老板公司总览、获授权跨部门业务流转；验证授权撤销与读取/管理权限分离 |
| 学习评估 | 原案例+不同输入、事实准确性、适用条件、权限泄露和版本退役 |
| 运营演练 | 离职接管、个人连接失效、备份恢复、同步积压与失败修复 |

部署多公司功能前必须扩大租户隔离测试；首版带公司字段不等于已经达到多租户产品上线条件。

### 4.1 客户端与运行安全专项门禁

| 编号 | 必须验证的结果 |
|---|---|
| RT-01 | 同一客户端按账号展示角色面板；未经设备委托不能操作他人电脑，同部门任务可读不扩权 |
| RT-02 | 受控本地浏览器、Python、Node、文件上传均可完成；未获准目录/会话/网络/子进程访问被实际阻断，不以路径或 venv 代替隔离 |
| RT-03 | 云模型经过公司连接，原始 Key 不出现在客户端、任务代码环境、子进程、prompt 或日志；后台摘要等启用功能也不能绕过 |
| RT-04 | 断联、休眠、会话失效、撤销、重复指令和重连均有确定状态；不盲目重放有副作用动作，中央与本地状态对账 |
| RT-05 | 文件哈希/安全校验、上传防重、版本冲突、ACL、待归档状态与正式资产提交一致；换设备后仍访问公司版本 |
| RT-06 | 实际模型重试/取消/失败计量不漏，重复/迟到回执不双计；未知费用不记零，预算并发与在途超额边界明确 |
| RT-07 | 工具结果/页面文本/截图传云前检查外发政策，模型读取和群投递分别授权，浏览器凭据和个人隐私不进入沉淀 |
| RT-08 | 设备吊销、离职接管、客户端/执行器升级回退、版本不兼容与资产恢复均完成演练 |
| RT-09 | 真实第三方业务只开放验证过的读取/导航/下载；即使域名已授权，生产提交/发送/发布/付款/修改记录/第三方上传仍被拒；本地文件写、公司资产上传和隔离测试写入分别验证，不把 HTTP 方法或 prompt 当只读保证 |
| RT-10 | 干净试点设备由客户端准备完整本地 harness；无个人 CLI/Key/订阅依赖、不污染个人配置、不回退个人计费；版本失配/更新失败可诊断回退，中央不代跑 |
| RT-11 | 同机至少两项无冲突任务、跨设备独立任务有真实重叠运行区间；同一公用 Agent 多任务会话/目录隔离；冲突局部互斥、控制消息不堵、等待释放资源，不以固定单任务充数 |
| RT-12 | 多设备并发遇模型 429/预算不足、中央日志/上传/推送积压仍有限队列和背压；按 P0 目标验证响应/办公影响，关键回执不丢 |
| RT-13 | 断线续租、旧代次/重复回执、未知动作、磁盘/缓存满和设备丢失可控；旧结果不覆盖、真实费用由中央证据结算；有效设备的限旧 run 上传与撤销设备拒收分别验证，接管人核对不恢复旧执行权；已归档资产可交接、未上传缺口明确 |
| RT-14 | 员工助手本人设备路由、公用 Agent 池内自动选择；同群未授权/撤销/数据不匹配节点均拒绝，资源绑定任务不误迁移；无合格节点原因可见 |
| RT-15 | 群内明确承接、重复/循环抑制；上下文按历史/来源权限和版本裁剪，目标变更/撤权后不盲交付；消息/取消/状态通信不被长任务阻塞 |
| RT-16 | 多调度器/多 runtime/不同 attempt 不绕过同逻辑派单防重；提交前冻结/换代及 ACK 丢失/效果提交后未存检查点故障通过；旧写不生效、已完成效果不重放；满载/半开连接/休眠下控制 ACK 与安全停止分别验证 |

完整测试方案在实施阶段编写；当前只规定验收目标，未运行这些测试。运行定义见 [客户端与执行环境](CLIENT-RUNTIME.md)。

另验证任务核心字段共用的任务 ACL 与独立附件 ACL：仅关联敏感附件不解密；核心字段含敏感源则整单受限，未确认安全的派生内容不投递普通群。此为首版保守设计，不依赖任意字段自动脱敏。

### 4.2 架构可证伪的判定

[DC-01–08](DISTRIBUTED-COLLABORATION.md)在 P0 先跑实际 DSH/Multica/设备的正负向最小用例，P1–P3 回归扩大；完整企业专项未验收；已发生的单设备实测按本文开头单列，不把文档审阅算运行验收。测试证据包含版本、设备、task/run/attempt、授权版本、并行时间线、故障注入、源上下文/输出及成本/资产回执。

先确认单个配置/adapter 缺陷是否可在既定边界内修复；若仍无法满足群协作、授权池、真实并发或安全离线，则当前候选方案不成立，阻止后续依赖功能推进并重新评审。禁止把失败项转为全局/设备单任务、原始 Key 下发、任意借电脑或中央代跑。

### 4.3 任务文件一致性与跨机接手门禁

[任务与工作空间接续](WORKSPACE-CONTINUITY.md) 的 WC-01–12 与 DC-01–08 联合纳入 P0，不只验证聊天或上传。测试使用固定 Git 中间态/二进制哈希与真实空工作区；对象和关联分阶段故障注入、旧写提交竞态、第三设备越权、R1 未终止旧进程仍无共享效果与 R2 未知副作用必须有证据。R1/R2 定义以该稿 §6 为准；数值目标在 P0 明确，未测不写通过。优先核查 Multica 原生交付/上传/工作区能力；缺失一致保存和恢复是 B07 待补差异，不能假定其拥有 Paperclip 快照或把公共 Agent 文件策略外推为项目一致性。

自动保存专项先执行 [自动保存与最小双设备证伪方案](DUAL-DEVICE-VALIDATION.md) 的 DV-01–08：两台执行机和独立中央，无手动保存/提交；预登记阈值与故障切点，验证权威回执和实际字节。硬完整性/越权/重复效果出现一次即失败；R1 不能以长期安全阻塞冒充接续成功。此最小子集不替代完整门禁，该完整专项尚无通过证据；现有单设备手工上传实验不替代它。

### 4.4 六步产品闭环与版本消费门禁

Bot 是产品层 AI 同事，实例唯一映射原生 Agent；模板、实例、小队、task/run/attempt 分别验身份和关联。能力升级/换机不造新 Bot；同一 Bot 的并行运行隔离，临时子 Agent 不自动入名册。

按 [LC-01–12](PRODUCT-LIFECYCLE.md) 增补契约与端到端测试：员工/负责人同入口、组织助手停用人工可用；实际存在的创建/模板/导入入口政策一致；旧 hire/catalog 字段先重新映射，未确认的入口不虚造；真实员工原子认领与条件转派；部分组队失败幂等；模板剔除私人记忆/凭据/授权；岗位就绪、交接接收和验收不混同。

Bot 版本负测先核查原生对象并标出待补扩展，不将旧 Paperclip 字段机械改名；覆盖：连续两次指令保存不能仅凭旧 history/restore 或 hash 声称有历史；允许交付的字节与资源已自动归档；配置 revision 与内容快照/skill 组合一致；一次归档失败不生效；原生 UI/API、自改和自动回写不能绕过。模板升级不静默覆盖实例，恢复后新 run 验整组内容，而非只回配置；不复活权限或改变旧运行。核查 Multica 原生内容/交付存储的保留能力；不足时补不可变版本引用与保留机制，不假定存在 durable blob/manifest 等旧接口，也不另造第二正文库。验证 GC 后仍能取到应保留旧字节。对应 PC-06（Discovery §4.7）、LC-08/11。

技能负测覆盖：候选变化不影响已发布生产组合；普通新 run 不静默加载 latest；恢复按已保存组合并重验当前授权；不支持同步、同名个人覆盖、正文/资源 hash 不符必须失败；按真实 DSH/Multica 入口验证工具或命令实际加载，而非只查 UI。至少覆盖原案例/不同输入、失败不发布、过期候选冲突、源撤权、回滚不改历史。优先复用已核实的原生测试/运行路径，缺项由 B03/C03 明确扩展；不假定存在旧 Beta/admitted snapshot/test-inputs/templates/runs 接口。测试执行成功不等于业务质量通过，重要发布证据的替代/到期清理需保留审计与版本。

当前只是验证设计，没有执行上述测试；原有 Windows、自动保存、跨机、模型 Key 和用量门禁不得用模板演示替代。

## 5. 开发治理与合并门禁

### 5.1 文档权威按主题分工

“最后改的文件优先”或“任务卡写得更具体就覆盖设计”都不成立。用户最新明确确认先进入权威正文与决策登记；冲突未修复前阻塞受影响的实现，不让各 agent 自选解释。未批准的建议不因出现在表格里就变成已确认方案。

| 权威 | 文档 | 管辖与不管辖 |
|---|---|---|
| 索引/确认状态 | README | 指明入口与当前状态，不重复创造契约 |
| 需求/范围 | PRD | 产品不变量、用户故事、MVP 边界；不由千川资料定义全平台 |
| 职责/数据权威 | ARCHITECTURE | 模块关系、谁持有唯一事实、身份和权限边界 |
| 契约/决策登记 | DISCOVERY-BASELINE | B01–B08、C01–C08 状态、G0–G5 与 D01–D10（F01–F10 只属历史归档审计）；具体协议仍链接专项唯一正文 |
| 阶段/依赖 | PLAN | 建设顺序、入口/退出，不自行改安全与恢复阈值 |
| 产品专项 | PRODUCT-LIFECYCLE、PRODUCT-EXPERIENCE、ASSETS-AND-LEARNING | 对象/版本生效、角色体验、来源权限/保留分别归口，不新增任务或正文权威 |
| 运行/接续专项 | CLIENT-RUNTIME、DISTRIBUTED-COLLABORATION、WORKSPACE-CONTINUITY、DUAL-DEVICE-VALIDATION | runtime、消息触发/派发、保存协议、故障规程分别归口；保存/接续实验数值唯一来源 DV §3，消息防风暴参数按群协作 §4.5 冻结 |
| 上游/平台专项 | MULTICA-BASE-EVALUATION、WINDOWS-DSH-INTEGRATION | Multica 固定源码/实测和 Windows 候选/WI 门禁；平台无关 PC-01–20 正文归 DISCOVERY-BASELINE §4.7，PC 只保留历史编号 |
| 工程规范 | ENGINEERING-BASELINE | 任务卡、模型、协作、worktree、证据、评审和合并规则 |
| 研究与历史证据 | PAPERCLIP-BASE、REFERENCE-REUSE、CROSS-DEVICE-REFERENCE-RESEARCH、NATIVE-RUNTIME-RESEARCH、EDICT-FLOW、QIANCHUAN-DATA、QIANCHUAN-API-DEV、DOCS-REBASE、archive | 固定来源、原日期实测/历史变更；其中 NG 与既有专项门禁由当前基线引用才纳入验收。不得凭历史“已锁定/可开工”覆盖当前需求 |

权威顺序：当前用户确认的目标/边界 → PRD 的范围与不变量 → ARCHITECTURE 的唯一底座/数据权威 → DISCOVERY-BASELINE 的契约状态与专项归口 → 各专项唯一正文 → PLAN 的依赖/阶段 → 本文工程执行规则。实测事实可证伪设计，不能被任何“已定”措辞覆盖；发生冲突先停受影响任务并登记，不由 agent 自选旧文继续。README 只是导航，不另立规则。

archive、PAPERCLIP-BASE、D:/dev/refs 与 experiments 是只读历史/参考/证据，不是开发任务或第二规范。旧 Paperclip 接口、PCWS、费用库、完整前端映射不能作为当前开发指令；PC-01–20 历史测试编号的现行平台无关正文在 Discovery §4.7。C02 归群协作专项，C08 归 CLIENT-RUNTIME，不再引用 Paperclip 文档作权威。

当前 discovery 指本导航收录的现行 docs，不是另一个未查阅目录。新增文档必须登记职责，优先改现有权威章节，不为同一主题不断新增“最终版”。发现矛盾：记事实与反例→定位权威 owner→修改权威及所有受影响摘要/用例→检查链接和编号→独立评审；不只在末尾追加一句“以上作废”留下正文双解。

C01 身份、C02 任务命令事件、C03 组合生效、C04 资产证据、C05 runtime、C06 派发续租、C07 接续、C08 模型成本当前全部 DRAFT；文档映射完成不等于接口冻结。按依赖切片冻结当次生产者/消费者真正需要的 schema、语义和正反 fixture，契约测试先行，不一次锁定全部猜测。共享契约按 [Discovery §3](DISCOVERY-BASELINE.md) 冻结。变更申请必须写：原因/反例、旧新 revision、影响的提供方/消费方/数据迁移、权限与兼容风险、正反 fixture、回滚或前滚方案、重验门禁。提供方与所有受影响消费方签认；涉及产品范围或安全/费用/数据外发扩大由相应人类责任人批准。未知项先实验，不许实现者自创第二协议。

### 5.2 模块所有权与共享热点

owner 是持久责任角色，不是某一次临时 agent 的名字；实际人员/控制 agent 待 D10 绑定。每张实现卡只有一个主 owner 和一个当前写入者，审核人独立。B01–B08 与架构细分模块按下表归口。

| 责任角色 | 唯一负责范围 | 不能擅改 |
|---|---|---|
| B01 权限 owner | 企业身份/部门/群资源政策、授权与撤销、权限测试 | Multica 原生 auth/表、别人模块的身份字段 |
| B02 统一客户端协作 owner | 群/消息/线程/通知、明确唤醒意图与投影、任务命令适配；指定前端集成 owner 管统一壳/导航/设计变量/共享展示契约；连接器只作场景输入 | 任务/run/Agent/小队/消息的第二写库；未经验证的旧 interaction/审批字段 |
| B03 组合发布 owner | 一套组合元数据、岗位包/Bot/小队实例化、业务评判和发布状态 | harness/plugin 自升级、任意模板导入副作用 |
| B04 资产版本 owner | 内容引用/来源 ACL、历史保留/GC、查询条件和证据 | 另造可编辑 Bot/skill/任务内容库 |
| B05 runtime owner | Multica 原生 daemon/DSH、Windows 隔离/分发与本地工具生命周期 | 公司秘密、池授权、中央代跑 |
| B06 派发 owner | Multica 唯一调度内的授权设备选择、claim/租约/attempt、取消/回执 | 另造 task/run 权威或改共享 Bot config 选机 |
| B07 接续 owner | 自动一致采集/恢复、效果对账、Multica 工作区/交付路径适配；不存在的原生能力明确列扩展 | 覆盖项目冲突、以本机路径作公司权威 |
| B08 模型用量 owner | 公司网关、供应商协议/usage、防重计量 | 第二成本账、客户端原始 Key、个人计费回退 |
| Multica 原生集成 owner | 固定上游/补丁列表、原生接口与事务、schema/migration、升级契约回归 | 无需求/反例/测试的随手 fork 或跨域直写 DB |
| 技术集成人/独立审核人 | 依赖图、任务分配/冲突表、合流证据和门禁判定 | 以集成权替代业务发布/设备/数据授权；实现者自审不能替代独立审核 |

Multica原生工程现已导入，本地CODEOWNERS和bootstrap工作流已存在；实际角色绑定与完整门禁仍未完成。下表是已核路径的归口导航，**不是目录级无限写权限**；每张卡必须进一步列精确文件和唯一写者。当前只有MC-00工程写流获准，B01–B08产品卡未分配实际实现者。

| 归口 | 真实原生路径导航 | 共享边界 |
|---|---|---|
| 原生集成/工程控制者 | 根package.json/pnpm锁与workspace/turbo配置、`.github/`、`scripts/engineering/`、`server/cmd/server/router.go`、`server/migrations/`、`server/pkg/db/` | 根配置/路由/迁移/生成查询单写；业务owner不能分别改同一文件 |
| B01 权限 | `server/internal/auth/`、`middleware/`、handler的workspace/project/issue等资源入口 | 修改具体入口前与原生集成owner联合审查；禁止另起权限后台或只在UI隐藏 |
| B02 客户端协作 | `packages/core/`、`packages/views/`、`packages/ui/`、`apps/web/`与`apps/desktop/`接线 | core/ui/views依赖方向与平台边界见§9；Bot/权限/资产相关变化仍需对应owner确认 |
| B03 Bot/skill/小队组合 | `server/internal/handler/agent.go`、`skill.go`、`squad.go`、`server/internal/skill/`、`packages/core/agents/`、`packages/core/skills/`、`packages/core/squads/` | 不把原生可变配置当不可变发布；schema/版本字段仍由共享owner排序 |
| B04 资产 | `server/internal/handler/file.go`、`attachment_capability.go`、`server/internal/storage/` | 附件权限/公开URL/缓存清理由B01与客户端联合验收 |
| B05 本地runtime | `server/pkg/agent/`、`server/internal/daemon/`、`apps/desktop/`本地接线 | 这里只是已有驱动/运行入口，不能扩大为中央执行或公司Key下发 |
| B06 派发 | `server/internal/handler/daemon.go`、`server/internal/daemonws/`与原生task队列查询 | 与B05/B07共享文件必须拆到任务级单写；不按目录各开一套调度 |
| B07 接续 | `server/internal/daemon/`内原生工作区/会话/收尾路径 | 精确文件在接续卡核实，和B05/B06协同，不因同目录就独立并发改 |
| B08 模型用量 | `packages/core/client-usage/`、原生handler/service与daemon内用量路径 | 原生账本优先；网关差额未建，具体文件由卡核实，不虚构已有网关目录 |

共享 schema/API DTO、身份与错误枚举、migration 编号、锁文件/依赖版本、根配置、Multica patch 均为单写者热点。业务 owner 提需求，由对应唯一 owner 排序修改，消费者只据冻结 revision 实现；不能让各树分别改同一契约后期待 Git 自动解决语义冲突。新会话任务分配与接手入口见 [DEVELOPMENT-HANDOFF](DEVELOPMENT-HANDOFF.md)、[ACTIVE](tasks/ACTIVE.md)，实际任务包使用 [模板](tasks/TEMPLATE.md)。

### 5.2.1 前端不能各模块各做一套

前端是 B02 的统一 Multica 产品面，不按参考项目分包交付。优先沿原生任务、Agent、小队和 daemon 体验；不是搬 Paperclip 整体前端，也不引入 OMB chat/store/runtime。实施前冻结本切片的应用壳/路由、身份与范围上下文、共享组件、DTO/事件映射和共同状态词；不存在的原生能力明确写差异。设计变量、应用壳、任务卡、消息渲染、接口映射、依赖锁为单写热点，功能页才可按不相交写集并行，不能各装状态框架/路由器/组件库。

前端集成 owner 登记上游 SHA/文件、许可/NOTICE、传递依赖、目标路径、改动理由、回归样例与升级策略。参考片段仅在原生缺口明确、收益大于维护成本且依赖闭包可控时引入；Paperclip 为独立源码候选，OMB 为纯 helper 候选。先用真实任务、两 Bot 回复和明确 @ 入口跑构建、权限和防重样例；静态可拆、编译通过不等于安全上线。参考审查以 [REFERENCE-REUSE](REFERENCE-REUSE.md) 当前标题为准，不使用旧功能目录驱动移植。

追问、补充、批准、停止等操作先确认 Multica 固定版本原生命令/事件；不存在的对象需契约明确扩展，不把 Paperclip interaction/attention/queue 换名字当原生。相同动作保持单一 ID/revision，B02 管入口/投影、B01 管授权、B05/B06 管真实消费/停止、B03/B04 管内容和生效，原生集成 owner 单写共享改动。

各前端任务卡必须附体验章节/用户故事、入口与返回路径、目标角色/权限、数据权威、原生命令/回执/副作用与实际 runtime capability/fallback、已审交互/共享组件版本，以及空态、加载、失联、过期、无权、失败与重试样例；若修改共享字段/卡片，先交 owner 更新契约，再由消费者跟进。不得让页面 agent 以“视觉更顺”改任务状态、触发唤醒或放宽权限。

合并前除组件测试，还须检查同一任务从首页/对话/面板进入的跨视图一致性，消息重连去重与关键事件可发现性，正文安全渲染、键盘/可读标签和授权负例；端到端覆盖 US-16/22 与适用 MSG/OP 子集。不能用各页面截图好看或 mock 数据正常代替集成验收。参考片段须记录上游 SHA、许可及改造依赖，禁止引入完整参考 Store 或第二任务/运行状态。

前端页面卡引用当前 REFERENCE-REUSE 与 PRODUCT-EXPERIENCE，登记固定 SHA、实际 route/flag、可见条件、动作/资源权限、原生读写对象、复用/适配/新增/禁用处置与 B owner。源码有组件不代表生产路由存在；旧 Paperclip 功能清单不要求全量搬入。新开关与隐含模型调用先评审，不建立页面自有账号/任务/版本/连接/成本账。

### 5.3 任务卡是派发边界

下列是一张任务卡的最小模板，不是本轮已获准的实施任务：

| 字段 | 必填内容 |
|---|---|
| 身份与状态 | Task-ID、阶段/G 波次、父计划、主 owner、写入 agent ID/运行 ID、独立 reviewer；READY/IN_PROGRESS/NEEDS_CONTEXT/BLOCKED/REVIEW/VERIFIED/MERGED |
| 不变量与契约 | 对应 PRD/验收 ID、Cxx@revision、baseline manifest/hash、上游 SHA/patch set；只带本任务需要的上下文 |
| 范围 | 单一目标、允许路径/写集、禁止修改项、非目标；环境/端口/数据库/对象前缀、允许工具与外部副作用 |
| 输入与依赖 | base commit、已合入的生产者提交、契约/fixture、依赖任务与完成证据；不能只写“参考上一轮聊天” |
| 输出 | 文件/接口/事件/迁移/文档、消费者、状态/错误/幂等/授权语义，明确无需建设的部分 |
| 验证 | 正例、竞争/撤权/失败/断联负例，适用 PC/LC/NG/WI/DV/DC/WC/MSG/OP/RT 与 US；具体命令/版本/预期退出条件，禁止无限占位 |
| 执行方式 | 模型档位/实际 model/reasoning、理由与升级条件；branch/worktree、资源隔离、预算/范围限制 |
| 交接 | 变更差异、BASE..HEAD 提交、测试证据路径/退出码、已知问题、消费者 ACK；是否改变契约、回滚/前滚说明 |
| 放行 | 规格合规与质量分别判定、模块/安全审核、集成基线 CI 证据、真实 merge/squash 映射；未合并不标 MERGED |

缺 owner、契约基线、写集、依赖或可执行验收命令的卡不能 READY。实现前计划需达到可执行粒度；不能把当前 prose 直接扔给多 agent 让它们各自设计。测试命令随真实工程基线确定，本轮不伪写 npm test 已可用。

### 5.4 Subagent 如何协作而不漂移

1. **一个控制者维护依赖图和台账。**按卡派发，记录宿主返回的 agent ID、实际模型、基线、worktree、开始/状态/提交与证据。恢复上下文先读台账并核对 Git，不凭聊天记忆重派已完成工作。
2. **干净上下文，一卡一任务。**按 §5.5 选择并如实记录模型/推理档位，给任务 brief、契约/fixture、相关源文件和禁区；不传整个历史。实现者不再自行派 reviewer/嵌套实现者，审核由控制者安排。
3. **同一 SDD 计划一次一个实现者。**实施→测试/自审/提交→独立规格+质量评审→修复→下一项。Superpowers 7.0.1 明确禁止同一计划同时派多个 implementation subagent，不能宣传它默认任意并行写代码。
4. **项目级并行限真正独立工作包。**先按冻结契约拆成各自计划、控制者、台账、分支/worktree及不相交写集，才允许独立工作流并行；每条流内部仍遵守上一条。不能为了绕单计划限制，把共同接口强依赖工作改名成多个计划。无法证明独立就串行；只读研究/评审可以并行。
5. **跨模块请求走变更/交接记录。**消费者发送 Task-ID、Cxx@rev、最小反例、期望与影响；提供方 owner 回复接受/拒绝/待证据并留记录。运行中的 agent 可直接通信，但不能靠私聊更改契约；控制者同步登记、冻结受影响任务并通知所有消费者 ACK。
6. **生产者先契约后实现。**消费者可对同版 fixture 做独立模块，但 mock 通过不算集成；真实生产者提交合入并通过契约测试才解锁端到端链。接口变更重开基线，不能在旧卡下顺便改实现。
7. **冲突单写者。**共享文件/语义交集由 owner 串行处理；每树独立 ports/数据库 schema/缓存/对象前缀/测试身份。Git worktree 只隔离文件，不隔离共享数据库、网络副作用或接口语义，也不是运行安全沙箱。
8. **审核与合流集中。**控制者独立派审核人，先检查规格和任务质量；技术集成人单通道合入，后合分支基于新基线重验。最终整分支跨模块评审不得省略。实现者自报 DONE 不等于 VERIFIED/MERGED。

Superpowers 的每计划 ledger/brief/review package 是执行恢复材料；其 git-ignored scratch 不能成为公司唯一审计。长期任务卡、契约变更、评审结论、源提交到最终提交映射与证据索引保存在受控仓库/PR 或公司记录系统，敏感日志独立按权保存，不提交 Key/业务原文。Windows 无 bash 时用等价受控流程生成材料，不能为跑技能脚本把 WSL 变成产品前提。

### 5.5 模型分级、升级与停止

使用适用技能的模型选择规则：**用能胜任的最低档，按判断难度和风险，不按文件数或最低单价机械降档。**派发前查当次工具允许的模型/推理档位；工具允许且适用时显式指定并记录实际值。若宿主要求继承或不支持覆盖，记录继承/unknown，不伪造成功覆盖；不得编造或固定不可用型号。

| 任务 | 能力档位（从当次可用模型中选择） | 约束 |
|---|---|---|
| 完整规格/代码已给出的机械改动、单文件低风险修补 | 快档 | 不能负责权限/并发设计或用最低 token 单价判断总成本 |
| prose 实现、多文件集成/调试、常规 task review | 标准/编码档 | prose 实现和常规 reviewer 中档起；小范围定向复审按风险选 |
| 架构、权限/并发/恢复语义、跨模块终审 | 最强可用能力档 | 终审不因控制者默认模型而降档；仍需证据，不以模型强替代测试 |

修复第 1–3 轮续原实现 agent，第 4–5 轮换新 agent 且至少升一档；已顶档则换独立上下文/拆题并记录无法升档。达到技能修复上限停止无效循环、记录 ruling/遗留并重新规划。**本项目附加规则：安全、数据完整性、错误版本、未知副作用或 P0 硬门禁失败不得以“parked”视为可合并/可发布。**可在技能台账结束该轮，但相关任务保持 BLOCKED。可逆实现细节由控制者裁决留痕；用户范围、授权、安全敏感操作、共享分支 merge/push/publish 仍依审批边界，不以 continuous execution 越权。

### 5.6 Worktree 与提交可追溯性

- 只读审计可以共享 checkout；并发写入流必须各有独立分支和 worktree，先检测/复用合适隔离树，获授权后优先宿主原生工具创建。不是每个串行 agent 必须新建一棵树。
- 有重叠需求先拆依赖/指定唯一写者；分树不能使两个互斥设计合法。创建隔离失败则停止该并发写流或改经确认的串行模式，不能让多实现者悄悄回到同目录。
- 开始记录干净基线及已知失败，结束保留提交/证据；没有授权不 merge/push/删除树。用宿主原生归档/清理工具管理其创建的树。当前工作区是既有 checkout；归属、remote、保护和 CI 须在工程准备任务核验，本文不声称已初始化/配置/建立 CI。没有授权不改 Git 身份或共享分支。
- **Author 与 Committer 不等于 agent 运行身份。**可按公司批准用受控 bot 身份作为机器实现署名；Committer 记录实际执行提交的认可身份。不要冒用 Ethan、不伪造真人 Co-authored-by，也不全局修改身份来假造来源。
- 每个实现/修复提交建议附 Task-ID、Agent-Run、Agent-Model、Contract-Baseline 等 trailers；若托管工具不能逐 commit 设置，PR 必须逐源提交建立同等映射。Agent-Run 用真实宿主 ID，不只写“Agent A”；无法核实的 model 标 unknown，不猜。多人/多 agent 贡献分别记录。
- 台账/PR 留 BASE..HEAD、真实运行 ID、测试/评审与 merge/squash 前后映射；squash 不能抹掉来源。审核者独立记录。trailers 是可编辑元数据，签名证明密钥签过提交，**都不单独证明某模型完成了工作**；更强身份可信性依公司 bot 账号、受控执行日志与受保护分支共同建立。

### 5.7 合并与发布门禁

按顺序放行，不以“无文本冲突”当作集成通过：

1. **Ready gate：**产品/验证实施卡须获授权，具真实仓库/基线/owner、TEST-FROZEN 或 BUILD-FROZEN 的适用契约、任务卡与写集。MC-00 工程 bootstrap 单独按 §11 PREP-ELIGIBLE：登记工程基线与批准动作，产品 C 可仍 DRAFT，先建立文档/所有权/任务契约校验与 CI；不以前置这些工具已存在形成循环。在门禁未生效前不启动多写流生产开发。
2. **Scope/contract gate：**实际 diff 在写集内；无第二任务/版本/成本权威；共享契约变更有 CR 与所有消费者签认。根 AGENTS.md 已提供现行文档与禁用旧方案的薄入口；准备任务仍须补路径所有权、PR 模板和实际校验，只引用权威文档，不复制另一套规范。
3. **Task gate：**实现报告提供实际测试输出/退出码；类型/静态检查、单测、受影响原生契约和安全负例通过。审核规格与质量两项均有独立结论；修复后定向复核。审核不必无意义重复同一提交测试，但变更后证据失效必须重验。
4. **Integration gate：**单一集成人将分支合入临时集成基线，对候选 merge commit 跑完整适用回归、迁移兼容、跨模块/权限/版本/接续测试；所有权/锁文件/原生 patch 独立审核。目标基线变化重跑，不拿旧分支绿色结果顶替。
5. **Evidence gate：**PRD/契约/任务/提交/测试/评审可追溯；docs 与 schema/fixture 同版本，未决项明确。baseline hash/schema diff、未登记文件、依赖变化检查在 CI 实现后成为必选检查；现在只是待实施门禁，未声称已阻断。
6. **Release gate：**P0 硬门禁不豁免；完整首版达到 PLAN/PRD 产品验收。签名与供应链、秘密扫描、许可、更新回退、备份恢复、运行手册齐全，经明确发布授权。没有证据或 NOT RUN 不当 PASS。

上游升级与业务功能分开；固定版本+patch 清单，各补丁记录原因、原生位置、替代方案、契约测试、上游化/移除条件。禁止跨域直接修改 Multica DB 表绕过事务和授权；自有扩展迁移也由对应 owner 审查。迁移走兼容/前滚或安全回退，不在生产自动破坏性迁移。

客户端、harness 与工具发行分别记录来源/许可/版本，签名材料和发布凭据公司管理；Mac 后续独立验收。首期不强制多级微服务/服务网格或额外不可篡改基础设施，普通追加日志不得称为绝对不可篡改。

### 5.8 Superpowers 核实来源

以下是本次本机 7.0.1 规则，不是承诺未来版本不变：

- [SDD 任务循环、模型分级与单计划串行](C:/Users/Administrator/.codex/plugins/cache/openai-curated-remote/superpowers/7.0.1/skills/subagent-driven-development/SKILL.md)：Model Selection、Setup、The Task Loop。
- [派发独立任务](C:/Users/Administrator/.codex/plugins/cache/openai-curated-remote/superpowers/7.0.1/skills/dispatching-parallel-agents/SKILL.md)：无共享写状态才并行。
- [工作树规则](C:/Users/Administrator/.codex/plugins/cache/openai-curated-remote/superpowers/7.0.1/skills/using-git-worktrees/SKILL.md)：先检测/复用，原生工具优先。
- [Codex 工具映射](C:/Users/Administrator/.codex/plugins/cache/openai-curated-remote/superpowers/7.0.1/skills/using-superpowers/references/codex-tools.md)、[预检](C:/Users/Administrator/.codex/plugins/cache/openai-curated-remote/superpowers/7.0.1/skills/subagent-driven-development/references/preflight.md)、[修复循环](C:/Users/Administrator/.codex/plugins/cache/openai-curated-remote/superpowers/7.0.1/skills/subagent-driven-development/references/fix-loop.md)。

## 6. 观测与恢复

请求/任务/运行/工具操作/设备/交付/模型回执贯穿关联 ID。公司资产与费用归属保存运行时快照，不因人员调岗重写历史。面板显示业务状态和数据更新时间；运行健康显示失败原因、同步积压、模型成本和连接状态。另观察设备容量/排队时长、内存/进程压力、租约代次、网关排队/429/取消、上传积压、未归档大小、回执缺失和补偿状态；隐私/凭据不随诊断采集。任务吞吐或 token 消耗不等于员工绩效。

备份覆盖 Multica 及企业扩展数据、对象文件、版本元数据和密钥恢复所需材料；索引可重建但原始资产不可依赖索引保存。用实际恢复演练证明一致性。RPO/RTO、性能目标和预算数值由 P0 确认，不能将旧稿数字冒充现有保证。

中央旧快照恢复必须先隔离派发/模型准入/权威提交与旧中央写入端，使用不复用的恢复世代；不能因快照回拨让旧租约、已撤销凭证和已执行派单再生效。员工访问暂不直接恢复旧 ACL，先重建/确认当前授权并重新鉴权，对账任务、资产、费用和已提交效果后再开放，未知阻塞。P3 演练旧快照＋仍在线设备＋迟到旧写/撤销凭证，不能只测数据库可启动。

## 7. 范围控制

每个业务连接器必须通过“禁用后通用协作仍可工作”的测试。千川字段留在业务域；平台需求不得以新增千川指标代替多人协作、资产继承或权限缺口。

工作流引擎、生产资金写入、对外销售/计费和自动平台代码升级都不属于本轮 MVP。外部知识/表格 CLI/MCP 为后期接入，不据历史建议抢跑。撤权/离职要阻断访问、撤销凭据与受控缓存清理，任务/成果归公司并保留应留源本体、版本证据与审计；失联设备或已导出副本不能保证远程抹除。详见 [MVP 范围](PRD.md)。

## 8. 唯一仓库、目录与 Git 方式

### 8.1 当前事实与接入选择

**历史 MC-00 执行更新：**当时已转为 `codex/mc-00-engineering`，固定源码根级导入；本地 Node 22.23.4 / pnpm 10.28.2 / Go 1.27.3 工具链与 bootstrap 检查已建立，具体 PASS/FAIL/NOT RUN 见 [MC-00 记录](tasks/MC-00-results.md)。下段 detached 是接入前快照；现行目录和分支见 [ACTIVE](tasks/ACTIVE.md)。无 commit/push/main 合并，未提交文档仍须以内容摘要绑定。

2026-11-06 核实：现有仓 Git common dir 为 D:/dev/morchat.co/.git；本会话 worktree 在 C:/Users/Administrator/.codex/worktrees/integration-spike/morchat.co，HEAD 为62aa38076080cbb4c1088aa14f673c58c52928d8、detached；主工作树 main 当时为a9e9e49e438fc0c16a99a50d75d9da179d00801c，另有未提交工作。本树大量当前 docs 未提交，因此 HEAD 不能单独代表文档基线。工程准备必须重新检查，不锁死旧 main 或覆盖他人修改。

Ethan 已指定 **现有 morchat.co 为唯一产品仓**，并批准 GitHub 公开远程仓。远程 https://github.com/jerry-halo2026/morchat.co 已创建为空仓，origin 已关联；没有上传源码、文档或历史，没有配置保护/CI/CD。本地实际目录名是 morchat.co，不因聊天中的 morechat 拼写另建或重命名仓库。CLI 已在 C:/Program Files/GitHub CLI/gh.exe 找到，版本2.103.3；检查时未登录，不读取/打印其 Token。

**技术接入建议：原生目录根级吸收，而非 product/multica 嵌套、Git submodule 或第二仓同步。**只读清单表明当时两个已跟踪树精确路径碰撞仅 .gitignore，本树额外 AGENTS.md 必须合并；docs 无精确同名碰撞。嵌套会改变上游 .github 本地 action/路径过滤、Turbo 依赖，以及 dev-env.sh/remove-worktree.sh 对 Git 根和 .env.worktree 的假设，额外适配没有当前收益。正式导入前重算 tracked、untracked、大小写不敏感路径碰撞，不能把这次抽查当永久安全许可。

MC-00 已按下列布局导入原生工程；历史检查结果见 [执行记录](tasks/MC-00-results.md)：

```text
morchat.co/                    # 同一个 Git 根与产品根
  AGENTS.md                    # 企业工作入口＋原生编码规范引用
  README.md                    # 项目状态/文档入口，不声称已可运行
  docs/                        # 企业权威正文；上游说明标来源，不争夺权威
    tasks/                     # 获授权后按卡保存 brief/状态/评审/交接
    contract-baselines/        # 获签认的切片 manifest/fixture 索引，不复制正文规范
    archive/                   # 历史快照，只追溯，不施工
  apps/web/ apps/desktop/ apps/mobile/ apps/docs/
  packages/core/ packages/ui/ packages/views/ ...
  server/internal/ server/pkg/ server/migrations/
  e2e/ scripts/ .github/       # 审过后接入，发布/真实 Agent 工作流默认不启用
  packages/qianchuan-sync/     # 既有业务代码，不被导入覆盖或变成中央任务引擎
  experiments/                # 历史研究，不打入产品/默认 CI/公开上传集合
```

主目录另有 qianchian-sync 拼写目录；是否重复由其 owner 另审，不在此次工程整理删除/搬迁。迁入保留上游包名、Go module、LICENSE/NOTICE，不做全局品牌替换；企业改动留在原生扩展接缝，不开第二 TS 后台。

### 8.2 根级源码接入与上游跟踪

1. MC-00 单一集成人在获授权的同仓分支/worktree操作；先保护本树未提交文档并人工对照 main 新改动，不 checkout/reset/clean 覆盖，不直接在用户主工作树导入。
2. 上游基线164290ee14f63fe009ca304db21de9879db104c8来自 D:/dev/multica；来源 URL 为 https://github.com/multica-ai/multica。建议以固定提交的**已跟踪源码树**受控导入根级，保留来源提交/许可证/文件 hash/排除清单及本仓导入提交映射。不是复制整个磁盘目录，不带 .git、真实 env、日志、数据库、缓存、依赖或构建产物。
3. 不直接合并无关 Git 历史或自动推全部 refs。上游源码版本以 manifest 固定，后续按旧上游→新上游差异与本仓补丁做三方审查；升级单独 PR，不在功能卡顺便更新依赖/上游。不预定未来 migration 编号617，由唯一迁移 owner 对当前树分配。
4. .gitignore、AGENTS.md、工作流/权限、CI 路径与既有业务目录逐项审核；上游 release/OpenClaw 定时 smoke 不能原样激活。上游 AGENTS/CONTRIBUTING 是编码约束来源，不覆盖企业产品范围/授权规则。
5. 来源 manifest 最少包含上游 URL/full SHA、导入时间/本仓提交、原始与修改文件列表、排除理由、许可证、补丁目的/测试/退出条件。未获提交授权时以文件清单/hash暂存，明确“未提交”，不虚构 commit。

### 8.3 分支、工作树与提交

- `main` 是审核后集成基线；短分支用 `codex/<task-id>-<topic>`。上游接入、工程 CI、权限功能分卡分提交；不先引入长期 develop 分支与第二套发布流。多个 worktree 仍属于这个仓，不是新增产品仓。
- 本轮在 [ACTIVE](tasks/ACTIVE.md) 指定的命名分支继续，先核对 base、交接哈希和未提交改动；只登记 main 差异，不以合并 main 为前置。并发写者各用独立 worktree/branch/端口/测试数据库与对象前缀；相同热点不因分树获得并写许可。
- Git 提交格式 `type(scope): summary`，类型 feat/fix/test/docs/refactor/build/ci/chore；一提交一个可解释变更，生成物与源 SQL 同提交，禁止 `git add .` 无审查收集实验/业务数据。
- Author 使用获批准的实际开发者或受控机器账号；不为每个 agent 伪造真人邮箱，不全局改 Git identity。每次提交或 PR 保留 Task-ID、Agent-Run、Agent-Model、Contract-Baseline、测试证据；unknown 如实写，独立审核记录不可由实现者代签。
- 一般任务推荐 squash merge，PR 保留全部源提交和 agent 归因映射；来源导入记录不得丢。禁止强推共享分支；个人分支需要重排时先确认无消费者，任何 rewrite 都不能覆盖他人工作。提交、merge、push、部署授权分别记录，建远程仓不等于授权把当前全量内容公开。
- 单一集成人排队合流，每次针对候选合入提交重跑相关检查；旧分支绿色不替代集成绿色。冲突涉及契约含义时回 owner，不让模型按文本“任选一边”。

### 8.4 公开仓与首次推送门禁

公开的是远程空仓，当前本地代码/文档没有公开。现有 Git 跟踪列表含业务数据、token-refresh 命名日志、会话记录和实验材料，**仅凭文件名不能断言泄密，但足以阻止未经审查的整仓推送**。

首次 push 前审工作树、待推提交的全部可达历史、附件/大文件及日志；输出命中路径和类型，不在报告打印凭据。秘密扫描加业务保密人工审核，不能只扫当前 diff。含实际 Key 须先撤销/轮换；删除当前文件或补 .gitignore 不会清理历史。若需清洗历史/建同仓无旧历史的发布分支，先保存私有备份并单独批准，不擅自重写 main。

只上传经批准的内容白名单；公司内部方案和审计证据若不宜公开，先留本地并要求改私有后再同步，不能偷偷删掉唯一上下文来换取公开。私有后也继续扫描秘密；已公开内容无法靠改私有追回。

Multica 固定 LICENSE Part I 明确区分公开源码 fork 与对外托管服务；源码公开仍须保留完整许可/NOTICE/归属，UI 标识限制另存。不得将全仓标成纯 Apache/MIT 或自动替换其 UI 品牌。本条是源码许可核查与发布门禁，不替代正式法律评审；组织外服务仍走既有 GATE-L。

## 9. 代码风格、测试与命令基线

### 9.1 复用原生规范，不新加一套风格

| 域 | 规则 |
|---|---|
| Go | 沿原生 Go module、context/error/handler-service-query 分层；改动文件用 gofmt。公共鉴权在服务端，事务与条件写不移到 UI；不吞错误或用全局锁掩盖并发 |
| TS/React | 保留原生 strict/noUnused/noImplicitReturns/noUncheckedIndexedAccess 与 ESLint；服务端事实归 TanStack Query，Zustand 只管客户端状态；响应经既有 zod/parseWithFallback，不用类型断言掩盖外部数据问题 |
| 包依赖 | views→core+ui，core/ui 独立；core 不引 UI、localStorage/process.env，views 不新建 store/依赖 Next router；框架、IPC、设备能力留 apps。共享行为同时检查 Web/Desktop |
| UI | 复用原生组件、semantic tokens、@multica/ui/icons 与翻译机制；不导入第二组件库/Store。沿原有命名/缩进，无关文件不格式化 |
| SQL/迁移 | SQL 源和 sqlc 生成物配套，禁止手改 generated；保持原生迁移惯例。原生不新增 FK/cascade、并发索引独立迁移；若企业完整性要求不同先评审，不暗自覆盖。唯一迁移 owner 分号并验升级/回退或前滚 |
| 注释与配置 | 注释解释非显然的理由/约束，不抄任务流水；跟随上游语言风格。保留 .gitattributes 脚本 LF。当前未发现统一 Prettier gate，不新增格式器制造全仓 diff；原生允许 explicit any，禁止的是未经校验的权限/协议绕过，不另声称全仓禁 any |

版本核对发现上游声明与 CI 不完全一致：server/go.mod/CONTRIBUTING 为 Go1.26.9，ci.yml setup-go 为~1.27.3；Node 文档22、engines>=22、pnpm10.28.2。ci.yml 明确将~1.27.3 标为 security floor，MC-00 应优先核该安全下限对应 Go 工具链的可获取性和兼容，不默认降到 go.mod 声明版本；与 Node22/pnpm10.28.2 一起实测并固定精确版本。若工具链不可用则登记阻塞/评审，不默选 latest 或宣称上游版本完全统一。企业首轮不新增移动端功能，原生 Expo 路径保留且按独立 scope 验证。

### 9.2 真实存在的检查入口（本轮运行范围见 MC-00 记录）

以下来自固定上游，当前根 package.json/server 已导入；本轮实际运行范围见 MC-00 记录，不把未执行的命令写成通过。安装/生成/数据库动作须有相应授权。

| 位置/命令 | 能证明什么 | 限制/副作用 |
|---|---|---|
| 根：`pnpm install --frozen-lockfile` | 锁文件可安装 | 本轮加 `--ignore-scripts` 已实装；未运行 Electron 安装脚本，不等于桌面打包就绪 |
| 根：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` | 对应原生 TS 检查/构建 | scripts 经 Turbo，mobile 不在通用覆盖；逐命令留退出码，不笼统记“一键全通过” |
| server：`go vet ./...`；按变更包 `go test <package> -count=1` | Go 静态与包行为 | `<package>` 必须在任务卡换成真实包；先审数据库/CLI依赖，不能随意全跑 |
| 根：`make test` | 原生 Go 测试含 race 路径 | 会准备数据库并迁移，调用 Bash；无 Docker 开发要用受控测试 PostgreSQL/Redis，不因本机缺环境自动连公司库 |
| 根：`make sqlc`，再 `git diff --exit-code -- server/pkg/db/generated` | 固定 sqlc1.31.1 生成物一致 | 可能下载工具并写文件；同时检查新增未跟踪 generated，diff 单独不足 |
| 根：`pnpm exec playwright test` | 原生 Chromium E2E | 前后端需先启动；主配置一 worker/零 retry，非所有 perf/桌面用例；创建合成数据 |
| 根：`make check` | 原生组合检查 | 不含 lint/build，Go 不自动含 race；已有端口健康不证明服务来自本 checkout，须记录进程、工作根和构建 SHA |
| 根：`git diff --check`＋当前链接检查 | 文档/差异结构 | 不代表产品安全、权限或 CI 已通过 |

普通测试不得启动真实 Agent CLI。复用 scripts/test-go.sh 的 CLI sentinel 与分组测试；真实 Agent smoke 必须单独授权/环境开关，不随默认 CI 或 agent 自测运行。测试数据库、用户、对象前缀、模型出口全部隔离；Windows shell 命令在卡中明确 PowerShell/Git Bash，不把 WSL/Docker 变成员工安装前提。

### 9.3 用例归属与测试纪律

- 单个行为只有一个主要测试层：core helper 做纯逻辑矩阵、views 做交互/可访问性/回归、apps 做平台接线、Go 就近 *_test.go 做 handler/service/query、e2e 做关键跨层用户路径。不把共享行为重复放 web/desktop 各自维护。
- 行为变更先回归失败→确认失败原因→最小实现→正负例/原生回归→独立审核。mock 可替模型/OS副作用，不替被测权限、事务或状态机。
- 首个企业切片唯一用例表是 MINIMUM-CHAIN §9 的 NM-01–12；测试名/报告必须带 NM-ID，覆盖允许、拒绝、重放、撤销竞态、缓存与全部出口。其他切片继续用 PC/MSG/OP/WI/DC/WC/DV/LC 原编号，不再复制一套同义测试标准。
- 无测试、跳过、flaky 或仅编译均不算通过；重跑不能抹第一次失败。记录随机种子、服务 SHA、fixture revision、OS/存储实现与真实退出码。已知上游失败单列，影响本切片安全项不得豁免。
- CI 只跑受控合成测试；公开 artifacts 不上传实际业务、会话/Key、原始数据库或无审查截图。用量与费用未知不伪写零。

## 10. GitHub CI/CD 设计（尚未部署）

Ethan 已选 GitHub；沿原生 ci.yml/frontend-quality 的检测思路适配，不再引入第二 CI 平台。工作流 YAML、GitHub Actions 运行记录、required checks/保护规则是三件事，分别记录状态。当前仅有本地 MC-00 snapshot 工作流文件和 CODEOWNERS，未上传或运行 Actions、未配置保护；下面完整产品检查仍为规划。

| 检查名（规划） | 触发/必须证据 | 归口 |
|---|---|---|
| morchat-docs | 每 PR：有效链接/锚点、权威文档/任务 revision、禁止按 archive 施工、任务写集/所有权与契约状态校验 | MC-00/文档 owner |
| morchat-frontend | 前端/共享配置变化：lint/typecheck/单测/build，独立 mobile scope 不伪称全覆盖 | 原生前端 owner |
| morchat-backend | Go/SQL变化：vet、单测/race、隔离 DB 集成、sqlc 生成差异含 untracked | 原生后端 owner |
| morchat-permission | 权限/路由/查询/WS/索引/资产/身份变化：NM 全部相关正负例及冻结契约测试 | B01＋B04＋独立安全 reviewer |
| morchat-ui | 客户端关键路径变化：Playwright 合成路径；Windows runtime/桌面改动加对应 Windows job | B02/B05 |
| morchat-supply-chain | 每 PR：secret/依赖/许可及上游来源清单；工作流改动专审、公开 artifacts 审查 | 安全/集成人 |
| morchat-ready | 每 PR/集成候选必跑，汇总所需 jobs；未运行/取消/失败不能误绿，未影响项须明确范围判断 | 单一集成人 |

检查必须有实际脚本/负例证明它会失败，不能只建名称或 `echo PASS`。文档-only 可跳过无关应用测试，但 always-run 的聚合检查要验证跳过理由；权限/共享schema/依赖变化不得被过窄 paths filter 漏掉。候选合入提交重验，上游升级跑更广矩阵；原生常规 CI 没有覆盖所有 Playwright E2E，必须补本项目实际需要项。knip 上游是提示项，不假称硬门禁。

**CI 安全：**默认 contents:read，第三方 Actions 固定完整提交 SHA；不用带秘密的 pull_request_target 执行 PR 代码，不向外部 PR/普通测试开放部署/模型凭据。公开仓不把公司员工设备作不受信任 PR 的自托管 runner。安装缓存与测试 artifacts 分域，避免权限/秘密进入共享缓存。各 job 有超时/取消和有限资源；真实模型 smoke 默认禁用。依据 [GitHub 安全说明](https://docs.github.com/en/actions/reference/security/secure-use)。

**main 保护：**要求 PR、指定检查、未解决讨论清零、最新变更复审与独立审核；禁止 force push/delete，不将管理员默认为绕过通道。CODEOWNERS 绑定真实获权账号，不能用不存在的 agent 名充数。只有一个 GitHub 账号时，subagent 审阅记录不等于 GitHub 独立批准：需要第二名合格 reviewer 或明确受控的本地工程准备流程，不能虚构保护已满足。保护能力受账号/仓可见性支持范围影响，转私有时重新核查。[GitHub 保护分支说明](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。

**CD 首轮关闭：**不原样启用上游 release.yml/v* tag 自动发布、容器推送、包发布、移动商店或 OpenClaw 定时真 CLI smoke。普通 CI 不持有发布 secrets。后续发布须独立授权，采用同一已验构建产物、版本/hash/许可清单、数据库兼容和回退计划；先内部测试环境→人工批准→限定设备试点。签名/生产部署凭据仅给受保护发布环境，失败停止推广。备份恢复未演练不放行；客户端回退不等于数据库可回滚。

## 11. 开发就绪、长任务与完整上下文

| 状态 | 可进入的工作 | 放行事实 |
|---|---|---|
| PREP-ELIGIBLE | 获单独授权后做 MC-00 工程准备 | 唯一仓/目标/非目标明确、原有改动已保护、写集/实际 owner/reviewer 登记；**不要求先存在 bootstrap 要建立的 CI 或全部 C 已冻结** |
| TEST-READY | 特定验证切片 | 实际代码基线/命令/环境可运行，所用 C 子集 TEST-FROZEN、fixture/参数/写集/证据/实验授权齐备；NM 切片不依赖模型预算或两台真设备 |
| BUILD-READY | 相应产品功能任务 | 依赖子集 BUILD-FROZEN、适用安全证据通过、独立审核/合流门禁生效，实施范围在 R1-AUTH-r1 内；不要求远期无关契约全部冻结 |
| RELEASE-READY | 内部正式试点/发布 | 完整适用 P0/产品验收、运维/备份/许可/签名与授权齐全，不由局部绿灯推导 |

**持续授权已更新：**R1-AUTH-r1 批准三个切片、合成测试库、本地提交及专用分支集成。TEST-FROZEN 允许受控最小实现和修复；BUILD-FROZEN 才放开其依赖产品面。产品实施授权已给，不在每张卡重复询问；技术签认、独立审核、真实模型与发布边界仍保留。新会话按 ROUND1-DELIVERY/ACTIVE 连续执行，准备报告不是终点。

历史 MC-00：远程空仓已建，源码接入和隔离工具链已有实物；检查结果见 [执行记录](tasks/MC-00-results.md)。当前首轮交付以 [R1-AUTH-r1](ROUND1-DELIVERY.md) 与 [ACTIVE](tasks/ACTIVE.md) 为准；完整 CI、产品责任与契约状态按对应卡登记；**只在对应子集/写集/独立审核齐备后开放独立产品包并行**。首个工程目标和退出条件唯一正文见 PLAN §1.1。

每张任务卡/交接包必须自足，至少包含：

```text
Task-ID / goal-id / scope / non-goals / status
repo / branch / worktree / base-commit / uncommitted-file-hashes / upstream-SHA
docs-entry / normative-doc-revisions / contract-baseline / fixture-revision
owner-agent-id / actual-model-or-unknown / integrator / independent-reviewer
allowed-write-paths / forbidden-paths / shared-hotspot-owner / dependencies
input-and-output-contracts / expected-errors / negative-test-IDs
exact-commands-and-cwd / isolated-services-and-data / allowed-network-and-model-budget
acceptance / stop-conditions / evidence-paths / test-exit-codes / remaining-failures
source-commits / review-result / integration-result / rollback-boundary / next-step
```

登记在同仓 docs/tasks 的受控卡片与证据索引（工程准备时创建），公开前去敏；完整内部证据在受控存储，任务卡保留可授权访问的引用与hash。公开仓不能迫使把受限上下文泄露，未获公开许可的卡先留本地。scratch/聊天记录不是唯一台账。

恢复任务先核实际 Git/服务状态和未提交 diff，再读入口＋任务卡＋依赖契约，不能只读一条“继续”就重跑。生产者变更用 CR 记录影响与消费者 ACK，消费者未 ACK 不继续旧接口；共享路由/SQL/锁文件由唯一 owner 接入。独立包才能按 §5.4 并行，同一 SDD 计划仍一个实现者；模型档位与真实运行 ID 按 §5.5/5.6，不硬编码不存在的型号或伪造提交人。

**文档状态纪律：**产品决定用“已确认”；精确契约用 DRAFT/TEST-FROZEN/BUILD-FROZEN；运行证据用 PASS/FAIL/BLOCKED/NOT RUN；任务用 NEEDS_CONTEXT/READY/IN_PROGRESS/REVIEW/VERIFIED/MERGED，四套含义不互相替代。参考报告/归档不能升级成施工指令。每次行为变更在同一 PR 修正权威正文与消费者；CI 实现后校验旧 revision/失效引用，未实现前不声称自动防漂移已生效。

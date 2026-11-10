---
purpose: "Multica 当前底座：事实、门禁与实测"
owner: docs-maintainers
status: reference
updated: 2026-11-06
related:
  - docs/archive/2026-11-06-before-multica-authority-migration/MULTICA-BASE-EVALUATION.md
  - docs/REFERENCE-REUSE.md
---
# Multica 当前底座：事实、门禁与实测

**最新证据索引：**2026-11-06 合成组队实验已产生真实模型运行；委托权限子样本 FAIL，回传汇总在采集窗口内未闭环。下文早期“未新增运行/全部未测”仅描述当时阶段，不覆盖本文末尾“合成组队实测”。本轮只是同步已有证据，没有重跑或修复产品。

2026-11-06 更新文档状态。Ethan 已明确按 Multica 统一底座收敛方案；这不是企业安全或上线验收通过。以下固定样本和实验事实保留原日期；前序候选阶段完整记录见 [迁移前快照](archive/2026-11-06-before-multica-authority-migration/MULTICA-BASE-EVALUATION.md)。

## 2026-11-05 实测更新：优先一套 Multica，不叠加调度

**推荐 Multica 统一客户端＋中央协作后台＋原生调度；Paperclip 保留对照，不作为第二调度层。当前设计已确认，企业 P0 未通过，契约仍 DRAFT；本轮不授权产品实施。**

- 真实 Web UI @Bot→Multica 原生任务→Windows DSH→本地文件→线程回复＋9,736 tokens 已走通；只有一条 run、attempt=1。Electron已构建和启动，但原生窗口交互未验收，不能把 Web 通过写成桌面端通过。
- 文件完成时中央附件为空；随后通过真实 UI 人工辅助上传，预览/鉴权下载/哈希通过。**自动归档未通过**，不把这段补操作拼成无人值守 E2E。模型发生一次被拒后的工具重试，精确输出多一个换行，严格指令遵循未通过。
- **新增P0：本次 LOCAL_UPLOAD_DIR 的 /uploads 原始文件地址无需登录即可读取同一合成文件**；鉴权API本身401不代表无旁路。桌面源码 webSecurity:false 也不是开发态专属，须在上线前收敛。未推断私有S3同样泄漏或存在已证实RCE。
- 两账号验证：跨工作区404、授权入组后200、他人private Bot调用403；同revision同时认领200/409。仅这些路径通过，部门/撤权/双设备/版本闭环未通过。
- 首选复用整套Multica的界面、Issue/run、daemon、DSH、上传和token流水。最小差异集中在企业权限与设备资格、群定向唤醒、版本冻结、可靠派发与自动资产接收、公司模型出口和安全边界；不另造任务系统。

完整实测、分层结果与P0顺序：[集成验证报告](../experiments/multica-spike/INTEGRATION-RESULT.md)。源码依赖与控制面审查：[审查记录](../experiments/multica-spike/control-plane-audit.md)。下列源码能力和分层实测不相互替代；早期烟测不覆盖最新真实链路和安全失败。

## 固定源码基础

**Multica 在统一客户端、本地 daemon、人机小队、任务协作的现成产品组合上值得优先对照验证。本阶段优先实测 Multica 的既有完整产品与 DSH 接入；Windows 实机链路和企业内部权限边界仍须验收。** 不再把外售 SaaS 商业授权当作内部自托管的阻塞。

| 能力 | 固定源码/官方资料核实 | 对我们意味着什么 |
|---|---|---|
| 桌面壳 | Electron，Windows/macOS/Linux；桌面自动管理 Go daemon，共享账号/工作区数据，Windows NSIS 发布 | 比从网页自行补完整本地宿主管理更接近需求；不是 WinUI，也不等于安全执行器 |
| 手机壳 | Expo/React Native 的 iOS 源码；尚未上架，无 Android 客户端；需 Mac/Xcode/iPhone | 真实可复用方向，但不能承诺已有双端移动产品，更不能在本 Windows 机器验收 iOS |
| 中央+本地 | Go API/daemon，桌面包装 CLI，各部署 profile；无需先用 Docker/WSL 才能原生运行 | 结构贴近中央协作控制＋员工本地 harness，但设备/管理人资料授权仍需验证 |
| DSH | 原生 dsh adapter 用 --profile multica --stdio 的 JSONL v1；execute/cancel/usage/session/MCP 已有映射 | **已原生支持 DeepSeek Harness，应直接复用官方适配器和 profile 接入流程，不另写 DSH 桥。** profile 配置与 Windows 真机验证是现有能力的部署验证，不等于项目缺少 DSH 支持 |
| 小队 | 真人/Agent 成员、Agent leader、显式交接及评论触发 | 可少造组队 UI；真人负责人及群讨论不隐式唤醒的规则仍要适配/测试 |
| 任务/交付/用量 | issues、run、deliverables、analytics、计划日期视图等已有源码 | 当前沿整套唯一任务事实，不能再把 Paperclip 同时作为第二主账本 |
| 安全 | 官方明确 run 继承 daemon 用户权限/凭据，不保证文件系统沙箱 | 员工是管理员≠Bot 可以管理员权限；Windows 原生权限控制仍需单独证伪，不把工作区隔离当 OS 隔离 |

固定样本：D:/dev/refs/multica，SHA 58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe；原仓只读。关键源码：apps/desktop/src/main/daemon-manager.ts、apps/desktop/electron-builder.yml、apps/mobile/README.md、server/pkg/agent/dsh.go、dsh_test.go、server/internal/handler/squad_briefing.go、apps/docs/content/docs/security-model.mdx。

## 2026-11-06 原生优先复核：完整产品复用，不按低保真重建

三路 subagent 分别审查协作/状态、权限/离职、runtime/VCS；主审对读共享前端、项目甘特、日期模型与现有低保真。固定源码仍为 `58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe`（提交日期 2026-11-03），不是追踪网站最新版或已经升级。官网五篇与固定样本逐项对照；以下是**静态证据，不是新增运行 PASS**。本轮未启动服务、调用模型、修改产品代码或低保真 HTML。

**纠偏：直接使用完整 Multica 是更短的主线。**八项 B 边界不是八套新系统；v4 是业务体验和反例样例，不是要求重造菜单、群后台、看板或甘特的施工图。原生工作面能满足就保留，只修改经过反例证明的差异。

| 已有能力 | 固定样本证据（相对 `D:/dev/refs/multica`） | 真正差额，不重建什么 |
|---|---|---|
| 我的工作、项目看板/表格/泳道/甘特 | `packages/views/my-issues/components/my-issues-page.tsx:14–36`；`packages/views/projects/components/project-detail.tsx:499`；`packages/views/issues/surface/issue-surface.tsx:344–345`；`packages/views/issues/components/gantt-view.tsx:457`；`packages/core/issues/date.ts:1–6` | 整页复用。日历计划日期已有，不从 run 时间造字段。公司聚合、细粒度授权与验收动作需适配；甘特不是新引擎，也不是自动排程 |
| 人机小队、多人 Issue 评论、多目标 @、署名回复 | `server/internal/handler/squad.go:227–308,797`；`comment.go:31–43,79–105,1918–2046,2636`；`packages/views/issues/components/comment-trigger-chips.tsx:47–67` | Squad leader 必须 Agent，但成员可真人；真人业务问责保留在项目/任务。`trigger_outcomes` 已有，不能从 Chat creator-only 推导必须自建多人协作后台 |
| 原生评论路由和防重复 | `comment.go:1939–1954,2644,2698–2727,3006,3041–3074`；`server/internal/util/mention.go:39–50` | `/note`、pending 去重/合并已有；默认无 @ 回复/assignee/leader 回退仍可能唤醒，引用内 @ 与 Bot 文本也可派工。须改明确命令边界、根额度/停止及持久对账，不能只禁 assignee 或重写队列 |
| 会话分域 | `server/internal/handler/daemon.go:3355–3359,3468–3487` | 原生按 Agent＋Issue 恢复 session，并校验 runtime；独立工作优先独立 Issue。同 Issue 两条评论线程不是私密上下文隔离，必须实际检验输入/目录/并发 |
| 工作流与收件箱 | `server/internal/issueworkflow/issueworkflow.go:1–40`；`server/internal/handler/issue_workflow.go:454,633,928,1069`；`server/internal/handler/inbox.go:160–364` | 单 Issue 状态可交接真人/Agent/Squad 等，保留原生配置；它不等于跨任务阶段 DAG。收件箱已读/归档不是业务验收，不新增平行通知库 |
| 跨子任务阶段、条件接续与防循环 | `server/internal/handler/issue.go:79–82,4030–4038`；`server/internal/service/issue_wakeup_condition.go:653–716`；`server/internal/service/issue_wakeup_system.go:23–52,145–255,315–350,640–654`；`server/internal/service/issue_wakeup_activity.go:16–23,130–190` | 原生 parent/subissue/stage、child_done、other_issue、持久 receipts/重试和 wakeup 链/频率限制已有。复用而非再造阶段/依赖批次；仍须验证直接 @/分配路径是否同样受根额度/停止约束。stage 本身不阻止提前把后阶段 todo 入队 |
| 成员、调用和借机授权 | `server/internal/middleware/workspace.go:197–264`；`server/internal/handler/agent_access.go:13–36,73–130`；`server/internal/service/runtime_access.go:10–14`；`server/internal/handler/runtime.go:1073–1089` | Workspace、Agent Access、runtime owner/shared_with/public 是三道已有边界；管理员不绕调用/借机许可。仍缺部门/私密资源 ACL 与资料、设备管理人的授权交集 |
| 离职撤销和部分缓存清理 | `server/internal/handler/workspace_revoke.go:45–268`；`server/internal/handler/workspace.go:717–732,762–777`；`server/internal/realtime/membership.go:64–99`；`packages/core/realtime/use-realtime-sync.ts:1411–1424`；`packages/core/platform/storage-cleanup.ts:22–44`；`packages/core/search-index/client.ts:116–130` | 已有停 runtime、归档绑定 Agent、取消相关运行、清 grants/订阅、断 WS、清工作区草稿/搜索。补公司全域编排、维护责任交接、未覆盖缓存/会话及清理回执，不重造整套离职系统。删除索引错误被吞，不能当确认清理完成 |
| 本地执行与取消回执 | `server/pkg/agent/dsh.go`；`apps/desktop/src/main/daemon-manager.ts`；`server/internal/handler/daemon.go:5875–6003`；`daemon/client.go:567–577` | daemon/DSH 和 cancel-ack、process_cleanup_confirmed 已有；验证 Windows 实际终止及 UI 阶段。共享 runtime 不等于资料授权池，daemon 用户权限不等于 Agent 隔离 |
| VCS 与任务状态 | `server/internal/handler/pr_auto_complete.go:34–42,65–68,158–170`；`server/internal/daemon/execenv/runtime_config_sections.go:627–639` | 原生区分 run 与 Issue，指令约定交付至 in_review。PR 合并自动状态支持 `none` 或配置到 in_review；先配置，不另造 Git/PR 状态系统。业务验收仍须固定成果版及有权真人，不能只靠 prompt |
| 文件与用量 | `server/internal/daemon/execenv/runtime_config_sections.go:872,886`；`server/internal/handler/file.go`；`server/pkg/db/queries/task_usage.sql` | 已有 CLI 附件上传、Issue 关联和用量；不等于模型忘上传也自动归档。补 daemon 确定性采集/持久重试、终态后窄范围补传和金额证据；复用同一存储/计量 |
| 领取、并发与终态报告 | `server/pkg/db/queries/agent.sql:734–795`；`server/internal/service/task.go:3657–3680`；`server/internal/daemon/daemon.go:6371–6436` | 原生 SKIP LOCKED、局部同 Issue/Agent 串行、容量控制、终态持久化重放已有。它不是全局单任务，也不是未上传文件队列；绑定 runtime 的离线等待/重试不等于授权池换机 |
| Git worktree 与收尾 commit | `server/internal/daemon/repocache/cache.go:610,1515`；`server/internal/daemon/execenv/local_worktree.go:28–37,509–525,599–610` | 复用本机分支/worktree、脏状态重放与自动 commit；仍缺公司已确认保存点、周期采集、普通文件、完整 staged/unstaged 语义与旧机隔离，不重新写 Git 库 |

### 原生最短验证面与不能省略的负例

Ethan 已确认 **MINIMUM-CHAIN S1-D：首轮沿原生任务协作，独立群入口后补**。最小 fixture 为两个真人、两个 Bot、一个 Project、真人负责的父 Issue 和两个独立工作 Issue；评论/小队承载多人协作。私密与跨部门细权要求不降低；原生不能表达时不开放真实敏感资料，不因入区扩大资料授权。

**新增静态状态冲突，必须实测：**`server/internal/daemon/execenv/runtime_config_sections.go:629` 提示交付至 `in_review` 且称其用于 stage barrier/父通知；但 `server/internal/service/issue_wakeup_condition.go:613–615` 实际只把 category `done/closed` 算闭合，`server/pkg/db/queries/issue_status.sql:14` 的 in_review 属 started。内置 skill 的 issues.md:338–348 也说明 barrier 按 done/cancelled 闭合。因此不能写“待验收自动推进下一阶段”，也不能把阶段闭合（含取消）等同全部成功。下一轮在原生状态/规则上分别测试 in_review、done、cancelled、晚到/重复事件及父负责人通知，再冻结继续条件；不要为解决提示冲突重造 DAG。

- 普通回复、引用 @、Bot 输出中的 @ 不得误唤醒；合法结构化交接可有界唤醒，重放/重启不重复派发，终态后的 A→B→A 不可无限循环。
- 不同 Issue 的同 Bot 实际输入和目录不能串；同 Issue 线程 UI 不当隔离证据。工作区公共上下文只能放所有成员及获准 Bot 都可读的资料。
- Workspace 可用于部门/专项的粗分区，但入区获得整区日常协作范围，不能冒充只读单任务授权；跨区复制 Bot/任务也不等于稳定身份和同一事实。
- 移除成员后重邀不恢复旧 grant；公司资产保留。原生 server cancelled 与设备清理 ACK 分开，离线不报已停/缓存已清。
- run completed、Issue in_review/done、文件已归档、指定人验收分别核对。PR 合并默认 done 必须按业务验收政策配置，API/工作流/Agent 写状态入口也不能绕过验收。
- `/uploads` 匿名旁路仍在 `server/cmd/server/router.go:1535`→`server/internal/handler/file.go:968–976`；此前 P0 FAIL 保留。自动归档、公司模型出口、完整版本及双机接续未因本次静态复核转为 PASS。

官方对应：[小队](https://multica.ai/docs/zh/squads)、[运行时](https://multica.ai/docs/zh/daemon-runtimes)、[VCS](https://multica.ai/docs/zh/vcs-integration)、[成员权限](https://multica.ai/docs/zh/members-roles)、[工作区](https://multica.ai/docs/zh/workspaces)。开工缺项与需用户确认项只在 MINIMUM-CHAIN / Discovery 登记，本文不另冻结契约。

## 当前内部自托管用途与许可边界

核对固定 LICENSE 与 [官方许可说明](https://multica.ai/licensing)：单组织内部使用不要求商业许可；向组织外用户提供托管服务（含免费）或商业嵌入分发需要商业许可；去掉/替换 UI 品牌需要另行书面 branding waiver。仅复用 backend/daemon/CLI 也有归属说明义务。不能标成普通 Apache-2.0；这是条文核对，不是法律意见。当前是公司内部自托管，商业许可不是启动/选型门槛，不要求先询价；保留上游品牌及归属说明。若以后新增外部用户托管或改品牌，再另行核对对应条件，不提前把它纳入首版。

官方依据：[桌面](https://multica.ai/docs/desktop-app)、[移动端](https://multica.ai/docs/mobile-app)、[安全模型](https://multica.ai/docs/security-model)、[运行时安装](https://multica.ai/docs/install-agent-runtime)。在线文档与固定样本分开记录。

## 已有实验分层（按发生阶段）

- 只读原样本：桌面 window-state parseWindowState 两项 Node 测试通过；仅解析单测，不是桌面启动。
- 独立 Windows 原生实测：官方 portable Go 经 SHA256 校验，无系统安装；multica.exe 编译与 version 均 exit 0。上游 DSH 选定 6 项：3 pass / 3 skip / 0 fail；Windows daemon 进程启动失败上报 1 pass / 0 fail。详见 experiments/multica-spike/evidence/results.json。该早期测试未涉及真实 UI→模型→交付；后续真实实验结果见上节。
- 上游 DSH 流式、取消、模型发现 shell fixture 明确跳过 Windows（原结果保留）；另增加 Windows 原生 exe 合成协议 fixture，通过未改动的生产 dsh.go 执行：流式+精确 usage、带 cancel-ack 的取消、模型发现 **3 pass / 0 skip / 0 fail**。不是把强制杀进程记作取消成功，也未运行真实 DSH bridge/provider。补的是测试物料，不是重新实现 harness；当时尚未验证真实 DSH 和 UI 链，后续实测及失败见上节。
- Paperclip 对照：真实页面功能链已通过，但只在 local_trusted 合成公司、同机、固定交付 prompt；金额与企业安全仍未通过。详情见 [Paperclip 实验](../experiments/integration-spike/README.md)。

## 统一对照门槛

1. 同一合成需求：员工工作首页→明确 @Bot→本地 DSH→流式回复→run 归属文件→下载哈希→真实用量；不是后台造数据再截图。
2. 原生 Windows 启动/失败/取消/重启/离线明确反馈；所有测试基于实机，不以 Docker/Linux 替代。移动端只承接协作，不假定手机运行完整桌面 harness。
3. 公司/部门/私密授权、设备与管理人资料资格、撤权、任务和历史资产保留必须验证；没有合格设备时等待，不换未授权设备。
4. 不自动搬员工个人凭据，不回退个人计费，不以用户已管理员为借口让 Bot 无约束运行。
5. 比较真实必改模块和维护成本；必要桥接优先上游已有组件。选择其中一个任务事实底座，不拼 Paperclip＋Multica 双主。

**当前决策：Multica 是现行设计的唯一产品与调度底座；复用官方 DSH 支持，不叠加 Paperclip。** Windows 权限、版本固定、自动归档与工作接续仍须证伪；必要门禁无法满足则修正设计，不能以第二后台、扩大权限或抹去失败绕过。本轮未新增运行测试或产品修改。

## 2026-11-06 对话组队、Leader 权限与企业能力补核

本节回应 Ethan 对“企业边界需要补齐”的纠偏：**不是五套功能从零自建，而是在已有产品上列差额。**只读复核固定源码与在线官方文档，未调用模型、修改运行对象或新增实测 PASS。样本仍为 Multica `58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe`、OMB `597e70d7930db632747acfb4ea047ca520bd958c`、Paperclip `40ea7a9b8994e9bdb3d13794b5847388be0f7a92`。

### 对话建队：已有执行原语，不等于 Leader 天然有管理权

| 问题 | 固定源码事实 | 调整建议（未冻结的新自治政策） |
|---|---|---|
| 能否让 Bot 创建小队 | CLI 已有 squad create/update/delete、member add/remove/set-role，直连同一原生 API；运行可使用 Multica CLI | 沿任务评论或原生 Chat 让组织助手调用现成命令，不新建团队后台。自然语言意图、实际写入回执和安全授权仍需一次真实纵切 |
| Leader 能否选择成员派工 | 已有 roster、结构化 mention、evaluation、结果后再唤醒；独立工作可创建子 Issue | 直接复用。选择现有成员做事与修改小队花名册、新建永久 Bot 分开，不把“协调”当公司人事授权 |
| Leader 能否增减成员 | 管理 API 按 workspace owner/admin 或 squad.creator_id 校验，不按 leader_id 授权；普通创建者只能绑定自己可调用的 Bot，管理员有配置绑定例外 | 不承诺“设为队长就能随意改队”。用明确的当前委托授权，默认管理本次受托小队，不通过升级设备管理人为管理员实现 |
| 能否新建永久 Bot | 原生 Agent create/Builder/copy 已有；CreateAgent 需要 runtime，当前请求用户进入 owner 判断 | 优先复用已有 Bot；确需新建时复用原生创建，但显式决定维护人、设备、模型、能力和数量/预算。不能把临时分工都变成永久员工 |

**关键身份差额：**`daemon.go` 的 finalizeClaimDelivery 在事务中重读 runtime，并把 task token 的 UserID 设为锁定的 runtime.OwnerID；`middleware/auth.go` 将此值写入 X-User-ID，同时保留可信 Agent/task 身份。`squad.go` 的创建/管理沿 requireWorkspaceMember→该 UserID→creator/admin 判定，创建事件也按 member 发布。本轮已读路径未见按本轮 originator 对组队管理做独立委托检查。

上述静态审查当时只推导出“员工 A 的请求可能借用 B 的管理权”；随后合成实验已复现小队职责修改与创建归属差异，见下文“合成组队实测”。不能笼统说所有 task token 检查都失效：原生 Agent 调用另有 top-of-chain originator 检查，本次 A 直接调用私有 Bot 也确实被拒绝。问题是不同动作未共享我们要求的委托语义。组队应同时留真人发起者、操作 Bot/run、设备管理人，不能互相替代。

### 企业能力：保留原生基础，只补实际差额

| 方面 | 已有，必须复用 | 与我们要求的差额 |
|---|---|---|
| 组织与角色 | Workspace、统一账号多区成员、owner/admin/member、邀请、Squad 真人/Bot roster、project lead | Workspace 是隔离边界，不天然等于公司下部门。拿每部门一个区可作严格隔离试点，但会使跨部门任务/共同 Bot 分散；同区部门细权与私密项目不能靠菜单筛选替代 |
| Bot 调用与设备 | Agent Access 区分可见/可调用；私有 Bot 无管理员调用豁免；A2A 按链首真人；runtime 私有/共享名单；领取时再验 | team 调用目标在当前实现为保留未生效；资料读写范围、设备管理人资料授权、组队管理委托仍需扩展，不新造全套 RBAC/设备授权 |
| 撤权与离职 | 原生事务删除成员、停运行时、归档绑定 Agent、取消运行、清调用 grants/共享设备授权；记录留在区内；另有 WS/部分缓存清理 | 留存不等于接管后能继续工作。先安排公司 Bot/资产维护人和合格执行设备交接；紧急撤权不等交接。补公司跨区编排和受控缓存清理回执，不从零造离职系统 |
| 成果与经验 | 原生文件上传、附件关联、评论/run、skill 编辑/导入/绑定/快照；插件包有不可变版本 | 自动采集归档仍有既有 FAIL；普通 skill/Bot 配置的批准版本、旧字节保留和 run 实际加载未闭环，不重造编辑器/附件系统 |
| 外部知识/表格 | MCP/插件/资料引用接缝已有 | 后接成熟服务；不因本次组队研究增加知识引擎或表引擎首轮范围 |

### OpenMausBot 与 Paperclip：参考什么，不迁入什么

- **OMB 学“组队操作链”。**chief-of-staff.ts 已指导先查现有团队，再用 propose_team_setup 表达一组变更；team-setup-requests.ts 有目标范围、expectedRevision、工作中变更检查、执行回执及受条件约束的 Undo。候选是计划/差异/回执设计及可独立规则，不是拷贝其 Store/MCP 服务。其默认 Full access、Chief 审批级别沿派工向下提升、部分配置直接应用，不作为本公司默认；Undo 也不能撤回已经外发的数据或已执行工作。
- **Paperclip 学“动作授权与政策门禁”。**官方 create-agent skill 明确头衔不授予招聘权；agents.ts 经 access.decide 的 agents:create 检查，并按公司政策要求 pending_approval；普通计划确认与正式治理审批分开。借鉴授权、幂等、待批准与生效分离，不搬 reportsTo 当真人部门，不部署第二调度/审批权威。没有规定每次使用现有 Bot 都必须找老板批准。
- **Multica 保留实际对象和运行。**组织助手是原生 Bot，组队结果是原生 Squad，分工是原生 Issue；界面与后台仍完整沿用 Multica。自治范围在契约中签认，而非照搬任何竞品默认值。

### 最小证伪样本（原静态清单；部分已测，状态以下节为准）

1. 普通成员 A 在原生对话/任务评论要求“用现有资料 Bot 与内容 Bot 建队，分别生成分析和草稿”；核验一个 Squad、成员/职责、任务 ID 和实际回执，重试不能重复建队。
2. 在 B 管理的共享 runtime 执行同一请求：分别给 A/B 不同组队与 Bot 使用权限。拒绝 A 无权、B 有权的扩大操作；A 有权但 B 不具资料资格时不能执行；审计不能只记 B。沿原生 task/run/token 补委托，不把 A 的 PAT 下发。
3. Leader 为别人创建的小队增员、换队长、修改职责；有明确当前委托才成功，无委托不因 leader 名称放行。名单变化或确认期间撤权应使旧计划失效。
4. 对已授权小队，成员结果应有界唤醒 Leader 继续工作；普通讨论不自动触发。保留原生去重/队列，不能通过完全禁用后续协调来“解决”消息风暴。
5. 成员离职后旧 grants 不随重新入区恢复，旧设备不得继续；公司已归档成果仍可按权读取，公用 Bot 按批准交接继续工作；紧急撤权不能被未完成交接阻塞。

以上沿 C01/C03/C06 与 G3/MSG-06、LC 原有测试扩展，不增加第二验收体系；依旧不证明完整双设备接续或公司 Key 已通过。

### 源码与官方资料

Multica 路径相对 `D:/dev/refs/multica`：`server/cmd/multica/cmd_squad.go:115–214`；`server/cmd/server/router.go:2068–2069,2246–2262`；`server/internal/handler/squad.go:114–140,227–308,767–845`；`server/internal/handler/handler.go:1016–1034`；`server/internal/middleware/auth.go:100–149`；`server/internal/handler/daemon.go:2452–2516`；`server/internal/handler/agent.go:1437–1503`；`server/internal/handler/agent_access.go:13–45`；`server/internal/handler/workspace_revoke.go:15–37,151–166,230–253`；`server/internal/daemon/execenv/runtime_config_sections.go:215–244`。创建和成员添加为多步原生接口，不把一句对话当原生原子团队事务。

OMB 路径相对 `D:/dev/refs/openmausbot`：`server/chief-of-staff.ts:21,55–82`；`server/chief-level.ts:13–24`；`server/team-setup-requests.ts:101–175,305–339,380–404`；`docs/approval-levels.md`、`docs/composio.md`。Paperclip 相对 `D:/dev/refs/paperclip`：`skills/paperclip-create-agent/SKILL.md:13–26`；`docs/guides/agent-developer/handling-approvals.md`；`server/src/routes/agents.ts:1417–1431,4383–4387,4595–4601,4762–4789`。

在线对读：[Multica 小队](https://multica.ai/docs/zh/squads)、[成员与权限](https://multica.ai/docs/zh/members-roles)、[工作区](https://multica.ai/docs/zh/workspaces)、[智能体](https://multica.ai/docs/zh/agents)、[运行时](https://multica.ai/docs/zh/daemon-runtimes)、[令牌](https://multica.ai/docs/zh/auth-tokens)、[Skills](https://multica.ai/docs/zh/skills)、[OMB 官方权限说明](https://github.com/milind-soni/OpenMausBot/blob/main/docs/approval-levels.md)、[Paperclip 审批说明](https://docs.paperclip.ing/guides/day-to-day/approvals/)。Paperclip 旧 agent-developer 在线链接重定向新版页面；实现结论依据固定源码，不把最新网页内容冒充本地已实现。

## 2026-11-06 合成组队实测：权限 FAIL，汇总未闭环

### 样本、证据与限制

固定 Multica 样本仍为 `58402f5d11d2f8f3a22c1bb9fe0d6c52992d3dbe`，官方 DSH bundle 样本 `571d7c036d15f58ee88c89fd80afb0a6c7f0023c`。使用两个真实合成账号 A（普通成员/发起人）与 B（工作区 owner/设备管理人）、B 所有且向工作区共享的三个 Bot、B 私有 runtime，单台 Windows 上容量设为 2。A 可调用共享 Bot 不等于 A 可管理 B 的小队。没有第二台物理设备。

原始记录：[native-result.json](../experiments/multica-spike/evidence/squad-20261106/native-result.json)，采集时间 **2026-11-06 15:03:21 +08:00**；SHA-256：`2a7a699f6dab24a4d86d0d389ca814c6db7435398040393f1571cf532c9dd09c`。记录为原生 API/SQL 只读采集与可见工具消息，排除 thinking；认证配置不作为交付证据。两轮对话共 7 个真实 DSH run，7 条用量记录，cost_usd_ticks 均为空，不能报告真实金额为零。

实验经原生 Chat API 发送，而非浏览器界面。使用测试专用 multica_cli 工具调用未改动的原生 CLI；工具白名单、每 run 24 次工具调用上限、整轮最多 8 次运行，部分运行触及限制。首轮 mention 格式错误，第二轮加准确格式指导；实验指导曾错误建议 --assignee-type，随后纠正，不归为产品缺陷。使用该实验获准的个人登录 DeepSeek 账号，不是公司统一 Key 验收。没有修改产品授权逻辑，没有人工补写成员结果；实验配置不代表未经约束的默认 DSH 环境。

### 实际结果

| 子样本 | 实际观察 | 判定 |
|---|---|---|
| 直接负例 | A 直接改 B 小队职责、将 B 私有 Bot 设为 Leader、调用该私有 Bot，均 HTTP 403 | 三个路径拒绝有效；不外推全部权限正确 |
| G3-R6 委托边界 | A 对话让共享 Bot 改 B 小队职责，原生 CLI 成功，服务端成员职责成为 SYNTHETIC_DELEGATED_PROBE；同一动作直接 A 请求为 403 | **FAIL**：无独立扩大委托却使用 B 的管理能力；不是 UI 隐藏问题 |
| 建队归属 | 对话创建两个原生 Squad 均成功，creator_id 为 B；A 对其中一个新队直接修改仍 403 | 功能存在，**委托/归属不合格**；7 个 run 的 originator_user_id 仍为 A，不能写成全部审计归因丢失 |
| 首轮派工 | Leader 输出 mention:agent: 格式，评论成功但没有成员运行，Issue 为 todo | 派工未受理；模型说已派工不算回执，不单独断言底层队列故障 |
| 第二轮派工 | 指导使用 mention://agent/ 后，两个成员获得真实 run，执行时间有重叠 | 单机多 Bot 并行与成员回传局部成立；实际派工来自 Coordinator 的建队对话 run，不是独立 Leader run，严格阶段顺序尚未证明 |
| 回传与汇总 | 乘法 Bot 的显式评论触发 Leader 后续运行；Leader 未把乘法 Bot 同时写出的求和当第二位成员独立结果。求和 Bot 后来通过终态兜底评论返回结果 | 截至采集时双方结果存在、所有 run 已 completed、Issue 仍 todo，没有最终汇总/提交验收；**整条自动闭环未通过** |

第二轮 Issue：`01a1afa9-6b14-79ec-a824-534c06d8c98b`；求和 run：`01a1afa9-72e9-77c0-b2ce-edadc044b89f`；乘法 run：`01a1afa9-72f0-7627-a592-11a69d878040`；最后 Leader run：`01a1afaa-9882-7ee7-8107-284a901efe79`。最后成员完成至采集仅约 19 秒，未预先冻结最终汇合时限；不能据此宣称永久不唤醒。显式评论/终态兜底事件路径、身份/岗位指令加载与工具限制均需定点排查，**根因尚未最终确认，不把全部问题归咎于 Multica 调度**。

### 对方案的约束

- 继续复用原生 Chat/Squad/Issue/评论/队列/DSH/task_usage；修委托强制点，不另造系统或向 Bot 发管理员 PAT。
- 先重验同一动作 A 直调与 A 委托 Bot 的一致拒绝；再在明确委托内测试自动建队/选人/派工、正常与兜底回传的可靠汇合。禁止通过给 A/B 扩权或把设备全设为共享掩盖失败。
- 结果汇合需按来源与本次分工判定；两个字符串不是两位成员的结果。run completed、结果齐备、归档、待验收/已验收分别判断；不得人工 @ Leader 后计自动闭环 PASS。
- 增员/换 Leader/新建永久 Bot、执行前和运行中撤权、重试建队幂等、设备管理人缺资料授权、离职交接均 **NOT RUN**；真实界面、Windows 11 隔离、公司模型网关、自动归档、双物理设备与跨机接续未在本实验验收。既有匿名 uploads 和自动归档 FAIL 不解除。
- 本次文档更新只登记已有证据；G3-R6 部分实测 FAIL 不等于整个 G3 已跑完。修复后的判据与顺序见 MINIMUM-CHAIN r3 / Discovery；全部契约仍 DRAFT。

## 2026-11-06 新 fork 静态复核：不继承旧样本成绩

新checkout：D:/dev/multica，HEAD164290ee14f63fe009ca304db21de9879db104c8，product/dev分支已存在；本轮只读，没有改产品代码、运行服务/测试或模型。旧实验固定SHA58402f5…不变。完整手册覆盖与代码证据见 [复用正文§7](REFERENCE-REUSE.md#7-四份深读手册与新-fork-对照2026-11-06)。

- **委托仍需重验：**新旧样本的squad.go/auth.go/agent_access.go文件diff为空；新daemon finalize仍绑定锁定runtime owner，小队管理仍按用户creator/admin/owner。未见旧借权反例已修依据，但不能记新SHA已运行FAIL。应修业务动作强制点，不全局改task token语义来冒充完整修复。
- **回传有更具体静态线索：**显式CreateComment进入trigger；终态fallback的createAgentComment写库/通知/解除resolved，不调用同一路由。完成对账筛刚结束的同一Agent，不自动证明Leader能收到全部兜底结果。daemon.go:5189–5196另明示不同review head阻挡时缺安全持久义务存放处。此前19秒窗口仍不足以判永久失唤醒；需用固定窗口、显式/兜底/进度后终态、Leader忙/已结束、不同head阻挡分别复验，不能合成一条已确诊bug。
- **原生已有不可重造：**真人+Agent小队、局部并发claim、receipt/join/child_done、取消/终态报告重放、成员撤销事务、累计usage/rollup等。现成机制存在不豁免资料细权、受控设备清理、结果可靠性和企业归档门禁。
- **无需首轮替换entitlement：**原生自托管Cloud URL可留空；不引入Stripe/积分五池。公司模型权限与预算另验，不继承商业门控的宽松降级语义。
- **DSH交互未验：**当前driver处理execute/cancel和text/tool/usage/result等帧，未见question/permission往返契约；须核官方bundle能力及受控接缝。不能因其他harness或插件有审批UI便宣称DSH可用，不另造harness。
- **新SHA全部运行项NOT RUN：**包括委托正反例、自动汇总、公司Key、Windows隔离/双机、自动归档、匿名文件旁路是否修复、版本与接续。旧P0未解除，不将静态路径相同当新版本复现，也不把源码有测试当执行过测试。

本节只新增定位证据；首轮MC-S1-r4沿原范围，C01–C08仍DRAFT。D01/MC-00先完成新基线回归安排再派产品任务。

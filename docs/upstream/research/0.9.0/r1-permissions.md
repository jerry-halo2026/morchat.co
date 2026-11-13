---
purpose: 上游 v0.9.0（v0.8.2..v0.9.0）权限与安全类提交的逐项调研与取舍判决：MUL-8992 六条、daemon-token 身份、session 续期、私有项目 agent 说明
owner: lead
status: reference
updated: 2026-11-13
related: [docs/upstream/SEAMS.md, docs/upstream/DRIFT-BASELINE.md, docs/engineering/ORG-MODEL.md, docs/upstream/research/0.9.0/r3-runtime.md, docs/upstream/research/0.9.0/r4-frontend-infra.md]
---

# 上游 0.9.0 调研 R1：权限与安全

只读调研：全程只有 `git log / show / diff / cat-file / ls-tree / apply --check`。
没有改代码、没有跑 Go 测试、没有跑 `docs-map --build`、没有起服务。
区间 `v0.8.2..v0.9.0` 共 162 个提交，merge-base = `b7f8efca`（= `v0.8.2`）。

## 0. 结论速览

| 提交 | 主题 | 性质 | 判决 |
|---|---|---|---|
| `984c2145a` | 间接引用（重复目标、移动锚点、表格分组父标题、附件认领、label 计数、订阅列表、source context、搜索索引、触发预览、视图偏好、收件箱项）都要过私有项目可见性 | 越权修复 | **用上游**（8 处 import 冲突；保留 `issue.go` 的 W2-D 部门收件箱块） |
| `c3a9d8fd1` | 后台运行与工作区级读（wakeup 守卫、dashboard 项目过滤、pin 只回本人、搜索索引清单、daemon 回收、realtime 受众）留在私有项目内 | 越权修复 | **用上游**（1 处 hunk 依赖不在本批的 `b57d74717`，需连带或手挪） |
| `018107609` | 把"运行"解析到它读的项目（新 `projectaccess/task.go`、`requireTaskVisible`、`hiddenIssueIDs`、`redactHiddenProjectTasks` 重写） | 越权修复（结构性） | **用上游**（新文件 + 新查询；sqlc 重生成） |
| `6ccbdd178` | 绑定私有项目的 autopilot 属于该项目：列表过滤、Get/Delete/trigger 拒绝、派发前跳过、realtime 受众 | 越权修复 + 产品语义 | **用上游**，但派发 skip 语义要 Lead 确认（§5.3） |
| `61f84be54` | 子任务进度计数不再统计不可见项目里的子任务 | 信息泄露 | **用上游**（1 查询 + 1 调用，零代码冲突） |
| `e692d03e2` | 工作区 wakeup 列表/汇总/暂停列表过滤不可见项目 | 信息泄露 | **用上游**（零冲突） |
| `9abc71ae9` | daemon-token 请求清掉客户端 `X-User-ID` | 安全（身份伪造） | **用上游**（零冲突；与 R3 §2.1 同一结论） |
| `31f27f16a` | 只对"三段式 JWT"做 session 续期，PAT/task token 不再每次 400 | 稳定性 / 安全副作用 | **用上游**（零冲突，文件与我们完全相同） |
| `d04f104de` | 私有项目访问面板补一句"agent 跟随 owner 权限" | 文案 | **上游+小补**（8 个 locale 手工插 1 键；tsx 的 import 改 `@morechat/ui/icons`） |

一句话：**六条 MUL-8992 全部吸**——它们补的正是我们部门模型脚下那块地基（私有项目 + `project_member`），
且冲突几乎只有模块改名；真正需要决策的只有 `c3a9d8fd1` 的一个外部依赖和 `6ccbdd178` 的派发语义。

## 1. 前提：我们的差异长什么样

### 1.1 总体规模

```powershell
git diff --name-only v0.8.2 HEAD | Measure-Object          # 4326
git diff --name-only v0.8.2 v0.9.0 | Measure-Object        # 1319
# 交集（两侧都碰过的文件）656 个
```

交集大，但**并不代表双侧都改了行为**。逐个看这些上游触碰的文件，我们相对 `v0.8.2`
的差异只有三类：

1. **模块改名**：`github.com/multica-ai/multica` → `github.com/jerry-halo2026/morchat.co`
   （每个文件 1–5 行，`server/internal/handler/project_access.go` 整文件只差 5 行 import）；
2. **自研块**：本批文件里只有 4 处（见 1.3）；
3. 其余一律与 `v0.8.2` 逐字节相同。

这与 `docs/upstream/SEAMS.md` 的约束一致：`server/` 内差异只来自改名 + 已登记接缝。

### 1.2 一个必须先纠正的事实

`docs/upstream/SEAMS.md` §「私有项目（部门隔离的唯一支点）」写着"上游 0.8.2 与 2026-11-13 的
master 都没有项目可见性，本项目自研"。**这一点与 tag 内容不符**：

```powershell
git ls-tree --name-only v0.8.2 server/internal/projectaccess/      # projectaccess.go / projectaccess_test.go
git ls-tree --name-only v0.8.2 server/migrations/ | Select-String visibility
#   630_project_visibility.{up,down}.sql
#   631_project_member.{up,down}.sql
#   632_project_member_user_idx.{up,down}.sql
git ls-tree --name-only v0.9.0 server/internal/projectaccess/      # 同样存在
```

即：私有项目（MUL-8472）**是基线（v0.8.2）自带的**，不是我们后加的；
0.9.0 的六条 MUL-8992 是对这套机制的补漏，而不是新能力。
我们的部门模型（`department_scope.go` 用"私有项目 + `project_member`"表达默认范围）因此**直接吃这六条的红利**：
不吸，部门私有项目就仍然能被猜 id 的路径读到（重复目标、移动锚点、表格父标题、label 计数、订阅列表……）。

建议 Lead 修 SEAMS 这段（本报告按纪律不改文档）。这直接决定 §4 的优先级判断。

### 1.3 本批涉及文件里，我们真正改过的四块

| 位置（当前 HEAD） | 内容 | 与上游哪条提交相邻 |
|---|---|---|
| `server/internal/handler/issue.go:3397-3412` | W2-D：无项目新建 issue 落"部门收件箱"（`system_key=department-inbox`，开关 `DepartmentDefaultScopeEnabled` 关闭时零行为） | `984c2145a` 的 `CreateIssue` hunks（3413/3500/3591 一带） |
| `server/internal/handler/department_scope.go:121-199` | 收件箱项目创建时把创建者/lead/部门成员写成 `project_member`，并把项目设为 `private` | 同上；保证新的 `requireProjectVisible` 不会把新建打成 400 |
| `server/internal/handler/daemon.go:5488,5584` | 任务用量 `credential_source`（`company`/`personal`，迁移 642） | `c3a9d8fd1` 改的是 `ListTaskMessagesByUser`（另一函数） |
| `server/pkg/db/queries/project_member.sql:64-90` | 部门进退项目的两个查询（`AddDepartmentProjectMembers` / `RemoveDepartmentProjectMember`） | `018107609` 在文件**末尾**追加 `ListAutopilotRunProjectIDs`（`ListIssueProjectIDs` 之后），两段不重叠 |
| `packages/views/locales/*/projects.json` | 品牌行改名 + 末尾 `department` 块 | `d04f104de` 在 `access` 对象里插 `agent_notice` |

空间侧：知识空间按部门过滤在 `server/internal/handler/knowledge_crud.go`（`space_id` 越界答 404）
与 `knowledge_review.go`（部门 lead 可审批）。上游 MUL-8992 完全不碰知识域，因此**这块无交集，不受影响**；
`knowledge_items.acl_mode=project` 仍未强制（ORG-MODEL §5 gap 1），吸这六条也不会改变它的现状。

### 1.4 复核方法（可复现）

```powershell
# 每个提交能否原样落：--cached 拿 index（LF）比对，避开工作区 CRLF
cmd /c "git show --format= --no-color <sha> | git apply --check --cached -v -"

# 冲突文件逐个定性：我们的差异是改名还是真改动
git diff v0.8.2 HEAD -- <file>
# 上游上下文漂移：该提交的父与 v0.8.2 的差
git diff --numstat <sha>^ v0.8.2 -- <file>
```

注意：**不要用 PowerShell 管道喂 `git apply`**——`Set-Content`/管道会按 CRLF 重写 patch，
所有 hunk 都会假失败（我先踩了一次）。用 `cmd /c "... | git apply --check -"`。

## 2. 证据表

| 提交 | 文件 | 增/删 | 交集 | 原样可应用 | 冲突文件 | 冲突性质 |
|---|---|---|---|---|---|---|
| `984c2145a` | 27 | +951/−92 | 19（18 个仅改名） | 19/27 | 8 | **全部 import 块**（首次失败行：28/9/11/9/17/16/17/16） |
| `c3a9d8fd1` | 22 | +1073/−46 | 15（14 个仅改名） | 16/22 | 6 | 4 个 import；`private_project_realtime.go:132` 来自 `018107609`（本批，需先吸）；`search_index.go:287` 来自 `b57d74717`（**不在本批**） |
| `018107609` | 14 | +938/−66 | 11（10 个仅改名） | 11/14 | 3 | 2 个 import；`private_project_test.go:825` 是上游测试漂移（含 3 条本批测试 + 2 条外部提交） |
| `6ccbdd178` | 6 | +250/−1 | 4（全部仅改名） | 4/6 | 2 | `private_project_realtime.go:39`（interface 块）+ 其测试，均为 `018107609` 的漂移 |
| `61f84be54` | 4 | +61/−3 | 2（`issue.go` 含 W2-D 真改动，另一个仅改名） | 3/4 | 1 | 仅测试文件漂移 |
| `e692d03e2` | 6 | +139/−25 | 2（全部仅改名） | 6/6 | 0 | — |
| `9abc71ae9` | 2 | +49/−0 | 2（仅改名） | 2/2 | 0 | — |
| `31f27f16a` | 2 | +94/−12 | 0（文件与 v0.8.2 完全相同） | 2/2 | 0 | — |
| `d04f104de` | 10 | +33/−2 | 10（8 个 locale 有品牌/部门改动） | 9/10 | 1 | `project-access.tsx:2` = 我们的 `@morechat/ui/icons` 改名 |

冲突规模估算：除了 `c3a9d8fd1` 与上游漂移相关的 2 处、`6ccbdd178` 的 2 处，
其余冲突都落在 import 段 1–5 行，合计 **约 40 行手工拼接**。

## 3. 逐提交四段

### 3.1 `984c2145a` fix(server): apply private-project access to indirect issue references (#10327)

**上游做了什么**（27 文件，+951/−92）。把"按 id 猜着访问"的间接引用逐个补上可见性，
拒绝方式统一为"和不存在一样"：

- 重复目标：`requireDuplicateTarget`（400 `duplicate target not found`），在其它字段校验前判，避免用"后面的字段错"反证隐藏 issue 存在；`issue_duplicate.go` 锁内复查仍保留。
- 移动：`MoveIssue` 的目标项目、以及 `before_id` 锚点所在项目（锚点查询多取一列 `project_id`）。
- 表格分组 `parent`：父标题既用于排序键也用于分组上下文 JSON，改成按请求拼接并带 `parentVisible` 谓词（`issue_table_group.go` 的 `sortExpression/contextExpression` 加参）。
- 附件认领：新建/更新 issue 时用 `visibleAttachmentIDs` 过滤掉不可见附件；上传带 `comment_id` 时补 `requireIssueIDVisible`。
- 收件箱项：`loadInboxItemForUser` 对隐藏项目的 item 答 404。
- 列表类：`label` 的 issue 计数、`subscriber` 的订阅 id 列表、`source_context`、搜索索引 `searchIndexIssues`、触发预览 `PreviewIssueTrigger`、视图偏好 `resolvePreferenceScope` 都带 `hidden.Param()` 或 `CanSeeProject`。
- 状态分类填充：`fillStatusCategory` / `newStatusCategoryFiller` 增加 `projectaccess.Hidden` 形参，广播/快照/批量更新都显式传 `Hidden{}`（"不可见"只在按请求拼的地方生效）。

**我们的现状**：同一基座（`requireIssueIDVisible`、`requestHiddenProjects`、`Hidden.Param()` 都在，来自 v0.8.2）。
本批唯一的真改动是 `issue.go:3397-3412` 的 W2-D 部门收件箱块，它正好插在
`// MUL-8472: an issue can only be filed into...` 检查（3413）之前——**顺序正确**：
先决定落到收件箱项目，再做可见性检查；而 `department_scope.go:151-160` 在同一事务里把创建者写成
`project_member`，所以这项检查不会把合法新建打成 400。
`fillStatusCategory` / `newStatusCategoryFiller` 的调用方只在这 8 个上游文件里（`issue.go` 14 处、
`issue_duplicate.go`、`issue_table_rows.go`、`pr_auto_complete.go`、`search_index.go`、`source_context.go`
各 1 处 + 2 个测试），我们没有任何部门文件调用它们，形参变化不会外溢。

**判决：用上游。** 这不是"上游更好"的风格问题，是同一套 MUL-8472 的漏点；部门私有项目正是最容易被猜 id 的对象。

**证据与冲突**：8 个冲突文件全部只冲突在 import 块（`issue.go:28`、`issue_duplicate.go:9`、
`issue_duplicate_originals_test.go:11`、`issue_payload_shape_test.go:9`、`issue_table_query.go:17`、
`pr_auto_complete.go:16`、`source_context.go:17`、`source_context_integration_test.go:16`）。
**替换后必须补回**：这 8 个文件的 import 保持 `github.com/jerry-halo2026/morchat.co/...`；
新增的两个 import（`issue_table_query.go` 的 `projectaccess`、`pr_auto_complete.go` 的 `projectaccess`）
按同样的改名规则加进现有 import 组；`issue.go:3397-3412` 的 W2-D 块**原样保留**（它不在任何 hunk 的上下文里）。

### 3.2 `c3a9d8fd1` fix(server): keep background runs and workspace-wide reads inside private projects (#10329)

**上游做了什么**（22 文件，+1073/−46）。把"工作区级读/后台写"也纳入私有项目：

- wakeup：`service/issue_wakeup.go` 新增 `authorizeRun`（= 原有 `authorize` + 项目守卫：规则创建者与
  agent owner 都必须仍能看 issue 所属项目），`dispatch` 与 `CheckClaim` 都改走它；
  `issue_wakeup_system.go` 在系统规则派发前跑 `Tasks.guardRunProjectAccess`，拒绝时记
  `outcome=none / reason=project_access_blocked` 并消费收据；
  `service/task.go` 的委托失败恢复同样守卫（信号保持 pending，后续 sweep 可恢复）。
- dashboard 六个端点：`dashboardProjectVisible` 把"不可见项目的 `project_id` 过滤"答成空数组，
  工作区总量不因查看者缩小。
- pin：新 `publishPin` 走 `MemberPrivateUserID`（只回本人会话），`listeners.go` 把三个 pin 事件加入
  `memberPrivateEvents`。
- 搜索索引：`GetSearchIndexManifest`/快照/变更集按 `hidden.Param()` 过滤（`queries/search_index.sql` 三处）。
- daemon 侧：新增 `daemonHiddenProjects`（`requestHiddenProjects` 的 daemon 变体——daemon 令牌本身能看到
  全部项目，因为共享 runtime 会跑 owner 看不见的私有项目任务、持有其 workdir；成员自带凭据在这类路由上
  仍按成员收窄），并接到认领响应、`GetIssueGCCheck` / `BatchIssueGCCheck` 的 GC 判定。
- `private_project_realtime.go`：聚合事件的受众按项目判定。
- `service/app_decision.go` 同步守卫。

**我们的现状**：全部为基座版本（仅改名）。`guardRunProjectsAccess` / `ErrProjectAccessDenied` /
`task_project_access.go` 我们已经有（v0.8.2 就有，差 3 行 import），所以新增调用点能直接编译。
两处真实相邻：

- `daemon.go` 我们的 `credential_source` 在 5488/5584，上游改的是 `ListTaskMessagesByUser`（约 6639），不重叠。
- `search_index.go:287` 的 hunk 上下文含 `writeRequestCancellation(...)`，那是 `b57d74717`
  （fix(http): handle canceled read requests consistently，**不在本批**）引入的；我们这里是
  `writeSearchIndexBusy(w)`。这是本批**唯一**外部依赖。

**判决：用上游**，但把 `search_index.go` 这一段标成"需要连带"：要么同时吸 `b57d74717`，
要么手工把 `hidden, ok := h.requestHiddenProjects(...)` + `HiddenProjectIds` 两段挪到我们
`writeSearchIndexBusy` 的版本里（4 行 + 5 行，语义与上下文无关）。

**证据与冲突**：6 个冲突文件；4 个是 import（`daemon.go:30`、`issue_workflow.go:18`、`pin.go:9`、
`issue_wakeup_system.go:11`），2 个是漂移（`private_project_realtime.go:132` 先吸 `018107609` 即解；
`search_index.go:287` 见上）。**补回**：import 改回 morechat 路径；`pin.go` 新增的
`events`/`projectaccess` import 同规则加入。

### 3.3 `018107609` fix(tasks): resolve runs to their private project before showing or stopping them (#10317)

**上游做了什么**（14 文件，+938/−66）。真正把"运行"接到项目上：

- 新文件 `server/internal/projectaccess/task.go`：`TaskQuerier`、`TasksProjects`（批量，最多两条查询：
  issue → 项目、autopilot run → 项目、quick-create 的 `context.project_id/parent_issue_id`）、
  `Hidden.CanSeeProjects`。
- 新查询 `ListAutopilotRunProjectIDs`（`project_member.sql` 末尾）。
- handler：`requireTaskVisible`（`project_access.go`）、`hiddenIssueIDs`（`task_project_privacy.go`），
  并重写 `redactHiddenProjectTasks` 用 `TasksProjects` 一次解析整页；
  接线到 agent 工作列表（`issue_ids` 过滤，`running_task_count` 保留）、squad 成员状态
  （`active_issues` 过滤）、`CancelTaskByUser`、`ListTaskMessagesByUser`、`daemon`、`chat`、realtime 受众。

**我们的现状**：基座版本；`redactHiddenProjectTasks` 仍只按 `task.IssueID` 判，
所以"无 issue 的 run"（autopilot run-only、quick-create）在运行列表里对无权限者是**可读的**。
`project_member.sql` 我方新增的部门两查询在 64-90 行，上游追加在文件末尾，互不影响。
生成文件 `project_member.sql.go` 是两边都动（我方 +91/−1），**必须以 sqlc 重生成覆盖，不能取上游版本**。

**判决：用上游。** 这是六条里结构性最强的一条：后续 `6ccbdd178` 的派发守卫就调用它引入的解析结果。

**证据与冲突**：3 个冲突文件——`private_project_realtime.go:13`（import）、`task_project_privacy.go:5`（import）、
`private_project_test.go:825`（上游测试漂移）。**补回**：两个 import 改回 morechat 路径；
`project_member.sql` 保留我们的部门两查询，再追加 `ListAutopilotRunProjectIDs`；跑 `make sqlc` 重生成。

### 3.4 `6ccbdd178` fix(autopilots): keep autopilots on a private project inside it (#10320)

**上游做了什么**（6 文件，+250/−1）：

- `ListAutopilots` 过滤不可见项目；`loadAutopilotInWorkspace`、`DeleteAutopilot`、
  `DeleteAutopilotTrigger` 增加 `requireProjectVisible`（都答"autopilot not found"）。
- 派发前 `guardAutopilotProjectAccess`：刷新 autopilot，解析 leader 与"这次运行为其执行的真人"
  （点"立即运行"的成员 → 触发器所有者 → agent owner），要求三者都能看该项目；不允许时按
  `errDispatchSkipped{code: project_access_blocked}` 跳过（`create_issue` 不再先建 issue 再被拒）。
- realtime：`autopilot:*` 事件从 payload 取 `project_id`，或按 `autopilot_id` 回查（新
  `GetAutopilot` 进 `audienceQuerier`），把事件锁在私有项目内。

**我们的现状**：基座版本；`ReasonProjectAccessBlocked`（v0.8.2 已有）、`handleDispatchSkip`、
`resolveAutopilotLeader`、`ResolveAutopilotTriggerPrincipal`、`TaskSvc.guardRunProjectsAccess` 都在，
所以这条能直接落。

**判决：用上游**，但它是本批唯一带**产品语义变化**的：部门私有项目 + agent owner 不在项目的自动运行会
变成 `skipped(project_access_blocked)`。我们目前只把部门成员/lead/创建者写进 `project_member`，
不写 agent owner。见 §5.3。

**证据与冲突**：2 个冲突（`private_project_realtime.go:39` 的 interface 块、其测试 :98），
都是 `018107609` 造成的上下文漂移——**先吸 3.3 再吸本条即消失**。补回：无额外内容，仅 import 改名。

### 3.5 `61f84be54` fix(issues): keep private sub-issues out of sub-issue progress counts (#10312)

**上游做了什么**（4 文件，+61/−3）：`ChildIssueProgress` 查询加
`AND (narg('hidden_project_ids') IS NULL OR project_id IS NULL OR NOT (project_id = ANY(...)))`，
handler 传 `hidden.Param()`，并加回归测试（父 issue 的进度不再把隐藏子任务算进去）。

**我们的现状**：`pkg/db/queries/issue.sql` 与 `v0.8.2` 完全相同，`issue.go` 只差 W2-D 块（另一函数）。

**判决：用上游。** 一条查询 + 一个调用点；不吸则是"用计数侧漏"。

**证据与冲突**：唯一冲突是 `private_project_test.go:824`（上游测试追加处漂移，含 `e692d03e2`/`018107609`
与两条**不在本批**的提交 `2f3afce6c`、`f4dc21c2b`）；生产代码零冲突。**补回**：无；测试文件按 §5.4 处理。

### 3.6 `e692d03e2` fix(wakeup): keep private-project issues out of the workspace wakeup lists (#10282)

**上游做了什么**（6 文件，+139/−25）：`wakeup.sql` 的 `ListWorkspaceWakeups` / `ListPausedWakeupIssues`、
`workspace_wakeup.sql` 的两段 UNION 各加同一谓词；handler 三处传 `hidden.Param()`（含 `ListWorkspaceWakeupSummaries`）。

**我们的现状**：四个 sql 文件与 `v0.8.2` 完全相同；`issue_wakeup.go` 仅改名（2 行）。

**判决：用上游。** `git apply --check` 对该提交 **6/6 全通过**，是本批最省事的一条。

**证据与冲突**：0 冲突。唯一注意点：`workspace_wakeup.sql` 第二段 UNION 用的是父 issue 别名 `p`，谓词照抄即可。

### 3.7 `9abc71ae9` fix(daemon): clear the client user id on daemon-token requests (#10333)

**上游做了什么**：`server/internal/middleware/daemon_auth.go` 在清 `X-Agent-ID`/`X-Task-ID` 的同一段加
`r.Header.Del("X-User-ID")`，并加 `TestDaemonAuth_StripsClientSuppliedUserID`（`mdt_` 令牌路径必须为空，
PAT 路径仍由中间件自己写）。2 文件 +49。

**我们的现状**：同文件只差 2 行 import；我们**没有**等价防护——`requestUserID` 会读到客户端自带的值。

**判决：用上游**（与 R3 §2.1 结论一致，不重复论证）。归属上它在本批是因为"权限/安全"，实施上归 R3 那批。

**证据与冲突**：`git apply --check` 全通过，**零冲突**，只需 import 改名（本 hunk 不碰 import）。

### 3.8 `31f27f16a` fix(auth): skip session renewal for credentials that are not sessions (#10297)

**上游做了什么**：`packages/core/platform/session-renewal.ts` 新增
`isRenewableSessionToken`（三段、每段 `[A-Za-z0-9_-]+`），在 `renew()` 读 `multica_token` 后提前返回；
测试覆盖 PAT/`mat_`/`mcn_`/垃圾值。动机：本地 dev 用 PAT 登录浏览器时，每次加载都打
`/api/auth/refresh` 拿 400，并在 Next dev overlay 里报错。

**我们的现状**：`session-renewal.ts` / `.test.ts` 与该提交的父**完全相同**（`git diff v0.8.2 HEAD` 为空），
说明我们没碰过这个文件，现有行为与上游改前一致（同样会 400）。

**判决：用上游。** 纯客户端、零冲突；顺带减少我们 dev 环境的噪音。

**证据与冲突**：`git apply --check` 全通过。无需补回。

### 3.9 `d04f104de` MUL-9152: Explain agent owner access in private projects (#10496)

**上游做了什么**：`project-access.tsx` 在 `visibility === "private"` 时把 `admin_notice` 和新的
`agent_notice` 一起显示（`Bot` 图标），8 个 locale 各加 1 个 `access.agent_notice` 键，测试加 1 例。

**我们的现状**：`project-access.tsx` 只差 13 行 import（`@morechat/*`）；`access` 块 key 与上游一致
（`label/title/description/admin_notice/...`）；locale 文件保留了 0.8.2 文案 + 我们的品牌行 + 末尾 `department` 块。
`Bot` 图标在 `packages/ui/icons` 里**已导出**（`export const Bot = createIcon("Bot", glyph.Bot)`）。

**判决：上游+小补。** 8 个 locale 的 patch 可以原样落（`git apply --check` 9/10 通过）；
`project-access.tsx` 需要把 import 行改成 `import { Bot, Globe, Lock, Shield, UserPlus, X } from "@morechat/ui/icons";`
——**这一行是我们唯一要补的**（hunk 2 的 JSX 不受影响）。

**证据与冲突**：唯一冲突 `project-access.tsx:2` = 我们的包名改名，1 行。
文案层面留一个产品问题给 Lead，见 §5.6。

## 4. 建议的落地顺序

1. `31f27f16a`（零冲突）→ 2. `9abc71ae9`（零冲突）→ 3. `e692d03e2`（零冲突）→ 4. `61f84be54`
（1 个测试冲突）——这四条可以先走，验证"改名 + 上游 patch"流程。
5. `984c2145a`（8 处 import；独立，无前置）——**优先级最高**，因为它补的正是可猜 id 的读路径。
6. `018107609`（新文件 + sqlc 重生成）→ 7. `6ccbdd178`（依赖 6）。
8. `c3a9d8fd1`（依赖 6/7 的 `private_project_realtime.go`；`search_index.go` 需 §5.2 的裁决）。
9. `d04f104de`（locales 手工 8 键 + tsx 1 行，可随时做）。

工程约束：

- 本批**没有任何迁移**（全部是查询/生成代码 + 前端），迁移号不用重排；`sqlc` 重生成会整目录覆盖
  `server/pkg/db/generated/*`，必须由单一 agent 串行执行，且执行前确认工作树只有本批改动。
- 冲突全是"改名 vs 上游"，建议统一用 `git apply --3way` 落地后按本报告 §3 逐条补回 import，
  而不是逐 hunk 手抄。

## 5. 需要 Lead 裁决

1. **SEAMS 过期表述**：§私有项目 声称私有项目自研、上游没有；`v0.8.2` tag 里 630/631/632 与
   `projectaccess/` 都在。是否修订（影响 drift 门禁的白名单依据，也影响本批的优先级叙事）。
2. **`c3a9d8fd1` 的外部依赖 `b57d74717`**：连带吸（改动 `search_index.go` 的错误分支语义），
   还是手工挪 9 行（保留我们的 `writeSearchIndexBusy`）？我倾向后者：本批不引入"读请求取消处理"的整体重构。
3. **`6ccbdd178` 的派发 skip 语义**：部门私有项目里，若 autopilot 的 agent owner 不是部门成员，
   上游会让运行直接跳过。我们要 (a) 照上游，(b) 派发时自动把 agent owner 加进部门项目成员，
   还是 (c) 这条先不吸？这是产品决定，不是技术冲突。
4. **上游测试文件的漂移**：`private_project_test.go` 夹着两条不在本批的提交（`2f3afce6c` PR 列表、
   `f4dc21c2b` 长历史性能）。照抄整文件会引入无关行为；建议只取本批新增用例，按我们的代码改写断言。
5. **执行人**：本批 9 条里 6 条动 `server/`、2 条只动前端；建议 `server/` 部分单 agent 串行（含 sqlc），
   前端两条可并行。
6. **文案**：`agent_notice` 原文是"Agents follow their owner's access…"。我们的部门收件箱默认
   `private`，这条提示会长期出现在部门项目面板上——是否需要按部门模型改写（例如指出"部门成员/负责人"）。

## 6. 本报告没做的事

- 没改任何代码/配置/文档（除本文件），没跑 `go test`、`make`、`sqlc`、`docs-map`；
- 没有实际应用任何 patch（只用 `git apply --check --cached` 做只读可行性判定，未写 index/工作区）；
- 没有评估六条里的**测试**是否在我们的数据库/夹具下通过（那要等真正落地时跑）。

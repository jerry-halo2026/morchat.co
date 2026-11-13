---
purpose: 上游 v0.9.0（v0.8.2..v0.9.0）任务与工作流提交的逐项调研与取舍判决
owner: lead
status: reference
updated: 2026-11-13
related: [docs/engineering/ORG-MODEL.md, docs/upstream/SEAMS.md, docs/upstream/DRIFT-BASELINE.md, docs/upstream/research/0.9.0/r3-runtime.md]
---

# 上游 0.9.0 调研 R2：任务与工作流

只读调研：全程只有 `git log/show/diff/ls-tree/cat-file/grep`，没有改代码、没有跑测试、没有起服务。
区间 `v0.8.2..v0.9.0` 共 162 个提交，本文件只覆盖与 issue / 项目 workflow / inbox 相关的 11 个。
与 R1 重叠的私有项目权限矩阵不复述，这里只回答"用户看得见什么变了、我们要不要吸、吸了和部门模型打不打架"。

## 0. 结论速览

| 提交 | 主题 | 性质 | 判决 |
|---|---|---|---|
| `7cae26303` | 项目 workflow 入口合并成一个 flow panel | 体验 | **吸**（前端，8 locale + 4 组件；冲突仅改名） |
| `984c2145a` | 私有项目的**间接** issue 引用补闸门 | 安全 | **必吸**（我们只补到了直接引用那一层） |
| `61f84be54` | 私有子任务不计入子任务进度 | 安全/正确性 | **必吸**（1 handler + 1 SQL） |
| `e692d03e2` | 私有 issue 排除出 workspace wakeup 列表 | 安全 | **必吸**（3 handler + 2 SQL） |
| `6ccbdd178` | autopilot 关在所属私有项目里 | 安全 | **必吸**（3 处 handler + dispatch 前置校验 + 实时 audience） |
| `4dc251a47` | inbox 条目确认删除 | 体验 | **吸**（新端点，无迁移；先后顺序见 §4.3） |
| `a0371ab2c` | 新增 `issue.requester_user_id`，"我创建的"含 agent 代建 | 正确性 | **上游+小补**（要迁移重编号 + sqlc；requester 解析要覆盖我们自己的代建路径） |
| `e6c3ef3d8` | 详情页在 agent 创建者下面显示发起人 | 体验 | **吸**（依赖上一条；1 key × 8 语） |
| `bd96495d7` | Agent 状态筛选新增 Idle | 体验 | **吸**（小；互斥逻辑要看持久化合并） |
| `4e457b406` | "我的 agent 的活"在筛选与侧栏同一语义 | 正确性 | **吸但要设计**（新增 `/api/squads/involved`，侧栏全走 table query） |
| `eea447533` | 订阅整个项目的 issue | 体验 | **吸但要决策**（迁移号撞车；部门收件箱是否默认订阅是产品问题） |

一句话：**五个安全修复全部要吸，而且它们不是"锦上添花"——部门收件箱默认是私有项目，这些闸门在部门模型下是主路径。前端五个提交里四个可以直接落，只有 `4e457b406` 要重做设计。**

## 1. 复核方法（可复现）

```powershell
git rev-list --count v0.8.2..v0.9.0                                  # 162
git log --oneline -S "<符号名>" v0.8.2..v0.9.0 -- <file>              # 找依赖提交
git show <sha> --stat --oneline                                      # 触碰面
git show <sha> -- <file>                                             # 语义 diff
# 判定"能不能直接落"：把我们的文件与提交的父版本按改名归一后比对
git show HEAD:<path>; git show <sha>^:<path>                        # 把 multica↔morechat 归一后逐字比
```

另有两条机械检查贯穿全文：

- 每个提交是否已经在我们的历史里：`git merge-base --is-ancestor <sha> HEAD`——11 个全部 **MISSING**，即都没吸过。
- 迁移号是否撞车：见 §2.3。

## 2. 我们的现状：四个事实

### 2.1 `server/` 侧相对 `v0.8.2` 只有"改名 + 部门增量"

以本次会碰到的文件为例，去掉 `github.com/multica-ai/multica` → `github.com/jerry-halo2026/morchat.co`
之后剩下的真实差异只有一处：`server/internal/handler/issue.go` 的部门收件箱块
（`issue.go:3397-3412`，30 行含注释）。`issue_workflow.go`（+12）、`issue_table_query.go`（+4）、
`autopilot.go`（+12）、`inbox.go`（+6）、`issue_wakeup.go`（+4）的 `git diff v0.8.2 HEAD` **全是 import 行**。

结论：上游 Go 补丁落下来基本只有 import 冲突；真正的冲突来源是**我们已改过的 `issue.go` 创建路径**和 **sqlc 产物**。

### 2.2 `packages/views|core` 侧同理，差异是改名 + BOM + 属性顺序

`git diff -U0 v0.8.2 HEAD -- packages/views/{issues,workflows,inbox,projects} packages/core/{issues,inbox}`：
4295 行变更里 **4035 行是包名/BOM**，剩下约 260 行是 `<ActorAvatar actorType=... size=...>` 这类
JSX 属性顺序（prettier）。抽查四对文件（`project-workflow-menu.tsx`、`project-workflow-row.tsx`、
`filter.ts`、`sidebar-list.ts`）与各提交的父版本，归一后**逐字相同**；
`project-detail.tsx`、`service/autopilot.go` 的差异也只是属性顺序与 import 块。

结论：前端提交的 patch 我们基本能原样落，冲突面是 import 行与 8 个 locale 的 key 插入位置。

### 2.3 迁移号从 637 起分叉，所有带迁移的上游提交必须重编号

| 号段 | 我们 | 上游 v0.9.0 |
|---|---|---|
| 637–642 | `wiki_knowledge`、`knowledge_items_space`、`gateway_credentials`、`knowledge_space_fk_tighten`、`knowledge_import`、`task_usage_credential_source` | `issue_environment_kind` … `issue_environment_config_issue_idx` |
| 643–644 | `user_password`、`builtin_agent_display_name` | `issue_requester`、`issue_requester_index` |
| 645–652 | `department`、`org_columns`、部门/知识索引、`knowledge_review`、`knowledge_stale_idx` | `issue_member_creator_index`、`theme_store_download`、`project_subscriber`、`project_subscriber_user_idx`、`task_context_receipt`…、`runtime_profile_add_droid` |
| 653+ | 空 | `chat_submission_receipt`… |

我们当前最高是 `652_knowledge_stale_idx`（工作区里另有 645–650 的未提交 `department` 系列）。
所以 `a0371ab2c` 的 643/644/645 与 `eea447533` 的 647/648 **一律要重排到 653 之后**，并按仓库规则把
`CONCURRENTLY` 索引登记进 `server/cmd/migrate/main.go` 的两个 cleanup 表（上游这两个索引提交已经这么做了，照抄结构即可）。

### 2.4 私有项目基础设施我们已经有了（MUL-8472 在树上）

`server/internal/projectaccess/`（`Hidden` 类型 + `Hidden.Param()`）、`requestHiddenProjects`
（`server/internal/handler/project_access.go:72`，27 处调用）、`requireProjectVisible`（`:90`）、
`requireIssueIDVisible`（`:105`）、`guardRunProjectsAccess`（`server/internal/service/task_project_access.go`）、
`dispatch.ReasonProjectAccessBlocked`（`server/internal/dispatch/reason.go`）都在。

结论：R2 的四个安全提交**不是重写，是补漏**——依赖齐全，改动都很小。

## 3. 逐提交四段

### 3.1 `7cae26303` 项目 workflow 入口合并成 flow panel

- **上游做了什么**：项目标题菜单里那条三级 Workflow 子菜单和侧栏的 Workflow 下拉各自带一份"工作流列表 +
  切换对话框 + Manage 链接"，现在两处都只打开同一个 `ProjectWorkflowSheet`：面板里有列清单、每列 handoff
  表单（与列头同一个）、切换下拉与去设置的入口，各出现一次。侧栏行对**所有成员**可点，看不到切换权限的人
  也能读整条流程。`ProjectWorkflowControl` 从"自己的下拉 + 自带 dialog"退化成受控按钮（`onOpen`），
  新增 `ProjectWorkflowMenuItem` 做菜单项，`project-workflow-menu.tsx` 整体被 `project-workflow-sheet.tsx` 取代。
  14 文件 +281/−262（含 8 locale 7 行）。
- **我们的现状**：`project-workflow-menu.tsx:45` 仍是 `ProjectWorkflowMenuHost`，
  `project-detail.tsx:537/614` 仍用它包住 `renderHeader`；`project-workflow-row.tsx:160` 的
  `ProjectWorkflowControl` 仍自带下拉与 dialog。与 `7cae26303^` 归一后**逐字相同**。
- **判决**：**吸**。纯前端、无迁移、无接口变化，`useWorkflowPermissions` 两参签名我们已有
  （`packages/views/workflows/permissions.ts` 与上游同版）。
- **证据与冲突**：`packages/views/workflows/{project-workflow-menu→project-workflow-sheet}.tsx`（+236）、
  `project-workflow-row.tsx`（+83/−…，−64 行下拉）、`projects/components/project-detail.tsx`（153 行）、
  8 个 `locales/*/issues.json`（各 7 行）。冲突面：`morechat` 改名 + `project-detail.tsx` 的属性顺序，
  落 patch 时手工挑 hunk。

### 3.2 `984c2145a` 私有项目的间接 issue 引用（只评用户可见面）

- **上游做了什么**：把"通过另一个 id 摸到 issue"的路径全部补上 `loadIssueForUser` 已有的私有项目闸门：
  重复标记的目标（先查存在与可见，再校验其它字段，避免两条错误信息泄漏"存在"）、`duplicate_of`
  在**每个读者**的响应里省略看不见的原件、`comment_id` 上传、`attachment_ids`、表格父行分组、
  source context 的 live 源、inbox 条目的 read/unread/archive（`handler.go` 的 `loadInboxItemForUser` 加
  `requireIssueIDVisible`）、`subscribed issue ids` 与 label 用量计数、move anchor、view-preference 的项目范围、
  preview-trigger。27 文件 +951/−92（两个新测试文件占 614 行）。
- **我们的现状**：直接引用已经覆盖（`issue_duplicate.go:140` 的 `ListIssueDuplicates` 调了
  `filterVisibleIssues(hidden, rows)`）；缺的正是"间接"这一层：
  `handler.go:1264` 的 `loadInboxItemForUser` 只校验 `recipient_id`，**没有**项目可见性；
  `newStatusCategoryFiller`（`issue.go:370`）签名是 `(ctx, wsID, originals ...pgtype.UUID)`，
  上游这次才加上 `hidden projectaccess.Hidden` 参数，因此单条 issue 响应里的 `duplicate_of` 仍会带出隐藏原件；
  `issue_table_group.go`、`label.go`、`source_context.go` 都没有 `requestHiddenProjects`。
- **判决**：**必吸**（R1 已经把权限矩阵算过，这里只记"用户可见"的判定：inbox 条目会被越权打开并改状态、
  重复原件标题会漏出去、表格按父 issue 分组会显示看不见的父标题与状态）。
- **证据与冲突**：`server/internal/handler/{handler.go:1264, issue_duplicate.go, issue.go:370, issue_table_group.go,
  issue_table_query.go, label.go, source_context.go, project_access.go}`。与我们 `issue.go` 的部门块**不冲突**
  （部门块在 `CreateIssue`，本提交在 `ListIssues` 响应与 filler）。我们的 `subscriber.go` 目前**没有**
  `SubscribedIssueIds` 端点，所以那一半是 N/A，若日后吸订阅端点要自带 hidden 谓词。

### 3.3 `61f84be54` 私有子任务不计入子任务进度

- **上游做了什么**：`ChildIssueProgress` 查询加 `hidden_project_ids` 参数与"`project_id IS NULL` 或不在隐藏集合"
  谓词，handler 先取 `hidden` 再传 `hidden.Param()`。4 文件 +61/−3。
- **我们的现状**：`issue.go:2727` 的 handler 直接传 `{WorkspaceID, TerminalStatusKeys}`；
  `server/pkg/db/queries/issue.sql:722` 的 `ChildIssueProgress` 没有 `hidden_project_ids`。
  即：别人看不见的私有子任务，仍会以计数形式出现在进度条里。
- **判决**：**必吸**。1 个 SQL 谓词 + 1 个 handler 入参 + `make sqlc`。
- **证据与冲突**：`server/pkg/db/queries/issue.sql:722-731`、`server/internal/handler/issue.go:2727-2740`、
  `server/pkg/db/generated/issue.sql.go`。冲突面：sqlc 产物全量重生成（我们 637 起迁移分叉，
  但本提交无迁移，重生成只影响该查询）。

### 3.4 `e692d03e2` 私有 issue 排除出 workspace wakeup 列表

- **上游做了什么**：`ListWorkspaceWakeups`、`ListWorkspaceWakeupSummaries`、`ListPausedWakeups`
  三个 workspace 级列表（不经过 issue loader，因此从来没有跑过私有项目闸门）都加 `hidden.Param()`，
  `wakeup.sql` / `workspace_wakeup.sql` 各加同一条谓词。6 文件 +139/−25。
- **我们的现状**：`issue_wakeup.go:18 / :159 / :470` 三个 handler 都没有 `requestHiddenProjects`；
  `wakeup.sql` 无 `hidden_project_ids`（`grep` 0 命中）。泄漏面是私项目 issue 的**标题、标识、规则条件**
  （列表）与 issue id（summaries / paused）。
- **判决**：**必吸**。与 3.3 同一批做，同样是"handler 取 hidden + SQL 谓词 + sqlc"。
- **证据与冲突**：`server/internal/handler/issue_wakeup.go`、`server/pkg/db/queries/{wakeup,workspace_wakeup}.sql`。
  冲突面：`issue_wakeup.go` 我们只有 import 改名；`workspace_wakeup.sql` 的 JOIN 结构未变，谓词插在 `WHERE` 尾即可。

### 3.5 `6ccbdd178` autopilot 关在所属私有项目里

- **上游做了什么**：三层。①`loadAutopilotInWorkspace` 对隐藏项目的 autopilot 按"不存在"回答，
  列表 `ListAutopilots` 过滤掉；②`dispatchAutopilotRun` 在执行**任何副作用之前**用
  `guardAutopilotProjectAccess` 校验"这次运行为之服务的人 + 执行 agent 的 owner"都能看见项目，
  不能则以 `project_access_blocked` 跳过（此前 `create_issue` 会先把 issue 建进项目再被拒，`run_only` 完全不校验）；
  ③autopilot 实时事件只发给项目受众。6 文件 +250/−1（含 143 行测试）。
- **我们的现状**：`autopilot.go:439` 的 `ListAutopilots`、`:596` 的 `loadAutopilotInWorkspace`、
  `DeleteAutopilot`、`DeleteAutopilotTrigger` 均无项目闸门；`service/autopilot.go` 的 `dispatchAutopilotRun`
  没有项目校验。依赖齐备：`guardRunProjectsAccess`、`ReasonProjectAccessBlocked` 都在（§2.4），
  缺的只是 `guardAutopilotProjectAccess` 这个组合函数。
- **判决**：**必吸**。这是本次调研里与部门模型关系最紧的一条：部门里 autopilot 天然绑定部门收件箱
  （私有项目），不吸就会"替一个已经看不见这个项目的人继续跑"。
- **证据与冲突**：`server/internal/handler/autopilot.go:439/596`、`server/internal/service/autopilot.go`、
  `server/cmd/server/private_project_realtime.go`。冲突面：`service/autopilot.go` 我们比父版本多 266 字节
  （import 块重排 + 少量本地增量），落 patch 时要人工确认 `dispatchAutopilotRun` 的入口没有被本地改动过。

### 3.6 `4dc251a47` inbox 条目确认删除

- **上游做了什么**：新增 `DELETE /api/inbox/{id}`（`DeleteInboxItem`）：先 `loadInboxItemForUser`
  再 `requireIssueIDVisible`，然后用 `DeleteInboxGroup` 只删"当前视图同一 `archived` 状态"的那一组
  （`item.id = target.id OR item.issue_id = target.issue_id`），所以删活跃行不会连归档历史一起抹掉，
  也不会被更老的兄弟条目"复活"；发 `inbox:deleted` 事件（带 recipient，只有本人刷新）；前端
  `useDeleteInbox` + `InboxDeleteDialog`（AlertDialog，区分活跃/归档/非 issue 三种文案）+ 右键菜单 danger 项 + 8 locale + mobile 缓存刷新。
- **我们的现状**：`router.go` 的 `/api/inbox` 只有 `read / unread / archive / unarchive`；
  `packages/core/api/client.ts` 无 `deleteInbox`，`packages/core/inbox/mutations.ts` 无 `useDeleteInbox`
  （`grep` 0 命中）；`packages/core/inbox/mutations.ts` 与提交父版本归一后逐字相同 → 前端可原样落。
- **判决**：**吸**，但**排在 3.2 之后**：删除是最"硬"的写路径，必须先让 `loadInboxItemForUser` 具备
  项目可见性闸门（3.2 的 `handler.go` 改动），否则删条目会成为唯一绕过私有项目的 inbox 写入口。
- **证据与冲突**：`server/internal/handler/inbox.go`、`server/pkg/db/queries/inbox.sql`（+16，`DeleteInboxGroup`）、
  `server/pkg/protocol/events.go`、`packages/core/{api/client.ts, inbox/mutations.ts}`、
  `packages/views/inbox/components/inbox-delete-dialog.tsx`（新 83 行）。无迁移。与我们部门工作**无代码冲突**。

### 3.7 `a0371ab2c` 直接请求 agent 的 issue 计入"我创建的"（requester）

- **上游做了什么**：新增列 `issue.requester_user_id`（迁移 643）+ 两个索引（644 `(workspace_id, requester_user_id)`
  where not null、645 `(workspace_id, creator_id)` where `creator_type='member'`）；`service/issue.go` 在
  `origin_type ∈ {quick_create, agent_create}` 且 creator 是 agent 时用 `ResolveIssueRequester` 反查真人写进去；
  `IssueResponse.RequesterID` + 四处投影 + `ListIssues` 的 `created_by_user_id` 参数与
  `created_by_user_id` 回显 + `GroupedIssuesResponse` 带 `created_by_user_id`；客户端
  `issueMatchesListFilter` 与 `filter.ts:400` 的 `case "created"` 改成"member 创建 → creator；agent 创建 → requester"；
  issue-views、表格、mobile、CLI 投影同步。~39 文件。
- **我们的现状**：`requester_user_id` **不存在**（`grep` 0 命中）；`filter.ts:400` 仍是
  `issue.creator_type === "member" && issue.creator_id === context.userId`；`membership.ts` 无
  `created_by_user_id` 分支。
- **判决**：**上游 + 小补**。小补两处：
  ①迁移重编号 653/654/655（§2.3），索引按仓规登记 `concurrentIndexCleanups`；
  ②`ResolveIssueRequester` 的覆盖面要按我们的代建路径复核——上游只认 `quick_create` / `agent_create` 两种 origin，
     而我们还有"agent 在 issue 评论里被 @ 后建子任务""部门收件箱里 agent 代建"等路径，缺哪种就会让成员在
     "我创建的"里看不到自己让 agent 干的任务。
- **证据与冲突**：`server/migrations/643_issue_requester.up.sql`（1 行）、`server/internal/service/issue.go`
  （`createOnce` 的 `RequesterUserID` 入参）、`server/internal/handler/issue.go`（`IssueResponse` 与
  `buildSearchQuery`/`ListIssues`/`issueCreatedByUserPredicate`）、`packages/views/issues/utils/filter.ts:400`。
  冲突面：`issue.go` 我们已有部门块（`CreateIssue`），本提交改的是列表与响应，**位置不重叠**；
  但 sqlc 产物要全量重生成，且上游的 `645_issue_member_creator_index` 与我们已有的 `645_department` 撞号。

### 3.8 `e6c3ef3d8` 在 agent 创建者下面显示发起人

- **上游做了什么**：详情侧栏"创建者"一行在 `creator_type === "agent"` 且有 `requester_id` 时，第二行显示
  发起人（`AppLink` → 成员详情 + `HoverCard` 名片）；活动流里 agent 的 `created` 条目文案改成
  "代 X 创建"；`PropRow` 增加 `className` 以便 `items-start py-1.5`。11 文件 +125/−7（1 key × 8 locale）。
- **我们的现状**：`issue-detail.tsx` 与提交父版本归一后只差属性顺序；`packages/views/members/member-profile-card.tsx`
  与 `paths.memberDetail`（`packages/core/paths/paths.ts:87`）都在，依赖齐备；locale 里 `created_on_behalf_of` 尚不存在。
- **判决**：**吸**，作为 3.7 的尾巴一起做（没有 `requester_id` 时整段不渲染，所以也可以先合这条、后合 3.7，
  只是这段时间不生效）。
- **证据与冲突**：`packages/views/issues/components/issue-detail.tsx`（+44）、`packages/views/common/prop-row.tsx`（+11）、
  8 个 `locales/*/issues.json`（各 1 key）。无冲突。

### 3.9 `bd96495d7` Agent 状态筛选新增 Idle

- **上游做了什么**：`agentIdleFilter` 成为独立筛选维度，与 `agentRunningFilter` **互斥**（打开一个关另一个），
  进 `FilterSnapshot` / `IssueViewState` / 持久化 / `mergeViewStatePersisted`（旧快照里 running 为真时 idle 强制 false）；
  表格 `IssueTableFilters.idle_only`，客户端 `filter.ts` 用 `activeIssueIds` 判定（未解析时整体不命中）；
  实时同步在"有在飞的任务事件"后刷新 idle 快照。~34 文件；服务端只动 `issue_table_query.go` 与 `issue_table_facets.go`。
- **我们的现状**：`agentRunningFilter` 在（`view-store.ts` 9 处），`idle_only` 不存在；
  `issue_table_query.go` 与 v0.8.2 只差 import。
- **判决**：**吸**（产品上"谁现在没活"是排产常用视角）。注意 `mergeViewStatePersisted` 的兼容写法要照抄，
  否则老用户本地快照会把 idle 和 running 同时点亮。
- **证据与冲突**：`packages/core/issues/stores/view-store.ts`、`packages/views/issues/utils/filter.ts`、
  `packages/core/types/api.ts`、`server/internal/handler/issue_table_query.go`、8 locale（各 1 key）。无迁移。

### 3.10 `4e457b406` "我的 agent 的活"在筛选与侧栏只有一个含义

- **上游做了什么**：①`my_agents` 关系筛选与 "My agents' work" 作用域改成同一集合（我拥有的 agent 的 issue +
  我或我的 agent 所在 squad 的 issue）；②侧栏项目列表**所有** assignee 设置都走 table query，删掉
  `ListIssuesParams` 那条旧路径；③内置视图不再套用"项目专用"的 assignee 设置（作用域已经说了算）；
  ④新增 `GET /api/squads/involved`（`squad.sql` 查询 + `squad.go` handler + router），客户端
  `useInvolvedSquads` 把 squad 行从"未解析"变成精确判定。~43 文件。
- **我们的现状**：`sidebar-list.ts`、`queries.ts`、`filter.ts` 与 v0.8.2 逐字相同；
  `squads/involved` 不存在；`isSidebarTableRequest` 仍在（2 处）。
- **判决**：**吸但要设计**。它动的是"侧栏用什么端点取数"，而部门模型的侧栏是部门视图的门面：
  吸之前要确认 table 端点的 hidden 谓词仍然生效（我们在 `issue_table_query.go` 里已有 1 处
  `requestHiddenProjects`），否则侧栏全改走 table 会把"部门私有项目的可见性"压在一个端点上。
  另需产品确认：内置视图不再套项目 assignee 设置，会让部门收件箱的默认视角变化。
- **证据与冲突**：`packages/core/issues/{sidebar-list.ts, queries.ts}`、`packages/views/issues/utils/filter.ts`、
  `packages/views/layout/panels/{sidebar-tree.tsx, sidebar-settings.tsx}`、`server/internal/handler/{squad.go,
  issue_table_query.go}`、`server/pkg/db/queries/squad.sql`、8 locale（`issues.json` 6 行 + `layout.json` 1 key）。无迁移。

### 3.11 `eea447533` 订阅整个项目的 issue

- **上游做了什么**：新表 `project_subscriber`（迁移 647 + 648 用户索引）+ `GET/PUT/DELETE
  /api/projects/{id}/subscription`；issue 通知的 fanout 在 issue 级之后再加"项目订阅者"，新 issue 产生
  `issue_created` 类型的 inbox 条目；`ListProjectSubscribersForIssue` 里已经带**私有项目可见性**
  （`visibility <> 'private'` 或 admin 或 `project_member`）与"逐 issue 退订优先"的规避；项目删除 / 成员移除 /
  工作区删除都有清理；前端项目标题菜单加"订阅全部 issue / 取消订阅"、`issue-detail` 加"继承自项目"徽标与提示、
  `inbox-detail-label` 加新类型、mobile 同步。~70 文件。
- **我们的现状**：`project_subscriber` 不存在（`grep` 0 命中）；`subscriber.go` 只有 issue 级订阅；
  `inbox_archive.sql` / `workspace_delete.sql` 都没有项目订阅清理。
- **判决**：**吸但要决策**，两件事必须先定：
  ①迁移重编号（647/648 → 656/657 之后），并登记两个 concurrent index cleanup；
  ②**是否让部门收件箱可订阅**。项目订阅的语义是"这个项目里每件新事都通知我"，而部门收件箱是
     部门所有人的默认落点——一旦被订阅，等于给全部门再发一遍 inbox。建议：功能照吸，但在部门收件箱项目上
     隐藏该菜单项/服务端拒绝（或至少不默认订阅），否则与"部门收件箱"设计打架。
- **证据与冲突**：`server/pkg/db/queries/project_subscriber.sql`（67 行）、`server/internal/handler/project_subscriber.go`、
  `server/migrations/647..648`、`server/internal/handler/{project.go, subscriber.go, workspace_revoke.go}`、
  `packages/core/projects/{queries,mutations}.ts`、`packages/views/issues/components/issue-detail.tsx`（+13）。
  好消息：上游这条 SQL 的可见性谓词与部门模型同构（private + `project_member` + admin），**不需要我们再补一道**。

## 4. 与"部门默认范围 + 部门收件箱"的冲突

### 4.1 前提：部门收件箱是私有项目

`server/internal/handler/department_scope.go:197` 把自动建的部门项目标成
`projectaccess.VisibilityPrivate`，lead 是部门负责人，成员是本部门名单；`issue.go:3397` 让**没有项目的普通
issue** 落到它上面（开关 `department_default_scope`，默认关，见 `featureflags/keys.go:93`）。

这意味着：**开关一开，"私有项目"从少数场景变成所有 issue 的默认容器**。R2 里四个"私有项目补漏"的提交
（3.2–3.5）因此从"防御性加固"升级为"主路径必须正确"。

### 4.2 冲突点清单

| # | 冲突 | 相关提交 | 结论 |
|---|---|---|---|
| 1 | 私有子任务仍计入进度条 → 跨部门能看到别人部门的子任务数量 | `61f84be54` | 不吸就是漏；**必吸** |
| 2 | workspace wakeup 列表带出别部门 issue 的标题/标识/规则 | `e692d03e2` | 同上；**必吸** |
| 3 | 调岗/撤权后 inbox 条目仍可按 id 标记已读、归档、删除 | `984c2145a` + `4dc251a47` | **先 gate 再死删除**（顺序不能反） |
| 4 | autopilot 绑定部门私有项目，替看不见的人继续跑 | `6ccbdd178` | **必吸**；部门里 autopilot 的默认落点就是收件箱 |
| 5 | "我创建的"不含 agent 代建 → 成员看不到自己让 agent 在部门收件箱里建的任务 | `a0371ab2c` + `e6c3ef3d8` | 协同，**吸**，但要补齐我们的代建 origin |
| 6 | 项目订阅若覆盖部门收件箱 = 给全部门再发一遍 inbox | `eea447533` | 功能吸，**收件箱上限制订阅**（产品或服务端决策） |
| 7 | **部门负责人能切工作流，但建不了列（状态）** | `7cae26303`（吸了才暴露） | **正面冲突，要单独决策** |
| 8 | 侧栏全走 table query，把部门可见性压到一个端点上 | `4e457b406` | 吸之前复核 `issue_table_query.go` 的 hidden 谓词，并做回归 |

**第 7 条展开**（本次唯一需要 Lead 拍板的架构问题）：flow panel 对项目 lead 开放切换
（`useWorkflowPermissions` 里 `canManageProject = isAdmin || isProjectMemberLead`），部门负责人正是
"member + 部门项目 lead"，所以他能打开面板、能切到已有工作流。但服务端建状态只给工作区 admin：
`server/internal/handler/issue_workflow.go:507` 与 `:710` 都是
`resolveStepInputs(..., isWorkspaceAdmin(member))`，非 admin 命中 `:339` 的
`errStatusCreateForbidden`（"only workspace admins can create statuses"）。结果：部门负责人只能选
"列已经存在"的工作流，任何带新列的工作流（包括我们在 W1-B 里让预设团队包自动建的那种）他都落不下去。
两条路选一条：①把"建状态"下放给项目 lead（要扩 `isWorkspaceAdmin` 的判定点并补审计）；
②部门收件箱由服务端预置一套状态，部门负责人只做切换与 handoff。这条不属于上游取舍，属于我们的模型决策，
但 flow panel 一旦吸进来就会立刻被用户碰到。

**第 5 条展开**：requester 只在 `origin_type ∈ {quick_create, agent_create}` 时解析
（`server/internal/service/issue.go` 的 `createOnce`）。我们还有别的代建路径（agent 在评论里被 @ 后建
子任务、部门收件箱自动落项目）。子任务不落部门项目（`issue.go:3397` 只在没有 parent 时生效），
但要保证"成员让我建的任务"在两种 origin 之外也能被"我创建的"找到，否则部门模型下会出现
"我让 agent 干的活在我的列表里不存在"。

### 4.3 建议吸收顺序

- **批次 A（安全，0 迁移，1 次 sqlc 重生成）**：`61f84be54` → `e692d03e2` → `6ccbdd178` →
  `984c2145a`（含 `loadInboxItemForUser` 闸门）。这四条一起做，原因：都要 `hidden.Param()` + SQL 谓词 + sqlc，
  分四次做会重生成四遍。
- **批次 B（inbox 删除）**：`4dc251a47`，紧跟 A 之后（依赖 A 的 loader 闸门）。
- **批次 C（体验，无后端依赖）**：`7cae26303` + `bd96495d7`；同时把第 7 条的决策定下来，
  否则 flow panel 上线即被部门负责人撞到。
- **批次 D（requester 链）**：`a0371ab2c`（迁移重编号 653–655 + 补代建 origin）→ `e6c3ef3d8`。
- **批次 E（项目订阅）**：`eea447533`（迁移 656/657 + 收件箱订阅限制）。
- **批次 F（要设计）**：`4e457b406`。它改的是取数路径，建议与部门视图一起回归，不单独落。

## 5. 未覆盖 / 明确不做

- 不重做 R1 的权限矩阵；`984c2145a` 里 source-context / trigger / view-preference 的权限细节只在"与部门是否冲突"
  这一层判定，具体回归归 R1。
- 没有验证端到端、没有跑 `go test` / `vitest` / e2e，没有起服务；所有"能直接落"的判断来自
  §1 的归一化比对（改名 + 属性顺序 + 逐字相等），不是应用过 patch。
- 未评估 `apps/mobile` 侧（`4dc251a47` / `eea447533` 都带 mobile 改动），我们的 mobile 是否已同步上游基线
  不在本文件范围。
- 上游 `v0.9.0` 里另有 issue-environments、主题商店、任务上下文回执等批次，与本 11 个提交无关，未读。

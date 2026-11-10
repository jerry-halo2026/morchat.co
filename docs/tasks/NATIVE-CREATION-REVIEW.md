---
purpose: "NM03 原生创建契约独立评审"
owner: task-owners
status: draft
updated: 2026-11-10
related: []
---
# NM03 原生创建契约独立评审

2026-11-09；reviewer `/root/creation_contract_review`；实际模型 `unknown`。

**APPROVE 方向及下述 NM03-A 最小规格；HOLD 整份草案一次冻结、NM03-B 源窗口与 BUILD/部署。** 这是独立意见，不直接改变原卡状态；Root＋owner须把精确接口、源码基线、fixture和写集签进 successor。无需 Ethan 重定工程字段，不等远期模型/双设备，也不以A冒充自然创建闭环。

## 1. 审核绑定与事实

唯一目标根：`E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co`（下文路径均相对此根）；实核 `codex/round1-continuous@51e23d9e7a8d6d3b3cdf46db7df68ad1b0938271`＋保留WIP。草案 `docs/tasks/NATIVE-CREATION-CONTRACT.md` SHA256 `b6cb9927528c8a5a166fd219bb630ab86d4bfd571a4d98e24e7378ebeffa0072`；其§9八个关键产品源码hash逐一吻合。

已读AGENTS、README、CURRENT-GOAL、PRD/架构§4.1、Discovery/工程基线相关边界、交接、ACTIVE、ACL-r1/NM03、GET r2、NATIVE-CREATE-READ-SLICE及GET checkpoint。仅只读源码核查：workspace.go:320–388 已有完整Tx；project.go:418–428 无资源分支不在Tx；service/issue.go:235–563 才是真创建Tx，重复锁348先于编号357、commit515先于附件/广播/派工。617确为通用append-only＋即时NO ACTION，不能改历史迁移假撤权。

既有真实OTP→Me、三次201后两正向404的4run/1P/3F证据由Root/前独审提供，本次未重跑、未查询DB。创建缺分类而非GET应放行：否决creator/admin/read即write、缺policy fallback、测试插policy、异步补分类。

## 2. 可先冻结的 NM03-A

**只做新Workspace原Tx原子bootstrap。** 保留原生开关、allowlist、slug/prefix与response；同Tx写原workspace/member、一个“初始部门”(UUID身份)、该真人department_member、部门create_project/create_issue各一行及原statuses。失败全回滚，commit前无201/通知。默认名仅工程标签，不作授权标志；旧公司、再次POST、读时均不ensure/回填；邀请者不自动入部/获grant。

新增department_access_grant采用草案§3.2精确四列PK、动作CHECK、复合即时NO ACTION FK与通用append-only触发器；接受这个有限FK惯例例外。619仍仅候选，由schema单写者开窗前核防撞；642是完整stem数，不是编号。

最小接口：`nativeWorkspaceCreateUserFromRequest(r) (pgtype.UUID,error)`只接生产verified SessionJWT＋NativeV1、合法非零UserID、空Agent/Task；不要求尚不存在的workspace header，不信原始用户/role参数。`bootstrapNativeWorkspaceAccess(ctx, tx pgx.Tx, workspaceID,userID pgtype.UUID) error`从该tx生成q，只插刚建立的新workspace图，不自开/commit事务、不接受客户端grant。严格已知key/重复key/单JSON校验；不改变GET scope或造通用授权框架。owner可调整内部符号，但签认字节必须唯一。

**A精确候选写集：** NEW `server/migrations/619_r1_native_creation.up.sql`、`.down.sql`；MODIFY `server/pkg/db/queries/enterprise_acl.sql`及仅sqlc对应的`server/pkg/db/generated/enterprise_acl.sql.go`、`models.go`；MODIFY `server/internal/handler/workspace.go`；NEW `server/internal/handler/native_creation.go`、`native_creation_test.go`、`server/cmd/server/r1_native_creation_acl_integration_test.go`。仅bootstrap/auth/严格输入及其查询测试，不写project.go、issue.go、service/issue.go、core types、原测试、其它卡。生成漂移停止；保护现WIP，单写者在实际开窗前重hash。A无需新service文件。

A负例：每步INSERT/Ensure/Scan/Commit故障无残留native/ACL/status、无201/通知；PAT/task/unmarked/raw-header拒绝；unknown grant/role及重复/多JSON拒绝；owner身份但无grant不被补授；旧公司零回填；并发新公司各自独立图、同slug冲突无半图。自然创建原测试此时仍RED，不为A插policy、改expected200或宣称修复。

## 3. B冻结前必修，而非把全草案压进A

1. **禁止隐式真人指派。** 草案§3.5只禁Agent/squad，漏member：`handler/issue.go:4228–4249`只验member属于workspace，不验其部门内容权或分派权。首B应拒所有非空assignee对（含自己/其他真人）和任何自动handoff，422、零写入；null/不完整对的400规则需冻结。create_issue不蕴含assign。后续若支持，另签动作和受派者资料交集。
2. **精确事务/错误表。** B需把actor→部门选择/动作检查→project policy/read/create_issue→分类INSERT的真实typed接口签清，nil意图在容量外调/任何写前拒绝；不能只HTTP检查。project无资源分支也入Tx。锁顺序可沿workspace KEY SHARE→catalog shared→member→升序部门→project policy→native project→duplicate→counter；需两连接证据，不把锁图注释当通过。实源workflow变更有catalog锁及project FOR UPDATE（issue_workflow.go:955–961、1104），候选锁需逐写者兼容，不盲目新增全workspace排他锁。rollback取消上下文须有有界清理；commit未知不重建/发201。
3. **输出读也属权限。** generic duplicate409不能带旧Issue（现issue.go:3501–3509）。GetProject必须同期授权；现project.go:75–105吞统计错误、211–232按workspace读，不能复用旧helper声称安全。签清计数“可读”的规则与GET r2一跳source/duplicate拒绝边界、有资源旧项目resource_count的处理；无错误吞0、无pool后读、无私密marker。A不依赖此设计全完。
4. **确定拒绝矩阵。** private→422不降ordinary；分类null/错型/重复/unknown授权键→400；无部门/动作403、多部门省略409；项目不可读/无policy404、read-only建单403。项目create_project显式provision其read/create_issue行可接受，但只对新建项目执行；旧creator/admin不补grant，移除未来不得复活。ordinary新任务同Tx分类，无B1子grant拷贝。

B候选在修订后另签草案§7剩余project/issue/service/core类型与新service测试写集；GetIssue/r2不改。A完成后立即接B，与原GET在同一受控候选验证，不等待完整组织后台。最终必须原自然回归4run4P0skip、同部非创建者read无write、跨部项目read覆盖随后普通任务、单issue不打开兄弟、private/故障/counter/并发负例；原测试每字不动。

## 4. 后继缺口与运行门禁

service nil拒绝不等于源入口零副作用：`source_context.go:526`已clone再于723调用Create；还须以后在clone前授权/拒绝。`channel/engine/router.go`调用同service，`service/autopilot.go:740`直接CreateIssueWithOrigin绕过它。A/B不修这些，不把它们写成安全。

删除也不能靠FK兜底：`issue.go:4429–4431`先取消任务/失败autopilot；`workspace.go:1159–1174`先Qoder清理/cache失效，均在删除Tx外。新旧公司adoption、删除/leave/remove/revoke、列表/搜索/WS/fanout/下载与UI兼容继续真实HOLD/NOT RUN；必须在实际多人使用前处理，但不是A测试前置。只新公司GREEN不覆盖已有公司，也不完成CURRENT-GOAL。维持已审source-51e在线demo，不部署A或半套ACL。

本次仅NEW本review；无产品/测试/DB/服务/模型操作，无commit/freeze签章。初次路径拒绝后未以D-main代替目标审核；D-main及全部WIP无写入。报告hash由外部交付后STOP。

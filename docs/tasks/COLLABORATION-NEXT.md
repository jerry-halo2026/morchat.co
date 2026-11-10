---
purpose: "COLLABORATION-NEXT — 先验证真人任务协作闭环"
owner: task-owners
status: current
updated: 2026-11-10
related: []
---
# COLLABORATION-NEXT — 先验证真人任务协作闭环

2026-11-09；只读研究 owner `/root/collaboration_business_baseline`，实际模型未暴露，不冒名。消费者/后继授权人 `/root`；独立业务审核待分配。

工作树 `E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co`，分支 `codex/round1-continuous`，本次最终基线 `51e23d9e7a8d6d3b3cdf46db7df68ad1b0938271`（包含 Auth `dc8fe73`）。已读 AGENTS、CURRENT-GOAL、README、PRD、ARCHITECTURE、Discovery、ENGINEERING、handoff 与 R1-01/C/D。当前目标不是继续旧 Windows 探针，而是现有 Multica 多人业务。

## 结论与证据

**Top 1：独立合成库上的“创建任务→重新打开→第二员工读写边界”单条原生 HTTP 纵切。** 不创建第二后台、不加验证框架，不先接模型/双机。

以下路径均相对此工作树；只读事实，不代表部署版本或已接受原 WIP：

- `server/cmd/server/router.go:2075–2118`：项目/任务所在组要求真实 workspace membership；任务 GET 与 PUT 是不同 handler。
- `server/internal/handler/issue.go:2478` → `issue_access.go:23,82` → `server/internal/service/resource_access.go:305`：GET 只接受 native-v1 已验证会话；事务内重读成员、部门、项目和任务政策；无政策拒绝；普通任务由同部/项目 read/单任务 read 放行，private 仅单授。
- `server/internal/handler/{issue,project}.go` 和 `server/internal/service/issue.go` 搜索 `issue_access_policy|project_access_policy|department_member|access_grant` 无命中。**静态风险**：自然创建的任务没有分类政策，可能创建成功但重新打开 404；需真实验证，不能宣称已复现。
- `server/internal/handler/issue.go:3798` 的 UpdateIssue 仍走 `handler.go:1077` 的 workspace 查询；`project.go:148,211,506` 也是 workspace 级读写。未见企业资源 edit/read 分离强制。**静态风险**：读拒绝却可编辑；不能把 GET guard 或已有 service42 成绩外推为企业权限完成。
- 现成 `TestIssueReadAccessPolicy` 有13个策略子项，真实 PG、随机 owned 行并保留。`TestGetIssueReadDenialShape` 有 private404/ordinary200，但同一 actor，不证明第二真人。
- `TestR1ACLNM02IssueReadCrossDepartment` 确有第二员工/双 locator，不过固定 `/morchat_r1_nm`、641 ledger、7个旧 OTP、旧 PAT 和已消耗201/202历史事实；**不适用于全新库，不复制历史身份/密钥或重建旧状态求绿**。现在另有618_supabase_identity，不能继续硬套641。

## 本次实际验证

先读 `server/internal/service/main_test.go`：TestMain只m.Run/关闭懒池；service 无 init，realtime init 仅环境配置。检查精确子测试无 DB 调用后执行：

```powershell
Set-Location 'E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co\server'
$env:GOTOOLCHAIN='local'; $env:GOPROXY='off'; $env:GOSUMDB='off'
$env:GOCACHE='E:\CodexData\morchat-r1-local\go-cache'
$env:GOMODCACHE='E:\CodexData\morchat-r1-local\go-mod'
$env:DATABASE_URL='postgres://nobody:nobody@127.0.0.1:1/never_connect?sslmode=disable&connect_timeout=1'
& 'E:\CodexData\morchat-r1-local\tools\go127\go\bin\go.exe' test ./internal/service -run '^TestIssueReadScopeLifetime$/(ZeroScope|ZeroAttempt|BeginFailure)$' -count=1 -timeout=30s -v
```

实际 exit0，parent+3 children 共4 run/4 pass/0 skip，2.275s；仅失效 scope/Begin 失败组件，不是业务通过。

handler/cmd 原 TestMain 默认 localhost5432，setup先固定 alias 清理、DB不可达会exit0；已读后**未运行**。策略13项、handler、router、第二人和真实DB本轮全 NOT RUN。无 DB/应用/远程 Supabase/模型操作，无重启。

## 唯一下一任务（待 Root 收窄授权，尚未创建/执行）

授权一个新 `server/cmd/server/collaboration_user_vertical_integration_test.go`，不改旧测试/生产文件；Root 管理一个全新 stock Docker `pgvector/pgvector:pg17` 容器及独立卷/空库、未占用 loopback 端口。禁止挂 app 数据卷、复用 morchat-local-demo 或旧四库；使用独立合成密码/JWT context，不读旧 context。原生 `go run ./cmd/migrate up` 只指向此新库；使用当前完整 migrations，包括617及618身份迁移，不手工重建 schema/指定641。

测试使用实际 NewRouter、Auth 与 handler；合成 A/B 经本地原生 OTP 换会话，不访问远程认证/发邮件，不手写“已验证用户”。A 用原生 API 建 workspace/project/task，**立即用 UUID/identifier 重开**；这一步失败先保留业务 FAIL，不补 INSERT policy 掩盖。随后 B 未入会读/写均应被成员边界拒绝；在同一新库建立明确的部门/项目只读合成授权后，B普通任务200、private无单授404，B仅read的PUT必须拒绝且任务行不变；A获明确编辑权的PUT成功作为正控。入会/授权fixture须显式记录，不能把“授read”当“授write”。普通消息不含@，不创建Agent/run。

命令入口：同一离线Go环境、**先验证显式新 DATABASE_URL**，`go test ./cmd/server -run '^TestCollaborationUserVertical$' -count=1 -json`。新文件/selector目前不存在，不伪称可直接运行。须逐命名事件检查实际执行，不能只收exit0；保留失败库，不自动重置。消费者审核当前 WIP归属及窄测试卡后才开窗口；业务修复另授权，不自动接管旧 WIP。

## 内容保护

本次唯一新写文件为本文；未stage/commit/index/ref变更，D main未访问。四个原WIP SHA256短前缀：service resource_access `e32bb3de`、其test `45204388`、handler issue_access `c65db4e0`、其test `fe6be35a`；全文写后复核不变。其余用户WIP未采用/编辑。

## 2026-11-09 接续裁决：先收敛GET两个失败叶，不越级开title写权

已核当前51e/运行source-51e（Root报告）不含WIP。NM-02a@r3登记SHA957de399为TEST-FROZEN，但activeProductWriteSet仍是schema/原集成测试；后继title需单独窄卡。Guard r2登记SHA122ecf25仍TEST-FROZEN_SOURCE_ONLY，只GET，未BUILD。Create由r3 §114明确留给NM03，不能凭未来清单实现默认部门。**先前消息建议title PUT仅是后继候选，现撤回其“立即开发”优先级，GET读依赖未通过前不放行。**

这次实际读了事故目录 `E:\CodexData\incidents\morchat-20261106T233131\guard-handler-runtime-r3-actual-57e82feb320549c18bd853bca078b63a\test.stdout.raw`（SHAbc104693…）/stderr（47e5aed4…）、`guard-handler-runtime-r3-failure-analysis/summary.json`及`guard-handler-fixture-r4-rootcause-spec.md`/独审，不只转述台账。53事件=49PASS/4FAIL/0SKIP；4FAIL实际是**两个失败叶+两个父**：

- `TestGetIssueReadCredentialGate/Task`：原始23514明确`agent_task_queue_active_requires_runtime`，失败在fixture INSERT，非403权限断言；确认是构造缺陷。当前issue_access_test.go SHAfe6be35a已加合法online runtime/working agent/running task、started/dispatched、token真实关系核验与Auth私有identity观察；尚无其业务运行结果。
- `TestGetIssueReadFaultsNeverEmitSuccess/PanicCleanup`：原输出仅“panic injection not reached”，无当时route-entry/SQL-match/trace，因此**根因仍未判定**，不能归咎权限实现或直接改SQL名。fe6新增GUARD_FAULT_DIAG及exact panic/rollback断言，未弱化旧断言；diagnostic冻结登记仍SOURCE_ONLY/NOT_RUNTIME，台账r71记录已应用、r72只有compile，不能把旧JSON的applied=false当当前源。

**唯一下一可执行任务：用当前已审fe6，仅运行以上两叶诊断；先不改生产代码。** 建议Root重绑owner到现任handler fixture owner（历史guard_fixture_impl仅作追溯），独审复用现任guard安全reviewer角色；Root消费/决定窄放行，不冒充旧agent仍持有窗口。本次代码写集=空；若观察定位出实际实现缺口，再由owner提出精确hunk、冻结写集并独审，保留全部原WIP，禁止直接接管dirty issue.go/source_context/resource_access。

隔离方式：Root另批全新stock pgvector PG17容器/卷/合成库与独立进程env；当前完整原生migrations，新合成JWT_SECRET，不用demo/旧四库/旧key/旧fixtureepoch。明确DATABASE_URL到该新loopback端口并核current_database后才运行；handler TestMain会固定alias先清理、不可达exit0，故绝不能对用户库执行。无需新adapter/controller。沿锁定Go和离线缓存：`go test ./internal/handler -run '^TestGetIssueRead(CredentialGate|FaultsNeverEmitSuccess)$/^(Task|PanicCleanup)$' -count=1 -timeout=90s -json`。应真实4个run/pass事件（两叶+两父）、0skip，任务MAT经Auth后403且Begin=false；panic必须匹配注入点/精确payload、rollback=true、commit=false、无保护正文/成功。若仍失败，保留日志按首个未达阶段修因，不删断言/禁trigger/放宽Auth。四事件通过后另在同候选新隔离fixture跑完整53；不是诊断绿即GET BUILD，更不等于router/创建/列表/写权已闭环。

现可确认的业务缺口仍是UpdateIssue只workspace，`expected_revision`可选、普通Unmarshal吞重复/未知键且无edit_title判定；但当前失败未证明新生产修复点，先GET证据再开严格title的RED测试。该后继需GET已接受、可信actor/锁序/副作用与兼容边界独审，不能绕回部署半套ACL。本轮只读源/已有raw及追加本节，无测试/DB/服务/main/模型动作。

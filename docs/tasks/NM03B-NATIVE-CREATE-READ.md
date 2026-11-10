---
purpose: "NM03-B：原生项目／普通任务创建→授权读回候选"
owner: task-owners
status: draft
updated: 2026-11-10
related: []
---
# NM03-B：原生项目／普通任务创建→授权读回候选

**Status: TEST-FROZEN_TEST_ONLY · revision B-r2 · 2026-11-09。仅冻结下述唯一NEW cmd测试窗口；生产／SQL／helper／core及其余测试仍CLOSED，非BUILD／部署放行。**

- Task-ID `R1-NM03B-NATIVE-CREATE-READ`；契约owner `/root/invitation_path_review`（实际模型 gpt-6.1-sol）；消费者 `/root` 已ACK；独审 `/root/workspace_invitation_review_r2` 已ACK tests-only；实际implementer `/root/native_create_read_impl_r1`（gpt-6.1-sol，由Root另派）。owner不自审。
- 契约owner唯一文档写集：本文。已冻结唯一源码写集：NEW `server/cmd/server/r1_nm03b_native_create_read_integration_test.go`，仅由Root另派implementer写；其余生产／SQL／helper／core及其余测试全部CLOSED。唯一树 `E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co`，branch `codex/round1-continuous`，实核 HEAD `96085ec414511f7537aabe6b73d22a7aac641a7c` 加保留 WIP；HEAD 不代替下方内容 hash。D main、A卡、原总草案、原自然回归、生产／DB均不写。
- 权威：AGENTS、docs/README、ARCHITECTURE §4.1、MINIMUM-CHAIN §9/NM-03、contracts/R1-ACL-r1、GET r2-spec；本候选逐条响应 NATIVE-CREATION-REVIEW §3，不改其既有字节和状态。A沿 NM03A-WORKSPACE-BOOTSTRAP 已审接口，B不重复迁移／sqlc schema定义，不重做客户端／框架。

## 1. 最短决策与验收边界

**建议冻结一个B切片：新公司A已 provision 的单部门真人，经现有UI/API自然创建普通项目、未指派普通任务；原Tx写分类／显式动作事实；原GET授权读回。** 创建、读取、编辑、指派独立；不用creator/admin fallback、不在fixture给自然创建图补policy、不异步补分类。

Root提供当前证据：A生产helper真实bootstrap GREEN；原 `TestLocalNativeCreateRead` 仍4run/1pass/3fail，UUID/identifier正向404，WrongPrefix404通过。本文未重跑；不将邀请PASS或A GREEN转记B通过。原测试SHA必须保持 `cd0ab222ac265f1f8d7b34add6e8824c394ceb4181ac80b2762b71a37dbc9d45`。

此子集不必等adoption、完整组织后台、模型或双设备才能 TEST-FROZEN；但同期必须包含安全 GetProject。列表／搜索／WS／下载／lifecycle未闭环前不得BUILD、部署多人真实资料，现source-51e demo不装入半套ACL。单部门默认兼容现UI；多部门只能显式API选择，本轮无新选择器。

## 2. 实际来源与根因

下列路径相对唯一树根；行号为本次源码，不把候选符号写成已有接口。

| 来源 | 已核事实／B改动理由 |
|---|---|
| handler/project.go:75–105,211–233 | GetProject workspace内直读；issue/resource统计helper走pool并吞错为0，不能复用为安全GET。 |
| handler/project.go:109–136,270–504 | 请求无department；无resources分支418–428直pool INSERT，有resources才Tx；B全部创建走同一Tx。 |
| handler/issue.go:3030–3080,3185–3456 | 请求重复key检查已有，unknown key仍被忽略；handler pool预读parent/workflow/status与handoff在service前；B先严格输入／可信actor，再同Tx业务解析。 |
| handler/issue.go:3457–3509 | service真实入口；duplicate409把旧Issue完整投影出去，B必须通用冲突。 |
| handler/issue.go:4228–4249 | 真人assignee仅查workspace membership，不证明资料交集／分派权；B拒绝所有assignee。 |
| service/issue.go:60–150,235–567,853起 | Create先ResolveIssueCountPolicy外调再Begin；property→source→workflow→custom catalog→parent/project→labels→duplicate→counter→insert→commit，后附件／广播／enqueue。B意图与unsupported须在容量外调前检查，同Tx授权必须在counter及任何写前。 |
| handler/issue_workflow.go:955–961,1104–1173；queries/issue_workflow.sql:143–148 | workflow writer先catalog，再native project FOR UPDATE；B锁项目必须稳定workflow_id，不能只KEY SHARE。 |
| service/resource_access.go、GET r2-spec §4–5 | 现Issue GET只用owned attempt/current facts，ordinary与private不同，source拒绝影响整根GET，duplicate拒绝只省略可选ref；B不得改其credential或scope。 |
| handler/native_creation.go:23–39,108–134；queries/enterprise_acl.sql:60–73 | A已提供可信真人适配、同Txbootstrap与有界rollback；部门动作表/查询已存在，不再占新迁移号。 |
| core/types/api.ts:7–27；core/types/project.ts:36–52 | 现Create请求可加可选department_id及ordinary visibility；响应不变。 |
| views/modals/create-issue.tsx:573–594；create-project.tsx:392–402 | 默认未指派字段为undefined、JSON序列化省略；普通未挂资源/子任务/属性路径可直接用原UI。已预选assignee、附件、子任务、资源等不在本B可用范围，需清空或明确422，不静默丢弃。 |

## 3. 精确HTTP输入与错误／null矩阵

生产Auth后，创建／GetProject仅接受 verified SessionJWT＋NativeV1、合法非零UserID/workspace、无Agent/Task身份；复用A真人检查再绑定已解析workspace，不能信原始X-User-ID/role。PAT/MAT/mcn/unmarked拒403；无认证仍由原Auth401。此B不改变原Issue GET r2的门槛。

所有创建body为一个JSON object；拒未知key（不仅授权key）、任意层重复key、尾随第二JSON、错误类型400。必须保留字段presence，不能用Go指针把省略/null混同。校验顺序：认证→JSON形状／字段格式／unsupported→事务内业务授权；格式错误不触发资源查询，授权拒绝前不读title/body/workflow内容。

| 字段／事实 | 精确候选行为 |
|---|---|
| department_id | 省略按下节解析；null、空串、非canonical非零UUID或非string400；不接受零UUID。有效但外部／未知部门403同形。 |
| visibility（Project/Issue） | 省略或精确ordinary允许；private422 `private creation is not supported in this slice`；null/空串/其它/错型400。Project同样解析，不可忽略private。 |
| project_id（Issue） | 省略或null代表非项目任务；空串/错型/无效或零UUID400；合法但缺失／跨workspace／不可读／未分类项目404 `project not found`。 |
| assignee_type + assignee_id | 两者省略或两者显式null＝未指派；仅一键出现（即使null）、一null一非null、空串、错型、非法UUID／非法type400；完整有效member/agent/squad对一律422 `assignment is not supported in this slice`，包括自己。不会查询受派者或调用handoff／TaskService。 |
| parent_issue_id、origin_type/id、stage | 省略或null＝无功能；空串/错型/非法UUID、无效stage400；合法非空/非null意图422；origin对不完整400。 |
| attachment_ids/label_ids/resources | 省略或空数组＝无功能；null/非数组/元素错型400；合法非空数组422；不读取目标附件/标签/资源。 |
| properties | 省略或空object允许；null/非object400；非空422，不取property锁。 |
| Project lead_type/lead_id | 同assignee配对形状；省略/双null允许；完整有效对422，不以lead暗授权限。 |
| Project workflow_id | 省略/null使用Default；空串/错型/无效UUID400；任何显式非空合法ID422（即使当前Default），不pool查询判定它。 |
| title/status/priority/description/icon/dates | 沿原生纯元数据校验与默认（project planned/none、issue todo/none）；title非空string；enum null/错型400；description/icon/dates可省略或null维持原生空值，日期空串维持NULL；状态最终须同Tx解析。 |
| allow_duplicate | 省略/false/true沿原子防重语义；null/非bool400。其它未知字段400。 |
| 默认workflow自动handoff | 在catalog及project锁下解析；若创建会产生任何自动assignee/任务，则422，counter/native/ACL/通知0；不把handoff静默禁掉后返回成功。 |
| 无部门／动作 | 当前真人native member但0部门或缺选中部门动作403；多部门且省略部门409 `department selection required`，先按membership数判定，不按“有权部门数”挑选。 |
| DB/scan/begin/constraint/encode/commit/cancel | 基础设施500或取消不写响应，不伪404/0/201；仅明确定义业务冲突409。 |

所有上述拒绝禁止native/policy/grant/counter/任务/附件/通知副作用；400不包含字段目标存在性或真实资料。服务非HTTP入口也必须检查unsupported语义，不能只靠handler。

## 4. 同Tx类型接口候选（待实现，非现有API）

不扩展 GET scope 成通用写授权；只新增窄 service/native_creation_access.go。复用现有 db.Queries/sqlc模式与 IssueService.Create，项目仍现handler原Tx，不新业务服务／事务框架。

```go
// Values only from the production verified-credential adapter; no role/grant stamp.
type NativeCreateActor struct { WorkspaceID, UserID pgtype.UUID }
type NativeCreateIntent struct {
    Actor NativeCreateActor
    DepartmentID pgtype.UUID // Valid=false means absent, never explicit null.
    Visibility string       // normalized exactly "ordinary".
}
// private state binds original tx + actor/workspace/department/project/action.
type NativeCreateDecision struct { /* unexported; no q/tx accessor */ }
func AuthorizeNativeProjectCreate(ctx context.Context, tx pgx.Tx,
    intent *NativeCreateIntent, newProjectID pgtype.UUID) (*NativeCreateDecision, error)
func AuthorizeNativeIssueCreate(ctx context.Context, tx pgx.Tx,
    intent *NativeCreateIntent, newIssueID, projectID pgtype.UUID) (*NativeCreateDecision, error)
func (d *NativeCreateDecision) InsertProjectAccess(ctx context.Context,
    project db.Project) error
func (d *NativeCreateDecision) InsertIssueAccess(ctx context.Context,
    issue db.Issue) error
```

- Intent加到 `IssueCreateParams.NativeCreate *NativeCreateIntent`；Create第一步ValidateNativeCreateInputs（nil/zero/actor与p.WorkspaceID或creator不符→typed invalid intent、HTTP403；unsupported→422）在ResolveIssueCountPolicy、Begin、任何查询/写前。服务入口自己重验，不接受handler“validated=true”。被拒的source/channel调用不能获得legacy bypass；其更早副作用仍后继HOLD。
- `Authorize*`不Begin/Commit、不用pool，只由收到的真实tx构建私有q；nil tx/已取消ctx/invalid intent fail-closed。same Tx SQL锁后重验native member和当前事实；`NativeCreateDecision`不可由外部字面量构造有效值，零值/错方法/不同workspace或project/已消费/取消拒内部500，不产生INSERT。
- `Insert*Access`只用decision私有同tx/q，调用方不能传另一个tx/q或grant；验证新行WorkspaceID/ProjectID/Creator与decision相符后，项目policy＋read/create_issue grant／issue policy全部成功才消费decision。新行ID必须为本次调用生成并记录的UUID，禁止用此接口给旧行adopt；授权函数精确接收上方newProjectID/newIssueID，Valid且非零，授权前由本次调用生成；Insert必须匹配，不能用任意旧ID。NEW typed INSERT不允许ON CONFLICT adopt/ensure。
- 项目handler用原生dbid.NewV7；新增typed query CreateNativeProject显式ID参数、其余列与原CreateProject相同；旧CreateProject query/其它消费者不动，不改schema；issue现已NewV7，在授权前生成一次并传递。失败／retry不能复用旧decision；同事务剩余原生写继续qtx，不导出decision q给外部。
- typed错误集合：InvalidIntent403、DepartmentDenied403、DepartmentSelectionRequired409、ProjectInvisible404、ProjectCreateDenied403、Unsupported422、InvalidInput400、ActiveDuplicate409；其余error500。pgx.ErrNoRows仅在指定存在性／事实查询解释成业务拒绝，不能把任意wrapped DB错降级。分类冲突／FK错误是500并rollback，不返回“已有policy”内容。
- 所有退出有 `context.WithTimeout(context.WithoutCancel(ctx),5*time.Second)` rollback；commit未知不发201、不再建另一份资源。成功后decision不跨请求重用；不授永久scope/epoch/cache。

## 5. 动作语义、准确锁序与原子性

### 5.1 创建Project

省略部门仅actor恰好一个真实department membership时选择；明确部门须本workspace、actor当前membership＋`department_access_grant(create_project)`。有grant无membership仍403。native member.role、creator字段不是授权。

同Tx原Project INSERT→ordinary部门project_access_policy(revision1)→该已获create_project能力的actor之project `read`与`create_issue`各一行→Commit。初始显式provision只发生本次新项目；不授edit_title/assign/manage/device、不补旧creator。后续读取仍按真实membership/grant，不依靠creator。

### 5.2 创建Issue

项目内：锁定项目policy有效且department/workspace一致，先项目read（同部membership OR project read）再独立project create_issue grant。无read即404，有read无create_issue即403；department create_issue不代替项目动作。department省略取锁定项目部门，显式不符400。项目外按单部门选择＋membership＋department create_issue，create_project不蕴含它。

同service原Tx创建ordinary issue policy revision1；无任何新issue read/edit_title/assignee grant。跨部B1的项目read动态覆盖后续普通任务，不拷贝B1 child grant。私密只独立issue read，不能从项目继承。

### 5.3 固定顺序（每次READ COMMITTED，所有查询同tx）

1. workspace `FOR KEY SHARE`（新typed锁，先于任何子表锁，与DeleteWorkspace FOR UPDATE互斥）。
2. Issue创建与Project GET计数：catalog shared advisory；Project创建若解析Default/handoff亦取同锁。所有需要catalog者在member前取得，不能后段回头取。
3. actor native member `FOR SHARE`。
4. 元数据locator收集所需部门／项目，不含正文；部门按UUID排序 `FOR SHARE`。查询真实membership/动作事实；若locator和锁后绑定变化，rollback重定位，不持旧锁追加低序部门。
5. 相关project policy按UUID `FOR SHARE`；native project按UUID **FOR SHARE**，不用KEY SHARE，因为非键workflow_id更新与KEY SHARE兼容；SHARE阻止现writer的project FOR UPDATE。只有授权通过后才能读完整project/default workflow，确认无自动handoff。
6. Issue再原duplicate advisory→workspace counter UPDATE/容量→position→native INSERT→policy INSERT→Commit。Project直接native INSERT→policy/grants→Commit。unsupported properties/source/labels在这之前已拒，不取旧分支的低序锁。

原子编号/容量不改为先counter后duplicate。不加workspace排他或全局串行。与workflow writer（catalog→project FOR UPDATE）、GetIssue（member→升序department→project policy→issue policy→native issue→source/anchor）、DeleteWorkspace（workspace先锁）逐一做两连接barrier证据。已知DeleteProject/其它非ACLwriter仍可能锁反转，deadlock返回500、无201；不声称所有lifecycle安全。

locator绑定变化最多一个全新Tx retry；第二次变化404，基础设施deadlock/timeout从不当retry业务成功。确认提交前缓冲原生DTO/metadata（含正确prefix、status category）；禁止pool后读填充响应或回头调旧fillStatusCategory。所有Tx内trigger/编号/policy故障一起回滚。成功commit后才原生事件/analytics；不触发附件/assignment/TaskService分支。事件晚发不等于fanout已授权，仍不放多人BUILD。

## 6. GetProject：同期安全输出与统计边界

候选窄接口：`ReadNativeProject(ctx, begin func(context.Context)(pgx.Tx,error), actor NativeCreateActor, projectID pgtype.UUID) (NativeProjectReadData,error)`，返回纯复制project行及计数，不返回q/tx/scope。内部拥有Tx与有界rollback，使用上节workspace/catalog/member/department/project policy/native project顺序，commit成功后handler才输出200。无policy/未知/跨workspace/只有create_issue无read→统一404 `project not found`，无标题、counts、部门名；DB错500。native owner/admin不跳过。

- `issue_count`只计该项目当前actor按GET r2语义可读根Issue；`done_count`为其中当前catalog terminal category的子集。ordinary须有效同部门issue/project policy＋当前department membership或direct issue read或project read；private仅direct issue read。edit_title/create_issue不算read。
- duplicate ref不可读只被r2省略，不减根Issue计数；不得把duplicate原始ID/title投影到Project响应。
- attached source不可读/未分类、物理anchor缺失／不在同source或snapshot身份不符，使该根GET不可读，故根不计数；只做一跳，不跟source的source/duplicate。snapshot JSON内部损坏是500，不能当不可见或0；软删anchor遵r2现约定。只在根及source授权后读被pin snapshot验证身份，不读thread正文来计数。
- 统计先metadata规划root项目、项目内候选根及必需source的完整并集，必须在任何department/project policy/native project结构锁之前，一次收齐所有部门及相关项目；不能先锁GetProject根项目再追加更低rank部门。去重排序后锁全部部门、project policies、native project、issue policies、native issue、source link/anchor；与r2相同rank，先规划完再取锁。锁后校验project/source/anchor绑定；变动整Tx重定位一次，不在后段追加更低rank锁。所有policy与scope事实同Tx，不调用旧pool统计helper、不开逐Issue嵌套Tx、不复用GET凭证scope为写凭证。
- 这定义READ COMMITTED下本次观测的候选集合，不承诺阻止后续INSERT的快照或撤权t0；并发新Issue可下一次GET出现，不能混用未锁新行。SQL/Scan/rows.Err/catalog/count/commit任一失败500，不能200/0；合法确无可读任务才0。
- **资源精确窄边界：** 本B新项目不创建resources。对已获项目read的旧项目，只在同Tx查询是否有resource元数据；若有任一资源，GetProject统一422 `project resource metadata is not supported in this slice`，不返回project DTO/counts，不读取resource_ref/路径/设备/文件。无资源才resource_count=0（真实证明非伪造）。拒绝未获项目read者仍404，不能以422泄漏存在性。完整有资源项目统计另审后继，不用“项目可读即设备可用”扩权。

**Root消费者＋独审工程裁决（2026-11-09）：** 在唯一NEW `server/internal/service/native_project_read.go` 放两个未导出纯helper，精确签名／语义：

```go
func issueReadVisibilityClassified(visibility string) bool {
    return visibility == "ordinary" || visibility == "private"
}
func issueReadFactsAllowed(visibility string, facts db.GetIssueReadGrantFactsRow) bool {
    if !issueReadVisibilityClassified(visibility) { return false }
    return facts.DirectRead || (visibility == "ordinary" && (facts.DepartmentMember || facts.ProjectRead))
}
```

`resource_access.go`仅额外一个原472–480 hunk：原472条件改为`if !issueReadVisibilityClassified(ip.Visibility)`，原480改为`p.allowed = issueReadFactsAllowed(ip.Visibility, facts)`；其余字节逻辑不变，特别是未知visibility不query facts、classified赋值时机、SQL及错误传播、全部结构validity/锁/scope/credential。B stats调用同helper；不得复制第二版判定或把它当structural授权。该额外源窗口仍待Root正式签认，不是本文直接授权修改r2；原r2测试保持。必要的source/统计负例未收敛前不能只冻结POST声称B闭环。

## 7. 候选写集／依赖与最短TDD

**B-r2仅NEW cmd测试已TEST-FROZEN_TEST_ONLY。** 下表其余均为CLOSED生产候选，不是当前授权；生产窗口须真实RED、精确child矩阵及Root＋独审签精确API字节、hash、fixture后再授权。schema沿A现有619，不改617/618/619历史、不新迁移、不重复生成表。仅新增B typed SQL再运行既有sqlc一次；这是查询增量生成，不是重做A schema。

| 候选源写集 | 精确目的 |
|---|---|
| NEW service/native_creation_access.go、native_project_read.go | 上述窄同Tx授权/classification及项目read/count；不新通用事务框架。 |
| MODIFY service/resource_access.go（仅上述472–480单一hunk） | 现有最终白名单/事实表达式调用同service纯helper；其它r2结构、事务、权限语义不动。 |
| MODIFY service/issue.go | nil/unsupported preflight在外调前；同原Tx授权/分类、同Tx响应数据、bounded rollback；其它入口无legacy default。 |
| NEW handler/native_resource_creation.go | verified actor＋presence-aware严格Project/Issue decoder、typed error映射；复用A helper但不改native_creation.go。 |
| MODIFY handler/project.go、issue.go | 仅CreateProject/GetProject/CreateIssue；取消非Tx创建及pool预读/后填充，generic duplicate409；GetIssue不动。 |
| MODIFY queries/enterprise_acl.sql、queries/project.sql（仅新增CreateNativeProject显式ID INSERT，旧query不改）及对应generated enterprise_acl.sql.go/project.sql.go | 新workspace lock/部门选择动作事实/新policy和grant INSERT/项目read locator/count所需typed查询。models.go仅sqlc若真实必需的生成差异；非预期漂移STOP。 |
| MODIFY core/types/api.ts、core/types/project.ts | 可选department_id、visibility:ordinary；请求响应其它shape不重建，unsupported UI路径明确未完成。 |
| NEW service/native_creation_access_test.go、native_project_read_test.go；handler/native_resource_creation_test.go；cmd/server/r1_nm03b_native_create_read_integration_test.go | 仅B测试；原TestMain/helpers与自然测试字节不动，不建新框架。 |

readonly：A workspace/helper/test卡；GET r2 tests及production除上表唯一表达式提取hunk；router/Auth/Supabase；source_context/channel/autopilot；list/search/WS/lifecycle；daemon/desktop/mobile；所有配置/依赖锁文件/运行服务。共享issue.go唯一写者Root开窗，不覆盖现WIP。

**已批准唯一tests-only窗口：只NEW `server/cmd/server/r1_nm03b_native_create_read_integration_test.go` 一个文件，先以现有API写可编译RED，不以缺候选符号编译失败当TDD。** 第一meaningful断言固定为自然POST project201后，在现存project_access_policy表查该新project count==1（当前实际0），自然主图不插部门/policy/grant；在未实现新query/helper符号及后继GET失败前先捕获此RED。其后补充child矩阵，但第一阶段不写service/handler新测试或生产，不修改原自然测试。固定selector `^TestLocalNM03BNativeCreateRead$`；opt-in `MULTICA_RUN_LOCAL_NM03B=1`，缺省SKIP、其它非空值FAIL。Root负责启动前及live精确lab身份核验与DB单写执行，implementer不自行DB运行；测试保留后续Project GET与Issue UUID/identifier成功断言，不为当前RED删掉。 隔离fixture只用于授权负例和跨部角色；自然主链绝不插policy/grant。沿现native TestMain/NewRouter、随机合成OTP→Me，原实验guard（精确127.0.0.1:55439/acl_retest_20261109/acl_retest＋live身份＋显式opt-in）在package启动前由Root核验；TestMain不可达exit0须判SETUP，不记PASS。无真实账户/共享Supabase/模型/daemon。

| selector（NEW均候选，当前NOT RUN） | 必须证明 |
|---|---|
| EXISTING `^TestLocalNativeCreateRead$`（原字节） | A自然workspace→普通project→ordinary issue201、UUID/identifier200精确native字段/metadata，WrongPrefix404；实际4run4pass0skip。 |
| NEW `^TestLocalNM03BNativeCreateRead$` | 原POST→GET Project/两Issue locator；同Txpolicy关系与创建者project read/create_issue显式行；无子read/edit/assign grant。 |
| NEW 同测试 `/DepartmentReadNotWrite|ProjectReadFutureIssue|ActionSeparation` | 同部非creator读不写；跨部B1 project read覆盖授权后新任务，无child grant；create-only无read404、read-only写403、单issue不打开项目/兄弟，admin/creator无grant拒。 |
| NEW `/StrictInput|NoAssignment|NoHandoff` | 矩阵各省略/null/错型/重复/unknown/多JSON；self/他人member/agent/squad422，自动handoff422；native/ACL/counter/task/附件/通知零变化。 |
| NEW `/ProjectStatsVisibility|ProjectStatsSource|ProjectResourceUnsupported` | 私密marker不泄漏，done仅可读集合；source/anchor/snapshot一跳与r2一致；授权有资源422、未授权仍404；每个stats/Scan/Commit错误500不伪0。 |
| NEW `/DuplicateRedacted|DepartmentSelection|OldUnclassified` | 私密同title duplicate409仅固定code/error，无旧issue字段/ID/marker；0部门403、多部门省略409、选中外部门403、项目部门不符400；旧图零ensure/回填。 |
| NEW service `^TestNativeCreateTransactionAtomicity$` | native INSERT/policy/grant/trigger/counter/begin/Scan/Commit每点故障全rollback，commit未知无201/重建；取消5s有界清理；nil意图容量provider调用0、Begin0。 |
| NEW service `^TestNativeCreateLockOrder$` | 两连接barrier记录workspace/catalog/member/排序department/policy/project SHARE/duplicate/counter；对workflow writer、delete、并发同title/不同title；不sleep-only，不改全局排他，编号唯一。 |
| EXISTING `^TestR1ACLNM02IssueReadCrossDepartment$`、`^TestGetIssueReadCredentialGate$`、`^TestGetIssueReadDenialShape$`、`^TestGetIssueReadRelatedProjection$`、`^TestIssueReadAccessPolicy$`、`^TestIssueReadAccessAssociationRetry$` | private/admin/source/duplicate/credential/NULL/关联retry不退化；实施owner在TEST-FROZEN manifest逐个列真实selector与hash，不用通配符成绩替代。 |

generic duplicate固定候选body：`{"code":"active_duplicate_issue","error":"active duplicate issue exists"}`，409；不含issue对象、title/id/identifier，不能在此分支调用issueToResponse、prefix/status helper。保留allow_duplicate与原duplicate锁，不因旧Issue不可读就忽略防重。

## 8. 未完成边界及签认前裁决

1. 本r1的最短可冻结建议是同一B候选内POST＋安全GetProject＋原IssueGET兼容，不要求所有远期合同先冻结；但§4新ID绑定签名与§6两个纯helper／单hunk边界已由消费者和独审给出工程裁决；完整B源窗口仍须先获得上述真实RED、精确child矩阵及最终接口manifest后再给TEST-FROZEN。owner可继续修订本文，不能让实现者猜。
2. source_context.go clone在service Create之前；channel调用Create；autopilot直接CreateIssueWithOrigin；B nil拒绝不证明这些源入口零副作用。列为已知HOLD，不把服务入口改严当完整全入口修复。
3. A/B不adopt既有公司、不自动授邀请者部门动作；append-only/NO ACTION仍使delete/leave/remove/revoke需要后继。DeleteIssue取消任务、DeleteWorkspace预清理在Tx外；DB拒删不是安全rollback，不跑这些链求绿。
4. list/search/WS/fanout/download、真实UI所有高级功能、旧resources、私密创建、父子/附件/指派/自动handoff均未交付；仅零模型合成受控API可验证B。不得将B局部GREEN等同CURRENT-GOAL完成或部署批准。

## 9. 内容快照（SHA256，本次只读）

| 路径 | SHA256 |
|---|---|
| server/internal/handler/project.go | ed8f25b69498cabd456f21bfcc2438611bd9e8ac26b73ed0f562a504087e3d2c |
| server/internal/handler/issue.go | 566790b3071caab6371177741cef9b5054b67a870b51ed7acd8ffdb628708afd |
| server/internal/service/issue.go | 17749ae5e685ecd59347c76b8cc1eecaeb477cfbe4b8397d3c9a0c45d5919ab2 |
| server/internal/handler/native_creation.go | 63092aa70a2fcdb5b3639b39a307c540dbd31305871bcabf3e5caedf7666132a |
| server/internal/handler/issue_workflow.go | ee77c0d266116f5bf450c4556224f129228af7d9955e3eb270f1a45bb9ee00a1 |
| server/internal/service/resource_access.go | e32bb3dea3c3d756f450cd291dca911a2e34a3e2c21e9e700ef51ebcbf35a083 |
| server/pkg/db/queries/enterprise_acl.sql | 93c08646335fdb827cc81b33ebae543d625f11d656a7a0086757ca08e6bb485c |
| packages/core/types/api.ts | 4dcee30a6f86b1435cca7a3191dc825622851951f6e1e203bf6352841aba3fdf |
| packages/core/types/project.ts | e0358a4c40d618040a9eeeee37e78f984d07ff28f81996f3640c4da0fc9f7efe |
| server/cmd/server/r1_native_create_read_local_integration_test.go | cd0ab222ac265f1f8d7b34add6e8824c394ceb4181ac80b2762b71a37dbc9d45 |
| docs/tasks/NATIVE-CREATION-CONTRACT.md | b6cb9927528c8a5a166fd219bb630ab86d4bfd571a4d98e24e7378ebeffa0072 |
| docs/tasks/NATIVE-CREATION-REVIEW.md | 0048c6ec488e2f5c9648a590bc4272617e59f0e6df52b0e0fdffb75745b30323 |

本契约owner本次仅NEW/修订本文；未修改产品／测试、未运行DB／模型／新工具、未commit/push。消费者Root与独审已ACK并仅签B-r2 TEST-FROZEN_TEST_ONLY唯一NEW cmd测试；生产/SQL/helper/core/其它测试仍CLOSED，BUILD／部署未放行。交付hash后停止文档，Root另派fresh implementer。

## 10. Implementation manifest M1（待Root＋独审ACK；不扩大当前源码窗口）

Owner/implementer /root/native_create_read_impl_r1，实际gpt-6.1-sol；consumer /root；reviewer /root/workspace_invitation_review_r2。此节仅append；§1–9冻结字节保留。以下NEW符号均提案，不声称已存在。生产和后继测试仍CLOSED；Root签认后才逐项TDD。没有DB/模型/真实账号操作、没有部署。
Root已实跑唯一NEW cmd测试：native OTP→Me→workspace201→project201，首B断言policy expected1 got0，1run/0pass/1fail/0skip，exit1/stderr0；原始证据private/nm03a/nm03b-initial-red.stdout.jsonl SHA256 32E91B2DFDE93943DF5752D32BD4708979AA18F5D52B32AA68B4673A6BFD4D9E（Root消费者提供，implementer不冒记自行复验）。自然图保留，旧测试不改。
精确源窗口仍仅§7清单；queries/project.sql只append一条CreateNativeProject；enterprise_acl.sql只append候选查询，旧查询不改；generated仅对应两个文件，models.go应零差异（无新schema），有非预期差异STOP。A/helper/router/Auth/GET旧测试/source/channel/autopilot只读；r2仅两个表达式单hunk。无新迁移/依赖/配置/框架。

### 10.1 窄接口和typed SQL清单

参数缩写W/U/D/P/I均pgtype.UUID；调用签名一律(ctx context.Context, arg XParams)；单UUID查询直接(ctx,W)。下列每个Params只包含列出的字段；所有查询仅来自同一真实pgx.Tx生成的db.New(tx)，绝不pool。
| 新query（均append enterprise_acl.sql，除注明者） | Params字段 → result；精确约束 |
|---|---|
| LockNativeCreateWorkspace | W → db.Workspace；workspace WHERE id=W FOR KEY SHARE，返回prefix/counter；复用原GetWorkspace不改旧query。 |
| ListNativeCreateDepartments | WorkspaceID W, UserID U → []db.DepartmentMember；只列membership元数据，ORDER BY department_id，不按grant筛选。 |
| GetNativeProjectPolicyLocator | WorkspaceID W, ProjectID P → {ProjectID,WorkspaceID,DepartmentID UUID, Revision int64}；native project LEFT JOIN policy，仅元数据；missing policy返回nullable department/revision（generated pgtype），不得读title/workflow。 |
| LockNativeCreateProject | WorkspaceID W, ID P → {ID,WorkspaceID,WorkflowID pgtype.UUID}；仅三字段metadata FOR SHARE，调用前已锁相应policy及全部部门；不存在解释为指定项目不可见，其他错误500。read/create授权通过后才以既有同Tx GetProjectInWorkspace读完整行，并核ID/WorkspaceID/WorkflowID三绑定；变动按既定重定位规则，不授权前读取title/description。 |
| GetNativeDepartmentCreateFacts | WorkspaceID W, DepartmentID D, UserID U → {Member,CreateProject,CreateIssue bool}；EXISTS当前membership及精确department_access_grant。 |
| GetNativeProjectCreateFacts | WorkspaceID W, ProjectID P, DepartmentID D, UserID U → {DepartmentMember,Read,CreateIssue bool}；三个独立EXISTS，不看role/creator。 |
| InsertNativeProjectPolicy | WorkspaceID W, ProjectID P, DepartmentID D → error；plain INSERT revision=1。 |
| InsertNativeProjectGrant | WorkspaceID W, ProjectID P, UserID U, Action string → error；只调用read/create_issue两次，无ON CONFLICT。 |
| InsertNativeIssuePolicy | WorkspaceID W, IssueID I, DepartmentID D → error；plain INSERT visibility=ordinary/revision=1，无issue grant INSERT。 |
| CreateNativeProject（仅project.sql） | CreateProjectParams原13字段＋ID UUID → db.Project；原列/default完整保留，显式本次NewV7 ID；旧CreateProject及消费者不改。 |
| ListNativeProjectIssueLocators | WorkspaceID W, ProjectID P → []{ID,WorkspaceID,ProjectID,DuplicateOfIssueID UUID, Status string}；仅root元数据，ORDER BY id；不读title/body；duplicate只记录不扩展为source依赖。 |
| NativeProjectHasResources | WorkspaceID W, ProjectID P → bool；EXISTS元数据，必须项目授权后执行，不SELECT resource_ref。 |

复用现存LockIssueStatusCatalogShared、LockIssueReadMember/Department/ProjectPolicy/IssuePolicy/NativeIdentity/SourceLink/AnchorIdentity、GetIssueReadLocatorByID/PolicyLocator/SourceLink/GrantFacts、GetIssueSourceContextByID与现workflow/status/counter/duplicate/position查询；不改旧SQL。新query各自SQL/Scan/rows.Err故障可注入。
service/native_creation_access.go：严格沿§4三个类型及四方法精确签名；新增 ValidateNativeCreateInputs(p IssueCreateParams, opts IssueCreateOpts) error；NativeCreateDecision私有tx/q/newID/actor/department/project/kind/consumed，零值/错kind/错newID/错creator/重用拒绝，不能导出tx或承接旧资源adopt。typed NativeCreateError{Kind NativeCreateErrorKind} 对应§4八类错误，其余原样wrap传播500；nil意图第一步拒，Entitlements调用与Begin均0。
IssueCreateParams新增NativeCreate *NativeCreateIntent；IssueCreateResult新增NativeData NativeIssueCreateData 与 NativeResponse []byte；NativeIssueCreateData{Issue db.Issue; IssuePrefix,StatusCategory,StatusName string}全来自同Tx。为满足编码失败也不201，IssueCreateOpts新增 PrepareNativeResponse func(NativeIssueCreateData)([]byte,error)：handler提供只复制/编码现IssueResponse的纯函数，不能收q/tx，不query；同Tx INSERT/policy后、commit前调用并缓存，commit成功后发缓存body且广播不再pool填充。非HTTP调用可nil回调，仍同Tx校验所有native投影字段；回调错误rollback。该callback为窄编码接口，不是授权stamp。
ReadNativeProject保持§6冻结签名；NativeProjectReadData{Project db.Project; IssueCount,DoneCount,ResourceCount int64; ResponseJSON []byte}不含q/scope。native_project_read.go内部纯wire投影与现ProjectResponse字段逐项对应，commit前json.Marshal得到ResponseJSON；handler只发送缓存。测试对比原生字段/null/日期/default，禁止创建第二业务模型；编码/日期投影错即500。
唯一两个共享纯helper仍精确为 issueReadVisibilityClassified(visibility string) bool、issueReadFactsAllowed(visibility string,facts db.GetIssueReadGrantFactsRow) bool（实现逐字沿§6）；resource_access.go仅原472条件和480赋值改调用，其余字节不动。NEW统计planner可复用现issueReadIdentity/issueReadPlan/排序工具，不导出或复用IssueReadScope作写权。
handler/native_resource_creation.go：nativeResourceCreateActorFromRequest(*http.Request)(service.NativeCreateActor,error)调用现nativeWorkspaceCreateUserFromRequest再绑定middleware workspace（native session原WorkspaceID须空），不改A helper；decodeNativeProjectCreateRequest/decodeNativeIssueCreateRequest返回原Request＋intent，统一1MiB完整读取、递归duplicate检测、白名单与presence/null/type，先认证再decode；仅CreateProject/GetProject/CreateIssue接入，不改GetIssue。

### 10.2 原Tx执行与拒绝事实

| 路径 | 具体顺序／失败出口 |
|---|---|
| POST project | verified→严格body/纯enum/date/unsupported→NewV7→Begin→workspace KEY SHARE→catalog shared→member SHARE→membership locator→sorted department SHARE→当前membership/create_project→Default无handoff→CreateNativeProject→policy→read/create_issue grants→native DTO编码→Commit→event/201。0部门403；多部门省略409；外部门/无membership即使有grant403；拒绝前不查title/workflow正文。 |
| POST issue | handler去掉pool status/project/parent/workflow/handoff/prefix/filler分支；service先nil/actor/unsupported拒（包括opts延迟任务），再容量provider、NewV7、Begin→workspace→catalog→member→locator→sorted departments→sorted project policies→native projects SHARE→project read再create_issue→既有同Tx GetProjectInWorkspace完整行并核ID/WorkspaceID/WorkflowID三绑定→同Tx workflow/status/default handoff检查→duplicate advisory→counter/position→原CreateIssue使用同newID→ordinary policy→native prefix/category/response编码→Commit→原事件/analytics。无read404、有read无create_issue403，部门不符400；projectless需要部门create_issue，不借create_project。 |
| GetProject | workspace/catalog/member后只收metadata：root project＋root issues＋一跳attached sources及其project/department完整并集；一次排序锁departments→project policies→native projects→issue policies→native issues→source/anchor，之后重验全部binding和当前facts；root授权后才项目正文/资源EXISTS，授权有resource422、未授权404；候选根按r2 structural＋两helper读权，source也须读权。snapshot只授权后验证版本/身份，坏JSON500，身份不符/缺anchor不计数；不hydrate thread、不追source-of-source。当前catalog terminal子集计done，duplicate不可读不减root。 |
| Tx/错误 | pgx.ErrNoRows仅指定member/locator/policy存在性转换业务拒；SQL/Scan/rows.Err/constraint/catalog/count/marshal/begin/commit均500，取消不成功；defer带WithoutCancel＋5s超时真实rollback，cleanup错不允许重试。binding变动只允许全新Tx一次；第二次404；deadlock/timeout不retry成功。commit已落盘但reply丢失仍500/无event、无新建重试；结果可已存在，不能谎称rollback。 |

### 10.3 精确测试children（下列候选当前NOT RUN）

复用现TestMain/NewRouter、handler既有owned fixture/spies、service newAccessFixture/accessTraceTx模式；只在NEW测试文件里定义薄嵌入pgx.Tx/Row/Rows包装器，按SQL name注入并先真实写再故障，复用nm03aPostwriteTx的Scan后/真实commit丢reply/有界rollback设计，不修改旧helper/TestMain。真实两连接barrier沿accessTraceTx.before＋channels，取pg_blocking_pids验证确实阻塞，不sleep-only；retain随机owned图，不DELETE/回填。
| 新父selector（锚定完整名称）/children | 输入／精确断言（映射§） |
|---|---|
| ^TestLocalNM03BNativeCreateRead$/DepartmentReadNotWrite | 实际NewRouter：同部非creator读project200、ordinary issue的UUID与identifier均200；无权/缺失两locator均固定404 {"error":"issue not found"}且无marker；project内POST无create_issue403，前后native/ACL/counter/task/附件/通知快照相同（§5）。 |
| 同父/ProjectReadFutureIssue | 实际NewRouter：B1跨部仅project read，授权之后新ordinary issue的UUID与identifier均200；child grant0，private兄弟两locator均固定404 {"error":"issue not found"}且无marker（§5–6）。 |
| 同父/ActionSeparation/{CreateOnly,ReadOnly,SingleIssueOnly,AdminNoGrant,CreatorNoGrant} | 实际NewRouter：create-only无read项目GET/POST404；read-only读200写403；single-issue仅该issue的UUID与identifier均200、项目404、兄弟两locator均固定404 {"error":"issue not found"}且无marker；admin/creator不补权，两issue locator同形404（§5）。 |
| 同父/DepartmentSelection/{Zero,MultipleOmitted,ExplicitAllowed,Foreign,GrantWithoutMembership,MissingAction,ProjectMismatch,ProjectlessCreateProjectOnly} | 依次403/409/201/403/403/403/400/403；失败所有副作用0，明确多部门不按grant数选部门（§3,5）。 |
| 同父/OldUnclassified/{Project,Issue,Creator,Admin} | 旧project读/创建child404，旧issue读404，creator/admin同拒；原policy/grant/count/row无ensure回填（§4–6）。 |
| ^TestNativeResourceCreationInput$/Project 和 /Issue 的 /{field}/{case} | 对§3每行字段逐个具名子例 Omitted,Null,Empty,WrongType,ZeroUUID,NoncanonicalUUID,ValidAllowed,ValidUnsupported；不适用组合不生成假PASS。枚举title/status/priority/visibility逐值；双键assignee/lead/origin枚举OnlyType,OnlyID,BothNull,NullType,NullID,EmptyType,EmptyID,InvalidType,InvalidUUID；数组逐字段Empty/Null/Scalar/BadElement/NonemptyValid，properties Empty/Null/Array/Nonempty；workflow ExplicitDefault也422，private Project和Issue都422（§3）。 |
| 同Input父/JSON/{Scalar,Array,Null,Empty,Malformed,UnknownTop,UnknownNested,DuplicateTop,DuplicateNested,TrailingJSON,OversizeWhitespace,OversizeChunked} | 400且Begin/任何资源查询/外部容量调用0；duplicate检测先于unsupported422；认证失败先于body错误（§3）。 |
| ^TestNativeResourceCreationCredential$/{Missing,Native,Unmarked,PAT,MAT,MCN,ZeroUser,InvalidWorkspace,BoundMismatch,Agent,Task,ForgedHeaders} | Native沿真实verified适配，其它401/403且不查资源，不认伪header或role（§3）。 |
| 同cmd父/NoAssignment/{Self,OtherMember,Agent,Squad} 和 /NoHandoff/{ProjectDefault,ProjectNamed,OutsideDefault} | 有效显式assignment全422，不查询受派者；无效pair400；授权后默认/项目workflow有handoff422；native/ACL/counter/task/attachment/notification0；两null/省略允许未指派（§3）。 |
| 同cmd父/DuplicateRedacted/{PrivateUnreadable,AllowDuplicate,ConcurrentSameTitle} | unreadable私密同title仍409，JSON恰code/error固定body无ID/identifier/title/marker；不调用prefix/filler；allow_duplicate201，编号唯一（§3,5）。 |
| ^TestNativeCreatePreflight$/{NilIntent,ZeroActor,WorkspaceMismatch,CreatorMismatch,Private,Assignment,Parent,Origin,Stage,Source,Attachment,Label,Property,DeferredRun} | 直接service Create；typed403/422，外部容量provider调用0、Begin0、SQL0、通知0，拒绝不等于上游source/channel/autopilot先前副作用已解决（§4,8）。 |
| ^TestNativeCreateDecisionBinding$/{Zero,NilTx,Cancelled,WrongKind,WrongWorkspace,WrongProject,WrongNewID,WrongCreator,Consumed,NoAdopt} | 每个无INSERT；缺newID/invalid actor403，内部伪decision500；真实正确new row一次成功且原tx/q单一；禁止旧ID adopt（§4）。 |
| ^TestNativeCreateTransactionAtomicity$/Project/{Begin,Workspace,Member,Department,GrantFacts,Catalog,Workflow,NativeInsert,NativeScan,Policy,ReadGrant,CreateIssueGrant,Trigger,Encode,Precommit,AppliedCommit,Cancel,RollbackError,ClosedRollback} | 每点命中记录；除AppliedCommit已知落盘但返回500且无event外，其余实际rollback后native/policy/grant/counter/task/附件/通知与before相同；取消cleanup上下文未cancel且deadline≤5s；无第二Begin/重建（§4–5）。 |
| 同Atomicity父/Issue/{Begin,Workspace,Catalog,Member,Department,ProjectPolicy,ProjectShare,GrantFacts,Workflow,Status,Duplicate,Counter,Position,NativeInsert,NativeScan,Policy,Trigger,Projection,Encode,Precommit,AppliedCommit,Cancel,RollbackError} | 对counter/INSERT/policy先真实成功后注错，独立连接复查整Tx回滚及编号不耗损；AppliedCommit精确只一份committed图且返回500/通知0，不能把该例标成全rollback（§5）。 |
| ^TestNativeProjectRead$/Visibility/{Department,ProjectRead,DirectIssueRead,PrivateNoGrant,PrivateDirect,NonReadOnly,PolicyMissing,ProjectMismatch,AdminNoGrant,CreatorNoGrant,DoneVisibleOnly,UnknownVisibility} | root counts仅可读集合、private marker不出body、create/edit不是read；未知visibility不查facts；project read拒形404且无DTO（§6）。 |
| 同ProjectRead父/Source/{Denied,Unclassified,Authorized,MissingAnchor,SoftDeletedAnchor,AnchorCrossIssue,MismatchedSnapshot,MalformedSnapshot,SourceOfSource,DuplicateDenied,NoLinkConcurrentInsert} | 与现TestGetIssueReadRelatedProjection逐例同语义；坏snapshot500，source不读/身份错不计根，一跳不扩展；dup不可读根仍计；新link晚插不混用未锁行（§6）。 |
| 同ProjectRead父/Resource/{Authorized,Denied,Empty} | 422固定error/无DTO；404无资源存在泄漏；200且resource_count0有真实EXISTS证据，SQL不得读resource_ref（§6）。 |
| 同ProjectRead父/Fault/{Begin,Workspace,Catalog,Member,RootLocator,IssueLocators,SourceLocator,Department,ProjectPolicy,ProjectShare,IssuePolicy,IssueIdentity,SourceLink,Anchor,Facts,ResourceExists,SnapshotScan,StatusCatalog,RowsErr,Projection,Encode,Commit,Cancel,Cleanup} | 每点真实query/Scan/rows.Err/commit注错均500/不200不伪0；无fallback pool或逐issue嵌套Tx（§6）。 |
| ^TestNativeCreateLockOrder$/{ProjectTrace,IssueTrace,StatsTrace,WorkflowWriter,DeleteWorkspace,IssueReader,SameTitle,DifferentTitle,ProjectBindingRetry,SourceBindingRetry,SecondChange,Deadlock,Timeout} | trace锁rank/UUID顺序及单tx backendPID；workflow writer持catalog→project UPDATE时真实barrier，create/stats不能绕过SHARE；delete持workspace UPDATE时阻塞首锁；reader并发不反转；same title1success+1generic409，different均201且编号唯一；binding一次rollback新Tx，二变404，deadlock/timeout500且无201。StatsTrace强制source低序部门/项目，证明完整并集预收齐（§5–6）。 |

现有可运行回归必须原字节跑：^TestLocalNativeCreateRead$、^TestGetIssueReadCredentialGate$、^TestGetIssueReadDenialShape$、^TestGetIssueReadRelatedProjection$、^TestIssueReadAccessPolicy$、^TestIssueReadAccessAssociationRetry$；GET53/service42保持原字节实跑，各自run/pass/fail/skip/rawSHA单列，不用compile/通配总数冒充通过。旧 ^TestR1ACLNM02IssueReadCrossDepartment$ 硬锁旧641/lab/OTP/PAT，原字节保留并明确SETUP/HOLD；不改guard、不恢复旧实验/框架，不将NEW Bcmd覆盖转记该旧selector PASS。新增Bcmd DepartmentReadNotWrite/ProjectReadFutureIssue/ActionSeparation三个children承担同部/跨部/单issue的真实router双locator与固定404同形覆盖。新测试必须先真实meaningful RED再最小source GREEN；执行DB仍Root独占既有精确lab，service/handler package开跑前先验证各自TestMain不会触别库；不能用TestMain exit0或SKIP记PASS。
开窗请求：Root＋独审仅对本manifest接口/child矩阵ACK后，在§7精确写集内分次开放NEW测试→RED→production；共享query/generated/r2单hunk由同一implementer唯一写者承担，不触其他WIP。M1不是自行授权生产。

### 10.4 M1 beforehash（SHA256；本次只读来源）
| Path | SHA256 |
|---|---|
| server/internal/handler/project.go | ED8F25B69498CABD456F21BFCC2438611BD9E8AC26B73ED0F562A504087E3D2C |
| server/internal/handler/issue.go | 566790B3071CAAB6371177741CEF9B5054B67A870B51ED7ACD8FFDB628708AFD |
| server/internal/handler/native_creation.go | 63092AA70A2FCDB5B3639B39A307C540DBD31305871BCABF3E5CAEDF7666132A |
| server/internal/handler/issue_access.go | C65DB4E07D66A7E47DD4D9492C5608AF2CCBDA6A3553B30C95B8D9E353CB52A8 |
| server/internal/handler/source_context.go | 91509EE13212C69627705E1D50680299D5FDAAADF9C4D657090C2D03E002B3EC |
| server/internal/handler/native_creation_test.go | B0939E2B6FCB053BC7AC5AE8A1E7B8CE0627918DFE7F4A9C98F7D625BA2CC868 |
| server/internal/handler/issue_access_test.go | 2002C3D38D4416A8932307233EB4B79155529517225DEDDAB920B541B8A79226 |
| server/internal/service/issue.go | 17749AE5E685ECD59347C76B8CC1EECAEB477CFBE4B8397D3C9A0C45D5919AB2 |
| server/internal/service/resource_access.go | E32BB3DEA3C3D756F450CD291DCA911A2E34A3E2C21E9E700EF51EBCBF35A083 |
| server/internal/service/resource_access_test.go | 4520438893A890EF0BE6D2685A7BF8B88A462A3159FE68ED124E758BB08BDD20 |
| server/internal/service/source_context.go | EFFC0DBC9D30D1FC1799CE8F758F22239E99B7E2C6D8B6078BAFEF05C6905D84 |
| server/pkg/db/queries/enterprise_acl.sql | 93C08646335FDB827CC81B33EBAE543D625F11D656A7A0086757CA08E6BB485C |
| server/pkg/db/queries/project.sql | FFD193C9659D6A82AEE54844376B51C1F2D6F43430F27D5FF0F3F2A4EB43FBD1 |
| server/pkg/db/generated/enterprise_acl.sql.go | 23F45C5B7F7CE5C408F51851E761C3F090555D3BB5B40F3E608061D0A43BD15D |
| server/pkg/db/generated/project.sql.go | 744923E19424426698747B489F28BC7965C66FC1385F189D098A6E483C3C2C5F |
| server/pkg/db/generated/models.go | 429B160734FF4981A932AA469795D3B55BE0241E8BFA7FD421C5DE7A57DDD9BD |
| packages/core/types/api.ts | 4DCEE30A6F86B1435CCA7A3191DC825622851951F6E1E203BF6352841ABA3FDF |
| packages/core/types/project.ts | E0358A4C40D618040A9EEEEE37E78F984D07FF28F81996F3640C4DA0FC9F7EFE |
| server/cmd/server/r1_native_create_read_local_integration_test.go | CD0AB222AC265F1F8D7B34ADD6E8824C394CEB4181AC80B2762B71A37DBC9D45 |
| server/cmd/server/r1_nm03b_native_create_read_integration_test.go | 5447F0B1AE3C761205C9573D27CFA8B5FFBF7520122A9C2C1CD8349F8774F8C6 |
| server/cmd/server/r1_acl_issue_read_integration_test.go | 0364499D70AD20A5E6D2A64DE8759C1D8AA9425DF0448CCE0A02FE80A11C49DA |

## 11. Current source release — Root consumer + independent reviewer ACK
This release supersedes the earlier tests-only source restriction for this B subset only; no BUILD/deployment/Goal acceptance is implied. Bound reviewed M1 SHA F01B2A5A3C5EB02984C33079E1351154447E5409E00B1FB77D10FE892CED0039, owner /root/native_create_read_impl_r1 (gpt-6.1-sol), consumer /root, independent reviewer /root/workspace_invitation_review_r2. Root consumed actual native project-classification RED32E91B2D..., reviewer independently accepted full raw; original natural regression preserved.
Root and reviewer approve the exact §7 production + NEW test paths under §10 M1 interfaces/negative/fault/lock matrix. Sole writer handles query/generated/shared issue/r2 changes sequentially: NEW tests and typed SQL/service first, then handler/core wiring. No parallel shared writer, new migration, dependency, framework, other service, old-source recovery or UI rebuild. resource_access.go only original visibility guard and allow expression one hunk; unknown visibility must still make zero facts query. Existing issue.go GetIssue/WIP and all unrelated old tests remain unchanged. Genuine sqlc only incremental append queries and two corresponding generated files; models drift or any unexpected output stops for a precise ruling, not manual generated edits.
LockNativeCreateProject reads only ID/WorkspaceID/WorkflowID metadata FOR SHARE; authorization precedes existing sameTx GetProjectInWorkspace full read and exact triple binding verification. Any current negative/source or query error may be repaired only within this window; no permission weakening or test deletion. Root alone runs registered synthetic lab, no demo/Supabase/model/credential operation. Intermediate service compile/RED is not wholeB GREEN. Independent final source+raw review, same-candidate GET/native regression and explicit remaining FAIL/SKIP/HOLD are required before any subsequent window/deploy consideration. Existing source51e stays running untouched; credential-copy consent remains separate pending.

## 2026-11-10 product fixes reviewed; remaining B gates continue
Six concrete product P2s now fixed by minimum source changes and original targeted assertions, Root actualRED→GREEN, independent reviewer closed each: stable project/status stats; link/anchor global rank+UUID sort; builtin category; pure enum priority; custom closed terminal; exact private/assignment422. Four test-proof P2s independently closed after actual strengthened evidence (NoAdopt freshpositive, Decision pre-FK zero INSERT, EncodecallbackFired, four required ProjectTrace locks). Detailed bounded latest raw/hash/results in NM03B-CHECKPOINT.json; no totals promoted to fullB.
Actual selected current milestones: native roles13, source/custom-terminal18, exact422text7, issue atomic/decision/locks54, project seen2, project atomic16, department/oldgraph23, B three-entrycredential34—all selected PASS/0skip/exit0. Credential raw is still queued independent review; MCN component uses local synthetic verifier, not real company cloud. Foreign23 case was unknown UUID, not real otherWorkspace department; explicitly unfinished. Project primitive JSON encode error ruled N/A_UNREACHABLE_IN_CURRENT_FIXED_DTO with source error handling retained, not fakePASS; real trigger failure not claimed, owned native23505+counter rollback pending. Original failed runs and Root incorrect slash/case selector BC37 are retained/excluded from terminal proof; precise done/closed REDA00 and GREEN600385 consumed.
Current next sole writer priorities remain actual B NoHandoff/foreign/private duplicate gates, stats fault/retry/secondchange/full-source union lock trace, real native constraint rollback/WrongProject, full remaining M1 input matrix and final same-candidate quality/regression/independent diff. No new framework, no restored old C/641 experiments, no sourcehooks or altered617 trigger. Running original51e/client not replaced. DeepSeek copy consent still separate pending; no actual supplier request/main merge/push/fullGoal completion.

## 12. Focused successor: custom status HTTP error compatibility (2026-11-10)
Current limited candidate DC2A92BA... has494selected parent/child events passing and successful standard backend builds/core typecheck, but is NOT fullM1/BUILD/deployed. A source-review P2 remains: unknown/archived custom status can fall through new native resource writer as500, while native first validation is400 (prior separate archive-race409 is not indiscriminately collapsed). Preserve authorization-first/sameTx catalog validation, no restored pool pre-read or allowed-status detail leakage; real catalog DB failures remain500.
Round4 focused owner /root/custom_status_r4 (actual gpt-6-astra), consumer /root, independent reviewer /root/workspace_invitation_review_r2. Root releases tests-only first: append existing NEW cmd/server/r1_nm03b_native_create_read_integration_test.go for a new explicit-opt-in native OTP/Me/newworkspace no-stored-default selector covering unknown/archived projectless status400 and zero native/counter/policy/task delta; valid custom POST/GET category/name consistency if useful; optional append NEW service/native_creation_access_test.go for an actual catalog query error500 path. No main graph policy/grant fixture insertion, no old test changes, no new framework.
Only AFTER Root consumes meaningful actualRED and exact source diff review, minimum production correction may touch service/issue.go Create status-error handling and handler/native_resource_creation.go typed error mapping within existing M1 scope. Existing actor validity, source guards, locks/r2/A/helpers/schema/query/generated/core/node/lock files remain protected. Baseline source pins DC2A92BA... plus unchanged limited-candidate source; successor must rehash exact changed paths, preserve prior raw evidence and then rerun required samecandidate selectors/quality. No live deployment, model/credential/third-party operations or hidden source window expansion. Original source51e client/Web/API stays running.

## 2026-11-10 r4 final same-candidate limited acceptance — NOT full Goal
Fresh focused owner /root/custom_status_r4 (gpt-6-astra), Root consumer and independent /root/workspace_invitation_review_r2 closed the actual unknown/archived custom-status500 P2: only first sameTx ErrUnknownStatus becomes typed400, no pool read/actor/ACL/query/schema changes, handler and oldsentinel untouched; active custom POST/UUID/identifier category+name exact pass, real catalog query fault stays original service error (HTTP500 dynamic not claimed). ActualRED2BD3229B... and all prior failure evidence retained.
Updated frozen manifest90E48DF5... inheritsDC2A92BA, exactly3approved paths change and22others fixed. Root fresh selected501parent/child events: service178,handler282,native41, all0fail0skip/exit0/stderr0/missingparent0; before/after25source hashes match. Independent reviewer consumed all three full raw logs and pins, ACCEPT limited continued-development candidate only. Root actualr4 gofmtclean/vet3packages0/Windows build0E7534D.../Linux build0983B599...; unchangedcore source strict599 typecheck0 and existing SQLc76outputs lineage retained. Detailed exact hashes in NM03B-CHECKPOINT.json/private r4 pins/raw/quality. Neither494 nor501 means fullGo-suite/M1/BUILD/enterpriseGoal completed.
Remaining exact matrix/fixture/currentUI limits are explicitly preserved, not transferred from unrelated tests: input Cartesian combinations, deadlock/timeout/StatsNoLinkConcurrentInsert/CreateRetry-specific, project creator branch/otherdept identity, old641 SETUPHOLD, UI generic409 actual, two-real-user invitation, real model/fees/device/lifecycle/revoke/dualdevice. Original servedsource51e/client/Web/API remains separate and running, no halfACL rollout. Current Git HEAD96085ec (standalone reviewed invite test+card), index remains empty; A/B source not indiscriminately committed with old unsubmitted dependencies. Dmain/userchanges preserved, no push/mainmerge/production/real-business writes. DeepSeek two-recordcopy consent still separate pending; Root supplier requests0. Continue original Goal; do not mark complete or blocked from this finite milestone.

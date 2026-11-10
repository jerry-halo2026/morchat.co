---
purpose: "NM03 原生创建＋分类同事务候选"
owner: task-owners
status: draft
updated: 2026-11-10
related: []
---
# NM03 原生创建＋分类同事务候选

**DRAFT-r1，2026-11-09。未 TEST-FROZEN／BUILD-FROZEN；本文不授权产品写入、迁移、DB执行或部署。**

- Task-ID：R1-NM03-NATIVE-CREATION-CONTRACT；规格 owner `/root/native_creation_contract`，实际模型 `unknown`；消费者／集成人 `/root`，实际模型 `unknown`；独立审核人由 Root 另指派，owner 不自审、不代签。
- 唯一当前写集：NEW 本文。产品、旧契约、任务卡、测试、Git 索引、DB、运行服务写集均为空。
- 实读工作树 `E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co`，`codex/round1-continuous`，HEAD `51e23d9e7a8d6d3b3cdf46db7df68ad1b0938271` 加现存 WIP；不是干净 HEAD 快照。`D:/dev/morchat.co/main` 不改。当前 demo 为已提交 source-51e23d9，不装入半套 ACL，不干预 Web/API/PG/Desktop/daemon。
- 权威输入：根 AGENTS、docs/README、PRD、ARCHITECTURE §4.1、Discovery、ENGINEERING、DEVELOPMENT-HANDOFF、ACTIVE、CURRENT-GOAL、R1-ACL-r1（特别是 deferred NM03）、R1-ISSUE-READ-GUARD-r2-spec、NATIVE-CREATE-READ-SLICE、GET-GUARD-LOCAL-CHECKPOINT。本文只提 NM03 增量，不改这些现行字节或冻结状态；冲突必须由各 owner 在独审后签正式 successor。

## 1. 结论、事实与取舍

**建议先冻结“新 Workspace 单初始部门 → 普通 Project／Issue 自然创建 → 原 GET 授权读取”的最小候选；分类与原生记录同 Tx，写权另存显式动作授权。** 这修的是创建入口缺少分类／授权落库，不是把 GET 的 fail-closed 改成 creator 可读。

已由 Root 独立核验且本 owner 未重跑：新测试 `server/cmd/server/r1_native_create_read_local_integration_test.go` SHA256 `cd0ab222ac265f1f8d7b34add6e8824c394ceb4181ac80b2762b71a37dbc9d45` 经过真实 native OTP→Me，POST workspace/project/issue 全201且响应断言成立，UUID／identifier 正向 GET 均404，WrongPrefix404 PASS；实际4run/1pass/3fail/0skip。raw `E:/CodexData/morchat-r1-local/run/multica-local-demo/guard-retest-20261109/native-create-read.stdout.jsonl` SHA256 `85d84f16d553b29c98c455991b68eb3ff436d1c6b164c02e88ea3b1fd9ebdc17`。Root 只读 PG 已确认真实 issue/member 存在、新 workspace 的部门、部门成员、project policy、issue policy 全0。此为自然业务 RED，不是旧测试 Auth403；不再 SQL 或重建实验复证。

候选比较：
1. creator/admin／缺 policy fallback：代码少但违反已确认权限，否决。
2. 只在测试补 policy 或返回后异步补分类：掩盖自然缺口／存在可观察半提交，否决。
3. **新 Workspace bootstrap 真实部门与动作能力，所有创建在原事务落完整 policy**：最短安全候选，推荐；代价是新增一个小授权表，以及明确的未支持边界，不声称完整组织后台／旧公司 adoption 完成。

公司=Workspace 已确认，不再讨论。下面“初始部门”和动作表是 owner 的工程候选，不冒称 Ethan 已批准默认部门；独审并冻结前不得实施。

## 2. 实际源码裁决

| 实读位置（相对工作树根） | 当前事实／对修复的约束 |
|---|---|
| handler/workspace.go:241–396 | CreateWorkspaceRequest=name/slug/description/context/issue_prefix；原事务 CreateWorkspace→CreateMember(role owner)→Ensure built-in statuses→Commit，之后 analytics/daemon通知/201。现无部门／ACL插入；可直接在原 Tx 内补齐，不另建 workspace 服务。|
| handler/project.go:116–136、270–504 | title、description、icon、status、priority、lead、dates、workflow_id、resources；无资源时直接 pool INSERT，有资源才 Tx。**必须取消无资源非事务分支**，不是只修带资源分支。|
| handler/project.go:203–233 | GetProject 仅 Workspace 范围读取，随后 pool 统计全部 issue／resource count；不能将其现状标为项目授权完成。|
| handler/issue.go:3034–3080、3185–3569 | 当前 CreateIssueRequest 无 department_id／visibility；自定义 Unmarshal 拒重复键，但普通未知字段仍忽略。handler 会先 pool 读 parent/workflow/status；必须先建立可信 actor、禁止未授权预读/错误泄漏，再在 service Tx 做最终决策。|
| service/issue.go:235–567 | 实际创建 Tx 在 service；property advisory→可选 source issue/comment锁→workflow→custom status共享锁→parent/project读取→labels→duplicate advisory→AllocateIssueNumber(workspace counter UPDATE与容量检查)→position→Issue INSERT→source/labels／可选 deferred task→Commit；之后附件关联、广播、analytics、enqueue。不能在 handler 返回后补 policy。|
| service/issue_limit.go:87–111；issueguard/duplicate.go | 编号／容量原子性依赖原 workspace counter；duplicate409当前可带完整旧 Issue。ACL前置后仍需阻止私密 duplicate 泄漏，不能盲用旧错误响应。|
| migrations/617_r1_acl_nm02.up.sql | 六张 companion 表，policy revision固定1；project grant只有 read/create_issue，issue grant只有 read/edit_title；无部门 create_project／非项目 create_issue 表达。即时 NO ACTION FK；所有六表 UPDATE/DELETE 由通用触发器以0A000拒绝；没有受支持的重分类／移除。|

此处 handler/*、service/* 均在 `server/internal/`。目录实核最高数字为618（618_supabase_identity）；Root确认 lab 的642是迁移完整 stem ledger行数，不是最高数字。新迁移仅候选 `619_r1_native_creation`，正式冻结前由 schema 唯一写者重核分配；不修改617已落库历史，也不占643。

## 3. 最小数据与动作语义

### 3.1 新 Workspace bootstrap（仅新资源）

保留原生创建开关、邮箱 allowlist、slug/prefix校验、真实人类 session校验。用户必须经生产 Auth 形成 `VerifiedCredentialSessionJWT`＋`VerifiedSessionProvenanceNativeV1`；不是原始 header／PAT／task凭据。workspace 创建发生在尚无 workspace 的认证上下文，不能强制伪造 workspace header 或复用要求已选 workspace 的 issueReadActorFromRequest。

在原 CreateWorkspace Tx 中依次写：原 workspace；原 member(owner)；新 `department`（新UUID，name精确候选“初始部门”，revision1）；该真人的 `department_member`；该真人的部门动作 grant `create_project`、`create_issue` 各一行；原 statuses。任何一步失败全回滚，commit前无201、广播或daemon通知。

这是**新公司初始化时显式 provision 的业务能力**，不是以后看见 member.role=owner／creator_id 就授权。bootstrap仅随刚插入的全新workspace执行，不能在后续读／建项目时“ensure默认部门”。部门身份用UUID，不以中文名、最小UUID、最早行、owner、测试flag识别。后续邀请／新成员不自动入此部门或自动获写权。本切片没有组织后台或授予动作 API。

### 3.2 新部门动作表（候选新迁移）

新增 `department_access_grant(workspace_id uuid, department_id uuid, user_id uuid, action text)`；PK四列；action CHECK仅 `create_project`,`create_issue`。复合即时 NO ACTION FK分别指 department(workspace_id,id)、member(workspace_id,user_id)；user查找索引(workspace_id,user_id,department_id,action)。沿617同一通用 append-only拒UPDATE/DELETE触发器；不加epoch／角色／重复member／任务正文。此为需独审接受的原生“避免新增FK”惯例例外，不能静默扩大。

不改617的action CHECK，不把project create_issue借作部门权；不存能从名字推导的“默认”标志。新表无通配符／read动作，没有 grant 就没有相应写动作。迁移不扫描／回填任何旧workspace。DOWN只处理本迁移的新表及其触发器，不级联删除业务，不触碰617；有数据的DOWN是有损操作，绝不当在线撤权／修复命令使用。

### 3.3 创建 Project

API新增可选 `department_id`（UUID字符串；null、空串、非UUID拒400）。省略时只允许 actor 当前**恰好一个**真实部门membership，且有该部门create_project grant；0个或无grant拒403；多部门拒409 `department selection required`，不得任选一个。明确 department_id 必须是本workspace、本人membership且有create_project，未知／外部部门同形403，无部门名称回显。

一律原生 Tx：锁和当前事实重验→原Project INSERT→同部门project_access_policy revision1→给当前已授权发起人project read与create_issue各一行→Commit→原生201及广播。为何给项目能力：部门create_project是建立该项目及初始操作权的显式provision动作，落成具体read/create_issue行后所有读取／后续创建仍查这些行或部门membership；**不存在creator字段快捷路**。不产生issue子grant、不授edit_title/general-edit/manage/device权限。

项目read = 当前native member且（该policy部门membership OR project read grant）；不是native管理员通行。create_issue另查，read本身不赋写。初始创建者若未来授权生命周期移除，creator字段不救回权限（本轮尚不实现移除）。

### 3.4 普通 Issue（有项目／无项目）

- 项目内：项目policy必须存在且可读；还必须有同project的显式create_issue grant。部门可读、单issue read、owner/admin均不代替它。department_id省略则取**锁住的项目policy部门**；显式提供必须完全一致，否则400，不能借建单重分类。新issue_access_policy取该部门，visibility=ordinary，revision1。
- 项目外：按3.3相同单部门默认／多部门显选规则，要求真实部门membership＋部门create_issue grant；不把create_project／部门可读当create_issue。
- 同service原Tx插入policy，必须在原Commit前完成；不新开嵌套Tx，不用pool补写。所有错误，包括policy唯一/FK错误，回滚原Issue、编号、native触发器副作用、labels等实际在Tx内的写入。无新增issue read/edit_title grant：读取依据部门membership或当前project read继承；创建者不能自动改标题。title编辑继续原独立切片契约，未BUILD，不能用create_issue冒充edit_title。
- 项目read grant会实时覆盖随后自然创建的普通issue；不复制B1等跨部读者的issue grant。create_issue-only但无read的用户不得创建并借201读取内容；结果为404项目不可见。read-only可读但POST403。单issue授权不打开项目／兄弟任务。

### 3.5 private、多部门、未知字段及范围

原生输入无visibility，当前未知字段忽略会把用户的private意图丢掉。候选增加 `visibility`：缺省或精确ordinary可用；private明确422 `private creation is not supported in this slice`，不得降ordinary；其它值／null／错误类型400。Project请求任何private／visibility意图也明确拒绝，不忽略。

本首候选仅普通、人类、直接创建：保留原生标题、描述、默认状态todo／planned、优先级none和日期等纯元数据；**非空 parent_issue_id、source context、origin、stage、attachments、labels、properties、resources、lead、非默认workflow选择、Agent／squad assignee及实际workflow自动handoff均显式422且零写入**。空数组／空properties对象可沿原生“无附加功能”语义；禁止借null／未知键绕过分类字段校验。声明未知字段或动作字段必须严格拒400，重复键／多JSON文档拒400；不能只添加Go字段继续静默忽略private或grant/user/role字段。

这不是这些原生功能可删除的决定；是**本窄候选不支持且完整可用版本尚未交付**。parent继承、private创建与单独授权、附件／source-context、Agent／channel／autopilot等必须后续同事务动作契约补齐，不借普通默认扩权。多部门API支持明确department_id，但本轮不新增组织选择UI；UI多部门操作仍未完成。

## 4. Tx、锁序、重验与副作用

### 4.1 现有workspace上的创建锁序

每个新创建事务 READ COMMITTED，所有数据决策使用同一个 `db.New(tx)`／qtx。前置云容量指令仍按原生在Tx外获取，不在锁内联网。可信actor只由生产Auth适配；新增service意图携带经适配的user/workspace与请求分类，不接受HTTP用户／role／revision戳授权，不给nil意图留下legacy许可通道。

**统一创建顺序候选：**
1. native workspace `FOR KEY SHARE`（新命名typed query，非借用chat语义）；先与DeleteWorkspace的FOR UPDATE互斥；共享锁不把所有创建串行。
2. Issue创建需要状态catalog时先共享advisory锁；候选为避免handler pool/workflow回读反转，可在Issue创建统一先共享catalog，再在授权之后解析最终status。无exclusive/global锁。Project创建无需状态catalog。
3. actor native member `FOR SHARE`；相关department去重后UUID升序 `FOR SHARE`。
4. 已有project policy `FOR SHARE`，native project identity `FOR KEY SHARE`；再查当前department_member／department_access_grant／project_access_grant事实。顺序与GET已有 member→department→project policy相容；不在后段回头新增较低序结构锁。policy／department修改仍受617拒绝，不伪称完整撤权锁协议。
5. ACL通过后才在qtx读完整项目/workflow，确定最终普通分类／无handoff；再取原duplicate advisory锁，随后原workspace counter UPDATE／容量／position和新行INSERT；新policy及provision grant随新行写入。**不先锁counter再等duplicate锁**。

为什么workspace最前：当前DeleteWorkspace先FOR UPDATE再遍历子表；创建若持部门/项目锁后再等workspace counter会形成删除锁反转。KEY SHARE与counter的非key更新兼容，不新增全局串行；原子编号仍由原Counter UPDATE短程串行。不以全Workspace排他锁解决共享资源问题。

本候选不为不存在的新Issue或Project提前锁虚构policy。原生project不存在／policy缺失／部门不一致是404且零写入，基础设施错误500不能伪404。如果native project/workflow身份在locator和锁后不一致，整Tx回滚，最多一个新Tx重新定位；仍不稳定404，无第三次重试、无持旧锁追加低序锁。锁超时／deadlock错误整Tx失败500且不回201。没有循环重试副作用。

### 4.2 原子性与安全输出

Workspace原Tx扩展；Project无资源分支也归一原Tx；Issue复用现service Tx。begin/query/scan/constraint/marshal/commit错误全走rollback；commit结果不确定不能发201或重建一个“补偿issue”。rollback仅撤未提交Tx，不DELETE已提交append-only数据。

policy在原Commit前成功。新scope／事务不跨请求复用；GET仍走原r2的当前事实与scope失效协议，不能把创建receipt或201当永久授权。创建响应保持native shape与metadata空对象；尽可能在commit前完成纯响应构建，commit失败无成功body。status/prefix/workflow等权限相关读取不走pool。

duplicate409改为固定通用冲突，不携duplicate Issue/title/id/identifier；不要对不可读私密duplicate调用旧issueToResponse。保留duplicate串行／allow_duplicate原子性，不因过滤掉不可读duplicate而改变防重判定。

原生事件广播／analytics／attachments／enqueue当前在commit后执行；本候选禁用需要attachments/assignment的创建分支，不能让失败分类留下后台任务。仍保留并检查原生search-index等Tx内trigger行为。**EventIssueCreated/ProjectCreated总线及WS订阅尚非部门授权交付面**：即使commit后发布正确policy，也不能证明广播接收者安全；本轮只合成隔离API验证，进入实际多人demo前须完成对应fanout/列表/搜索等门禁，不把“后commit”当授权过滤。

## 5. Project GET 与原 Issue GET 同候选收束

NM03除自然POST闭环，必须补真正GetProject read检查；不是只给project policy却继续Workspace-wide GET。请求使用生产verified native session；Tx内member→department→project policy→native project锁后重验，read规则见3.3，404不含项目内容；数据库错误500。project grant只有create_issue而无read也404。

项目原生响应字段保留，但 `issue_count`／`done_count` 必须只统计当前actor可读的issue（有效且同部门policy，ordinary部门／project继承或明确issue read；private仅issue read）；不能直接沿用GetProjectIssueStats对全项目计数。`resource_count`候选定义为已授权项目元数据的资源数量，**不是**资源内容／文件／本机目录或设备授权；本首新项目不创建资源，读现有有资源项目仍须另审其metadata统计边界，不能以零值伪造或悄悄泄漏。所有统计失败必须500，不吞成200/0；完整DTO在commit前缓冲，commit成功后再发。

Issue UUID/identifier与WrongPrefix继续原r2代码／断言；不得放宽credential、missing policy、private或关联source/duplicate规则。现r2只是窄源测试成果，尚未BUILD；**NM03创建和原GET兼容／lifecycle没有同一候选收敛前，两边都不能单独宣布整产品可用**。

## 6. 既有Workspace adoption与lifecycle：明确未完成

- 当前已存在但无部门／policy的workspace（含真实demo）不会被读时／POST时自动bootstrap。缺部门／动作grant拒创建；已有无policy项目／issue继续404。不得把历史真实业务全改ordinary，不按owner/creator推断部门。
- adoption必须后续逐workspace确定责任部门、成员、每个旧项目／任务ordinary或private、明确动作授权与审核清单；冲突或未知保持未分类。工具可以复用同生产插入规则，但本轮没有写SQL/迁移回填授权，没有“把全部塞初始部门”方案。即使本切片新Workspace完全GREEN，**已有Workspace后续adoption仍为未完成目标**。
- 617是append-only，NO ACTION FK使删除Workspace/member/project/issue及部门移除可能拒绝；原生member.role修改不是撤业务权。新部门grant进一步持有member/department，不解除这些约束。不能用关闭trigger、CASCADE、TRUNCATE、手删ACL、DROP617让旧测试清理变绿。
- 已实读 DeleteProject:633–704（锁project→清chat/view→Delete→Commit）、DeleteIssue:4418–4575（先CancelTasks/FailAutopilot，再Tx detach children/clear duplicates/source/object intents/Delete）、DeleteWorkspace:1141起（先Qoder cleanup/cache invalidation，再Tx workspace锁及批量清理），以及member.sql DeleteMember。**DB拒删不等于API无副作用**：Issue取消任务、Workspace预清理在删除Tx外，故不能声称失败全回滚，更不能把删失败当撤权成功。
- 该生命周期阻断是实际兼容欠账：独立后继需动作级授权与在副作用前拒绝unsupported、批量/leave/remove成员和跨模块清理锁审查。本文不扩成完整删改／组织后台，不为只读/创建切片顺手放开它；在此之前BUILD/多人运行放行仍HOLD，当前demo保持原提交版本。

## 7. 精确候选写集与消费者（不是当前授权）

以下均相对唯一E工作树；任何额外写必须先修订并审核。先由Root协调共享热点唯一写者；不能覆盖现issue.go、models.go、enterprise_acl的WIP。

**最小生产候选：**
1. NEW `server/migrations/619_r1_native_creation.up.sql`、`.down.sql`（数字仅候选；只新部门grant，不改617/618）。
2. MODIFY `server/pkg/db/queries/enterprise_acl.sql`；生成 `server/pkg/db/generated/enterprise_acl.sql.go`、`models.go`（sqlc精确输出；其它生成漂移停止）。新增typed workspace-create-lock、部门选择/创建事实、bootstrap INSERT、project/issue policy INSERT、project grant INSERT、project read/filtered-count查询；不inline业务SQL，不改旧GET查询语义。
3. NEW `server/internal/service/native_creation_access.go`（仅Tx-bound创建/项目读取授权、错误类型，复用现有事实；不另造policy evaluator／业务库）；MODIFY `server/internal/service/issue.go`（params新增可信创建意图，Create同Tx授权/分类与错误输出约束）。`resource_access.go`只读，原GET scope不被重构成generic写通道。
4. NEW `server/internal/handler/native_creation.go`（verified credential适配、分类字段及严格入口校验）；MODIFY `server/internal/handler/workspace.go`（CreateWorkspace bootstrap原Tx）、`project.go`（CreateProject全Tx＋GetProject授权）、`issue.go`（仅CreateIssue可信意图／禁止pool越权预读／generic duplicate409）。不改GetIssue/r2现有实现。
5. MODIFY `packages/core/types/api.ts`、`packages/core/types/project.ts`（仅CreateIssueRequest可选department_id/visibility ordinary、CreateProjectRequest可选department_id；响应不变）。无组织UI/新endpoint。

**最小测试候选：** NEW `server/internal/service/native_creation_access_test.go`、`server/internal/handler/native_creation_test.go`、`server/cmd/server/r1_native_creation_acl_integration_test.go`。原 `r1_native_create_read_local_integration_test.go`每字不动，正向200不改，作为原真实RED→GREEN复验。不能修改全局helpers、TestMain或原legacy断言让成绩变绿；其完整CRUD/teardown适配后继显式写集处理。

**现存真实消费者与破坏面：**
- IssueService.Create生产消费者：handler/issue.go:3457、handler/source_context.go:723、integrations/channel/engine/router.go:1160–1200（r.issues.Create）；无意图必须fail-closed，无legacy默认放行。后两者当前不支持，保留明确兼容阻断；source_context的捕获前置副作用也未获安全完成声明。
- service/autopilot.go:740直接qtx.CreateIssueWithOrigin，未经过此service；QuickCreate／Agent后续POST、批量/其它直接写和HTTP以外通道不能从本候选继承合规。这是阻止BUILD的已知旁路面，不扩写它们、不假装不存在。
- Web/Desktop：core/api/client.ts createIssue:1478、createWorkspace:3187、createProject:4247，core workspace/project/issue mutations及views/modals/create-project、onboarding均沿原API。新Workspace单部门省略department_id兼容；unsupported资源／handoff等会422，不能称所有原生UI兼容完成。
- mobile/data/api.ts:696/1041直接导入@multica/core/types并透传body，无独立字段复制；本轮不改mobile，不宣称已设备验收。原服务测试issue_limit／issue_channel_media、原handler创建/删除测试因缺actor或ACL清理可能仍FAIL，不能给nil capability后门迁就它们。
- Router/Auth、Supabase identity、配置/锁文件、daemon/Desktop/DSH、running demo均只读且不在写集。新生产源/测试冻结另需精确hash、负例fixture和Root＋独审签认。

## 8. 必须验证的行为与进入顺序

不建新验证框架／adapter／37clone；沿普通Go测试、现有native TestMain/router及真正OTP→Me。新lab保持隔离合成55439；由Root在任何TestMain前核目标／专用opt-in／禁止缺库exit0冒充PASS，无私有context、凭据、模型或daemon。下表是待冻结用例，当前全NOT RUN；测试owner还须冻结完整实际命名及fixture，不以本文替代执行授权。

| 场景 | 验收约束 |
|---|---|
| 原自然创建回归 | 不插部门/policy/grant测试fixture，真实OTP→Me→POST workspace/project/ordinary issue201→UUID/identifier200精确ID/body/metadata→WrongPrefix404；原parent＋3children实际4run4pass0skip才通过。查bootstrap／policy精确关系及无子read grant。|
| 同部非创建者 | 独立真实native member＋部门membership、无写grant：普通Issue两locator200；Project可读，POST Issue403；没有“同部即写”。此fixture仅验证他人边界，不替代自然创建闭环。|
| 跨部read继承后续任务 | 独立B1真实member、不同部门，明确追加project read后，A1经原POST新建T-new；B1旧/新普通Issue200、无任何B1 child grant、创建/编辑403；撤销不在本append-only切片内伪测。|
| action分离 | project create_issue-only且无read→404且不建单；read-only→403；department create_project不蕴含无项目create_issue；member/admin/creator仅有身份无grant仍拒绝；单issue read不打开project／sibling。|
| private／输入 | private422且零Issue/policy/counter变化；null／错误类型／重复department_id/visibility／unknown授权键／多JSON400；明确其它部门／外部workspace ID拒；不可静默ordinary。|
| 多部门／旧业务 | 多membership无department_id409且零写入；明确正确部门＋对应动作才可建；零部门／无grant403；旧workspace缺policy404，零自动bootstrap／重分类。|
| 原子故障 | 每个workspace bootstrap步骤、project/issue policy/grant INSERT、begin/scan/commit注入故障；整个native graph/status/counter/Tx内trigger写回滚，201/业务广播/任务均0；保留所有失败raw。|
| 并发 | 两真实连接/barrier证明workspace KEY SHARE阻止删除而不互阻，counter唯一；同title duplicate串行；project删除/关联变化与创建重验；无死锁成功伪装、最多2个整Tx、不依赖sleep-only猜测。|
| 投影负例 | private duplicate409无marker/ID；GetProject统计仅可见issue，未授权项目404且无counts，DB错误500不伪0；原GET的private/admin/source/duplicate负例不退化。|
| lifecycle诚实证据 | 在另行批准的无task、无Qoder合成图核NO ACTION/0A000拒绝和Tx回滚；不得触发真实后台清理来“证明”安全。原API预副作用缺口继续HOLD，不把表删除失败转记NM11通过。|

顺序：独审本候选／Root消费ACK→精确schema/API/写集及fixture successor冻结→针对当前现有入口写最小失败用例（不是undefined API编译失败）→单写生产补丁＋sqlc→同一候选跑原自然RED、上述正负例、现GET组件/真实router和适用原生回归→独立diff/证据review。**原GET尚未BUILD与新创建不得互相等对方“先全好”**：冻结接口后同一受控候选集成验证；全量未适配list/search/WS/download/成员撤除/删除/adoption分别保留NOT RUN/FAIL/HOLD，不等待远期模型/双设备，也不谎称局部即整个Goal完成。

## 9. 本次实读绑定与交付状态

以下SHA256仅绑定本次读到的WIP；正式源码冻结需重核所有实际消费者，不用HEAD代替内容：

| 路径 | SHA256 |
|---|---|
| server/internal/handler/workspace.go | a9cec22d642ec0220d7709ee4c820328f74d4cb7992915f467d35ce06ac7e88f |
| server/internal/handler/project.go | ed8f25b69498cabd456f21bfcc2438611bd9e8ac26b73ed0f562a504087e3d2c |
| server/internal/handler/issue.go | 566790b3071caab6371177741cef9b5054b67a870b51ed7acd8ffdb628708afd |
| server/internal/service/issue.go | 17749ae5e685ecd59347c76b8cc1eecaeb477cfbe4b8397d3c9a0c45d5919ab2 |
| server/migrations/617_r1_acl_nm02.up.sql | bdc35fbc570db151ce58280263513185332d4e5b4d924eb8ef0e38ba7b07350e |
| server/pkg/db/queries/enterprise_acl.sql | af1937b2d734da8029f620dc54b07656be90f4ef62bf01f3929dafd4a4118c72 |
| server/internal/service/resource_access.go | e32bb3dea3c3d756f450cd291dca911a2e34a3e2c21e9e700ef51ebcbf35a083 |
| server/internal/handler/issue_access.go | c65db4e07d66a7e47dd4d9492c5608af2ccbda6a3553b30c95b8d9e353cb52a8 |
| docs/tasks/contracts/R1-ISSUE-READ-GUARD-r2-spec.md | 91e7fbe141bc4b635a9743943d56c4b0f613939753dcefb8c7fa0211a1e1a18b |
| docs/tasks/NATIVE-CREATE-READ-SLICE.md | 911f5875856fd4040ef15cb116c719eb2c78569457494a6869e689e7fdc80cc3 |

仅新增此DRAFT；无测试／Go／SQL／DB／服务／模型执行，无产品改动，无既有契约冻结改写，无本地提交／push。独审、精确TEST-FROZEN和后续产品实现均未完成；本owner交付草案及外部hash后STOP。

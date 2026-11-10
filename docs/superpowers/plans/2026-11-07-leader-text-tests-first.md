---
purpose: "Leader tests r1 — owner ACK / tests-first source plan"
owner: docs-maintainers
status: current
updated: 2026-11-10
related: []
---
# Leader tests r1 — owner ACK / tests-first source plan

## 结论与动作边界

Ethan，/root/leader_test_impl 接受实际 tests-first implementer 责任。基于当前源码，可以在 Root 新 TEST-FROZEN/显式 source-only write window 后立即写足三新 integration files 的真实正负断言与 fail-fast guards；新API用 raw JSON，不必先添加生产helper才能编译。当前仅 OWNER_ACK_READY_FOR_ROOT_REGISTRATION / SOURCE_CLOSED / NOT_RUN，未编译、未运行、未正式冻结。

唯一仓 E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co；HEAD 实核9deb86654f0f81e227b436a440fd9c4a6ef9a453。完整Hash64、21 joint inputs、89 current candidate pins、受保护热点与exact selectors全部由配套 leader-tests-r1-owner-ack.json 机器生成。pin匹配不等于89文件逐行审计或89路径放行；现有dirty/WIP保持。原joint review只批准最窄测试冻结方向，Root仍唯一登记/放行人。

本次只新建此plan及owner-ack两incident artifact。后继首source窗仅下面三ABSENT文件；任何已存在则STOP不覆盖：

1. E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co\server\cmd\server\r1_leader_auth_tx_integration_test.go
2. E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co\server\cmd\server\r1_leader_vertical_integration_test.go
3. E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co\server\cmd\server\r1_member_revocation_epoch_integration_test.go

不改原TestMain/helper/测试/router/Auth/service/SQL/migration/generated/models/constraints，不添第四service文件；不执行Go/gofmt/SQL/Docker/HTTP/key/model，不读私密值，不动Dmain/index/commit/worktree，不spawn。Root登记并明确交窗后下一turn直接实施，不把此准备报告当Goal终点。

## 1. 最短可编译源码结构

三个文件均package main；共享r1Leader前缀helper只放新auth_tx test文件。只引用当前存在的testPool、NewRouterWithOptions、RouterOptions、analytics.NoopClient、events/realtime、httptest、pgx/v5、auth.ParseSessionToken和标准库。NewRouterWithOptions真实返回router与*handler.Handler；新service/DTO/opaque evidence/native executor都还不存在，绝不引用缺失符号充RED。

独立真实router/httptest HTTP client，不用mockAuth/Tx、WithVerifiedIdentity/WithDaemonContext、alwaysAllow或中央harness。A/B真人必须经fresh审定OTP→/auth/verify-code→/api/me获得真实NativeV1；不签A/B测试JWT。A/B普通会员，另独立合成管理actor只用于native member-removal管理正控，不代A/B业务权。实际mat从native daemon claim取得；canonical daemon凭据真实owner-bound。新OTP/PAT/mdt/key/bootstrap都另冻结，本次不创建/读取旧值。

新请求原始[]byte/json.RawMessage，测试自有typed decoding严格验证UUID/nullable/decimal-string generation与revision；不引用不存在生产DTO。原始请求bytes缓存用于同bytes重放，保留Hash/长度，不sanitize后比较。无proxy、禁redirect、有界10s；日志只公开ID/摘要/分类，令牌、OTP、key、连接串和敏感原文不输出。

真实HTTP链路：POST /api/issues/{id}/leader-delegations；POST /api/squads/；POST /api/squads/{id}/members；POST /api/issues/{id}/comments显式leader_command；真实daemon claim/start/complete/fail；GET receipt、native comments/timeline/task-runs/Squad/members。新增权限mutation routes按B01合同raw JSON。新route404、旧decoder静默忽略leader_result/claim_generation均不是合法功能拒绝。

重启在同owned pool上关闭/重建独立router/services，再经native poll；不搬内存任务，不手工@/SQL补结果。每case独立synthetic Issue/manifest，最多两个root，每root五native roles。初始principal/Agent/roster/runtime/ACL/资料资格bootstrap单独freeze；业务Squad、task运行、结果、summary、后继收据全部真实API产生。

## 2. TestMain前置风险与新fixture fail-fast

真实integration_test.go::TestMain在m.Run前直接读DATABASE_URL；空值默认multica；setup先DELETE integration-tests workspace再重建owner/runtime/Agent；连接不可达会os.Exit(0)。新文件内guard不可能挡住更早副作用，也不能修复0test/exit0。后继独立runner必须在启动进程前绑定全新owned DB/role/nonce/profile、隔离网络和TestMain bootstrap允许写集；expected parent/leaf events不齐一律不接受。此处不改TestMain，也不调用旧r1ACL/guard canonical helper。

新r1LeaderRequireOwnedEpoch默认NOTBOUND，缺批准binding→Fatal(LEADER_SETUP_BLOCKED)，不Skip、不用return false伪业务RED。已冻结后顺序：外部进程前绑定→精确DB/current_user/session_user→nonce/源码/契约SHA→catalog metadata（先to_regclass/列元数据，不能先SELECT不存在列）→618/619新列/trigger/FK/constraints/roleGate→617原触发器/历史行保留→fresh普通身份/roster/资料/设备资格→真实Auth和正常API正控→业务断言。

拒原canonical、三个clone、service35 retainWorkspace、默认URL/query overrides/dev bypass/旧OTP-key。新Leader DB/role/epoch/profile/key全部NOT_CREATED/NOTBOUND，本次没有任何绑定或初始化。append-only617不松、不删、旧251等不改；不得假runtime/completed_at绕过约束。

只读DB审计可核pre/post完整关联与zero-delta：root、五roles/native状态、Comment、固定槽、coalesced/delivered inputs、wake receipt、token、settlement与usage；允许activity/search触发delta必须先登记。禁止手写task完成态/final/summary/receipt来补绿，禁止SQL删除旧未处理义务清场。

## 3. 确定性barrier/fault fixture另冻结

旧Handler/TaskService.TxStarter字段存在，但新Leader service未实现；不能假设换旧字段就截住未来真实scope，不能引用尚无hook。最短候选是新owned epoch独立审test-only DB instrumentation，限case-owned Issue/root IDs：controller session advisory gate在真实DML阶段截住请求，pg_locks/backend事实证明到达，再确定释放顺序。barrier到达2s/释放后2s，总观察10s；不用sleep猜序，不把永久409当可用成功。

故障候选是在真实root/Squad/handoff/dispatch/worker CAS/Comment/summary-input/revoke写点抛错，或deferred commit failure。真实事务、真实Auth/native SQL仍执行；只断完整rollback/无buffer发布。若改用real Tx wrapper，必须完整委托真实pgx Begin/Query/Exec/Commit/Rollback，不能模拟权限/业务结果；实际scope wiring另审后决定。

安装trigger/control写入/故障权限全部另有新epoch/fixture/least-privilege roleGate批准；本source窗不安装、不执行DDL、不改617。缺instrumentation分类SETUP_BLOCKED/BARRIER_NOT_BOUND，不能no-op回调、固定0、伪RED。额外fixture gate锁只证时序，不证明生产锁图已无死锁。生产NOWAIT/try-capacity正常冲突与两个无冲突root进展另外实测。

opaque evidence/zero-value/escaped executor/延迟Rows.Scan/nestedTx等private scope测试保留后继internal/service/leader_authorization_test.go；第四文件不在本窗，HTTP400不冒私有生命周期覆盖。

## 4. 必须完整的业务链与正负验收

A明确委托→B合格设备真实claim/start builder(=root task)→仅本root newSquad Creator=A与固定Leader/W1/W2→不同taskId handoffLeader→显式dispatch同Tx预建W1/W2/summary(deferred)→两worker同时running→两个canonical API持久final→原summary task合法claim、delivered恰好两final→一条正式summary→receipt+comments+timeline原文回读。builder/Leader可同Agent不可同task，W1/W2不同Agent。summary_task_id提前存在不是汇总完成。

same原始bytes+原claim tuple重放原ID，differentbytes/nonce扩槽409，无重复Comment/queue/receipt/input/计量。mat删除后合法canonical daemon仍能重放，先current权再回历史ID；human合法历史read不要求root仍eligible。A失read或membership仍只减权撤自己root，不能借此读结果/撤别人root。

三时序最后final：handoff仍running、与terminal竞争、terminal后；各经重启/poll持久同summary义务，不手改DB。无合格runtime create201持久同task deferred/generation0/无token输入；真实Agent绑定后poll恢复同ID。两root并行、取消一个不影响另一个、任worker失败无成功summary。

C1：任意root历史即ControlledIssue，BoundTask不随revoked/expired/terminal降级；generic root=NULL enqueue/retry/reclaim/promotion/wakeup永久拒，普通讨论成功但零自动派工。各三历史状态之后fresh合法root必须全链成功，不是alwaysDeny。首次纳管与真实旧rootless task/未处理wake receipt双向父锁竞争；旧义务先落create409，纳管先落旧writer不得造task或假消费receipt；旧义务只能经仍合法原生流程完成。

member软撤保617历史，11current-member query家族与实际安全callsite、热cache/mdt owner/current、Agent mode/targets同Tx、资料/设备交集逐项撤权、实际barrier双方序与transactionfault全回滚、晚结果/claims/代次防旁路均不可删。Qoder/cloud/background/全部WS缓存清理没有真实调用证据不得假HTTP覆盖；后继门禁明确保留。

## 5. 失败分类与最短RED

全部当前结果NOT_RUN。新schema/fixture/role/barrier/工具缺失=SCHEMA_FEATURE_ABSENT或SETUP/BLOCKED，undefined symbol或编译失败=COMPILE，不能当业务RED；新route404或DTO/envelope缺失=FEATURE_ABSENT，不冒期望403/404。PASS须完整expected parent/leaf events、0skip、强断言、真实退出与原始证据齐；compile/static不能转PASS。

MEANINGFUL_BUSINESS_RED仅正常Auth/权限正控成功且真实入口已命中后，实际归属/权限/原子/幂等断言失败。首个可独立证伪现存路径TaskTokenMustNotBorrowDeviceOwner：B真人创建并合法修改其旧Squad；A真人对同Squad被拒；A-originated真实native task经B daemon claim取得mat后仍不能修改同Squad；完整旧roster/queue零变化。它不必先等新增Leader route，但fixture/Auth/claim正控失败仍属SETUP。

源码首窗可以包含完整产品tests与上述guards；不能声称现有接口已支持所有barrier/schema执行。先source静态枚举/独审，再后继独立编译与fresh epoch/runtime/fixture/key/profile批准，实际RED独审后Root另开最薄产品修复窗，不自动开放89路径。

## 6. 精确case inventory与后继

配套JSON逐case记录parent、subtest path、逐段锚定Go-run selector、实际文件、强断言、预期当前failure分类和actual NOT_RUN。它是拟写leaf数，不是已存在/已跑/通过数。写完源码机器重枚举（包括结构组与parent events）再独审，差异先修登记；不能漏case/删断言换绿。只有这三个测试源写窗，所有其他文件保持pins。

UI15真实可点击委托/撤销、Timeline/receipt来源导航与旧响应cache fence、所有来源出口/WS/通知清理、policy successor/再授权/重新入会、ControlledIssue普通Bot/directRun正常适配、Windows完整harness/真实模型用量/资产归档/版本/双设备/fullR1同候选硬门禁仍未完成。API-only/确定性transport/单机不替代真实员工交付，不据此结束原Goal。
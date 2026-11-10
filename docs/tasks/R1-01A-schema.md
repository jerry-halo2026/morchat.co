---
purpose: "R1-01A 初始权限结构与真实夹具 Implementation Plan"
owner: task-owners
status: draft
updated: 2026-11-07
related: []
---
# R1-01A 初始权限结构与真实夹具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. 本卡从持续计划 Task1 进入 Task2，逐项 TDD，不代表整个 R1-01 已可用。

**Goal:** 在已证明无外联的独立合成库落地真实政策结构与登录夹具，为后续原生权限负例提供事实基础。
**Architecture:** Multica 原生 DB/账号/Issue，不复制任务系统；六张经审 companion 表。首轮仅追加，不承诺撤权或删除兼容。
**Tech Stack:** 锁定 Go1.27.3、PG17 固定镜像、原生迁移；零模型、无真实 CLI。
**Spec:** contracts/R1-ACL-r1.md、-schema.sql、-fixture.sql（r3 精确 hash 见消费者 ACK）。范围 R1-AUTH-r1。

## 当前状态与真实身份

TEST-FROZEN 初始 NM02a / READY_FOR_TDD（先仅写结构测试）。Goal01a1b0e9-ce05-7273-bbb3-b6f3d0708f30。
计划实现者 /root/acl_contract（实际配置 gpt-6.1-sol high），提供方也是该 agent；独立 reviewer /root/baseline_review（gpt-6.1-sol medium），原生集成消费者 /root（model unknown）。
实际执行 base6f016803eab7547218162130c371d8aece35acb1（冻结文档已审提交），参考源 base1f9a26d872a0f5c25bc8b402d1ffa31766c4faae，源基线b353d4c335a2fc2d06cf1f546bde8ad62debbc45，上游164290ee14f63fe009ca304db21de9879db104c8。执行 base 必须绑定后续已审冻结文档提交，不能从仅含草案的当前 HEAD 直接实施。

## Global Constraints

- owner/消费者/独立安全签认与新DB实际无外联证明已齐，精确状态见 contracts/R1-ACL-r1-test-frozen.json；原生640完成且source独占窗口释放前仍禁止本卡代码/SQL实施。
- 仅原生640版本迁移完整通过后再开始；原生 migration 的 source/hash 独占窗口结束前不得新增617文件。
- 工作树 E:/CodexData/worktrees/morchat-round1/morchat.co，专用分支；所有代码单写。不得写主树、旧C残留、用户业务、全局身份/配置、模型/供应商凭据。
- R1-00-GOTEST 证据校验器已提交1f9a26d；真实 runner 独立验证 exit、-count=1 或静态无缓存等价 -test.count=1、source/binary/DB/namespace。转换 Go test2json 不得掩盖实际进程退出码。
- 模型/CLI/设备/附件记录均不参与本卡。不得制造未来未实现子测试、t.Skip 或假判权来组成绿色NM套件。
- 原生 TEST-FROZEN 只开放此包。无 BUILD，无产品/客户端放行；所有未适配数据出口与原生 CRUD 兼容仍是硬阻塞。

## Review Focus

1. 缺DB/TestMain退出0：预期命名测试必须实际run，bootstrap失败不当作权限红。
2. fixture虚构policy：只种真实数据库行、走生产OTP/session；不签JWT或mockpolicy。
3. SQL不能到默认/外部库：完整容器身份/nonce/namespace+DATABASE_URL显式绑定，DB名只是第二重检查。
4. 只追加表不能被测试清理绕过：拒绝UPDATE/DELETE用独立事务验证后rollback；不删policy/user伪造重置。
5. 第一阶段schema绿不是企业权限绿：未运行的完整NM02九子测试及后续负例继续NOT RUN。

## 精确写集与接口

仅允许新增（先核不存在/未被其他writer占用）：
- server/migrations/617_r1_acl_nm02.up.sql
- server/migrations/617_r1_acl_nm02.down.sql
- server/cmd/server/r1_acl_nm02_integration_test.go

三个设计文档只读；本卡不改models.go、SQLC queries/generated、router/auth/TestMain、原生handler/service或import manifest。
消费已审r3 DDL/fixture精确内容与真实testPool/testServer；生产UP/DOWN需与设计分段可复算一致，不添加测试身份特例。
额外输出只有本计划忽略目录的实现报告，不stage/commit；集成人逐路径审核后提交。
首次结构测试名 TestR1ACLNM02Schema；命名子项 TablesAndConstraints、FixtureAndNativeSession、AppendOnlyRefusals。它是新增的结构就绪测试，不替代契约的 TestR1ACLNM02IssueTitle 或九个预期子项。

## Task 1: 持久结构、fixture和会话就绪

- [ ] 核执行 base、已生效 TEST-FROZEN manifest、namespace结果、原生640完整版本、三个新增路径及617_*无碰撞。缺任何一项停止本卡，继续不受影响任务。
- [ ] 先只写 TestR1ACLNM02Schema。首子项真实查六表/列/约束；缺表必须命名测试进入后失败，报告为schema未实现TDD红/native gap，不记泄漏FAIL。fixture/schema之外不得复制生产判权规则。
- [ ] 用根控制者提供且已审的静态Linux runner在完整拥有的目标 namespace 执行，固定计数1；预期RED为缺六表，不是DB不可达或编译失败。保留原JSON、实际exit、命名事件。
- [ ] 将已审DDL的精确UP/DOWN分段实现到617文件；独立复核与新库存hash后，由集成人批准同一拥有合成库的617迁移调用。原640-only helper不得悄悄接纳新源文件。
- [ ] FixtureAndNativeSession 使用已审真实fixture，生产 POST /auth/verify-code 与 GET /api/me 验各真人身份，不能调用现有owner手签JWT helper。勿打印JWT/认证body/合成数据库凭据。
- [ ] AppendOnlyRefusals 对所有六表的非法UPDATE/DELETE验证SQLSTATE0A000；失败事务明确rollback，完整状态未变。约束跨Workspace负例验证完整FK拒绝，不以代码过滤代替DB行为。
- [ ] 每次重新运行需要干净状态时请求集成人按本卡拥有的已审DB快照/全库恢复方案操作，不自行DELETE、默认dropdb或连接其他库；来源/目标/快照hash全部记录。该内部请求不转成要求Ethan重复授权。
- [ ] 定向源码编译、三个结构子项GREEN，适用原生回归/工程35测试与独立审查。源包不得超三文件；无新依赖/锁文件变化。

## 下一阶段，不在本卡冒充完成

此卡只做真实初始结构+正向会话。即使通过也继续 TestR1ACLNM02IssueTitle：SameDepartmentReadOnly、UnsharedCrossDepartment 等真实原生入口负例先红，再在r3精确guard写集中最小修复，补合法正例与额外字段/项目父任务/迟到关系负例。所有适用证据与消费者确认后才考虑该子集BUILD；不是整个R1-01通过。

## 报告/集成门禁

实现报告须列实际agent/model、精确base/3设计hash/TF manifest、写集、RED/GREEN命令及exit/run/pass/skip、DB/runner/进程归属、未运行项和安全失败，提交独立reviewer；无真实证据不打勾。集成人维护ACTIVE、卡、results、经审快照并白名单提交。禁止main/push/模型调用。

## 本次释放与第一步边界

原生640实际完成，后验/库存/源窗口释放证据 SHA bd616373b92d2d608694e15ede290892c56c34df16b568dd7f08e65598075996；TF文档提交6f016803eab7547218162130c371d8aece35acb1。现在只允许先新增测试文件并编译，发source/hash报告供root绑定真实runner；sourceworker不可读私密env或在host/default数据库执行测试。真实schema-feature RED确认前不得创建617up/down；SQL应用另按已审新库存helper执行。普通missingDB/编译error不能代替RED，不mock policy或借全局手签JWT。

## r10 已观察的 RED 与源码最小实现

实际RED结果43b4e99bc2f1fc55c50ceef4f658767334586009941b3b6800e7dec27dac776a经独立审核：测试进程1/转换器0/两测试实际run-fail/无pass-skip/六表缺失；第二三子项未调度。随后仅实现617UP/DOWN，hash分别bdc35fbc570db151ce58280263513185332d4e5b4d924eb8ef0e38ba7b07350e、6b2e560615279b97f0e804e66ed740f31fc803d4f30bb9e7fcaa0c9745bec338，精确抽取r3可重组原hash。独立源审已批准进入SQL执行审查，不等于应用/通过。源状态READY_FOR_641_MIGRATION_REVIEW；首次Green尚未授权或运行。原测试3d781保持不变，不删测试/放松断言。

r11：源码/新1282库存/前态及641helper命令已审，实际执行仍WAIT_CONTROLLER_REVIEW。新617执行器由/root/runner_fix单写ignoredfiles，禁止触碰三源码/fixtures/root配置；源实现者保留WAIT_SQL。时间戳事实字段applied_at_utc（6fractiondigitsZ），不得取不存在applied_at导致假漂移。Root未批准actualSQL、down、reset或GREEN。

r12 MIGRATED_WAIT_GREEN：617UP已真实应用一次、独立验收result9eff8b79ef1d3798d7bce687a857cbd26c79abfc983c1ea2c3fba10f62eba0c3；641全版本、旧640微秒UTC不变、六表空/约束/触发器/隔离/源后验通过。下步单独签认641空夹具受控快照和GREEN运行器，再跑真实schema3子项/OTP/拒绝；不改既有断言、不复用RED选择器假通过。Sourceowner仍WAIT_GREEN，不自行改源码或清理。

r13 SNAPSHOT_ACCEPTED_WAIT_GREEN：只读641空夹具快照result980e13bba1476eed3437e00a22a19f0c3fccb2ae5bbd3978d190feefaf9264e7独立验收；dump/list0，archive ea8c68d09a3037e1b42d9c1aa47ea6cf71599eed7592b006de5f525534638a2f、list a976033b4795f82142150d7cca1d5d1a298ce1e6a4a1af7283bca159085103fa。前后641微秒时间/空catalog/none/source通过。首次字面--file=-失败76dc6f40保留且无postclaim；r2仅省略file选项+新输出路径。三源未变，首次GREEN另需新controller/source胶囊/actualACL/实际4tests独立审查，无运行放行，无restore/helper/fixture/test。NEW胶囊显式消费合法r13卡追加，旧胶囊不修改。

## r14 最终实际状态：COMPLETE_SCHEMA_READINESS_ONLY

本节覆盖上方历史READY/WAIT状态；不是R1-01整体完成或BUILD。独立接受result5ada0817cbcb9165f3e58e4bb20650c17ef06eb40f8f50370c13e119c38abc12，processExit/DockerWait/converter均0；父TestR1ACLNM02Schema和TablesAndConstraints/FixtureAndNativeSession/AppendOnlyRefusals全部实际run/pass，0skip/fail/missing。7真实OTP/GetMe/distinctsession、坏OTP400/anonymous401、所有六表0A000与跨域23503/编辑revision23514断言已到达。原3源hash完全不变，测试未删除/降级。
641版本及微秒时间前后相同，fixture真实COMMITTED_AND_RETAINED、7usedOTP、catalog genericinvoker/约束/触发器未变；前后严格none/source/ACL通过，指定helper已移除，DB/卷/快照保留。此前GREEN预检失败8339ae60（count3误假设）保留，未运行产品；r2严格原批准5keys+SCRAM常量、只转发3连接字段，新11文件actualACL经审后实际通过，未rotate/reset/restore。
任务证据完成：[x]真实schemaRED；[x]精确617源与一次迁移；[x]父+3结构子项GREEN；[x]7原生登录；[x]真实拒绝事务rollback/状态不变；[x]独立源及运行审查；[x]35工程测试新PASS/0skip。现有2文件型migration lint报告及最终source暂存复审/白名单提交另确认，禁止为复验而重复seed。实现报告由sourceowner只追加actual事实。Native640已知5条件跳过继续保留，不称所有DDL执行。
下一工作是独立R1-01B title九项与M1/M2来源边界，旧准备ACK不等于TF/源码放行；所有其他出口/撤权/生命周期/模型/Windows/双机仍未验。保持Goal ACTIVE。

r15：最终source/staged审查通过，本地提交d69f6acd70475e835e665d47787d90dbee552f12。静态migration文件lint fresh2run2pass0skip log8aa389e78864ca4ff1841f2a47c6e0ecb1d690908692f786bc525519f26c7b4a；ownerreport追加8d52076438a37b14a0bf530287ad0e37c94093da1df55dc3c4d23e7c0c556d40，原0463prefix不变。三源raw=index精确通过且完整提交，本卡COMPLETE_SCHEMA_READINESS_ONLY，不再重跑旧fixture。下一R1-01B-auth-db仅tests-first源码子集，实际运行另审。

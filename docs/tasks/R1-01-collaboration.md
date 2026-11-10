---
purpose: "R1-01：多人原生协作与企业权限"
owner: task-owners
status: current
updated: 2026-11-07
related: []
---
# R1-01：多人原生协作与企业权限

状态 NEEDS_CONTEXT；产品/无模型测试/最小修复授权已批准，接口与可执行用例尚待冻结，不是重新等用户选型。依赖 R1-00 可核验基线。父规格 ROUND1-DELIVERY；细任务复用 MINIMUM-CHAIN MC-01/01G/MC-07 的无模型部分。
Owner 角色 B01；原生 router/schema 单写者为集成人；B02/B04/B06 是消费者；实施 agent/model、独立安全 reviewer 在派卡时填真实值，当前未分配，不伪造 READY。

## 范围/写集

读 server/cmd/server/{router,scope_authorizer}.go、server/internal/handler/{issue,project,comment,squad,workspace_revoke,daemon,attachment_capability,search_index}.go 与对应测试、server/internal/testutil、server/pkg/db/queries/{project,search_index,runtime}.sql；先核实际符号与生成流程。
生产改动仅在原生授权/查询/投递/附件路径补企业政策；新增迁移、生成代码、核心 DTO 必须在卡的精确子任务清单登记并由唯一 owner 处理，不预占上游迁移号。
前端消费者限定 packages/core 的授权/同步/搜索及 packages/views 的 my-issues/projects/issues/squads/inbox/attachments；每个实现子任务继续收紧到具体文件。禁止独立权限服务、第二任务表、独立 IM 和模板发布 UI。

## 消费/产出契约

消费 C01 真实员工/Agent/委托人与资源政策、C02 原生 Issue/评论命令、C04 附件/索引/当前权、C06 设备及管理人资格；产出同一服务端授权入口、原生查询过滤、当前政策/拒绝语义和供 R1-02/03 消费的接口。最终签名与字段必须从源码形成 manifest，不能各模块自造一版。
一公司一个 Workspace；部门普通默认可读不等于可写；项目继承覆盖现存与后续普通任务，私密单授；跨部授权不暴露整个部门。不得把 owner 头衔或 runtime owner 权限当委托。

## 实施和验收

- [ ] 将 MINIMUM-CHAIN §9 的 NM-01–12 逐项映射到真实认证链/handler/query、测试身份和预期响应，签 TEST-FROZEN；只 mock 执行副作用，不 mock policy。
- [ ] 单独创建本卡合成库/附件目录，先预检明确 DATABASE_URL；模型出口和真实 CLI 禁止。handler TestMain 可能因库不可达退出 0，必须检查 go test -json 中预期命名用例实际 run/pass，无缺失/skip。
- [ ] 建立原生 FAIL 与缺入口 BLOCKED 证据；同一授权内补最小产品实现，再做正负回归。不能因为尚缺部门字段就永远停在文档。
- [ ] NM-01–04 普通/私密/跨部策略；05–07/10/11 全出口/撤权/停用；08/09/12 委托/派工/模型输入与受众交集。执行顺序/参数以原规程为准。
- [ ] 首轮界面贯穿我的工作→项目/任务评论→认领→进度；普通消息不唤醒、@ 稳定目标、不覆写真人 assignee，合法工作正常可用。不得把过滤 UI 当安全边界。
- [ ] 独立审核、相关原生回归及接口消费者 ACK 后，只升级实测子集到 BUILD-FROZEN；提交集成后继续 R1-02。

判失败：任一旁路泄漏或越权副作用、借 B 管理权替 A 执行、撤权后新准入、旧 WS/响应回填、全拒导致正例不能用、伪零模型/假退出0、核心用例漏跑。所有适用 NM 强制项未过不得称权限闭环。
当前证据 NOT RUN；具体测试命令由实现子卡先定义并提交，现阶段不虚构已有 test:nm-acl。

## 接手收窄后的首个子卡（r6）

提供方 /root/acl_contract（gpt-6.1-sol high），实际集成消费者 /root（unknown），独立安全 reviewer /root/baseline_review（gpt-6.1-sol medium）。r3精确设计与提供/消费/安全条件ACK见contracts/R1-ACL-r1*；不是全局C冻结。首卡 R1-01A-schema.md 只允许后续生效TEST-FROZEN与原生640就绪后新增617.up/down和单个原生集成测试文件。当前namespace无外联实证失败，新none实例候选待审，卡 AWAIT_TEST_FROZEN / NOT STARTED。完整NM02/03及全部其他出口仍NOT RUN。

## 生效的第一个精确子集 r8

R1-ACL-r1/NM-02a@r3 TEST-FROZEN，权威Discovery3.0及contracts/R1-ACL-r1-test-frozen.json。提供方/root/acl_contract（gpt-6.1-sol high）、消费者/root（unknown）、独立安全/root/baseline_review（gpt-6.1-sol medium）真实签认齐备；C04/C06不消费、其余C仍DRAFT。真实新none capsule已审，原生640助手结果未确认前本卡不进入源码阶段。第一步R1-01A仅617up/down+单个集成测试，不准扩写handler/SQLC/共享loader或伪造完整NM绿色。

### R1-01A 局部结构就绪（不是本卡权限完成）

实际schema父+3子项4run4pass/0skip及7原生OTP、真实SQL拒绝已独立接受，result5ada0817cbcb9165f3e58e4bb20650c17ef06eb40f8f50370c13e119c38abc12。641记录未变、fixture已保留；详见R1-01A-schema/r14。本卡title9、可信credential+legacy修复、列表/搜索/WS/资产/设备/撤权等仍未通过。B准备修订需窄卡与契约注册后继续TDD，不能由局部schema升级BUILD/放行其他产品。Goal继续ACTIVE。

### r43：cache已局部集成，继续Issue读取test-only TF
Cache exact11files经独审staged5b2498c/96289f提交 11e3ffff49aac220088124a26ece2bfaeec09ead，提交后clean实核；局部BUILD22c88仅Linux缓存输入接收，不外推Windows或R1-02。下一R1-ISSUE-READ-RED-r1 actualsource-only TF docs/tasks/contracts/R1-ISSUE-READ-RED-r1-test-frozen.json SHAbe3c38c06bef0a21320549398234235aaac306b5c7f0e5c139a23385fd43b494，单新cmdserver测试、4命名events/两locator/原生OTP2，只读18原源hash均现核；owner issue_owner solhigh/Rootunknown消费者/reviewer issue_review astrahigh的proposal a1e52与review dd95已真实签认，actualregistry/R43待独审。补native TestMain从属member transient，绝不用unused ownerJWT；其余Auth/schema/guard/SQL/生成物不开放。cache窗已闭，独审后仅Issue owner sole serial sourcewriter+离线compile，实际DB/HTTP/secretcontext/fixture仍NOTRUN且不随sourceTF放行。Goal ACTIVE全scope，继续产品，不在准备/局部绿结束。

### r47：GET最小修复source-only TF登记；待实际登记独审即派solewriter
R45/46真实RED实证6docs经独审da9dbc/df83后本地提交 b94ad8c5f0f467e6ba1bee703144223b660e4547，clean现核；fixed201202已used，不重跑。Guard设计fix1/5两个required均独审ADDR，R2spec91e7/reviewf93a/implementationownerACKc2d768成立。实现owner guard_impl(sol high)、设计owner issue_guard_design(astra high)、Rootunknown消费者/集成、guard_review(astra high)独审。新source-only TF docs/tasks/contracts/R1-ISSUE-READ-GUARD-r1-test-frozen.json SHAab0b07fa63fe0511a88face3c55ff3f35daf6f7beec5393d247480add743dcdd，详细计划docs/superpowers/plans/2026-11-07-issue-read-guard.md；精确10writeSet/19beforehash、14新testparents+原4events、私有ownedattemptq/Tx+lifetime、当前typedACL/一跳关联授权/完整Txhydrate+buffercommit、freshGREEN301302字段冻结，componentfixture独立且无DELETE、SQLC staged全比对仅copy2的机械裁决owner已ACK。
actualTF/card/plan/R47待独审，之后Root另明确源码窗口才派test-first+最小实现/受限gen+clean compile-only，不待远期契约，不开放任何DB/context/OTP/HTTP/helper/模型费；当前source/SQL/gen仍NOTRUN。R1-01D卡承接真实缺口修复，保留所有旧RED/FAIL/NOTRUN、原生legacy/无policy回归兼容阻塞不删。Goal ACTIVE，Issue/Auth未BUILD、cache仅局部Linux组件，继续产品不在本登记结束。

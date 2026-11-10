---
purpose: "R1-ISSUE-READ-RED：原生跨部门任务读取反例"
owner: task-owners
status: draft
updated: 2026-11-07
related: []
---
# R1-ISSUE-READ-RED：原生跨部门任务读取反例

Task-ID R1-ISSUE-READ-RED / revision r1 / READY_PENDING_REGISTRATION_REVIEW。Owner /root/issue_owner gpt-6.1-sol high；consumer/integrator /root model unknown；independent SPEC/QUALITY reviewer /root/issue_review gpt-6-astra high。当前干净baseline 11e3ffff49aac220088124a26ece2bfaeec09ead，E隔离树codex/round1-continuous；cache source窗口已关闭并经独审11文件提交，不并发产品写。

## 契约/唯一写集
docs/tasks/contracts/R1-ISSUE-READ-RED-r1-test-frozen.json SHA256 be3c38c06bef0a21320549398234235aaac306b5c7f0e5c139a23385fd43b494。仅NEW server/cmd/server/r1_acl_issue_read_integration_test.go（实际ABSENT），18原有路径hash全只读；owner提案a1e52de4和独审dd95d5eb作为精确设计依据。仅冻结原生GET的测试输入/预期，不把广r3 DRAFT/title9/生命周期升BUILD，不提前实现guard。

## 目标/根因/最短路径
原GetIssue→loadIssueForUser仅约束Workspace，对同Workspace不同Department无grant边界。先真实OTP鉴权和原生UUID/identifier GET观测，不能手写JWT/假policy。A2→T-A同部200与B1→T-only显式grant200正控防止全拒假绿；同一B1→T-A应404。既有owned合成actor/resources不变，只未来授权runtime新增OTP201/202并原生used，禁止重用或reset已耗fixture。

## Implementation Plan
- [ ] 1. 实际TF登记独审通过、Root solewriter释放后，仅新test：parent TestR1ACLNM02IssueReadCrossDepartment +3children SameDepartmentRead/ExplicitIssueReadGrant/UnsharedCrossDepartment；每child顺序覆盖两locator，无额外t.Run。原helper只允许无副作用target precheck，不能重seed。
- [ ] 2. 实际fixture事实/OTP→Me+签名v1/匿名与不存在shape控制；negative两次200仅真T-A marker可记固定WRONG_ALLOW，I/O/setup不能当RED；defer保存精确DB immutable/delta，即使negative失败也执行；不得泄漏credentialbody/token。
- [ ] 3. TF clean allowlist pinned offline Go -c wholecmdserver，Root fresh创建compile scratch；保留compile/raw/hash，compile不是RED。其余源/SQL/Auth/原tests不改。
- [ ] 4. 真实运行需新的ownedDB/source/ELF/隔离profile/同源context/fixture2精确capsule独审及Root另once运行；4run2pass2fail/Go1converter0/noSkip与两wrong200实证才接受。无capture、无模型CLI、无restore/reseed，TestMain4类还含从属member的temporary前后0必须核。
- [ ] 5. 实际RED独审后更新ACTIVE/card/results/snapshot、白名单提交；再另冻最小GET guard及typedSQL/sqlc生成集，新的reviewed凭据跑GREEN。不得先开放未来生产或用本RED标首轮完成。

## Review focus / 当前状态
双locator不得第一个fatal漏后者；直接比较完整native404 error shape防数据泄漏；freshsession exactsub+v1和Me确认actor，unused TestMainownerJWT绝不用；当前postAuthGREEN旧OTP/PAT不能套PREAUTH空断言。TestMain会先按固定alias清理，外层runtime必须先证无碰撞bootstrap/members；只读GET也不把whole TestMain称DB零写。
Source/compile/fixture/DB/HTTP runtime NOT RUN；registration独审后才派source。Windows/model/DSH/Leader保存双机和全同候选验收均未完成，Goal ACTIVE。

### r44：Issue原生读取测试源码已独审，编译通过；固定SQLC工具已实装验证
issue_owner(sol high)唯一新增 server/cmd/server/r1_acl_issue_read_integration_test.go，SHAfba7b818bb9f72d42786a8532a19d995adad33c0ef813f2135f29754be0c42e2（17336B）；原18保护路径before/after无变。精确parent+3children/两locator、原生OTP201/202→Me+signedv1、404/匿名正控、20表含当前旧OTP/PAT全行不变、GET阶段独立零delta与失败后defer后验均实现；不消费unused ownerJWT。clean TF env wholecmdserver compile-only实际0/原始logs0B，ELFdf80e3a587209cef127b570fdd0e0387ccdeba67638132810dd3e9f36992da27；compile proof29a3ee205c95a416fae5c8dc7ff57b8784ae595c9b28dff2ac09ddef48d6bb8a。独立issue_review(astra high)实读SPEC+QUALITY APPROVE，报告 SDD/r1-01c-issue-read-source-compile-independent-review.md SHA1ace396e814c8c96973f5d709c0f0a744608baec887d135a4fb0fac9a4f56ed3。Root(unknown)fresh clean Go vet cmd/server实际0/空logs，gofmt/diffcheck0。writer窗暂停关闭，等待exact runtime capsule独审；未运行TestMain/DB/HTTP/OTP2/context/实际RED，不以compile冒证。
并行核实Makefile365既有固定sqlc v1.31.1缺失，Root在ignored独立tools/sqlc1311 cache以clean env、官方proxy+sumdb/GOVCSoff安装该固定版实际0；源码go.mod/sum前后完全同。离线version和Go buildinfo实际0，binarySHA86ea58f21c2f25f484a282c7efefdf167fc940b3a4e963d33d966c15d71ae2fb、moduleh1:+V+BjBJfFNPX/RFfL8eiZD9jk9lVJUEGGllWvnYNqbc=；metadata .local/engineering-prep/tools/sqlc1311/verification.json SHA086ecabd668c46a2d36d6f71ef4ea643ecc492be02e0f5564e58f4be4a7bb640。不运行生成、不改SQL/生成物/产品、不读用户密钥或模型；仅移除后继typedSQL工具缺口，不提前开放guard。
当前task SOURCE_READY_REVIEWED、仅测试源码候选待白名单本地提交；R43 TF/registration与链763737已独审b6e357。下一继续ownedDB当前postAuthGREEN下的真实Issue4events RED；runner仅准备无capture/restore的新capsule，Root须实际registry+独审后另once执行。cache局部BUILD范围不变，Issue/Auth其余未BUILD，Goal ACTIVE全三切片与同候选硬门禁未完成。

### r45：Issue真实读取RED runtime TF登记；Stage1九空文件待独审，Stage2尚未运行
当前actualcandidate/source commit c6a21f9832a7ca6c7455e1b7bfea8b35284028ca（已独审8files后本地提交且clean），源fba7/ELFdf80/source独审1ace不变。runner_fix(astra high)最窄code/data candidateab88955510c2695d289d0d0f361d870a9f7b117bcdfce7960f324846722fe60c、controllere9e35/ready e4b24/provision7a449/guardc8c9/readonlySQL e3fc已baseline_review(sol medium) SPEC+QUALITY APPROVE，42bindings/38purechecks，仅fixture scope非产品测试。report路径转义错误仅报告修正为cd582f，原5000保留，code/data不变。
Root(unknown)另次仅Stage1实际0，创建newprivateDir+9 protected空文件，audit .local/engineering-prep/tools/r1-issue-read-red-1129d525-provision-audit.json SHA49a392e82ef27764a4c143e3ef881a1de335e6b7d7895ed8740964418aef6331；未读PG/context、未创建helper/seed/OTP/HTTP/test，实际ACL尚待独核。Root现将模板required对象（不是NOT_AUTHORITY外壳）登记 docs/tasks/contracts/R1-ISSUE-READ-RED-RUNTIME-r1-test-frozen.json SHA69855e793d9e0dd73e8712ed2efb896fbafc4a4bc419f2741d1fdb1a35ca9aa8；此actualregistry+audit+R45独审通过后才可Root另once Stage2，当前NOTRUN。
后续精确授权只此ownedDB fullCIDa7d5底座NONE、numericPG+nativeHTTPlocal，normalTTL/同ownedPG5键与syntheticcontext4键原值复制（不是新签名key，不读公司/个人/provider key）。只newOTP201/202各1插入→native used=true，A2/B1真实OTP+Me/v1、A2TA/B1T-only两200正控、同B1TA两locator应404但baseline预计wrong200；4run2pass2fail/noSkip/actualGo1+converter0+两精确wrongallow和GET/OTP后验marker齐才接受RED。原13+641微秒ledger保留，18business/ACL/event/runtime表+oldOTP含101/allPAT含11e463全行beforeafter不变，bootstrap4类和从属member前后0，GET阶段单独0delta；源SHA/window前后核，不借旧PREAUTH空断言。
不访问旧cab88或空sink、不创建/挂capture卷、不mintPAT/CLI、不restore/reset/重试，不启动真实CLI/model。实际raw/退出/ns/ACL/source后验先持久后分类/精确helper清理；任何异常保存FAIL/BLOCKED/partial，不自动重跑固定OTP。runtimeTF不开放GET生产guard/SQL/生成物；guard设计agent astrahigh仅只读后继计划。Goal ACTIVE，Issue/Auth未BUILD，cache仅局部Linuxguard BUILD；三个首轮及同候选实机云模型双机硬门禁继续未完成。

### r46：原生Issue读取真实wrong-allow RED已独审接受，立即推进GET最小修复
R45实际registry69855e/audit49a392/snapshot405c12独审接受后Root(unknown)另once Stage2；实际result .local/engineering-prep/tools/r1-issue-read-red-1129d525-result.json SHA46b4ed1748d024b304ac1ad648fd455b7a86911581a818f13fa4bfe9dc10a338，statusISSUE_READ_MEANINGFUL_RED_VERIFIED，真实Go1/converter0/4run2pass2fail0skip。A2同部TA与B1显式T-only两正控通过；同一B1读TA UUID及identifier均真实200并确认TA id/title/body/revision，原应404；GET零delta/OTP后验marker齐，非编译/初始化/DB假失败。baseline_review(sol medium)逐raw/strictJSONL/42bindings/ns/ACL/deadline/退出/sourcewindow/精确helper清理实核ACCEPTED，helper0e13a36b...70182已removed，sourceExclusiveWindowRelease=true。
实际读取复制了同ownedPG/context原值（受R45授权，无新签名key/公司providerkey），无model/CLI/PATmint/capture/restore/reset/自动retry。18表+641微秒ledger及oldOTP8（含101）/PAT1全行摘要不变，仅新201/202各used=true、attempts0、十分钟expiry；bootstrap user/workspace/runtime/agent+member前后全0，source独立核GET全期0delta。private9材料与原始FAIL证据保留，额外launcher日志仅disjoint protected目录；stderr确有read-only root下upload目录创建告警，保留原文，不叫全serverstartup清洁或upload能力通过，不影响本14请求的实际正负读取实证。
固定OTP201/202已消费，当前verification_code累计10条，禁止重跑旧selector/重置或删除；后继GREEN须独立冻结新OTP fixture（不能伪称已有201/202可复用）。R1-ISSUE-READ-RED任务 VERIFIED_RED_EVIDENCE_ONLY，不是权限修复/GREEN/BUILD或Goal完成。
下一GETguard仅最小返回payload：已只读核原nativeDuplicateOf及source_context会读另一Issue/comment/author，必须纳一跳关联授权和同Tx hydration；owner issue_guard_design(astra high)proposal bd2c9fd5，独立guard_review(astra high)审中，精确typedSQL/query+generated/models/source_context helper与故障测试将新TF后开放。Scope私有字段不能代替q/Tx/attempt/lifetime真实绑定；新ACL componentfixture须独立workspace/user，不能挂TestMain临时fixture破坏FK清理。当前prodGuard/SQL/gen均未写，原sourcefba7/ELFdf80仍冻结、HEADc6a21；继续根因修复，不结束在本RED报告。Goal ACTIVE全三切片，cache仅局部Linux组件BUILD，Issue/Auth及远期实机模型Leader保存双机硬门禁未完成。

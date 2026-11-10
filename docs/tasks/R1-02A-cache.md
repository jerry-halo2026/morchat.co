---
purpose: "R1-02A-CACHE：拒绝无效输入并保护已有缓存"
owner: task-owners
status: current
updated: 2026-11-07
related: []
---
# R1-02A-CACHE：拒绝无效输入并保护已有缓存

Task-ID R1-02A-CACHE；revision r1；任务 READY_PENDING_INDEPENDENT_REVIEW。产品授权 R1-AUTH-r1，父卡 R1-02-execution；仅消费既有manifest/hash/path契约，不依赖未BUILD的企业权限/云模型/DSH能力。
Owner /root/cache_owner，实际配置 gpt-6.1-sol medium；消费者/集成 /root，model unknown；独立SPEC/QUALITY reviewer /root/baseline_review，gpt-6.1-sol medium。source baseline efc5e1de4c435a085a2a0e04e771a20c6b17455a；源码两项beforehash、六parents+unsafe子例、编译命令和边界完整绑定于 `contracts/R1-02A-CACHE-r1-test-frozen.json`，SHA 497896dcfd3e4dd0739b320e11a00b4790f57002ec2d378c59f21100a3c4a0fc。

## 目标/写集/根因
只有 `server/internal/daemon/skill_cache.go` 与 `server/internal/daemon/skill_cache_test.go`。Store当前未在removeAll/rename前校验声明内容，错误输入可替换原有效bundle。改为nil/空root原no-op后、任何目标/临时目录操作前复用validateSkillBundle：ref.Hash保留声明值、FileCount为真实len、SizeBytes沿原positive-only语义；错误不泄漏内容。不新建事务、备份、rename失败原子保护、授权/状态/锁/DTO/daemon.go/schema变更。原ErrExist retry与Load外部损坏淘汰行为保留。

## 串行隔离与权限
使用已验证E隔离树codex/round1-continuous，cache_owner是唯一产品源码写者；Auth窗口已关，其他agent只读研究/审查，Root只独立docs/ignored执行器准备。ENGINEERING 5.4/5.6允许串行复用，两个原生worktree请求未返回path/opId，未宣称取消/成功，不再创建或手工fallback。不得动D main/用户改动。独立TF审通过才释放测试写入；runtime不随TF放行，编译仅清洁env pinned offline Go -c、不执行init。

## TDD Implementation Plan
消费Store/Load原签名，产出仅接收保证，非Windows harness/权限或整个R1-02验收。
- [ ] 1. 仅追加两NEW父用例和self_consistent_unsafe_path子例；真实Store/Load/原始bundle.json直读；直接bytes比较必须在Load前；拒绝时无remove/rename/临时残留。暂不改product。
- [ ] 2. 锁定Go clean allowlist LinuxCGO0离线编译整个daemon测试包；Root实际freshNONE capsule运行精确6parents/child，保存真正Store误收/原字节损坏RED，不把compile/setup/skip算RED。
- [ ] 3. Root接受RED后，owner仅在Store最前添加现有validator守卫，保留声明hash与已有规则；无重构。
- [ ] 4. 同profile新capsule跑GREEN与全部既有6父控制；Go0/converter0/all required run/pass/noSkip，原RED独立保留；Linux成功不冒充Windows文件/重命名或DSH通过。
- [ ] 5. 独立SPEC/QUALITY审、Root实际源码diff/hash/gofmt/offlinevet及相关工程回归、更新ACTIVE/card/results/snapshot，再白名单本地提交；仅适用证据满足才考虑局部BUILD，不开放未证依赖。

## Review Focus
声明hash不能被skillRefFromBundle重算覆盖；路径unsafe即使自洽hash也拒绝；旧bytes先于Load检查防删除坏件掩盖；nil/空root不改；ErrExist两次rename兼容不删测试。Runtime全package init有非temp读取/依赖SDK，不能假称全纯：出生env-i，无MULTICA_TEST_*，NONE底座/nonroot/dropALL/NNP/ROroot/只RO ELF+owned tmp，不挂密钥/配置/CLI/DB。失败保留，不扩大网络或降门禁。

当前测试/compile/runtime/实现 NOT RUN。TF登记待独立审，未授权产品源码窗口；本卡不标BUILD，Goal全三切片不缩小。

### r41：cache真实断言RED，准备最小守卫（非完成）
R40 TF497896/card7d893/snap a6bee独审通过后cache_owner(sol medium)唯一产品写者仅新增tests f5badc41；原product943d未变。clean pinned offline compile实际0/ELFda0ef836（whole daemon包，非测试执行）。Root(unknown)另次运行已获独审的runner43a241/profile245030/actualbindings d5c717，freshNONE/nonDB/noKey无model，actualresult SDD/r1-02a-cache-red-78115d75-176f-4d0f-8a0c-78f17e9b4920/result.json SHA4c9accbdbcb1e86362224f14d886fa8c3f03efe87ceb2945b4921ff99cd27b97：actualGo1/converter0，7run4pass3fail0skip、11个精确Store误收/旧bytes丢失/target mutation业务断言，非compile/init/setup失败。全部raw退出与日志先于转换/清理持久，精确helper已删除，无DB/volume/capture/秘密操作；原RED不重写。此实际结果独审待接受，接受前product守卫仍HOLD；task IN_PROGRESS，不标GREEN/BUILD，Goal ACTIVE全scope未缩小。下项只Store nilguard之后的既有validator前置，然后同7events新GREENcapsule和独立审查，继续nativeIssue读取测试切片。

### r42：cache最小修复真实GREEN已独审，登记严格限定组件BUILD
实际GREEN SDD/r1-02a-cache-green-2703fa55-f95f-4cc3-bca9-5ab2a7d44e84/result.json SHA5de4d56222f39931349681f72fb104fc83ca038ae3956c46eec99934aabd617e，Go0/converter0/7run7pass0fail0skip，含4原控制与unsafe自洽子例。baseline_review(sol medium)独立raw/lifecycle/source/profile/精确helper清理验收ACCEPTED；旧RED4c9a/11业务断言与两ELF原件保留。owner cache_owner(sol medium)唯一source writer仅Store一hunk前置现有validator：8ef2f449，tests仍f5badc；Root(unknown)实际执行freshNONE/noDB/noKey/no模型。clean offline whole-daemon编译0、gofmt exact2空0、vet daemon空0、工程35pass/noSkip/0均实核。API/原nil空root与ErrExist retry不变，不为validrename失败增加保旧承诺。R41实际RED与记录742ffe也已审通过，不回写历史PENDING。
Root消费者ACK仅输入接收守卫，登记 docs/tasks/contracts/R1-02A-CACHE-r1-build-frozen.json SHA22c88c2b5e0322fd064ef8740597f8c6c71b4ff7b3251e2cc35e30a0dc39fefb（TF497896原bytes不改）；登记本身待独审，随后exactsource2+docs白名单本地提交前仍需最终staged审。仅Linux组件逻辑范围的局部BUILD，不代表Windows文件/ACL/rename/harness、全daemon或R1-02端到端，也不提供任何新运行/模型权限。Auth/Issue/title9/legacy/realRedis/权限生命周期其余仍NoBUILD/未验收；全Goal ACTIVE，R1-03及同候选实机云模型/双机硬门禁未完成。
Cache任务当前VERIFIED_PENDING_LOCAL_INTEGRATION，产品写窗口关闭待提交；下一Source切片R1-ISSUE-READ-RED只新test，owner issue_owner(sol high)/consumer Root/reviewer issue_review(astra high)提案已静态独审通过a1e52de4/dd95d5eb，补精确TestMain从属member transient，不使用unused ownerJWT；尚未正式TF/派source/runtime。继续推进，不以本局部GREEN结束。

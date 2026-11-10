---
purpose: "R1-02B-SKILL-CLAIM-PIN — r2 DRAFT exact component proposal"
owner: task-owners
status: draft
updated: 2026-11-07
related: []
---
# R1-02B-SKILL-CLAIM-PIN — r2 DRAFT exact component proposal

2026-11-07；producer/research owner /root/execution_next，gpt-6.1-sol medium。重新核当前源；r1 96cb6b97 原件保留，本修订回应独审 cd1e82532e72fa75731695f5a4bf6bd18f1b5ce1f7abe46d79aed6aedfaa1f0f 的四项冻结细节。非 TEST-FROZEN/运行放行。

## Scope / producer ACK

当前唯一树 E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co；codex/round1-continuous，实际 HEAD5abcca9dabc421958b665e3c69331a27b1781357。claim ref 是本次内容约束：cold claimv1/current-valid-v2 必须准备失败，不静默 latest；new claimv2/v2 正常。仅 resolveSkillBundle 复用既有 validateSkillBundle(originalRef,bundle) 与原 ref cache lock，替换自身派生 validationRef 及相反注释；不重改 Store，不建第二版本/配置权威。

**当前 server producer owner ACK 保持**：handler/daemon.go:4477 的 ResolveTaskSkillBundles 对普通 source 只用 source/id 选择 current；service/task.go:7201 的 AgentSkillBundleRef 不传历史 hash，LoadRequestedAgentSkillBundles 读当前 workspace 字节/AllBuiltinSkills；没有普通 bundle 按 hash 取回历史字节的接口能力。plugin 有独立 hash mismatch409，但不证明普通历史。接受消费者全部来源严格 pin，不要求本卡加 server 功能；old bytes 不可得可失败，合法匹配保持成功。只读 ACK，不是权限/运行验收。

producer 指纹：handler/daemon.go 098e217f6c6d2e1b7fb40f40e8035068acd84f00e5f84b9ebb796aecf4720a3b；service/task.go db379477fd4ce0c9b292a369d36bdd3c7b79cb07010fb457a6f47236317f5b98；daemon/client.go 4e423eff0e49462a426c627f9eb02a0ce2d0104062ea38bf8d1de02d0175c3a6。

## Exact two-file writeset (relative to tree above)

- server/internal/daemon/daemon.go SHA256 **87db5aa41aa18f2118572d78f6288abb652e32c1c0fc1231cda8b231350c0da3**。
- server/internal/daemon/skill_bundle_resolve_test.go SHA256 **feb289f5d4f2a6ce3fa234b8a12b40bdfe1d9c7d558c9d9fc0bdfcbc55a55c3c**。

不写 client/producer/schema/generated/Rootdocs/guard 十路径。以下新增 test parents、必要局部 fixture/transport helper及旧正控显式改写均落第二文件。

## Exact test matrix / events

每个 A–D parent 固定恰好两个 children：`workspace`、`builtin`；E–G 无 children。

| ID | Exact parent name | Transport / assertion |
|---|---|---|
| A NEW | TestEnsureTaskSkillBundles_RejectsClaimHashDrift | memory RoundTripper；cold v1 claim / 完整200自洽v2，必须 errSkillBundleUnavailable，双键 cache 空、无 publish |
| B explicit old-contract replacement | TestEnsureTaskSkillBundles_AcceptsNewClaimMatchingUpdatedBundle | 继承旧正控 own loopback httptest；新v2 claim/v2，发布和缓存精确v2字节 |
| C NEW | TestEnsureTaskSkillBundles_HotClaimVersionRemainsPinned | memory transport 哨兵；cache预置v1，server即使可给v2也不得请求，返回精确v1 |
| D NEW | TestEnsureTaskSkillBundles_SharedCacheSeparatesIndependentClaims | memory transport；同workspace/cache/source/id，BotA/taskA claimv1先热存，BotB/taskB claimv2冷取v2；顺序执行，不宣称并发 |
| E EXISTING | TestEnsureTaskSkillBundles_CachesEachSuccessAcrossDispatches | 原 own loopback httptest；部分成功缓存留存/后续只补缺失 |
| F EXISTING | TestEnsureTaskSkillBundles_CacheRemovalFailureDoesNotDiscardDownloadedBundle | 原 own loopback httptest；cache写失败不丢合法返回字节 |
| G EXISTING | TestEnsureTaskSkillBundles_RejectsPluginHashDrift | 原 own loopback httptest；plugin旧ref/新字节拒绝 |

**RED phase**：先仅新增 A，不改产品或旧 TestEnsureTaskSkillBundles_AcceptsServerSideSkillUpdate。精确 selector `^TestEnsureTaskSkillBundles_RejectsClaimHashDrift$`；预计 JSONL terminal events **3run/0pass/3fail/0skip**（parent+2children），Go exit1；两个 child 因当前返回nil/错误缓存v2业务断言失败，不能以compile/setup失败替代。实际结果未运行，不先记PASS/RED已证。

**GREEN phase**：实际RED审过才产品修复并将旧 AcceptsServerSideSkillUpdate **显式改名/改注**为 B，注明“旧claim接受更新”的上游语义被企业pin契约替代，保留其结构与合法更新正控，而非删掉冲突测试骗回归。旧测试源码beforehash及真实RED材料保留。

精确 GREEN selector：`^TestEnsureTaskSkillBundles_(RejectsClaimHashDrift|AcceptsNewClaimMatchingUpdatedBundle|HotClaimVersionRemainsPinned|SharedCacheSeparatesIndependentClaims|CachesEachSuccessAcrossDispatches|CacheRemovalFailureDoesNotDiscardDownloadedBundle|RejectsPluginHashDrift)$`。预计 **15run/15pass/0fail/0skip**＝7parents+8children；Go exit0。全部是 component/protocol，不是E2E。

### Byte and isolation assertions (no false fixture RED)

A–D helper 必须先确定 Source/ID/Name/Content/Files，再 BuildManifest/skillRefFromBundle 填 Hash/SizeBytes/file metadata；不可 workspace hash完才把Source改builtin。每个版本以 validateSkillBundle(ownRef,ownBundle) 正控证明自洽；v1/v2 同source/id、hash不同，正文与rules.md均不同。

A：transport检查method/path/单ref完整值是原claimv1而非v2；恰好一次调用，完整200 JSON/正常headers/body/Close。调用后 errors.Is(err,errSkillBundleUnavailable)为真、task.Agent.Skills仍nil（不可publishv2）、claim refs深相等未改；显式 Load(workspace,v1ref)==miss **且 Load(workspace,v2ref)==miss**。前后应为空cache fixture，不把此前合法缓存当需回滚。

B：传的确为newclaimv2，响应一次，errnil，Skills与cache(v2)含完整精确v2正文/resources/hash，v1key仍miss，claim未改。

C：预存并验证v1；resolver调用数0，Skills完整等于v1、不等v2，v1cache仍精确v1，v2key miss，claim未改。transport若被调用立即测试失败，不能真连网。

D：两个独立 Agent IDs / Task IDs / Runtime IDs，共同 workspace与同一个SkillBundleCache、同source/id，分别原refv1/refv2；A run先命中v1无请求，B run匹配v2响应恰好一次；两run Skills分别精确v1/v2、两ref均未改；共享cache下两hash键各自完整bytes保留；B后再读A仍v1。**不拿两目录隔离冒共享验证，不让cold v1对v2-only server期待成功，不声称并发（无barrier）**。

## Exact future execution boundary (not authorization)

A负例 memory RoundTripper严格zero socket；C/D亦内存哨兵。B/E/F/G 明确有自有loopback httptest.NewServer监听，不改造成全套zero-socket，不扩大产品写集。未来独立 nonDB NONE helper可只允许其自有loopback，禁外部网络；上述 selector不触其他包/全daemon未选tests。无DB/Redis/用户HOME/真实CLI/DSH/model，未知request fail，redirect不得逸出；模拟完整HTTP响应不是server实测或E2E。

未来 locked compile-only + 运行须另冻结新HEAD、精确test source与binary/profile/selector。TestMain先调用 RunPiCleanupFixture再隔离HOME；清洁env必须排除 MULTICA_TEST_PI_CLEANUP_MODE/DIR、所有模型/用户凭据与proxy继承，绑定本次scratch清理、CLI sentinel、无skip/raw退出及JSONL实证。工具/cache只用非managed E:/CodexData/morchat-r1-local 的既定锁定材料。本次没有编译/运行权限。

只读依赖 SHA256：skill_cache.go 8ef2f44900abb73abb86581e52e463e8413f8dd5d97218f3e0284eda1c8e6ccb；testmain_test.go 7372545c02b5ebe856163d33b04ac7d45391475c20b423be95dbd9b552d53afe；client_start_test.go e802d94baa84077c6b21611ea8bb167c4bd019fc644bf8591860a3423f8f3aef；server/pkg/skillbundle/hash.go afceea154d0ff8b4596ac72aece5d137817d10df08bc99ddc3f0a167fddd8f05。现有 cache源码修复保留，历史局部BUILD raw LOST；同候选revalidation另冻结，不拿历史GREEN当现证。

## Owners / release gate

producer /root/execution_next（sol medium）以上ACK；未来daemon solewriter候选 cache_owner（sol medium）、Root（model unknown）集成/consumer、guard_review（astra high）独审。独审方向APPROVE不等于本r2冻结；精确 owner/consumer ACK待取得，guard writer交接后重核HEAD/两hash、sourceTF才开窗。无server新历史存储依赖可独立推进，完整历史保留/续claim重建/热缓存撤权/Windows加载仍未解决。

本修订仅读指定当前源与独审，写本r2；原r1不改；无source/index/HEAD/managedtools/DB/HTTP/model/runtime动作。

---
purpose: "R1-01B-DB：首个真实 PAT→CLI HTTP RED"
owner: task-owners
status: draft
updated: 2026-11-07
related: []
---
# R1-01B-DB：首个真实 PAT→CLI HTTP RED

状态 TEST-FROZEN / SOURCE-ONLY / READY_FOR_TEST_SOURCE；运行与产品修复 NOT AUTHORIZED。

Owner /root/acl_contract（gpt-6.1-sol high）；native Auth consumer/root集成者 /root（model unknown）；独立reviewer /root/baseline_review（gpt-6.1-sol medium）。仅E:/CodexData/worktrees/morchat-round1/morchat.co专用codex/round1-continuous；base d69f6acd70475e835e665d47787d90dbee552f12。先独立登记审查和本地冻结文档提交，再向真实sourceowner派工。

权威为 contracts/R1-AUTH-DB-r1-test-frozen.json，精确proposal SHA1c885287553b2adc511a00e281e14df785c4a02f48a1e2b2cc9be1587da24ca5；保留原DRAFT头/历史staged表述，不是当前状态。完整M1/M2/原九title修订方向已准备签认，但本卡不提前开放其写集。

## 唯一允许源码写集

NEW server/cmd/server/r1_acl_cli_token_origin_integration_test.go。先核不存在，只写测试/必要测试私有helper，不改原schema测试、617、Auth/issuer/router/session、policy、generated、锁或共享helper。不得在host/defaultDB跑测试。可清洁离线编译Linux静态测试二进制，仅编译不执行TestMain/init，不下载依赖或调用真实模型。报告实际source/binary/Go/source-baseline hash交runner绑定；无真实HTTP RED前禁止写生产修复。

## TDD 及可判定边界

- 精确parent TestR1ACLCliMintDatabaseBoundary，两子项 OTPPositive/PATDatabaseCannotMint；原7mint及9title一律NOT RUN，不发明skip。
- 复用当前保留A1真实user/member；仅一条proposal固定新OTP与原生POST /api/tokens新PAT。碰撞/有效未用OTP/同名PAT/身份不符都BLOCKED，不能upsert/reset/复用旧7OTP。
- 真实生产OTP登录/GetMe；OTP→CLI200→GetMe200正例；nativePAT→GetMe200→CLI应403；baseline真实200且返回JWT再GetMe200是预期wrongallow RED。预期3run1pass2fail/0skip/process1/converter0，编译失败或setup失败不算。
- 无devcode、手签JWT、假policy、伪prefix、替代路由或Redis。现native TestMain nil Redis保证此包为真实DB auth path；不称真实缓存验证。
- genuine PAT-origin legacyJWT在断言失败前仅写另审私密sink；保留同synthetic signingcontext，禁止stdout/test2json/文档泄漏。capture具体源接口/文件/元数据另由owner与runner签认，runtime前不得读凭据或写token。
- before/after完整641微秒ledger与原ACL6/nativeIssue/project/member/workspace不变；旧7OTP不变，仅本新OTP used1、新nativePAT1及last_used_at允许；无title/任务/用量变更。保留材料不自动删除/撤销。

## 运行门禁与后续

当前仅测试源码/离线编译开放。实际seed/login/mint/capture须新source/binary/3names/argv、retained postGREEN prestate、完整CID/no-egress、私密capture/signingcontext/ACL与精准delta capsule独立接受后root释放；原preGREEN空库快照不代表当前前态。

meaningfulRED后，M1 targeted mint backstop与M2 signed v1/两renew不升级/legacy新scope重新登录必须同一bounded候选，另卡开放。M1不能单独声称排除旧PAT JWT；nativeAuth无真人在场证明。Redis/task/cloud/renew、原title9/三独立title状态、其他出口/撤权/Windows/模型/双机与同候选集成仍是硬门禁。NoBUILD，Goal ACTIVE。

每检查点root更新ACTIVE/本卡/results/经审快照；sourceowner只维护本卡ignored实现报告，不stage/commit。独立审查、原始FAIL/BLOCKED/NOT RUN均保留，禁止降权限或删断言求绿。

## r16 实际状态：READY_FOR_RED_SOURCE_REVIEW / RUNTIME HOLD

登记已本地提交e979ae939bce00c6ba569047947e600502d7de1e。唯一新测试源8e350f1475d265a8b1b4d19c76c437ebb9fe7f8a9ba19902e10b7f13f32882f1、22892B；Linuxbinary716f1c53b9acd240ca76ed59c2659fd972983c5bd9e8ebf63a45511bb9a3f75a、67548140B，offlinecompile0，report249f818770762d7ac4e042b2b72ba215165d66d61cd9b12d6c47f362ce8a0453。最终补新OTP除used/新PAT除last_used_at全行不变量；早期5220/7e28为superseded编译产物，非最终绑定。源码停止修改待独立审，原3schema源不变，无生产修复。
私密sink Linux0600/uid/write证据尚未证明。单次无DB/secret empty-probe控制器失败eb5c06b922f6984ebf62ad9ce1f220a2d4b5c42e1d06089d7a37859a17952be5：实际helper exit70且hostfile0B，但fractional timeout使stat stdout未收，移除过早，uid/mode未知。禁止将此当auth安全RED或默认0777，不可降低sourcegate。metadata-only最小integer timeout/log-before-remove重试另审，不修改业务状态。Fresh retained prestate wrapper尚待精确审，actual auth runtime、SQL/HTTP/capture一律未运行。

### r17 SOURCE APPROVED / 私密 transport 待最小 Linux-native 修复

独立SOURCE APPROVED精确8e350/binary716f1/report249f818，保留r16当时PENDING时序。actual metadata r2 result4122e6840a4a75972027bd3b6303b191c73ac40239200c68373168a516f4b567已独立接受为真实BLOCKED：Windows bind在Linux呈uid0/gid0/mode777/nlink1/0B，exit70，rawstdout4f1bd31bfb54e8a224e5a755adc6b07312476cd8210fc17db98fdfb8b3a15846完整保留，非旧缺log尝试的推断。source0600不变；raw/evidence先存后仅移除helper，原DB/fixture/key无接触。
下一最小修复是保持同capture路径/Go source不变的Linux-native私密file transport，先比较goal-owned Linux测试volume父dirroot0555/单file65534:0600与tmpfs退出前export协议；未创建volume或新helper、未授权改mount/private-retention，精确工程修订需三方另签。现仍RUNTIME HOLD，auth seed/HTTP wrongallow RED/capture尚NOT RUN。源实现者STOP，runner准备协议而非重造通用框架，root只登记/集成。

r18补充边界：只为满足未改source0600，注册R1-AUTH-CAPTURE-LINUX-r1两个空fixture metadata阶段。精确candidate97b7ff2a/new nonDB volume8f3e88dc/metadata source5a70/ELF21a631/init2cb4a3获独立安全审，root仅CHOWN初始化例外不继承给非rootruntime；actualdir root:root0555/singlefile65534:65534/0600/nlink1/0B/noACL/devino和真实fourEACCES必须实测。root分段释放，A actual通过后再审B，之后auth挂载/retention/capsule另审，本卡auth实际执行仍HOLD，不碰PGenv/原DB/密钥，不改产品写集。

### r19 真实前置已满足，实际 auth test 仍待 exact runtime 放行

fresh retained readonly6eaa3807...0a1c/rawe3aadfdb...36ef已独立接受，641及13业务表/旧7usedOTP/oldPAT0与新碰撞0证明当前前态。Linuxvolume实际A bebaf78b...f4a4b/B9f63fb97...c167b分别独审接受，父0:0/0555 dev2128ino13732、唯一file65534:65534/0600/nlink1/0B dev2128ino13756，无access/defaultACL，真实O_RDWR成功且四目录操作EACCES；helper按证据保存后清理，卷保留/zero消费者。
初始A consumer仅image表示错误FAIL5c137、实际profile0395及materialized94c5终态false/null限定修复均保留，没重建卷/没重复init。此后对非空secret file禁止再negativeproof或重跑fixedOTP。source8e350/ELF716f不变。runtime candidate仍须source/fullDBID/volume身份+emptyinode/own synthetic same signingcontext/6metadata/精确3names/合法auth delta/privateenv+raw输出ACL签认，actual pre-auth PG17 snapshot先完成并独审，再root释放首次真实HTTP wrongallow RED。无密钥/SQL/auth/capture已执行，M1M2生产写集仍未开放，NoBUILD。

### r20 备份实际通过，FIRST AUTH HTTP RED 待最终运行器审查

当前retained-postGREEN/pre-auth backup ac5b2566cd905b7eee8ad1b231a089d9804d2854de4db6817b453cc1a4cd2044独审接受：archive0fb7b15a5025eb2c7448bd7217e6cbdc4acb4930597500a7d69fb84d9a5a2386（489149B）/list8edc77077c79eff9bc38a27dac9540d4e54823dccfd50a797cc51b5ff3c887fb，dump.exit0/list.exit0，前后e3aad完整retained数据相同，9outputsACL/config/ns/source通过。不是原empty preGREENarchive，未执行restore。
实际auth仍HOLD：必须绑定本backup、source8e350/716f、same-owned synthetic keycontext（尚未读）、6public metadata、Linuxvolume actualA/B父fileinodes与权限/soleconsumer/empty、全新privateenv/输出、真实Go exec/process1+converter0/3names只因PAT→CLI200而1pass2fail、并无setup/delta/cleanup/capture错误。post RO helper仅stat/hash已sealed文件不导出token/key，匹配源sealedSHA且原13表/641/旧7OTP不变，恰新OTP used1/PAT1及last_used允许后才接受RED。写token后不得negativeprobe/retry fixedOTP/自动清理volume。当前没有密钥读取/认证种子SQL/HTTP/capture；之前只读SQL确实执行，不作宽泛“无SQL”断言。

### r21 PRECHECK consumer FAIL，不是实际安全 RED

candidate1153/controller54605经CODE/SCOPE审、13privatefiles audit260实态接受、external runtime注册b768独审后root once释放，actuale788a65dc6526633a5769d914436d8a6264426a71bb1b796040c46027815bc87仅Private ACL rejected，helper/process/converter均未开始，密钥/PGenv/认证种子SQL/HTTP/capture未触及。Root仍不开放M1/M2产品写集。
实际诊断287de381...ae19表明archive/list叶子与真正私密dirs合格，旧逻辑错误要求其共享tools父继承私密目录ACL，和新retained备份单文件协议不符。最小修正只去除该共享父private分类，不改任何真实ACL，保留叶子/真正private dirs及全ancestor noReparse/canonical。old135B log e7a71201...b581/e788原件不动，12输出仍0B；R2仅新protected-log+newbound执行器/注册，live14file allowlist/原空文件与unused helper/nonce复核，新实际审查后另放行。source8e350/binary716f/HEADe979保持，authRED仍NOT RUN，不能以controller失败当TDD红。

### r22 ACTUAL_MEANINGFUL_RED_ACCEPTED，不是修复 GREEN

真实result7ce86e1a219f502cb26ebb04b42a126cd3b9f33ac16e30b59cde7696b9742771独审接受：actualGo1/converter0，3run1pass2fail0skip，OTP正常pass，PAT真实201/GetMe200→CLI错误200→真正native签名/unmarked30day JWT/A1GetMe200，seal先于wrongallow，没setup/delta/cleanup失败。外层13/641/old7/oldPAT不变，仅新usedOTP1/PAT1。sealed2336B/cab88bdd52f8d4f53de8fe67eb5de0e6a9688b2461c97ecf31e0a9adfaa2d6b9/sameinode13756/0600保留在owned Linuxvolume8f3e，postRO只hash/stat不导出。两helper已精确移除、privatelive14ACL与old135Blog不变，source/postns通过，sourcewindow释放。
这次按Root已审8325登记允许读/复制的是goal-owned合成GREENr2签名上下文4key，不是用户/provider/companykey；实际不再声称“无密钥读取”，而是无未授权密钥或模型读取/调用。真实legacyJWT须保留供后续同key/me200+受保护scope403，禁止现有fixedOTP重跑或secret后negativeproof。原one-log DateTime误判189a与date-only严格rawUTC修正/actualc9a保持，没改真实ACL/时间/源码断言。
本卡仅交付真实缺陷复现，M1M2生产写集当前仍未开；Root将先提交RED基线，再以另卡9source foundation source-only TF登记/实现。后续Green需另审ownedDB恢复/fresh empty sink/真实legacy验证，不把UNIT green当endtoend，不把原title9/其他outlets迁记。NoBUILD/Goal ACTIVE。

r23：实际securityRED基线16白名单已提交0aaf9b088cc5e613a0e8ab2bdb5a582120126a1f（不是fix/GREEN）。接续source-only R1-01B-auth-foundation.md/9source新登记；本8e350只读。原privatecapture/samekey/DB材料保留，restore/postfixHTTP/freshsink另审，不能重放fixedOTP。

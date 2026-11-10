---
purpose: "R1-01D-NATIVE-CLONE — Issue-read 测试隔离目标适配"
owner: task-owners
status: current
updated: 2026-11-10
related: []
---
# R1-01D-NATIVE-CLONE — Issue-read 测试隔离目标适配

状态 TEST-FROZEN / source window CLOSED / 全部功能NOTRUN。实际owner native_clone_impl（gpt-6.1-sol high）；consumer Root（model unknown）；安全独审guard_review（gpt-6-astra high）。基线9deb86654f0f81e227b436a440fd9c4a6ef9a453，E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co / codex/round1-continuous。

精确authority为contracts/R1-ISSUE-READ-GUARD-native-clone-r1-test-frozen.json/spec及docs/superpowers/plans/2026-11-07-native-clone-guard.md；原TF122ecf字节不变。onefile写集仅server/cmd/server/r1_acl_issue_read_integration_test.go。新helper只接已验证routerclone/同名role/127.0.0.1:5432/realSQL三身份；不得用canonical/fakecurrentdb/重建绕过。原共享安全helper/另外两消费者/TestMain/原4events/OTP301302/全部权限断言保持。

先追加37event纯谓词tests+deny-all scaffolds（oldparentcall不改），预期37run32pass5fail/Go1仅基础设施断言RED；编译缺函数/数据库setup/无事件退出不是Guard业务RED。实际RED独审接受后另开newhelper实现及call替换写窗；新纯37GREEN与原Native4分别选择。即便pure body无副作用，原NativeTestMain先bootstrap/server/JWT，需要ownclone/freshcontext/outerprepostaudit，未单独放行不得运行。无新权限/DB/key/Go/ELF许可，设施33calls通过不是产品通过。

签认：ownerACK6e0dd56b/inputs reviewc43d04e9/Rootconsumer exactACK；原ownerHEADd683及ACTIVE旧hash作为历史，Root登记重新核36source无变/metadata仅经审R58状态推进，当前9deb整合源内容等价。注册后仍需独立审和Root唯一test-only写窗。Goal ACTIVE连续三个切片及同候选全部硬门禁。

### r60：Native测试源码phase1已写并独审；service运行前安全门禁最小修复中
Native新TF80180196/R59快照7c1f6068的无阶段exit0冲突已去除，原HOLD51be/旧b90、15b原字节保持；修复16e5593f及独审a2f8ffd8通过，reviewed8doc快照7041266e。Root另test-source release0d3a7f75，仅native_clone_impl(sol high)onefile写tests-first37events，保存缺helper源快照后加两returnfalse脚手架。currentNative0364499d、handoff81a1ac7f/diffba0f81b8；原8func完整前缀/旧sharedhelper调用/OTP/所有原断言及其他35source保持。guard_review(astra high)5722358b实际源码SPEC+QUALITY APPROVE，不是编译或运行结果。writer STOP；37基础设施RED(预期32pass5fail)、原Native4与Guard全部99行为仍NOTRUN，无JWT/context/DB/ELF许可，无宽松clonehelper或目标call接入。
Service42 completeexecutor1e9fd5ce/profilead73源码依赖方案已交，host31PASS只是mock。静态独审a2bcc79d HOLD唯一prelaunchgap：不能把当前任意权限/ACL摘要学习成安全baseline，需在password/helper/ELF前后live复核已接受HBA/精确service own+canonical权限/systemACL及rule来源/跨suiteCONNECT/trigger状态。guard_runtime_r1(sol high)修复轮1/5仅artifact+hostmock，不重GRANTS/重建或降低业务权限，尚无真实SQL/Go/ELF。service_compile_r1(sol medium)另准备离线Go列表实际依赖/新ELF/manifest producer(host25PASS)，当前授权只读SDK+module树inventory，不含可变GOCACHE；真实Go/modverify与compile/runtime仍未放行，不以历史缓存或mock冒新候选证据。
实际repoHEAD9deb，DSH限定7已本地整合/新commit工程35通过，Main产品/mainmerge/push未操作，R57空临时文件事故与所有旧FAIL仍留。Goal ACTIVE，继续测试设施/最小修复和原三切片，不在准备或局部无模型结果结束。

### r67：当前native37测试与原native4仅完成新compile-only
保持source0364/TF801及denyall scaffold，不改sharedcanonicalhelper。Native+Leader新编译81168真实终态0/五步PASS0，manifest70ee/sourcecf53/ELF42b6，actual独审585f只接受COMPILE_ONLY。37infra预期RED、原4实际业务均NOT RUN；native专用context/合法新clone入口/Role与完整TestMain前后护栏尚未runtime放行，不能借handler新key/新53或旧canonical成功。所有source窗CLOSED。

### r68 Native37执行准备仍CLOSED
新增独立namespace准备4b39/closed49ff/51host、852原源hash检查和12PS parse0，全部无target/Go/DB/Docker/date/private/key。Native启动是15stderr+1Email DEVstdout，不能套handler单INFO；仅机制血缘。prep私credential文件hash被auto-review拒绝后仅取metadata并留SHA NOTBOUND，不借工具绕过；旧拒绝留。
handler最新失败post已fe977/26ba92独审接受42保留源行与old保护，可供未来crosssuite精确绑定但非空baseline/可清理。Native专用newcontext、真实权限/空bootstrap/clock/新source ELF（F5新文件后需fresh）均另绑，当前37/原4仍NOTRUN，严禁借handler4337/旧sealedJWT/canonical fallback或并发改同4DB。

### r69：source新增F5后不再把旧42b6叫当前全源码ELF
F5初稿已写但HOLD/fix1，无Native源修改；原Native37与118仍NOTRUN。Native37 PREP51host/4b39/49ff只可静态审，未来须对F5新增/修后重新freshclosure/ELF，不能用旧852/42b6冒新整个候选。原router/role/key/runtime门禁不降，handler42 accepted failure state可保护但不清理，所有Native运行仍closed。

### r70：新F5源稳定后仅准备fresh r4，仍未Native执行
F5source1a7已源审通过，当前旧852/42b6只历史compile证据；fresh r4源码关键pin新增F5/format第5文件，15host/候选1152与bound4835正在独审，不Go。Native37/原4/118/新F5九events均未跑；专用新context/source-shaped权限/新sourceclosure及独立epoch/当前4DB保护仍需后继精确放行，禁止借handlerkey/清数据/canonical fallback。

### r71：当前Native+F5 r4只compile接受，37与原4仍NOTRUN
r4 fresh e8d4/sourcef4c6(853)/10745经d976 actualCOMPILE_ONLY，Native0364/Leader1171保持；源码整体当前已另有handlerfixturefe6，后继epoch/当前closure/专用key等仍精确绑定，不拿旧42b6冒新候选。Native37独立log/projection/runtime准备不因公开imagefacts或F5typed而获runtime放行，不能清42/35、借handlercontext或canonicalfallback。

### r72：仍无Native37运行，新设施失败不转授旧router
新startup只Goal新volume/CID实际FAIL/HOLD，不碰旧PG/router/42/35/sealed；任何context/role/bootstrap/imagecap/新closure门禁不省。Native37/原4仍NOTRUN，不能以migrator或Handler新compile_only代red/green，不在旧canonical或通过defaultURL补成功。

### r73：Native37/原4仍未运行
本turn只有当前工程35单测PASS与失败后公共imagefacts，不是native角色/空bootstrap/clock/context运行门禁。999/999/101是publicaccount不是实际进程groups，旧router/canonical不为本次取证目标、不fallback，不借handlerkey或旧sealedkey。Native37/原4当前NOTRUN；source0364不改。

### r74：仍NOTRUN，guard协议不代Native角色/进程事实
newstartup guard3d8f只CLOSED接受，sourceUID999/GID999+101publicpins不能冒实际进程groups/三cap/SCRAM；旧failed77da不重启或借旧router/canonical补成功。Native37/原4/118仍未运行，source0364与专用context/emptybootstrap/新ELF精确门禁保持，没用privatehash或handlercontext捷径。

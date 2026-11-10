---
purpose: "R1-01B-AUTH：同候选 M1+M2 与可信凭据来源修复"
owner: task-owners
status: draft
updated: 2026-11-07
related: []
---
# R1-01B-AUTH：同候选 M1+M2 与可信凭据来源修复

TEST-FROZEN / SOURCE-ONLY / WAIT_REGISTRATION_COMMIT。真实RED已提交base0aaf9b088cc5e613a0e8ab2bdb5a582120126a1f，actual witness7ce86e1a219f502cb26ebb04b42a126cd3b9f33ac16e30b59cde7696b9742771独审接受。执行base以本冻结文档经审提交后Root实际派工HEAD为准，不能猜占位commit。

唯一source owner /root/acl_contract（gpt-6.1-sol high）；nativeAuth owner/Issueconsumer/root集成 /root（model unknown）；独立reviewer /root/baseline_review（gpt-6.1-sol medium）。E:/CodexData/worktrees/morchat-round1/morchat.co / codex/round1-continuous，main/旧C/用户工作不写。

权威contracts/R1-AUTH-FOUNDATION-r1-test-frozen.json，immutable proposal76行/baa6b1a8的DRAFT头属历史。精确9paths/existingSHA/new3path absence在registry，读取正文source set/API/语义/负例，不扩大目录。

## 第一项实际TDD与最小实现

1. 初次只改auth/session_test.go，加TestRenewSessionTokenProvenance：用现有RenewSessionToken/native real-unit-signature与literal morchat_session_provenance输入，覆盖missing/null/numeric/object/unknown/v1、sid稳定、不升级。不得引用未实现常量/类型制造compile红；先编译交独立unit runner实际证旧函数丢claim行为，再写生产patch。
2. M1 targetedbackstop在GetUser/mint之前，M2 signedstringv1发行和两renew精确copy-existing、privateverifiedorigin作为一个不运行中间态候选。重新核issuer仅OTP459/Google724/CLI774。原8e350与schema3、router/globalRequireHumanActor、DB/schema/generated/锁/依赖只读，不改断言换绿。
3. 五native成功分支全部verification/denylist/binding后stamp；字段只能取verified locals，未绑定留空，不读任何callerheaders写身份view，不做ownerfallback。Private writer/key、publiccopy-only accessor/no token material；nativeheader仅作兼容归属、一致性对照。
4. 只有已签名string v1是NativeV1；missing/null/numeric/object/unknown都Unknown，legacy换发不upgrade。CLI firsttypedSessionJWT+NativeV1/verifiedUserID与server归属一致，其余403/no token/不查询不签发，native401/503/CSRF不改。所有旧unmarked（含合法oldOTP）需新scope重登录；不是真人在场证明。
5. unit selectors与组件native auth/handler/renew assertions沿proposal，真实unit签名/模拟storage/transport明确UNIT，不能冒充realcache/task/cloud/retainedlegacy/E2E。补适用原生回归；source完成交独立review再考虑runtime。

## 运行与后续门禁

只允许clean pinnedGo127/readonly/offline Linux静态编译，实际Go test/init/host/defaultDB/server/密钥/HTTP均不在此放行。Root/runner准备freshNONE/nonDB/noSecret/ROunitELF+ownedtmpfs隔离profile，绑定实际新source/ELF/hash/selector并独审后另释；不需要Ethan决定工程字段。

当前原DB已消耗newOTP/PAT各1，原capturevol8f3e非空2336B/cab88bdd及samekey要保留，不重复fixedcase或secret后negativeprobe。postfixHTTPGREEN先保全postREDbackup、另审同ownedDB事务restore/验证e3aad、freshempty600sink；reallegacy用oldvolumeRO且同key/me200正控，wrongkey/过期401不算保护。上述一切当前未授权。

本基础层不保护Issue/list/search/WS/assets/device或完成R1-01；title9/资源TX/query和权限生命周期后续卡继续，不缩小Goal三切片/同候选实机模型与双机验收。NoBUILD/globalC DRAFT/Goal ACTIVE。Root维护ACTIVE/本卡/results/经审快照，owner仅source9+ignored报告、不stage/commit，独立审查与白名单集成后连续推进。

### r24：真实 nativeRenew UNIT RED 已验收，已派同批来源修复

实际base e479554b667e1a489f8b73188c3901cc2252a7aa；r23精确8docs独审SPEC+QUALITY通过后本地提交，未main/push。acl_contract（gpt-6.1-sol high）firsttest仅session_test.go +73/nativeexistingAPI/literalclaim，source edf3615226f6a18a468b9dd0843025c2e79aed432f314275cdc4ded47282e5ba，offlineGo127 LinuxCGO0 compile0，ELF a676a72bdb99ef34546d534cef24de334561f346a41a4ec1a0ec62e356d77ddd/14884433B；report80183886已独审。

实际unit result d2ae3b5761fef8651e949840cd1a29fc8bfbcb68fae00f9c625b2ff52a2fede3由baseline_review（gpt-6.1-sol medium）独立接受：Go1/converter0/7run1pass6fail0skip，Missing PASS，Null/Numeric/Object/Unknown/V1五个PROVENANCE_NOT_PRESERVED加parent FAIL，无签名/setup/编译/panic失败。freshNONE非DBnamespace，nonroot/dropALL/NNP/ROroot/仅ROELF/无DB或既有key/capture/config；私有7file实际ACL08c59338验收后Root（model unknown）once释放，raw保存后helper41118a4c...2d035精确移除/独核absence，36bindings/ACL通过。stderr仅原生TTL INFO，非setup失败。

执行器预审classifier缺同package/事件顺序的BLOCKED已保留old9663/bcf1 .prestage-review；5新增负例实FAIL后最小生命周期修正，24puretests PASS，新candidate010744d3/controller2cde1948/proof31e30fe3独审后才执行。未改产品断言凑红。当前接受的是行为RED，不是GREEN/HTTP/legacy保护。

Root已放acl_contract单写登记9source的atomic M1+M2/privateverifiedorigin：verifiedlocals-only、不采callerheaders、unboundempty、entryshadow、全部native成功分支验证后stamp；CLI在查询/签发前只允许verifiedSessionJWT+signedexactv1+一致userID；issuer v1和两renew原值精确copy/no升级同候选不运行中间态。Object测试alias非阻塞审查项须在最终GREEN前独立deep snapshot补强。仍只准offlinecompile，runtime另绑实际新source/ELF后独审；原8e350/schema/router/globalguard/DB/deps/locks只读。

runner_fix（gpt-6-astra high）并行准备新隔离componentGREEN及POST-RED备份/owned事务restore方案，不执行restore/DB/既有secret/capture。已接受HTTP wrongallow RED7ce86e与legacy封存2336B/cab88bdd不覆盖；fixedOTP/PAT已消耗，不自动重放。修复源码、组件GREEN、真实HTTP/legacy/title9及其他出口/权限生命周期/三个切片Windows模型Leader双机同候选总验收仍未通过。Goal ACTIVE / NoBUILD / 全目标不缩小。

### r25：atomic 9-source候选已产出；POSTRED真实备份已验收

Owner acl_contract/gpt-6.1-sol high已停止写9source；M1+M2/privateidentity候选及测试已实现，3原生pkg仅offlinecompile0，未实际repair GREEN/运行服务。report52e5c084e8eacd83216166d55907420a64213108e81dcde20c91da60e3699f3a；source review package diff3b7cb46177957b175afa56bde83281c56b72c509b22c4a30d83ab37ad558f530/json eb239fc457e946e940766d677c2cd8dd23c7d8b0985837f770eea96fd665b063实核9hash无漂移。Root为跨鉴权分支专项独立安全/规格/质量审调高强度：实际新增 /root/auth_review（gpt-6-astra high）；/root/baseline_review（gpt-6.1-sol medium）继续集成记录与运行证据独审。不是源权限/API/contract revision变更，无人取代作者做自审。生产候选PENDING REVIEW，不因编译升级BUILD。

离线compile：auth54f1fd07...3e93、middleware61d72530...6944、handler-r3 7687d0bf...1b43全实际0。handler r1/r2先因lockedcache缺go-toml2.4.3/cobra1.10.2/pflag1.0.10 setupFAIL，原log保留；Root按现go.mod/go.sum官方proxy.golang.org唯一/cleanenv精确下载3锁包，实际0且sum等同/锁SHA616f1d45及5e6088b0无变，未改依赖/删测试。download logs3f409967及0e8de2a4为实际补cache证据，不算行为RED。handler原生TestMain先连defaultDB/Ping失败exit0不运行selector；其normal ELF仅COMPILE-ONLY，不在NONE环境运行冒充绿。新2handler测试需另审LinuxGoFiles+原字节2test+tiny原helper compat的server/.local镜像编译/隔离UNIT；旧DBregressions保持NOTRUN，未改handler_test/TestMain/授权写集。

实际POSTRED backup result b584ce4be5b10aadf2df3d3ddc8de20764c3588e56fa856dede35556c903d0a8已由baseline_review独立接受取得/list：archive489348B/ada742291af82fa2bda992e696972869361c9373bec286f10ee85c4d228edd55；list58e506bbc74af6f4a774e946293740c5728ceb651a0292cf732fcf86cbc80ea5，dump0/list0/四stderr0，PG17 CUSTOM/PGDMP/morchat_r1_nm/15TABLEDATA。两次只读query0/raw65973B逐字同c77f，原13/641digest703088/old7与实际新usedOTP1/PAT1保留；fullDB/volume/ns/config beforeafter一致、9protectedACL/SDDL/nlink/canonical通过；elapsed4.927s。Root once DB-runtimeexclusive无app/test/migration写入，仅源编辑并行；未创建helper或读JWT/capture，非产品source不变证明。zero-client/prepared0由获审controller执行检查但无单独rawvalue，不称独立原始记录复核。前置PREAUTH archive0fb7完整保留，取得备份不是restore已验证。

备份并行根因裁决：dump/list执行不消费产品9source，移除无关producthash但保留9实际backup输入/SQL/provision/依赖/工具/accepted7ce/c77/DBcapsule/HEAD e479；不放松任何DB状态、隔离、ACL条件。候选a80cf2c4/controller08088aef/provision2559c4f1经审后Root才once执行，继承e3aad/zero-newOTP prose不适用，明确c77POSTRED/usedOTP1+PAT1权威。当前无restore授权或执行，后续实际inventory/owner/ext/sequence及schemaSQL先只读核再另审有限事务restore；不自动reset/replay已用fixedOTP或碰sealedlegacyvolume。

runner_fix/gpt-6-astra high仅准备逐pkg隔离GREEN实际绑定和handler精确镜像、恢复前只读证据，不创建未审镜像/运行产品。独立源码审已初步指出续期token→CLI链/CSRF测试覆盖疑点，最终verdict尚未出，未称代码已审通过；后续根因修正不能削弱断言。所有真实RED/FAIL/BLOCKED/NOTRUN保留。Goal ACTIVE/NoBUILD；source审与组件实跑、真实HTTP及same-key capturedlegacy、title9/其他出口/撤权和R1-02/R1-03实机模型双机同候选硬门禁均未完成。

### r26：auth7＋middleware28实际组件GREEN已独审接受，handler覆盖fix1待复审

/root/auth_review（gpt-6-astra high）独立source报告e01f1caacebbbfbd8a9b068b04aecdb3f7593683d93eba3e494f929c866df9bf：生产trust-boundary静态PASS，但SPEC/QUALITY CHANGES REQUESTED唯一P2，冻结要求的自动cookie续期token→CLI403/noGetUser/noToken完整链缺失。Root读原生renewCookieSession确认safeGET才自动续期，判定为真实测试覆盖缺口而非已证生产漏洞，登记fixround1/5；未放宽要求或以编译算GREEN。

Root已在独审组件runtime/profile/actualACL后各once真实执行：auth result99fe429774d2d30d52d7e479f840a63c4701ae114451f9ad26b5fd12325dbd78，7run/pass7；middleware result816d9ca5c01c219cda3cab791d2d965d9625b053d5e111ba8009d06d142dcf4c，28run/pass28；均Go0/converter0/0fail0skip，baseline_review（sol medium）已独核strictJSONL/packagepassLAST、raw5hash/actualprofile/NONE非DBnamespace/oneROELF/nonroot/dropALL/NNP/无现有key或volume、30+58bindings/liveACL、terminal0/noOOM/耗时1.583/1.659s，raw保存后exacthelpers f46bad73...0ea81和8433207c...b590e移除/独核absence。Stage1 auth audit65f462b2与middleware0733e24a各7protected0B实际独审先于Stage2；共用packagecontroller25ff2905/provisionc8742788仅mandatoryexactcandidatepath数据接口，不改strictlifecycle。此为选定UNIT，不是真Redis/DB/HTTP/handler/fullnative回归或整体候选GREEN。

acl_contract（sol high）fix1只修改handler/session_test.go：6e479→ab12934ff39643dd4e3a89803a401f4b66defcc23e056d0e98f4812ae2922347，其他8source Root实核原hash不变。每6shape新增AutoCookie：near-expiry UNIT真实签名cookie过nativeAuth safeGET→取exact响应authcookie/nativeCSRF→Auth→CLI；5untrusted403/no token/zeroCLIGetUser，v1positive。原Cookie explicitPOST改过Auth+真实CSRF并确认POST未先自动续期；每shape加MissingCSRF native403/不callRefresh/不SetCookie。未修改生产权限或middleware既有断言。新normalhandler-r4 offlinecompile0，ELF76629001B/5bb817a6bb1732bdefb1ab35cf21b0c5260006dd96799f4a92f36156b0890511；旧r3/两个cacheFAIL不覆盖。appendreport6b2523b2a9b5a3ce7253c80af7eb5e88882e81c102690a1e749fe602b3810b9c，原52e5prefix完整。新handler expected47names（CLI16+Refresh31）尚NOTRUN，旧35预期被显式取代；fix1currenthandlerdiff aa21c78a已交auth_review定向复审，当前PENDING。Root只读gofmt -l精确9source exit0/无文件，diffcheck0。

handler nativeTestMain/defaultDB/noevents exit0事实不改，normalr4 ELF仍COMPILE-ONLY。runner_fix（astra high）只读clean pinned offline GOOSlinux go list metadata actual0得到151GoFiles+2必需原字节embed assets attachment_text_preview.json/reserved_slugs.json，无cgo/asm其他资产；tools/r1-auth-handler-linux-golist-prepare.json d3b558ab...02a85及镜像route642844e3仅准备。拟同目录server/.local/ownednonce中原字节151prod+2embed+2actualtests+tiny3vars/2const/native newRequest compat，精确manifest/argv/hash前后检查先独审再Root放创建编译，不改handler_test/TestMain/选定断言，未选原生DB回归保持NOTRUN。当前镜像未创建/编译/执行。

Goal ACTIVE/NoBUILD，R25已由baseline_review独审通过653615b9。POSTRED备份b584/ada742与PREAUTH archive0fb7保留，未restore/重放fixedOTP/触sealedlegacy；恢复仅prepare readonlyinventory/schemaSQL方案，未授权执行。后续实际handler47/适用native回归/原生HTTP+same-key capturedlegacy/title9/所有出口撤权/R1-02/03实机云模型Leader双设备同候选总验收仍待完成，不把35组件通过当完整版本验收。

### r27：source fix1独审通过＋handler47实际镜像UNIT GREEN，继续原生回归/真实HTTP准备

P2已关闭：auth_review（gpt-6-astra high）定向fix1独立SPEC/QUALITY APPROVE，报告0bd1a7f708820386d2880065c48905442fd3d7d4e9478d816bf4f5bcc8c9d12a；实际只handler/session_test.go ab129改变，其余8source逐hash不变，未动生产语义。结合e01f原生产staticPASS，最终source静态APPROVE不等于HTTP/legacy或BUILD。Root ledger fixround1/5 closed、0open，无删除测试/降低权限换绿。

Root先按manifestf9a4a26f/materializer0cb70846经审once创建server/.local唯一049c镜像+offlinecompile，actualresult d7042514d310e6e0b768df92b0825cebec15ab766ce25dc83d4a914c48d61b00独立接受：151真实Linux生产GoFiles+2embed+2actualtests+tiny原helpercompat=156文件逐字节相同/无额外文件，beforeafterGoList/20bindings无变，compile0/两stderrstdout0；ELF1438cd9e21dad69f9ccbcde8b8865c097cfec6b7ea4c3b6a1bd514207bf301cb/30494364B，go1.27.3/Linuxamd64CGO0/command-line-arguments.test buildinfo。normalhandler r4 ELF5bb8仍只compile；未修改nativeTestMain或source10，镜像不是原生DB整包。

随后candidateebef0a70/proof9ce70ae4及既有controller25ff2905/provisionc8742788经审，Root Stage1实际audit ad05d6dc72585a28ac9b994a181eb0963ee3c05a9e90f0e9d586af600ce09f26的7protected0B/ACL独核后once Stage2。实际handler镜像UNIT result c9c5e751f692eb949b006c1278d3fe840d0535843afb3c447efe9274f9fac520已由baseline_review（sol medium）独立接受：47run/pass47/0fail0skip/Go0/converter0，全部6shape AutoCookie与MissingCSRF共12children逐个PASS，command-line-arguments packagepassLAST；raw5hash/344binding/actualNONE/oneROELF/非root/dropALL/NNP/无DBkeyvolume/liveACL通过，terminal0/noOOM/elapsed1.715s。raw保存后helper cba476d0...5617b精确移除/独核absence。连同auth7+middleware28，目前选定组件共82真实PASS，但不是179原生回归、真实Redis/DB/HTTP/封存旧JWT或整体候选BUILD。

Root当前fresh工程验证实际执行：pinnedNode cleanenv下scripts/engineering全部35test PASS/0skip/exit0，log .local/engineering-prep/r1-01b-auth-foundation/engineering-current.stdout SHA dd417e31423ddaafd013ae675572a03dd206f65b85688f2cf1d995bdf29a8b7b、stderr0B；pinnedGo127 cleanoffline LinuxCGO0 vet -mod=readonly ./internal/auth ./internal/middleware ./internal/handler actual0，foundation-vet.stdout/stderr各0B；gofmt -l精确9source无输出/exit0、git diff --check0。不重复无关前端重装/基线恢复，不把这些静态工具输出算HTTP。

acl_contract只读静态原生回归清单e633847f9d711a9735c815782104fb9d635748fd7f5922b96419e8ec30adc983/MD0a2944e2已产：auth32parents113names（core65+directCookie48）、middleware31parents66names，未来count1/noSkip，需要独审实际capsule后实跑；现在NOTRUN。真实Redis PATCacheHit、handler旧7refresh/4actor普通包DBTestMain依赖保持NOTRUN，不用compat伪装旧fixture。清单工具初次PowerShell Group alias冲突6diagnostic/shell0/emptygroups FAIL：两个草稿先被覆盖，JSON按相同hash确定性重构明确reconstructed-failed-draft非原位保留，MD raw LOST如实记录；并非产品/test失败，最终counts/selector/roundtrip核验通过但还非实测。源9未变。runner_fix/astra high准备两包新的native-regression数据manifest，复用同ELF/profile/控制器，无运行授权。

POSTRED/PREAUTH备份与真实legacy cab88私密卷保留，未restore/重放OTP/读JWT或调整时间TTL。未来封存JWT真实30day当前尚不满足半TTL续期条件，不能把自动/explicit refresh noop说成已真实renew，更不能改TTL/伪造到期/系统时间凑绿；原legacy /me200→CLI403的后续真实控制仍可独立推进，renewal条件按事实单独签认，不冒充完成。Root继续先native回归、另审只读恢复前inventory/schemaSQL及实际事务恢复、freshsink/真实HTTP GREEN；之后title9/其他数据出口与R1-02/03模型实机Leader双机同候选硬门禁未完成。Goal ACTIVE/NoBUILD，不在组件报告结束。R26连续快照840f已独审接受；历史FAIL/NOTRUN不回写。

### r28：179适用原生回归实际通过，白名单收束source候选后继续DB/HTTP

baseline_review（gpt-6.1-sol medium）已独立接受实际原生回归：auth result b1575750bd351497fc5042e62584a0a5759851323521ded10812ad743b5e4ced＝113run/pass113；middleware result c7969f6d9ce7847009b8a1ab927cc34a1c7d7f19ebfa30ee1ac0bf1f9c46bd56＝66run/pass66，均Go0/converter0/fail0/skip0/packagepassLAST。各raw5hash/45+67bindings/liveACL/actualNONE/oneROELF/nonroot/dropALL/NNP/无DBsecretvolume通过，terminal0/noOOM/耗时1.567和1.733s。Root只在Stage1实际audit69166eab与6bda025f各7protected0B/liveACL独审后onceStage2；source/profiles/controller25ff/provisionc874/ELF54f1及61d7不变。raw保存后helpers4ca21436...c1275与299a66d7...6cb05精确移除/独核absence。是实际旧原生纯单元回归，不是静态113/66清单或预期数。

当前已验收新组件82＋适用旧原生179个命名测试事件全部PASS，另fresh工程35PASS/vet3pkg0/gofmt9clean/diffcheck0；source最终staticSPEC/QUALITY APPROVE0bd1与P2fix1原始审查链保留，真实HTTP wrongallow RED7ce86及原生renew REDd2ae不覆盖。尚未运行realRedisPATCacheHit、原handler DB TestMain下旧7refresh/4actor、原生修复HTTP/真实sealedlegacy及其他出口/title9/生命周期；不把单元261之和冒充261独立E2E场景或完整候选验收，更不升BUILD。

Root现在仅白名单stage/独审/本地commit exact9source+三append任务记录+r24–r28检查点；不是main合并/push/部署，不提交.local镜像/私密材料/报告raw。提交前基线仍e479554b667e1a489f8b73188c3901cc2252a7aa，未来DB/HTTP执行base必须由Root提交后实际核HEAD再绑定，不猜未来SHA、不复用旧已执行capsule。该commit只收束source候选，不标R1-01/Goal完成；runtime仍需独立exactprofile/实际状态与Root一次放行。

runner_fix（gpt-6-astra high）正在复用POSTRED dump工具准备仅只读的restore preflight：保留c77前后、当前b584/ada742与PREAUTH0fb7、维护库zero-client/prepared原raw、完整catalog/owner/extension/sequence、两archive schema-only render及live只读schema比较；无restore或破坏性argv。实际尚未执行这些新只读命令，也未restore/重播OTP/读sealedJWT/改TTL或时间。下一按真实证据单独review/Root放只读preflight，接受后再另审同ownedDB事务restore和freshsink/真实HTTP GREEN。可不依赖restore的原handler DB原生纯测试也须另审精确fixture与私密env/DBdelta、不能NONE下0events假绿。

每个范围仍由真实owner/消费者与独审落实，不向Ethan重问字段或既有授权。R27 b860连续快照已独审接受。Goal ACTIVE / NoBUILD / 不在准备或无模型局部完成停下；title9/权限出口/撤权、R1-02 Windows DSH真实进度归档用量、R1-03 Leader版本保存双机与同候选实机云模型总硬门禁均未完成。

### r29：实际源码候选已提交；恢复前只读实证与完整目录/SQL审查通过

实际当前HEAD108866b26cd4992b9f322d6a7a46541eb1c5c6e0/codex/round1-continuous，精确17文件经独审c833a2b2/diffbef13bd6后Root使用已验证gh身份one-shot本地提交，提交后clean；未改全局Git身份/main/push。源9与source-final0bd1一致，组件82及适用旧原生179均已真实通过，HTTP/真实cache/legacy/三切片总门禁不因commit完成。Root/model unknown集成登记；source acl_contract/sol high，执行器runner_fix/astra high，独立runtime/目录review baseline_review/sol medium。

在该新base且DB-runtimeexclusive（其他仅offlinecompile）下，final只读candidate62211da6/controllerf6317868/provision9f0e0d19经完整独审后Root once执行19protected输出provision＋只读catalog/client/prestate/live schema dump＋两archive schema-only render。actualresult9aedbcefe76309c54f804f12b073c3e29db64d9d78625664dd6e42613006e9d8/query2/exit0，状态只为ACQUIRED_AWAITING_CATALOG_SQL_REVIEW，绝无pg_restore连接DB/seed/新helper/密钥或capture动作。原准备PGOPTIONS序列化错误在SQL运行前静态拦截，8f423失败/e479 asof/r2草稿全部保留，final只换实际base/引用名/lineage，无改SQL/commands。

随后baseline_review已完整独立接受实证与schema/catalog设计前置，持久报告 .superpowers/sdd/2026-11-06-round1-continuous/r1-auth-db-restore-preflight-independent-review.md SHA6b61226d6e64a8815a26bd76764fb7fdfeb9f12702e757d60ab188537d1614a0。18raw hashes/sizes全match，19live叶子creator+SYSTEM protected/nlink1/canonical/noReparse/SDDL前后同；17bindings、HEAD108866/config44136/DB+volume/ns前后通过，c77字节前后无变，catalog7dee前后同。真实maintenance raw733e前后 identity/ownedtarget true、otherClients0/clients[]/prepared0/[]均逐字段核；不是仅metadata锁或缺raw的声明。

PREAUTH/POSTRED/live schema每份327603B，唯一差异为第5/9019行恰一对匹配的psql restrict/unrestrict随机字母数字token；原件未改，独审仅在内存明确替换这两个token后其余完整字节相等，review SHA f341b196cc45516efc5cb819290535839e3007fdf8b1640a6eb4561c0bafa8ed，不粗略删字段/注释。全部946 TOC entry（809schema＋137TABLEDATA）pre/post逐字同，137qualified tables精确对live；先前15TABLEDATA是指定expected subset，不是全库tabledata总数。466indexes=308standalone+119PK+39unique；472constraints=119PK+39unique+197CHECK+117FK；497triggers=29app+468internalFK。29dumped native函数体逐一映射18可信hash UP/617迁移，另67为36pgcrypto+31pg_trgm库函数；扩展恰pgcrypto1.3/pg_trgm1.6/plpgsql1.0。seq/enums/policies/rules/defaultACL/eventtriggers/publications/subscriptions/foreignservers/tables均0，无SECURITYDEFINER/RLS/customACL，owner为本owned合成role。

恢复设计必须保留未被archive重建的public schema/DB属性/plpgsql（ownerACL/encoding/collation等）；cleanrestore会重分配user OID，after不能假定rawcatalog7dee相同，也不能blindstrip全部OID，必须保存raw、以完整SQL仅已审restrictpair差异和qualified-object/reference/owner语义独核。当前只确认可准备有限sameownedDB事务cleanrestore候选，尚无restore执行授权或结果；目标仍fullCIDa7d5/morchat_r1_nm、原PREAUTH0fb7 stdin、POSTRED b584/ada742可恢复备份保留。runner正在仅prepare bounded executor/data，最终需新exact code/argv/timeouts/failureunknown/raw/前后判据独审和runtime登记后Root separately once放行，不自动retry/readback/reset/删除。

源owner另完成当前base的postfix cmd/server compile-only：初版显式Go变量但未全envclear，b450产物仅provisional保留不回填清洁声明；Root随后授权NEW r2，以ProcessStartInfo.Environment.Clear精确16key白名单实际offlinecompile0，新 .local/engineering-prep/r1-01b-auth-foundation/auth-db-postfix-r2-linux.test 67556683B/SHAb450f2e647f98d638766c6c09bbb95b800c6ed1eab02dba28bc990353694d95e（与初版字节同只证明产物一致），r2log0B，Go127/LinuxAMD64v1/CGO0 buildinfo，报告e28fbb4701e03af6d1fd686d4330181e9fa6e731affc498bcfec0e6eb32a8250含source9/cmd8e350/schema3/currentHEAD全hash。Root已复核actualhash；未运行binary/TestMain/init/HTTP/DB/key。旧RED716f不改；未来HTTP只用新r2，仍须实际恢复前态+fresh600sink/same-ownedkey/noegress/profile另审才运行。

R28 81d724历史快照与17file收束已独审通过。Goal ACTIVE/NoBUILD，继续恢复与原生handler DB回归/真实HTTP准备，不将本只读报告或编译当认证验收；realRedis、封存legacy实际边界/正常TTL不可续期限制、title9及其他出口/撤权、R1-02 DSH归档真实用量、R1-03 Leader版本保存双机与同候选云模型实机硬门禁仍未完成。用户既定架构/持续授权保持，不重复迁移/导入/重问工程字段。

### r30：有限 owned-DB restore runtime TEST-FROZEN 实际登记，待登记独审后单独once释放

Task R1-AUTH-DB-RESTORE-r1 / revision r1，源基线实际108866b26cd4992b9f322d6a7a46541eb1c5c6e0。Root/model unknown为registrar/集成消费者/运行operator；runner_fix（gpt-6-astra high）执行器owner；baseline_review（gpt-6.1-sol medium）独立SPEC/QUALITY/实际证据reviewer。productWriteSet NONE，仅samefullCIDa7d5/morchat_r1_nm owned合成DB，输入PREAUTH0fb7与已接受POSTRED b584/ada742备份、独立完整schema前置9aed/6b612；精确25输入和19freshprotected输出在candidate，不碰主树/生产/用户资料/新服务/模型/密钥/capture。

最终r4 candidatec318be76716492bc130245829aa84d422a8273b39936c5326ab88c93fe393b20/controllerf02052e235c5866b717498e36060fbab21eff9407758c8fba23b555054be2061/provisionc55d0f32e45127d50d68f0245a65f13890532021950a0651c9ff3d54c2ca62b3已独立CODE/SPEC/QUALITY APPROVED，report0bc188a4/proofa951792d。初r3独审blocker是config后检throw可能在PG实际执行后丢raw退出证据；原件0648/18bb保留，最小fix1改destructive-only：configbefore→rawrun→先持久stdout/stderr/actualexit/error/result→configafter→good。假子进程+配置漂移纯回归先RED后PASS，仍failclosed UNKNOWN/stop，不降安全检查；无真实PG执行。外registry在provision/query之前要求绝对path+externallyreviewedSHA，exactrequiredfields deepEqual；模板741fc外壳NOTAUTHORITY不能运行，无自指hash循环。

Root现在才将template.requiredRegistration实际写入contracts/R1-AUTH-DB-RESTORE-r1-test-frozen.json（只此有限runtime TEST-FROZEN，不升BUILD）；包含revision/currentbase/candidate+controller SHA、acceptedpreflight/review/backup/archive、exactCID/DB/c77→e3aad、restoreCalls1/singleTransaction/DBexclusive/noCreateDrop/noKeyCapture/noAutomaticRetryOrReadback、sourceNONE/runtimeownedonly。此登记及r30仍需独审；登记不是自动运行，尚未Root separateonce release/执行。源码/HEAD不变，不为登记再commit改base。

获准后的唯一mutation将是PG17 sameDB pg_restore --clean --if-exists --single-transaction --exit-on-error，0fb7 stdin，无--create/jobs/disabletriggers/role/globalsettings/terminate/alternatearchive。新维护库postgres只读raw0otherclients/0prepared/ownedtarget是在原DB c77/catalog7dee/fullschema强校验后immediate pre-restore保存，不是maintenance DB的restore目标或server全局锁。Root必须独占DB-runtime窗口，无app/test/migration并行；无key/token/envConfig导出。实际PG0后才按已批准计划采集e3aad/完整schema/qualifiedobjects+refs/owners和publicschema/DB属性/plpgsql保留证据，不比较恢复后raw用户OID，不blindstrip字段。全raw及ACL保留后独审接受才可称恢复验证通过；PG fail/timeout/config漂移一律UNKNOWN并stop，不推断已rollback，不自动diagnosticreadback/retry/repair或删除文件。

当前仍NOT RUN restore/seed/真实HTTP/legacy/realRedis/nativehandlerDB回归。runner保持r4 frozen、19outputs未创建；Root接下先请求actualregistry+r30独审，接受后单独工具调用放exactonce有界动作，不重复向Ethan申请已持续批准的owned合成库安全操作，也绝不把本登记等同Goal/BUILD。R29 747423a7连续记录已独审接受；全三切片/模型Windows/Leader保存双机同候选硬门禁继续保持未完成。

### r31：唯一恢复已执行PG0，但后验hash门禁BLOCKED；离线根因确认，只准备独立只读completion

R30实际registry c7f20dd9及snapshot f7a6a407已独立审通过后，Root另一次工具调用才释放exactr4候选c318/controllerf020/fullCIDa7d5/ownedDB morchat_r1_nm/原PREAUTH0fb7事务恢复（DB-runtimeexclusive、无并行app/test/migration）。actualresult .local/engineering-prep/tools/r1-auth-db-owned-restore-result.json SHA7a2c50e5e551a567248c52e375eb7298a2a4ccdd48c75d9cf37096920a2f5e73：PG actualexit0/error null/restorestdout0B+stderr0B，queryCalls2；但状态RESTORE_EXIT_ZERO_POSTPROOF_BLOCKED，afterraw7e57b8f27f00e8474d782bb3844fa66524318366392fa2dad8622d0f98eab242不等expected e3aad。因此controller1，Root保持停止全部DB/test/HTTP，不重试restore、不自动readback/rollback/repair。原R1 max1 mutation已消费；不能重放旧controller/registry或删输出重来。

Root/runner/独立reviewer仅离线读已捕获raw，初“新旧query字段不同”假说已被事实否定：e3aad与7e57都有相同14keys，newOtpRows/newPatRows均[]，两份同65487B，Node assert.deepStrictEqual(JSON.parse(expected),JSON.parse(actual))实际通过，所有字段类型/值/数组顺序相同。唯一原字节差异是retainedActors对象7个synthetic email→numeric1的键排列；SQL json_object_agg未ORDER BY，JSON对象顺序不是数据身份。独审有限span[65043,65296)含key标签，owner更窄value span[65062,65296)，差异仅在此对象内部，前后其他原字节严格一致，不是字段增删/表值/空白的宽泛容差。

独立离线报告 .superpowers/sdd/2026-11-06-round1-continuous/r1-auth-db-restore-postproof-offline-review.md SHAdb66cbae799529fff0cbc9c8f3b0f7bb08d458ef99777c7eebe61b2322f7b123/4119B；执行器owner离线diagnosis .local/engineering-prep/tools/r1-auth-db-owned-restore-offline-diagnosis.json SHA3a0fa3049bd4da75f71515863562b0ab8efca06fcfc6411fd6cfad58b45b474d。原7a2c BLOCKED与全部raw/19files不改。只可确认“实际PG0、已捕获数据态与PREAUTH完整语义相同，raw指纹consumer因对象键序BLOCKED”，不能宣称完整恢复通过：post clients/catalog/schema及stderr仍0B未执行，post namespace/ACL/inputhash后检也不能推定已完成。

根因修正方向不是删数据要求求绿：新的最小独立READONLY completion只准备fresh输出，必须全JSON keyset/type/value/arrayorder strictdeepEqual，并对raw只允许这一个已独审对象的7键置换、其余字节exact；unknownfield/任何值/数组/ledger/hash/对象成员变化均拒绝，原件不canonical写回。未来指纹SQL应确定化或明确JSON语义契约，不能继续把未排序json_object_agg原字节当稳定数据hash。新completion还必须真实补采完整qualified catalog/schema(ref-owner/publicDBprops/plpgsql/OID语义)、raw0client/prepared、DBns/config/ACL与前后state/invariants，而不是用离线解释代替未取得证据。

Root已限制runner_fix/astra high仅PREPARE新R1-AUTH-DB-RESTORE-POSTPROOF-r1候选与NOTAUTHORITY模板，必须零mutation/绝无restore命令、NoKeyCapture、原max1已用、当前base108866和blocked7a2c/db66/e3aad/7e57均绑定。全部现有zeroB文件也不复用。待actualcode/data独审后Root再登记独立TEST-FROZEN只读runtime、登记另审后explicitonce读取；当前无新readback/query或HTTP权限。baseline_review/sol medium独立审，Root/model unknown登记operator，source9与HEAD108866保持不变。

Goal ACTIVE/NoBUILD；PG进程0不等后验完成，source候选与261选定单元/回归PASS仍有效但不冒充真实HTTP/legacy。POSTRED b584/ada742、PREAUTH0fb7与sealedcab88旧JWT卷完整保留，未读取modelkey/JWT/capture或改TTL/时间。继续已授权故障定位、只读补验准备与真实HTTP后续，不把本BLOCKED报告当Goal完成；全title9/权限出口/撤权/R1-02/03真实Windows模型Leader保存双机同候选硬门禁仍未完。

### r32：独立零mutation只读postproof TEST-FROZEN实际登记，待登记独审与Root单独once放行

Task R1-AUTH-DB-RESTORE-POSTPROOF-r1/revision r1，actualbase108866不变，Root/modelunknown为registrar/operator及消费者，runner_fix/astra high为执行器owner，baseline_review/sol medium独立SPEC/QUALITY/运行证据审。原r1restore mutation已真实消费，不重放；new productWriteSet NONE/runtime只读同fullCIDa7d5/owned morchat_r1_nm/noKeyCapture/noRetryNoRestore/mutationCalls0/readOnlyOnlytrue。无SQL mutation、pg_restore/render、测试、模型、secret/capture操作继承。

actualcode/data已独审APPROVED：candidate0351933855460f77e5b36cfc7ad2ba4fec54b87d9c14fab0d0cba82a889b429a/controllera7b6ed23085de100bbd55ac92e878ca04668e130b14934be7386cd8ae8fc7dfe/provision9b5a14f63c9b6729f9b588c60ca09c9c896762df6401860cbac5ec72cedf191f，pureproof42817a72/reportfb4ba3a7。30实际bindings及helper/deps matched；17fresh protected输出全部absent且与old19无交集，旧zeroB文件亦不复用；9commands与旧r4中获审只读项逐一deepEqual，没有restore命令。原7a2c BLOCKED不改写，不“修复”历史结果。

精确数据谓词不是删值容差：fullJSON所有keys/types/values/arrayorder deepStrictEqual，raw仅object-value span[65062,65296)这7个固定email→numeric1按原formatter的排列置换；该span外每字节exact，duplicate/新增/删key、值变化、数组重排、格式/其他字段变化均拒绝，已保存7e57/e3aad实际predicate通过且负例拒绝。只解释已证SQLjson_object_agg无排序所致序列化差异，raw原件全部保留，不做宽泛canonicalize写回。新的实际采证仍必须before/afterdata语义与有限字节守卫、完整catalog/schema双采+qualifiedrefs/owners/publicschema/DBprops/plpgsql、zero-otherclient/prepared原raw、DBns/config/ACL/inputhash；freshraw先存后config后检，任何fail保持BLOCKED，不自动repair/retry。

Root现在将模板的requiredRegistration（不是NOTAUTHORITY外壳）写入contracts/R1-AUTH-DB-RESTORE-POSTPROOF-r1-test-frozen.json，绑定actualblocked7a2c/expectedoriginale3aad/actualsaved7e57/独立db66/currentbase108866/exactcandidate035193+controllera7b6/zeroMutation/原restore已用/soleownedDB。脚本在任何provision/query前强制actual外registry绝对path+externallyreviewedSHA/exactfields，防止自指或模板冒权。此实际registry和r32仍待独审；登记不等于执行，Root尚未单独once DB-exclusive readonly释放/无任何completion查询发生。

独立登记审通过后Root下一独立工具调用才可有限17输出provision+只读补采，仍不能自动跑HTTP/seed/test/restore。实际result需要baseline独核freshdata/catalog/schema/ns/client/ACL等后才可接受整体恢复后态；原PG0与旧BLOCKED均保留，不能以本代码或登记PASS冒充真实后验。R31 427440ca连续记录已审接受。Goal ACTIVE/NoBUILD/source9及261选定测试记录不变，真实HTTP/legacy/realRedis/原handlerDB/title9/权限生命周期和三个首轮切片Windows模型Leader保存双机同候选硬门禁继续未完成。

### r33：只读completion在物理column attnum门禁BLOCKED；离线全目录差异已核，准备raw-first r2补证

R32实际zero-mutation registry e0678edb与snapshot0eadd5cc独审通过后Root另一次工具调用仅释放READONLY completion。actualresult .local/engineering-prep/tools/r1-auth-db-restore-postproof-result.json SHA4bee55bc5203e78ba96c1bd675316760ffbf14f121df9c71ef1962206793130a，statusBLOCKED/queryCalls1/controller1/mutation0；原7a2c PG0/BLOCKED与原max1mutation消费记录均不改。data finiteactorspermutation已实过，catalog比较在columns.number（物理attnum）失败，如agent archived_at old19→new16/archived_by20→17；本只读run没有任何restore/seed/HTTP/key/capture/模型动作。Root保持HOLD且不自动重试或查询。

baseline_review/sol medium独立离线实读4bee及3项已capture raw hash/size通过；603relations、2270visible columns按qualifiedrelation分组，依原attnum排序的可见相对顺序和每一name/type/default/notNull/ACL/identity/generated完全同，当前number在所有relation均dense1..N。物理number变化只6relations/88列：agent16、agent_runtime5、agent_task_queue38、autopilot14、issue_vcs_pull_request3、plugin_installation12。与历史DROP COLUMN留物理槽、logical pg_dump不导出已删除列、restore重建压缩编号一致；原raw保留，不把“删除number字段”当修复。PG17官方语义来源：https://www.postgresql.org/docs/17/catalog-pg-attribute.html；当前官方pg_dump源码注释 https://doxygen.postgresql.org/pg__dump_8h_source.html （current源码，不冒称17tag）。实际case的资格仍以本次离线目录比较为准。

现有qualifiedCatalog除physicalcolumns.number外，relations/constraints/indexes/functions/types/externalTriggers/internalTriggerCounts及DB/schema/extensions/空类别均strict相同。但更完整的978relationDependencies审查发现：975条用qualified relation/column-name/schema/constraint映射后严格同，仅3个pg_opclass(2616) edges old18287→new19777：public.idx_issue_title_trgm、public.idx_project_description_trgm、public.idx_project_title_trgm。各完整pg_get_indexdef原文前后同且USING gin(... gin_trgm_ops)，但现有目录缺opclass namespace/accessmethod/family/inputtype/extensionmembership；不能blindstrip这个OID或假称限定引用已全证。下一最窄只读证据应为这3index真实indclass→opclass的限定元数据，旧身份只可注明从已审原indexdef推导，不能伪称旧PG元数据曾查。

独立离线报告 .superpowers/sdd/2026-11-06-round1-continuous/r1-auth-db-restore-postproof-catalog-offline-review.md SHA01f373b44b3ac411e7989197eefcf407c06b584ddf49cd9798016b76ff893137/7465B。实际当前仅dataBefore65487B、clientsBefore136B、catalogBefore1085645B已取得；schemaBefore/schemaAfter、afterData/catalogAfter/clientsAfter及相应stderr仍0B，after namespace/ACL/inputhash不能推定完成。两份BLOCKED全部保留，仍无完整restore后验/HTTP通过。

Root裁决下一revision r2仅PREPARE READONLY raw-first collector，仍需实际code/data+新registry独审后Root另once释放，不能借旧r1重跑：ownedidentity/noegress/readonly/inputhash/privateACL等安全前置不后移；在这些通过后先把全部计划before/after data/catalog/schema/client/opclass/ns/ACL raw持久取得，再作语义分类，防止每个不相关consumer抛错都截断下一项本已授权只读证据。采证不等于验收。finitecolumns映射须严格证明oldvisible顺序与actualdense1..N+全部列属性相同，不是blanketdropnumber；其余975edges严格，另3trgm需真实限定元数据；完整schema仍只准已审restrictpair差异，data仍strictwholeJSON+有限actors键排列，原raw不canonical写回。新增query只有3index限定只读，不扩至业务/密钥/restore/测试/新服务。

runner_fix/astra high只准备r2实现/新freshoutputs/NOTAUTHORITY模板，Root/modelunknown登记/操作，baseline_review/sol medium独审；源码9及HEAD108866不变，源码已审/261选定单元回归PASS不受这两个consumer门禁问题推翻，也不能冒充真实HTTP。Goal ACTIVE/NoBUILD，保留所有FAIL/BLOCKED/NOTRUN，继续根因修正及实际补验，不将本阻塞报告当完成；title9/权限出口撤权/R1-02/03 Windows DSH真实归档用量/Leader版本保存双机同候选模型实机门禁仍未完成。

### r34 runtime卡：R1-AUTH-DB-RESTORE-POSTPROOF-r2 / revision r2
- Base108866；Root/modelunknown registrar/operator及消费者；runner_fix/gpt-6-astra high code owner；baseline_review/gpt-6.1-sol medium独审。Source write NONE、mutation0、旧restore max1已用，不继承r1/旧runtime。
- Code/SPEC/QUALITY独审已通过：candidatea778a4ebb766f19a52b5854c8b71a5892727ead205af44a04df21f3270398ef8/controllerc5509d48ef1a5f5e77e311ca73fba02c98c671c38009f54fb073cf07a9c063a7/provision624d22d6/helper30aba869/queryf552204f/proof64f49664/reporte621256d。
- 37input bindings、21freshprotected输出，原9readonlycommands不改，唯一新增最窄3index indclass→opclass qualified namespace/am/family/text/owner/pg_trgm1.6会员SELECT。旧18287身份来自原已审indexdefs的推导，非伪称旧meta已查询。975其他依赖严格、468internal trigger仅自OID生成名锚定替换；2270visible列按old物理attnum顺序映射visibleOrdinal、actualdense1..N及全部字段严格，不blanketdropnumber。
- 安全identity/NONE/readonly/config/inputACL保持前置；实际执行或identityfail仍stop。其余语义分类在全部before/afterdata/catalog/schema/client/opclass/ns/ACL原raw先持久后进行，避免一个consumer问题阻断其他已授权只读证据。Data仍全JSON+有限actors键序，schema仅已审restrictpair，public/DB/plpgsql/refs/owners必须全过。
- Root已实际登记新contracts/R1-AUTH-DB-RESTORE-POSTPROOF-r2-test-frozen.json exactrequiredfields+candidate/controller，外SHAgate，无模板继承。Registry与r34独审PENDING；Root尚未另once DB-exclusive释放/未读取或provision。审后也只限本21输出＋readonly补采，实际结果独立验收前不称fullrestore/HTTP/BUILD，旧两个BLOCKED不回填。

### r35 后态接受卡（OFFLINE-only，非新的数据库运行）
- 新contracts/R1-AUTH-DB-RESTORE-OFFLINE-r1-test-frozen.json/revisionr1/statusTEST-FROZEN仅限定immutableff49已采实证，runtimeAuthorization NONE/新DB及restore及HTTP/test0，base108866/sourceNONE。OwnerACK2c2030dc，完整独审3cfe167f，Root消费者据此接受恢复后的PREAUTH状态，不改变旧执行结果。
- 实际ff49已有20capture streams/21safe ACL/beforeafter ns、clients0/prepared0、data finitefullJSON、603rel/2270visible所有属性+顺序/88物理映射、975dep+3真实qualifiedtrgmmeta/468trigger suffix等完整实证。SQL327603→327593，只9021行中的5/9019restrictpair及2940的issue_status_system_is_canonical同序7ANDterm左嵌套OR变平坦，精确literal/cast/operator/NOT不变。
- 有限schema谓词old/new整行SHA先锁，AST0b75e994…14e839及3^8=6561SQL三值组合穷举相同，其他全部SQL bytes exact；不是任意忽略括号/字段/未来SQL。Owner最小纯验证器80a33ccd、manifest1108d085、16负例proofb37844d5经独审后Root一次纯离线verifyBundle actual0/stderr0，输出0d3af31a，64bindings复核/10stdoutstderrpairs/21recordedACL；自动器明确不冒称重查DB或重新自动审所有catalog，完整目录人工审结3cfe保持独立来源。
- 旧7a2c/4bee/ff49仍BLOCKED且raw/script/registry不改，新有限离线对账独立结果 ACCEPTED_RESTORED_PREAUTH_STATE，不冒称旧controller PASS，不增加原restore次数。未来新raw/未知SQL不适用本例外。
- 下一只准准备fresh GREEN捕获volume新nonce的StageA/B metadata-only独立capsule，oldcab88nonempty卷不读/不挂RW/negativeprobe，sameowned signingcontext不读生成，postfix-r2 b450及cmd8e350/base108866保持。实际初始化/权限probe、再真实HTTP/seed/同ownedkey使用均需各适用exactprofile及Root单独放行；本offline登记不授予这些动作。真实Go3PASS/legacy/realcache/nativehandlerDB/title9及R1-02/03总门禁仍待。

### r36 runtime卡：R1-AUTH-DB-GREEN-CAPTURE-r1 / revision r1
- 当前base108866；Root/modelunknown registrar/operator，runner_fix/gpt-6-astra high code owner，baseline_review/gpt-6.1-sol medium独审。Productwrite NONE，metadata-only/nonDB：新volume140cf925-a9d6-4cb6-871a-7880a6d87929、6labels/soleconsumer、exactfreshhelpers/CID/outputpaths均在55ccmanifest与actualregistry。
- 独立CODE/SPEC/QUALITY已批A45300a4e1722c167b4fe0a0dc29b9224aaa5fda6f679eacee2d448dac6013c4d、B e1feb99f96ea8b12d775317c6eb1cc59454f53cd15bac032299e044118173ff4、manifest55cc960a、17preparationchecks/proof25d90。旧probe/source5a70/ELF21a631/init2cb4不变，新A仅freshcreate+旧0395profile有限资源替换；B绑定未来actualA path+外审SHA/devino，不复用旧bebaf身份。
- StageA上限1/另Root放：新emptyvolume+rootCHOWN-only/NNP/ROroot/NONE/无ports，仅原init创建root555parent/file65534:600/0B/nlink1并采stat/ACL；全raw保存后只清精确helper、保留卷。StageB上限1：必须actualA先独审ACCEPTED，Root再独立once；非rootcapDROPALL/NNP/同NONE用原probe验证heldO_RDWR零读写与4EACCES，actualdevino一致，raw先存后清精确helper，保留空卷。
- Registry实际已登记、r36独审PENDING，当前未Root释放或任何资源创建；不能预填未来dev/ino/CreatedAt/CID或称17checks为真实OS证据。不访问oldcab88卷、不读签名Key/PGenv、不生成新secret、无DB/GoTest/seed/HTTP/model、无自动retry/repair/recreate/remove。失败保留实际状态与raw，不推导uid/mode或偷偷重建。
- 实际A/B各适用证据接受后，另完整firstpostfixAuthDBGREENprofile（b450/r2/cmd8e350/HEAD108866、sameownedkey另审、real3run3pass/OTP1+PAT1精准delta/old13+641+old7/sink0B/no-egress/全source绑定）才可Root再放；此metadata-only登记不包含那一动作。旧三BLOCKED和offline后态接受记录皆保留，NoBUILD/fullGoal未完成。

### r37 实际OS transport验收
- 原metadata-onlyTF b32f0ce5/R36 790a41d3已独审，Root严格两次separate释放。StageA result .local/engineering-prep/tools/r1-auth-green-capture-140cf925-actual-initializer-result.json SHAf08b48fce1be8c5825ccf57cf889ca2ab4dab258d761ae164c46173f683fb288；helper1932a3a8…d7fe09c actual0/noOOM/raw208B+stderr0，0395完整profile仅已审资源替换、terminal有限false→null、6labels/CreatedAt/soleconsumer核实。file2128:13784/65534:65534/600/0B/nlink1、parent2128:13762/0:0/555/posixACLabsent，raw后只删init helper，volume保留。独审实际A后Root才运行B。
- StageB result .local/engineering-prep/tools/r1-auth-green-capture-140cf925-actual-proof-result.json SHA1c4b539eafd1871b32a6ccf64e6eaf412daec0e4f1c0c2f1406ce1b6b23d8737；绑定actualA外部完整SHA与devino/profile，helper62ee3ccd…7521f3fe actual0/noOOM/deadline内。真实8records before/after同inode/全字段、heldExistingO_RDWR/noCreate/noTruncate/bytesRead0/bytesWritten0、create/mkdir/rename/unlink各EACCES。raw先存后exacthelper移除，volume6labels/CreatedAt与A同、zero consumers由独立metadata检查实核。
- baseline_review/gpt-6.1-sol medium分别独立ACCEPT actualA/B；Root/modelunknown operator，runner_fix/gpt-6-astra high代码owner。Old cab88 nonempty卷ACCESS NONE，无DB/context/key/env/auth/GoTest/seed/HTTP/model新调用，无新secret/no repair/recreate/remove。
- 下一完整AuthDBGREEN仍独立门禁：source9/cmd8e350/schema3/current108866/finalr2b450、actualA+B/empty600sink、R35有限已采恢复前态接受及freshfiniteprechecks/old13+641+old7/fullsource/noegress、same-owned4key只在后续exactprofile审后授权复制、唯一新OTP1+PAT1/bootstrap4prepost0、真3run3pass/Go0converter0/0skip/sink0B。准备新capsule不可复用已执行RED/旧log/capture卷，不虚构B或提前读key。
- Frozen接口/精确contract/runtime外registry必绑定，mutable ACTIVE/results/card追加历史不当产品源码unchanged对象，避免登记本身自指hash环；此规则不减少授权、source窗口或独审要求。Auth source仍冻结；cache只有只读prepared ACK，无产品source写。NoBUILD/fullGoal三切片验收未完成。

### r38 runtime卡：R1-AUTH-DB-GREEN-r1 / revision r1
- Owner runner_fix/gpt-6-astra high，registrar/operator/consumer Root/modelunknown，独立baseline_review/gpt-6.1-sol medium；base108866，product source write NONE（source9+cmd8e350/schema3共13已固定，postfix-r2 ELF b450，128bindings与1282migrationinventory）。Completecandidatec2a5907f/controller59f56c41/ready03e20efc/provision958c2f33/proof95ccc16c/report9f26353b已独审CODE/SCOPE/SPEC/QUALITY APPROVE；41purechecks不算HTTP。
- Root单独Stage1实际exit0，audit .local/engineering-prep/tools/r1-auth-db-green-aec89322-provision-audit.json SHAcdd73a38648c56945c3c37bb69e86557dfb1dffefa0e35350492cfa53be81585。实际newprivateDir+13files ownerSID+SYSTEM恰2protected非继承FullControl、13全0B/emptySHA/nlink1/canonical/noReparse、CreationUTC原字符串/精确inventory，128非envbinding由独审实核；Stage1未读PG/context或任何secret值，无DB/helper/HTTP。
- Root现才把template.required实际登记为contracts/R1-AUTH-DB-GREEN-r1-test-frozen.json（不是TEMPLATE外壳）。外部实际registry绝对path+externallyreviewedSHA与exactfields在任何Stage2动作前验证，绑定snapshotac5b/R35离线result0d3a/actualA f08b+B1c4/fullCIDa7d5/newvol140cf925/context2438/source8e350/binaryb450/base108866。Registry+r38仍待独审，Root尚未separateonceStage2释放。
- 获准后仍需重新通过source/HEAD/1282schema/ns/fullDB/13privateACL/emptyfile13784-parent13762/finitePREAUTH+bootstrap0等前置，才可读取goal-owned PG5key和same-ownedcontext4key并仅复制原值至保护env；不生成或轮换signingsecret、不读用户/公司/provider modelkey，不inspect Config.Env，不访问oldcab88卷。原生登录/CLI/session/PAT本案精确测试凭据生成是允许动作，不等于生成新签名上下文；错误与日志不得输出secret/token值。
- 唯一真实fixture source selector TestR1ACLCliMintDatabaseBoundary：nativeOTP verify/GetMe/CLI正控200；真实nativePAT201/GetMe200后CLI403/no token；parent+OTPPositive+PATDatabaseCannotMint必须3run3pass0fail0skip/实际Go0+converter0。只新OTP1/nativePAT1、允许其last_used_at，old13businessACL/641微秒ledger/old7/oldPAT不变、TestMain4transients pre/post0；capture保持0B/emptySHA/600/原devino。正常native30dayTTL，不用unused ownerJWT冒证。所有beforeafter raw/GoJSONL/metadata/退出码保留；fullsource-window归还，raw保存后仅移除本Goal精确helper+ROemptyattestorhelper，卷/credential材料保留，不exporttoken。
- Failure保持FAIL/BLOCKED/实际状态，不自动retry/restore/fixture reset/清理材料。EMPTY_Capture只证明本次PAT拒绝未输出文件，不冒充oldcab88封存legacy验证；真实cache/task/cloud/9title/其他出口/Leader保存/双设备/真实云模型门禁不在本运行。Actualnewmodelcalls0，无真实AgentCLI/hostHOME/config挂载，DB底座NONE namespace/noegress，profile仅loopback。
- 当前私密文件仍空、keycopy/Go/TestMain/seed/HTTP NOTRUN。只有actualregistry+r38独审通过后，Root下一单独工具调用可onceStage2；当前TEST-FROZEN不等实际GREEN/BUILD/Goal完成。Mutable追加历史不绑定sourceunchanged，冻结授权接口/actualregistry/source窗口不得省。
### r39：真实 AuthDB GREEN 已独审接受；继续下一产品切片
2026-11-06T22:06:19.519Z实际运行结束，result `.local/engineering-prep/tools/r1-auth-db-green-aec89322-result.json` SHA256 `461fb97ace34d07219d878a230ab1c50bf03b4eefd283c3d0fc09248f53bab08`。Root/modelunknown实际操作，runner_fix/gpt-6-astra high为执行器owner，baseline_review/gpt-6.1-sol medium独立验收ACCEPTED。R38 actualregistry和snapshot已审后另一次Root工具调用执行，不回填历史NOTRUN。
真实原生OTP→Me/CLI200，nativePAT201→Me200→CLI403；exact3run3pass0fail0skip，Go0/converter0。old13 business/ACL、641微秒ledger、old7 OTP/oldPAT不变，仅新增已用OTP `77777777-7777-4777-8777-000000000101` 和nativePAT `11e4631b-8baa-40ef-8db7-535df109b43c`（含允许last_used），四bootstrap前后0。完整raw、精确差分、NONE底座隔离、128bindings/私密ACL与源码窗口归还均已独核。helper清理后零消费者，新capture同inode仍0B，旧cab88封存卷未访问。
本运行按授权实际读取并复制同源PG5键/合成签名context4键，不生成新签名上下文，不读公司/个人/provider密钥，无产品模型调用。fixture已消费并保留，不重跑固定OTP、重置、删除PAT或再次restore；旧RED与三份BLOCKED不改。仅此真实3test闭环通过，legacy真renew/realRedis/原handlerDB/title9/权限生命周期/R1-02及03/同候选实机和模型总门禁仍NOT RUN，不升BUILD、不完成Goal。
下一项推进R1-02A缓存接收最小修复与R1-01 nativeIssue只读契约准备；共享产品源码单写，工程字段由owner/consumer/reviewer落实，不向Ethan重复申请已授权权限。

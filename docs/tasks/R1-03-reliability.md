---
purpose: "R1-03：Leader 回传闭环、版本与双设备可靠性"
owner: task-owners
status: current
updated: 2026-11-06
related: []
---
# R1-03：Leader 回传闭环、版本与双设备可靠性

状态 NEEDS_CONTEXT；首轮实现已批准；真实模型/双设备实际条件需到执行时核验。依赖 R1-01/02 对应子集，不要求不消费的远期功能先冻结。复用 MC-05G、MC-08 与 B03/B04/B07 现有责任，不新建调度/版本/同步系统。
Owner 角色 B06 协作、B07 接续、B03/B04 版本和资产、B01 安全；实际 agent/model/独立 reviewer 待派卡真实登记。

## 写集与接口

沿原生 Squad、Issue/children、daemon claim/completion、版本输入/文件资产与任务工作区接口补最小差异；具体符号、测试路径与新增文件在 TEST-FROZEN 子卡列齐。消费者 B02 只投影原生事实。C01–C08 只冻结被消费部分，C07 复用 WORKSPACE-CONTINUITY，参数唯一来源 DUAL-DEVICE-VALIDATION §3。

## 顺序与判定

- [ ] 委托明确允许 Leader 从已授权 roster 选人/派工；创建永久 Bot、扩权、改别人小队或发布能力不能因 Leader 身份自动获准。A 发起 B 管设备的已知失败必须重验，撤销委托后新动作拒绝。
- [ ] MC-05G 先文本并行回传/汇总，再加确定资产版本。成员失败、回传重放、晚到/撤权、需人工输入、重启/取消均测；结果消费界标防重复汇总。各成员原回复可追溯，不把汇总当唯一证据。
- [ ] 运行固定版本、候选隔离、条件发布/回退/实际加载逐一验证；基础审阅和候选机制进入首轮，不扩成公共模板市场或完整技能工作室。
- [ ] 自动保存触发、manifest、完整持久 ACK、旧 writer/epoch 拒绝、冲突和未知副作用对账。不得人工 commit/push/补传才能接续，不自动覆盖冲突。
- [ ] 按 DV §3 预签实验 manifest，先无模型故障注入，再用两台获权 Windows 实机验证 W1→W2/W2→W1 与不合格设备负例。断电实验仅允许专用合成工作区，登记设备管理人故障窗口，不能强关员工未保存工作。
- [ ] 完整 DC/WC/适用版本撤权回归和同机/跨机真实并行；无合格在线设备显示等待，中央不执行 harness。
- [ ] MC-08 独立验收同一候选 SHA：员工与负责人实际走我的工作→@ 多 Bot→本地执行→成果用量→Leader 汇总→接续；附所有测试/设备/模型/截图/权威记录，输出首轮完成或具体未完成项。

任一越权、未确认伪保存、已确认点丢失、混合文件截面、旧机覆盖、未知效果重放、私密来源流入普通汇总、自动扩权、假双机/假真实模型均 FAIL。超时不能事后放宽阈值。
范围退出不等于发布授权；真实公司资料、保留策略上线批准和部署仍另批。缺第二设备或模型额度时继续独立开发，保留 BLOCKED，不把 Goal 标完成。

### r63：handler最小fixture修复与新候选；Leader三文件产品tests-first局部冻结
Root实际source诊断确认customstatus INSERT漏必填color（catalogNOTNULL/defaultNULL），不是权限bug或可假造默认。guard_fixture_impl(sol high)在existingGuard122限源写窗4f8后，只oneSQL补显式#6b7280；b520→c9af45e4，category started按478/响应WireCategory保持，53names/所有断言/其余8122files不变。samehost actualsource-schema checker RED1→GREEN0仅静态兼容，非PG23502或业务RED；guard_review(astra high)2fa5b3b6源审APPROVE。contracts/R1-ISSUE-READ-GUARD-fixture-color-r1-source-amendment.json显式允许Native未来保护pin单项rebind，不修改原122/801或假称all36same。
旧handler r1compile ecacd/ELFafd对b520仍是历史有效compileonly，不代表新source。R2机械候选/JSON审批d30b/246e后Root单次release32995a51，ownedexec82241真实终态0，五步actual0/capturecomplete/1217current源closure(54f132f3含c9)/新ELFe4bfa133，compile937f3827，独立实际审查进行中。无TestMain/ELF/数据库/模型运行，不能把source/compile绿洗成handler53。
H1 handler审计过宽已用19表267列source/default全列与samefixture/root/unknownfield违例修，hostold19wrongaccept→new24pass/9scopedchecks，guard_review4baae458只静态APPROVE，PGsemantic/probe仍未跑。Root单独生成全新handler-only CSPRNG32bytes/hex64上下文，文件写入前先owner+SYSTEM protectedACL，76B/contextmetadata c6063f50/私filehash4337df84，NEW_NOT_RECOVERED/非UUIDseed；未读旧key、未mintJWT、未load到helper或产生model调用，runtime仍NOTRELEASED。当前handler boundedreadonly包与router先验仍准备，无crypto或SQL自动放行。
R1-03联合B01/B06/B02设计(current89候选)经leader_joint_review(astra high)a67b01b6批准仅LOCAL_TEST_FREEZE三个新integration源，非89路径施工。actualimplementer leader_test_impl(sol high)ACK09b071d5/plan8afdec86，79拟写leaf(22/45/12)不是实测数；新cardR1-03A-leader-text/TFcd2ad1f6/plan精确登记，source窗仍CLOSED待注册独审与Root交窗。Only3ABSENT testfiles，现prod/schema/旧TestMain/helper不改，真实Auth/API/claim/result/receipts，不手写业务完成/伪身份。原TestMain前置删建与DB失败exit0须外部新epoch/profile/events，旧canonical/3clone/service35/旧key不可复用为本卡运行目标；new618/619/设备/fixture/instrumentation都未实现/未放行。Tree registration首Root命令parsefail在effects前停，纠正后验证ABSENT实际写三份contract docs，不冒源已开发。
普通Bot/directRun/成员重新入会/完整policy successor、UI15真实点击、Windowsharness/modelusage/资产版本保存双机所有后继硬门禁保持。旧617/641/3clones和service35不迁移不清；当前只有service42通过，Guard整体BUILD/全R1未完成。Rootunknown/GoalACTIVE完整范围，所有旧FAIL/LOST/NOTRUN与R57事故留。

### R91: real installer CLI FAIL preserved; NativePin source accepted, exact public-run binding pending; Windows fix1 ongoing
Root /root modelunknown; actual codex/round1-continuous HEAD9deb, index empty. Prior continuation made real state progress: exact table8359/e27485 approved9b447, control18HOST/c3fc1e/ce5a/74f4 approveda3ade. Rootfd16 approval/627e release then one actual parent33592 terminal1: Node/pnpm CLI did run once, rejected frozen bare state-dir/userconfig/globalconfig options. Original install result20e050, captureCOMPLETE/cleanupCOMPLETE, public-before/after exactlya60e4f2 unchanged; no install PASS. Actual independent d56a accepts scoped failure evidence, not dependency/checker/product readiness. All old once/approval/outputs permanently retained, source/control11 exact preserved2aa39e; no automatic retry. Original owner frontend_install_impl configured61solhigh now READONLY exact official-source argv RCA, no source fix yet. Root may update docs after completed before/after check; other Repo writers remain CLOSED. New CP path must enter any future path table before next install.
NativePin actualauthor admin_sqlfix_impl configured61solhigh produced163P0F HOST only, driver8d9/sourceapproval216e. Root template2af8/binder80e consumed only to create new protected public-outputroot and strict20 release1d681b, validuntil04:16:09.8957941Z; prep f972. Original guard final actual-binding review ACTIVE, real diagnostic NOT RUN; historical B909 failure/causeUNKNOWN and extraPrivateRead0 unchanged, no helper/SQL/private/model authorization. Windows actualauthor windows_runtime_impl configuredastrahigh fix1/5 reports six candidate fixes and source-static checks, I3 internal identity crosscheck and final handoff still ongoing; external final observer UNBOUND, native admission CLOSED, no C#compile/PErun accepted.
Multica sole authority unchanged. Engineering35/service42 component PASS retained; handler49P4F, Native37+4/Leader118/F5nine NOTRUN; 641 migrations baseline, Windows fullDSH/UI, real company model usage+automatic archive, revoke/version/save, physical dual-device and same final candidate acceptance remain incomplete. No main/push/prod/business/paid-model action. Goal ACTIVE full original scope. R91 docs review/snapshot acceptance pending, not self-approved.


### R92: real second installer attempt stopped by resource-link policy; narrowed fix3 and two independent verification code windows
Root /root modelunknown, actual codex/round1-continuous HEAD9deb/index0. Prior Goalturn PROGRESS through actual failures/RCA/contract and sourcefix2; current actual attempt2 advanced beyond CLI parsing: scope10of12/lockuptodate/1448planned/last110downloaded, but SCAN_FAILED led monitor termination. Parentcapturecomplete; innercaptureUNKNOWN/Nodeexitnull/cleanupCOMPLETE/publicbeforeafterb42ded same. Actual independent2bd accepts FAIL only. Never mark install/typecheck/lint/packagecomplete. Oldtwo claims/source/control/FAIL/partialoutputs retained; noautomatic retry.

Live firstfailure path was not recorded. Separate unchanged-policy one postmortem metadata audit fc8b/aafc found store/v10/projects/38af... Junction to exactRepoRoot after3192acceptedlinks;11354stat, no targetread/hash/follow, no runtime rules changed. Official source RCAc02b matches registerProject SHA256cwd prefix. Design19fec rejects generic10throot/rootprefix; Rootruling911b and TF7c54 permit only one exact source+target+Junction projectMarkerPairs, existing9workspaceTargets unchanged. Originalfrontendowner configured61solhigh now fix3/5 SOURCE ACTIVE exact7NEW incident files. 4s/5s/8GiB/1800 unchanged; no timing inference or new install permission. Atomic sameE move preservation of newly generated rootnode_modules is only approved DESIGN, not authorized/executed; final9workspace outputs require fresh verification. No recursive cleanup or user source movement.

Windows six sourcefindings now closed by fix2 review0860;121HOST/static is not CSharp semantic/native evidence. Sourcef611/manifestd685 frozen. Compile-only proposal1fc8/design21e3 require executable.path projection and singlecapture/firsterror/pendingownership. TFcd0/handover5a11 only opens three new thin controls plus four evidence files to originalwindows_runtime_impl configuredastrahigh. Source ACTIVE, realcompiler/buildroot/load/native NOTRUN; observerUNBOUND/runtimeCLOSED. ExistingR1DLL/PE not rebound to R2. ActualWindowsDSH tests/P0proc failopen still unclosed.

P32 synthetic301360B characterization13P0F acceptedfa25, cannot identify originalnative cause; wrongLength/wrongSHA share same3scalar symptom. Singleton operation packagefd7 reviewed31d1 and externalTF62c7/handovera112 open exact7 source files to originaladmin_sqlfix_impl configured61solhigh:16anchors/61phases/1binary/7ancestors, original3Length+1hash/ownership/errorseal/noaddedIO preserved; all actualnative/target/SQL/private/Rootrelease/output/once CLOSED. Singleton eventualPASS cannot replace original33 or DB baseline. HistoricalB909/P32FAIL and all claims retained, rootcauseUNKNOWN.

Alternative pg3 fixture sourceaudit3528 (pendingindependent adoption; no action taken) found factory explicitly host/local SCRAM, no configured passwordlessUnix/OSadmin route; socket addr/portNULL also conflicts oldparser. No HBA/auth weakening, no password/env bypass or SQL/Docker/private operation was performed. READ1FAIL3/extraRead0 and PG1/PG2/PG3/resources preserved; currentrunning not reasserted from oldfacts.

All Repo production/sharedauth/schema/state/lock writers CLOSED, only Rootdocs. Full Goal remains ACTIVE for all three product slices and samecandidate. Service42 componentPASS/handler49P4F/Native37+4/Leader118/F5nine NOTRUN retained; full641 migrationbaseline, frontendcheckers/distributablebaseline, realWindowsfullDSH/UI, companymodelusage+autoarchive, version/revoke/save and physicaldualdeivce acceptance still missing. No main/push/prod/business/paidmodel action. R92 formal docs review/snapshot PENDING, no selfapproval.

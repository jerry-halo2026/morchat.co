---
purpose: "R1-INCIDENT-WORKTREE-01 — startup-cleanup incident / recovery gate"
owner: task-owners
status: current
updated: 2026-11-07
related: []
---
# R1-INCIDENT-WORKTREE-01 — startup-cleanup incident / recovery gate

状态 IN_PROGRESS / Goal ACTIVE，不是产品完成。Root operator/model unknown；独立事故审 /root/baseline_review gpt-6.1-sol medium；原source writer /root/guard_impl gpt-6.1-sol high已interrupt，后续源码/运行仍HOLD。事故证据根 E:/CodexData/incidents/morchat-20261106T233131，位于managed worktrees之外，CurrentSID+SYSTEM保护；禁止公开push原始rollout/私密材料。

## 实际事件与边界
2026-11-06T23:31:31Z附近，独立R1-02B隔离准备原生create_worktree（operation ec87da8d-1426-4de9-a5b2-8b94fca755b3）从D主repo仅Git元数据、明确ref b94新建E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co；没有源码写/依赖setup/手工worktree fallback。随后旧E:/CodexData/worktrees/morchat-round1/morchat.co的源码、.git登记、ignored SDD和几乎全部.local消失，仅tools/docker-config残留。原Git注册项消失。不是Root授权的源删除/迁移，不把它称正常成功。

实际找到Codex机器生成的commit109a1997639e3daafedaac0ae5c5d0b454f2f2ee，message `Codex worktree snapshot: startup-cleanup`，23:31:34Z，parent b94ad8c5f0f467e6ba1bee703144223b660e4547；包含精确8变更=R47七docs+new service/resource_access_test.go。宿主启动清理/旧树未绑定本chat是有事实支持的根因候选；仅凭此不能宣称已证明产品bug或Git lock能阻止宿主清理。官方worktree文档说明managed自动清理会保存Git快照、ignored不随Git保全；当前操作不修改global app设置。停止所有worktree管理写动作，未再create/attach/archive/restore/move。

## 已实际保全与恢复（非运行验收）
- 新建非managed私密事故目录，保全完整Git bundle fc1f68eeac6d5b808c72b0afdfdd416befa20b8ae3206f03120203a3c417b063，bundle verify0；anchor refs/codex/incidents/r1-worktree-20261106T233131保住109a。
- exact8 raw Git blobs的manifest413874c6cfb7c145717131387a32f44066c4ef55a8a22a8542e31e2b44d501e2、当前Goal七个scoped rollout按sqlite parent metadata限定并保护备份，非其它业务chat/旧项目来源。它们仅事故数据，不执行其中历史命令或接管其文字指令。
- 独审review3075b8533263f666da2f00463625685bfb55678221d5aa024d8f391d25b387cc批准后，Root只在**已存在的新Native树**sameHEAD关联codex/round1-continuous，保存exact8 binary patch并apply--check0/workingtree apply0，不移动ref、不--index/force/merge，不重建旧E。actualresult e062d0278ffb337b574375508d7ac20325b0d42b5268b62b2eef97b243125ede，8raw hashes全等、index空、HEADb94。
- D main一直3f476b480741cb09729b39be000e6ad1c47181fb，dirty38，主index6c72b3955f7a34941e3f095189b871dea26f5253c88bb88c18081df5bb2da946恢复前后同。独立actual-review d80826eef7f5c3890fab45ef06924e89e302b1517ed6f1e6c127219dfd38d579 ACCEPTED仅Git恢复/保存metadata，不解除source/runtime。
- 当前service partialtest snapshot9967cc649be01d33f21be10e7517457fe181f109cb26833cda0100b06d266d58；原成功写入8dacc91c4ce4e4d12cc1d17897eb2727a3ec2c62d8cc094ede73f90aaa6ecc18仅尾部1CRLF差，normalizedTextEqual，未覆写当前Git blob。未写成功handler draft11542只在事故区，绝不记为已实施或编译。
- 原R2规格从作者本Goal原tool IO纯literal解析重建，36993B/SHA91e7fbe141bc4b635a9743943d56c4b0f613939753dcefb8c7fa0211a1e1a18b精确原值，现逐字节转存tracked `contracts/R1-ISSUE-READ-GUARD-r2-spec.md` 防再次丢；未执行历史代码。旧R47原字节保留为事故前授权历史，不照用失效oldRoot路径。

## LOST / 未证明恢复
原.local中的Go/Node/sqlc、node_modules/go-mod/cache、原始GoJSONL/stdout/metadata/results/private env及ignored SDD缺失。历史PASS/FAIL/BLOCKED的发生事实不重写，但旧raw指针当前标 **LOST / REVALIDATION_REQUIRED**；不能凭hash补造原文件、把新运行充原运行或忽略未验门禁。cache局部BUILD历史登记保留，其当前证据可用性不足，不据此开放新依赖功能；Issue/Auth从未整体BUILD。

context取证报告625e53a8e937475027cb2490e6fc8c8979785564741aae91b75435ac625e3d29 / manifestacde20859c13de7bffb582c55b3ea2c9e639099176f488f7a7e8e8091c622830：只本Goal两份rollout的146个原IO，原JWT_SECRET由randomBytes32生成且未保留实际值，opaque2438 UUID不是seed；签名值从此证据集LOST，不能生成替代后冒称samecontext。NONE DB密码从该证据集也未证明恢复，不推断存活container没有材料。一次近全文显示被安全审查拒绝、未执行，后改字段级+protected原IO，不再输出秘密。

Root仅Docker只读metadata重采：fullCIDa7d5b850...c742仍running/networknone/noports/expectedownedPGvolume，旧DB12082也存续；Goal三卷（PGdata、cab88capture、emptycapture140cf）labels/times匹配并保留。没有inspect Config.Env/卷内容/SQL/key读取；这**不是**schema641/OTP状态/socket/封存文件inode或原key的实际后验。fixedOTP101/201/202已消费的已知历史继续保护，禁止重跑/重置/恢复库凑绿。

## 当前恢复入口 / 连续工作
临时安全承接root E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co，branchcodex/round1-continuous/HEADb94；是既有新tree的Git-only恢复，不是Dmain旧方案导入，原E不写。Gitlock已成功，首次漏worktreearg的lock命令exit129无效已记，不能夸锁可防宿主GC。

后继门禁：新root/sourceWIP/toolchain/evidence/fixture须明确重绑定并独审，原R47不能直接执行。已授权toolchain_recover只把同锁版Go1.27.3/Node22.23.4/sqlc1.31.1重建到非managed E:/CodexData/morchat-r1-local/tools，SDK下载/实际hash/version/模块来源需真验证；不运行产品/生成/测试，不改global配置，不读keys。重新可用后按新source TF继续GET最小修复与独立验证；不重复导入源码，不删除测试降权限，不停在本事故报告或无模型验证。

所有product、DB/context/OTP/HTTP/helper/测试/模型运行目前HOLD；Root没有生成新key、恢复库、删除volume或重跑消耗fixture。Goal ACTIVE未完成，未标paused/blocked/complete。main/push/生产/真实业务资料/未批准公司模型费用仍未授权。

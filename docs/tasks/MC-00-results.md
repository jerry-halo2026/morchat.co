---
purpose: "MC-00 执行记录"
owner: task-owners
status: current
updated: 2026-11-06
related:
  - docs/tasks/R1-results.md
  - docs/ROUND1-DELIVERY.md
  - docs/tasks/MC-01G-preflight.md
---
# MC-00 执行记录

**历史执行批次，不覆盖当前现场。**恢复快照、现行路径、执行位及本轮实测见 [R1-results](R1-results.md)；当前授权见 [R1-AUTH-r1](../ROUND1-DELIVERY.md)。历史 PASS/FAIL 原样保留，不转记到新候选版本。

日期：2026-11-06。状态：工程准备已实际执行，仍 IN_PROGRESS，未达到 TEST-READY / BUILD-READY。

- 已在既有隔离工作区创建 `codex/mc-00-engineering`，没有 commit/merge/push。
- main 与当前 HEAD 不同，main 存在额外业务代码/资料；本次不复制其业务差异，合流待审，不声称文档已与 main 合并。
- Multica 来源 SHA 已核，来源工作区干净。
- 环境预检：Node v26.13.0、PATH pnpm 11.25.0；与上游 Node 22 / pnpm 10.28.2 基线不一致，不能直接视为通过。Go/make 未在 PATH 找到。
- Ruling：复用现有隔离树，不再创建第二工作树；工程接入不覆盖用户 main，产品任务开工前仍需解决基线合流。
- Ruling：Git 安全目录使用每条命令 `-c safe.directory=...`，不改全局 Git 配置。

## 已交付

1. 本仓根级 Multica 源码；7,582 个上游 tracked 条目均有来源/hash/mode：7,564 原字节导入、1 工程适配、12 非执行参考、5 排除。
2. 根 README/AGENTS、现有企业 docs 与既有业务 packages 均保留；上游 LICENSE/NOTICE/品牌未改。唯一上游文件适配是 `.gitattributes` 的 LF checkout 规则，未改产品逻辑。
3. 隔离工具链：Node 22.23.4、pnpm 10.28.2、Go 1.27.3；固定锁文件安装成功，禁安装脚本，不改全局工具链。
4. `scripts/engineering/verify-import.mjs`、13 个正负测试、本地 bootstrap Actions 文件与 CODEOWNERS。Actions 未运行、保护未部署；不冒充完整 CI。
5. [下一权限切片交接](MC-01G-preflight.md)、[复验命令](MC-00-commands.md)、[来源与许可说明](../upstream/README.md)。

## 实测（仅对应命令范围）

证据目录 `.local/engineering-prep/` 被忽略，不公开上传；其中原日志保留，包括失败尝试。源码与文档内容摘要分别见导入 manifest、私有 `doc-hashes.json`。

| 检查 | 实测 | 证据/限制 |
|---|---|---|
| guard 正负用例 | PASS，13/13 | 先确认缺项/排除/index 等测试失败，再实现修复；不是只跑 happy path |
| 全量导入快照 | PASS，7,582 项 | 独立 reviewer 另用 Git tree/blob 全量核对原始 hash 与 mode；没有把源工作目录拷贝当证据 |
| `--index` 提交前门禁 | 当前拒绝，7,577 个目标未暂存 | 符合未获 stage/commit 授权的状态；17 个100755执行位仍须在授权暂存后恢复并复验 |
| pnpm frozen/ignore-scripts 安装 | PASS，exit 0 | 2,010 packages；Electron 安装脚本未运行，不代表能打包 |
| `pnpm typecheck` | PASS，exit 0，9/9 Turbo tasks | `typecheck-final.log`，非移动端 |
| `pnpm lint` | PASS，exit 0，6/6 Turbo tasks | `lint-final.log`，25 warnings 未擅自全仓修复，不写零警告 |
| 原始 `pnpm test` | FAIL，exit 1 | 第一轮图标2例为CRLF导入问题，已修；LF重跑后 core 收件箱14例失败，含5000ms超时，`test-final.log` |
| 收件箱孤立复测 | PASS，25/25 | `badge-isolated.log`；不能抵消全量失败 |
| 仅限制 Turbo 包并发2 | FAIL，exit 1 | `test-bounded.log`；core 2771通过/1跳过，但 desktop 有1例Git打包测试超时，views亦出现超时、未完整结束；不能认定稳定基线 |
| 包/worker双限2对照 | PASS，exit 0，6/6 Vitest tasks | `test-workers2.log`；11,712 passed、2 skipped；views 569文件/7,321例全部通过，整轮19m42s。ESLint配置的node:test单列，不将参数传给它；仅一轮通过，不抹默认并发失败 |
| ESLint 配置原生 node:test | PASS，4/4，exit 0 | `eslint-config-final.log`，与Vitest分开执行 |
| Go 原生 `pkg/taskfailure`、`pkg/redact` 单测＋vet | PASS，exit 0 | `go-unit.log`、`go-vet.log`；无网络模块下载、无DB/模型；不是全后端或race |
| 原生 UI radius 检查 | PASS，exit 0 | 2,232 source files；补充静态检查，不是UI/E2E |
| 文档链接/差异检查 | PASS | 当前企业入口＋任务等32文件、254本地链接目标存在；`git diff --check` exit 0，不声称所有上游文档或锚点均审完 |
| 原生 CI scope 测试 | 不可原样复用 | 硬编码读取已被隔离的 `ci.yml`，实际失败日志保留；不能恢复不安全上游workflow只为变绿 |
| NM-ACL / 数据库 / Windows harness隔离 / 双设备 / E2E / build | NOT RUN | 不借工程准备扩大实验或产品授权 |

## 根因与处理

- **工具环境**：默认 Node26/pnpm11 不符基线；改用当前工作区隔离安装。esbuild 的父目录访问被受限工具环境阻断，相同命令获准在普通环境通过，未改产品模块解析。
- **换行**：系统 Git autocrlf 与 native eol 使 archive 产生 CRLF。用 `core.autocrlf=false` **且** `core.eol=lf` 重新提取，纠正7,456个文本转换；原生成物测试恢复，未改断言或重新生成业务文件。
- **测试资源**：孤立收件箱25例通过；仅限制包并发仍有超时；再同时限制包/worker各2，在不改断言、不延长超时、不跳失败用例的情况下，6个Vitest包全通过。证据支持本机资源争用判断，建议采用明确资源预算命令；仍不能由单轮对照宣称所有机器稳定或抹去默认入口的失败。
- **Git 来源**：main 在本轮期间由外部工作继续前进至 `f1422d7eb1b57543be06437b2555554965180860`（sync 导出器提交）。本会话不覆盖、不 merge；起点 main SHA 仅历史快照，合流前必须重新读取最新状态。

## 独立审核

Reviewer：`/root/mc00_engineering_review`，只读。

- 初审无 Critical，2 Important：清单缺项/任意排除可误绿；导入未记录Git执行位。均已用失败用例复现后修复。
- 定点复核：13/13 PASS、固定源集合/全部mode匹配、错误清单拒绝、CI强制index检查；上述两项本轮修复要求满足。
- 工程文档3处过期事实已修正。独立agent review不等于GitHub独立人员approval或产品放行。

## 尚未完成与下一步

1. 已有资源受控的前端单轮PASS基线，后续在干净提交/CI上复验稳定性并正式确定默认测试预算；默认 `pnpm test` 失败与2个上游skip继续可见。后端全量、build、E2E未运行。
2. 与最新main做受控整合，保留业务工作；首次提交前经授权逐路径暂存、恢复17个执行位、校验index与内容，补目标commit映射。未提交树不作为多agent分发基线。
3. 完整 frontend/backend/UI/supply-chain/权限门禁、任务契约/写集自动检查尚未全部实现。当前snapshot CI不能代替这些。
4. NM仍NEEDS_CONTEXT：真实权限接缝/fixture/冻结子集/隔离DB/实际owner和实验授权待补，不使用mock权限制造通过。
   另已定位原生 handler TestMain 在缺DB时会退出0跳过整组；下一卡必须以明确隔离库＋实际用例执行数门禁拒绝假绿，详见 MC-01G-preflight。
5. 首次公开推送前完整历史、凭据及业务/内部文档审查；GitHub Actions和保护设置尚未执行，不能先公开再补审。

## 恢复与交接

新对话交接补充：已建立 [DEVELOPMENT-HANDOFF](../DEVELOPMENT-HANDOFF.md)、[ACTIVE](ACTIVE.md)、[收束计划](MC-00-closeout-plan.md)、[任务模板](TEMPLATE.md)及内容快照。核对时发现MC-01G-preflight表中C04/C06曾标反，已按Discovery修正为C04资产、C06派发；不改变契约状态。交接与Goal启动文本不是新的产品实现/提交/实验授权。

本轮未启动应用服务、DB或DSH，无后台产品进程需要接管；全部本轮测试命令已结束。现有文件恢复副本在 `.local/engineering-prep/pre-import/`。需要撤回导入时只按manifest经核验移除本轮新增文件，企业原文件从备份逐项比对恢复，不能 `git clean -fdx` 或删整个 packages/docs。暂不实施回滚。

## 2026-11-10 live Desktop foreground handoff follow-up
User reports login complete and existing branding waiver, but supplies no waiver location. Root native inventory samewindow133638; initial minimized, documented native Escape activates/restores, actual AX Document http://localhost:5180/ and screenshot show login form with empty email/password. This is concrete mismatch, not login success claim; asked Ethan to sign into this exact now-visible isolated client and supply waiver path/link. No credential asked in chat, no originalprofile change. health20012 absent, model0/no paid release. Help6+GithubUI2 controlled overlays remain, Github83tests/tsc0 independently accepted. Continue other bounded product slice while waiting; no extra validation framework/new fee. Waiver assertion recorded but name/logo changes wait scope/location, not deleted license.

## 2026-11-10 actual Desktop login, runtime root-cause correction and bounded product overlay
Observed genuine localhost5180 login and created synthetic workspace b4e47a0f-dd5c-420d-8dc2-dab3d01cc54f / deepseek-live-20261110. Native startup failed before wrapper because Go preprobe reads outer DSH_HOME: missing isolatedHome/.dsh manifest vs reviewed private-runtime-home. Root paired presence proof false/true+runtimebundle true; private launcher only1line corrected, independent reviewer ACK, no reinstall/secret expansion/originalprofile change. Normal reopen preserved login; actual20012 online observed. Separate private testbot a4f0f7f0-0ea1-4daf-a58e-5ba46cb22522 uses runtime47bc7df8-d80d-44d6-aa8d-5c92dfde78c3, deepseek-account/deepseek-flash/off/private/noSkills. Old user-created Mika remains unchanged; its baremodel failure retained.
Root observed a test task01a1c31e after an earlier send action was safety-rejected; origin not assumed. It failed LOCAL_ACCOUNT_LIVE_NOT_RELEASED before protocol/model. Source overlay HMR re-emitted default auto-start; no paid admission. Root created only previously absent own desktop_prefs autoStartfalse, normal closed/stopped own daemon/reopened. Original19544 untouched. New explicit human queue-first risk consent then same UI sends new message; actual task01a1c324-4875-7c8a-a06f-b04b9acd01df QUEUED/attempt1, oldfailed not retried; owned20012 absent. Exclusive-new modelledger header5requests/1CNY created with exact task while activefalse/rootReleasedfalse pending independent release. Model requests0; no fake response.
Actual backend process four safe booleans LLM_API_KEY/LLM_BASE_URL/COMPOSIO_API_KEY/POSTHOG_API_KEY empty confirm no independent title/tools/analytics sender enabled. Metadata2admitted GET reservations exhausted, never reset; native public source catches denied further GET and uses built-in supportedflash catalog, independent static ACK (not fake vendorresponse). One-time prior metadata expiry only samepolicy/oldcopies/lock/0events change independently accepted.
Client product slice source2+14locale fivekeys reviewed ACCEPT, actual RED-r2 58=38P20F -> final377P0F/TSC-r2exit0, first RED/typeFAIL retained. Root16file guarded/backedup overlay only (no tests/backend), normal actual Desktopmain/preloadbuild0 and code settings observed noGitHubcard, generic repo/PRmerge retained. Prior Help6+GitHubsettings2 retained; no allApp or brandname/logo completion. User asserts waiverexists but no location yet. Originalicons+animatedavatarpreview delivered, clientavatarintegration notdone. WholeGoal remains incomplete.

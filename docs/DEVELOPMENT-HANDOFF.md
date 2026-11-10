---
purpose: "连续开发交接：准备到首轮验收"
owner: docs-maintainers
status: current
updated: 2026-11-07
related:
  - docs/ROUND1-DELIVERY.md
  - docs/tasks/R1-00-baseline.md
  - docs/tasks/R1-results.md
---
# 连续开发交接：准备到首轮验收

> **2026-11-07 当前执行入口更正（R48–R50）：** managed startup-cleanup 后，已独审的现有承接工作树为 E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co，分支 codex/round1-continuous，基线 5abcca9dabc421958b665e3c69331a27b1781357。下文原 morchat-round1 路径仅历史，不再执行；不重建/迁移/导入。源码窗口与当前任务以 ACTIVE 最新检查点和 R1-ISSUE-READ-GUARD-r2-test-frozen 为准；事故与证据缺失见 R1-INCIDENT-WORKTREE-01。D main 不变，旧忽略目录 raw/context 为 LOST/REVALIDATION_REQUIRED，不把当前入口修复当产品验收。

版本 R1-HANDOFF-r1，2026-11-06。Ethan 已批准 [R1-AUTH-r1](ROUND1-DELIVERY.md) 的三个切片和持续授权，不再停在工程准备。

## 1. 当前正确工作树

- 产品主仓：D:/dev/morchat.co；主树有用户未提交业务修改，只读，不覆盖，不切分支。
- 当前工程：E:/CodexData/worktrees/morchat-round1/morchat.co。
- 分支：codex/round1-continuous；恢复起点：b353d4c335a2fc2d06cf1f546bde8ad62debbc45，同仓 Codex startup-cleanup 快照。
- 原工程分支 codex/mc-00-engineering 的 62aa380… 不包含当时未提交成果，不能据此另开空树。
- 上游仍为 Multica 164290ee14f63fe009ca304db21de9879db104c8；已经导入，不重复导入。
- 旧 C 目录残留，不是当前工程；不要修它或再迁移 Codex。

恢复和差异证据见 [R1-00](tasks/R1-00-baseline.md) 与 [结果](tasks/R1-results.md)。旧 47 文件快照保留不覆盖；新内容快照见 tasks/R1-handoff-baseline.json。快照不是契约批准或测试通过证明。

## 2. 接手顺序与核验

先读 AGENTS → docs/README → 本页 → ROUND1-DELIVERY → tasks/ACTIVE → 当前卡及其限定专项；不要要求每个 agent 重读全部竞品和历史聊天。
实际运行 git rev-parse --show-toplevel、git branch --show-current、git rev-parse HEAD、git status --short、git diff --cached --stat；核对 R1-handoff-baseline.json 每个文件 SHA256。差异先归因，不覆盖、不直接重算。
历史检查和当前复验分开：导入 7,582 项与 13 工程单测已复核；恢复快照仍有 17 个执行位缺口。旧 typecheck/lint/Vitest PASS 不当作当前全量测试；旧本地工具路径可能不在恢复快照，按 MC-00-commands 重新定位/按锁安装，不重新选版本。
新会话按任务范围完成第一次可分发基线提交；只在隔离树处理明确工程文件/执行位，不混入主树业务。快照本身包含未公开内部内容，不允许 push。

## 3. Goal 的终态

创建 Goal：收束恢复工程基线，完成 R1-01/02/03 开发与同一候选版本的首轮集成验收。
步骤按 [执行计划](superpowers/plans/2026-11-06-round1-continuous.md)。准备、验证、最小修复和产品实现连贯推进；不要在写完方案或 NM 准备后结束。
只冻结所消费的 C 子集：DRAFT → TEST-FROZEN（可写受控测试/修复）→ 实证通过 → BUILD-FROZEN（依赖产品卡可用）。冻结需真实 owner、消费者及独立 reviewer 留证，不由 Goal 自行改状态。
未拿到模型预算/公司配置或真实第二设备时，只阻塞相应运行验收；继续无模型契约/代码/测试，不能用模拟冒充真实完成。所有硬门禁齐全前不标 Goal 完成。

## 4. 执行授权与不漂移

已授权：三切片代码、测试、文档；同仓隔离工作树和 subagent；锁定依赖/本地构建服务；明确隔离的合成测试库初始化、迁移及安全清理；白名单本地提交；经独立审查合入 codex/round1-continuous。
不含：main、公开推送、生产发布、真实业务资料/外部写入、未批准模型费用、覆盖用户改动和全局 Git 身份修改。不能重复要求 Ethan 批准已授权的本地动作，也不能把旧账号一次调用许可当持续额度。
每卡登记实际 agent/model（不可得则 unknown）、base/contract revision、写集、依赖、用例/命令、reviewer。共享热点唯一 owner；同一 SDD 计划按任务逐步执行，只有真正独立写集才能并行。
每个检查点更新 ACTIVE、卡和 results；只修改当前阶段所需正文，不复活 Paperclip/OMB 双后台，不新造任务/版本/成本总账。

## 5. 新会话启动文本

在本页 §1 的工程目录打开新会话，发送：

使用 Superpowers 和 Codex Goal，按 docs/ROUND1-DELIVERY.md 的 R1-AUTH-r1 连续完成工程收束、三个首轮开发切片及集成验收。先实际核对当前 Git/内容快照，读取 AGENTS、docs/README、docs/DEVELOPMENT-HANDOFF、docs/tasks/ACTIVE 及其当前任务卡和计划，再执行。已定方向不重谈，准备完成不停止。按切片冻结契约，先负例、最小修复、正负回归和独立 review，再推进依赖功能；不等全部远期契约冻结，也不跳过安全门禁。沿同仓隔离工作树开发，权限/状态/schema 单 owner，不覆盖 main 或其他会话。已批准的合成库、本地提交和专用分支集成直接按门禁执行；真实模型、main、公开推送和生产发布仍按批准边界。缺预算/设备时继续不受阻工作，真实验收不得模拟冒充。每个检查点更新任务卡、ACTIVE、结果和快照，以实际证据判完成，不把计划或局部 PASS 当首轮验收。

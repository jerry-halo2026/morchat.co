---
purpose: "本地分支与工作树梳理"
owner: task-owners
status: current
updated: 2026-11-09
related: []
---
# 本地分支与工作树梳理

2026-11-09；只读 Git 审计，捕获约 07:15 UTC（15:15 北京）。执行者 /root/git_worktree_audit，gpt-6.1-sol high；消费者 Root。只新增本报告，不改源码、索引或 refs。

## 结论

**同一仓库，两个有效登记工作树、三个本地分支；不是三个待合并的产品版本。** 应保留 main 的业务工作，以 round1 为平台开发主线；旧 mc-00 无独立提交，无须再合并。现在不直接整分支合入 main，更不能覆盖 main 的未提交改动。

| 工作树 | 分支 / HEAD | 用途与处置 |
|---|---|---|
| D:/dev/morchat.co | main / 3f476b480741cb09729b39be000e6ad1c47181fb | 用户业务工作树；保持原样，不 stash/reset/clean |
| E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co | codex/round1-continuous / efdc54aaf3fcc4e3eaee369b980ac054ccc0bb54 | 现行 Multica 平台与本地演示入口；有保全 lock，继续保留 |

第三分支 codex/mc-00-engineering 指向 62aa38076080cbb4c1088aa14f673c58c52928d8，没有独立登记工作树。这个 SHA 同时是 main 与 round1 的共同祖先；它比 main 落后 10 提交，比 round1 落后 19 提交，独有提交为 0。先保留作追溯指针，不新建树、不重复导入、不把旧分支当新成果合并。

`git worktree list --porcelain` 是登记事实权威；旧文档目录名不等于活动工作树。未读取 E 父层残留目录元数据（受限），不猜测残留是否安全可删，也不清理。

## 已提交与未提交必须分开

- `main...round1` 左/右计数 **10 / 19**，不能 fast-forward 任一方。main 相对共同祖先改动 61 个路径：千川两个拼写目录 `packages/qianchian-sync` 28、`packages/qianchuan-sync` 12、docs 15、其余 6。10 个提交是版本存储、分页/刷新/余额修复、归因差分及 CSV 导出等业务链；同时夹带平台文档/状态文件，不能按提交标题断言全部只碰千川。
- round1 相对祖先改动 **8,071 个路径**，主要 server 3,817、packages 2,361、apps 1,224，另有实验/文档。19 提交中 `b353d4c` 是恢复快照（7,940 路径），包含根级 Multica 导入和既有内容，不是一个可盲合的单功能补丁。后续工程提交包括执行位恢复 `6973f09`、交接授权 `4112a4c`、证据门禁 `1f9a26d`；其余为 ACL/Auth、缓存/claim 固定、外来帧隔离及回归。这里只核 Git 路径/历史，不重新给这些代码签安全验收。
- 两侧已提交路径重叠 **16 个**：`.gitignore` 与 15 个 docs。重叠不等于实际文本冲突数，未运行试合并；即使文本能自动合并，产品权威仍可能语义冲突。
- main：**38 个 tracked 改动，75 个未跟踪状态条目，0 staged**。按全部文件计未跟踪为 **5,287 个**；75 是目录折叠显示，不能说只有 75 文件。涉及用户业务代码、业务数据、文档及状态文件；未读取业务数据内容。
- E：捕获时 **11 个 tracked 改动、166 个未跟踪文件，0 staged**（本报告写入前）。包含持续任务文档、服务端 WIP 和本地启动新增文件；Auth 单写者仍在工作，数目可变化，不能全归因于本次登录修复。它们不在 HEAD 中，直接 merge 分支不会带走。未读其变化中的 Auth diff。

## 保留 / 整合 / 暂缓

1. **保留**：两个登记工作树、main 的全部提交与脏内容、round1 的已提交成果与 WIP、现有 lock、旧 mc-00 追溯指针。不再折腾迁移或验证工具。
2. **先收束 E 的可用成果**：本地启动支持与登录修复由各 owner 按限定写集完成和独立审核，再分开本地提交到 round1；不混入历史实验、数据或凭据。本报告不声称 Auth 已完成。
3. **后续 main 整合方向**：以经审 round1 平台候选为平台基线，保留最新 main 的千川业务增量。由单一集成人逐路径处理 16 个公共文件及 main 未提交文档，结合现行 Multica 权威，不整份选一边。先有明确整合候选、可回溯映射、无覆盖方案和相关回归，再由 Ethan 批准 main 合流；不能在脏 main 上试合并。
4. **不作为前置**：平台当前不消费的千川新指标/导出可独立保留，既不强制搬入 round1，也不阻塞本地演示和平台功能开发。
5. **暂缓**：main merge、旧分支/目录删除、历史清洗、公开 push。仓库及恢复快照含内部资料与业务历史；公开前须另审全部待推历史，不是只加 ignore。既有事故中丢失的忽略证据仍是 LOST/REVALIDATION_REQUIRED，不借整合恢复或补造。

依据：本次实际 worktree/branch/status/merge-base/rev-list/log/diff-name 检查，以及现行 README、DEVELOPMENT-HANDOFF、ROUND1-DELIVERY、工程合流规则和任务入口。旧卡中的目录与 HEAD 只作历史，不覆盖本次 Git 事实。**本次未执行任何 merge、checkout、暂存、提交、推送、恢复或清理。**
## 后续只读复核（2026-11-09，本地提交前）
独立启动审查捕获 main 已由用户推进到 f4733379f2326ae161033a25dabea7a570346868，当前 main...round1 为15/19，main状态23条/暂存0。旧10/19及脏文件计数是上文明确时点的历史快照，不是当前值。有效工作树仍2、分支仍3；mc00独有0，仍无需merge。Root未checkout/修改/合并main，用户在主树的新增提交完整保留。未来合流前必须重新检查，不能拿此只读快照锁住用户开发。
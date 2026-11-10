---
purpose: "本地启动与文档交付独立审核"
owner: task-owners
status: current
updated: 2026-11-09
related: []
---
# 本地启动与文档交付独立审核

2026-11-09 07:54 UTC；reviewer `/root/startup_delivery_review`，configured `gpt-6.1-sol high`（配置标注，不作运行遥测证明）。作者 Root；HEAD `efdc54aaf3fcc4e3eaee369b980ac054ccc0bb54`。

## 结论：APPROVE（仅针对下列最终六文件提交候选）

实际本地登录、项目及任务验收不因本审核退回；本次不重跑浏览器、不访问用户数据、不复审 Auth 源码、不搭建新验证框架。初审两项 HOLD 均已由 Root 在原候选内最小修正并复核消除。批准范围不是企业能力验收、私有配置公开或整索引提交授权。

## 初审发现与闭环（保留历史，不代表最终仍有阻塞）

### 1. 构建上下文隐私边界：已修复

- `Dockerfile.dockerignore:1-13` 默认拒绝后允许 `server/**`；尾部只拒绝 env、`server/bin/`、`server/tmp/`。`server/private.key`、`server/.cache/example` 等假设路径仍会进入上下文；没有显式 key/credential/general-cache 拒绝规则。
- `Dockerfile.web.dockerignore:8-22` 允许整个 `packages/**`，包括路径元数据可见的 `packages/qianchuan-sync/`；尾部只拒绝 node_modules、.next、env。`packages/core/private.key`、`packages/core/.cache/example` 同样未被拒绝。尚未证明额外业务包对 Web 构建必需。
- 根级 `experiments/`、Git、运行目录因首条 `**` 未再放行，确实在上下文外；env 拒绝规则放在 allow 之后，顺序正确。
- **以上是规则级可复现缺口，不是发现了真实秘密或已经泄漏的断言。** 未读取任何真实私钥、私有 compose、env、备份或生成业务数据。
- 最小修正：保留已需 source/config/LICENSE/NOTICE，尾部补拒绝私钥/认证材料及常见缓存；Web 排除无构建依赖的业务目录，或由作者给出必要性证据。不要删除可能属于源码的任意 `credentials.go` 或不加判断地屏蔽源码目录。

### 2. 旧 Git 快照不能当作当前值：已修复

- `WORKTREE-STATUS.md:3` 明确标注约 07:15 UTC；该时点历史可以保留。
- 但 `:11,14,20,23` 的 main SHA、10/19、main 脏状态已与本次 07:54 UTC 只读命令结果不同。当前 main 为 `f4733379f2326ae161033a25dabea7a570346868`，`main...codex/round1-continuous` 为 **15/19**；main 折叠状态条目 **23**、staged **0**。未读取 main 业务文件内容。
- 当前仍是 **2 registered worktrees / 3 local branches**；共同祖先与 mc-00 指针都是 `62aa38076080cbb4c1088aa14f673c58c52928d8`；mc-00 相对 main/round1 独有提交均为 0，无须重复合并。
- 需要追加“后续元数据快照”而非抹掉原审核历史；保留 main 全部用户工作、round1 WIP、现有 lock 和旧分支，不做 merge/reset/stash/clean。

## 最终修订复核

- `Dockerfile.dockerignore:14-32`、`Dockerfile.web.dockerignore:23-41` 在宽允许规则之后拒绝 Git、node_modules、.next、.cache、.pnpm-store、coverage、常见私钥容器、.netrc、嵌套 .npmrc、credentials.json、service-account JSON 和 env；初审举出的 key/cache 假设路径现被拒绝。
- Web `:42-44` 排除两种千川业务目录；`:45-46` 仅恢复 Dockerfile.web 明确 COPY 所需且已检查无认证赋值标记的根 .npmrc。没有据此放行其他私有配置。
- 对实际所需 server/apps/web/mobile patches/core/ui/views/tsconfig/eslint-config/plugin-sdk/vitest-setup 的 tracked 路径元数据筛查，没有发现新增拒绝规则会命中的必要源码文件；没有阅读这些源码内容。原 Dockerfile、Dockerfile.web、pnpm-lock.yaml 复核仍无 HEAD diff。按任务边界未重建镜像；原构建通过是此前内容的执行证据，本轮仅改 context 过滤并核对输入保留。
- `WORKTREE-STATUS.md:35-36` 追加实际 main `f473337...` / **15/19** / **23 条、0 staged**，显式保留旧快照为历史，并重申用户 main 新提交不动。其余三份启动/目标/验收文档 SHA-256 未变化。

## 已确认的候选优点与事实边界

1. 原 `Dockerfile`、`Dockerfile.web`、`pnpm-lock.yaml` 工作文件与 HEAD blob 完全一致；HEAD diff 无变化。没有改镜像配方、版本或锁文件。
2. Dockerfile 所需 server 模块/源码/迁移、入口脚本、LICENSE/NOTICE 被后端规则允许。Web 所需源码、source.config.ts、公共资源、workspace 配置、根 .npmrc、移动端 patch、LICENSE/NOTICE 被前端规则允许；所列构建输入存在。.npmrc 的 auth/token/password 赋值标记计数为 0（未输出配置值）。
3. 六候选不含真实密码、token、email 或模型 API 秘钥。验收页所列项目/任务 UUID 是本地标记测试对象引用，不是认证材料。未扩大扫描至业务数据。
4. `LOCAL-RUN.md:5-10,12-21` 准确限定当前 E 工作树、localhost、本地独立业务库、共享 Supabase 只复用 Auth、无付费模型调用；外部会话期限和不声称即时撤销也已交代。
5. 当前私有 compose 在 Git 外，包含随机本地凭据，**运行所需但不可提交**。`:13-17` 命令是此机器既有环境的操作手册，不是干净机器一键重建承诺。若以后要求可迁移交付，应另有无秘密的模板及环境设置说明；不为本轮擅自加入私有配置。
6. `LOCAL-FIRST-STAGE-ACCEPTANCE.md:7-17,19-28` 与 Root 提供的已完成证据相符：Auth 独审最终摘要 d9dcd03b281399000d0a1a155675b0e96b233e010a6f745c973726e3742423e5；前后端实际构建；Ethan 本人输入账号登录；标记项目/手动 TITA-2 创建并 reload 回读。此处是核对交付记录，不冒充本 reviewer 重复实机操作。
7. 手动模式未创建智能体/未调用模型、企业 ACL/Windows DSH/用量/Leader/版本撤权保存/双设备未验收的边界明确；不把第一阶段写作总 Goal 完成。`CURRENT-GOAL.md:19-20` 记录当前 active 目标，不重启旧暂停历史或旧探针。

## 精确提交白名单建议

**最终六文件已复审通过，建议由 Root 严格按以下六路径单独本地提交；不是整树或当前索引提交授权。**

- `Dockerfile.dockerignore`
- `Dockerfile.web.dockerignore`
- `docs/tasks/LOCAL-RUN.md`
- `docs/tasks/CURRENT-GOAL.md`
- `docs/tasks/LOCAL-FIRST-STAGE-ACCEPTANCE.md`
- `docs/tasks/WORKTREE-STATUS.md`

Auth 的 32 staged 路径属于另一独审与提交边界。本报告不在这六路径中；如需提交审核凭据，应另明确批准第七路径，不能偷偷扩大白名单。其他历史实验、源码 WIP、业务数据、运行配置、备份一律不混入。没有执行 stage/commit/push/merge、服务变更或清理。

## 本次候选 SHA-256

| 文件 | SHA-256 |
|---|---|
| Dockerfile.dockerignore | 85a084d1a984882d9724b0eb19ee53a11e8ee1decd3417ba56b32b477915abbb |
| Dockerfile.web.dockerignore | 8f6d4a60fc4f946484f25683d3e5819f0a9df996c682638d0f3bacbf5029563b |
| docs/tasks/LOCAL-RUN.md | 9a4e846fa15c450f4e34d3cfdd038a8c68f2eb913f3869e0a3aec592bda463ac |
| docs/tasks/CURRENT-GOAL.md | 507c76f33b0c578ca85ad4dafa7efdecdc5670cd709b43685692438dae67ae76 |
| docs/tasks/LOCAL-FIRST-STAGE-ACCEPTANCE.md | d01d3eb41ddcabc7cefaf7636869e6247a631041ef30d968832175bd6674e5c6 |
| docs/tasks/WORKTREE-STATUS.md | 3ffc9dd897150574fefee73d646c51793d22acf9be4810c29ed52c1df764bb40 |

## 审核操作透明记录

仅新增本报告，无候选/源码编辑，无 Auth 源码读取，无真实业务数据或私有配置读取。本 reviewer 的一次元数据检查误用了 `git write-tree --missing-ok`，返回 `13748f7d1248dbbddf46161d1b457b109393a296`；它未暂存或提交文件，但可能创建 Git tree 对象/更新 cache-tree 元数据，因此不能把整个会话称为严格只读 Git。已向 Root 即时披露，不清理对象，不再重复。除这次误用外均为文件读取和 Git 查询。
# 仓库卫生盘点（2026-11-19）

这份文件记录本机这台 checkout 的**分支 / 工作树 / 运行中环境**现状，以及这一轮做的清理。
它回答两个问题：「现在都有哪些分支，各自什么状态」「哪些可以删、哪些不能动」。

## 1. 工作树（3 个，全部干净）

| 路径 | 分支 | HEAD | 未提交改动 |
| --- | --- | --- | --- |
| `D:\dev\morchat.co` | `main` | `05fcc07bf` | 0 |
| `D:\dev\morchat-cli` | `sync/cli-rename` | `7572ebb72` | 0 |
| `D:\dev\morchat.co\.agents\worktrees\workbench-blocks` | `workbench-blocks` | 见 `git log -1` | 0 |

本轮清掉的僵尸登记：`E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co`（`locked` 但磁盘上已不存在）
→ `git worktree unlock` + `git worktree prune`。

## 2. 分支（5 条）与它们的真实关系

判据：`git rev-list --count main..<branch>` = 该分支**独有**的提交数（>0 才是未合并的工作）。

| 分支 | 独有提交 | main 有而它没有 | 判断 |
| --- | --- | --- | --- |
| `main` | 0 | — | 基线，**未动**，dev 可快进 |
| `dev` | **127** | 0 | 已推 `origin/dev`（`2f348ab64`） |
| `workbench-blocks` | 127 | 0 | 与 `dev` 同一 commit；本 worktree 在用，PR 合并后再删 |
| `sync/cli-rename` | **0** | 32 | 内容已全在 main；还挂着 `D:\dev\morchat-cli` 这个活工作树 |
| `codex/round1-continuous` | **45** | 513 | 11-11 的并行实现，**未合并**，详见 §3 |

**本轮删除**：`sync/0.8.2`（独有 0 提交，纯 main 子集，且它的 worktree 早已 prune）。

**故意没删**：

- `sync/cli-rename`：分支本身没有任何独有提交，但 `D:\dev\morchat-cli` 是一个真实可用的
  checkout（干净）。删分支必须先 `git worktree remove`，那会连 `node_modules` 一起删掉，
  重建成本高于收益。要删的时候：
  ```bash
  git -C D:/dev/morchat-cli status --porcelain   # 必须为空
  git worktree remove D:/dev/morchat-cli
  git branch -D sync/cli-rename
  ```
- `workbench-blocks`：本 worktree 正在用；`dev` 合进 `main` 之后再删。

## 3. `codex/round1-continuous` 是什么，为什么留着

45 条独有提交、停在 2026-11-11、缺主干 513 条。抽读后的结论：

- 它是**另一条并行实现线**（Codex 一轮的产出）：knowledge 六个屏幕 + 导入流水线 + wiki schema、
  presets 目录、桌面端内置 DSH runtime、品牌改名、auth/ACL 硬化与一批 RED 测试。
- 功能**没有**通过它合进主干：main 上的 knowledge 是另一套文件结构（`components/knowledge-*.tsx`，
  迁移 637+），DSH resources 在 main 的 `apps/desktop/resources/` 里也没有该分支的
  `dsh/package.json`。也就是说这 45 条的工作大部分**没有落地**，删分支会丢历史。
- 反过来它也不能直接合：它是 11-11 的树，合进来会带回 513 条老代码的状态。

**结论：留作档案，不要合。** 若将来要捡其中某一块，用
`git log --grep=<关键词> codex/round1-continuous` 找提交、`git show <sha>` 取补丁，不要整支合。

## 4. 远端

```
origin/main = 05fcc07bf（与本机 main 一致）
origin/dev  = 2f348ab64（本轮推的）
```

`git remote prune origin` 跑过，没有失效的远端引用。

## 5. 运行中的环境（本机）

| 项 | 值 | 说明 |
| --- | --- | --- |
| API | `wb-e2e-api` 容器，`localhost:18978` | 端到端用的后端，库 `multica_workbench_blocks_898` |
| Web | `localhost:3000` | `pnpm --filter @morechat/web dev` |
| PostgreSQL | `multica-postgres-1`，`localhost:5432` | 共享容器；本轮的 role 密码已对齐为 `multica`（见下） |
| 桌面构建产物 | `apps/desktop/out`（gitignored） | 给 Electron E2E 用；`VITE_API_URL` 是构建期烘进去的 |

**本轮修的两个环境坑**（会复现，记下来）：

1. `make up` 重建共享 postgres 容器后，容器里 `multica` 角色的密码与 `.env` 的 `multica:multica`
   不一致 → 迁移报 `SASL auth failed`。修：`ALTER ROLE multica WITH PASSWORD 'multica'`。
   （数据卷没受影响，`multica_wb` 等库都在。）
2. 本机 `ELECTRON_RUN_AS_NODE=1` 会让 Electron 退化成纯 Node；桌面 E2E 在启动前删掉这个变量。

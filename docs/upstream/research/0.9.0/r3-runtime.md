---
purpose: 上游 v0.9.0（v0.8.2..v0.9.0）daemon / 运行时 / harness / Environments 提交的逐项调研与取舍判决
owner: lead
status: reference
updated: 2026-11-13
related: [docs/upstream/SEAMS.md, docs/upstream/DRIFT-BASELINE.md, HANDOFF.md, CLI_AND_DAEMON.md]
---

# 上游 0.9.0 调研 R3：daemon 与运行时

只读调研：全程只有 `git log/show/diff/ls-tree/cat-file`，没有改代码、没有跑测试、没有起服务。
区间 `v0.8.2..v0.9.0` 共 162 个提交。

## 0. 结论速览

| 提交 | 主题 | 性质 | 判决 |
|---|---|---|---|
| `9abc71ae9` | daemon-token 请求清掉 `X-User-ID` | 安全 | **必吸** |
| `606ed4b4e` | 已完成任务环境 TTL 默认 14d（不再只在官方云上开） | 稳定性（磁盘） | **必吸**，与 `cfcc4d055` 一起 |
| `cfcc4d055` | 回收 Codex 缓存、让 local task home 过期 | 稳定性（磁盘） | **必吸**（依赖上一条的语义） |
| `ee7416bbf` | 在 checkout 内部再跑 checkout 时复用/拒绝 | 正确性 | **必吸** |
| `d13fd90a3` | 同一仓库不同 URL 写法都能命中注册仓库 | 正确性 | **必吸** |
| `eef8f937e` | mise shim 入口名要保留 | 稳定性 | **必吸**（3 文件 39 行） |
| `90d5d6da6` | darwin 进程组排空期容忍 EPERM | 稳定性（macOS） | **吸**（我们发 macOS 包） |
| `c575443bb` | runtime brief 里互相矛盾的回复/优先级规则 | 质量 | **吸**（纯文案 + 断言） |
| `1a9ddcf8f` | 告诉 agent 别用共享 `git stash` | 正确性（多 agent 串味） | **吸**（纯文案） |
| `66e534d8e` | 新增 Factory Droid harness | 产品方向 | **暂不吸**（要以我们自己的注册面重做，见 §2.10） |
| `19a62c1b2` | 新增 Amp CLI harness | 产品方向 | **暂不吸**（同上） |
| `079ec9f67` | 环境面板 stop/restart/start/logs | 产品方向 | **暂不吸**（62 文件 5.7k 行，且迁移号全撞） |
| `293b760de` | 声明 web/desktop 环境、server 只列一次 | 产品方向 | **暂不吸**（依赖上一条） |
| `30f2731c3` | 从 issue 侧栏切到桌面窗口 | 产品方向 | **暂不吸**（依赖 `079ec9f67`，且与我们桌面进程模型不同） |
| `7d2f349d8` / `683240f1b` / `f86ad5319` / `fe2aa8798` | 环境与运行时文档 | 文档 | **随功能走**：功能不吸则文档不吸 |

一句话：**daemon 的九个修复全部值得吸，而且几乎无冲突；三条 Environments 特性与两个新 harness 属于产品方向，先不吸。**

## 1. 复核方法（可复现）

```powershell
git rev-list --count v0.8.2..v0.9.0                     # 162
git diff --name-only v0.8.2 HEAD | Select-String 'apps/desktop|server/internal/daemon|server/pkg/agent'
git show <sha> --stat --oneline
git diff --shortstat v0.8.2 HEAD -- <upstream 触碰的文件>
```

我们相对 `v0.8.2` 的本地差异规模：`apps/desktop` 158 个文件、`server/internal/daemon` 134 个、`server/pkg/agent` 22 个。
**关键事实**：这些文件里绝大多数与 `v0.8.2` 的差异只是模块路径改名
`github.com/multica-ai/multica` → `github.com/jerry-halo2026/morchat.co`（每个文件 1–5 行）。
只有三处是真实功能增量：`server/internal/daemon/config.go`、`server/internal/daemon/daemon.go`、
`server/pkg/agent/dsh.go`（新增）+ `server/pkg/agent/models.go`（仅 import）。这与 `docs/upstream/SEAMS.md`
「`server/` 内的差异只来自改名 + 已登记接缝」的约束一致，也意味着上游 daemon 修复的 patch 落下来基本只有 import 行冲突。

## 2. 逐提交四段

### 2.1 `9abc71ae9` fix(daemon): clear the client user id on daemon-token requests

- **上游做了什么**：`server/internal/middleware/daemon_auth.go` 在清 `X-Agent-ID` / `X-Task-ID` 的同一段里补
  `r.Header.Del("X-User-ID")`；新增 `TestDaemonAuth_StripsClientSuppliedUserID`。2 文件 +49 行。
  漏洞是：`mdt_` 分支不写用户身份，客户端自带的 `X-User-ID` 会原样进 handler，被 `requestUserID` 当成调用者。
- **我们的现状**：该文件与 `v0.8.2` 只差两条 import（+2/-2）。我们没有等价防护。
- **判决**：**必吸**。纯安全修复，`server/` 内、无需迁移、无产品取舍。
- **证据与冲突**：`server/internal/middleware/daemon_auth.go`（我们 82e66175 版本只有 import 差异）；冲突面仅 import 块。

### 2.2 `606ed4b4e` fix(daemon): default completed-task TTL to 14d on every server

- **上游做了什么**：删掉 `DefaultGCCompletedTaskTTLCloud/SelfHost` 与 `defaultGCCompletedTaskTTL(serverBaseURL)`，
  改成所有部署统一 `DefaultGCCompletedTaskTTL = 14 * 24h`，保留 `MULTICA_GC_COMPLETED_TASK_TTL=0` 作为关闭开关；
  文档同步 6 个 locale + `CLI_AND_DAEMON.md`。9 文件 +66/-127。
  动机写在提交正文里：只在官方云开的时候，自托管 daemon 的 417 个环境、58G 磁盘永远不回收，GC 每次都 `cleaned=0`。
- **我们的现状**：`server/internal/daemon/config.go:75-76` 仍是 Cloud/SelfHost 两个常量，`:604` 仍调
  `defaultGCCompletedTaskTTL(serverBaseURL)`，`:758` 仍是那个按主机名分支的函数。我们自托管 → 默认值 0 → **我们不回收**。
- **判决**：**必吸**。这是稳定性/磁盘修复，不是产品方向；桌面端把 daemon 装到用户机器上，磁盘不归零的代价由用户承担。
  两个可选做法：(a) 照上游统一 14d；(b) 只把「我们自己的域名」判定收窄，保留自托管 0。
  按「上游更好就直接用上游」，选 (a)，并在发版说明里写 `MULTICA_GC_COMPLETED_TASK_TTL=0` 的退路。
- **证据与冲突**：同文件还有我们的 DSH 增量（`DshProfileBundleDir`、`errNoAgentCLI`、零 CLI 启动例外），
  与 TTL 段落不在同一区域，冲突是局部的；`config_test.go` 需要随上游一起改（它断言了 cloud/self-host 两套默认值）。

### 2.3 `cfcc4d055` fix(daemon): reclaim Codex caches and expire local task homes

- **上游做了什么**：25 文件 +749/-175。把「已完成任务环境」的清理边界扩到两类之前永远不动的目录：
  ① 本地目录任务（`GCMeta.LocalDirectory`）的 Codex home 可以过期，但**保留 daemon 的 `output/`、`logs/` 和外部存储的 session 历史**；
  ② 按 pattern 回收 Codex 插件缓存。`gcStats` 增加 `localDirectoriesRetained` / `codexHomesReclaimed`，
  `taskDirGCDecision` 改成返回 `removal` 描述，新增 `applyLocalDirectoryGCOverride`；顺手处理 Windows junction。
- **我们的现状**：`gc.go`（+4/-4）、`execenv/execenv.go`（+1/-1）都只有 import 差异；`GCMeta.LocalDirectory` 的语义还是
  「保留整棵树」的老注释，也就是我们同样不会回收这类 home。
- **判决**：**必吸，且必须与 2.2 一起吸**。单独吸 `cfcc4d055` 而没有 14d 默认值时，几乎没有东西会过期，收益为零；
  单独吸 `606ed4b4e` 而不带这批 override，会把 local-directory 的日志一起删掉（上游这批改动正是为了避免这一点）。
- **证据与冲突**：`server/internal/daemon/gc.go`、`server/internal/daemon/execenv/execenv.go`、`config.go`，
  都在我们的接缝内但只差 import；`.github/workflows/ci.yml` 的那一行 Windows 用例按我们 CI 现状决定要不要带。

### 2.4 `ee7416bbf` fix(daemon): reuse checkout when repo checkout runs from inside it

- **上游做了什么**：5 文件 +407/-10。`repocache` 新增 `ErrCheckoutPathTaken` 与 `CheckoutBelongsTo` / `otherRepoCheckout`：
  从已有 checkout 内部再 `multica repo checkout` 时复用而不是新建；目标路径若属于**另一个**同名仓库则拒绝，
  且在 retarget / reset / clean / migrate 任何一个破坏性动作之前就拒绝。`cmd_repo.go` 补了帮助文案。
- **我们的现状**：`repocache/cache.go` 只有 import 差异（+5/-5）；我们没有这层保护，同名仓库共用一个路径时会被就地改写。
- **判决**：**必吸**。正确性 + 破坏性数据保护，属稳定性。
- **证据与冲突**：`server/internal/daemon/repocache/cache.go`、`server/cmd/multica/cmd_repo.go`、`health.go` 均只有 import/无差异；
  `daemon.go` 有我们的 DSH 增量但与本次改动区域（repo allowlist 之外）不重叠。

### 2.5 `d13fd90a3` fix(daemon): allow repo checkout across URL forms of a registered repo

- **上游做了什么**：5 文件 +359/-37。`repoAllowlist` 改成能识别同一仓库的多种 URL 形态（ssh / http、显式默认端口、
  `.git` 后缀等），`ensureRepoReady` 返回「注册时的那条 URL」，`repoCheckoutHandler` 用它覆盖 `req.URL`，
  从而让 cache 归属、project ref、非默认端口边界都不被改写。带真实 Git 回归测试。
- **我们的现状**：`daemon.go` / `health.go` / `daemon_test.go` 均无相关逻辑。
- **判决**：**必吸**。这是 agent 日常动作（checkout）的可用性问题，不是产品方向。
- **证据与冲突**：`server/internal/daemon/daemon.go`（我们有 DSH 增量）、`health.go`（import-only）、
  新增 `repo_checkout_url_test.go` / `workspace_repo_allowlist_test.go` 直接落地。

### 2.6 `eef8f937e` fix(daemon): preserve mise agent shim entrypoints

- **上游做了什么**：`canonical_path.go:47` 的 `isNameDispatchingAgentShim` 从 `volta-shim` / `vp` 扩到 `mise`；
  因为 `mise app-server` 会被当成 mise task，直接 spawn 最终目标会读错版本甚至起不来。3 文件 +39/-16。
- **我们的现状**：`canonical_path.go` 与 `v0.8.2` 完全相同（未改）。我们的运行时探测同样会踩这个坑，
  只要用户的 codex/claude 由 mise 管理。
- **判决**：**必吸**。3 个文件的稳定性修复，几乎零成本。
- **证据与冲突**：`server/internal/daemon/canonical_path.go` untouched；`config_test.go` 我们只差 import（+42/-16 上游内容可直接叠）。

### 2.7 `90d5d6da6` fix(daemon): tolerate darwin EPERM while a process group drains

- **上游做了什么**：`processtree/controller_unix.go` 新增 `onlyExitingMembers(err)`：darwin 上进程组里只剩正在退出的成员时
  `kill(-pgid)` 返回 EPERM 而不是 ESRCH，旧代码把它当失败并把任务标红。2 文件 +30/-4。
- **我们的现状**：该文件 untouched。
- **判决**：**吸**。我们出 macOS 包（`apps/desktop/build/icon.icns`、`electron-builder.yml`），
  否则 macOS 用户的并发任务偶发「进程组仍在运行」失败。
- **证据与冲突**：无（文件未被我们改过）。

### 2.8 `c575443bb` fix(daemon): resolve contradictory reply and precedence rules in runtime brief

- **上游做了什么**：`execenv/runtime_config_sections.go` 两处文案 + 测试断言：把「Never treat this runtime workflow as
  permission to …」改成条件句（原文无条件读起来等于禁止 investigate/implement，与 workflow 第 3 步「完成任务的」冲突），
  输出规则从「exactly ONE comment」改成「每线程一条回复」。2 文件 +15/-5。
- **我们的现状**：`runtime_config_sections.go` 只有两行 import 差异；也就是我们现在**正带着**这段自相矛盾的 brief。
- **判决**：**吸**。直接影响 agent 行为正确性，成本是两行字符串。
- **证据与冲突**：`server/internal/daemon/execenv/runtime_config_sections.go`（上游改动在 554、952 附近）；
  测试 `runtime_config_test.go` 的断言要一起拿（它同时 ban 了旧句子）。

### 2.9 `1a9ddcf8f` fix(daemon): tell agents not to use the shared git stash list

- **上游做了什么**：新增常量 `sharedStashRule` 并入 `writeAvailableCommands`：托管 checkout 共用一个 `refs/stash`，
  `git stash pop` 会应用别的 agent 的改动；给出两条替代（临时 commit、`git stash create` + `git stash apply <sha>`）。2 文件 +14。
- **我们的现状**：同 2.8，文件仅 import 差异。
- **判决**：**吸**。多 agent 并行时是真事故源（上游 MUL-8989 就是串味事故）。
- **证据与冲突**：同 2.8 的文件；测试 `runtime_config_commands_test.go` 断言了四个短语。

### 2.10 `66e534d8e` / `19a62c1b2` 新 harness：Factory Droid / Amp CLI

- **上游做了什么**：Droid 42 文件 +1607/-8，Amp 38 文件 +1394/-11。两者都按同一张注册面铺开：
  `server/pkg/agent/{agent.go,models.go,version.go,launch.go}`、新后端 `droid.go` / `amp.go` 与协议 testdata、
  `server/internal/daemon/{agents_probe.go,config.go,daemon.go,local_skills.go}`、
  `server/internal/daemon/execenv/{context.go,runtime_config.go}`、`server/internal/metrics/labels.go`、
  `server/migrations/652_runtime_profile_add_droid.*` / `656_runtime_profile_add_amp.*`、
  `packages/core/types/agent.ts`、`packages/core/agents/mcp-support.test.ts`、
  `scripts/agent-cli-command-names.txt`、以及 6 locale 的 providers / install-agent-runtime 文档。
- **我们的现状**：我们没有 droid/amp。我们的默认 runtime 是 DSH（`dsh` 后端是 `v0.8.2` 的共同基线，上游同样有；
  我们额外加了 `DshProviderID`、`DshDefaultModelID`、`MULTICA_DEFAULT_DSH_MODEL`），桌面端把 node/python/git/dsh 打进 `resources/`。
  `pkg/agent/models.go` 我们只改 import；`config.go` 的 `errNoAgentCLI` 字符串里已经列了 29 个 CLI。
- **判决**：**暂不吸（产品方向）**。它们不冲突，但吸进来的代价不是 1,600 行代码，而是：
  ① 每个 harness 都要在我们的 `config.go` 巨型启动错误串、`scripts/agent-cli-command-names.txt`、
  `metrics/labels.go`、`local_skills.go`、`execenv/context.go` 里再点一遍名；
  ② 要新迁移号（见 §3.2，我们的 652 已被 `knowledge_stale_idx` 占用）；
  ③ 要重跑上游的真机协议 testdata（`droid-1.8.0-protocol.md` 等），我们在 DSH-first 的定位下没有这个验证面。
  若产品上确实要支持这两个 CLI，**直接搬上游实现**（`pkg/agent/droid.go` / `amp.go` + testdata）而不是自研；
  但把 `652/656` 重编号到 `653+` 之后才能落。
- **证据与冲突**：迁移号 652/656 与我们冲突；`server/pkg/agent/models.go` 我们的 `case "qwen", "droid"` 段落不存在（我们是 `v0.8.2` 基线），
  上游 amp 的 `case "amp"` 插入点在 `discoverCodebuddyModels` 之后，落在我们会改的同一函数里，属普通文本冲突。

### 2.11 `079ec9f67` Environments：stop / restart / start / logs

- **上游做了什么**：62 文件 +5777/-306。服务端新增 `issue_environment_control.go`、迁移 `638_issue_environment_control`
  与 `639/640/641/642` 四个索引；daemon 侧 `environments.go` / `client.go`（+52）新增「命令行」认领与结果回传、
  logs 读取（10 分钟清扫）、`controllable` 标记；前端 issue 侧栏加控制条、日志对话框、启动菜单，8 个 locale。
- **我们的现状**：`environments.go` 只有 import 差异，`issue_environment.go` 只有 import + 一处 `go fmt` 对齐；
  我们**没有** control 表、没有 `environment-focus` 端点。
- **判决**：**暂不吸（产品方向）**。这是让 issue 侧栏直接管「agent 起的那个 dev server」，与我们的桌面端
  （对话 + 任务 + 自带 runtime）不是同一条主线；而且 5.7k 行 + 5 个迁移号的代价，在迁移号冲突下更高。
- **证据与冲突**：迁移 `638–642` 与我们 `638_knowledge_items_space`…`642_task_usage_credential_source` **逐号相撞**（§3.2）；
  `server/internal/daemon/client.go` 我们只有 import 差异（+52 行可叠，但依赖 control 表）；`issue-detail.tsx`、locales 冲突中等。

### 2.12 `293b760de` 声明 web / desktop 环境、server 只列一次

- **上游做了什么**：17 文件 +814/-32。新增仓库内 `.multica/environments.toml`（`[environments.web]` / `[environments.desktop]`），
  `localenv` 增加「声明式环境」来源 `SourceConfig`，detected 的桌面 app 归并到声明环境而不是另起一行，
  `manager.Owns` → `manager.Owner`；`scripts/agent-environment.sh` 配套。
- **我们的现状**：我们没有 `.multica/environments.toml`（`ls .multica` 空），也没有这套声明式环境；
  但 `server/internal/daemon/localenv/` 在 `v0.8.2` 基线里存在，也就是说基础设施有一半在。
- **判决**：**暂不吸**。它是 `079ec9f67` 的延伸，且强绑定上游自己的 `scripts/agent-environment.sh`（`make up` 环境）。
  我们的 `scripts/` 是不同的一套（worktree 环境脚本），直接搬会造出两套并行真值。
- **证据与冲突**：`server/internal/daemon/environments.go`（import-only）、`localenv/*`（`v0.8.2` 原样）；
  新增 `.multica/` 目录我们目前没有。

### 2.13 `30f2731c3` 从 issue 侧栏切到桌面窗口

- **上游做了什么**：41 文件 +1380/-62。桌面主进程新增 `apps/desktop/src/main/environment-focus.ts`
  （POST `http://127.0.0.1:<port>/environments/focus`，`gone|unsupported|unavailable|failed` 四态），
  `daemon-manager.ts` 接上、preload 加 IPC，`server/internal/daemon/{environments,health,localenv/*}` 提供 `/environments/focus`，
  `packages/core/types/environment.ts` 与 issue 侧栏按钮。
- **我们的现状**：我们**没有** `apps/desktop/src/main/environment-focus.ts`（`v0.9.0` 有），
  我们的 desktop 比上游多 17 个文件（216 vs 199，含 `runtime-configurator/*`、`dsh-bootstrap.ts`、
  `fetch-runtime-tools.mjs`、`bundle-dsh.mjs`）；`daemon-manager.ts` 我们改过。
- **判决**：**暂不吸**。它假设「daemon 探测到的 app 由桌面端负责前置窗口」，而我们的桌面端自己就是唯一的宿主窗口，
  多窗口语义由 `window-overlay-store` / tab 承担。真要吸，得先决定 issue 侧栏「切窗口」指向哪个窗口。
- **证据与冲突**：`apps/desktop/src/main/daemon-manager.ts`（我们有改动）、`apps/desktop/src/preload/index.ts`（有改动）、
  `packages/core/api/schemas.ts`、`packages/core/types/environment.ts`（新增）、8 个 locale。

### 2.14 文档提交 `7d2f349d8` / `683240f1b` / `f86ad5319` / `fe2aa8798`

- **上游做了什么**：`7d2f349d8` 澄清 `<CLI>` 环境控制与共享日志（`CLI_AND_DAEMON.md` 1 文件）；
  `683240f1b` 新增公开 Environments 文档页（23 文件，含 6 locale、`builtin_skills/multica-platform/references/environments.md`、
  `multica env` CLI 参考）；`f86ad5319` 对齐运行时支持矩阵与最低版本（12 文件）；
  `fe2aa8798` 同步运行时支持与 Amp 配置说明（11 文件）。
- **我们的现状**：`CLI_AND_DAEMON.md`、6 locale 的 `providers.mdx` / `install-agent-runtime.mdx` 我们改过（品牌/产品差异）。
- **判决**：**随功能走**。2.11–2.13 不吸，则 `7d2f349d8` / `683240f1b` 不吸；
  `f86ad5319` / `fe2aa8798` 只在上游那套 harness 列表下才有意义，我们若保持 DSH-first 就不需要。
  唯一可单独拿的是 `f86ad5319` 里与 harness 无关的「最小版本」表格措辞，收益低。
- **证据与冲突**：docs 全在 `apps/docs/content/docs/`，与我们同类文件冲突面广但都是文案级。

## 3. 冲突面（同步时按这个顺序处理）

### 3.1 模块路径改名

上游所有 `server/**` 改动都以 `github.com/multica-ai/multica/...` 书写。落到我们的树上要在同一个 hunk 里改成
`github.com/jerry-halo2026/morchat.co/...`。实测本轮十个修复触碰的 Go 文件里，除
`config.go` / `daemon.go` 外，本地差异全部 ≤5 行且都是 import，`git cherry-pick` 后基本只剩这一处手工处理。

### 3.2 迁移号全段相撞

上游 `v0.8.2..v0.9.0` 新增 40 个迁移文件（`637`…`656`）；我们本地已有 `637`…`652`，且**同名号不同物**：

| 号 | 上游 | 我们 |
|---|---|---|
| 637 | `issue_environment_kind` | `wiki_knowledge` |
| 638 | `issue_environment_control` | `knowledge_items_space` |
| 639 | `issue_environment_command_pending_idx` | `gateway_credentials` |
| 640 | `issue_environment_command_issue_idx` | `knowledge_space_fk_tighten` |
| 641 | `issue_environment_command_logs_idx` | `knowledge_import` |
| 642 | `issue_environment_config_issue_idx` | `task_usage_credential_source` |
| 643–646 | `issue_requester` / `…_index` / `issue_member_creator_index` / `theme_store_download` | `user_password` / `builtin_agent_display_name` / `department` / `org_columns` |
| 652 | `runtime_profile_add_droid` | `knowledge_stale_idx` |
| 656 | `runtime_profile_add_amp` | （空缺） |

结论：**任何一条要吸的上游迁移，都必须在我们这边重新编号到 653+**，并按仓库规则在
`server/cmd/migrate/main.go` 的 `concurrentIndexCleanups` / `concurrentDownIndexCleanups` 登记新号。
本轮九个 daemon 修复里**没有一条带迁移**，所以 §2.1–2.9 不受影响；受影响的是 `079ec9f67`（5 个）与 droid/amp（各 1 个）。

### 3.3 桌面端与工具链

- 上游 `apps/desktop` 199 个源文件，我们 216 个。上游 `v0.9.0` **没有**
  `scripts/fetch-runtime-tools.mjs`、`scripts/bundle-dsh.mjs`、`src/main/runtime-configurator/*`——那是我们独有的「自带 python/git/node/DSH」栈
  （见 `apps/desktop/scripts/fetch-runtime-tools.mjs` 顶部契约与 `bundle-dsh.mjs` 的 drop list）。
- 因此**凡上游改 `daemon-manager.ts` / `preload/index.ts` 的提交（`30f2731c3`）都落在我们重写过的主进程上**，
  不能整段 cherry-pick。
- 我们的 daemon 由 `scripts/bundle-cli.mjs` 从本仓 `server/` 构建后随桌面端分发，所以上游 daemon 修复一旦吸收，
  会直接改变桌面端内置 daemon 的行为——**这也是这批修复值得优先吸的原因**。

### 3.4 harness 注册面（若将来吸 droid/amp）

一次要改到的位置（上游这两个提交的并集）：
`server/pkg/agent/agent.go`（`SupportedTypes`、`resumeRejectionUndetectable`、`New`、`launchHeaders`）、
`pkg/agent/models.go`、`pkg/agent/version.go`（`MinVersions`）、`pkg/agent/launch.go`、
`server/internal/daemon/{agents_probe.go,config.go,daemon.go,local_skills.go}`、
`execenv/{context.go,runtime_config.go}`、`server/internal/metrics/labels.go`、
`packages/core/types/agent.ts`（`RUNTIME_PROFILE_PROTOCOL_FAMILIES`）、`scripts/agent-cli-command-names.txt`、
以及 `config.go` 里那条 29 个 CLI 的启动错误串。

## 4. 我们独有、上游没有（同步时不要被上游覆盖）

| 能力 | 位置 | 说明 |
|---|---|---|
| 自带工具链 python / git / node / DSH | `apps/desktop/scripts/fetch-runtime-tools.mjs`、`bundle-dsh.mjs` | 上游无对应物；`resources/` 是构建输入，不入库 |
| DSH profile bundle 安装 | `server/internal/daemon/config.go`（`DshProfileBundleDir`、`MULTICA_DSH_PROFILE_BUNDLE`）、`daemon.go`（`dshStartupInstallOnly`） | 零 CLI 启动的唯一例外路径 |
| DSH 运行时收口 | `server/pkg/agent/dsh.go`（`DshProviderID`、`DshDefaultModelID`、`MULTICA_DEFAULT_DSH_MODEL`、`DefaultDshModel()`） | `dsh` 后端是 `v0.8.2` 的共同基线，上游也有；我们加的是 provider id / 默认模型常量与环境覆盖（`v0.9.0` 的 dsh.go 里没有这三个符号） |
| 运行时凭证配置器 | `apps/desktop/src/main/runtime-configurator/*` | 写 claude-code / codex 配置、网关凭证、keychain |
| 桌面 daemon 生命周期 | `apps/desktop/src/main/daemon-manager.ts`、`daemon-spawn-env.ts`、`daemon-profile.ts` | 与上游同名文件不同内容 |

## 5. 建议落地顺序（下一轮实施时）

1. `9abc71ae9`（安全，独立）。
2. `606ed4b4e` + `cfcc4d055`（同一次改，避免只吸一半把 local 日志删掉）。
3. `ee7416bbf` + `d13fd90a3`（repo checkout 正确性，同一片代码）。
4. `eef8f937e` + `90d5d6da6`（各 3 文件内）。
5. `c575443bb` + `1a9ddcf8f`（brief 文案 + 断言，一次改完）。
6. 其余（Environments / droid / amp / 对应文档）登记为「产品方向待定」，不在本轮同步范围内。

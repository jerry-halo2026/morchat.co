---
purpose: 上游 v0.9.0 采纳清单：四份调研的合并判决、批次、冲突与需裁决项
owner: lead
status: current
updated: 2026-11-13
related:
  - docs/upstream/research/0.9.0/r1-permissions.md
  - docs/upstream/research/0.9.0/r2-workflows.md
  - docs/upstream/research/0.9.0/r3-runtime.md
  - docs/upstream/research/0.9.0/r4-frontend-infra.md
  - docs/upstream/SEAMS.md
---

# 0.9.0 采纳矩阵

基线：merge-base `v0.8.2`（b7f8efca），上游 `v0.9.0`（8cd8a2db9），区间 162 个提交。
原则：**上游更好就用上游**；判决只有四种——用上游 / 上游+小补 / 保留我方 / 忽略。

## 0. 三条横向约束（先看）

1. **迁移号全部相撞**：上游 0.9.0 用 637–656，我们已用 637–652（637 knowledge、645–650 组织、651/652 审阅）。
   任何带 DDL 的上游提交**必须重编号到 653+**，并在 `cmd/migrate` 登记并发索引清理。当前下一个可用号：**653**。
2. **四个命门文件**：`packages/core/api/client.ts`、`server/cmd/server/router.go`、
   `server/internal/handler/config.go`、`apps/desktop/src/main/index.ts`。碰这四处的批次**不得并行**。
3. **locale 不能整目录取上游**：我方 131 个 locale 文件有改动（+3662/−828），上游 130 个（+4377/−2262）。
   每个前端提交的文案手工拼，或用 key 级合并。

## 1. 批次 A：权限与安全（必吸，先做）

| 提交 | 内容 | 判决 | 落地要点 |
|---|---|---|---|
| `984c2145a` | 私有项目的**间接**引用（重复目标、移动锚点、表格父标题、附件认领、label 计数、订阅列表、source context、搜索索引、触发预览、视图偏好、收件箱项） | 用上游 | 8 处 import 冲突；保留 `issue.go` 里我们的部门收件箱块 |
| `c3a9d8fd1` | 后台运行与工作区级读（wakeup 守卫、dashboard、pin、搜索索引清单、daemon 回收、realtime 受众） | 用上游 | 一个 hunk 依赖 `b57d74717`（不在本批），需连带或手挪 |
| `018107609` | 任务先解析到它读的项目（新 `projectaccess/task.go`、`requireTaskVisible`、`redactHiddenProjectTasks`） | 用上游 | 新文件 + 新查询 → `make sqlc` |
| `6ccbdd178` | autopilot 归属私有项目 | 用上游 | **派发 skip 语义待裁决**（见 §5.1） |
| `61f84be54` | 私有子任务不计入进度 | 用上游 | 零冲突，1 SQL |
| `e692d03e2` | 私有 issue 排除出 wakeup 列表 | 用上游 | 零冲突 |
| `9abc71ae9` | daemon-token 请求清 `X-User-ID` | 用上游 | **零冲突**，6 行 |
| `31f27f16a` | 非三段式 JWT 不做 session 续期 | 用上游 | **零冲突**，文件与我们相同 |

验证：`go test ./internal/handler -run 'Private|Scope'`、`./internal/projectaccess/...`、`go test ./cmd/server -run Private`；`e2e/presets.spec.ts` 私密断言；`go vet`。

## 2. 批次 B：daemon 与运行时（必吸）

| 提交 | 内容 | 判决 |
|---|---|---|
| `606ed4b4e` + `cfcc4d055` | 已完成任务环境 TTL 统一 14d + 回收 Codex 缓存/local task home | 必吸（**必须一起**，否则只吸一半会删日志；我们 `config.go` 仍是 Cloud/SelfHost 双默认，自托管=永不回收） |
| `ee7416bbf` + `d13fd90a3` | checkout 复用/拒绝同名、同仓库多 URL 命中 | 必吸 |
| `eef8f937e` | mise shim 入口名保留 | 必吸 |
| `90d5d6da6` | darwin 进程组排空期容忍 EPERM | 吸（我们发 macOS 包） |
| `c575443bb` / `1a9ddcf8f` | brief 文案矛盾、禁共享 git stash | 吸（纯文案 + 断言） |

验证：`go test ./internal/daemon/... ./pkg/agent/...`。

## 3. 批次 C：基础设施（必吸）

| 提交 | 内容 | 落地要点 |
|---|---|---|
| `f20ad33dd` | 显式配置的 DB 不可用 → 测试失败 | 我们的 `handler_test.go:44-60` 与 patch 前逐字相同；优先做，止住"静默跳过" |
| `b7d216927` | Go 工具链 1.27.4 | 我们 5 处仍钉 1.27.3；先升本机与工作流 |
| `2cf852e`、`3da2cf8` | 测试/脚本稳定性 | 低冲突 |
| `603156f` 的 `codex.go` 6 行 | 真 bug 修复 | 只取这段 |

## 4. 批次 D：前端可选（按值/风险排序）

| 提交 | 判决 | 备注 |
|---|---|---|
| `4dc251a47` inbox 删除确认 | 吸 | 新端点、无迁移 |
| `bd96495d7` Agent Idle 筛选 | 吸 | 互斥逻辑要看持久化合并 |
| `7cae26303` workflow flow panel | **先裁决再吸** | 部门负责人可切换工作流但不能建状态（§5.2） |
| `a0371ab2c` + `e6c3ef3d8` requester | 上游+小补 | 需迁移重编号到 653；我们的代建路径要补 requester |
| `940d9ed` 删死代码 | 吸 | 被删文件本仓无生产引用 |
| `d1217a1` chat controller | 吸 | 净删 614 行，本地漂移纯改名 |
| `08fafbb`/`848d71a`/`cc32b86` 主题 | 客户端可吸、**registry 保留我方** | 上游 registry 写死 `multica-ai/multica-themes`，默认开关保持 off |
| `52adf83`/`8bf95ff` dev toolbar | 吸 | dev-only |
| `aa11299` 底栏 + quick chat | **忽略** | 品牌冲突最高（"Ask Multica"+星标），要动主题锚点与 8 语言布局 |

## 5. 需要裁决的三项

1. **autopilot 派发 skip 语义**（`6ccbdd178`）：绑定私有项目的 autopilot 在项目外触发时，拒绝还是静默跳过并记日志？建议**拒绝并返回明确错误**，避免"看起来在跑实际没跑"。
2. **flow panel 与建状态权限**（`7cae26303`）：部门负责人是 member + 项目 lead，能切工作流却建不了状态 → 带新列的工作流落不下去。二选一：**下放"建状态"给项目 lead**，或**部门收件箱预置标准状态**。
3. **`4e457b406` 我的 agent 的活**：它把侧栏全改走 table query、部门可见性压到单端点，属于设计改动，建议**先设计后吸**，不并入本轮。

## 6. 明确忽略（记录理由）

- Environments 三件（`079ec9f`/`293b760`/`30f2731`）：产品方向，且落在我们重写过的主进程上。
- 新 harness（Factory Droid / Amp）：要以我们自己的 provider 注册面重做，先记需求。
- 社区主题服务端 registry：写死上游仓库，保留我方开关。
- 底栏 + quick chat：品牌与布局冲突。
- 上游三个 revert：本就不 pick。

## 7. 执行顺序

```
A0（零冲突先行）：9abc71ae9 + 31f27f16a + f20ad33dd   ← 本轮先落，验证机制
A1：984c2145a + 61f84be54 + e692d03e2
A2：c3a9d8fd1 + 018107609（含 sqlc）
A3：6ccbdd178（裁决后）
B：daemon 批次（可并行准备，串行合并）
C：基础设施（f20ad33dd 已在 A0；Go 版本单独）
D：前端逐条，命门文件不并行
```

每批：pick → 冲突按"上游逻辑 + 补回部门字段"解 → `make sqlc`（如有）→ 定向测试 → `merge --no-ff`。

---
purpose: "首启运行时状态的可读指引：把 daemon 的 dsh_profile reason 变成两种可读提示 + 可复制命令，八语言同步"
owner: task-owners
status: current
updated: 2026-11-11
related:
  - docs/tasks/DSH-PROFILE-BUNDLE.md
  - docs/tasks/CLEAN-INSTALL.md
  - docs/tasks/LOCAL-DSH-ACCOUNT-CONNECTION.md
---

# 首启运行时指引：两种状态、可读提示、可复制命令（W2-AG5）

基线 `main` @ `a53fc38b1`，工作树干净起步。**未 commit**。

## 结论

- 入口只有一个：**运行时详情页** `packages/views/runtimes/components/runtime-detail.tsx`。这是单个运行时被用户真正"看见"的地方（列表行只放得下状态短词，详情页才是排查现场：设备、守护进程、并发、可见性都在这里）。列表 `runtime-list.tsx` 保持原样，未改一个字。
- 数据来源不是新增接口：daemon 早已把原因写进 `runtime.metadata.offline_reason = { code, detail, repair, installing }`（`server/internal/daemon/client.go: RuntimeOfflineReason` → `server/pkg/db/queries/runtime.sql` 的 `setAgentRuntimeOfflineWithReason`）。前端只是第一次真的把它翻译出来。
- 两种状态共用同一个 `code: "dsh_profile"`（守护进程目前没有独立登录码），所以**区分靠 `detail` 文本**，不靠 code：登录类标记优先，其次 code = `dsh_profile`，再次 `detail` 里的 profile / not installed 一类措辞。识别不出的 reason（例如 `not_executable`）返回 `null`，页面维持原有状态显示——不编造建议。

## 改动

| 文件 | 改动 |
| --- | --- |
| `packages/views/runtimes/components/runtime-offline-guidance.ts`（新增） | 纯映射：`parseRuntimeOfflineReason`（防御式读 metadata）、`classifyRuntimeOfflineReason`（code + detail → 状态）、`runtimeOfflineGuidance`（runtime → `{ kind, detail, command }`）；两个常量命令。 |
| `packages/views/runtimes/components/runtime-offline-guidance-card.tsx`（新增） | 展示层：标题 + 说明 + 命令行 + 复制按钮（`copyText`，内联 Check 反馈）+ 原始 detail 小字。`section[data-guidance=…]` 带可访问名。 |
| `packages/views/runtimes/components/runtime-detail.tsx` | 只加三行：导入、`const offlineGuidance = runtimeOfflineGuidance(runtime)`、`ObjectIdentity` 之后渲染卡片。 |
| `packages/views/locales/*/runtimes.json`（8 语言） | 新增 `offline_guidance.*` 命名空间。 |
| `packages/views/runtimes/components/runtime-offline-guidance.test.ts`（新增） | 12 个纯逻辑用例。 |
| `packages/views/runtimes/components/runtime-detail-guidance.test.tsx`（新增） | 4 个渲染用例：两种状态 + 未知 reason 兜底 + 在线残留 reason 不出卡片。 |
| `docs/brand/reference/runtime-guidance/*.txt`（新增） | 两种状态的真实渲染文本快照（从 vitest 的 `textContent` 摘取）。 |

## 两种状态与文案

1. **内置桥接缺失**（`code: dsh_profile`，或 detail 含 profile / not installed）
   - 提示："内置运行时桥接缺失" → 升级客户端，或把桥接装进 DSH 的 multica 配置后重启客户端。
   - 命令：`dsh plugin --profile multica add <bundle>`；`<bundle>` 的含义写在命令下方：应用内 `resources/dsh-profile/package` 目录，或 `@multica-ai/dsh-runtime` 包名 / tarball。
   - 因为安装包内 bundle 的绝对路径逐机不同，命令里保留占位符而不是塞一个会骗人的绝对路径。
2. **未登录 DSH**（detail 含 login / log in / sign in / not authenticated / api key 等）
   - 提示："DeepSeek Harness 尚未登录" → 在本机登录后重启客户端。
   - 命令：`dsh --version`（自查 CLI 本身能不能跑起来）。
   - 该状态不出现 `<bundle>` 说明——没有东西要装。

`installing: true`（守护进程正在自己装 bundle）一律不出卡片：此时让人手工装会和正在进行的自动修复互相打脸。在线运行时也不出卡片，避免旧 reason 复活。

## 验证（真跑）

```
pnpm --filter @morechat/views typecheck
  → tsc --noEmit，exit 0

pnpm --filter @morechat/views exec vitest run runtimes settings locales --testTimeout=30000
  → Test Files 65 passed (65)
  → Tests     1238 passed (1238)

node scripts/docs-map.mjs --check
  → 181 documents OK (front-matter, links, index, staleness)
```

渲染片段见 `docs/brand/reference/runtime-guidance/profile-missing.txt` 与 `login-required.txt`。

## 边界与后续

- 没有新增接口、没有动 `apps/desktop/**`、`server/**`、`packages/ui/**`。
- 若服务端后续给出独立的登录 reason code（例如 `dsh_login`），只需在 `classifyRuntimeOfflineReason` 里加一条 code → `dsh_login` 的映射，文案与卡片不用改。
- `detail` 目前原样展示在卡片底部（小字），这是给支持排障用的，不是给用户读的主文案。

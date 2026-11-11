---
purpose: 与上游 v0.8.2 的既有差异基线（冻结），作为漂移门禁的起点
owner: lead
status: current
updated: 2026-11-11
related: [docs/upstream/SEAMS.md]
---

# 漂移基线

## 冻结数字（`v0.8.2...HEAD`，2026-11-11）

| 指标 | 数值 |
|---|---|
| 变更文件总数 | **4064** |
| 新增 (A) | 603 |
| 修改 (M) | 3448 |
| 删除 (D) | 13 |
| 其中机械改名（`Multica`→`morechat.co` 层） | 约 **3405** |
| 真实行为改动（估计） | 约 **300** |

## 怎么复现

```bash
git fetch upstream --tags
node scripts/check-upstream-drift.mjs                 # 报告（默认）
node scripts/check-upstream-drift.mjs --strict        # 白名单外有差异则失败
```

## 基线策略

1. 现有 4064 整体视为**已接受的基线**，不要求今天就收进白名单；
2. 此后**只对新增差异**收紧：新出现的、不在 `SEAMS.md` 的改动要在 PR 里解释或撤回；
3. 每次追上游（`v0.8.3`、`v0.9.0` …）时，执行顺序固定：
   `fetch → 建 sync/<tag> → 跑 rename-sweep → 应用 patches/*.patch → check-upstream-drift`；
4. 目标是把"真实改动"从约 300 个文件逐步收敛到 `SEAMS.md` 明确列出的那些。

## 已知的"非改名"差异来源（按目录）

| 区域 | 内容 |
|---|---|
| `server/internal/knowledge`、`server/migrations/637-642` | 知识域 schema、导入流水线、混合检索、CRUD |
| `server/internal/handler/knowledge*`、`runtime_credentials*`、`presets*` | 知识/凭据/预设接口 |
| `packages/views/{knowledge,presets}`、`packages/core/presets` | 知识库六屏、预设画廊与数据源 |
| `packages/ui/lib/agent-bot`、`cap-avatar*` | 包豪斯色板、上游尺寸回滚、grokbot 外壳 |
| `apps/web/features/landing`、`app/(landing)` | 品牌文案、0.1.0 changelog、面板可见性修复 |
| `apps/desktop` | DSH 打包、after-pack、首启注册 |
| `scripts/brand/rename-sweep.mjs` | 唯一改名实现 |
| `packages/qianchuan-sync` | 千川同步包（上游无此目录） |

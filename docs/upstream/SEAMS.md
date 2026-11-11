---
purpose: 与上游允许存在差异的路径白名单（接缝），供 check-upstream-drift 使用
owner: lead
status: current
updated: 2026-11-11
related: [docs/upstream/DRIFT-BASELINE.md, docs/engineering/CONTRACTS.md]
---

# 接缝白名单

`scripts/check-upstream-drift.mjs` 只认本文件里以 `- ` 开头、含 `/` 的路径前缀；
不在白名单里的差异算"未声明漂移"。

## 品牌层（机械改名，可由 scripts/brand/rename-sweep.mjs 重放）

改名层触及每个包，所以下面三条是**范围型**接缝，不代表可以随意改内容：

- `apps/`
- `packages/`
- `server/`

约束：这些目录内的差异必须只来自「改名 + 本文件以下列出的功能接缝」。新增功能改动要先在这里登记。

## 我方能力

- `server/internal/knowledge/`
- `server/internal/handler/knowledge`
- `server/internal/handler/runtime_credentials`
- `server/internal/handler/presets`
- `server/internal/handler/mcp_knowledge`
- `server/migrations/`
- `server/cmd/multica/cmd_knowledge`
- `packages/views/knowledge/`
- `packages/views/presets/`
- `packages/core/presets/`
- `packages/qianchuan-sync/`

## 头像与设计系统

- `packages/ui/lib/agent-bot/`
- `packages/ui/components/common/morechat-mark.tsx`
- `packages/ui/components/common/cap-avatar`
- `packages/ui/lib/avatar-size.ts`
- `testdata/cap-vectors.json`
- `docs/brand/`

## 产品决定

- `apps/web/features/landing/`
- `apps/web/app/(landing)/`
- `packages/views/auth/`
- `packages/views/onboarding/`
- `packages/views/locales/`
- `packages/core/paths/`

## 桌面与部署

- `apps/desktop/`
- `deploy/`
- `scripts/`
- `docs/`
- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `Makefile`

## 工具产物（待清理，不属于产品差异）

- `.mimosa/`
- `.local/`
- `.agents/`

## 维护规则

1. 新增"与上游不同"的目录 → 先加进本文件，再写代码；
2. 每条接缝在 PR 描述里说明理由；
3. 基线冻结期（见 DRIFT-BASELINE.md）只对**新增**差异报警，不回溯历史。

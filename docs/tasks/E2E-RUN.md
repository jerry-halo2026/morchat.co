---
purpose: Playwright 套件在本机的实际运行结论与阻塞点
owner: lead
status: current
updated: 2026-11-11
related: [playwright.config.ts, playwright.edge.config.ts]
---

# E2E 运行记录

## 环境

- Web：本仓库 `apps/web` 的 dev server，`http://localhost:3000`（**必须 localhost**，`127.0.0.1` 会被 Next 16 判为跨源，客户端不 hydrate）
- API：HEAD 构建，`http://127.0.0.1:8080`（`/healthz` 200，`/api/knowledge/spaces` 401 表示路由存在）
- 浏览器：本机 **Chromium 下载卡住**（`ms-playwright/chromium-1208` 停在 0.1MB），改用系统 Edge：`playwright.edge.config.ts`（`channel: "msedge"`）。CI 仍用默认配置。

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  pnpm exec playwright test --config=playwright.edge.config.ts --reporter=line
```

## 首轮结果（`e2e/auth.spec.ts`）

| 用例 | 结果 |
|---|---|
| login page renders correctly | **通过** |
| login and redirect to /issues | 失败：`waitForIssuesPage` 超时（`e2e/helpers.ts:12`） |
| unauthenticated user is redirected to /login | 失败（同上路径） |
| logout redirects to /login | 失败（同上路径） |

## 判断

失败集中在**登录后进入工作区**这一步，`helpers.loginAsDefault` 等待 `/issues` 页面。当前 dev 库没有 E2E 需要的固定账号/工作区/项目 fixture，因此这一批首先归为**环境缺失**，而不是产品缺陷。

要得到可信分类，需要先做种子数据：
1. 用 `e2e` 里的 `TestApiClient` 建账号 + 工作区 + 项目 + issue；
2. 把这个种子步骤做成 `pnpm e2e:seed`（或复用 `scripts/dev-fixtures.mjs`）；
3. 再跑全量 47 个 spec，按「本次引入 / 既有 flake / 环境缺失」分类。

在此之前，**不把 E2E 红当作发布阻塞项**，只作为待补基础设施记录在此。

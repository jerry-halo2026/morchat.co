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

## 第二轮（2026-11-11 夜）：3/4 通过，1 个卡在稳定性

**先修了开发环境的两个真问题**（否则客户端的每个请求都失败）：

1. `.env` 的 `NEXT_PUBLIC_API_URL` 指向 `http://127.0.0.1:8080` → 浏览器跨源、后端无 dev CORS，控制台刷 `Failed to fetch`，`/issues` 渲染空白；
   改为 **同源** `NEXT_PUBLIC_API_URL=`（客户端走相对路径）+ `REMOTE_API_URL=http://127.0.0.1:8080`（Next 侧代理目标），并把 `NEXT_PUBLIC_WS_URL` 指回 3000。
2. `e2e/helpers.ts` 的 `loginAsDefault` 没有 `markUserOnboarded()`，首次用户被送去 onboarding，`/issues` 没有可点元素；已补。

**结果**：`e2e/auth.spec.ts` → **3 passed / 1 failed**。

剩下这个：`logout redirects to /login` 卡在 `openAccountMenu`：
```
waiting for getByRole('navigation', { name: 'App navigation' }).getByRole('button', { name: 'Account' })
locator resolved to <button … aria-label="Account" …>
2 × waiting for element to be visible, enabled and stable
```
按钮能被定位但**始终"不稳定"**。已排除 live 动画（`aoraRendersLive` 要求 `live === true`，rail 走 `md`=24px，且没有任何调用方传 `live`）。候选原因：
1. rail 里 `<img>` 的加载/布局在每次轮询时重新计算；
2. `TooltipHint` 包裹导致的持续 re-render；
3. Next dev 的 dev-tools overlay 叠加。

下一步：把该按钮的 DOM 稳定性用 `page.evaluate` 打印 `getBoundingClientRect()` 连续两帧对比，定位是哪个元素在抖；修完再跑全量 47 个 spec 做三类归因。

**打包端到端仍未做**（Aora engine/react 进 web 产物后需要重量一次桌面体积）。
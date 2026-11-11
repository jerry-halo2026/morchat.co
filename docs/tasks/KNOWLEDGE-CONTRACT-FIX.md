---
purpose: "把知识库与预设画廊的前端改到服务端实际契约上：space_id 路由、列表/单页信封、search hits、catalog 带工作区与鉴权头"
owner: task-owners
status: current
updated: 2026-11-11
related:
  - docs/tasks/UI-VERIFICATION.md
  - docs/tasks/KNOWLEDGE-BENCH.md
  - docs/brand/reference/knowledge-ui/README.md
---
# KNOWLEDGE-CONTRACT-FIX：以服务端为唯一契约的前端适配（AG-7）

执行时间 2026-11-11 15:15–15:50（Asia/Shanghai）。仓库 `D:\dev\morchat.co`，main，HEAD `2ebb9659d`，未 commit。
写域：`packages/views/knowledge/**`、`packages/core/presets/**`、`packages/views/presets/**`（请求层与一处离线标记）、`docs/tasks/KNOWLEDGE-CONTRACT-FIX.md`。

## 0. 结论

| 契约不符 | 处理 | 证据 |
| --- | --- | --- |
| 树/面包屑读 `space.slug`（服务端无 slug） | 空间一律用 `space.id`；路由段是 id，面包屑显示 `name` | 树里 5 条链接全部为 `/b1-knowledge/knowledge/26f90292…/…`，`undefined` 链接 0 条 |
| `getPage` 发 `?space=<slug>&path=` 并把列表信封当单页 | `getPage` 用 `space_id` 列空间页 → 按 `path` 精确匹配 → `GET /pages/{id}` 取正文；信封不是单页对象时返回 `null` 并 `console.warn`，不崩 | S2 渲染标题/正文；请求序列 `pages?space_id=…&q=verify-item` → `pages/a8beb5d7…`（均 200） |
| mention picker 读 `/search` 的 `pages`（实际是 `hits`） | `search()` 同时取 `hits`（`/search`）与 `pages`（`/pages?q=`）；picker 的 chip 用页面级结果（可寻址），无页面时回落 `hits`（`item_id#vN`） | 输入 `@retrie`：`pages?q=retrie` 200 + `search?q=retrie` 200，chip 插入为 `Retrieval design v1` |
| `loadCatalog` 代理未带工作区 → 400，raw 成唯一路径 | 代理请求带 `Authorization` + `X-Workspace-ID`（与 `packages/core/api` 的 `authHeaders()` 同源）；代理失败才回落 raw，并标 `indexSource: "upstream"` | `GET /api/presets/catalog → 200`；画廊正常渲染 73 张卡；无 degraded 提示 |

顺手对齐：`score_threshold: 0` 不再当“不限”发出（服务端把 0 当默认 0.2），前端改发 `0.01`，召回面板在阈值旁标 `0 → 0.20`。

## 1. 改动

### 1.1 数据层 `packages/views/knowledge/data/knowledge-api.ts`

- 新增 wire 类型（服务端 snake_case 原样）与 mapper：`Space`、`PageSummary`、`Page`、`Item`、`Hit`。视图类型只由这一处产生，服务端不加别名。
- `listSpaces` → `{spaces:[…]}`，映射 `{id,name,description,item_count}`，不再有 `slug`。
- `listPages` → `space_id`/`q`/`project_id`（服务端暂不认 project_id，原样透传），只读 `pages`。
- `getPage(wsId, spaceId, path)`：列表 → 路径精确匹配（`normalizeWikiPath` 去首尾斜杠）→ 单页。列表信封出现在详情路由、或没有匹配路径时，各记一条 `[knowledge] …` warn 并返回 `null`。
- `createPage` → `POST /pages`（body `space_id/path/title/content`）读 `{page}`；`savePage` → `PUT /pages/{id}`（`content/base_revision`）读 `{revision,page}`。
- `listItems` → 读 `items`；`updateItem` → `PATCH /items/{id}`（归档即 `{"status":"archived"}`，服务端无 DELETE）。状态/类型做双向映射：服务端 `draft|active|deprecated` ↔ 产品四段 `draft|review|approved`（`archive` 单独）。
- `searchHits` 读 `hits`（`item_id/title/chunk_id/revision/score`）；`searchPages` 读 `pages`；`search` 并发取两者，任一端失败只让那一半为空。
- `retrievalTest`：`threshold <= 0` 时发 `RETRIEVAL_MIN_THRESHOLD`（0.01），不再发 0；导出 `RETRIEVAL_DEFAULT_THRESHOLD = 0.2`。

### 1.2 组件层

- `knowledge-parts.tsx`：空间切换器按 `id` 找/选，`activeSpace` 为空时落到第一个空间（条目页无空间段）。
- `knowledge-home-page.tsx`、`import-drawer.tsx`、`knowledge-items-page.tsx`：`slug` → `id`；`createPage`/`startImport` 传 `space_id`。
- `knowledge-reader-page.tsx`：面包屑用 `useKnowledgeSpaceName(wsId, space)` 显示空间名（路由段仍是 id）。
- `knowledge-editor-page.tsx`：保存带 `page_id`（`page.id`）+ `content`，无页面时禁用保存。
- `knowledge-mention-card.tsx`：`#vN` 从 ref 尾部读取，命中 chip（无页面地址）也显示钉住的版本。
- `retrieval-test-page.tsx`：阈值默认值即 `0.2`，并在输入框旁标 `0 → 0.20`。
- `packages/core/presets/source.ts`：代理请求带 `Authorization`/`X-Workspace-ID`；`indexSource: "proxy" | "upstream" | "bundled"` 记录索引来源，`degraded` 仅用于 bundled。
- `packages/views/presets/components/presets-page.tsx`：`indexSource === "upstream"` 时用同一行 `role="status"` 标出“这份索引来自内容仓”（复用 `page.catalog_error_hint`，不新增文案）。

## 2. 验证（真跑）

```
pnpm --filter @morechat/views typecheck            → 0
pnpm --filter @morechat/web typecheck              → 0
pnpm --filter @morechat/core exec vitest run presets → 8 passed (1 file)
pnpm --filter @morechat/views exec vitest run knowledge presets --testTimeout=30000
                                                  → Test Files 11 passed, Tests 83 passed
```

新增/改写的单测：

- `knowledge/lib/knowledge-api.test.ts`（9）：spaces 无 slug；`getPage` 先 `space_id` 列表再按 id 取单页（断言请求里没有 `space=`/`path=`）；列表无匹配 → `null` + warn；详情路由回列表信封 → `null` + warn；`search` 读 `hits` 与 `pages`；`threshold: 0` 发 0.01。
- `knowledge/components/knowledge-space-links.test.tsx`（4）：空间链接/下拉值/回退/树链接全用 id，无 `undefined`。
- `knowledge/components/knowledge-mention.test.tsx`（+2）：`hits → chip`（`item_id#vN`、无标题回落 id）；命中 chip 渲染标签与版本、不生成链接。
- `packages/core/presets/source.test.ts`（+1，改 2）：代理请求带 `X-Workspace-ID`；raw 回落标 `upstream`；bundled 标 `bundled`。
- `packages/views/presets/lib/offline-render.test.tsx`（+1）：仅 raw 可用时页面出现 `data-preset-index="upstream"` 的离线索引提示。

## 3. 浏览器实测（localhost:3001，Playwright + 本机 Chrome）

**注意**：`localhost:3000` 上跑的是另一个 worktree（`E:\CodexData\worktrees\r1-02b-claim-pin`）的 next dev，代码不是 HEAD，用它验收会看到旧行为（`space.slug` 的重复 key 警告、`undefined` 链接）。本轮自起 `localhost:3001`（`apps/web/scripts/dev-server.mjs`，`FRONTEND_PORT=3001`），会话用 `localStorage["multica_token"]`。

| 项 | 结果 |
| --- | --- |
| S2 阅读 | `GET /pages?space_id=26f90292…&q=verify-item → 200`、`GET /pages/a8beb5d7… → 200`；标题 `Verify item`、正文渲染、右侧属性面板正常；截图 `s2-reader.png` |
| S3 编辑 | 编辑器载入同一正文；点“保存为 v2” → `PUT /pages/a8beb5d7… → 200`，徽标变“基于 v2”，服务端 `revision=2`；截图 `s3-edit.png` |
| 空间树链接 | 5 条链接全为 `/b1-knowledge/knowledge/26f90292-1211-4e33-ac52-d647d93928a1/…`，`undefined` 计数 0；React 重复 key 警告消失 |
| Issue `@` chip | 输入 `@retrie` → 弹出 `Retrieval design`（Knowledge 组）→ 选中后描述里出现 chip，文本 `Retrieval designv1`（标签 + `v1`），href `/b1-knowledge/knowledge/26f90292…/decisions/retrieval`；截图 `s7-issue-mention.png` |
| 预设画廊 | `GET /api/presets/catalog → 200`，索引走代理；`raw.githubusercontent.com/index.json` 请求 0 条；画廊无离线提示；截图 `s8-presets.png` |

剩余 raw 请求：选中包里 `presets/agent/ai-engineer.preset.json`、`catalog/packages/agent/ai-engineer/plugin.json` 仍直连内容仓——服务端只为 index.json 提供代理（`server/internal/handler/presets.go`），详情/技能文档没有对应路由，属本轮范围外。控制台另有 `ws://localhost:3001/ws … 403`，为本地 WS 握手环境问题，与本次改动无关。

## 4. 已知边界

- 条目状态是双向有损映射：服务端只有 `draft|active|deprecated`，产品的 `review` 写回为 `draft`，`active` 读成 `approved`。要消除这层映射需要服务端补状态或产品改四段流程。
- 服务端页面列表没有 `project_id`，项目「资料」页的按项目过滤仍拿不到服务端支持（参数原样透传，等列出现即生效）。
- `packages/views/locales/**` 不在本轮写域：`presets.page.offline` 文案仍写“已显示内置清单”，只在 bundled 时出现，未改。
- 触及文件里仍有 4 条既有 lint error（`knowledge-home-page.tsx` 的 `placeholder` 字面量、`knowledge-mention.test.tsx` 两条 `ref` 字符串、`use-knowledge-href.ts` 的 hooks 规则），均非本轮引入。

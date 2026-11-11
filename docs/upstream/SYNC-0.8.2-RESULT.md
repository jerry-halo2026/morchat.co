---
purpose: "multica v0.8.2 同步的执行记录：提交序列、迁移重编号、冲突决定、未合并项与验证输出"
owner: u2-sync
status: current
updated: 2026-11-10
related:
  - docs/upstream/README.md
---

# v0.8.2 同步结果（U2 执行）

## 0. 结论

- 基点：上游 `v0.8.2 = b7f8efcaae6c5f3273c0038252b5d10c81b41068`，新建独立工作树
  `E:\CodexData\worktrees\sync-0.8.2`（分支 `sync/0.8.2`），**主工作树零改动**。
- 路线按 U1 方案：以 tag 为基点 → **重跑改名层**（不重放 `55eb2de`）→
  重放四条功能提交 → 迁移整体平移 → 上游落地页 + 一次品牌 pass。
- 结果：8 个提交，`go build`、三包 typecheck、knowledge/gateway 测试、
  `docs-map`、`check-brand-strings`、`compose config` 全绿。未 push。

## 1. 提交序列

| # | commit | 说明 |
| --- | --- | --- |
| 1 | `6025273` | refactor(brand): reapply the rename layer on v0.8.2（脚本重跑 3405 文件） |
| 2 | `7eea033` | feat(knowledge)（cherry-pick `fd2cfa9`） |
| 3 | `d9248cf` | chore(db): move the knowledge migrations to 637-640 |
| 4 | `a00a9da` | feat(desktop)（cherry-pick `eea5fc8`） |
| 5 | `3590cc4` | docs, deploy（cherry-pick `5575372`，75 处 docs 冲突取我方） |
| 6 | `43f00f1` | feat(web): login stage + handoff（cherry-pick `bb96d2c`） |
| 7 | `5916bec` | fix(brand): keep swept identifiers PascalCase |
| 8 | `daa285a` | chore(sync): carry the assets the replayed commits depend on |
| 9 | `f20aacc` | feat(web): brand the upstream landing and make Chinese the first language |

主仓只做了 `git remote add upstream` + `git fetch upstream tag v0.8.2`（写 `.git`，不动工作树）。

## 2. 取用的上游内容

- 全量 `v0.8.2`（`164290ee1..v0.8.2` 共 120 commit / 1143 文件）作为新基点，
  **没有 merge**：工作树从 tag 直接建出，我们这一侧全部以"重跑 + 重放"重新生成。
- 上游新增域全部接收：Connected Apps v2、项目可见性与成员、issue environments、
  star prompt、俄语、fumadocs 文档站、`scripts/brand/`、`localenv`。

## 3. 迁移编号

上游 `server/migrations` 最大编号 = **636**（617–636 属上游），故 `NEXT = 637`：

| 旧 | 新 | 主题 |
| --- | --- | --- |
| 620 | **637** | `wiki_knowledge` |
| 621 | **638** | `knowledge_items_space` |
| 622 | **639** | `gateway_credentials` |
| 623 | **640** | `knowledge_space_fk_tighten` |

- 文件名、`migration_620_test.go → migration_637_test.go`、`migration_623_test.go →
  migration_640_test.go`、测试名、SQL 注释、store/types 里"since migration 621/623"
  的注释全部同步。
- **SQL 对象名不跟着改**：`knowledge_pages_workspace_space_id_621_key` 这类约束名
  已在开发库存在，是历史标签而非版本号。
- 新发现一个真依赖：wiki 表的 project/issue 回链用 `(workspace_id, id)`，这个唯一键
  是 ACL 轮（617）建的，本次没有重放。**637 现在自己在"拥有该表权限"时补建这两个键，
  见到重复则跳过，权限不足（fail-soft 测试用受限角色跑迁移）则放行**，于是
  "只有上游 tag 的空库"也能一路迁移到底。

## 4. 冲突与决定（逐文件）

| 文件 / 组 | 决定 | 理由 |
| --- | --- | --- |
| `packages/views/auth/**`（login-page、login-handoff.css、use-logout…） | 取我方 | operator 决定：登录舞台保留；上游 0.8.2 未改这些文件 |
| `apps/web/app/(auth)/login/**`、`onboarding/page.tsx`、`features/auth/login-handoff.ts` | 取我方 | 同上；上游 0.8.2 未触碰 `app/(auth)` |
| `packages/views/onboarding/steps/step-welcome.tsx` | 取我方 | 上游 0.8.2 对该文件的改动只有"星形组件替换 + 高度类"，我方版本已等价覆盖 |
| `packages/views/onboarding/onboarding-flow.tsx`、`step-welcome.test.tsx` | 取我方 | 补 `enteringFromLogin` 通道，上游未改 |
| `docs/**`（75 个 modify/delete 冲突） | 取我方 | 上游 0.8.2 删掉旧 `docs/`（迁到 fumadocs），我们的项目文档要保留 |
| `docs/theming.md`（上游新增） | 补 front-matter | `docs-map --check` 要求 `docs/**.md` 首部有元数据 |
| `packages/views/locales/index.ts` | 上游 0.8.2 + 加 `presets` 命名空间 | 上游新增 `ru`，整取我方会丢俄语 |
| `packages/core/api/client.ts` | 上游 0.8.2 + 我方 `getSupabaseConfig`/`loginWithPassword` | 我方旧 client 早于 Apps/AppCatalog/IssueEnvironments |
| `packages/core/auth/store.ts`、`api/supabase-password.*`、`locales/*/auth.json` | 取我方 | 上游 0.8.2 未改这些文件，我方是纯增量 |
| `packages/ui/lib/agent-bot/**`、`cap-avatar*`、`avatar-size.ts`、`testdata/cap-vectors.json` | 取我方 | 知识预设页依赖生成式头像引擎 |
| `multica-{icon,graphics,wordmark}.tsx`、`lib/multica-brand.ts` | 删除，换 `morechat-*` | 我方 logo 是三根橙柱，不是星形 |
| `LICENSE`、`NOTICE`、`Dockerfile*` 的 `COPY LICENSE NOTICE` | 保持删除 | 与我方分支一致 |
| `.github/workflows/ci.yml`、`apps/mobile/AGENTS.md` | 保持删除 | 我方分支的既定删除 |
| `apps/web/features/landing/**`、`app/(landing)/**` | 取上游 + 品牌 pass | operator 修订：直接用 0.8.2 的落地页 |
| `apps/web/app/(landing)/contact-sales/**`、`contact-sales-page-client.tsx` | 删除 | 不做联系商务 |

改名层本身不是纯机械：`@multica/` 作用域、Go module、四类品牌串之外，
`Multica` 粘在标识符上的一律转 `Morechat`（`MorechatPluginError` 这类），
只有独立出现才转 `morechat.co`；合成器 `scripts/brand/rename-sweep.mjs` 已跳过自身
（第一版把规则表也改名了，第二次运行才会暴露——这是下次同步要记住的坑）。

## 5. 未合并项与原因

1. **617–619 不在这批 cherry-pick 里**（`r1_acl_nm02`、`supabase_identity`、
   `r1_native_creation`）。它们是更早的提交，本次只重放四个功能提交。
   下次重放这三个提交时：迁移应顺延到 **641–643**，并且 617 里的
   `ALTER TABLE project ADD CONSTRAINT ... UNIQUE` 要改成条件添加，否则会与 637 撞号。
2. **`composio-tab` 跟随上游下线**：未执行——上游已删除该文件，而我们对应的代码
   提交也没重放，待该提交重放时一并删除 i18n 键。
3. **落地页 footer 的 halftone 动画丢弃**：上游那套"星形风车 + 服务器计数"挂在
   星形几何上，我方 mark 没有星，故 footer 只渲染排版字标；`/api/site/star*` 接口保留未用。
4. **联系商务的表单文案**仍留在四个字典（`contactSales` 块），已无路由/入口引用，
   留待下一次文案清理一并删除。
5. `apps/web/features/landing/site/demo/*` 的动画组件保留：首页首屏换成我们的
   `landing-hero-v7.webp`，但其他页面仍引用其中若干部件。
6. `docs/**` 里仍出现 `Multica`：品牌门禁对 `docs/` 放行（provenance 记录必须保留原名）。

## 6. 落地页品牌 pass（operator 七条）

| 项 | 落地 |
| --- | --- |
| 品牌 | header/footer 用 `MorechatLockup`（三根橙柱 + 李陌茶）；文案 `Multica` → `morechat.co`/`李陌茶` |
| 删除联系商务 | 路由、组件、页脚与 sitemap 入口、导航键、定价 CTA、两处 CTA band 全删；文案里的旧链接改指飞书 |
| 删除 X/GitHub/Discord | header 的 GitHub star 与 footer 的三个社交图标全删 |
| 中文优先 | 根路径 = 中文，英文移到 `/en`；proxy、locale-path、locale context 同步；`hreflang`/`x-default` 指向中文 URL |
| `/changelog` 从 0.1.0 | 四个字典各留一条 0.1.0 发布记录，删掉上游 140 条历史 |
| `/privacy` 占位 | 重写为占位说明（上游正文写的是另一家公司的主体，不能沿用） |
| 文档入口 → 飞书 | `lib/docs-href.ts` 全部语言指向飞书知识库 |
| 首屏图 | `apps/web/public/images/landing-hero-v7.webp`（从主仓拷入），替换上游动画 demo |

## 7. 验证输出摘要

全部在 `E:\CodexData\worktrees\sync-0.8.2` 内真跑（Go 用 `golang:1.26` 容器 + 临时
`pgvector/pgvector:pg17` 数据库，`DATABASE_URL` 指向它；容器只为跑测试，未进仓库）：

```
# Go（server/）
go build ./...                                  -> BUILD_OK
go vet ./internal/...                           -> 无输出（VET_DONE）
go test ./internal/knowledge/... ./internal/gateway/... -count=1
  ok  .../internal/knowledge   0.736s
  ok  .../internal/gateway     0.016s

# 空库迁移（临时 pgvector:pg17）
go run ./cmd/migrate up                         -> 001–640 全部应用，Done.
  （637 补建 project/issue 唯一键；638 报告补 unique 约束；640 预检 0 行冲突）

# 前端
pnpm --filter @morechat/{ui,views,web} typecheck  -> 三包 Done
pnpm --filter @morechat/views exec vitest run auth onboarding issues knowledge --testTimeout=30000
  -> Test Files 155 passed / Tests 1880 passed（90.8s）
pnpm --filter @morechat/web exec vitest run lib/landing-locale-path.test.ts proxy.test.ts
  -> Tests 72 passed

# 门禁
node scripts/docs-map.mjs --check               -> 155 documents OK
node scripts/check-brand-strings.mjs            -> TOTAL remaining: 0（allowed 721）
docker compose -f deploy/quickstart/docker-compose.yml --env-file deploy/quickstart/.env.example config -q
                                                -> exit 0
```

## 8. 接下来该谁做什么

| 谁 | 做什么 |
| --- | --- |
| operator | ① 决定 `sync/0.8.2` 何时接管 `codex/round1-continuous`（主工作树仍有未提交的落地页改动，需先处置）；② 确认是否 push |
| 同步执行者（下一轮） | 重放剩余语义提交（ACL / Supabase / native creation / GitHub UI 清理等），迁移按 641 起顺延；重放 617 时把唯一键改成条件添加 |
| landing owner | `contactSales` 死文案清理；`/api/site/star*` 若要保留动画，需要先有星形几何 |
| schema owner | 在空库上跑一遍 `migrate up`（本次已在临时 pgvector:pg17 上验证 001–640） |
| B01（权限） | 复核 637 里补建 project/issue 唯一键的守卫，以及 `auth.go`/`router.go` 未来合并时的安全语义 |

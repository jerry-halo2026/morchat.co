---
purpose: 哪些代码是我们加的（产品层），哪些是 multica 上游（平台层），以及两者怎么共存
owner: lead
status: current
updated: 2026-11-19
related: [docs/engineering/COLLAB-MODEL.md, docs/engineering/WORKBENCH-API.md, docs/ARCHITECTURE.md]
---

# 产品层与平台层

morechat = multica 平台 + 我们的产品层。这份文档只回答一件事：**一处改动属于哪一层，以及产品层改动落在哪里**。上游同步、冲突排查、权限评审都以它为准。

## 1. 判定顺序

一处改动属于**平台层**，如果它同时满足：对所有工作区一致、与任何一个部门的业务无关、去掉它 multica 仍然是 multica。
否则属于**产品层**。

拿不准时按产品层处理，并在这里登记。

## 2. 产品层触点清单（新增必须先登记）

### 数据库

- **产品迁移号段**：`server/migrations/660_*` 起。平台段是 001–659，两边不交叉。
- **产品表**：`creator*`、`crm_*`、`media_*`、`goal_*`、`market_signal`、`affiliate_*`、`hr_*`、`qianchuan_*`、`workbench_role_template`。
- **共用表上的产品列**：`creator_post.media_script_id`、`crm_collab.publish_url/settled_on`、`issue.origin_type` 的枚举值、`activity_log.subject_type/subject_id`（见 COLLAB-MODEL）。

### 后端

- `server/internal/handler/workbench_*.go`（全部）
- `server/internal/handler/mcp_workbench.go` 的台账域与写工具
- `server/cmd/orange-sync/`、`server/cmd/qianchuan-sync/`
- `server/pkg/orange/`、`server/pkg/qianchuan/`
- 平台文件的改动必须最小且可枚举：`router.go` 里只加 `/api/workbench/**` 的分组、`workspace_delete.sql` 里只加产品表、`search*.go` 里只加 kind 分支。

### 前端

- `packages/core/{bd,crm,creator,media,goal,affiliate,guide,hr}/`
- `packages/core/paths` 里四个空间的注册点（`HR_PAGES`/`SALES_PAGES`/`CONTENT_PAGES`/`BOSS_PAGES` + `paths.workspace().{hr,sales,content,boss}`）
- `packages/views/{hr,sales,content,boss}/`
- `apps/web/app/[workspaceSlug]/(dashboard)/{hr,sales,content,boss}/`
- locale 命名空间 `hr|sales|content|production|publishing|discovery|boss|biz|performance`

### 文档

`docs/engineering/WORKBENCH-*.md`、`ORANGE-SYNC.md`、`COLLAB-MODEL.md`、本文件。

## 3. 与上游共存的三条规矩

1. **不为了让产品跑通而改平台语义**。平台文件里只允许"加"，不允许"改语义"。真需要改，先记进 `docs/engineering/PLATFORM-PATCHES.md` 的清单（一处一行：文件、为什么、能否上游化）。
2. **每个产品迁移必须能独立 down**，且不依赖平台表结构之外的东西。
3. **产品层不新增外键**（仓库规则），关系在应用层解析。

## 4. 已知的平台侧修补（历史账）

这些是已经改在本地平台文件上的东西，供 rebase 时对照：

| 文件 | 改动 | 能否上游化 |
| --- | --- | --- |
| `server/pkg/db/queries/*.sql`（15 个文件、112 处） | jsonb 参数改 `::text::jsonb` + Go `string` | 能，且应该 |
| `server/internal/handler/workspace_delete*` | 补 knowledge 家族与 `gateway_credentials` 的 teardown | 能，且应该 |
| `packages/core/workspace/avatar-url.ts` | 无 avatar 时不取 base URL | 能 |
| `packages/ui/icons/*` | 重新生成（CRLF 漂移） | 不适用（生成物） |
| `.gitattributes` | 内建 skill 钉 LF | 能 |

## 5. 产品层体检

`scripts/product-layer-report.mjs`（待建）：输出上表 + 当前产品层文件清单与最近改动，rebase 前跑一次，避免"改了什么说不清"。

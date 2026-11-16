---
purpose: B0（达人商务）的服务端契约：表、迁移号段、REST、事件、query key、UI 归属
owner: lead
status: current
updated: 2026-11-16
related: [docs/METRICS.md, docs/engineering/ORG-MODEL.md]
---

# 达人商务 B0 契约（并行施工的唯一接口约定）

三个并行代理共用本文件。**任何与本文件不一致的实现都算错**；要改先改本文件。

## 1. 迁移号段

| 号 | 文件 | 内容 |
| --- | --- | --- |
| 660 | `660_creator.up/down.sql` | 表 `creator` |
| 661 | `661_creator_post.up/down.sql` | 表 `creator_post` |
| 662 | `662_creator_post_metric.up/down.sql` | 表 `creator_post_metric` |
| 663 | `663_crm_client.up/down.sql` | 表 `crm_client` |
| 664 | `664_crm_brief.up/down.sql` | 表 `crm_brief` |
| 665 | `665_crm_collab.up/down.sql` | 表 `crm_collab` |
| 666 | `666_crm_settlement.up/down.sql` | 表 `crm_settlement` |
| 667–672 | 单独索引文件 | creator / creator_post / metric 的二级索引 |
| 673–679 | 单独索引文件 | crm 四表的二级索引 |

规则（`AGENTS.md`）：**无外键、无级联**；`workspace_id UUID NOT NULL`；`created_at/updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`；`archived_at TIMESTAMPTZ` 软删；新表可在建表语句内联 PK/UNIQUE（表空，安全）；**每个二级索引一个单语句 `CREATE INDEX CONCURRENTLY IF NOT EXISTS` 文件对**，并登记 `server/cmd/migrate/main.go` 的 `concurrentIndexCleanups`（up 方向；down 只 `DROP INDEX CONCURRENTLY IF EXISTS`，不进 down map）。

**金额**：`NUMERIC(14,2)` + `currency CHAR(3) NOT NULL DEFAULT 'CNY'`。不用浮点，不用分。字段名以 `_amount` 结尾。

## 2. 表

```sql
-- 660
creator(
  id UUID PK, workspace_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('owned','external')),
  display_name TEXT NOT NULL, platform TEXT NOT NULL, handle TEXT NOT NULL, url TEXT,
  fans BIGINT NOT NULL DEFAULT 0, fans_d7 BIGINT NOT NULL DEFAULT 0,
  avg_play BIGINT NOT NULL DEFAULT 0, engagement_rate NUMERIC(6,5),
  category TEXT, audience_note TEXT, region TEXT, price_note TEXT,
  score SMALLINT CHECK (score BETWEEN 1 AND 5), risk_flag BOOLEAN NOT NULL DEFAULT false,
  blacklist_reason TEXT, owner_member_id UUID, media_ip_project_id UUID,
  created_by UUID, created_at, updated_at, archived_at,
  UNIQUE (workspace_id, platform, handle)
)

-- 661
creator_post(
  id UUID PK, workspace_id UUID NOT NULL, creator_id UUID NOT NULL,
  collab_id UUID, content_issue_id UUID, platform TEXT NOT NULL,
  title TEXT, url TEXT NOT NULL, published_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','csv','api')),
  created_by UUID, created_at, updated_at, archived_at,
  UNIQUE (creator_id, url)
)

-- 662
creator_post_metric(
  id UUID PK, workspace_id UUID NOT NULL, post_id UUID NOT NULL,
  captured_on DATE NOT NULL,
  play BIGINT, likes BIGINT, comments BIGINT, shares BIGINT, clicks BIGINT,
  converts BIGINT, gmv_amount NUMERIC(14,2), currency CHAR(3) NOT NULL DEFAULT 'CNY',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at, updated_at,
  UNIQUE (post_id, captured_on)
)

-- 663
crm_client(id PK, workspace_id, name TEXT NOT NULL, brand TEXT, industry TEXT,
  contact_name TEXT, contact_channel TEXT, contract_entity TEXT, payment_terms TEXT,
  credit_note TEXT, owner_member_id UUID, created_by UUID, created_at, updated_at, archived_at)

-- 664
crm_brief(id PK, workspace_id, client_id UUID NOT NULL, title TEXT NOT NULL, category TEXT,
  budget_min_amount NUMERIC(14,2), budget_max_amount NUMERIC(14,2),
  target_audience TEXT, deliverable_type TEXT CHECK (deliverable_type IN ('short_video','post','live')),
  platforms TEXT[] NOT NULL DEFAULT '{}', schedule_from DATE, schedule_to DATE,
  kpi_play BIGINT, kpi_gmv_amount NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','matching','closed')),
  owner_member_id UUID, created_by UUID, created_at, updated_at, archived_at)

-- 665
crm_collab(id PK, workspace_id, brief_id UUID NOT NULL, creator_id UUID NOT NULL,
  stage TEXT NOT NULL DEFAULT 'inquiry' CHECK (stage IN
    ('inquiry','quoted','negotiating','confirmed','sampling','script_review','scheduled','published','accepted','settled','cancelled')),
  quote_amount NUMERIC(14,2), final_amount NUMERIC(14,2), prob NUMERIC(5,4) CHECK (prob BETWEEN 0 AND 1),
  creator_fee NUMERIC(14,2), sample_cost NUMERIC(14,2), platform_fee NUMERIC(14,2),
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  settlement_mode TEXT CHECK (settlement_mode IN ('flat','cps','cpa','barter')),
  commission_rate NUMERIC(6,5), sample_required BOOLEAN NOT NULL DEFAULT false,
  script_required BOOLEAN NOT NULL DEFAULT false,
  scheduled_at TIMESTAMPTZ, confirmed_at TIMESTAMPTZ, published_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ,
  issue_id UUID, owner_member_id UUID, created_by UUID, created_at, updated_at, archived_at)

-- 666
crm_settlement(id PK, workspace_id, collab_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('prepay','final','platform_fee','tax')),
  amount NUMERIC(14,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'CNY',
  due_at DATE, paid_at DATE, invoice_no TEXT, note TEXT,
  created_by UUID, created_at, updated_at, archived_at)
```

**桥方向固定**：`collab.issue_id → issue`、`post.collab_id → crm_collab`、`post.content_issue_id → issue`、`creator.media_ip_project_id → project`。**issue 不反存任何业务字段。**

## 3. REST

基址 `/api/workbench`（工作区取自请求上下文，与 `/api/departments` 同一套：`h.resolveWorkspaceID(r)` + `h.requireWorkspaceMember(...)`）。路由已在 `server/cmd/server/router.go` 注册完毕，**handler 函数名不可改**。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/overview?department_id=` | 聚合指标：`{ metrics: { [MetricId]: { value: number \| null, sample_count: number, empty: "zero"\|"insufficient_data" } } }` |
| GET | `/counts?department_id=` | 侧栏计数：`{ creators, clients, briefs, collabs_open, settlements_pending }` |
| GET/POST | `/creators` | 列表（`?kind=&q=&limit=&cursor=`）/ 新建 |
| GET/PATCH/DELETE | `/creators/{creatorId}` | 单条；DELETE = 软删 |
| GET/POST | `/creator-posts` | 列表（`?creator_id=&from=&to=`）/ 新建 |
| PATCH/DELETE | `/creator-posts/{postId}` | 单条 |
| GET/POST | `/creator-posts/{postId}/metrics` | 按日快照列表 / upsert（`(post_id, captured_on)` 唯一） |
| GET/POST | `/crm/clients` | 列表 / 新建 |
| GET/PATCH/DELETE | `/crm/clients/{clientId}` | 单条 |
| GET/POST | `/crm/briefs` | 列表（`?status=&client_id=`）/ 新建 |
| GET/PATCH/DELETE | `/crm/briefs/{briefId}` | 单条 |
| GET/POST | `/crm/collabs` | 列表（`?stage=&brief_id=&creator_id=`）/ 新建 |
| GET/PATCH/DELETE | `/crm/collabs/{collabId}` | 单条；PATCH 改 `stage` 时写 `confirmed_at` 等时间戳 |
| GET/POST | `/crm/settlements` | 列表（`?collab_id=&paid=`）/ 新建 |
| PATCH/DELETE | `/crm/settlements/{settlementId}` | 单条 |

**权限**：workspace 成员可读；写 = `owner|admin` 全写，`member` 只能改 `owner_member_id = 自己` 的行（新建时自动写入自己）。`department_id` 只做聚合过滤，**不参与鉴权**。

### 3.1 响应包裹与序列化（前后端必须逐字一致）

| 场景 | 形状 |
| --- | --- |
| 列表 | `{ <resource>: T[], total: number }`，`resource` 用复数：`creators` / `posts` / `metrics` / `clients` / `briefs` / `collabs` / `settlements`（发布记录用 `posts`，不使用 `creator_posts`） |
| `total` 语义 | **本页条数**，不是全量总数。权威计数只来自 `/counts`；列表不额外跑 COUNT |
| 达人列表额外 | `next_cursor: string \| null`（本页满时返回最后一行 id，即 `?cursor=` 接受的取值；只有 creators 分页，其余列表全量返回，服务端硬上限 500 行） |
| 分页参数 | `?cursor=<上一页最后一行 id>&limit=<n>`，`limit` 默认 50、上限 200；游标解析失败返回 **400**，不静默返回空页 |
| 单条 / 新建 / 更新 | 直接返回该对象，不包裹 |
| 删除 | `204`，无 body（软删） |
| `POST …/metrics` | 返回该日快照行本身 |
| `overview` | `{ metrics: { [MetricId]: { value, sample_count, empty } } }`；未知 id 客户丢弃 |
| `counts` | `{ creators, clients, briefs, collabs_open, settlements_pending }`，全是 number |

- **金额一律 JSON number**：服务端把 `NUMERIC(14,2)` 转 `float64` 再序列化，**不能输出字符串**。任一行金额是字符串，前端 zod 会整页回退为空。
- `empty` 只发 `"zero"` 或 `"insufficient_data"`；`dash` 暂不使用（前端把未知值都当 `insufficient_data`）。
- 路径**不带尾斜杠**：`/api/workbench/creators`、`/api/workbench/crm/collabs/{id}`。
- `crm_brief` **没有 currency 列**：预算金额按 CNY 解释，不新增列。
- 单条路由：`creator-posts` 与 `settlements` **没有 GET 单项**（列表与详情页都用列表数据），只注册 PATCH/DELETE。
- 前端 `workbenchKeys` 位于 `packages/core/crm/queries.ts` 并从 `@morechat/core/crm` 导出（overview 是跨域聚合，暂不单开子包）。

**handler 命名**（router.go 已按此注册，函数名不可改）：
`GetWorkbenchOverview` `GetWorkbenchCounts` `ListCreators` `CreateCreator` `GetCreator` `UpdateCreator` `DeleteCreator` `ListCreatorPosts` `CreateCreatorPost` `UpdateCreatorPost` `DeleteCreatorPost` `ListCreatorPostMetrics` `UpsertCreatorPostMetric` `ListCrmClients` `CreateCrmClient` `GetCrmClient` `UpdateCrmClient` `DeleteCrmClient` `ListCrmBriefs` `CreateCrmBrief` `GetCrmBrief` `UpdateCrmBrief` `DeleteCrmBrief` `ListCrmCollabs` `CreateCrmCollab` `GetCrmCollab` `UpdateCrmCollab` `DeleteCrmCollab` `ListCrmSettlements` `CreateCrmSettlement` `UpdateCrmSettlement` `DeleteCrmSettlement`

## 4. 事件

`packages/core/types/events.ts` 的 `WSEventType` 追加，payload 进同名映射表：

| 事件 | payload |
| --- | --- |
| `creator:changed` | `{ id: string }` |
| `creator_post:changed` | `{ id: string; creator_id: string }` |
| `crm_client:changed` | `{ id: string }` |
| `crm_brief:changed` | `{ id: string }` |
| `crm_collab:changed` | `{ id: string }` |
| `crm_collab:stage_changed` | `{ id: string; from: string; to: string }` |
| `crm_settlement:changed` | `{ id: string }` |

patcher 一律"invalidate 该域列表 + 失效 overview/counts"，不做字段级 patch（台账行字段多，patch 成本高于重取）。

## 5. Query key

```
["workbench", wsId, "overview", departmentId ?? "all"]
["workbench", wsId, "counts",   departmentId ?? "all"]
["crm",       wsId, resource, filters]     // resource ∈ clients|briefs|collabs|settlements
["creator",   wsId, filters]
["creator",   wsId, "posts", filters]
```

`["dashboard", wsId, …]` 保持不动；新子键若挂进去**只能追加在尾部**（`isSameDashboardScope` 跳过 index 3）。

server 数据一律 Query；Zustand 只放当前部门、列宽、筛选草稿。

## 6. UI 归属

| 板块 | 读什么 | 放在哪 |
| --- | --- | --- |
| 概览指标条 | `overview` | `/{slug}/overview` |
| 缺口卡 | `overview` 中 `empty = insufficient_data` 的项 | 同上 |
| 台账列表（达人库/客户/需求单/合作单/结算） | 域列表 | `/{slug}/overview` 的 Tabs + `LedgerSection` |
| 履约看板 | `crm/collabs?stage=` | 同上，按 `CollectionGroup` 分列 |
| 发布与回填 | `creator-posts` + metrics | 同上 |
| 侧栏计数 | `counts` | `WorkPanel` 的 `LedgerSection` |

⚠️ **不用 `BoardView`**（它只吃 `Issue[]`）。台账列表用 `CollectionList`；"按阶段分组"用 `CollectionGroup`。

## 8. 已裁决的分歧（服务端/前端交付时提出的问题）

| # | 分歧 | 裁决 |
| --- | --- | --- |
| 1 | `owner_member_id` 是 member.id 还是 user.id | **user id**，与 `agent.owner_id`、`canEditRuntime` 一致；写入前校验其为本工作区成员 |
| 2 | `total` = 全量还是本页 | **本页条数**；权威计数走 `/counts`，不额外 COUNT |
| 3 | 软删行仍占用 `UNIQUE(platform,handle)` / `UNIQUE(creator_id,url)` | 已知债务：接受字面实现，B1 补两个部分唯一索引（`WHERE archived_at IS NULL`）替换，届时需两条迁移 + cleanup 登记 |
| 4 | 指标快照写入没有专用事件 | 复用 `creator_post:changed`（带 `creator_id`），不新增事件名 |
| 5 | 部门归属如何落到 7 张无 `department_id` 的表 | 回退链：creator → IP 项目或 owner 部门；CRM → owner 部门；issue → 项目部门；knowledge → 知识空间部门；`agent.*` 与跨部门比忽略过滤。逐行精确部门需加列，B1 再议 |
| 6 | 阶段默认概率放哪 | 唯一一处：`workbench_metrics.sql` 的 `CASE`；`contracts.ts` 的 `threshold` 只供展示 |
| 7 | 服务端改了 `workspace.go` / `workspace_delete.sql` / `workspace_delete_manifest_test.go` | **接受**。新增 7 张表必须进 workspace teardown 与 manifest，否则删工作区留孤儿行、schema 覆盖测试报漂移 |
| 8 | 金额币种 | `agent.cost.month` 是 **USD**，CRM 全部 **CNY**；`money` 单位不带币种，展示层必须按板块带币种 |
| 9 | 时间格式 | 时间戳 RFC3339 字符串；日期 `YYYY-MM-DD`；DATE 比较按日粒度（`due_date` 是 DATE） |
| 10 | metric upsert 状态码 | `201`（新建或覆盖同一 `(post_id, captured_on)`） |

## 9. 完成定义（DoD）

一个域算完成，当且仅当：迁移可 up/down 往返、`make sqlc` 无脏 diff、handler 有权限用例、事件发出、zod 覆盖响应、`useRealtimeSync` 有 patcher、`/overview` 里对应指标从 `insufficient_data` 变为有值、页面能读能写。

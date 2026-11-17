---
purpose: B0（达人商务）的服务端契约：表、迁移号段、REST、事件、query key、UI 归属
owner: lead
status: current
updated: 2026-11-17
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
| GET | `/finance?department_id=` | 经营只读聚合：`{ window, signed, collected, gross_margin, receivable_days, cash_floor }`，见 §3.2 |
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

### 3.2 经营只读聚合 `GET /finance`

handler：`GetWorkbenchFinance`（`server/internal/handler/workbench_finance.go`）；SQL：`workbench_metrics.sql` 的 `OverviewCrmFinance`（口径写在该查询的注释里）。**不新建月度表**，全部是既有台账行的只读聚合；一次请求取一个自然月的四个数 + 一个恒缺口。

```json
{
  "window": { "month": "2026-11" },
  "signed":          { "value": 0,    "sample_count": 0, "empty": "zero" },
  "collected":       { "value": 0,    "sample_count": 0, "empty": "zero" },
  "gross_margin":    { "value": null, "sample_count": 0, "empty": "insufficient_data" },
  "receivable_days": { "value": null, "sample_count": 0, "empty": "insufficient_data" },
  "cash_floor":      { "value": null, "sample_count": 0, "empty": "insufficient_data" }
}
```

| 块 | 口径 | 空值 |
| --- | --- | --- |
| `signed` | `confirmed_at` 落在本自然月、阶段已过 `negotiating`（`confirmed` 及其后，含 `settled`）的 `final_amount` 之和；阶段按"已确认及之后"判定，否则本月确认、随后推进到 `sampling` 的单会从本月签约里消失 | `zero`（真零） |
| `collected` | 本自然月 `crm_settlement.paid_at` 非空的 `amount` 之和 | `zero`（真零） |
| `gross_margin` | (collected − 本月 `accepted_at` 落月内的 `settled` 单的 `creator_fee+sample_cost+platform_fee`) / collected，**0–1 量纲**（C3，展示 ×100） | `insufficient_data`：collected 为 0，或本月没有已结算单（成本侧不存在） |
| `receivable_days` | 未回款结算单（`paid_at IS NULL`）的平均账龄（天，`now() - created_at`） | `insufficient_data`：没有未回款结算单 |
| `cash_floor` | **恒为缺口**：库里没有现金期初，也没有成本录入，不编造 | `insufficient_data` |

- C10：签约口径**含续费**；续费单列在 `crm_settlement.kind`。⚠️ 现有 CHECK 只允许 `prepay|final|platform_fee|tax`，**没有 `renewal`**，所以 B0 阶段续费只能记成一条普通结算行 —— 它只会在真正回款后进 `collected`，不会重复计入 `signed`。加 `renewal` 需要一条改 CHECK 的迁移，未在本次范围内。
- 每块形状与 `/overview` 的 `{value, sample_count, empty}` 完全一致（Go 侧 `WorkbenchFinanceBlock` 是 `WorkbenchMetricValue` 的类型别名），`empty` 同样只发 `zero` / `insufficient_data`。
- 部门过滤沿用 B0 回退链：结算单 → 其合作单 → `owner_member_id` 的 `member.department_id`；不参与鉴权。

### 3.3 月度成本与现金录入

`ops_finance_month`（迁移 707/708）一个 workspace 一月一行（部分唯一索引 `WHERE archived_at IS NULL`），`month` 存月初 DATE（C7）。金额单位元，**NULL = 未录入，不是 0**。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/finance/months?month=YYYY-MM` | 按月倒序列出全部历史；带 `month` 只返回那一月（弹窗预填） |
| `PUT` | `/finance/months` | **整月替换**（不是合并）：body `{month: "YYYY-MM-DD"(必须月初), cash_open?, fixed_cost?, variable_cost?, note?}`；省略的金额存 NULL，`created_by`/`created_at` 保留首次写入者 |

写权限同 workbench（owner/admin；member 403）。校验：`month` 必须月初且 `YYYY-MM-DD`；金额 0–1e12；`note` ≤2000 字符。

`gross_margin` 与 `cash_floor` 因此多一个 `basis` 字段，说明这个数是用哪套成本算的：

| `basis` | 含义 | 毛利率 | 现金底线 |
| --- | --- | --- | --- |
| `entered` | 本月 `ops_finance_month` 的固定+可变成本 | `(collected − 录入成本)/collected` | `cash_open + collected − 录入成本` |
| `settled_collabs` | 回退到本月已结算合作单的费用合计 | 同上口径 | 不用（现金底线必须要有 `cash_open`） |
| `none` | 两套都没有 | `null` + `insufficient_data`（否则会出现凭空 100% 毛利） | `cash_open` 有值但不扣成本；`cash_open` 为空则 `null` + 缺口 |

`basis` 缺失时客户端降级为 `none`（兼容老服务端），代价是"已结算合作单费用"会显示成"缺成本录入"——这是刻意选的兼容优先。

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
["workbench", wsId, "finance",  departmentId ?? "all"]
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
| 经营标签（签约/回款/毛利/应收/现金） | `finance` | `/{slug}/overview?tab=finance` 的 `FinanceSection` |
| 缺口卡 | `overview` 中 `empty = insufficient_data` 的项 | 同上 |
| 台账列表（达人库/客户/需求单/合作单/结算） | 域列表 | `/{slug}/overview` 的 Tabs + `LedgerSection` |
| 履约看板 | `crm/collabs?stage=` | 同上，按 `CollectionGroup` 分列 |
| 发布与回填 | `creator-posts` + metrics | 同上 |
| 侧栏计数 | `counts` | `WorkPanel` 的 `LedgerSection` |

⚠️ **不用 `BoardView`**（它只吃 `Issue[]`）。台账列表用 `CollectionList`；"按阶段分组"用 `CollectionGroup`。

## 7. Agent 读取通道：MCP 只读工具（`POST /api/mcp/workbench`）

agent 的读取通道是 MCP 工具，不是 HTTP。工作台的数据已经在服务端通了（同一套 Postgres + 本文件的 REST），但此前只有 knowledge 暴露了 MCP 端点，所以 AI 同事读不到台账与指标。本节补上第二个端点：**四个只读工具**，与 `POST /api/mcp/knowledge` 同一套 JSON-RPC 2.0 over HTTP（`initialize` → `tools/list` → `tools/call`，单请求、无 session）。实现：`server/internal/handler/mcp_workbench.go`。

### 7.1 鉴权与工作区

与 knowledge MCP 逐字一致（`router.go` 同一个中间件组）：

```
MCPTokenExpiryGate → middleware.Auth → middleware.RequireWorkspaceMember → h.WorkbenchMCP
```

- `Authorization: Bearer mat_…`：token 行决定 workspace 与 user（`X-Workspace-ID` / `X-User-ID` 由 Auth 改写），agent 自己给的 workspace 标识不能扩张范围（MUL-2600）。
- `Authorization: Bearer mul_…`：user 来自 PAT，workspace 按仓库既有规则（slug / header / query）选。
- 只有 `X-Workspace-ID` 没有 token → 到不了 handler（401）。
- 过期 `mat_` → `-32002`，由同一个 `MCPTokenExpiryGate` 在 Auth 之前答。
- **工具参数里没有 workspace**：工具无法指定工作区，也就无法读到调用者不是成员的工作区。跨 workspace 用另一个身份的 run 调用 → 中间件 404，不会出现工具文档。

**实现方式（防漂移）**：每个工具不重新拼装响应，而是把带身份的请求重放给拥有该读逻辑的 REST handler（`h.GetWorkbenchOverview`、`h.ListHrJobs` …），返回它写出的字节。于是 `workbench_overview` 与 `GET /api/workbench/overview` 是**同一个文档**——同样的 metric id、同样的三态条目、同样的字段名；台账页与 REST 列表同字段同信封。测试 `TestWorkbenchMCPOverviewInEmptyWorkspace` / `TestWorkbenchMCPLedgerReadsJobs` 直接对两边做逐字节/逐字段比较。

### 7.2 工具

| 工具 | 参数 | 返回 |
| --- | --- | --- |
| `workbench_overview` | `department_id?` | 与 `GET /overview` 同构：`{ metrics: { [MetricId]: { value, sample_count, empty } } }`，22 个指标 |
| `workbench_counts` | `department_id?` | 与 `GET /counts` 同构：9 个计数 |
| `workbench_ledger` | `domain`（必填）、`limit?`（默认 20，上限 100）、`cursor?`、`department_id?` | 与对应 REST 列表同构：`{ <domain>: [...], total }`（`creators` 另有 `next_cursor`） |
| `workbench_finance` | `month?`（`YYYY-MM`）、`department_id?` | 与 `GET /finance` 同构，含 `gross_margin.basis` / `cash_floor.basis` |

`domain` 取值九个：`creators` · `clients` · `briefs` · `collabs` · `settlements` · `jobs` · `candidates` · `interviews` · `employees`（= §3 的五张商务表 + §10 的四张人事表）。`tools/list` 的 `domain` enum 由 `workbenchMCPLedgerDomainNames` 生成，与 dispatcher 的 `switch` 同源，不会出现"声明了但没人答"的名字。

### 7.3 只读与边界

- **只读**：四个工具都不写库，dispatcher 只能走到读 handler，没有任何 PATCH/POST 路径。工具 description 明写 read-only，避免模型以为能"顺便改一下"。
- **三态语义沿用 `metricValue`**：`value: null` + `empty: "insufficient_data"` = 没有样本（不是 0）；`empty: "zero"` = 0 是真答案。工具描述写明这一点，防止 agent 把缺口报成 0。
- **金额一律 JSON number，币种随行**（`_amount` 字段配行上的 `currency`；`agent.cost.month` 是 USD，CRM 是 CNY）。
- **`total` = 本页条数**，与 REST 一致；要总数用 `workbench_counts`。
- **`department_id` 是归属不是权限**：只筛聚合的行集合，既不放宽也不收紧成员能读什么。台账里只有 `jobs` / `employees` 两个域有部门列，其余域带 `department_id` 会**报错**而不是静默返回全部门——静默放宽比报错更糟。
- **`limit` 上限 100**：超过直接 `isError`（`limit must be between 1 and 100`），不截断。
- **单次响应 ≤ 256 KB**（`workbenchMCPMaxResult`）：超出时 `isError` 提示"用更小的 limit 配合 cursor 翻页"，不返回半截文档。
- **`month` 是断言不是选择器**：`OverviewCrmFinance` 按数据库 `now()` 切月，本 build 没有任何按月入参的读查询，因此只有当前自然月被接受（`window.month` 会回显），其它月份 `isError`——把本月数字贴上另一个月的标签是这层最不能犯的错。要读任意月份，需要一条按月入参的查询 + handler，属后续项。
- 参数校验失败一律 `isError: true` + 可读原因（如 `domain must be one of …`），协议层问题（帧不合法、未知方法、没有工具名）仍是 JSON-RPC 错误码（`-32700` / `-32601` / `-32602`）。

### 7.4 注册成工作区 MCP server

同 KNOWLEDGE-MCP §5，`name` 用 `initialize` 的 `serverInfo.name`：

```jsonc
POST /api/workspaces/{wsId}/mcp-servers
{"name":"morechat-workbench","transport":"http",
 "config":{"url":"http://<server>/api/mcp/workbench",
           "headers":{"Authorization":"Bearer <token>","X-Workspace-ID":"<ws>"}}}
```

### 7.5 测试

`server/internal/handler/mcp_workbench_test.go`：`tools/list` 的四个名字与 schema（含 `domain` enum、`limit` 上限）；空 workspace 的 22 个 key 与缺口指标；非法 `domain`、`limit=101`、坏 `department_id`、无部门列的域带 `department_id`、未知参数 → `isError`；造一条 `hr_job` 后 `workbench_ledger(domain=jobs)` 与 REST 列表逐字段相等；跨 workspace（他人身份 + 指定本工作区）被中间件拒绝、且台账只跟着工作区走。


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

## 10. B1「人事」契约（第二批评审基线）

与 B0 同一套规则（无外键、`workspace_id NOT NULL`、软删、金额 `NUMERIC(14,2)`+`currency`、每个二级索引单独 CONCURRENTLY 迁移并登记 `concurrentIndexCleanups`）。

### 10.1 迁移号段

| 号 | 文件 | 表 |
| --- | --- | --- |
| 680 | `680_hr_job` | 职位 |
| 681 | `681_hr_candidate` | 候选人 |
| 682 | `682_hr_interview` | 面试 |
| 683 | `683_hr_scorecard` | 评分 |
| 684 | `684_hr_employee_profile` | 员工档案 |
| 685–699 | 单独索引文件 | 各表二级索引 |
| 701 | `701_hr_interview_slot_unique` | 面试官×时段排他索引（CONCURRENTLY） |
| 702–704 | 列补齐：面试官姓名 / 评分类维度 / 岗位算分字段 | 无新表、无新索引 |
| 705 | `705_hr_candidate_profile` | 候选人算分字段：`edu` / `years_experience` / `resume_text`（无新表、无新索引） |

### 10.2 表

```sql
hr_job(id PK, workspace_id, title TEXT NOT NULL, department_id UUID, level TEXT,
  headcount INT NOT NULL DEFAULT 1, status TEXT CHECK (status IN ('draft','open','paused','closed')),
  salary_min NUMERIC(14,2), salary_max NUMERIC(14,2), currency CHAR(3) DEFAULT 'CNY',
  requirements TEXT,
  edu TEXT, years TEXT, city TEXT,                       -- 704：匹配度算分输入（自由文本）
  jd TEXT,                                               -- 704：AI 生成岗位文案与面试题的输入
  urgent BOOLEAN NOT NULL DEFAULT false,                 -- 704：急招标记
  keywords JSONB NOT NULL DEFAULT '[]',                  -- 704：字符串数组，匹配度算分输入
  owner_member_id UUID, created_by, created_at, updated_at, archived_at)

hr_candidate(id PK, workspace_id, job_id UUID NOT NULL, name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'screening' CHECK (stage IN
    ('screening','test','interview','scored','offer','hired','rejected','withdrawn')),
  source TEXT, phone TEXT, email TEXT, resume_attachment_id UUID,
  match_score SMALLINT CHECK (match_score BETWEEN 0 AND 100),
  score_resume NUMERIC(5,2), score_test NUMERIC(5,2), score_interview NUMERIC(5,2),
  expected_salary NUMERIC(14,2), offer_salary NUMERIC(14,2), currency CHAR(3) DEFAULT 'CNY',
  edu TEXT, years_experience NUMERIC(4,1), resume_text TEXT,  -- 705：匹配度算分输入（候选人侧）
  owner_member_id UUID, hired_at TIMESTAMPTZ, rejected_reason TEXT,
  created_by, created_at, updated_at, archived_at)
-- 一人一岗：UNIQUE (workspace_id, job_id, lower(name), coalesce(phone,'')) 以内联表达式索引实现
-- 705：`edu` 与 `hr_job.edu` 同口径的自由文本（归一化后相等即 100，岗位「不限」即 100）；`years_experience` 一位小数，与 `hr_job.years` 解析出的下限比对（落区间/高于上限均 100，低于下限按差额线性扣分）；`resume_text` 是简历正文，**NULL 表示没有简历，不用空串冒充**——关键词维在 NULL 上跳过，在「有文本但一名不中」上才记 0

hr_interview(id PK, workspace_id, candidate_id UUID NOT NULL, round SMALLINT NOT NULL DEFAULT 1,
  scheduled_at TIMESTAMPTZ NOT NULL, duration_minutes INT NOT NULL DEFAULT 45,
  interviewer_member_id UUID,                            -- 可选：内部人客串时留痕
  interviewer_name TEXT NOT NULL,                        -- 702：面试官姓名（外部人员，录入信息）
  mode TEXT CHECK (mode IN ('onsite','video','phone')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','cancelled','no_show')),
  rescheduled_count INT NOT NULL DEFAULT 0, note TEXT,
  created_by, created_at, updated_at, archived_at)
-- 同一面试官同一时段排他：UNIQUE (workspace_id, interviewer_member_id, scheduled_at)
-- 该索引仍按 interviewer_member_id，NULL 不互斥：外部面试官（只有姓名）之间的时段冲突由人判断

hr_scorecard(id PK, workspace_id, interview_id UUID NOT NULL, reviewer_member_id UUID,
  score_skill SMALLINT, score_experience SMALLINT, score_culture SMALLINT, score_potential SMALLINT,
  weighted_score NUMERIC(5,2), verdict TEXT CHECK (verdict IN ('strong_yes','yes','no','strong_no')),
  dimensions JSONB NOT NULL DEFAULT '{}',                -- 703：维度名 → 0–5，新代码只写这里
  comment TEXT, created_by, created_at, updated_at, archived_at)
-- UNIQUE (workspace_id, interview_id, reviewer_member_id)
-- 四个 score_* 为兼容列：旧行与旧客户端仍读，新代码只读不写，且与 dimensions 不做同步

hr_employee_profile(id PK, workspace_id, member_id UUID NOT NULL, department_id UUID,
  job_title TEXT, grade TEXT, hire_date DATE, regular_date DATE, contract_end DATE,
  ability JSONB NOT NULL DEFAULT '{}',   -- 6 维 1–10
  disc JSONB NOT NULL DEFAULT '{}',      -- d/i/s/c 0–10
  owner_member_id UUID, created_by, created_at, updated_at, archived_at)
-- UNIQUE (workspace_id, member_id)
```

`ability` / `disc` 用 JSONB 而非 12 个列：它们只被展示与 AI 上下文消费，从不参与排序或聚合。同理 `hr_scorecard.dimensions`（维度集由每个岗位生成的评分模板决定）与 `hr_job.keywords`（关键词列表长度按岗位而定）也是 JSONB 容器，但**它们是算分输入**：匹配度算分读岗位侧的 `keywords/edu/years/salary_min/salary_max` 与候选人侧的 `resume_text/edu/years_experience/expected_salary`，四维各按 40/20/20/20 加权，无信号的维不进分母（705 之前候选人侧三列都不存在，实际得分只由薪资一维决定）。所以只要参与 SUM/排名/唯一约束的字段仍是真实列，这两处容器就不违反 B0 判据。

### 10.3 REST（基址 `/api/workbench/hr`）

`jobs` / `candidates` / `interviews` / `employees` 各 5 条：`GET /`、`POST /`、`GET /{id}`、`PATCH /{id}`、`DELETE /{id}`（软删）；`scorecards` **只有 4 条**（无 `GET /{id}`，评分随面试详情返回，同 B0 的 `settlements`）。
- 列表包裹同 B0 §3.1：`{ <resource>: T[], total }`，`total` = 本页条数。
- 列表过滤参数（服务端**忽略不认识的键**）：`jobs{status, department_id}`、`candidates{job_id, stage}`、`interviews{candidate_id, status}`、`scorecards{interview_id}`、`employees{department_id}`。
- 面试创建/改期校验排他：同一 `interviewer_member_id` 同一 `scheduled_at` → **409**；改期 `rescheduled_count += 1`。
  - `interviewer_name` 必填（去空白后）：面试官通常不在本系统内，姓名是这一行唯一能说明「谁在场」的信息；姓名与成员 id 都没有 → **400**。只给 `interviewer_member_id` 时服务端回填该成员的 `user.name`，两者都给则以请求里的姓名为准。
  - PATCH 省略 `interviewer_name` 保留已存姓名（只改状态不会抹掉在场记录）；显式传空串则重新走成员回填，仍为空 → **400**。
  - 排他索引仍按 `interviewer_member_id`（701），NULL 不互斥：纯外部面试官（只有姓名）不参与时段互斥，冲突由排期人判断。
- 评分：请求接受 `dimensions`（键为维度名，值 0–5；键去空白后非空、值越界 → **400**）；客户端未给 `weighted_score` 时服务端按**维度均分**回填（与维度同为 0–5 尺度；空表不回填，保持 `null`）。PATCH 只换 `dimensions` 会重算均分，同时给 `weighted_score` 则以客户端为准。四个 `score_*` 仍接收，但不写进 `dimensions`。
- 岗位：接受并返回 `edu` / `years` / `city` / `jd` / `urgent` / `keywords`；`keywords` 为字符串数组（去空白、丢空串），创建缺省 `[]`，PATCH 传 `[]` 即清空，省略则保留。
- 候选人：接受并返回 `edu` / `years_experience` / `resume_text`（705）。`years_experience` 越界（0–60 之外）→ **400**；`resume_text` 超过 20000 字符 → **400**；两者省略即保留，显式传 `""` 置 NULL（不是空串）。列表与详情响应同字段。
- `POST /candidates/{candidateId}/hire`：请求体 `CreateHrEmployeeProfileRequest`（`member_id` 必填）；同一事务内置 `stage=hired`、写 `hired_at`、创建或更新 `hr_employee_profile`；**响应 `{ candidate, employee_profile }`**（字段名与表名一致，客户端类型见 `HireHrCandidateResponse`），客户端要同时失效 candidates 与 employees 两个域。

### 10.4 事件

`hr_job:changed` · `hr_candidate:changed` · `hr_interview:changed` · `hr_scorecard:changed` · `hr_employee_profile:changed`，payload `{ id }`；候选人改阶段额外发 `hr_candidate:stage_changed` `{ id, from, to }`。

### 10.5 指标

`hr.candidates.active` · `hr.time_to_hire.median` · `hr.scorecard.backlog` · `hr.interview.on_time_rate` 已进契约，由 `/api/workbench/overview` 返回，口径见 `docs/METRICS.md`。

### 10.6 Query key

`["hr", wsId, resource, filters]`、`["hr", wsId, resource, { id }]`；`/overview` 与 `/counts` 沿用 `["workbench", wsId, …]`。

`/counts` 增加 4 个字段：`jobs` / `candidates` / `interviews` / `employees`。在服务端补上之前它们在客户端是**可选**的（`packages/core/types/workbench.ts` 里 `?`），面板据此不画数字而不是画 0 —— 与 `emptyRule` 同一条原则。

已知债务：面试官（`hr_interview.interviewer_member_id`）与员工（`hr_employee_profile.member_id`）目前只显示短 id，没有 join 到 member 姓名；外部面试官已由 `interviewer_name` 覆盖，内部人的姓名 join 仍待补，补 join 时同步换成 `ActorAvatar`。

## 11. B2「精选联盟分销」契约

B0 的 CRM 链（`crm_client → crm_brief → crm_collab → crm_settlement`）建模的是**项目制坑位费**。商务实际对接的是抖音电商精选联盟的分销业务，机制不同：

- 商家把**商品**放进联盟并按**佣金率**付佣（普通计划 / 定向计划 / 活动佣金）；
- 达人（或机构）在联盟**选品**，把商品加进自己的推广计划，发短视频/直播挂车；
- 成交按联盟**归因**（订单），**确认收货后**才进结算，退款要冲减；
- 平台按结算周期（T+N / 月结）出**结算单**，扣**技术服务费**（约 10%），再打给达人/机构；
- 机构从达人佣金分成；坑位费/专场费是另一类收入。

所以这一域的核心对象是 **商品 × 达人（推广计划）× 日期（成交）× 周期（结算单）**，不是"合作单"。B2 只做数据结构与读写面：**不接平台 API、不做自动归因、不做 UI**。

### 11.1 迁移号段

| 号 | 文件 | 内容 |
| --- | --- | --- |
| 709 | `709_affiliate_product` | 表 `affiliate_product` |
| 710 | `710_affiliate_pick` | 表 `affiliate_pick` |
| 711 | `711_affiliate_daily` | 表 `affiliate_daily`（内联 `UNIQUE (workspace_id, pick_id, stat_date)`） |
| 712 | `712_affiliate_settlement` | 表 `affiliate_settlement` |
| 713 | `713_creator_post_affiliate_refs` | `creator_post` 加 `product_id` / `pick_id` 两列（无新表） |
| 714 | `714_affiliate_product_platform_unique` | 部分唯一索引 `(workspace_id, platform, platform_product_id) WHERE archived_at IS NULL`（CONCURRENTLY） |
| 715/716 | `..._product_client_idx` / `..._product_status_idx` | 商品列表索引 |
| 717 | `717_affiliate_pick_identity_unique` | 部分唯一索引 `(workspace_id, product_id, creator_id) WHERE archived_at IS NULL`（CONCURRENTLY） |
| 718/719 | `..._pick_creator_idx` / `..._pick_status_idx` | 选品列表索引 |
| 720 | `720_affiliate_daily_stat_date_idx` | 日事实的月份窗口扫描 |
| 721/722 | `..._settlement_period_idx` / `..._settlement_status_idx` | 结算单列表索引 |
| 723/724 | `..._creator_post_product_idx` / `..._creator_post_pick_idx` | `creator_post` 的两个归因指针索引 |
| 725 | `725_affiliate_product_ownership` | `client_id` 改可空；加 `ownership`（`own_brand` / `client_brand`）与归属-客户一致性 CHECK |
| 726 | `726_affiliate_pick_share` | `affiliate_pick` 加 `agency_share_rate`（机构留存比例）与 `service_fee_amount`（招商服务费） |
| 727 | `727_affiliate_settlement_settled_to` | `affiliate_settlement` 加 `settled_to`（`agency` / `creator`） |

规则与 B0 一致：无外键、无级联、`workspace_id UUID NOT NULL`、软删 `archived_at`；每个二级索引一个单语句 `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS` 文件对，并逐个登记 `server/cmd/migrate/main.go` 的 `concurrentIndexCleanups`（714/715/716/717/718/719/720/721/722/723/724 共 11 条）。`affiliate_daily` 的唯一键内联在建表语句里（新表、无条件键，不需要部分索引）。**725–727 不新增索引**：三个新列都只在既有查询已经按主键 / `(workspace_id, created_at)` 取到的行上读取，既不过滤也不排序，加索引只会多一份写放大。

### 11.2 表

```sql
-- 709 + 725
affiliate_product(id PK, workspace_id,
  ownership TEXT NOT NULL DEFAULT 'client_brand' CHECK (ownership IN ('own_brand','client_brand')),
  client_id UUID,                                                 -- 卖家 = B0 crm_client；自营为空
  platform TEXT NOT NULL, platform_product_id TEXT NOT NULL,
  title TEXT NOT NULL, category TEXT,
  price NUMERIC(14,2), currency CHAR(3) NOT NULL DEFAULT 'CNY',
  commission_rate NUMERIC(6,5) CHECK (0..1),                      -- C3 量纲
  activity TEXT,                                                  -- 活动佣金名；NULL = 普通计划
  status TEXT NOT NULL DEFAULT 'on_shelf' CHECK (status IN ('on_shelf','off_shelf','ended')),
  owner_member_id UUID, created_by, created_at, updated_at, archived_at,
  -- 725：ownership 与 client_id 必须一致，一条 CHECK 管两个方向
  CHECK ((ownership='client_brand' AND client_id IS NOT NULL)
      OR (ownership='own_brand'    AND client_id IS NULL)))
-- 唯一：714，(workspace_id, platform, platform_product_id) WHERE archived_at IS NULL

-- 710 + 726
affiliate_pick(id PK, workspace_id, product_id UUID NOT NULL, creator_id UUID NOT NULL,
  commission_rate NUMERIC(6,5) CHECK (0..1),                      -- 定向计划；NULL = 用商品默认
  agency_share_rate NUMERIC(6,5) CHECK (0..1),                    -- 机构在佣金里的留存；NULL = 外部达人
  service_fee_amount NUMERIC(14,2) CHECK (>= 0),                  -- 招商/坑位服务费；NULL = 没有
  bound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  note TEXT, owner_member_id UUID, created_by, created_at, updated_at, archived_at)
-- 唯一：717，(workspace_id, product_id, creator_id) WHERE archived_at IS NULL

-- 711
affiliate_daily(id PK, workspace_id, pick_id UUID NOT NULL, stat_date DATE NOT NULL,
  gmv_amount NUMERIC(14,2) NOT NULL DEFAULT 0, order_count INT NOT NULL DEFAULT 0,
  refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  est_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
  settled_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'CNY', created_by, created_at, updated_at,
  UNIQUE (workspace_id, pick_id, stat_date))
-- 无 archived_at：只有 upsert 一条写路径，没有删除

-- 712 + 727
affiliate_settlement(id PK, workspace_id,
  period_start DATE NOT NULL, period_end DATE NOT NULL CHECK (period_end >= period_start),
  gross_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
  tech_service_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_deduction NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  settled_to TEXT NOT NULL DEFAULT 'agency' CHECK (settled_to IN ('agency','creator')),
  paid_at DATE, external_no TEXT, note TEXT, created_by, created_at, updated_at)
-- 无 archived_at、无 DELETE：结算单是平台事实

-- 713：creator_post 加两列（成交归因把内容与商品连起来）
creator_post.product_id UUID,   -- 这条发布挂的哪个商品
creator_post.pick_id UUID       -- 这条发布属于哪个推广计划
```

**三张标签决定钱的含义（725–727）**。709–724 只描述了"代卖商品 + 外部达人 + 佣金进机构号"这一半；另一半（自营商品、自有达人内部分成、平台直接结给达人）没有字段可写，于是录不进、也算不对：

| 标签 | 值 | 含义 |
| --- | --- | --- |
| `affiliate_product.ownership` | `own_brand` | 自营品牌商品：没有客户，佣金是**我们的收入** |
| | `client_brand` | 代卖客户商品：佣金是**客户的成本**，我们在这一串上的收入是招商服务费 |
| `affiliate_pick.agency_share_rate` | 0–1 | 机构在佣金里的留存比例；**NULL = 外部达人**（平台直结，我们没有分成） |
| `affiliate_pick.service_fee_amount` | ≥ 0 | 招商 / 坑位服务费，我们开票收的钱，平台不代收；NULL = 这项没有 |
| `affiliate_settlement.settled_to` | `agency` | 佣金打进了机构号 = **我们确认的收入** |
| | `creator` | 平台直接结给达人 = 只计入 GMV，**不计入我们的收入** |

不需要 handler 记性的两条都由数据库管住：`ownership` 与 `client_id` 用一条 CHECK 双向约束（`client_brand` 必须非空、`own_brand` 必须为空）；`settled_to` 只有两个合法值。`agency_share_rate` **不是** `commission_rate`：后者是平台佣金率（GMV 的比例），前者是佣金里我们留多少——0.2 × 0.3 = GMV 的 6 %，先佣金后分成，两步不能折成一个数。

**为什么商品独立于 `crm_brief`**：brief 是项目——一份预算、一个档期、一批交付；商品的生命周期比任何项目都长，同一个 SKU 会被多个达人在多个月里反复选品，日成交是记在商品（经 pick）上的。把它塞进 brief 链只能逼出"每个 SKU 每个周期建一个 brief"，并丢掉这一域真正的原子事实：商品 × 达人 × 日期。`client_id` 只表示**谁付这笔佣金**（卖家），与坑位费的合作单没有关系；自营商品**没有**卖家，这正是它必须可空的原因。

**为什么 `daily` 与 `settlement` 分开**：两者是不同粒度的两份平台口径，互相不能推算。`affiliate_daily` 是平台报表的**日快照**——按 (pick, 日期) 报 GMV、退款、预计/已结佣金；退款单独一列，**不直接净额**，因为退款可能落在与成交不同的一天，写时净额会让过去某天的数字被后来的退款改写。`affiliate_settlement` 是平台按周期出的**结算单**——有技术服务费、退款扣减、平台四舍五入和活动调整，`net = gross − tech_service_fee − refund_deduction` 只是文档，**一律以平台给的数为准**，服务端不重算、不覆盖 `net_amount`（重算会把"平台数与我们加总不一致"这件事本身抹掉）。合成一张表就会被迫在"日"上分摊一笔"周期"的费用，或反过来把日数据复制进结算单。

### 11.3 REST（基址 `/api/workbench/affiliate`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/products` | 列表（`?client_id=&status=&platform=&limit=&cursor=`）/ 新建 |
| GET/PATCH/DELETE | `/products/{productId}` | 单条；DELETE = 软删 |
| GET/POST | `/picks` | 列表（`?product_id=&creator_id=&status=&limit=&cursor=`）/ 新建 |
| GET/PATCH/DELETE | `/picks/{pickId}` | 单条；DELETE = 软删 |
| GET | `/daily` | 日事实列表（`?pick_id=&from=&to=&limit=`，`stat_date DESC`） |
| PUT | `/daily` | 按 `(pick_id, stat_date)` upsert，**一次一条**；body 即整天，整体覆盖；返回 `201`（新建或覆盖同一天） |
| GET/POST | `/settlements` | 列表（`?status=&from=&to=&limit=`，`summary` 同款重叠窗口）/ 新建 |
| PATCH | `/settlements/{settlementId}` | 单条；**没有 DELETE**，也没有 GET 单项 |
| GET | `/summary?month=YYYY-MM&department_id=` | 月度聚合，见 §11.5 |

信封沿用 §3.1：`{ <resource>: T[], total }`，`total` = 本页条数；资源名 `products` / `picks` / `daily` / `settlements`（`daily` 是集合名词，不加 s）。单条 / 新建 / 更新直接返回对象，删除 `204` 无 body。商品与选品列表支持 `?cursor=`（与 CRM 列表一致的 keyset，不额外返回 `next_cursor`）；结算单与日事实按周期 / 日期读，只接受 `limit`（默认 50、上限 200）。

**权限**（与 B0 同一套 `workbenchCanWrite` / `workbenchOwnerForCreate` / `workbenchOwnerForUpdate`）：

| 资源 | 判断依据 |
| --- | --- |
| `affiliate_product` | 行自己的 `owner_member_id`；member 只能写自己拥有的行，新建时自动归自己，且不能把新行指给别人 |
| `affiliate_pick` | 行自己的 `owner_member_id`；**新建还要求可写该商品**（与"不能给别人的达人发内容"同理，否则会造出一条 member 谁也维护不了的 pick） |
| `affiliate_daily` | 无 owner 列，**沿 pick 的 owner 判权**（日事实归属它的推广计划，不另立第二份真相） |
| `affiliate_settlement` | **按角色**：只有 `owner`/`admin` 能写。结算单是覆盖整个工作区所有 pick 的周期账单，没有一行可以继承 owner（同 `/finance/months` 的月度录入） |

`department_id` 只筛聚合，不参与鉴权。§3.1 的金额规则照旧：金额一律 JSON number。

**725–727 的写入面**：

| 端点 | 新字段 | 规则 |
| --- | --- | --- |
| `POST/PATCH /products` | `ownership`（缺省 `client_brand`）、`client_id`（可空） | 两者必须一致：`client_brand` 必须带 `client_id` 且是本工作区的客户；`own_brand` 必须不带。不一致 **400**，错误信息说出是哪个字段（handler 与数据库 CHECK 各拦一次） |
| `POST/PATCH /picks` | `agency_share_rate`（0–1，可空）、`service_fee_amount`（≥ 0，可空） | 越界 **400**；省略即 NULL（"不是内部分成" / "没有服务费"），不是 0 |
| `POST/PATCH /settlements` | `settled_to`（缺省 `agency`） | 只接受 `agency` / `creator`，其它值 **400** |

PATCH 的合并顺序是"先算 `ownership`，再按它校验合并后的 `client_id`"，所以一次 PATCH 里同时改归属并把 `client_id` 写成 `""` 是合法切换（反过来，只改归属不清卖家会被 **400** 拦住）。

### 11.4 事件与实时

B2 **不新增 WS 事件名**。理由：事件名的前端登记在 `packages/core/types/events.ts` 与 patcher（`packages/views/**`），两者都不在本批范围内；发一个没人登记的事件只会让"事件发了但没人理"看起来像通的。客户端改由 mutation 主动失效 `["affiliate", wsId]`（含 summary）与 `["workbench", wsId]`，语义与 B0 的 patcher 相同，只是少了跨端推送这一层。加事件时需要：`events.ts` 追加 `affiliate_product:changed` / `affiliate_pick:changed` / `affiliate_daily:changed` / `affiliate_settlement:changed`（payload `{ id }`，daily 再带 `pick_id`）、views 侧 patcher、服务端 `publish`。

### 11.5 月度聚合 `GET /summary`

```json
{
  "window": { "month": "2026-11" },
  "gmv":                { "value": 2000, "sample_count": 3,    "empty": "zero" },
  "commission_est":     { "value": 400,  "sample_count": 3,    "empty": "zero" },
  "commission_settled": { "value": 160,  "sample_count": 2,    "empty": "zero" },
  "commission_agency":  { "value": 440,  "sample_count": 2,    "empty": "zero" },
  "commission_creator": { "value": 60,   "sample_count": 1,    "empty": "zero" },
  "agency_share_income": { "value": 40,  "sample_count": 1,    "empty": "zero" },
  "refund_rate":        { "value": 0.05, "sample_count": 3,    "empty": "zero" },
  "tech_fee":           { "value": null, "sample_count": 0,    "empty": "insufficient_data" },
  "pick_count":         { "value": 1,    "sample_count": 1,    "empty": "zero" },
  "active_creator_count": { "value": 1,  "sample_count": 1,    "empty": "zero" }
}
```

| 块 | 口径 | 空值 |
| --- | --- | --- |
| `gmv` / `commission_est` | 本月 `affiliate_daily.gmv_amount` / `est_commission` 之和；`sample_count` = 参与求和的**天数**（`stat_date` 落在本月）。**不分结算对象**：佣金进了机构号还是平台直结给达人，成交都是成交。**已归档 pick 的日行仍计入**：计划结束不该抹掉它已经卖出去的数，否则过去某个月的 GMV 会随归档改写 | `insufficient_data`（没有报表 ≠ 0） |
| `commission_settled` | 本月 `settled_commission` 之和（两侧合计，回答"结了多少佣金"，不回答"我们赚了多少"）；`sample_count` = `settled_commission <> 0` 的天数，所以"结算单还没打款"是缺口不是 0 | `insufficient_data` |
| `commission_agency` | **我们真正收到的钱** = 与本月重叠、`settled_to='agency'` 的结算单 `net_amount` 之和 + 本月 `bound_at` 的 live pick 的 `service_fee_amount` 之和（招商服务费我们自己开票，平台不代收，任何结算单都不会提到它）。`sample_count` = 两类来源行数（agency 结算单数 + 有服务费的 pick 数） | `insufficient_data`：两类来源都没有 |
| `commission_creator` | 与本月重叠、`settled_to='creator'` 的结算单 `net_amount` 之和——**给达人/平台的钱**，只进 GMV 口径。`sample_count` = 这类结算单数 | `insufficient_data` |
| `agency_share_income` | `settled_commission × agency_share_rate` 之和，只算 `agency_share_rate` 非 NULL（= 自有达人）的日行；外部达人按定义不贡献（佣金本来就不是我们的）。`sample_count` = 既有分成率又有已结佣金的天数。比率一律 0–1（C3） | `insufficient_data` |
| `refund_rate` | Σ`refund_amount` ÷ Σ`gmv_amount`，**0–1 量纲**（C3，展示 ×100）；`sample_count` = `gmv_amount > 0` 的天数（分母的天） | `insufficient_data`：本月 GMV 为 0 |
| `tech_fee` | 与本月**有重叠**的结算单（`period_start < 月末 AND period_end >= 月初`）的 `tech_service_fee` 之和；`sample_count` = 这些结算单数 | `insufficient_data`：没有重叠的结算单，**或带了 `department_id`**——结算单是工作区级账单，没有可回退的部门归属，此时报缺口而不是一个无视过滤的总额 |
| `pick_count` | 本月 `bound_at` 落在期间的**live** pick 数（`archived_at IS NULL`） | `zero`（真零） |
| `active_creator_count` | 同上行集合的 `DISTINCT creator_id` 数 | `zero`（真零） |

- **`commission_agency` 与 `commission_creator` 不能相加成"佣金总额"再当收入**：`creator` 那一半是平台付给达人的钱，我们从来没收到过；把它们合并就是重复计算收入，这正是 727 存在的理由。
- 结算单的 `status` 不参与这两块的过滤：与 `commission_settled` 同口径，"已结"指已进入结算周期，不等同于已到账（到账日是 `paid_at`，另有记录）。带 `department_id` 时 `commission_agency` / `commission_creator` 一律报缺口——它们读的是工作区级结算单，只报服务费那半会得到"半个总额"，比缺口更误导。
- `month` 缺省取数据库 `now()` 的自然月；入参 `YYYY-MM`（也接受月初 `YYYY-MM-DD`），必须是月初否则 **400**；`window.month` 由 SQL 自己的月份边界回显，标签与数字不可能指向不同月份。
- 部门过滤沿 B0 回退链：日事实 / pick → pick 的 `owner_member_id` 的 `member.department_id`；不参与鉴权。
- 形状与 `/overview`、`/finance` 完全一致（Go 侧复用 `WorkbenchMetricValue`，`empty` 只发 `zero` / `insufficient_data`）。

### 11.6 Query key

```
["affiliate", wsId, resource, filters]        // resource ∈ products|picks|daily|settlements
["affiliate", wsId, resource, { id }]         // 商品 / 选品的详情
["affiliate", wsId, "summary", month ?? "current", departmentId ?? "all"]
```

`packages/core/affiliate/{index,queries,mutations}.ts`；mutation 失效 `affiliateKeys.all(wsId)` + `workbenchKeys.all(wsId)`。

### 11.7 已知债务与本批未做

- **WS 事件**：见 §11.4。
- **MCP 只读工具**：`/api/mcp/workbench` 的 `domain` 枚举仍是九个，未加 `affiliate_*`；要加需同时扩 `workbenchMCPLedgerDomainNames` 与 dispatcher。
- **`creator_post` 的两个新列暂时没有写入路径**：713 只加列与索引，`workbench_creator.go`（B0 的发布台账）不在本批写作用域内、行为未改，所以 `POST/PATCH /api/workbench/creator-posts` 既不接收也不返回 `product_id` / `pick_id`，新发的行这两列恒为 NULL。前端 `CreatorPost` 类型与 zod schema 已按"可空、缺省 null"登记，等服务端接上就是同一份契约；接线时要：请求结构体加两个字段、写入前校验指向本工作区内存在的商品 / 选品、响应回显。
- **`affiliate_daily` 的 PUT 是整天覆盖**：省略的度量存 0（"报表说这天没成交"），不是保留旧值；这正是"重导一份报表不重复计数"的代价，客户端必须送完整的一天。
- **`price` 不叫 `_amount`**：它保留业务原名（售价），因为它是 SKU 的属性而不是应收/应付的一笔金额；B0 §1 的"金额字段以 `_amount` 结尾"在这一个字段上是有意的例外。
- **达人的自有/外部只有 pick 级标记**：725–727 用 `agency_share_rate IS NULL` 表示"外部达人"，没有独立的达人归属字段。同一达人可以自有一段时间、外部一段时间，所以标记落在 pick（一次合作）上是对的；但"这个达人是不是我们签的"无法在达人档案上直接筛，需要扩展 `creator` 表时再补，本批不做。
- **`commission_agency` / `commission_creator` 不看结算单 `status`**：逾期未打款的结算单已经计入收入。若财务口径要"仅已到账"，得给这两块单独加 `status='paid'` 版本，而不是改现有口径（会改动历史月份的读数）。
- **服务费只按 pick 的绑定月计入**：`service_fee_amount` 在 pick 上，没有独立的发生日，所以 `commission_agency` 把它算在 `bound_at` 所在月。跨月分期收的服务费需要拆成多条 pick 或后续加一张服务费表。
- **UI / views 未接入**：本批只到 core 类型、zod 与 client；`packages/views/**` 不在写作用域内，所以月度指标条仍然只读原来的七个块，三个新块的展示要等界面批次。
- **`ops_finance_month`（707）既不在 teardown 也不在 manifest**：与本批无关的既有缺口，`TestWorkspaceDeletionManifestCoversPublicSchema` 在已有该表（以及 `external_auth_identity`、`knowledge_*`）的库上会因此报漂移；四张新表已分类且在 `DeleteWorkspaceWorkbenchLedger` 内。

## 9. 完成定义（DoD）

一个域算完成，当且仅当：迁移可 up/down 往返、`make sqlc` 无脏 diff、handler 有权限用例、事件发出、zod 覆盖响应、`useRealtimeSync` 有 patcher、`/overview` 里对应指标从 `insufficient_data` 变为有值、页面能读能写。

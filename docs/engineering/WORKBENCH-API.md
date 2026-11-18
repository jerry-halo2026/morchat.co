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
| GET/POST | `/creators` | 列表（`?kind=&q=&sort=&limit=&cursor=`，每行带最新内容健康度，见 §19.3）/ 新建 |
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
| 达人列表额外 | `next_cursor: string \| null`（本页满时返回最后一行 id，即 `?cursor=` 接受的取值；只有 creators 分页，其余列表全量返回，服务端硬上限 500 行）；每行另带 `engagement_rate` / `hit_rate` / `posts_last_30d` / `videos_with_stats` / `metric_captured_on` 五个可空健康度字段（§19.3） |
| 分页参数 | `?cursor=<上一页最后一行 id>&limit=<n>`，`limit` 默认 50、上限 200；游标解析失败返回 **400**，不静默返回空页。达人列表的 cursor 按当前 `sort` 重新解析成 `(排序值, fans, id)` 三元组（§19.3） |
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

## 12. 内容工作台契约（IP → 选题 → 脚本 → 拍摄 → 发布/复盘）

内容侧原来在库里一张表都没有：`creator.media_ip_project_id` 只是指向通用 `project` 的弱指针，不是 IP 实体；`creator_post` 能记"已经发出去的一条内容"，记不了"计划要发的"。本节把那条流水线落成四张表 + 三个关联列。

```
IP（人设/赛道/受众）→ 一个 IP 挂多个平台账号（creator）
   → 热点雷达/人工 → 选题池（五维打分）→ 脚本（按版本）→ 拍摄排期（镜头清单）
   → 发布（复用 creator_post，加 media_script_id）→ 数据复盘（既有 creator_post_metric）
```

### 12.1 迁移号段

| 号 | 文件 | 内容 |
| --- | --- | --- |
| 728 | `728_media_ip.up/down.sql` | 表 `media_ip` |
| 729 | `729_creator_media_ip.up/down.sql` | 列 `creator.media_ip_id` + 两列注释 |
| 730 | `730_media_topic.up/down.sql` | 表 `media_topic` |
| 731 | `731_media_script.up/down.sql` | 表 `media_script` |
| 732 | `732_media_shoot.up/down.sql` | 表 `media_shoot` |
| 733 | `733_creator_post_media_script.up/down.sql` | 列 `creator_post.media_script_id` |
| 734 | `734_media_ip_name_unique` | UNIQUE `(workspace_id, lower(name)) WHERE archived_at IS NULL` |
| 735 | `735_media_ip_status_idx` | `(workspace_id, status)` |
| 736 | `736_creator_media_ip_idx` | `creator (workspace_id, media_ip_id)` 部分索引 |
| 737 | `737_media_topic_ip_idx` | `media_topic (workspace_id, ip_id)` |
| 738 | `738_media_topic_status_idx` | `media_topic (workspace_id, status)` |
| 739 | `739_media_script_version_unique` | UNIQUE `(workspace_id, topic_id, version) WHERE archived_at IS NULL` |
| 740 | `740_media_script_status_idx` | `media_script (workspace_id, status)` |
| 741 | `741_media_shoot_script_idx` | `media_shoot (workspace_id, script_id)` |
| 742 | `742_media_shoot_date_idx` | `media_shoot (workspace_id, shoot_date, id)` |
| 743 | `743_creator_post_media_script_idx` | `creator_post (workspace_id, media_script_id)` 部分索引 |

十个索引全部是单语句 `CREATE [UNIQUE] INDEX CONCURRENTLY`，up 方向逐个登记在 `server/cmd/migrate/main.go` 的 `concurrentIndexCleanups`；down 方向只有 `DROP INDEX CONCURRENTLY IF EXISTS`（不重建索引，故不进 down map）。

### 12.2 表

```sql
-- 728
media_ip(
  id UUID PK, workspace_id UUID NOT NULL,
  name TEXT NOT NULL, persona TEXT, track TEXT, audience TEXT, color TEXT,
  week_goal INTEGER NOT NULL DEFAULT 0 CHECK (week_goal >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  owner_member_id UUID, created_by UUID, created_at, updated_at, archived_at)

-- 729：平台账号 → IP
ALTER creator ADD COLUMN media_ip_id UUID;   -- 新实体指针
-- media_ip_project_id（660）不动：它是历史的 project 指针，既有指标在 join 它

-- 730
media_topic(
  id UUID PK, workspace_id UUID NOT NULL, ip_id UUID NOT NULL, title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('hot','manual','bench','ai')),
  scores JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scores) = 'object'),
  status TEXT NOT NULL DEFAULT 'pool' CHECK (status IN
    ('pool','scripting','shooting','publishing','done','dropped')),
  hot_id UUID, note TEXT, owner_member_id UUID, created_by UUID,
  created_at, updated_at, archived_at)

-- 731
media_script(
  id UUID PK, workspace_id UUID NOT NULL, topic_id UUID NOT NULL, ip_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  hook TEXT, body TEXT, cta TEXT, cover_note TEXT, tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','archived')),
  publish_at TIMESTAMPTZ, owner_member_id UUID, created_by UUID,
  created_at, updated_at, archived_at)

-- 732
media_shoot(
  id UUID PK, workspace_id UUID NOT NULL, script_id UUID NOT NULL, shoot_date DATE NOT NULL,
  location TEXT,
  shots JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(shots) = 'object'),
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(checklist) = 'object'),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN
    ('planned','shooting','editing','done','cancelled')),
  owner_member_id UUID, created_by UUID, created_at, updated_at, archived_at)

-- 733：发布 → 脚本
ALTER creator_post ADD COLUMN media_script_id UUID;
```

规则与 B0 一致：无外键、无级联、`archived_at` 软删、每个索引单独一个并发文件。**发布不新建表**：一条发布就是 `creator_post` 的一行（账号 + URL + 时间），复盘数据挂既有的 `creator_post_metric`；733 只补上"这条发布出自哪个脚本"的指回列，多对一（一个脚本发到多个账号），可空（外部达人的发布、内容工作台上线前的历史行都没有脚本）。

**两个 `media_ip_id` 的关系**（这是本节最容易搞错的一点）：

| 列 | 是什么 | 谁读 |
| --- | --- | --- |
| `creator.media_ip_id`（729） | 新实体，这个人设 | 内容流水线全链路（选题 / 脚本 / 拍摄） |
| `creator.media_ip_project_id`（660） | 历史指针，指向通用 `project` | 既有达人指标 join；内容侧不读 |

一行可以两列都有（一个 IP 通过一个项目交付），但两者不互相推导：项目指针是历史，IP 是流水线的父。

### 12.3 REST（基址 `/api/workbench/media`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/ips` | 列表（`?status=&limit=`）/ 新建 |
| GET/PATCH/DELETE | `/ips/{ipId}` | 单条 / 改 / 软删；GET 返回 IP **+ `accounts[]`** |
| POST | `/ips/{ipId}/accounts` | 把 `creator` 挂到 IP（写 `creator.media_ip_id`），body `{creator_id}`，**201** |
| DELETE | `/ips/{ipId}/accounts/{creatorId}` | 置空 `media_ip_id`，**204** |
| GET/POST | `/topics` | 列表（`?ip_id=&status=&limit=`）/ 新建 |
| GET/PATCH/DELETE | `/topics/{topicId}` | 单条 |
| GET/POST | `/scripts` | 列表（`?topic_id=&status=&limit=`，同一 topic 返回全部版本）/ 新建 |
| GET/PATCH/DELETE | `/scripts/{scriptId}` | 单条；PATCH 默认生成新版本，`?inPlace=1` 覆盖当前行 |
| GET/POST | `/shoots` | 列表（`?script_id=&from=&to=&limit=`，按 `shoot_date`，含边界）/ 新建 |
| GET/PATCH/DELETE | `/shoots/{shootId}` | 单条 |

包裹与序列化沿用 §3.1：列表 `{ <resource>: T[], total }`，`resource` 为 `ips` / `topics` / `scripts` / `shoots`，`total` = **本页条数**；单条不包裹；删除 204。`limit` 默认 50、上限 200（`workbenchLimit`）。

- **`shoot_date` 是 DATE 且 NOT NULL**：没有日期的排期不叫排期，`?from=&to=` 也会把它悄悄漏掉。`from > to` 是 **400**，不是空列表。
- **`scores`**：key 只有 `pain` / `save` / `debate` / `susp` / `fit` 五个，值必须是 0–100 的整数；越界、非整数、未知 key 都是 **400**。写入时服务器把请求合并进已存卡片（PATCH 只送一维不会清空另外四维），并归一化成五维全在；读取时宽容（未知 key 丢弃、非整数读 0）。
- **`checklist`**：`{项名: bool}`，PATCH **按键合并**——勾一个框不会清掉其余；送 `false` 是"没勾"这个状态，不是删除。
- **`shots`**：见 §12.5。
- 金额不出现：本域没有钱。比率只出现在既有 `creator_post_metric` / 精选联盟那边。

**权限**（写判定与 B0 同一套 `workbenchCanWrite` / `workbenchOwnerForCreate` / `workbenchOwnerForUpdate`）：

| 资源 | 写判定 |
| --- | --- |
| IP | 行自己的 `owner_member_id` |
| 账号挂载/摘除 | IP 的 owner（改的是 `creator` 行，但挂载权属于人设） |
| 选题 | 行自己的 `owner_member_id` |
| 脚本 | **沿 topic 的 owner**（`media_script.owner_member_id` 是插入时从 topic 拷来的副本，用于过滤与展示，不是写闸门） |
| 拍摄 | **沿 script → topic 的 owner** |

`owner`/`admin` 全写；`member` 只能写自己拥有的行；新建时省略 owner 就是"我自己"，member 指定别人当 owner 直接 **403**。脚本与拍摄的 owner 由 topic 派生，请求里指定成别的值一律 **400**——让两者分叉，就会让"我能改这个脚本"和"我能改这个选题"变成两个答案。

### 12.4 脚本版本化语义

- 一行 = **一个版本**，不是一份被反复覆盖的文档。`version` 在 topic 内单调递增，由 SQL 在 INSERT 里算 `MAX(version) + 1`（**含已软删的行**，所以号永不回收）；739 的唯一索引是并发兜底，撞号的那次请求得到 **409**，而不是两行 v2。
- `PATCH /scripts/{id}`：
  - 请求碰到任一**文案字段**（`hook` / `body` / `cta` / `cover_note` / `tags`）且没有 `?inPlace=1` → **插入新版本**，返回新行（v1 原封不动、仍可按 id 读，`GET /scripts?topic_id=` 一次拿到全部版本）；
  - 只碰 `status` / `publish_at` / `ip_id` → **就地更新**，不生版本（把"复审通过"当成一次改稿会把文案历史淹掉）；
  - `?inPlace=1` → 就地覆盖该行，用于修错别字这类"不是新版本"的改动。
- 新版本继承链的身份：同 topic、同 IP、同 owner，`status` / `publish_at` 取请求里的值或沿用当前行；`created_by` 是本次改稿的人。
- 脚本不能换 topic（**400**）：换主题是另一份文档。
- `DELETE` 是软删，不删版本行；号已花掉。

### 12.5 `shots` 与 `shotlist.v1.json` 的对齐

`media_shoot.shots` 放的是 `contracts/library/domains/video/shotlist.v1.json`（`docs/engineering/LIBRARY.md:35-51`）里已冻结的那份契约，**不是自造格式**：

| 契约 | 我们对齐的方式 |
| --- | --- |
| `required: [schema_version, title, duration_ms, aspect_ratio, shots]` | 写时校验：缺任一 → 400 |
| `schema_version: {const: "shotlist.v1"}` | 只接受字面量 `"shotlist.v1"` |
| `title` 1–120 | 按 rune 计长度 |
| `duration_ms` 1000–600000 | 同上区间 |
| `aspect_ratio` ∈ `9:16｜16:9｜1:1` | 枚举 |
| `shots` 1–200 项 | 同上区间 |
| 每镜 `index/start_ms/end_ms/shot_size/scene/rhythm` 必填 | 缺任一 → 400 |
| `shot_size` ∈ `close-up｜medium｜wide`（景别，single） | 枚举 |
| `rhythm` ∈ `fast-cut｜steady｜slow`（节奏，single） | 枚举 |
| `scene` ∈ `indoor｜outdoor｜shelf｜studio`（场景，single） | 枚举 |
| `selling_points[]` ∈ `price｜gift｜ingredient｜effect｜proof｜pain-point`（卖点，multi） | 逐项枚举 |
| `text` ≤200、`product_ref` ≤80 | 按 rune 计长度 |
| `additionalProperties: false` | `json.Decoder.DisallowUnknownFields()` |

唯一不由契约描述的状态是**空对象 `{}`**：它是列默认值，含义"镜头清单还没排"。契约要求 `shots` 至少 1 项，所以"没排"不能用契约表达，只能作为 `{}` 这一个额外取值存在——客户端 zod 用 `z.unknown()` 原样透传文档（不在前端再实现一遍契约，避免两份契约要手工同步），空对象由 `MediaShoot.shots` 的类型 `MediaShotList | Record<string, never>` 表达。

于是列里只可能是两种值：`{}`，或一份满足 shotlist.v1 的文档。契约升级到 v2 时旧行仍是合法的 v1，不需要迁移——这正是用 JSONB 而不是拆子表的原因。没有任何索引索引 JSON 内部：镜头清单永远整份读。

`checklist` 的键是运营自己维护的拍摄清单项，不是我们的词表，所以同样是 JSONB：给每一项建行会逼着每次加清单项都走一次 fixture 迁移。

### 12.6 事件与 query key

事件（`workbench_media.go` 内定义，写成功后发出）：`media_ip:changed` / `media_topic:changed` / `media_script:changed` / `media_shoot:changed`，payload `{ "id": "<row id>" }`；账号挂载/摘除额外发既有的 `creator:changed`（改的是 `creator` 行）。

```
["media", wsId, resource, filters]     // resource ∈ ips|topics|scripts|shoots
["media", wsId, resource, { id }]      // 详情（含 ips 的 accounts）
```

`packages/core/media/{index,queries,mutations}.ts`（导出 `./media`、`./media/queries`、`./media/mutations`）；类型在 `packages/core/types/media.ts`（**不塞进 `workbench.ts`**），zod 在 `packages/core/api/schemas.ts`，`api/client.ts` 有同名方法。mutation 失效 `mediaKeys.all(wsId)` + `workbenchKeys.all(wsId)`：一次挂账号会改 IP 详情，一次改稿会改整个版本列表，局部失效会留下描述旧链的界面。

### 12.7 已知债务与本批未做

- **UI / views 未接入**：本批只到迁移、SQL、handler、core 类型/zod/client；`packages/views/**`、`apps/**` 不在写作用域。
- **前端实时 patcher 未注册**：`packages/core/types/events.ts` 不在本批作用域，四个 `media_*:changed` 目前只有服务端发出，客户端靠 mutation 失效刷新；接实时时按 §12.6 的 payload 加 patcher 即可。
- **`creator_post.media_script_id` 暂时没有写入路径**：`workbench_creator.go` 不在本批作用域、行为未改，所以 `POST/PATCH /creator-posts` 既不接收也不返回该列，新发的行恒为 NULL。接线时要：请求结构体加字段、写入前校验脚本在本工作区、响应回显。
- **`GET /creators` 不返回 `media_ip_id`**：同一原因（B0 handler 不在写作用域），`CreatorResponse` 没有这个字段；当前要从 IP 侧读账号（`GET /media/ips/{id}` 的 `accounts[]`）。接线时给 `CreatorResponse` 加字段即可，不会破坏旧客户端（新字段缺省即 null）。
- **`/counts`、`/overview` 不含内容侧**：侧栏计数与指标条未扩展，本批不做聚合端点；列表 `total` 因此就是本页条数。
- **MCP 只读工具未扩**：`/api/mcp/workbench` 的 `domain` 枚举未加 `media_*`。
- **`hot_id` 是裸指针**：热点表不在本工作区范围（热点雷达尚未落库），读写都不校验存在性。
- **`score_count` 之类的汇总没有**：五维分数的均值/分布要等选题看板批次，本批只存不算。
- **不做**：素材库（`library_*`）、AI 生成选题/文案、发布编排（多账号定时投递）、数据复盘的新口径——复盘沿用 `creator_post_metric`。

## 13. 总经理工作台契约（OKR 目标 + 市场雷达信号）

原 `workstation-BOSS-main`（9 个页面）是老板视角：团队、市场雷达、目标拆解、任务派发、客户商机、经营数据。其中四块在本仓库已有落点——

| 原页面 | 已有承载 |
| --- | --- |
| 任务派发 | `issue` + `project` + `issue_workflow` + `issue_property` |
| 客户商机 | `crm_client` / `crm_brief` / `crm_collab` / `crm_settlement` |
| 经营数据 | `ops_finance_month` + `GET /api/workbench/finance` + `affiliate_*` |
| 团队画像 | `member` + `hr_employee_profile`（`ability` / `disc` 已是 JSONB） |

真正缺的只有两块，本节把它们落成四张表加一个列：

```
目标拆解  goal（周期 / 负责人）→ 关键结果（target / current）→ 部门分包（谁负责那一份）
                                   ↑
                              issue.goal_id（哪个任务在推进它）

市场雷达  market_signal（分级 / 相关性 / 紧急度）→ convert → 上面那个 goal，或一个 issue
```

`issue_wakeup` 不是雷达：wakeup 是"对已存事实的订阅"（某个 issue、某个 PR 到了一个状态就叫醒我），它不存观测本身。信号必须在 workspace 里还没有任何东西可订阅的时候就先存下来，这就是 `market_signal`。

### 13.1 迁移号段

| 号 | 文件 | 内容 |
| --- | --- | --- |
| 744 | `744_goal_okr.up/down.sql` | 表 `goal_okr` |
| 745 | `745_goal_key_result.up/down.sql` | 表 `goal_key_result` |
| 746 | `746_goal_package.up/down.sql` | 表 `goal_package` |
| 747 | `747_market_signal.up/down.sql` | 表 `market_signal` |
| 748 | `748_issue_goal_id.up/down.sql` | 列 `issue.goal_id` + 列注释 |
| 749 | `749_goal_okr_cycle_title_unique` | UNIQUE `(workspace_id, cycle, lower(title)) WHERE archived_at IS NULL` |
| 750 | `750_goal_okr_status_idx` | `goal_okr (workspace_id, status, cycle)` |
| 751 | `751_goal_okr_owner_idx` | `goal_okr (workspace_id, owner_member_id)` |
| 752 | `752_goal_key_result_goal_idx` | `goal_key_result (workspace_id, goal_id, position)` |
| 753 | `753_goal_package_goal_idx` | `goal_package (workspace_id, goal_id, position)` |
| 754 | `754_goal_package_department_idx` | `goal_package (workspace_id, department_id)` |
| 755 | `755_market_signal_cut_idx` | `market_signal (workspace_id, cut, score DESC)` |
| 756 | `756_market_signal_status_idx` | `market_signal (workspace_id, status)` |
| 757 | `757_issue_goal_idx` | `issue (workspace_id, goal_id, number)` 部分索引，`WHERE goal_id IS NOT NULL` |

九个索引全部是单语句 `CREATE [UNIQUE] INDEX CONCURRENTLY`，up 方向逐个登记在 `server/cmd/migrate/main.go` 的 `concurrentIndexCleanups`；down 方向只有 `DROP INDEX CONCURRENTLY IF EXISTS`（不重建索引，故不进 down map）。建表 744–747 与加列 748 每张表/每列一个文件；`issue.goal_id` 用 `ADD COLUMN IF NOT EXISTS`（`issue` 是既有大表，重跑安全）。

### 13.2 表

```sql
-- 744
goal_okr(
  id UUID PK, workspace_id UUID NOT NULL,
  cycle TEXT NOT NULL,                    -- 2026Q4 / 2026-11 / 2026H2，自由文本
  title TEXT NOT NULL, description TEXT,
  owner_member_id UUID NOT NULL,          -- 写闸门，NOT NULL：没人负责的目标不算目标
  department_id UUID,                     -- 可空：公司级目标不属于某一个部门
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','done','cancelled')),
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'P2' CHECK (priority IN ('P0','P1','P2')),
  created_by UUID, created_at, updated_at, archived_at)

-- 745
goal_key_result(
  id UUID PK, workspace_id UUID NOT NULL, goal_id UUID NOT NULL,
  title TEXT NOT NULL,
  target NUMERIC(14,2) CHECK (target >= 0),      -- 可空：数字还没定时仍是这个目标的关键结果
  current NUMERIC(14,2) NOT NULL DEFAULT 0,      -- 写入值，不在读时算（§13.5）
  unit TEXT,                                     -- % / 万元 / 个，自由文本
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'on_track'
    CHECK (status IN ('on_track','at_risk','off_track','done')),
  created_by UUID, created_at, updated_at, archived_at)

-- 746
goal_package(
  id UUID PK, workspace_id UUID NOT NULL, goal_id UUID NOT NULL,
  department_id UUID NOT NULL,             -- 分包就是"分给哪个部门"，所以 NOT NULL
  title TEXT NOT NULL,
  owner_member_id UUID,                    -- 这一份谁扛；不是写闸门（§13.4）
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','done','cancelled')),
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID, created_at, updated_at, archived_at)

-- 747
market_signal(
  id UUID PK, workspace_id UUID NOT NULL, title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('market','competitor','channel','product','policy','other')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import')),
  url TEXT, summary TEXT,
  cut TEXT NOT NULL DEFAULT 'warm' CHECK (cut IN ('hot','warm','cold')),
  score NUMERIC(6,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  urgency TEXT NOT NULL DEFAULT 'medium' CHECK (urgency IN ('high','medium','low')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','reviewing','converted','dismissed')),
  converted_goal_id UUID, converted_issue_id UUID,   -- 落点，可同时为 NULL
  note TEXT, owner_member_id UUID,
  created_by UUID, created_at, updated_at, archived_at)

-- 748：任务侧
ALTER issue ADD COLUMN goal_id UUID;
```

规则与 B0 一致：无外键、无级联、`archived_at` 软删、每个索引单独一个并发文件、金额/比率用 NUMERIC 不用浮点。

**三个枚举为一列而不是拆表**：`cut`（分级）、`urgency`（紧急度）、`score`（0–100 相关性）是三件事——运营先按 `cut` 排雷达队列，热点里再按 `score` 排，`urgency` 决定叫醒谁。合成一个"重要度"就丢掉了"重要"和"马上要"的区别。

**`cycle` 是文本不是日期区间**：这套系统服务的公司规划周期口径不同（季度、月、半年），列表读按等值过滤而不是范围，`'2026Q4' > '2026Q3'` 本身也排得对。用日期列会逼所有调用方对"一季度多长"达成一致。

**两个"分区"级别的设计取舍**：

| 选择 | 理由 |
| --- | --- |
| `goal_okr.department_id` 可空、`goal_package.department_id` 必填 | 公司级目标不属于单个部门；而"分包"本身就是分给部门，缺部门的分包只是目标的副本 |
| `goal_key_result.target` 可空、`current` NOT NULL DEFAULT 0 | 没定数字的关键结果也是一条关键结果；而 `target = 0` 是"已经没达成"的断言，不能拿来表示"还没定" |
| `current` 允许 > `target` | 超额完成是正常结果，夹到 `target` 就把这个季度最好看的数字藏了 |
| `market_signal.converted_*` 都可空 | 未处理是常态，雷达的职责就是显示没处理的那些 |

### 13.3 REST（基址 `/api/workbench`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/goals` | 列表（`?cycle=&status=&limit=`）/ 新建；**每条内嵌 `key_results[]` 与 `packages[]`** |
| GET/PATCH/DELETE | `/goals/{goalId}` | 单条 / 改 / 软删；GET 额外返回 `issues[]` |
| POST | `/goals/{goalId}/issues` | 把已有 issue 挂到目标（写 `issue.goal_id`），body `{issue_id}`，**201** |
| DELETE | `/goals/{goalId}/issues/{issueId}` | 置空 `goal_id`，**204** |
| POST | `/goals/{goalId}/key-results` | 新建关键结果，**201** |
| PATCH/DELETE | `/goals/{goalId}/key-results/{keyResultId}` | 改 / 软删 |
| POST | `/goals/{goalId}/packages` | 新建部门分包，**201** |
| PATCH/DELETE | `/goals/{goalId}/packages/{packageId}` | 改 / 软删 |
| GET/POST | `/signals` | 列表（`?cut=&status=&category=&limit=`）/ 新建 |
| PATCH/DELETE | `/signals/{signalId}` | 改 / 软删（**不能**把 `status` 改成 `converted`） |
| POST | `/signals/{signalId}/convert` | body `{target:"goal"\|"issue", cycle?, department_id?, project_id?}`，**201**；已转换过 → **409** |

包裹与序列化沿用 §3.1：列表 `{ <resource>: T[], total }`，`resource` 为 `goals` / `signals`，`total` = **本页条数**；单条不包裹；删除 204。`limit` 默认 50、上限 200（`workbenchLimit`）。

- **子列表永远内嵌且永远不是 null**：`key_results` / `packages` / `issues` 缺省是 `[]`。一次看板读一个周期的目标只要三条语句（目标、关键结果、分包），不需要逐个目标再取一次进度；客户端也不必先判断"子列表取了没"。
- **子列表顺序是 `position`，同 position 按创建顺序**：运营排过的顺序就是渲染顺序，两条同 position 也不会随机跳。
- **`target < 0` 是 400**（`current > target` 不是错误）。列的 CHECK 是兜底，handler 先拦，这样错误信息点名"target"而不是把约束名漏出去。
- **`score` 越界（<0 或 >100）是 400**；`due_date` / `cycle` 的格式错误也是 400。
- **`status: "converted"` 不能 PATCH**：那个值属于 convert 端点，因为它总带着"变成什么"的指针；一个声称 converted 却没有 `converted_*` 的信号，列表无法解释。
- **`department_id` 不校验存在性**：部门是归属与筛选，不是访问边界（`docs/engineering/ORG-MODEL.md`），和 §12 的 `hot_id` 一样是裸指针。

### 13.4 权限

写判定与 B0 同一套（`workbenchCanWrite` / `workbenchOwnerForCreate` / `workbenchOwnerForUpdate`）：

| 资源 | 写判定 |
| --- | --- |
| 目标 | 行自己的 `owner_member_id` |
| 关键结果 | **沿 goal 的 owner** |
| 部门分包 | **沿 goal 的 owner**（`goal_package.owner_member_id` 是"这一份谁扛"，用于过滤与展示，不是闸门） |
| 信号 | 行自己的 `owner_member_id`（含 convert） |
| 目标 ↔ 任务挂载 | goal 的 owner（改的是 `issue.goal_id`，但挂载权属于目标） |

`owner`/`admin` 全写；`member` 只能改自己拥有的行；新建时省略 owner 就是"我自己"，member 指定别人当 owner 直接 **403**。关键结果与分包沿着目标的 owner 判权，是为了让"我能改这个目标"和"我能改它的关键结果"是同一个答案——让分包自带 owner 当闸门，改派目标负责人之后就会出现两套权限。

### 13.5 进度：`goal_key_result.current` 为什么不在读时算

`current` 是**写入的数字**，不是读时的聚合。写它的只有两条路：

1. 运营/负责人自己录入（`PATCH /goals/{id}/key-results/{krId}`）；
2. 应用层把挂在目标下的 issue 进度汇总后写回（`issue.goal_id`，748）——**本批不含这个汇总器**，接线见 §13.8。

读时算会毁掉对账：上周的经营会看到 62%，如果每次打开页面都用"现在的 issue 表"重算，一次任务重开就会让上周的 62% 变成 58%——同一个季度的两份导出永远不一致，也就无法和按它发的奖金对账。而且读时聚合是每次翻页都在跑一次无界扫描（OKR 看板一次列出整个周期的目标）。

这也是没有触发器、没有生成列的原因：那两者会把 `current` 变成"当前 issue 表的函数"，而不是"某人在某个时刻记录下来的事实"。**注释落在 745 与 748 的迁移文件里**，因为下一个想加触发器的人会先读那里。

### 13.6 convert 的幂等与落点

`POST /signals/{id}/convert` 是雷达唯一的出口：

| `target` | 建什么 | 落点列 |
| --- | --- | --- |
| `"goal"` | `goal_okr`（`cycle` 缺省当前季度，`status='active'`，owner 取信号 owner 否则取操作者） | `converted_goal_id` |
| `"issue"` | 一个真 issue（走 `IssueService.Create`：编号/查重/工作流状态/`issue:created` 广播一条都不少） | `converted_issue_id` |

- 一次调用只写其中一个指针，另一个保持 NULL；信号 `status` 变成 `converted`。
- **幂等**：handler 先在事务里 `SELECT … FOR UPDATE` 锁住信号并检查状态，再建目标/任务，最后用 `UPDATE … WHERE status <> 'converted'` 写落点。并发的第二次 convert 会等锁，然后在状态检查这里拿到 **409**，什么都不会创建；`ConvertMarketSignal` 的条件更新是"锁没盖住"时的兜底（回滚把已建的目标一起撤掉，不会留下无人指向的行）。
- **任务的描述**由信号的 `summary` + `url` + `note` 拼成：issue 界面读不到信号行，丢了这三段就丢了"为什么有这个任务"。
- 转换走 `IssueService.Create` 而不是直接 INSERT：任务编号、查重、状态目录、广播都在那一条路径里，绕过去就会出现"同一个 workspace 两个 12 号任务"这种事故。

### 13.7 事件与 query key

事件（`workbench_goal.go` 内定义，写成功后发出）：`goal:changed` / `market_signal:changed`，payload `{ "id": "<row id>" }`。关键结果、分包、任务挂载都发 `goal:changed`（挂载改的是 issue，但列表变化在目标侧）；convert 同时发 `market_signal:changed` 与 `goal:changed`。

```
["goal", wsId, resource, filters]     // resource ∈ goals|signals
["goal", wsId, resource, { id }]      // 详情（goals 含 issues）
```

`packages/core/goal/{index,queries,mutations}.ts`（导出 `./goal`、`./goal/queries`、`./goal/mutations`）；类型在 `packages/core/types/goal.ts`（**不塞进 `workbench.ts` / `media.ts`**），zod 在 `packages/core/api/schemas.ts`，`api/client.ts` 有同名方法。mutation 失效 `goalKeys.all(wsId)` + `workbenchKeys.all(wsId)`：一次 convert 既改信号又建目标，局部失效会留下"信号已转换但目标面板还是空的"。

### 13.8 已知债务与本批未做

- **UI / views 未接入**：本批只到迁移、SQL、handler、core 类型/zod/client；`packages/views/**`、`apps/**` 不在写作用域。
- **前端实时 patcher 未注册**：`packages/core/types/events.ts` 不在本批作用域，两个事件目前只有服务端发出，客户端靠 mutation 失效刷新。
- **任务 → 关键结果的自动汇总没有接线**：`issue.goal_id` 已经能挂、能按目标查（`GET /goals/{id}` 的 `issues[]`），但"任务完成后把进度写回某条 `current`"的应用层汇总器不在本批。写回时必须一条一条指定写哪条关键结果——那是人的判断（"这个任务算在签约金额还是签约数上"），不能由数据库猜，所以它也不会是触发器。
- **issue 响应不返回 `goal_id`**：`issue.go` 不在本批写作用域，`IssueResponse` 没有这个字段；当前只能从目标侧读任务（`GET /goals/{id}` 的 `issues[]`）。接线时给响应加字段即可，不会破坏旧客户端。
- **`/counts`、`/overview` 不含目标/信号**：侧栏计数与指标条未扩展，列表 `total` 因此就是本页条数。
- **MCP 只读工具未扩**：`/api/mcp/workbench` 的 `domain` 枚举未加 `goal_*` / `market_signal`。
- **没有信号自动抓取**：`source` 的 `ai` / `import` 是给导入器留的口子，本批没有爬虫、没有定时任务。
- **不做**：OKR 对齐树（目标之间的父子/依赖）、权限矩阵、目标模板与周期自动滚动、信号与外部数据源的自动去重。
- **归档目标不解除任务挂载**：`DELETE /goals/{id}` 归档目标、关键结果与分包，`issue.goal_id` 保留（"这个目标是误建的"不等于"把干过的活摘下来"）；目标读取都过 `goal_okr`，悬空指针不会被渲染。

## 14. 面试提纲契约（题库 + 某轮提纲）

原 HR 工作台有一页「笔试管理」：出卷、答题、判分。客户否掉了这个方向——**出卷与答题在 AI 时代都是伪需求**，候选人能搜到答案，判分也没有人真的回看。真正缺的是**给人事一份能问到点子的面试提纲**：坐下之前就知道这场面试要验证什么、每个问题在考察什么、什么样的回答算好、什么信号是红旗。

所以这一批建的是「提问资产」，不是「考试」：

```
hr_question（可复用，按岗位/维度沉淀）
   ↓ 挑题，或让生成器起草
hr_interview_guide.items（快照 + 顺序 + 现场要点）
   ↓ 面试时逐题勾选、记要点、给分
hr_scorecard（四维 40/20/20/20，§10）
```

关键取舍是**提纲是快照，不是引用**（§14.4）。题库改了不影响已经用过/正在用的提纲，否则历史记录会漂移。

### 14.1 迁移号段

| 号 | 文件 | 内容 |
| --- | --- | --- |
| 758 | `758_hr_question.up/down.sql` | 表 `hr_question` |
| 759 | `759_hr_interview_guide.up/down.sql` | 表 `hr_interview_guide` |
| 760 | `760_hr_question_job_idx` | `hr_question (workspace_id, job_id)` |
| 761 | `761_hr_question_dimension_idx` | `hr_question (workspace_id, dimension)` |
| 762 | `762_hr_question_question_unique` | UNIQUE `(workspace_id, lower(question)) WHERE archived_at IS NULL` |
| 763 | `763_hr_interview_guide_candidate_round_unique` | UNIQUE `(workspace_id, candidate_id, round) WHERE archived_at IS NULL` |
| 764 | `764_hr_interview_guide_interview_idx` | `hr_interview_guide (workspace_id, interview_id, candidate_id)` |
| 765 | `765_hr_interview_guide_status_idx` | `hr_interview_guide (workspace_id, status)` |

六个索引全部是单语句 `CREATE [UNIQUE] INDEX CONCURRENTLY`，up 方向逐个登记在 `server/cmd/migrate/main.go` 的 `concurrentIndexCleanups`；down 方向只有 `DROP INDEX CONCURRENTLY IF EXISTS`（不重建索引，故不进 down map）。建表 758–759 每张表一个文件。

### 14.2 表

```sql
-- 758
hr_question(
  id UUID PK, workspace_id UUID NOT NULL,
  job_id UUID,                            -- 可空：NULL = 通用题
  dimension TEXT NOT NULL
    CHECK (dimension IN ('skill','experience','culture','potential','risk')),
  question TEXT NOT NULL CHECK (btrim(question) <> ''),
  intent TEXT,                            -- 考察什么
  signals TEXT,                           -- 好答案的特征
  red_flags TEXT,                         -- 什么回答要警惕
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','ai','template')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  owner_member_id UUID, created_by UUID,
  created_at, updated_at, archived_at)

-- 759
hr_interview_guide(
  id UUID PK, workspace_id UUID NOT NULL,
  interview_id UUID,                      -- 可空：还没约面试也能先备提纲
  candidate_id UUID NOT NULL,
  job_id UUID,
  round SMALLINT NOT NULL DEFAULT 1 CHECK (round > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','used')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT, owner_member_id UUID, created_by UUID,
  created_at, updated_at, archived_at)
```

规则与 B0 一致：无外键、无级联、`archived_at` 软删、每个索引单独一个并发文件。

**`dimension` 复用记分卡四维再补一个 `risk`**：`skill` / `experience` / `culture` / `potential` 与 `hr_scorecard` 一致（683），这样提纲的一条条与评审人之后要填的卡片是同一套词；`risk` 是额外的一维，因为「用来问出淘汰信号的问题」不是「技能很低」——把红旗维度并进技能分，等于把红旗平均成一个 3。

**`round` 是 NOT NULL**：契约原文只写了 `round INTEGER`，但它是「一人一轮一份提纲」这个唯一键（763）的一半，可空会让同一个人第一轮的提纲因为 NULL 互不相等而能建两份。空值的语义也没有别的解释——没有第 0 轮。

**`items` 是 JSONB 数组而不是子表**：一份提纲就是 6–8 条，整体读、整体写，面试官在页面上就地改；子表会为一个没人按元素查询的列表加上行 id、排序列和删除路径。服务端在写入前校验形状（维度枚举、0–5 分、最多 40 条、单条题目非空），所以这一列没有 CHECK：CHECK 说不出「数组里每个元素的 `dimension` 字段」。

### 14.3 REST（基址 `/api/workbench/hr`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/questions` | 列表（`?job_id=&dimension=&q=&limit=`）/ 新建，**201** |
| GET/PATCH/DELETE | `/questions/{questionId}` | 单条 / 改 / 软删 |
| GET/POST | `/guides` | 列表（`?candidate_id=&interview_id=&status=&limit=`）/ 新建，**201** |
| GET/PATCH/DELETE | `/guides/{guideId}` | 单条 / 改 / 软删 |
| POST | `/guides/{guideId}/items` | 追加一条快照项，**201**，返回整份提纲 |
| PATCH/DELETE | `/guides/{guideId}/items/{index}` | 改 `asked`/`note`/`score`，或删掉该条；**200**，返回整份提纲 |
| POST | `/guides/generate` | body `{candidate_id, round?, job_id?, limit?}` → **200**，未保存的草稿 items |

包裹与序列化沿用 §3.1：列表 `{ <resource>: T[], total }`，`resource` 为 `questions` / `guides`，`total` = **本页条数**；单条不包裹；删除 204。`limit` 默认 50、上限 200（`workbenchLimit`）。

- **`items` 永远是数组，不是 null**：缺省 `[]`。提纲面板直接 map，不该先判断「有没有取到」。
- **`score` 是 `null` 或 0–5**：0 和「还没打分」是两个答案，所以 0 不能当缺省。`score: 6` → **400**。
- **`items` 最多 40 条**：追加到满、以及 create/PATCH 一次传 41 条，都是 **400**（不是静默丢弃）。
- **同句重复入库 → 409**：身份是 `lower(question)`（762），handler 先 trim 再比，所以 `"  X  "` 与 `"x"` 是同一条。软删后这句话重新可用（部分索引）。
- **同一候选人同一轮重复建提纲 → 409**（763）。
- **`candidate_id` 不可改**：改的是「这是谁的这一轮」。PATCH 回同一个 id 允许（客户端可以整行回传），换人 → 400。
- **`interview_id` 若给，必须同属该候选人**：给别人的轮次挂提纲 → 400。
- **`job_id` 缺省取候选人的 requisition**：创建时省略就填 `hr_candidate.job_id`，否则提纲会丢掉它与哪个岗位有关。
- **三个 item 路由都返回整份提纲**：删除第 3 条会把 4..n 重编号，只回 204 等于让前端猜新顺序。这是本域对「删除 204」的唯一偏离，写在这里而不是隐含在代码里。
- **`POST /guides/generate` 不落库**：被用户否掉的草稿不应该成为一行，也不应该有需要清理的第二处状态。前端确认后再 `POST /guides`（把草稿 items 原样传回）。
- **`limit` 被夹在 6–8**：超出窗口不是错误，窗口是契约（少到 6 才覆盖得完五维，多到 9 就不像一轮面试）。

### 14.4 快照语义：为什么 `items` 不引用题库

`items` 的每一条是**当时那份题目的副本**：`question` / `intent` / `signals` / `red_flags` 都是文本拷贝，加上现场记录 `asked` / `note` / `score`。`question_id` 只是出处，用来让题库统计「这道题被用过几次」（`usage_count`），**没有任何读路径顺着它回题库取内容**。

理由是对账：一份提纲是「这场面试问了什么」的记录。如果页面按 `question_id` 现取题目，那么任何人昨天整理一下题库用语，就会把上周那场面试的记录改写成另一批问题——而按这份记录做出的评价已经发出去了。所以：

- 改题库（`PATCH /questions/{id}`）只影响**之后**新建的提纲；
- 软删题库行（`DELETE /questions/{id}`）不伸手进任何提纲；
- `usage_count` 是**写入的数字**，不是对现存提纲的 count：用过的提纲被删掉之后，「这题被用过」仍然是事实。

`workbench_guide_test.go` 的 `TestGuideSnapshotSurvivesQuestionEdit` 就是这条语义的回归用例：改题库三处文本 + 改维度 → 已存提纲逐字段不变；再软删题库行 → 仍然不变。

### 14.5 `generate` 的两个来源

响应的 `source` 是**关于文本出处的真话**，不是装饰：

| `source` | 何时 | 怎么产生 |
| --- | --- | --- |
| `ai` | 部署配了模型（`h.LLM.Enabled()`）且回复可用 | `GenerateText` 起草，系统提示要求只返回 `{"items":[{dimension,question,intent,signals,red_flags}]}`；回复经与保存同一套规则校验，少于 6 条有效项即判为不可用 |
| `template` | 没配模型，或模型调用失败，或回复解析不出 6 条 | 确定性骨架生成器，同样 6–8 条，每条都带 `intent` 与 `signals` |

**没有模型就明说 `template`，不假装有。** 模型失败也回落到模板并把原因写进日志——这个接口永远能返回一份可用草稿，而 `source` 让前端能把「这是模板骨架，请自己改」如实标出来。

模板策略（必须实现的那条）：

1. 关键词池（最多 12 个，去重、去停用词）依次取：`hr_job.keywords`（招聘方自己选的）→ `hr_job.title` / `requirements` / `jd` 的分词 → `hr_candidate.resume_text` 的分词。分词是「字母/数字连续段」，CJK 没有空格，所以连续两个以上汉字算一个词（"分布式"、"带团队"）。`edu` / `years_experience` **不参与替换**：它们作为事实进 AI 提示（§14.5 上表），但塞进骨架会得到「用 本科 时你踩过最大的坑」这种不像人会问的话。
2. 八个骨架按固定顺序铺：`skill`、`experience`、`culture`、`potential`、`risk`、`skill`、`experience`、`risk`。顺序是设计过的——**任何长度 ≥6 的前缀都覆盖全部五维**，所以请求 6 条也不会漏掉红旗维度。
3. 每个骨架自带 `intent` / `signals` / `red_flags` 兜底文本（模板就是"听什么"本身，不是一串光秃秃的问题）；`%[1]s` 换成关键词池里的词，池空时用「这个岗位的核心技能」。
4. 草稿项一律 `asked=false`、`note=""`、`score=null`、`question_id=null`：它们还没进过题库，也还没发生过任何面试。

> **契约问题（已按现状实现，需产品确认）**：任务书写的抽取字段是 `hr_candidate`（`resume_text` / `keywords` / `years_experience` / `edu`），但 `hr_candidate` **没有 `keywords` 列**（681 + 705 只有 `edu` / `years_experience` / `resume_text`）。本批因此从 `resume_text` 分词得到候选人侧关键词，没有给 `hr_candidate` 加列（既有表不在本批写作用域）。

### 14.6 权限

写判定与 B0 同一套（`workbenchCanWrite` / `workbenchOwnerForCreate` / `workbenchOwnerForUpdate`）：

| 资源 | 写判定 |
| --- | --- |
| 题库 | 行自己的 `owner_member_id` |
| 提纲（含 items、含 generate） | **沿 candidate 的 owner**；候选人的 owner 为空时，按提纲自己的 owner（即创建者）判 |

`owner`/`admin` 全写；`member` 只能改自己拥有的行；新建时省略 owner 就是"我自己"，member 指定别人当 owner 直接 **403**。

提纲不先看自己的 owner，是为了让「我能改这个候选人」和「我能改他这一轮的提纲」是同一个答案：提纲是那个候选人的视图，不是准备它的人的资产。候选人没有 owner（NULL）时，`workbenchCanWrite` 对 unowned 行本来就不给 member 通过，所以回落到提纲创建者——否则 member 备好的一份提纲会在保存后立刻自己改不了。

`generate` 也走同一道门（它产出的是"下一步要写的那份提纲"，只是先不落库）：给别人的候选人起草 → **403**。

### 14.7 事件与 query key

事件（`workbench_guide.go` 内定义，写成功后发出）：`hr_question:changed` / `hr_interview_guide:changed`，payload `{ "id": "<row id>" }`。题库和提纲各自只发自己的事件；item 的三个路由发的是 `hr_interview_guide:changed`（改的是提纲那一行）。

```
["guide", wsId, resource, filters]   // resource ∈ questions|guides
["guide", wsId, resource, { id }]    // 详情
```

`packages/core/guide/{index,queries,mutations}.ts`（导出 `./guide`、`./guide/queries`、`./guide/mutations`）；类型在 `packages/core/types/guide.ts`（**不塞进 `workbench.ts`**），zod 在 `packages/core/api/schemas.ts`，`api/client.ts` 有同名方法。mutation 失效整个 `guideKeys.all(wsId)` + `workbenchKeys.all(wsId)`：一次保存既写提纲又给题库的 `usage_count` 加一，局部失效会留下「提纲存了但题库显示没被用过」。

`useGenerateHrInterviewGuide` 是一个**不失效任何东西**的 mutation：它不写库，草稿属于发起它的那个页面；把它做成 query 会让一份被丢弃的草稿看起来像服务端数据。

### 14.8 已知债务与本批未做

- **UI / views 未接入**：本批只到迁移、SQL、handler、core 类型/zod/client；`packages/views/**`、`apps/**` 不在写作用域。
- **前端实时 patcher 未注册**：`packages/core/types/events.ts` 不在本批作用域，两个事件目前只有服务端发出，客户端靠 mutation 失效刷新。
- **不做作答 / 判分 / 考试**：没有候选人侧界面、没有答案存储、没有自动评分。提纲的 `score` 是面试官自己的 0–5 记录，与 `hr_scorecard` 的四维权重分是两回事（后者仍是唯一的评价落点）。
- **不做难度分级、不做多人协同编辑**：一份提纲只有一个 owner 可写；同一份提纲不支持两个人同时改（`items` 是整份替换，后写覆盖先写）。
- **没有提纲 → 记分卡的自动接线**：`items[].score` 不会汇总进 `hr_scorecard.dimensions`。写回必须一条一条指名「这条对应卡上的哪一维」，那是人的判断，不是数据库能猜的。
- **`/counts`、`/overview` 不含题库/提纲**：列表 `total` 因此就是本页条数。
- **MCP 只读工具未扩**：`/api/mcp/workbench` 的 `domain` 枚举未加 `hr_question` / `hr_interview_guide`。
- **`generate` 没有可用的真实模型回归**：`agentintegration` 之外，测试只覆盖无模型时的模板路径（`source='template'`），AI 路径的解析器由 `hrParseGuideDraft` 的单元行为保证。

## 15. 离职管理契约（离职单 + 交接清单 + 离职日期）

原 HR 工作台有一页「离职管理」：发起离职 → 交接清单逐项勾 → 离职文书生成 → 归档。**这一页从来没有服务端**：流程活在组件 state 里，交接清单是模板里的一个数组字面量，刷新即失。而 `hr_employee_profile`（684）只有 `hire_date` / `regular_date` / `contract_end`，**没有离职日期、没有离职原因、没有交接清单**——「谁要走了、还差什么、哪天真的走了」三个问题在库里都没有答案。

这一批补的就是这三个答案：

```
hr_employee_profile（人；leave_date = 真的走了那一天，766 新增列）
   ↓ 发起离职
hr_offboarding.status：apply → handover → done    （cancelled 是出口）
   ↓ handover[] 逐项勾（勾选 / 备注 / 删除）
leave_date ← last_day（`done` 跃迁时同一事务写入）
```

关键取舍有两条：**四段是状态机，不是状态列**（§15.4）；**`last_day` 是计划，`leave_date` 是事实**，事实只由离职单在 `done` 时写（§15.5）。

不做审批流、不做交接人指派、不做离职文书模板（原页那套 Word 生成）——那三件都是「谁批的 / 谁接的 / 文书长什么样」，与「这个人走没走」无关。

### 15.1 迁移号段

| 号 | 文件 | 内容 |
| --- | --- | --- |
| 766 | `766_hr_employee_leave_date` | `ALTER TABLE hr_employee_profile ADD COLUMN leave_date DATE` |
| 767 | `767_hr_offboarding` | 表 `hr_offboarding` |
| 768 | `768_hr_offboarding_employee_unique` | UNIQUE `(workspace_id, employee_id) WHERE archived_at IS NULL AND status <> 'cancelled'` |
| 769 | `769_hr_offboarding_status_idx` | `hr_offboarding (workspace_id, status)` |
| 770 | `770_hr_offboarding_owner_idx` | `hr_offboarding (workspace_id, owner_member_id)` |
| 771 | `771_hr_offboarding_employee_idx` | `hr_offboarding (workspace_id, employee_id)` |

三个索引全部是单语句 `CREATE [UNIQUE] INDEX CONCURRENTLY`，up 方向逐个登记在 `server/cmd/migrate/main.go` 的 `concurrentIndexCleanups`；down 方向只有 `DROP INDEX CONCURRENTLY IF EXISTS`（不重建索引，故不进 down map）。766 是列变更、767 是建表，都在事务内，各自一个文件。

### 15.2 表

```sql
-- 767
hr_offboarding(
  id UUID PK, workspace_id UUID NOT NULL,
  employee_id UUID NOT NULL,              -- 指向 hr_employee_profile.id
  status TEXT NOT NULL DEFAULT 'apply'
    CHECK (status IN ('apply','handover','done','cancelled')),
  last_day DATE NOT NULL,                 -- 计划离职日
  reason TEXT,                            -- 离职原因，自由文本
  kind TEXT NOT NULL DEFAULT 'voluntary'
    CHECK (kind IN ('voluntary','involuntary','contract_end','other')),
  handover JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{key,label,done,note}]
  cert_done BOOLEAN NOT NULL DEFAULT false,      -- 离职证明已开
  note TEXT, owner_member_id UUID, created_by UUID,
  created_at, updated_at, archived_at)
```

规则与 B0 一致：无外键、无级联、`archived_at` 软删、每个索引单独一个并发文件。

**`last_day` 是 NOT NULL**：没有日期的离职单排不出交接顺序，也答不出「这人什么时候不再是我们的人」。契约原文只写了 `DATE`，这里收紧为必填——空值的语义没有别的解释，而 NULL 会让「在办」列表出现一张没有时间的单子。

**`kind` 是 NOT NULL 的枚举**：「为什么走」要能聚合，自由文本 `reason` 回答不了「今年主动离职几位」。两者并存：枚举是报表的维度，`reason` 是人写下的那句话。

**`handover` 是 JSONB 数组而不是子表**：一份清单就是十几条，整体读、整体写，页面就地勾选；子表会为一个没人按元素查询的列表加上行 id、排序列和删除路径。服务端在写入前校验形状（最多 40 条、每条 `label` 非空、`key` 在单内唯一），所以这一列没有 CHECK——CHECK 说不出「数组里每个元素的 `label` 字段」。

**`cert_done` 是列而不是 `handover` 里的一项**：「离职证明已开」是这套流程里唯一有法律答复的步骤，原页也是单独印的；埋进清单会让「开过没有」变成一个下标。

**`leave_date` 可空**：没走的人没有离职日期，NULL 恰好就是这个答案（与 `contract_end` 的 NULL=无固定期限不同）。它没有索引：花名册按部门 / 成员过滤，「谁走了」是 `leave_date IS NULL` 在这个规模的表上走既有的 `(workspace_id, …)` 索引就够。

### 15.3 REST（基址 `/api/workbench/hr/offboardings`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/offboardings` | 列表（`?status=&employee_id=&limit=`）/ 新建，**201** |
| GET/PATCH/DELETE | `/offboardings/{offboardingId}` | 单条 / 改 / 软删 |
| POST | `/offboardings/{offboardingId}/advance` | body `{}`；`apply → handover → done`，**200** |
| POST | `/offboardings/{offboardingId}/cancel` | → `cancelled`，**200** |
| POST | `/offboardings/{offboardingId}/handover` | 追加一项，**201**，返回整张单 |
| PATCH/DELETE | `/offboardings/{offboardingId}/handover/{index}` | 勾选 / 改备注，或删掉该条；**200**，返回整张单 |

包裹与序列化沿用 §3.1：列表 `{ offboardings: T[], total }`，`total` = **本页条数**；单条不包裹；删除 204。`limit` 默认 50、上限 200（`workbenchLimit`）。

- **`handover` 永远是数组，不是 null**：缺省 `[]`。清单面板直接 map。
- **`handover` 最多 40 条**：创建时超限、以及往满清单追加，都是 **400**（不是静默丢弃）。`label` 为空 → 400。
- **同一员工重复发起 → 409**（768）。被 `cancel` 掉的那张不再占位，所以「重新发起」就是再 POST 一次（§15.4）。
- **`status` 不能通过 PATCH 改**：PATCH 回传当前值允许（客户端可以整行回传），换成别的值 → **400**，提示走 `advance` / `cancel`。原因是那两个路由才是带副作用的（`done` 要回写 `leave_date`），一个裸列更新会跳过它。
- **创建永远落在 `apply`**：状态机只有两个入口（这个 INSERT 与 `cancel`），`{"status":"done"}` 是 **400**，不是捷径。
- **`employee_id` 不可改**：PATCH 回传同一个值允许，换人 → 400（那会改写「这是谁的离职」）。
- **三个交接路由都返回整张单**：删除第 3 条会把 4..n 重编号，只回 204 等于让前端猜新顺序。与 §14.3 同一处偏离。
- **`advance` 的响应是 `{ offboarding, employee }`**：`employee` 只在进入 `done` 时有值（带 `leave_date`），上一步不动员工档案，所以是 `null`——让前端去猜「这份档案里的离职日期是不是刚写的」不如直接不给。
- **非法跃迁一律 409**：`done → handover`、`done → advance`、`cancelled → advance`、`done` 再 `cancel`，以及并发下第二个写者的「这张单已经动过了」。
- **`done` / `cancelled` 之后交接清单封闭**：再追加 / 勾选 → 409（完成后的清单是记录，不是草稿纸）。

### 15.4 状态机：为什么 `status` 不是可写列

四段就是原页的「发起 → 交接 → 归档」加一个出口：

| 当前 | `advance` | `cancel` | PATCH 改 `status` | 交接项路由 |
| --- | --- | --- | --- | --- |
| `apply` | → `handover` | → `cancelled` | 400 | 可写 |
| `handover` | → `done` + 回写 | → `cancelled` | 400 | 可写 |
| `done` | 409 | 409 | 400 | 409 |
| `cancelled` | 409 | 409 | 400 | 409 |

三条实现约束：

1. **跃迁是条件更新**：`TransitionHrOffboarding … WHERE status = from_status`。两个人同时点「下一步」、或者页面停留在旧状态，第二个写者拿到 0 行而不是一次静默的重复跃迁——handler 把 0 行翻成 409。
2. **`done` 是唯一带副作用的跃迁**：`status` 与 `hr_employee_profile.leave_date` 在同一事务里写（`SetHrEmployeeLeaveDate`），任何一半失败都整体回滚。「单子完成了」和「人已经走了」不能分家。
3. **`cancelled` 是终态但释放唯一键**：768 的部分索引带 `AND status <> 'cancelled'`，所以取消后可以重新发起同一员工的离职。契约原文写的是 `(workspace_id, employee_id) WHERE archived_at IS NULL`；按字面实现会让「取消后重新发起」必然撞 409，与「取消的这张只是那次尝试的历史」这条需求矛盾，因此唯一键的谓词把 `cancelled` 一并排除（handler 的 `CountHrOffboardingConflicts` 用同一谓词）。

### 15.5 回写：`last_day` 与 `leave_date` 谁说了算

- `hr_offboarding.last_day` 是**计划**，由发起离职的人填；
- `hr_employee_profile.leave_date` 是**事实**，只在离职单进入 `done` 时由它写入，同一事务；
- **手工修正走这条线**：把已完成单的 `last_day` 改对（PATCH），同一事务把 `leave_date` 跟着改；删掉离职单不会撤销 `leave_date`（删掉的是文书，人并没有回来）。

因此这一批**没有**给 `PATCH /employees` 加 `leave_date`（见 §15.8）：两个可写副本是数据不一致的来源，而唯一写入口让「人事档案上的离职日」永远等于某张离职单的 `last_day`。

### 15.6 权限

写判定与 B0 同一套（`workbenchCanWrite` / `workbenchOwnerForCreate` / `workbenchOwnerForUpdate`），只有一处收紧：

| 路由 | 判定 |
| --- | --- |
| GET（列表 / 单条） | 任意工作区成员 |
| POST / PATCH / DELETE / 交接三项 | 单自己的 `owner_member_id`；`owner`/`admin` 全写，`member` 只写自己的 |
| **`advance` / `cancel`** | **仅 `owner` / `admin`** |

`advance` / `cancel` 收紧的理由：这两条路由决定「这个人还在不在编」，也就是花名册和人数统计的答案。离职这件事，`member` 不能给自己办，也不能替同事办——发起、整理交接、勾清单都可以，闭环必须落到 owner/admin 手上。

新建时的 owner 默认是**发起人**（与 §10 一致）；owner/admin 可以 PATCH 改写 `owner_member_id`，把单子交办给实际办事的人。`member` 指定别人当 owner 直接 **403**。

### 15.7 事件与 query key

事件（`workbench_offboard.go` 内定义，写成功后发出）：

- `hr_offboarding:changed`，payload `{ "id": "<离职单 id>" }` —— 每次写入（含三个交接项路由，改的是离职单那一行）；
- `hr_employee_profile:changed`，payload `{ "id": "<档案 id>" }` —— 只在真正写了 `leave_date` 时发（`done` 跃迁、以及已完成单的 `last_day` 修正）。

```
["offboard", wsId, "offboardings", filters]
["offboard", wsId, "offboardings", { id }]
```

`packages/core/hr/offboard.ts`（不塞进 `hr/queries.ts` / `hr/mutations.ts`：这个域的失效规则不一样）；类型在 `packages/core/types/offboard.ts`（**不塞进 `workbench.ts`**），zod 在 `packages/core/api/schemas.ts`，`api/client.ts` 有同名方法。mutation 失效 `offboardKeys.all(wsId)` + `hrKeys.resource(wsId, "employees")` + `workbenchKeys.all(wsId)`：`done` 一次写两张表，只失效离职单会留下「单子完成了、花名册还显示在职」。

### 15.8 已知债务与本批未做

- **UI / views 未接入**：本批只到迁移、SQL、handler、core 类型/zod/client；`packages/views/**`、`apps/**` 不在写作用域。员工花名册页的「待建表」空态可以摘掉了。
- **`GET /employees` 不返回 `leave_date`**：`HrEmployeeProfileResponse` 在 `workbench_hr.go`（不在本批写作用域），所以花名册接口目前看不到离职日期；本批只有 `advance → done` 的响应带 `leave_date`（`HrOffboardingEmployeeResponse`）。补法是给 `HrEmployeeProfileResponse` 加一个字段并映射 `p.LeaveDate`，一行；在那之前，前端要显示「已离职」必须读离职单列表。
- **前端实时 patcher 未注册**：`packages/core/types/events.ts` 不在本批作用域，两个事件目前只有服务端发出，客户端靠 mutation 失效刷新。
- **不做审批流**：没有 `pending_approval`，没有审批人、没有多级会签。四段是「流程走到哪」，不是「谁批到哪」。
- **不做交接人指派**：`handover[]` 只有 `label` / `done` / `note`，没有「交接给谁」。指派是另一个实体（人 × 事项），一列字符串装不下，本批不做。
- **不做离职文书模板**：原页那套 `openDocGen('leave')` 的 Word 生成不在本批；`cert_done` 只记「开过没有」。
- **`item` 的 `label` 不可改**：改名会改写「当时交接了什么」，正确做法是删掉再加一条（保留下标级历史）。
- **`/counts`、`/overview` 不含离职**：没有「本月在办离职」这类指标，列表 `total` 因此就是本页条数。
- **MCP 只读工具未扩**：`/api/mcp/workbench` 的 `domain` 枚举未加 `hr_offboarding`。

## 16. 人事异动留痕契约（档案变更事件流）

员工花名册的「异动」页签在 B1 阶段只是一个「待建表」空态，因为库里确实没有东西可读：转正、续签、调岗、职级变动、薪资调整**全都是对 `hr_employee_profile`（684）的一次普通 PATCH**，改完就没人记得之前是什么。「这个人什么时候、因为什么变过」在库里没有答案。

这一批补的就是这个答案：

```
hr_employee_profile（人）
   ↓ PATCH /employees（department_id / job_title / grade / contract_end / regular_date 有变化）
hr_employee_change[]（只追加：一条事件一行，按 effective_on DESC 读）
   ↑ POST /hr/changes（手工补录：薪资调整、入职补录）
```

关键取舍有两条：**这是只追加的事件流**（§16.5）；**自动留痕写在 PATCH 的同一事务里**（§16.4）。

不做异动审批、不做薪资历史对比视图、不做 UI——那三件分别是「谁批的 / 涨了多少 / 长什么样」，与「档案什么时候因为什么变过」无关。

### 16.1 迁移号段

| 号 | 文件 | 内容 |
| --- | --- | --- |
| 772 | `772_hr_employee_change` | 表 `hr_employee_change`（+ `COMMENT ON TABLE`） |
| 773 | `773_hr_employee_change_employee_idx` | `(workspace_id, employee_id, effective_on DESC)` |
| 774 | `774_hr_employee_change_kind_idx` | `(workspace_id, kind)` |

两个索引都是单语句 `CREATE INDEX CONCURRENTLY`，up 方向逐个登记在 `server/cmd/migrate/main.go` 的 `concurrentIndexCleanups`；down 方向只有 `DROP INDEX CONCURRENTLY IF EXISTS`（不重建索引，故不进 down map）。772 是建表，在事务内，单独一个文件。

### 16.2 表

```sql
-- 772
hr_employee_change(
  id UUID PK, workspace_id UUID NOT NULL,
  employee_id UUID NOT NULL,              -- 指向 hr_employee_profile.id
  kind TEXT NOT NULL
    CHECK (kind IN ('hire','regularize','renew','move','promote','grade','salary','leave','other')),
  effective_on DATE NOT NULL,             -- 生效日（不是录入日）
  from_department_id UUID, to_department_id UUID,
  from_job_title TEXT,     to_job_title TEXT,
  from_grade TEXT,         to_grade TEXT,
  from_contract_end DATE,  to_contract_end DATE,
  from_amount NUMERIC(14,2), to_amount NUMERIC(14,2), currency CHAR(3),
  note TEXT, owner_member_id UUID, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), archived_at TIMESTAMPTZ)
```

规则与 B0 一致：无外键、无级联、`archived_at` 软删、每个索引单独一个并发文件。

**`from_*` / `to_*` 是快照，不是指针**：把两个值抄进这一行，事件才独立可读，部门或职级以后被删掉也不影响「当时是什么」。每一对都可空，**NULL = 这次异动与这个字段无关**（在生成的 `note` 里渲染成 `(none)`），与档案上 NULL 的含义（如 `contract_end` NULL = 无固定期限）保持一致。

**没有 `from_regular_date` / `to_regular_date` 列**：`regularize` 这个 kind 本身就是「试用期结束了」这个事实，两个日期写在 `note` 里。再加一对列等于给 `hr_employee_profile.regular_date` 添第三份拷贝。

**`effective_on` 是生效日，不是录入日**：今天签、下月 1 号生效的调薪记在 1 号，列表按它倒序（§16.3）。读取顺序 `effective_on DESC, created_at DESC, id DESC` 写在 `ListHrEmployeeChanges` 里。

**`currency` 可空**：只有薪资调整才有意义，非金额事件留 NULL，响应里渲染成 `""`（不替用户默认 CNY）。

**`owner_member_id` 是写权限闸门**（与其它台账一致）：PATCH 钩子写入的行、以及手工补录的行，owner 都取**员工档案的 owner**——往某个人的历史里写一笔，属于编辑他的档案。

表级注释（`COMMENT ON TABLE`）写明：只追加、不更新不删除、只有软删留痕、读取按 `effective_on DESC`。

### 16.3 REST（基址 `/api/workbench/hr/changes`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/changes` | 列表（`?employee_id=&kind=&from=&to=&limit=`），包裹 `{ changes, total }` |
| POST | `/changes` | 手工补录一条，**201** |
| PATCH | `/changes/{changeId}` | **只允许改 `note`**；改其它字段 → **400** |
| DELETE | `/changes/{changeId}` | 软删，**204** |

包裹与序列化沿用 §3.1：列表 `{ changes: T[], total }`，`total` = **本页条数**；单条不包裹；`limit` 默认 50、上限 200（`workbenchLimit`）。

- **没有 `GET /changes/{id}`**：一行异动离开它所在的列表没有意义，页面读的是列表；唯一打开单行的写是改 `note`。
- **`from` / `to` 是 `effective_on` 的闭区间**（`>=` / `<=`），`to < from` → 400。
- **`kind` 未知值 → 400**（列表与创建同一条消息），因为它是报表的分组维度。
- **创建必须带 `employee_id` / `kind` / `effective_on`**，缺一个 400；`employee_id` 必须是本工作区的员工档案（否则 400）。
- **`POST` 没有 `owner_member_id`**：行的 owner 由档案决定（§16.6），目标档案不归你 → 403，而不是把别人的历史改归自己。
- **`PATCH` 的 body 按 key 集合解析，不是按结构体**：只有 `note` 字段的结构体会把 `{"kind":"move"}` 静默忽略并回 200，客户端会以为它改成功了。任何别的 key → 400「only note can be edited: the change stream is append-only」。`note` 传 `null`/`""` = 清空。
- **`DELETE` 是软删**：记错的一行退出答案，但「有人记过这一笔」留在表里。事实更正靠再记一行（§16.5）。
- 金额沿用 §3.1：**JSON number**，服务端从 `NUMERIC(14,2)` 转 `float64`；`effective_on` 与其它 HR 日期同形（`YYYY-MM-DD`）。

### 16.4 自动留痕：PATCH 档案时写什么、不写什么

钩子在 `UpdateHrEmployee`（`workbench_hr.go`）里，判定逻辑单独一个函数 `hrEmployeeChangeFromProfile`（`workbench_change.go`），**发生在与档案 UPDATE 同一个事务**里：档案变了却没有那一行，或者有一行而档案没变，都不可能。

**字段映射**

| 变化的字段 | 生成的 `kind` | 写入的 from/to |
| --- | --- | --- |
| `regular_date` 由 NULL 变为有值 | `regularize` | 只在 `note` 里（无此列对） |
| `contract_end` | `renew` | `from_contract_end` / `to_contract_end` |
| `department_id` | `move` | `from_department_id` / `to_department_id` |
| `grade` | `grade` | `from_grade` / `to_grade` |
| `job_title` | `promote` | `from_job_title` / `to_job_title` |

**多项同时变 → 一条，`kind` 取优先级最高的一项**，优先级顺序就是上表顺序（`regularize` > `renew` > `move` > `grade` > `promote`）：先「在编状态/合同阶段」的里程碑，再「随行的属性」。`note` 列出**全部**变化的字段，例如：

```
grade: P5 -> P6; contract_end: 2026-12-31 -> 2027-12-31
```

（`kind = renew`。两行会说这人同一天发生了两件事；`note` 只写一个字段会丢掉另一件。）

**不满足条件的两种情况都不留痕**

1. **只改展示/上下文字段**：`ability` / `disc`（以及 `owner_member_id`、`hire_date`）不在判定范围内——它们是六维评分和 TAI 上下文，不是「档案事实」，每次评分卡刷新都往异动里塞一行是噪音。
2. **值没变**：判定比较的是**读到的那一行**与**即将写下的那一列**，不是请求体。所以前端整表单回传（同值）、或空白被 trim 后相等，都不是变化。这条也是「同一份原值 PATCH 回来不留痕」的实现方式：不需要客户端判断，服务端比的是列。

补充规则：

- **`regular_date` 的变化只有 NULL→有值算 `regularize`**；改成另一个日期、或者清空，是修数据，记 `other`（`note` 里写明前后值）。
- **`effective_on` 取当天（UTC 日期）**：PATCH 没有「生效日」这个概念，档案改动当天生效是它的语义。要让一笔异动记在别的日子（调薪下月生效），走 `POST /hr/changes`。
- **`hire` / `leave` 没有自动钩子**：入职补录走 `POST`；离职的事实仍由 §15 的离职单写 `leave_date`，本批不重复留痕（§16.8）。

### 16.5 为什么是只追加

一条异动的价值在于「当时是什么、后来变成什么」；能改写的事件流回答不了这个问题。所以：

- `PATCH` 只接 `note`（改备注不改事实）；
- `DELETE` 只做软删（记错的那笔退出答案，记录本身还在）；
- 事实更正 = **再记一行**（`POST`），两行都在，时间线上能看出修过什么；
- `CreateHrEmployeeChange` 每次写全部列（`NULL` 也写），因此「没提到的那一对」永远是 NULL，不会继承上一条。

### 16.6 权限

| 路由 | 判定 |
| --- | --- |
| GET（列表） | 任意工作区成员 |
| POST | 目标档案的 `owner_member_id`（`workbenchCanWrite`）：`owner`/`admin` 全写，`member` 只能给自己 owner 的档案补录 |
| PATCH / DELETE | 该行自己的 `owner_member_id`：同上，`member` 只能改自己 owner 的行 |

「读任意、写看 owner」沿用 §3 / §15.6。这里没有再收紧到 owner/admin：异动是档案的附注，谁能改档案谁能记；而把别人的历史改成自己的（`member` 指定别的 owner）没有入口——行的 owner 由档案决定，不由请求决定。

### 16.7 事件与 query key

事件：写入成功后发 `hr_employee_profile:changed`，payload `{ "id": "<员工档案 id>" }`（不新增事件类型——`packages/core/types/events.ts` 不在本批作用域）。三处写入（PATCH 的自动留痕、`POST`、`PATCH note`、`DELETE`）都发同一个事件，因为客户端对它的反应一样：失效员工档案的列表与计数，异动列表挂在档案下面。

```
["change", wsId, "changes", filters]
```

**没有 detail key**：§16.3 没有单条读（见该节）。

`packages/core/hr/change.ts`（不塞进 `hr/queries.ts` / `hr/mutations.ts`：这个域的失效规则不一样——异动是 PATCH 档案写出来的，不是自己的路由）；类型在 `packages/core/types/change.ts`（**不塞进 `workbench.ts`**），zod 在 `packages/core/api/schemas.ts`，`api/client.ts` 有同名方法（`listHrEmployeeChanges` / `createHrEmployeeChange` / `updateHrEmployeeChange` / `deleteHrEmployeeChange`）。mutation 失效 `changeKeys.all(wsId)` + `hrKeys.resource(wsId, "employees")` + `workbenchKeys.all(wsId)`。

### 16.8 已知债务与本批未做

- **UI / views 未接入**：本批只到迁移、SQL、handler、core 类型/zod/client；`packages/views/**`、`apps/**` 不在写作用域。花名册「异动」页签的空态可以摘掉了。
- **`packages/core/hr/index.ts` 未导出**：由统一导出那一批补（本批不改该文件，也不改 `queries.ts` / `mutations.ts` / `workbench.ts`）。
- **前端实时 patcher 未注册**：`packages/core/types/events.ts` 不在作用域，服务端只在档案事件上发；客户端目前靠 mutation 失效刷新。
- **`hire` / `leave` 不自动留痕**：入职（`POST /candidates/{id}/hire`）与离职（§15 `done`）都没有钩子。补法各是一处单行插入，但两处都属于别的批次的写路径，本批不叠加。
- **不做审批、不做薪资历史对比视图**：`from_amount`/`to_amount` 只回答「这次调了多少」，不做曲线、不做分位。
- **没有游标分页**：`?limit=` 有硬上限（`workbenchLimit`），异动的读取口径是「这个人/这段时间发生了什么」，量级远小于其它台账；真需要翻页时按 `(effective_on, created_at, id)` 加 keyset，索引已经带上第一列。
- **MCP 只读工具未扩**：`/api/mcp/workbench` 的 `domain` 枚举未加 `hr_employee_change`。

## 17. 员工奖惩契约（奖励 + 处分）

员工花名册的「奖惩」页签是人事最后一张「待建表」空态：库里没有任何存储，谁被表扬、谁被处分、什么时候、因为什么，全都只活在聊天记录里。

这一批补的就是这个答案：

```
hr_employee_profile（人）
   ↓ POST /hr/rewards（月度之星 +500 / 迟到 500 —— 方向由 kind 决定，不由正负号）
hr_employee_reward[]（一条决定一行，按 decided_on DESC 读）
```

关键取舍有两条：**金额一律按正数存，方向由 `kind` 决定**（§17.4）；**这张表是事实记录，不参与任何汇总**（§17.2）。

不做奖惩审批、不做汇总统计、不做附件、不做 UI——那四件分别是「谁批的 / 一共发了多少 / 证明材料 / 长什么样」，与「这个人什么时候因为什么被奖励或处分」无关。

### 17.1 迁移号段

| 号 | 文件 | 内容 |
| --- | --- | --- |
| 775 | `775_hr_employee_reward` | 表 `hr_employee_reward`（+ `COMMENT ON TABLE` / `COMMENT ON COLUMN`） |
| 776 | `776_hr_employee_reward_employee_idx` | `(workspace_id, employee_id, decided_on DESC)` |
| 777 | `777_hr_employee_reward_kind_idx` | `(workspace_id, kind)` |

两个索引都是单语句 `CREATE INDEX CONCURRENTLY`，up 方向逐个登记在 `server/cmd/migrate/main.go` 的 `concurrentIndexCleanups`；down 方向只有 `DROP INDEX CONCURRENTLY IF EXISTS`（不重建索引，故不进 down map）。775 是建表，在事务内，单独一个文件。

### 17.2 表

```sql
-- 775
hr_employee_reward(
  id UUID PK, workspace_id UUID NOT NULL,
  employee_id UUID NOT NULL,                -- 指向 hr_employee_profile.id
  kind TEXT NOT NULL CHECK (kind IN ('reward','discipline')),
  category TEXT,                            -- 自由文本（"月度之星" / "迟到"），可空
  reason TEXT NOT NULL,                     -- 发生了什么
  amount NUMERIC(14,2) CHECK (amount >= 0), -- 奖金/罚金，可空、恒为正
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  decided_on DATE NOT NULL,                 -- 决定日（不是录入日）
  note TEXT, owner_member_id UUID, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ)
```

规则与 B0 一致：无外键、无级联、`archived_at` 软删、每个二级索引单独一个并发文件。

**金额可空**：`NULL` 表示这一笔没有钱（通报表扬、口头警告），不是 0。前端不要用 0 兜底——「发了 0 元」和「没有金额」在列表里是两种意思。

**`amount` 是量级，不是台账金额**：字段名按本批契约取 `amount`（§1 的台账字段命名是 `*_amount`），因为它回答的是「这次奖惩带不带钱、带多少」，不是某笔账的应收应付。它不进任何成本、毛利、现金流口径。

**这张表不参与任何汇总**：`/overview`、`/counts`、月度成本、佣金结算都不读它。别的页面以后要统计「本季度奖金总额」时，自己按 `kind` + `amount` 写一条查询；把某个还没人做过的统计口径预置进表结构（视图、物化列、rollup）只会在口径变的时候多一处要改的地方。

**`decided_on` 是决定日，不是录入日**：3 月补录 2 月的决定记在 2 月，列表按它倒序（§17.3）。读取顺序 `decided_on DESC, created_at DESC, id DESC` 写在 `ListHrEmployeeRewards` 里，后两列只做同一天 / 同一批写入的稳定兜底。

**`owner_member_id` 是写权限闸门**（与其它台账一致）：行创建时取**员工档案的 owner**——往某个人的档案里记一笔奖惩，属于编辑他的档案。

表级注释（`COMMENT ON TABLE`）写明：金额可空且恒 >= 0、方向由 `kind`、本表不参与任何汇总、读取按 `decided_on DESC`；列注释（`COMMENT ON COLUMN`）单独说明 `amount` 不是成本行。

### 17.3 REST（基址 `/api/workbench/hr/rewards`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/rewards` | 列表（`?employee_id=&kind=&from=&to=&limit=`），包裹 `{ rewards, total }` |
| POST | `/rewards` | 新建一条，**201** |
| PATCH | `/rewards/{rewardId}` | 可改 `category` / `reason` / `amount` / `currency` / `decided_on` / `note`；改 `employee_id` / `kind` → **400** |
| DELETE | `/rewards/{rewardId}` | 软删，**204** |

包裹与序列化沿用 §3.1：列表 `{ rewards: T[], total }`，`total` = **本页条数**；单条不包裹；`limit` 默认 50、上限 200（`workbenchLimit`）。

- **没有 `GET /rewards/{id}`**：一行奖惩离开它所在的列表没有意义，页面读的是列表。
- **`from` / `to` 是 `decided_on` 的闭区间**（`>=` / `<=`），`to < from` → 400。
- **`kind` 未知值 → 400**（列表与创建同一条消息），因为它是页签的分段维度。
- **创建必须带 `employee_id` / `kind` / `reason` / `decided_on`**，缺一个 400；`employee_id` 必须是本工作区的员工档案（否则 400）；`reason` 只有空白也算缺（400），因为它是这一行唯一必须回答的问题。
- **`POST` 没有 `owner_member_id`**：行的 owner 由档案决定（§17.6），目标档案不归你 → 403，而不是把别人的奖惩记成自己的。
- **`PATCH` 的 body 按 key 集合解析，不是按结构体**：只有已知字段的结构体会把 `{"kind":"reward"}` 静默忽略并回 200，客户端会以为它改成功了。所以 `employee_id` / `kind` → 400「employee_id and kind cannot be edited: delete the row and record a new one」，未知 key 也 400（`unknown field …`）。
- **`amount: null` 清空金额**；`currency` 传 `null` / `""` 保持原值（列 NOT NULL，一行永远有单位）。其余可空字段（`category` / `note`）传 `null` 或 `""` 都是清空。
- **`DELETE` 是软删**：记错的一行退出答案，但「有人记过这一笔」留在表里。
- 金额沿用 §3.1：**JSON number**，服务端从 `NUMERIC(14,2)` 转 `float64`；`decided_on` 与其它 HR 日期同形（`YYYY-MM-DD`）；`currency` 落库前大写，非三位 → 400（`CHAR(3)` 会把短值补空格）。

### 17.4 金额与符号：为什么罚金也是正数

**一笔罚金是 `kind = discipline` 的 500，不是 `kind = reward` 的 -500。**

- 「正数是奖金、负数是罚金」这种约定只有读代码的人记得；任何一次 `SUM(amount)` 都会在没读注释的地方算错。
- 符号混用会让同一量级的两行排序、比较、分组都变得要额外判断。
- 方向是分类信息，`kind` 本来就是类别，重复编码两遍等于给同一条事实两个可能互相矛盾的表示（`kind=discipline, amount=+500` 与 `kind=reward, amount=-500` 说的是两件事）。

所以：handler 对负数 **400**（创建与 PATCH 同一条消息），数据库 `CHECK (amount >= 0)` 是兜底——绕过 API 写入的负数也进不来。

### 17.5 `PATCH` 的可改字段

| 字段 | 可改 | 说明 |
| --- | --- | --- |
| `category` / `reason` / `note` | ✅ | `reason` 改后仍必须非空白；`null` / `""` 清空可空字段 |
| `amount` | ✅ | `>= 0`；`null` 清空 |
| `currency` | ✅ | 三位代码，大写落库；`null` / `""` 保持原值 |
| `decided_on` | ✅ | `YYYY-MM-DD`；必填字段，传空 → 400 |
| `employee_id` | ❌ 400 | 换成另一个人 = 换一条记录：删掉重建 |
| `kind` | ❌ 400 | 处分改成奖励 = 换一条记录：删掉重建 |

允许改的是「打字打错的那些」（分类、事由、金额、币种、日期、备注）；不允许改的是「这一行是关于谁、是奖还是罚」——那两列变了，这一行描述的就是另一件事了。

### 17.6 权限

| 路由 | 判定 |
| --- | --- |
| GET（列表） | 任意工作区成员 |
| POST | 目标档案的 `owner_member_id`（`workbenchCanWrite`）：`owner`/`admin` 全写，`member` 只能给自己 owner 的档案记奖惩 |
| PATCH / DELETE | 该行自己的 `owner_member_id`：同上，`member` 只能改自己 owner 的行 |

「读任意、写看 owner」沿用 §3 / §15.6 / §16.6：奖惩是档案的一部分，谁能改档案谁能记；把别人的奖惩改成自己的没有入口——行的 owner 由档案决定，不由请求决定。

### 17.7 事件与 query key

事件：写入成功后发 `hr_employee_profile:changed`，payload `{ "id": "<员工档案 id>" }`（不新增事件类型——`packages/core/types/events.ts` 不在本批作用域）。三处写入（`POST`、`PATCH`、`DELETE`）都发同一个事件，因为客户端对它的反应一样：失效员工档案的列表与计数，奖惩列表挂在档案下面。

```
["reward", wsId, "rewards", filters]
```

**没有 detail key**：§17.3 没有单条读（见该节）。

`packages/core/hr/reward.ts`（不塞进 `hr/queries.ts` / `hr/mutations.ts`：这个域的失效规则不一样——奖惩行挂在员工档案下面，改一行要连带失效 `employees`）；类型在 `packages/core/types/reward.ts`（**不塞进 `workbench.ts`**），zod 在 `packages/core/api/schemas.ts`，`api/client.ts` 有同名方法（`listHrEmployeeRewards` / `createHrEmployeeReward` / `updateHrEmployeeReward` / `deleteHrEmployeeReward`）。mutation 失效 `rewardKeys.all(wsId)` + `hrKeys.resource(wsId, "employees")` + `workbenchKeys.all(wsId)`。

### 17.8 已知债务与本批未做

- **UI / views 未接入**：本批只到迁移、SQL、handler、core 类型/zod/client；`packages/views/**`、`apps/**` 不在写作用域。花名册「奖惩」页签的空态可以摘掉了。
- **`packages/core/hr/index.ts` 未导出**：由统一导出那一批补（本批不改该文件，也不改 `queries.ts` / `mutations.ts` / `workbench.ts`）。
- **前端实时 patcher 未注册**：`packages/core/types/events.ts` 不在作用域，服务端只在档案事件上发；客户端目前靠 mutation 失效刷新。
- **奖惩不进异动流（§16）**：`POST /hr/rewards` 不写 `hr_employee_change`。「记一笔奖惩算不算一次档案异动」是产品判断，本批不替它决定；真要联动，是一处单行插入，属于 §16 的写路径。
- **不做审批、不做汇总统计、不做附件**：没有 `status`（奖惩是已发生的事实，不是待批的申请）、没有「本季度奖金合计」（要统计时按 `kind` + `amount` 自己查）、没有证明材料上传。
- **没有游标分页**：`?limit=` 有硬上限（`workbenchLimit`），读取口径是「这个人/这段时间被奖励或处分了什么」，量级远小于其它台账。
- **MCP 只读工具未扩**：`/api/mcp/workbench` 的 `domain` 枚举未加 `hr_employee_reward`。

## 18. 人事文书生成契约（Word / PDF 模板 + 生成留痕）

客户已确认：**盖章走线下流程**，系统只负责**生成文件**（下载、打印、拿去盖章）。所以这一批的写入路径到「字节进了对象存储 + 一行留痕」为止，没有审批、没有签章、没有电子签名。

```
hr_doc_template    （正文，含 {{占位符}}；三条内置为 builtin=true 只读）
      ↓ POST /hr/employees/{id}/documents  { template_id, format: docx|pdf, values? }
hr_doc_generation  （谁、什么时候、用哪个模板、用了哪些字段值）
      ↓ attachment_id
attachment         （产物本身就是一张普通附件：.docx 或 .pdf）
```

关键取舍有三条：**产物落成普通附件**（复用既有上传/下载/预览链路，不另造存储）；**留痕里存快照**（模板之后被改、员工之后升职，都不改已开出的文件说了什么）；**未知占位符保留并在响应里给出 warning**（不能静默变空白，否则错字只会出现在盖完章的纸上）。

不做盖章流程、不做排版引擎（单栏顺序排版）、不做页眉页脚页码、不做 UI——那四件分别是「谁负责盖章 / 版式好不好看 / 页码长什么样 / 长什么样」。

### 18.1 迁移号段

| 号 | 文件 | 内容 |
| --- | --- | --- |
| 780 | `780_hr_doc_template` | 表 `hr_doc_template`（+ `COMMENT ON`） |
| 781 | `781_hr_doc_template_name_unique` | 唯一索引 `(workspace_id, lower(name)) WHERE archived_at IS NULL` |
| 782 | `782_hr_doc_template_kind_idx` | `(workspace_id, kind)` |
| 783 | `783_hr_doc_generation` | 表 `hr_doc_generation`（+ `COMMENT ON`） |
| 784 | `784_hr_doc_generation_employee_idx` | `(workspace_id, employee_id, created_at DESC)` |

三个索引都是单语句 `CREATE INDEX CONCURRENTLY`，up 方向逐个登记在 `server/cmd/migrate/main.go` 的 `concurrentIndexCleanups`；down 方向只有 `DROP INDEX CONCURRENTLY IF EXISTS`（不重建索引，故不进 down map）。780 / 783 是建表，在事务内，各自单独一个文件。

### 18.2 表

```sql
-- 780
hr_doc_template(
  id UUID PK, workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('employment','resignation','contract','offer','other')),
  body TEXT NOT NULL,                 -- 纯文本，含 {{占位符}}；\n 分段
  builtin BOOLEAN NOT NULL DEFAULT false,
  owner_member_id UUID, created_by UUID,
  created_at/updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), archived_at TIMESTAMPTZ)

-- 783
hr_doc_generation(
  id UUID PK, workspace_id UUID NOT NULL,
  employee_id UUID NOT NULL,          -- 指向 hr_employee_profile.id
  template_id UUID,                   -- 软指针；模板被删/归档后可为 NULL
  template_name TEXT NOT NULL,        -- 快照
  format TEXT NOT NULL CHECK (format IN ('docx','pdf')),
  attachment_id UUID,                 -- 产物（普通附件；附件被删后为 NULL）
  values JSONB NOT NULL DEFAULT '{}'::jsonb,   -- 生成时用的字段快照（审计用）
  generated_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now())
```

规则与 B0 一致：无外键、无级联、`archived_at` 软删、每个索引单独一个并发文件。

**`body` 是 TEXT，不是结构化文档模型**：改模板的人是在改一段话，结构化模型会逼他用字段拼句子。渲染器只认 `{{key}}`，别的语法一概不解释。

**唯一性是 `(workspace_id, lower(name)) WHERE archived_at IS NULL`**（781）：大小写不敏感（人改名时不会想大小写），且软删后名字可以再用（改名换姓是正常操作，不是占用）。

**`builtin` 的三条内置模板由服务端按工作区落库**：读模板列表时 `SeedHrDocTemplate`（`ON CONFLICT ... DO NOTHING`）幂等补三条，所以「新建的 workspace 也有内置模板」不需要一条要知道所有 workspace 的迁移。内置行**只读**：`PATCH` / `DELETE` 回 **400**——下一次读会把它补回来，改它就是骗客户端；想要别的措辞就复制正文建自己的模板。

**`hr_doc_generation` 是快照，不是指针**：`template_name` 与 `values` 在生成时抄一份，之后模板改了措辞、员工调了岗，都不影响已开出的那份文件说了什么。`values` 是 JSONB，因为键就是模板的占位符——列不出来；存的是**渲染时的入参**（不是事后推导），未命中的占位符不在里面，正好是重渲染需要的东西。

### 18.3 生成器 `server/pkg/docgen`

`server/` 之前没有任何 docx/pdf 生成能力（全部是附件的上传/下载/预览），这一批从零写，**不引第三方依赖**（`archive/zip` + 手写 OOXML 与 PDF 足够，见 AGENTS.md 的依赖要求）。

**docx（`docx.go`）**：`.docx` 就是「zip + 几段 XML」，所以只写 Word 真正需要的五个部件：

```
[Content_Types].xml
_rels/.rels
word/document.xml
word/_rels/document.xml.rels
word/styles.xml
```

- 一行输入 = 一个 `<w:p>`，空行 = `<w:p/>`；正文放在 `<w:t xml:space="preserve">` 里，按 XML 规则转义 `& < > "`。
- 中文字符串就是 XML 文本节点里的 UTF-8；`word/styles.xml` 的 `docDefaults` 设 `w:eastAsia="SimSun"`、12pt，读者有字体就不会掉回拉丁字形。
- 版式是 A4 纵向、上下左右 1 英寸（`w:pgSz 11906x16838` + `w:pgMar 1440`）：这页要打印出来盖章，纸张尺寸有意义，排版没有。
- zip 内时间戳固定，同样的正文产出同样的字节（测试因此能直接比字节）。

**pdf（`pdf.go`）**：手写最小 PDF，中文方案是**标准 CJK 字体 + 预定义 CMap、不嵌入字体文件**：

- 字体对象：`/Subtype /Type0` + `/BaseFont /STSong-Light` + `/Encoding /UniGB-UCS2-H`（预定义 CMap），后代字体 `/Subtype /CIDFontType0`、`/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >>`、`/DW 1000`，**没有 `/FontFile*`**。
- 文本按 UTF-16BE 码元写成十六进制串（`<5728804C...>`），由读者的 CMap 把码元映射到字形；因此文件只有 KB 级（一份在职证明约 1.4 KB），仓库里也没有字体授权问题。
- **可用性结论（重要）**：这条路径要求读者自带中文字体。Adobe Acrobat（含亚洲语言包）/ Acrobat DC、macOS 预览、mupdf、多数手机阅读器显示正常；**没有装 CJK 包的 poppler / Ghostscript、以及部分 Linux 桌面阅读器会做字形替换或把中文画成空白**（拉丁与标点仍可见）。这不是实现缺陷，是「不嵌入字体」的必然结果；**要在任何机器上都能打开就先给 docx**。
- 版面是单栏顺序排版：行高 20pt、A4、1 英寸边距，满页 35 行；折行按**每字一个全角**（`/DW 1000` 且不写 `/W`，所以每个字形都前进一个 em——ASCII 也算全角；按半角估宽会把长句画到右边距之外），不做两端对齐、不做页眉页脚页码。星平面字符（emoji）UCS-2 表示不了，替换成 `?`。
- 结构自检写在测试里：`%PDF-` 头、`%%EOF` 尾、`startxref` 指向的偏移处必须是 `xref`、xref 每一行的偏移必须指向 `N 0 obj`、`/Count` 必须与页对象数一致。

**渲染（`template.go`）**：

- `{{key}}` 替换成 `values[key]`；**值为空串就渲染成空白**（没有离职日期的人，纸上那一行就是空的，不是 `null`）。
- **未知占位符原样保留**并记一条 warning（同一个键只报一次），响应里带 `warnings`、服务端 `slog.Warn` 记一条。静默变空会让错字只出现在盖章之后，保留则肉眼可见。
- 未闭合的 `{{` 视为普通文本；`{{}}` 空槽保留并报 warning；`{{ 员工姓名 }}` 与 `{{员工姓名}}` 是同一个键。
- 换行是段落分隔，其它 markdown 语法一概不解释。

### 18.4 缺省取值（`values` 可省略）

`values` 省略时从员工档案自动填；请求里给了同名键就覆盖（给 `""` 就是显式留空）。

| 占位符 | 来源 |
| --- | --- |
| `员工姓名` | `hr_employee_profile.member_id` → `user.name` |
| `部门` | `hr_employee_profile.department_id` → `department.name`（部门已删就是空白，不是 500） |
| `职位` | `hr_employee_profile.job_title` |
| `入职日期` | `hr_employee_profile.hire_date` |
| `离职日期` | `hr_employee_profile.leave_date` |
| `公司名称` | `workspace.name` |
| `今天` | 服务端当天（UTC 日期） |

**`member_id` 存的是 user id**（`getWorkspaceMember` 的入参、入职路径写进去的都是 user id），所以姓名只有一次查询，不需要先查 `member`。

### 18.5 REST（基址 `/api/workbench/hr`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/doc-templates` | 模板列表（`?kind=`），包裹 `{ templates, total }`；顺带幂等补三条内置 |
| POST | `/doc-templates` | 新建模板，**201**；重名 **409** |
| PATCH | `/doc-templates/{templateId}` | 改 `name` / `kind` / `body` / `owner_member_id`；内置 **400**；重名 **409** |
| DELETE | `/doc-templates/{templateId}` | 软删，**204**；内置 **400** |
| GET | `/employees/{employeeId}/documents` | 该员工的生成留痕，`{ documents, total }`，`created_at DESC` |
| POST | `/employees/{employeeId}/documents` | 生成一份，**201** → `{ document, warnings }` |

生成请求体：`{ "template_id": "...", "format": "docx" | "pdf", "values": { "职位": "..." } }`；`document` 里有 `id` / `format` / `attachment_id` / `url` / `filename` / `template_name` / `values` / `created_at`。

- **`employee_id` 在路径里，不在 body 里**：一份文书永远是「关于某一个人的」，请求写在别人的路径下没有意义。
- **未知 `template_id` → 404**（别的工作区或已归档同一条消息）；`template_id` 缺失/非 UUID、`format` 不在枚举 → **400**。
- **没有 `GET` 单条生成**：一行留痕离开它所属的列表没有意义；页面上唯一的写是「再生成一份」。
- **attachment 被删后**：`url` / `filename` 为空串、`attachment_id` 为 null，留痕仍然读得出来（「确实开过这份文件」这件事不该因为文件被清理就消失）。
- 列表沿用 §3.1：`limit` 默认 50、上限 200（`workbenchLimit`）；`total` = 本页条数。

### 18.6 权限

| 路由 | 判定 |
| --- | --- |
| GET（模板列表 / 留痕列表） | 任意工作区成员 |
| POST / PATCH / DELETE `/doc-templates` | **`owner` / `admin`**（`requireHrDocWriter`） |
| POST `/employees/{id}/documents` | **`owner` / `admin`**，且 `employeeId` 必须是本工作区的员工档案 |

比 §16 / §17 **更紧**：模板正文是公司口径的文书，开出来的文件会进人事档案，所以这里没有「member 写自己 owner 的行」这条路——member 生成一律 403。读仍然是成员级：看到某位同事被开过哪些证明，属于人事档案的一部分。

### 18.7 事件与 query key

事件：生成成功后发 `hr_employee_profile:changed`，payload `{ "id": "<员工档案 id>" }`（不新增事件类型——`packages/core/types/events.ts` 不在本批作用域）。模板写入**不发事件**：模板不是某个人的档案，客户端靠 mutation 失效刷新。

```
["doc", wsId, "templates", filters]
["doc", wsId, "documents", employeeId]
```

**没有 detail key**：§18.5 没有单条读。

`packages/core/hr/doc.ts`（不塞进 `hr/queries.ts` / `hr/mutations.ts`：失效规则不一样——生成一份文件要连带失效员工档案与工作台计数）；类型在 `packages/core/types/doc.ts`（**不塞进 `workbench.ts`**），zod 在 `packages/core/api/schemas.ts`（`HrDocTemplateSchema` / `HrDocGenerationSchema` / `HrDocGenerationEnvelopeSchema`），`api/client.ts` 有同名方法（`listHrDocTemplates` / `createHrDocTemplate` / `updateHrDocTemplate` / `deleteHrDocTemplate` / `listHrEmployeeDocuments` / `createHrEmployeeDocument`）。mutation 失效 `docKeys.all(wsId)` + `hrKeys.resource(wsId, "employees")` + `workbenchKeys.all(wsId)`。

### 18.8 已知债务与本批未做

- **UI / views 未接入**：本批只到迁移、SQL、生成器、handler、core 类型/zod/client；`packages/views/**`、`apps/**` 不在写作用域。
- **`packages/core/hr/index.ts` 未导出**：由统一导出那一批补（本批不改该文件，也不改 `queries.ts` / `mutations.ts` / `workbench.ts`）。
- **PDF 不嵌字体**：见 §18.3 的可用性结论——愿意接受体积时，改成嵌入一份 CJK 子集字体是 `pdf.go` 内的一处改动，但要先决定字体授权。
- **不做盖章/签署/审批**：线下流程，系统不记录「谁盖的章、哪天盖的」。
- **不做排版**：单栏顺序排版，没有表格、页眉页脚、页码、加粗/字号/居中等富文本；首行标题与正文同字号。
- **模板不做版本历史**：改了就改了；已经开出的文件靠 `template_name` + `values` 快照自证。
- **MCP 只读工具未扩**：`/api/mcp/workbench` 的 `domain` 枚举未加 `hr_doc_template` / `hr_doc_generation`。

## 19. 达人内容健康度契约（作品表 + 指标快照 + 只读接口，O3a）

口径**不在本文**：见 `WORKBENCH-DATA-CONTRACT.md` §2（`creator_video` / `creator_metric` / 两个指标的定义与前置条件）。本文只写迁移号段、表、接口、权限、query key 和已知债务。

写入口只有一个：`cmd/orange-sync -videos`（`docs/engineering/ORANGE-SYNC.md` §7）。**没有 HTTP 写接口**——作品是指标的下游事实，不应该由界面录入。

### 19.1 迁移号段

| # | 迁移 | 内容 |
| --- | --- | --- |
| 794 | `creator_video` | 作品表（一条 aweme 一行） |
| 795 | `creator_video_aweme_unique` | 唯一 `(workspace_id, aweme_id) WHERE archived_at IS NULL` |
| 796 | `creator_video_creator_idx` | `(workspace_id, creator_id, create_time DESC)` |
| 797 | `creator_video_source_idx` | `(workspace_id, source_system, source_id)` |
| 798 | `creator_metric` | 每日快照表 |
| 799 | `creator_metric_creator_day_unique` | 唯一 `(workspace_id, creator_id, captured_on)` |
| 800 | `creator_metric_creator_idx` | `(workspace_id, creator_id, captured_on DESC)` |

795–797、799–800 都是 `CREATE INDEX CONCURRENTLY` 的**单语句**迁移，且都在 `server/cmd/migrate/main.go` 的 `concurrentIndexCleanups` 里登记（INVALID 索引先删再重试）。

### 19.2 表

两表都没有外键（仓库规则），关系由应用层解析；两表都用 `archived_at` 软删，**没有任何物理删除**（工作区销毁除外）。

**`creator_video`**：`workspace_id`、`creator_id`、`aweme_id`、`desc_text`、`topics text[] NOT NULL DEFAULT '{}'`、`create_time`、`duration_ms`、`digg_count` / `comment_count` / `share_count`、`cover_url`、`video_url`、`stats_collected_at`、`source_system`、`source_id`、`created_at` / `updated_at` / `archived_at`。

- 三个计数列可空：**NULL = 还没采到统计，不是 0**（今天 12449 条里 8612 条是 NULL）。
- `topics` 是派生列（从 `desc_text` 解析），不是上游列。
- `play_count` 可空：上游 12449 行里 3047 行有值，缺失就是缺失，不写 0（契约 §2.1）。

**`creator_metric`**：`workspace_id`、`creator_id`、`captured_on date`、`video_count`、`videos_with_stats`、`posts_last_30d`、`avg_digg` / `avg_comment` / `avg_share` `numeric(14,2)`、`engagement_rate` `numeric(10,5)`、`hit_rate` `numeric(6,5)`、`sample_note`、`created_at` / `updated_at`。

- `engagement_rate` 的整数位是 5 位而不是 1 位：上游真实数据里有 4503%（= 45.02988），契约要求原样保留，**不 clamp**。
- `sample_note` 写"为什么是 NULL"：`no_stats` / `sample_below_10` / `no_followers`；全部可算时为 NULL。

### 19.3 REST（基址 `/api/workbench/creators`）

#### `GET /api/workbench/creators/health?sort=fans|engagement|hit&cursor=&limit=`

```json
{
  "creators": [
    { "id": "…", "display_name": "…", "fans": 31418,
      "engagement_rate": 0.01923, "hit_rate": 0.1,
      "posts_last_30d": 10, "videos_with_stats": 10, "captured_on": "2026-11-18" }
  ],
  "total": 50,
  "next_cursor": "…"
}
```

- `sort` 缺省 `fans`（= `fans DESC`，没有内容数据时唯一有意义的排序）；`engagement` / `hit` 按各自指标降序。
- **三种排序都是 `NULLS LAST`**，次级排序键是 `fans DESC`，再用 `id` 定序：没采到数据的达人沉底，而不是浮到榜首。
- **没有健康度行的达人不会被排除**：`engagement_rate` / `hit_rate` / `posts_last_30d` / `videos_with_stats` / `captured_on` 全部 `null`，行的其余字段照出。读者需要看见"这个人还没采到数据"。
- `total` = **本页条数**（与 `/creators` 一致，不是全量 COUNT）；`next_cursor` 是本页最后一行的 `id`，只有满页才有后继，传回 `?cursor=`。
- `cursor` 是达人 id，服务端会重新读它当前的排序值再拼 keyset 条件（`(sort_value, fans, id) <` 三元组）：指标会变，把旧值编码进 cursor 会让翻页卡在无法解释的位置。cursor 指向本工作区以外的达人 → 400。
- `sort` 非法 → 400（不静默回退，否则客户端会拿到"未排序"当"已排序"）。

#### `GET /api/workbench/creators/{creatorId}/health`

```json
{ "creator_id": "…", "latest": { …: CreatorMetric }, "recent": [ { …: CreatorMetric } ] }
```

- `latest`：该达人最新一天的快照；从没采过 → `null`（不是空对象）。
- `recent`：最近 **30 天**（今天 + 前 29 天）的快照，按 `captured_on DESC`。`recent` 永远不是 `null`。
- 达人不在本工作区（或已归档）→ 404，而不是一条空健康记录。

#### `GET /api/workbench/creators?sort=fans|engagement|hit|recent&kind=&q=&cursor=&limit=`

台账列表（本身见 §3），每行在 creator 列之外多出最新快照的五个可空字段：

| 字段 | 口径 |
| --- | --- |
| `engagement_rate` | 最新快照的互动率（0–1，**不 clamp**）。注意：列表接口里这个键来自 `creator_metric`，不再是 `creator.engagement_rate` 那个手工列——台账的「互动率」是内容健康度；`GET /creators/{creatorId}` 仍返回手工列 |
| `hit_rate` | 最新快照的爆款率 |
| `posts_last_30d` | 最新快照的近 30 天作品数 |
| `videos_with_stats` | 最新快照的样本量（带统计的作品条数） |
| `metric_captured_on` | 该快照的日期 `YYYY-MM-DD`；没有快照时 `null` |

- 实现：`LEFT JOIN LATERAL (SELECT … FROM creator_metric WHERE creator_id = c.id AND workspace_id = c.workspace_id ORDER BY captured_on DESC LIMIT 1) h ON TRUE`（`server/pkg/db/queries/workbench_creator.sql` 的 `ListCreators`）。**没有 metric 行的达人也返回**，五个字段全 `null`——inner join 会让台账悄悄变短，而"这个人还没采到数据"本身是信息。
- `sort`：`fans`（缺省，`fans DESC`）/ `engagement` / `hit` / `recent`（`posts_last_30d`）。四种都是 `DESC NULLS LAST`，次级 `fans DESC NULLS LAST`，末位 `id DESC`，所以顺序是全序，翻页不会重复或漏行。`sort` 非法 → 400。
- `cursor` 与健康榜单同一套语义：cursor 是达人 id，服务端按当前 `sort` 重读它的 `(排序值, fans)` 再拼 keyset 条件。
- 排序在服务端：前端列头只改 `sort` 参数，不做本地重排（625 行台账本地排序会把"这一页的顺序"画成"台账的顺序"）。

#### `GET /api/workbench/creators/{creatorId}/videos?limit=`

```json
{ "videos": [ { "id": "…", "aweme_id": "…", "desc_text": "…", "topics": ["…"],
               "create_time": "2026-11-18T09:00:00Z", "digg_count": 120,
               "comment_count": 8, "share_count": 3, "play_count": null,
               "cover_url": "…", "stats_collected_at": "…" } ],
  "total": 5 }
```

- 该达人镜像作品，`create_time DESC NULLS LAST, id DESC`；`limit` 默认 50、上限 200（健康度抽屉只要 5 条）。
- 计数列全部可空：NULL = 还没采到，**不是 0**（`play_count` 也一样，缺失时界面画 `—`）。
- 达人不在本工作区（或已归档）→ 404，而不是一个空列表。

### 19.4 权限

三个接口都走 `workbenchReadScope`：**任意工作区成员可读**。内容数据不是 ACL，也没有"我的达人/你的达人"之分；写入口是 CLI，没有成员级授权问题。

### 19.5 Query key

```
["creator", wsId, "health", filters]
["creator", wsId, { id }, "health"]
["creator", wsId, { id }, "videos"]
```

三条都挂在 `creatorKeys.all(wsId)` 下，`creator:changed` 的失效能覆盖到；`packages/core/creator/queries.ts` 导出 `creatorHealthOptions` / `creatorHealthDetailOptions` / `creatorVideosOptions`，`packages/core/creator/index.ts` 统一导出。**没有事件**：写入口是批处理 CLI，不通过 WebSocket 通知（客户端靠刷新/重新拉取看到新快照）。

### 19.6 已知债务与本批未做

- **作品只有一个"最近 N 条"读**：`/creators/{id}/videos` 够抽屉用，作品级筛选（按时间/话题/播放量分页检索）留给下一批。
- **没有指标写入接口**：`creator_metric` 只由 CLI 写。手工修正一个达人当天的指标目前要么重跑，要么直接改库。
- **`packages/core/metrics/contracts.ts` 未改**：两个指标进指标契约是另一批（本批只保证落库口径与契约 §2.3 逐字一致）。
- **指标不归档**：`creator_metric` 没有 `archived_at`，历史快照永久保留；达人归档后其历史仍在（这正是快照的意义）。
- **不做定时任务**：`-videos` 需要外部调度（cron / CI）来每天跑一次。
- **不做趋势图/导出**：台账三列 + 抽屉一节到此为止，`recent` 的 30 天序列还没有可视化。

## 9. 完成定义（DoD）

一个域算完成，当且仅当：迁移可 up/down 往返、`make sqlc` 无脏 diff、handler 有权限用例、事件发出、zod 覆盖响应、`useRealtimeSync` 有 patcher、`/overview` 里对应指标从 `insufficient_data` 变为有值、页面能读能写。

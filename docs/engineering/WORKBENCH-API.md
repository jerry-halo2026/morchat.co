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

## 9. 完成定义（DoD）

一个域算完成，当且仅当：迁移可 up/down 往返、`make sqlc` 无脏 diff、handler 有权限用例、事件发出、zod 覆盖响应、`useRealtimeSync` 有 patcher、`/overview` 里对应指标从 `insufficient_data` 变为有值、页面能读能写。

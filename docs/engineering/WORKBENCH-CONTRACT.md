# WORKBENCH 契约矩阵（203 条 `/api/workbench/**`）

> 本文是 `WORKBENCH-API.md` 的**可核对版**：把 203 条路由逐条钉成一行，参数/信封/错误/权限/测试/文档锚点都能回到代码。`WORKBENCH-API.md` 仍是设计正文与口径解释，两者冲突时以**代码**为准，并把冲突记在 §3。
>
> 基线：`server/cmd/server/router.go` L2409–L2861（`.routes.json`，203 条 = GET 77 / POST 51 / DELETE 37 / PATCH 35 / PUT 3）。所有行号都是该文件的真实行号；handler 行号指 `server/internal/handler/<file>` 里的 `func` 行。

## 0. 读法与判定口径

**每条结论的来源**（按可信度）：

1. handler 实现（`server/internal/handler/workbench_*.go`、`search_workbench.go`）——`workbenchReadScope` → `requireWorkbenchCapability` → 解析 → 写库 → `writeJSON`。
2. 共享助手：`workbench_types.go`（scope/limit/cursor/三态清空/序列化）、`workbench_audit.go`（revision/agent 闸门/覆写归因/复核）。
3. `docs/engineering/WORKBENCH-API.md`（§1–§26）——只用来标「文档锚点」，不用来推导行为。
4. `packages/core/api/schemas.ts` + `client.ts`——zod 覆盖面（§3.3）。

**列图例**

| 记号 | 含义 |
| --- | --- |
| `q{a,b}` | query 参数，逗号分隔；没有 `?` 后缀即普通可选参数 |
| `b:Req{}` | JSON body 结构体；字段名后 `*` = handler 会以 **400** 拒绝缺失/空值（推导自 `writeError` 里含 `required` 的消息，以及「空串直接进 `parseUUIDOrBadRequest`」的写法）。**没有 `*` 不等于可以省略**：部分端点用 `invalid <field>` 表达同一件事 |
| `∅` | 不读 body（`decodeWorkbenchBody` 未被调用，或只接受空对象） |
| `crm.amount?` | capability 带 `?` = **条件判定**：只有请求真的碰了该组字段才检查（见 §2.9） |
| `对象` / `XxxResponse` | 单条响应 = 该 struct 自身（字段见附录 A），列表响应写 `{key, total, next_cursor}` |
| `缺` | `WORKBENCH-API.md` 没有写这条路由 |
| 测试列 | 直接调用该 handler（`testHandler.Xxx`）的 `*_test.go`；`—` = 没有 |

**读/写**：`GET` = 读；`POST/PUT/PATCH/DELETE` = 写（含 `review/accept`、`adopt`、`convert`、`hire`、`advance` 这类动作型写）。所有路由都在 `middleware.RequireWorkspaceMember` 之内（router.go L2209–L2211），所以**任何一行都先要求工作区成员身份**；下表的能力列是成员身份之上的第二层。

**计数**：203 条；已文档化 200 条；无文档 3 条（§3.1）；无任何 capability 检查 14 条。

## 1. 总表

### 1.1 overview / metrics / finance（5 条）

| 方法 | 路径 | handler | 读/写 | capability | 请求参数 | 响应顶层 key | 主要错误 | 测试 | 文档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/workbench/counts` | `GetWorkbenchCounts` | 读 | crm.read | q{department_id} | 200 WorkbenchCountsResponse | 403(forbidden_capability), 500 | workbench_metrics_test.go | §3 |
| GET | `/api/workbench/finance` | `GetWorkbenchFinance` | 读 | boss.read | q{department_id,month} | 200 WorkbenchFinanceResponse | 400, 403(forbidden_capability), 500 | workbench_finance_test.go | §3.2 |
| GET | `/api/workbench/finance/months` | `ListWorkbenchFinanceMonths` | 读 | boss.read | q{month} | 200 {months, total} | 400, 403(forbidden_capability), 500 | workbench_finance_test.go | §3.3 |
| PUT | `/api/workbench/finance/months` | `UpsertWorkbenchFinanceMonth` | 写 | crm.amount · role∈{owner,admin} | b:UpsertWorkbenchFinanceMonthRequest{month*,cash_open,fixed_cost,variable_cost,note} | 200 WorkbenchFinanceMonthResponse | 400, 403(forbidden_capability), 500 | workbench_finance_test.go | §3.3 |
| GET | `/api/workbench/overview` | `GetWorkbenchOverview` | 读 | crm.read | q{department_id} | 200 WorkbenchOverviewResponse | 403(forbidden_capability), 500 | mcp_workbench_test.go, workbench_hr_test.go, workbench_metrics_test.go | §3 |

### 1.2 capability / review / search（8 条）

| 方法 | 路径 | handler | 读/写 | capability | 请求参数 | 响应顶层 key | 主要错误 | 测试 | 文档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/workbench/capabilities` | `GetWorkbenchCapabilities` | 读 | — | — | 200 WorkbenchCapabilitiesResponse | — | workbench_capability_test.go | §24.5 |
| GET | `/api/workbench/review` | `GetWorkbenchReviewQueue` | 读 | review.accept | q{domain,limit} | 200 {items, total} | 400, 403(forbidden_capability), 500 | workbench_review_test.go | §26.2 |
| POST | `/api/workbench/review/{domain}/{id}/accept` | `AcceptWorkbenchReview` | 写 | review.accept | b:WorkbenchReviewDecisionRequest{reason} | 204 无 body | 400, 403(forbidden_capability), 404, 409, 500 | workbench_review_test.go | §26.2 |
| POST | `/api/workbench/review/{domain}/{id}/reject` | `RejectWorkbenchReview` | 写 | review.accept | b:WorkbenchReviewDecisionRequest{reason} | 204 无 body | 400, 403(forbidden_capability), 404, 409, 500 | workbench_review_test.go | §26.2 |
| GET | `/api/workbench/role-templates` | `ListWorkbenchRoleTemplates` | 读 | — | — | 200 {templates, total} | 500 | workbench_capability_test.go | §24.5 |
| PUT | `/api/workbench/role-templates/{jobTitle}` | `PutWorkbenchRoleTemplate` | 写 | — · role∈{owner,admin} | b:WorkbenchRoleTemplateRequest{capabilities} | 200 WorkbenchRoleTemplateResponse | 400, 403(forbidden_capability), 500 | workbench_capability_test.go | §24.3 |
| DELETE | `/api/workbench/role-templates/{jobTitle}` | `DeleteWorkbenchRoleTemplate` | 写 | — · role∈{owner,admin} | — | 204 无 body | 400, 403(forbidden_capability), 404, 500 | workbench_capability_test.go | §24.5 |
| GET | `/api/workbench/search` | `WorkbenchSearch` | 读 | — | q{kinds,limit,q} | 200 WorkbenchSearchResponse | 400, 500, 503 | search_workbench_test.go | 缺 |

### 1.3 crm（20 条）

| 方法 | 路径 | handler | 读/写 | capability | 请求参数 | 响应顶层 key | 主要错误 | 测试 | 文档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/workbench/crm/briefs` | `ListCrmBriefs` | 读 | crm.read | q{client_id,cursor,limit,status} | 200 {briefs, total} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_crm_test.go | §3 |
| POST | `/api/workbench/crm/briefs` | `CreateCrmBrief` | 写 | crm.write | b:CrmBriefRequest{client_id*,title*,category,budget_min_amount,budget_max_amount,target_audience,deliverable_type,platforms,schedule_from,schedule_to,kpi_play,kpi_gmv_amount,status,owner_member_id} | 201 CrmBriefResponse | 400, 403(forbidden_capability), 500 | workbench_bd_test.go, workbench_capability_test.go, workbench_crm_test.go +1 | §3 |
| GET | `/api/workbench/crm/briefs/{briefId}` | `GetCrmBrief` | 读 | crm.read | — | 200 CrmBriefResponse | 403(forbidden_capability), 404 | — | §3 |
| PATCH | `/api/workbench/crm/briefs/{briefId}` | `UpdateCrmBrief` | 写 | crm.write | b:CrmBriefRequest{client_id*,title*,category,budget_min_amount,budget_max_amount,target_audience,deliverable_type,platforms,schedule_from,schedule_to,kpi_play,kpi_gmv_amount,status,owner_member_id} | 200 CrmBriefResponse | 400, 403(forbidden_capability), 404, 500 | workbench_crm_test.go, workbench_edge_test.go | §3 |
| DELETE | `/api/workbench/crm/briefs/{briefId}` | `DeleteCrmBrief` | 写 | crm.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_crm_test.go | §3 |
| GET | `/api/workbench/crm/clients` | `ListCrmClients` | 读 | crm.read | q{cursor,limit,q} | 200 {clients, total} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_edge_test.go | §3 |
| POST | `/api/workbench/crm/clients` | `CreateCrmClient` | 写 | crm.write | b:CrmClientRequest{name*,brand,industry,contact_name,contact_channel,contract_entity,payment_terms,credit_note,owner_member_id} | 201 CrmClientResponse | 400, 403(forbidden_capability), 500 | workbench_bd_test.go, workbench_capability_test.go, workbench_crm_test.go | §3 |
| GET | `/api/workbench/crm/clients/{clientId}` | `GetCrmClient` | 读 | crm.read | — | 200 CrmClientResponse | 403(forbidden_capability), 404 | workbench_crm_test.go | §3 |
| PATCH | `/api/workbench/crm/clients/{clientId}` | `UpdateCrmClient` | 写 | crm.write | b:CrmClientRequest{name*,brand,industry,contact_name,contact_channel,contract_entity,payment_terms,credit_note,owner_member_id} | 200 CrmClientResponse | 400, 403(forbidden_capability), 404, 500 | workbench_crm_test.go, workbench_edge_test.go | §3 |
| DELETE | `/api/workbench/crm/clients/{clientId}` | `DeleteCrmClient` | 写 | crm.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_crm_test.go, workbench_edge_test.go | §3 |
| GET | `/api/workbench/crm/collabs` | `ListCrmCollabs` | 读 | crm.read | q{assignee,brief_id,creator_id,cursor,limit,review_state,stage} | 200 {collabs, total} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_bd_filters_test.go, workbench_collab_test.go, workbench_flow_test.go | §3 |
| POST | `/api/workbench/crm/collabs` | `CreateCrmCollab` | 写 | crm.write · crm.amount? · crm.settle? | b:CrmCollabRequest{brief_id*,creator_id*,stage,quote_amount,final_amount,prob,creator_fee,sample_cost,platform_fee,currency,settlement_mode,commission_rate,sample_required,script_required,scheduled_at,confirmed_at,published_at,accepted_at,issue_id,owner_member_id,publish_url,settled_on,assignee_type,assignee_id,expected_revision,overwrite_reason} | 201 CrmCollabResponse | 400, 403(forbidden_agent_money, forbidden_capability), 500 | workbench_bd_test.go, workbench_capability_test.go, workbench_crm_test.go +1 | §3 |
| GET | `/api/workbench/crm/collabs/{collabId}` | `GetCrmCollab` | 读 | crm.read | — | 200 CrmCollabWithThread | 403(cross_department, forbidden_capability), 404 | workbench_agent_write_test.go, workbench_capability_test.go, workbench_collab_test.go +2 | §3 |
| PATCH | `/api/workbench/crm/collabs/{collabId}` | `UpdateCrmCollab` | 写 | crm.write · crm.amount? · crm.settle? | b:CrmCollabRequest{brief_id*,creator_id*,stage,quote_amount,final_amount,prob,creator_fee,sample_cost,platform_fee,currency,settlement_mode,commission_rate,sample_required,script_required,scheduled_at,confirmed_at,published_at,accepted_at,issue_id,owner_member_id,publish_url,settled_on,assignee_type,assignee_id,expected_revision,overwrite_reason} | 200 CrmCollabResponse | 400(invalid_overwrite_reason, overwrite_reason_required), 403(cross_department, forbidden_agent_money, forbidden_capability), 404, 409(stale_write), 500 | workbench_agent_write_test.go, workbench_capability_test.go, workbench_clearing_test.go +6 | §3 |
| DELETE | `/api/workbench/crm/collabs/{collabId}` | `DeleteCrmCollab` | 写 | crm.write | q{expected_revision} | 204 无 body | 400, 403(cross_department, forbidden_capability), 404, 409(stale_write), 500 | workbench_collab_test.go, workbench_crm_test.go, workbench_edge_test.go | §3 |
| POST | `/api/workbench/crm/collabs/{collabId}/thread` | `CreateCrmCollabThread` | 写 | crm.write | b:∅ | 200 WorkbenchThread / 201 WorkbenchThread | 403(cross_department, forbidden_capability), 404, 500 | workbench_flow_test.go | 缺 |
| GET | `/api/workbench/crm/settlements` | `ListCrmSettlements` | 读 | crm.read | q{assignee,collab_id,cursor,limit,paid,review_state} | 200 {settlements, total} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_bd_filters_test.go, workbench_collab_test.go, workbench_crm_test.go +1 | §3 |
| POST | `/api/workbench/crm/settlements` | `CreateCrmSettlement` | 写 | crm.write · crm.settle | b:CrmSettlementRequest{collab_id*,amount*,kind,currency,due_at,paid_at,invoice_no,note,assignee_type,assignee_id,expected_revision,overwrite_reason} | 201 CrmSettlementResponse | 400, 403(forbidden_agent_money, forbidden_capability), 500 | workbench_bd_test.go, workbench_capability_test.go, workbench_clearing_test.go +6 | §3 |
| PATCH | `/api/workbench/crm/settlements/{settlementId}` | `UpdateCrmSettlement` | 写 | crm.write · crm.settle | b:CrmSettlementRequest{collab_id*,kind,amount,currency,due_at,paid_at,invoice_no,note,assignee_type,assignee_id,expected_revision,overwrite_reason} | 200 CrmSettlementResponse | 400(invalid_overwrite_reason, overwrite_reason_required), 403(forbidden_agent_money, forbidden_capability), 404, 409(stale_write), 500 | workbench_clearing_test.go, workbench_collab_test.go, workbench_crm_test.go +1 | §3 |
| DELETE | `/api/workbench/crm/settlements/{settlementId}` | `DeleteCrmSettlement` | 写 | crm.write · crm.settle | — | 204 无 body | 400, 403(forbidden_capability), 404, 500 | workbench_crm_test.go | §3 |

### 1.4 bd（18 条）

| 方法 | 路径 | handler | 读/写 | capability | 请求参数 | 响应顶层 key | 主要错误 | 测试 | 文档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/workbench/bd/activities` | `ListBdActivities` | 读 | crm.read | q{assignee,creator_id,cursor,due,from,kind,limit,review_state,to} | 200 {activities, total, next_cursor} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_bd_filters_test.go, workbench_bd_test.go, workbench_flow_test.go | §20.3 |
| POST | `/api/workbench/bd/activities` | `CreateBdActivity` | 写 | crm.write | b:BdActivityRequest{creator_id*,kind*,happened_at*,summary*,outcome,next_follow_at,owner_member_id,assignee_type,assignee_id,expected_revision,overwrite_reason} | 201 BdActivityResponse | 400, 403(forbidden_capability), 500 | workbench_bd_test.go, workbench_collab_test.go | §20.3 |
| GET | `/api/workbench/bd/activities/{activityId}` | `GetBdActivity` | 读 | crm.read | — | 200 BdActivityResponse | 403(forbidden_capability), 404 | workbench_bd_test.go | §20.3 |
| PATCH | `/api/workbench/bd/activities/{activityId}` | `UpdateBdActivity` | 写 | crm.write | b:BdActivityRequest{creator_id,kind,happened_at,summary,outcome,next_follow_at,owner_member_id,assignee_type,assignee_id,expected_revision,overwrite_reason} | 200 BdActivityResponse | 400(invalid_overwrite_reason, overwrite_reason_required), 403(forbidden_capability), 404, 409(stale_write), 500 | workbench_bd_test.go, workbench_clearing_test.go, workbench_collab_test.go +2 | §20.3 |
| DELETE | `/api/workbench/bd/activities/{activityId}` | `DeleteBdActivity` | 写 | crm.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_bd_test.go, workbench_ledger_events_test.go | §20.3 |
| GET | `/api/workbench/bd/campaigns` | `ListBdCampaigns` | 读 | crm.read | q{kind,limit} | 200 {campaigns, total} | 400, 403(forbidden_capability), 500 | workbench_bd_filters_test.go | §20.3 |
| POST | `/api/workbench/bd/campaigns` | `CreateBdCampaign` | 写 | crm.write | b:BdCampaignRequest{name*,kind,budget_amount,currency,started_on,ended_on,source_keyword,creator_count,note,owner_member_id} | 201 BdCampaignResponse | 400, 403(forbidden_capability), 409, 500 | workbench_bd_test.go | §20.3 |
| GET | `/api/workbench/bd/campaigns/{campaignId}` | `GetBdCampaign` | 读 | crm.read | — | 200 BdCampaignResponse | 403(forbidden_capability), 404 | — | §20.3 |
| PATCH | `/api/workbench/bd/campaigns/{campaignId}` | `UpdateBdCampaign` | 写 | crm.write | b:BdCampaignRequest{name*,kind,budget_amount,currency,started_on,ended_on,source_keyword,creator_count,note,owner_member_id} | 200 BdCampaignResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_bd_test.go, workbench_edge_test.go, workbench_ledger_events_test.go | §20.3 |
| DELETE | `/api/workbench/bd/campaigns/{campaignId}` | `DeleteBdCampaign` | 写 | crm.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_bd_test.go, workbench_ledger_events_test.go | §20.3 |
| GET | `/api/workbench/bd/performance` | `GetBdPerformance` | 读 | crm.read | q{from,to} | 200 BdPerformanceResponse | 400, 403(forbidden_capability), 500 | workbench_bd_test.go | §22 |
| GET | `/api/workbench/bd/pipeline` | `GetBdPipeline` | 读 | crm.read | — | 200 BdPipelineResponse | 403(forbidden_capability), 500 | workbench_bd_test.go | §20.3 |
| GET | `/api/workbench/bd/quotes` | `ListBdQuotes` | 读 | crm.read | q{assignee,creator_id,cursor,limit,q,review_state,sort,status} | 200 {quotes, total, next_cursor} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_bd_filters_test.go, workbench_edge_test.go, workbench_flow_test.go | §20.3 |
| POST | `/api/workbench/bd/quotes` | `CreateBdQuote` | 写 | crm.write · crm.amount? | b:BdQuoteRequest{creator_id*,brief_id,status,quoted_at,valid_until,fee_amount,commission_rate,currency,items,note,owner_member_id,assignee_type,assignee_id,expected_revision,overwrite_reason} | 201 BdQuoteResponse | 400, 403(forbidden_agent_money, forbidden_capability), 500 | workbench_bd_test.go, workbench_collab_test.go | §20.3 |
| GET | `/api/workbench/bd/quotes/{quoteId}` | `GetBdQuote` | 读 | crm.read | — | 200 BdQuoteWithThread | 403(forbidden_capability), 404 | workbench_collab_test.go | §20.3 |
| PATCH | `/api/workbench/bd/quotes/{quoteId}` | `UpdateBdQuote` | 写 | crm.write · crm.amount? | b:BdQuoteRequest{creator_id,brief_id,status,quoted_at,valid_until,fee_amount,commission_rate,currency,items,note,owner_member_id,assignee_type,assignee_id,expected_revision,overwrite_reason} | 200 BdQuoteResponse | 400(invalid_overwrite_reason, overwrite_reason_required), 403(forbidden_agent_money, forbidden_capability), 404, 409(stale_write), 500 | workbench_bd_filters_test.go, workbench_bd_test.go, workbench_clearing_test.go +3 | §20.3 |
| DELETE | `/api/workbench/bd/quotes/{quoteId}` | `DeleteBdQuote` | 写 | crm.write | q{expected_revision} | 204 无 body | 400, 403(forbidden_capability), 404, 409(stale_write), 500 | workbench_collab_test.go, workbench_edge_test.go, workbench_ledger_events_test.go | §20.3 |
| POST | `/api/workbench/bd/quotes/{quoteId}/thread` | `CreateBdQuoteThread` | 写 | crm.write | b:∅ | 200 WorkbenchThread / 201 WorkbenchThread | 403(forbidden_capability), 404, 500 | workbench_flow_test.go | 缺 |

### 1.5 affiliate（16 条）

| 方法 | 路径 | handler | 读/写 | capability | 请求参数 | 响应顶层 key | 主要错误 | 测试 | 文档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/workbench/affiliate/daily` | `ListAffiliateDaily` | 读 | crm.read | q{from,limit,pick_id,to} | 200 {daily, total} | 400, 403(forbidden_capability), 500 | workbench_affiliate_test.go | §11.3 |
| PUT | `/api/workbench/affiliate/daily` | `UpsertAffiliateDaily` | 写 | crm.write | b:AffiliateDailyRequest{pick_id*,stat_date*,gmv_amount,order_count,refund_amount,est_commission,settled_commission,currency,owner_member_id} | 201 AffiliateDailyResponse | 400, 403(forbidden_capability), 500 | workbench_affiliate_test.go | §11.3 |
| GET | `/api/workbench/affiliate/picks` | `ListAffiliatePicks` | 读 | crm.read | q{creator_id,cursor,limit,product_id,status} | 200 {picks, total} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_affiliate_test.go | §11.3 |
| POST | `/api/workbench/affiliate/picks` | `CreateAffiliatePick` | 写 | crm.write | b:AffiliatePickRequest{product_id*,creator_id*,commission_rate,agency_share_rate,service_fee_amount,bound_at,status,note,owner_member_id} | 201 AffiliatePickResponse | 400, 403(forbidden_capability), 409, 500 | workbench_affiliate_test.go | §11.3 |
| GET | `/api/workbench/affiliate/picks/{pickId}` | `GetAffiliatePick` | 读 | crm.read | — | 200 AffiliatePickResponse | 403(forbidden_capability), 404 | — | §11.3 |
| PATCH | `/api/workbench/affiliate/picks/{pickId}` | `UpdateAffiliatePick` | 写 | crm.write | b:AffiliatePickRequest{product_id*,creator_id*,commission_rate,agency_share_rate,service_fee_amount,bound_at,status,note,owner_member_id} | 200 AffiliatePickResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_affiliate_test.go | §11.3 |
| DELETE | `/api/workbench/affiliate/picks/{pickId}` | `DeleteAffiliatePick` | 写 | crm.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | — | §11.3 |
| GET | `/api/workbench/affiliate/products` | `ListAffiliateProducts` | 读 | crm.read | q{client_id,cursor,limit,platform,status} | 200 {products, total} | 400(cursor not found), 403(forbidden_capability), 500 | — | §11.3 |
| POST | `/api/workbench/affiliate/products` | `CreateAffiliateProduct` | 写 | crm.write | b:AffiliateProductRequest{client_id*,ownership*,platform*,platform_product_id*,title*,category,price,currency,commission_rate,activity,status,owner_member_id} | 201 AffiliateProductResponse | 400, 403(forbidden_capability), 409, 500 | workbench_affiliate_test.go | §11.3 |
| GET | `/api/workbench/affiliate/products/{productId}` | `GetAffiliateProduct` | 读 | crm.read | — | 200 AffiliateProductResponse | 403(forbidden_capability), 404 | workbench_affiliate_test.go | §11.3 |
| PATCH | `/api/workbench/affiliate/products/{productId}` | `UpdateAffiliateProduct` | 写 | crm.write | b:AffiliateProductRequest{client_id*,ownership*,platform*,platform_product_id*,title*,category,price,currency,commission_rate,activity,status,owner_member_id} | 200 AffiliateProductResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_affiliate_test.go | §11.3 |
| DELETE | `/api/workbench/affiliate/products/{productId}` | `DeleteAffiliateProduct` | 写 | crm.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_affiliate_test.go | §11.3 |
| GET | `/api/workbench/affiliate/settlements` | `ListAffiliateSettlements` | 读 | crm.read | q{from,limit,status,to} | 200 {settlements, total} | 400, 403(forbidden_capability), 500 | — | §11.3 |
| POST | `/api/workbench/affiliate/settlements` | `CreateAffiliateSettlement` | 写 | crm.write · role∈{owner,admin} | b:AffiliateSettlementRequest{period_start*,period_end*,net_amount*,gross_commission,tech_service_fee,refund_deduction,currency,status,settled_to,paid_at,external_no,note} | 201 AffiliateSettlementResponse | 400, 403(forbidden_capability), 500 | workbench_affiliate_test.go | §11.3 |
| PATCH | `/api/workbench/affiliate/settlements/{settlementId}` | `UpdateAffiliateSettlement` | 写 | crm.write · role∈{owner,admin} | b:AffiliateSettlementRequest{period_start*,period_end*,gross_commission,tech_service_fee,refund_deduction,net_amount,currency,status,settled_to,paid_at,external_no,note} | 200 AffiliateSettlementResponse | 400, 403(forbidden_capability), 404, 500 | workbench_affiliate_test.go | §11.3 |
| GET | `/api/workbench/affiliate/summary` | `GetAffiliateSummary` | 读 | crm.read | q{department_id,month} | 200 AffiliateSummaryResponse | 400, 403(forbidden_capability), 500 | workbench_affiliate_test.go | §11.3 · §11.5 |

### 1.6 media（34 条）

| 方法 | 路径 | handler | 读/写 | capability | 请求参数 | 响应顶层 key | 主要错误 | 测试 | 文档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/workbench/media/bench` | `ListMediaBench` | 读 | media.read | q{captured_on,ip_id,limit,platform,q} | 200 {bench, total} | 400, 403(forbidden_capability), 500 | workbench_discovery_test.go | §21.3 |
| POST | `/api/workbench/media/bench` | `CreateMediaBench` | 写 | media.write | b:MediaBenchRequest{ip_id*,platform*,name*,url,follower_count,metrics,captured_on,note,owner_member_id} | 201 MediaBenchResponse | 400, 403(forbidden_capability), 500 | workbench_discovery_test.go | §21.3 |
| GET | `/api/workbench/media/bench/{benchId}` | `GetMediaBench` | 读 | media.read | — | 200 MediaBenchResponse | 403(forbidden_capability), 404 | workbench_discovery_test.go | §21.3 |
| PATCH | `/api/workbench/media/bench/{benchId}` | `UpdateMediaBench` | 写 | media.write | b:MediaBenchRequest{ip_id*,platform*,name*,url,follower_count,metrics,captured_on,note,owner_member_id} | 200 MediaBenchResponse | 400, 403(forbidden_capability), 404, 500 | workbench_discovery_test.go | §21.3 |
| DELETE | `/api/workbench/media/bench/{benchId}` | `DeleteMediaBench` | 写 | media.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_discovery_test.go | §21.3 |
| POST | `/api/workbench/media/bench/{benchId}/adopt` | `AdoptMediaBench` | 写 | media.write | b:MediaAdoptRequest{ip_id*,title*} | 201 MediaTopicResponse | 400, 403(forbidden_capability), 404, 500 | workbench_discovery_test.go | §21.3 |
| GET | `/api/workbench/media/hot` | `ListMediaHot` | 读 | media.read | q{captured_on,category,limit,platform,q} | 200 {hot, total} | 400, 403(forbidden_capability), 500 | workbench_discovery_test.go | §21.3 |
| POST | `/api/workbench/media/hot` | `CreateMediaHot` | 写 | media.write | b:MediaHotRequest{title*,platform*,url,rank,heat_value,category,captured_on,source,note,owner_member_id} | 201 MediaHotResponse | 400, 403(forbidden_capability), 500 | workbench_discovery_test.go | §21.3 |
| GET | `/api/workbench/media/hot/{hotId}` | `GetMediaHot` | 读 | media.read | — | 200 MediaHotResponse | 403(forbidden_capability), 404 | workbench_discovery_test.go | §21.3 |
| PATCH | `/api/workbench/media/hot/{hotId}` | `UpdateMediaHot` | 写 | media.write | b:MediaHotRequest{title*,platform*,url,rank,heat_value,category,captured_on,source,note,owner_member_id} | 200 MediaHotResponse | 400, 403(forbidden_capability), 404, 500 | workbench_discovery_test.go | §21.3 |
| DELETE | `/api/workbench/media/hot/{hotId}` | `DeleteMediaHot` | 写 | media.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_discovery_test.go, workbench_metrics_test.go | §21.3 |
| POST | `/api/workbench/media/hot/{hotId}/adopt` | `AdoptMediaHot` | 写 | media.write | b:MediaAdoptRequest{ip_id*,title*} | 201 MediaTopicResponse | 400, 403(forbidden_capability), 404, 500 | workbench_discovery_test.go | §21.3 |
| GET | `/api/workbench/media/ips` | `ListMediaIPs` | 读 | media.read | q{limit,status} | 200 {ips, total} | 400, 403(forbidden_capability), 500 | — | §12.3 |
| POST | `/api/workbench/media/ips` | `CreateMediaIP` | 写 | media.write | b:MediaIPRequest{name*,persona,track,audience,color,week_goal,status,owner_member_id} | 201 MediaIPResponse | 400, 403(forbidden_capability), 409, 500 | workbench_media_test.go | §12.3 |
| GET | `/api/workbench/media/ips/{ipId}` | `GetMediaIP` | 读 | media.read | — | 200 MediaIPDetailResponse | 403(forbidden_capability), 404, 500 | workbench_media_test.go | §12.3 |
| PATCH | `/api/workbench/media/ips/{ipId}` | `UpdateMediaIP` | 写 | media.write | b:MediaIPRequest{name*,persona,track,audience,color,week_goal,status,owner_member_id} | 200 MediaIPResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_edge_test.go | §12.3 |
| DELETE | `/api/workbench/media/ips/{ipId}` | `DeleteMediaIP` | 写 | media.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_discovery_test.go | §12.3 |
| POST | `/api/workbench/media/ips/{ipId}/accounts` | `AttachMediaIPAccount` | 写 | media.write | b:MediaAccountRequest{creator_id*} | 201 MediaIPAccountResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_media_test.go | §12.3 |
| DELETE | `/api/workbench/media/ips/{ipId}/accounts/{creatorId}` | `DetachMediaIPAccount` | 写 | media.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_media_test.go | §12.3 |
| GET | `/api/workbench/media/scripts` | `ListMediaScripts` | 读 | media.read | q{limit,status,topic_id} | 200 {scripts, total} | 400, 403(forbidden_capability), 500 | workbench_media_test.go | §12.3 |
| POST | `/api/workbench/media/scripts` | `CreateMediaScript` | 写 | media.write | b:MediaScriptRequest{topic_id*,ip_id*,hook,body,cta,cover_note,tags,status,publish_at,owner_member_id} | 201 MediaScriptResponse | 400, 403(forbidden_capability), 409, 500 | workbench_edge_test.go, workbench_media_test.go | §12.3 |
| GET | `/api/workbench/media/scripts/{scriptId}` | `GetMediaScript` | 读 | media.read | — | 200 MediaScriptResponse | 403(forbidden_capability), 404 | workbench_media_test.go | §12.3 |
| PATCH | `/api/workbench/media/scripts/{scriptId}` | `UpdateMediaScript` | 写 | media.write | q{inPlace} b:MediaScriptRequest{topic_id*,ip_id*,hook,body,cta,cover_note,tags,status,publish_at,owner_member_id} | 200 MediaScriptResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_edge_test.go, workbench_media_test.go | §12.3 |
| DELETE | `/api/workbench/media/scripts/{scriptId}` | `DeleteMediaScript` | 写 | media.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_creator_test.go | §12.3 |
| GET | `/api/workbench/media/shoots` | `ListMediaShoots` | 读 | media.read | q{from,limit,script_id,to} | 200 {shoots, total} | 400, 403(forbidden_capability), 500 | workbench_media_test.go | §12.3 |
| POST | `/api/workbench/media/shoots` | `CreateMediaShoot` | 写 | media.write | b:MediaShootRequest{script_id*,shoot_date*,location,shots,checklist,status,owner_member_id} | 201 MediaShootResponse | 400, 403(forbidden_capability), 500 | workbench_edge_test.go, workbench_media_test.go | §12.3 |
| GET | `/api/workbench/media/shoots/{shootId}` | `GetMediaShoot` | 读 | media.read | — | 200 MediaShootResponse | 403(forbidden_capability), 404 | — | §12.3 |
| PATCH | `/api/workbench/media/shoots/{shootId}` | `UpdateMediaShoot` | 写 | media.write | b:MediaShootRequest{script_id*,shoot_date*,location,shots,checklist,status,owner_member_id} | 200 MediaShootResponse | 400, 403(forbidden_capability), 404, 500 | workbench_edge_test.go, workbench_media_test.go | §12.3 |
| DELETE | `/api/workbench/media/shoots/{shootId}` | `DeleteMediaShoot` | 写 | media.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | — | §12.3 |
| GET | `/api/workbench/media/topics` | `ListMediaTopics` | 读 | media.read | q{ip_id,limit,status} | 200 {topics, total} | 400, 403(forbidden_capability), 500 | workbench_media_test.go | §12.3 |
| POST | `/api/workbench/media/topics` | `CreateMediaTopic` | 写 | media.write | b:MediaTopicRequest{ip_id*,title*,source,scores,status,hot_id,note,owner_member_id} | 201 MediaTopicResponse | 400, 403(forbidden_capability), 500 | workbench_media_test.go | §12.3 |
| GET | `/api/workbench/media/topics/{topicId}` | `GetMediaTopic` | 读 | media.read | — | 200 MediaTopicResponse | 403(forbidden_capability), 404 | — | §12.3 |
| PATCH | `/api/workbench/media/topics/{topicId}` | `UpdateMediaTopic` | 写 | media.write | b:MediaTopicRequest{ip_id*,title*,source,scores,status,hot_id,note,owner_member_id} | 200 MediaTopicResponse | 400, 403(forbidden_capability), 404, 500 | workbench_edge_test.go, workbench_ledger_events_test.go, workbench_media_test.go | §12.3 |
| DELETE | `/api/workbench/media/topics/{topicId}` | `DeleteMediaTopic` | 写 | media.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_ledger_events_test.go, workbench_media_test.go | §12.3 |

### 1.7 creator（14 条）

| 方法 | 路径 | handler | 读/写 | capability | 请求参数 | 响应顶层 key | 主要错误 | 测试 | 文档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/workbench/creator-posts` | `ListCreatorPosts` | 读 | crm.read | q{creator_id,cursor,from,limit,to} | 200 {posts, total} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_creator_test.go | §3 |
| POST | `/api/workbench/creator-posts` | `CreateCreatorPost` | 写 | crm.write | b:CreatorPostRequest{creator_id*,platform*,url*,published_at*,collab_id,content_issue_id,product_id,pick_id,media_script_id,title,source} | 201 CreatorPostResponse | 400, 403(forbidden_capability), 409, 500 | workbench_creator_test.go | §3 |
| PATCH | `/api/workbench/creator-posts/{postId}` | `UpdateCreatorPost` | 写 | crm.write | b:CreatorPostRequest{creator_id*,platform*,url*,collab_id,content_issue_id,product_id,pick_id,media_script_id,title,published_at,source} | 200 CreatorPostResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_creator_test.go, workbench_metrics_test.go | §3 |
| DELETE | `/api/workbench/creator-posts/{postId}` | `DeleteCreatorPost` | 写 | crm.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_creator_test.go | §3 |
| GET | `/api/workbench/creator-posts/{postId}/metrics` | `ListCreatorPostMetrics` | 读 | crm.read | q{from,limit,to} | 200 {metrics, total} | 400, 403(forbidden_capability), 404, 500 | workbench_creator_test.go | §3 |
| POST | `/api/workbench/creator-posts/{postId}/metrics` | `UpsertCreatorPostMetric` | 写 | crm.write | b:CreatorPostMetricRequest{captured_on,play,likes,comments,shares,clicks,converts,gmv_amount,currency,source} | 201 CreatorPostMetricResponse | 400, 403(forbidden_capability), 404, 500 | workbench_creator_test.go, workbench_metrics_test.go | §3 |
| GET | `/api/workbench/creators` | `ListCreators` | 读 | crm.read | q{cursor,kind,limit,q,sort} | 200 {creators, total, next_cursor} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_creator_test.go | §3 |
| POST | `/api/workbench/creators` | `CreateCreator` | 写 | crm.write | b:CreatorRequest{display_name*,platform*,handle*,kind,url,fans,fans_d7,avg_play,engagement_rate,category,audience_note,region,price_note,score,risk_flag,blacklist_reason,owner_member_id,media_ip_project_id} | 201 CreatorResponse | 400, 403(forbidden_capability), 409, 500 | workbench_bd_test.go, workbench_capability_test.go, workbench_creator_test.go +1 | §3 |
| GET | `/api/workbench/creators/health` | `ListCreatorHealth` | 读 | crm.read | q{cursor,limit,sort} | 200 {creators, total, next_cursor} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_creator_health_test.go | §19.3 |
| GET | `/api/workbench/creators/{creatorId}` | `GetCreator` | 读 | crm.read | — | 200 CreatorResponse | 403(forbidden_capability), 404 | workbench_creator_test.go | §3 |
| PATCH | `/api/workbench/creators/{creatorId}` | `UpdateCreator` | 写 | crm.write | b:CreatorRequest{display_name*,platform*,handle*,kind,url,fans,fans_d7,avg_play,engagement_rate,category,audience_note,region,price_note,score,risk_flag,blacklist_reason,owner_member_id,media_ip_project_id} | 200 CreatorResponse | 400, 403(cross_department, forbidden_capability), 404, 409, 500 | workbench_creator_test.go | §3 |
| DELETE | `/api/workbench/creators/{creatorId}` | `DeleteCreator` | 写 | crm.write | — | 204 无 body | 403(cross_department, forbidden_capability), 404, 500 | workbench_creator_test.go | §3 |
| GET | `/api/workbench/creators/{creatorId}/health` | `GetCreatorHealth` | 读 | crm.read | — | 200 CreatorHealthDetailResponse | 403(forbidden_capability), 404, 500 | workbench_creator_health_test.go | §19.3 |
| GET | `/api/workbench/creators/{creatorId}/videos` | `ListCreatorVideos` | 读 | crm.read | q{limit} | 200 {videos, total} | 403(forbidden_capability), 404, 500 | workbench_creator_test.go | §19.3 |

### 1.8 goal / signal（18 条）

| 方法 | 路径 | handler | 读/写 | capability | 请求参数 | 响应顶层 key | 主要错误 | 测试 | 文档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/workbench/goals` | `ListGoals` | 读 | boss.read | q{cycle,limit,status} | 200 {goals, total} | 400, 403(forbidden_capability), 500 | workbench_goal_test.go | §13.3 |
| POST | `/api/workbench/goals` | `CreateGoal` | 写 | boss.read | b:GoalRequest{title*,cycle,description,owner_member_id,department_id,status,due_date,priority} | 201 GoalResponse | 400, 403(forbidden_capability), 409, 500 | workbench_goal_test.go | §13.3 |
| GET | `/api/workbench/goals/{goalId}` | `GetGoal` | 读 | boss.read | — | 200 GoalDetailResponse | 403(forbidden_capability), 404, 500 | workbench_goal_test.go | §13.3 |
| PATCH | `/api/workbench/goals/{goalId}` | `UpdateGoal` | 写 | boss.read | b:GoalRequest{cycle*,title*,description,owner_member_id,department_id,status,due_date,priority} | 200 GoalResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_goal_test.go | §13.3 |
| DELETE | `/api/workbench/goals/{goalId}` | `DeleteGoal` | 写 | boss.read | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_goal_test.go | §13.3 |
| POST | `/api/workbench/goals/{goalId}/issues` | `AttachGoalIssue` | 写 | boss.read | b:GoalIssueRequest{issue_id*} | 201 GoalIssueResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_goal_test.go | §13.3 |
| DELETE | `/api/workbench/goals/{goalId}/issues/{issueId}` | `DetachGoalIssue` | 写 | boss.read | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_goal_test.go | §13.3 |
| POST | `/api/workbench/goals/{goalId}/key-results` | `CreateGoalKeyResult` | 写 | boss.read | b:GoalKeyResultRequest{title*,target,current,unit,position,status} | 201 GoalKeyResultResponse | 400, 403(forbidden_capability), 404, 500 | workbench_goal_test.go | §13.3 |
| PATCH | `/api/workbench/goals/{goalId}/key-results/{keyResultId}` | `UpdateGoalKeyResult` | 写 | boss.read | b:GoalKeyResultRequest{title*,target,current,unit,position,status} | 200 GoalKeyResultResponse | 400, 403(forbidden_capability), 404, 500 | workbench_goal_test.go | §13.3 |
| DELETE | `/api/workbench/goals/{goalId}/key-results/{keyResultId}` | `DeleteGoalKeyResult` | 写 | boss.read | — | 204 无 body | 403(forbidden_capability), 404, 500 | — | §13.3 |
| POST | `/api/workbench/goals/{goalId}/packages` | `CreateGoalPackage` | 写 | boss.read | b:GoalPackageRequest{department_id*,title*,owner_member_id,status,position} | 201 GoalPackageResponse | 400, 403(forbidden_capability), 404, 500 | workbench_goal_test.go | §13.3 |
| PATCH | `/api/workbench/goals/{goalId}/packages/{packageId}` | `UpdateGoalPackage` | 写 | boss.read | b:GoalPackageRequest{department_id*,title*,owner_member_id,status,position} | 200 GoalPackageResponse | 400, 403(forbidden_capability), 404, 500 | workbench_goal_test.go | §13.3 |
| DELETE | `/api/workbench/goals/{goalId}/packages/{packageId}` | `DeleteGoalPackage` | 写 | boss.read | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_goal_test.go | §13.3 |
| GET | `/api/workbench/signals` | `ListMarketSignals` | 读 | boss.read | q{category,cut,limit,status} | 200 {signals, total} | 400, 403(forbidden_capability), 500 | workbench_goal_test.go | §13.3 |
| POST | `/api/workbench/signals` | `CreateMarketSignal` | 写 | boss.read | b:MarketSignalRequest{title*,category,source,url,summary,cut,score,urgency,status,note,owner_member_id} | 201 MarketSignalResponse | 400, 403(forbidden_capability), 500 | workbench_goal_test.go | §13.3 |
| PATCH | `/api/workbench/signals/{signalId}` | `UpdateMarketSignal` | 写 | boss.read | b:MarketSignalRequest{title*,category,source,url,summary,cut,score,urgency,status,note,owner_member_id} | 200 MarketSignalResponse | 400, 403(forbidden_capability), 404, 500 | workbench_goal_test.go | §13.3 |
| DELETE | `/api/workbench/signals/{signalId}` | `DeleteMarketSignal` | 写 | boss.read | — | 204 无 body | 403(forbidden_capability), 404, 500 | — | §13.3 |
| POST | `/api/workbench/signals/{signalId}/convert` | `ConvertMarketSignal` | 写 | boss.read | b:MarketSignalConvertRequest{target,cycle,department_id,project_id} | 201 MarketSignalConvertResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_goal_test.go | §13.3 |

### 1.9 hr（63 条）

| 方法 | 路径 | handler | 读/写 | capability | 请求参数 | 响应顶层 key | 主要错误 | 测试 | 文档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/workbench/hr/candidates` | `ListHrCandidates` | 读 | hr.read | q{cursor,job_id,limit,stage} | 200 {candidates, total} | 400(cursor not found), 403(forbidden_capability), 500 | — | §10.3 |
| POST | `/api/workbench/hr/candidates` | `CreateHrCandidate` | 写 | hr.write | b:HrCandidateRequest{job_id*,name*,stage,source,phone,email,resume_attachment_id,match_score,score_resume,score_test,score_interview,expected_salary,offer_salary,currency,rejected_reason,owner_member_id,edu,years_experience,resume_text} | 201 HrCandidateResponse | 400, 403(forbidden_capability), 409, 500 | workbench_hr_test.go | §10.3 |
| GET | `/api/workbench/hr/candidates/{candidateId}` | `GetHrCandidate` | 读 | hr.read | — | 200 HrCandidateResponse | 403(forbidden_capability), 404 | workbench_hr_test.go | §10.3 |
| PATCH | `/api/workbench/hr/candidates/{candidateId}` | `UpdateHrCandidate` | 写 | hr.write | b:HrCandidateRequest{job_id*,name*,stage,source,phone,email,resume_attachment_id,match_score,score_resume,score_test,score_interview,expected_salary,offer_salary,currency,rejected_reason,owner_member_id,edu,years_experience,resume_text} | 200 HrCandidateResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_guide_test.go, workbench_hr_test.go | §10.3 |
| DELETE | `/api/workbench/hr/candidates/{candidateId}` | `DeleteHrCandidate` | 写 | hr.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | — | §10.3 |
| POST | `/api/workbench/hr/candidates/{candidateId}/hire` | `HireHrCandidate` | 写 | hr.write | b:HrHireRequest{member_id*,department_id,job_title,grade,hire_date,regular_date,contract_end,ability,disc,owner_member_id} | 200 HrHireResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_hr_test.go | §10.3 |
| GET | `/api/workbench/hr/changes` | `ListHrEmployeeChanges` | 读 | crm.read | q{employee_id,from,kind,limit,to} | 200 {changes, total} | 400, 403(forbidden_capability), 500 | workbench_change_test.go | §16.3 |
| POST | `/api/workbench/hr/changes` | `CreateHrEmployeeChange` | 写 | — | b:HrEmployeeChangeRequest{employee_id*,kind*,effective_on*,from_department_id,to_department_id,from_job_title,to_job_title,from_grade,to_grade,from_contract_end,to_contract_end,from_amount,to_amount,currency,note} | 201 HrEmployeeChangeResponse | 400, 403, 500 | workbench_change_test.go | §16.3 |
| PATCH | `/api/workbench/hr/changes/{changeId}` | `UpdateHrEmployeeChange` | 写 | — | b:∅ | 200 HrEmployeeChangeResponse | 400, 403, 404, 500 | workbench_change_test.go | §16.3 |
| DELETE | `/api/workbench/hr/changes/{changeId}` | `DeleteHrEmployeeChange` | 写 | — | — | 204 无 body | 403, 404, 500 | — | §16.3 |
| GET | `/api/workbench/hr/doc-templates` | `ListHrDocTemplates` | 读 | hr.read | q{kind} | 200 {templates, total} | 400, 403(forbidden_capability), 500 | workbench_doc_test.go | §18.5 |
| POST | `/api/workbench/hr/doc-templates` | `CreateHrDocTemplate` | 写 | hr.write | b:HrDocTemplateRequest{name*,body*,kind,owner_member_id} | 201 HrDocTemplateResponse | 400, 403(forbidden_capability), 409, 500 | workbench_doc_test.go | §18.5 |
| PATCH | `/api/workbench/hr/doc-templates/{templateId}` | `UpdateHrDocTemplate` | 写 | hr.write | b:∅ | 200 HrDocTemplateResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_doc_test.go | §18.5 |
| DELETE | `/api/workbench/hr/doc-templates/{templateId}` | `DeleteHrDocTemplate` | 写 | hr.write | — | 204 无 body | 400, 403(forbidden_capability), 404, 500 | workbench_doc_test.go | §18.5 |
| GET | `/api/workbench/hr/employees` | `ListHrEmployees` | 读 | hr.read | q{cursor,department_id,limit,member_id} | 200 {employees, total} | 400(cursor not found), 403(forbidden_capability), 500 | — | §10.3 |
| POST | `/api/workbench/hr/employees` | `CreateHrEmployee` | 写 | hr.write | b:HrEmployeeProfileRequest{member_id*,department_id,job_title,grade,hire_date,regular_date,contract_end,ability,disc,owner_member_id} | 201 HrEmployeeProfileResponse | 400, 403(forbidden_capability), 409, 500 | workbench_capability_test.go, workbench_change_test.go, workbench_doc_test.go +3 | §10.3 |
| GET | `/api/workbench/hr/employees/{employeeId}` | `GetHrEmployee` | 读 | hr.read | — | 200 HrEmployeeProfileResponse | 403(forbidden_capability), 404 | — | §10.3 |
| PATCH | `/api/workbench/hr/employees/{employeeId}` | `UpdateHrEmployee` | 写 | hr.write | b:HrEmployeeProfileRequest{member_id,department_id,job_title,grade,hire_date,regular_date,contract_end,ability,disc,owner_member_id} | 200 HrEmployeeProfileResponse | 400, 403(forbidden_capability), 404, 500 | workbench_change_test.go, workbench_hr_test.go | §10.3 |
| DELETE | `/api/workbench/hr/employees/{employeeId}` | `DeleteHrEmployee` | 写 | hr.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_hr_test.go | §10.3 |
| GET | `/api/workbench/hr/employees/{employeeId}/documents` | `ListHrEmployeeDocuments` | 读 | hr.read | q{limit} | 200 {documents, total} | 403(forbidden_capability), 404, 500 | workbench_doc_test.go | §18.5 |
| POST | `/api/workbench/hr/employees/{employeeId}/documents` | `CreateHrEmployeeDocument` | 写 | hr.write | b:HrDocDocumentRequest{template_id*,format,values} | 201 对象[document,warnings…] | 400, 403(forbidden_capability), 404, 500 | workbench_doc_test.go | §18.5 |
| GET | `/api/workbench/hr/guides` | `ListHrInterviewGuides` | 读 | hr.read | q{candidate_id,cursor,interview_id,limit,status} | 200 {guides, total} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_guide_test.go | §14.3 |
| POST | `/api/workbench/hr/guides` | `CreateHrInterviewGuide` | 写 | hr.write | b:HrGuideRequest{candidate_id*,job_id*,interview_id,round,status,items,note,owner_member_id} | 201 HrGuideResponse | 400, 403(forbidden_capability), 409, 500 | workbench_guide_test.go | §14.3 |
| POST | `/api/workbench/hr/guides/generate` | `GenerateHrInterviewGuide` | 写 | hr.write | b:HrGuideGenerateRequest{candidate_id*,job_id*,round,limit} | 200 {candidate_id, round, job_id, source, items, total} | 400, 403(forbidden_capability) | workbench_guide_test.go | §14.3 |
| GET | `/api/workbench/hr/guides/{guideId}` | `GetHrInterviewGuide` | 读 | hr.read | — | 200 HrGuideResponse | 403(forbidden_capability), 404 | workbench_guide_test.go | §14.3 |
| PATCH | `/api/workbench/hr/guides/{guideId}` | `UpdateHrInterviewGuide` | 写 | hr.write | b:HrGuideRequest{candidate_id*,job_id*,interview_id,round,status,items,note,owner_member_id} | 200 HrGuideResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_guide_test.go | §14.3 |
| DELETE | `/api/workbench/hr/guides/{guideId}` | `DeleteHrInterviewGuide` | 写 | hr.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | — | §14.3 |
| POST | `/api/workbench/hr/guides/{guideId}/items` | `AppendHrGuideItem` | 写 | hr.write | b:HrGuideItem{question_id,dimension,question,intent,signals,red_flags,asked,note,score} | 201 HrGuideResponse | 400, 403(forbidden_capability), 404, 500 | workbench_guide_test.go | §14.3 |
| PATCH | `/api/workbench/hr/guides/{guideId}/items/{index}` | `UpdateHrGuideItem` | 写 | hr.write | b:HrGuideItemPatchRequest{asked,note,score} | 200 HrGuideResponse | 400, 403(forbidden_capability), 404, 500 | workbench_guide_test.go | §14.3 |
| DELETE | `/api/workbench/hr/guides/{guideId}/items/{index}` | `DeleteHrGuideItem` | 写 | hr.write | — | 200 HrGuideResponse | 403(forbidden_capability), 404, 500 | — | §14.3 |
| GET | `/api/workbench/hr/interviews` | `ListHrInterviews` | 读 | hr.read | q{candidate_id,cursor,from,interviewer_member_id,limit,to} | 200 {interviews, total} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_hr_test.go | §10.3 |
| POST | `/api/workbench/hr/interviews` | `CreateHrInterview` | 写 | hr.write | b:HrInterviewRequest{candidate_id*,scheduled_at*,interviewer_name*,round,duration_minutes,interviewer_member_id,mode,status,note} | 201 HrInterviewResponse | 400, 403(forbidden_capability), 409, 500 | workbench_hr_test.go | §10.3 |
| GET | `/api/workbench/hr/interviews/{interviewId}` | `GetHrInterview` | 读 | hr.read | — | 200 HrInterviewResponse | 403(forbidden_capability), 404 | — | §10.3 |
| PATCH | `/api/workbench/hr/interviews/{interviewId}` | `UpdateHrInterview` | 写 | hr.write | b:HrInterviewRequest{candidate_id*,scheduled_at*,interviewer_name*,round,duration_minutes,interviewer_member_id,mode,status,note} | 200 HrInterviewResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_hr_test.go | §10.3 |
| DELETE | `/api/workbench/hr/interviews/{interviewId}` | `DeleteHrInterview` | 写 | hr.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | — | §10.3 |
| GET | `/api/workbench/hr/jobs` | `ListHrJobs` | 读 | hr.read | q{cursor,department_id,limit,q,status} | 200 {jobs, total} | 400(cursor not found), 403(forbidden_capability), 500 | mcp_workbench_test.go, workbench_hr_test.go | §10.3 |
| POST | `/api/workbench/hr/jobs` | `CreateHrJob` | 写 | hr.write | b:HrJobRequest{title*,department_id,level,headcount,status,salary_min,salary_max,currency,requirements,edu,years,city,jd,urgent,keywords,owner_member_id} | 201 HrJobResponse | 400, 403(forbidden_capability), 500 | workbench_hr_test.go | §10.3 |
| GET | `/api/workbench/hr/jobs/{jobId}` | `GetHrJob` | 读 | hr.read | — | 200 HrJobResponse | 403(forbidden_capability), 404 | workbench_hr_test.go | §10.3 |
| PATCH | `/api/workbench/hr/jobs/{jobId}` | `UpdateHrJob` | 写 | hr.write | b:HrJobRequest{title*,department_id,level,headcount,status,salary_min,salary_max,currency,requirements,edu,years,city,jd,urgent,keywords,owner_member_id} | 200 HrJobResponse | 400, 403(forbidden_capability), 404, 500 | workbench_guide_test.go, workbench_hr_test.go | §10.3 |
| DELETE | `/api/workbench/hr/jobs/{jobId}` | `DeleteHrJob` | 写 | hr.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_hr_test.go | §10.3 |
| GET | `/api/workbench/hr/offboardings` | `ListHrOffboardings` | 读 | hr.read | q{cursor,employee_id,limit,status} | 200 {offboardings, total} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_offboard_test.go | §15.3 |
| POST | `/api/workbench/hr/offboardings` | `CreateHrOffboarding` | 写 | hr.write | b:HrOffboardingRequest{employee_id*,last_day*,reason,kind,handover,cert_done,note,owner_member_id,status} | 201 HrOffboardingResponse | 400, 403(forbidden_capability), 409, 500 | workbench_offboard_test.go | §15.3 |
| GET | `/api/workbench/hr/offboardings/{offboardingId}` | `GetHrOffboarding` | 读 | hr.read | — | 200 HrOffboardingResponse | 403(forbidden_capability), 404 | workbench_offboard_test.go | §15.3 |
| PATCH | `/api/workbench/hr/offboardings/{offboardingId}` | `UpdateHrOffboarding` | 写 | hr.write | b:HrOffboardingRequest{employee_id*,last_day,reason,kind,handover,cert_done,note,owner_member_id,status} | 200 HrOffboardingResponse | 400, 403(forbidden_capability), 404, 500 | workbench_offboard_test.go | §15.3 |
| DELETE | `/api/workbench/hr/offboardings/{offboardingId}` | `DeleteHrOffboarding` | 写 | hr.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | — | §15.3 |
| POST | `/api/workbench/hr/offboardings/{offboardingId}/advance` | `AdvanceHrOffboarding` | 写 | hr.write | b:{} | 200 HrOffboardingAdvanceResponse | 403(forbidden_capability), 404, 409, 500 | workbench_offboard_test.go | §15.3 |
| POST | `/api/workbench/hr/offboardings/{offboardingId}/cancel` | `CancelHrOffboarding` | 写 | hr.write | b:{} | 200 HrOffboardingResponse | 403(forbidden_capability), 404, 409, 500 | workbench_offboard_test.go | §15.3 |
| POST | `/api/workbench/hr/offboardings/{offboardingId}/handover` | `AppendHrOffboardingHandoverItem` | 写 | hr.write | b:HrHandoverItem{key,label,done,note} | 201 HrOffboardingResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_offboard_test.go | §15.3 |
| PATCH | `/api/workbench/hr/offboardings/{offboardingId}/handover/{index}` | `UpdateHrOffboardingHandoverItem` | 写 | hr.write | b:HrHandoverItemPatchRequest{done,note} | 200 HrOffboardingResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_offboard_test.go | §15.3 |
| DELETE | `/api/workbench/hr/offboardings/{offboardingId}/handover/{index}` | `DeleteHrOffboardingHandoverItem` | 写 | hr.write | — | 200 HrOffboardingResponse | 403(forbidden_capability), 404, 409, 500 | — | §15.3 |
| GET | `/api/workbench/hr/questions` | `ListHrQuestions` | 读 | hr.read | q{cursor,dimension,job_id,limit,q} | 200 {questions, total} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_guide_test.go | §14.3 |
| POST | `/api/workbench/hr/questions` | `CreateHrQuestion` | 写 | hr.write | b:HrQuestionRequest{job_id*,dimension*,question*,intent,signals,red_flags,source,tags,owner_member_id} | 201 HrQuestionResponse | 400, 403(forbidden_capability), 409, 500 | workbench_guide_test.go | §14.3 |
| GET | `/api/workbench/hr/questions/{questionId}` | `GetHrQuestion` | 读 | hr.read | — | 200 HrQuestionResponse | 403(forbidden_capability), 404 | workbench_guide_test.go | §14.3 |
| PATCH | `/api/workbench/hr/questions/{questionId}` | `UpdateHrQuestion` | 写 | hr.write | b:HrQuestionRequest{job_id*,dimension*,question*,intent,signals,red_flags,source,tags,owner_member_id} | 200 HrQuestionResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_guide_test.go | §14.3 |
| DELETE | `/api/workbench/hr/questions/{questionId}` | `DeleteHrQuestion` | 写 | hr.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_guide_test.go | §14.3 |
| GET | `/api/workbench/hr/rewards` | `ListHrEmployeeRewards` | 读 | hr.read | q{employee_id,from,kind,limit,to} | 200 {rewards, total} | 400, 403(forbidden_capability), 500 | workbench_reward_test.go | §17.3 |
| POST | `/api/workbench/hr/rewards` | `CreateHrEmployeeReward` | 写 | hr.write | b:HrEmployeeRewardRequest{employee_id*,kind*,reason*,decided_on*,category,amount,currency,note} | 201 HrEmployeeRewardResponse | 400, 403(forbidden_capability), 500 | workbench_reward_test.go | §17.3 |
| PATCH | `/api/workbench/hr/rewards/{rewardId}` | `UpdateHrEmployeeReward` | 写 | hr.write | b:∅ | 200 HrEmployeeRewardResponse | 400, 403(forbidden_capability), 404, 500 | workbench_reward_test.go | §17.3 |
| DELETE | `/api/workbench/hr/rewards/{rewardId}` | `DeleteHrEmployeeReward` | 写 | hr.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | workbench_reward_test.go | §17.3 |
| GET | `/api/workbench/hr/scorecards` | `ListHrScorecards` | 读 | hr.read | q{cursor,interview_id,limit,reviewer_member_id} | 200 {scorecards, total} | 400(cursor not found), 403(forbidden_capability), 500 | workbench_hr_test.go | §10.3 |
| POST | `/api/workbench/hr/scorecards` | `CreateHrScorecard` | 写 | hr.write | b:HrScorecardRequest{interview_id*,reviewer_member_id,score_skill,score_experience,score_culture,score_potential,weighted_score,dimensions,verdict,comment} | 201 HrScorecardResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_hr_test.go | §10.3 |
| PATCH | `/api/workbench/hr/scorecards/{scorecardId}` | `UpdateHrScorecard` | 写 | hr.write | b:HrScorecardRequest{interview_id,reviewer_member_id,score_skill,score_experience,score_culture,score_potential,weighted_score,dimensions,verdict,comment} | 200 HrScorecardResponse | 400, 403(forbidden_capability), 404, 409, 500 | workbench_hr_test.go | §10.3 |
| DELETE | `/api/workbench/hr/scorecards/{scorecardId}` | `DeleteHrScorecard` | 写 | hr.write | — | 204 无 body | 403(forbidden_capability), 404, 500 | — | §10.3 |

### 1.10 ads（7 条）

| 方法 | 路径 | handler | 读/写 | capability | 请求参数 | 响应顶层 key | 主要错误 | 测试 | 文档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/workbench/ads/accounts` | `AdsAccounts` | 读 | — | — | 200 {accounts, total} | 500 | — | §25.3 |
| GET | `/api/workbench/ads/materials` | `AdsMaterials` | 读 | — | q{account_id,limit,type} | 200 {materials, total} | 400, 500 | — | §25.3 |
| GET | `/api/workbench/ads/plans` | `AdsPlans` | 读 | — | q{account_id,limit,status} | 200 {plans, total} | 500 | — | §25.3 |
| GET | `/api/workbench/ads/recon` | `AdsRecon` | 读 | — | q{account_id} | 200 {recon, total} | 500 | — | §25.3 |
| GET | `/api/workbench/ads/summary` | `AdsSummary` | 读 | — | q{basis,from,to} | 200 adsSummaryResponse | 400, 500 | workbench_ads_test.go | §25.3 |
| GET | `/api/workbench/ads/violations` | `AdsViolations` | 读 | — | q{limit,status} | 200 {violations, total} | 500 | — | §25.3 |
| POST | `/api/workbench/import` | `ImportWorkbenchCSV` | 写 | crm.write · crm.amount? | q{dry_run,kind} b:CSV(text/csv) | 200 ImportPreviewResponse | 400, 403(forbidden_capability), 413, 415, 500 | workbench_import_test.go | §23.1 |

## 2. 统一约定

这一节每条都标了代码位置；不能从代码里核实的，写「未核实」而不是填一个看起来对的答案。

### 2.1 金额、比率与币种

- **存储与出站**：金额列是 `NUMERIC(14,2)`，线上**一律 JSON number**：`floatToNumeric`（`server/internal/handler/workbench_types.go` L236–245）把请求值经最短十进制串写成 NUMERIC，`numericToFloatPtr`（L249–259）把列转 `float64`，NULL 保持 `null`。**不输出字符串金额**——前端 zod 只要遇到字符串金额就会整页回退（见 §3.3）。
- **比率一律 0–1**，服务端不乘 100：`prob`（400 `prob must be between 0 and 1`）、`commission_rate`（400 `commission_rate must be between 0 and 1`）、`agency_share_rate`（400）、`hit_rate`、`gross_margin`、`refund_rate`。展示层 ×100 是客户端的事。
- **币种**：`currency` 三位字母，落库前大写；`workbenchCurrency` 越界 → 400 `currency must be a 3-letter code`。缺省值按端点不同（`bd/quotes` 缺省 `CNY`；`crm_settlement` 由请求带；`crm_brief` **没有 currency 列**，预算按 CNY 解释，§3.1）。
- **混合币种不求和只在 BD 侧成立**：`server/pkg/db/queries/workbench_bd.sql` 里 `total_fee` 的注释（L418–421）写明它只加**主币种**（行数最多的 `currency`）并把该币种回给客户端；`/bd/performance` 是一个窗口一种钱。**`/finance` 与 `/affiliate/summary` 的 SQL 没有币种维度**（直接 `sum(...)`，无 `GROUP BY currency`、无过滤），见 §3.6 第 4 条。

### 2.2 时间与日期

- **timestamptz → RFC3339 字符串**：`util.TimestampToString` 用 `time.RFC3339`（不是 Nano）。NULL 时指针字段给 `null`（`timestampToPtr`），`created_at` / `updated_at` 这类 NOT NULL 列走 `timestampToString` 得 `""`（只有脏数据才会出现）。
- **纯日期 → `YYYY-MM-DD`**：`dateToString`（workbench_types.go L347–352）；NULL → `null`。
- **入参解析**：DATE 接受 `YYYY-MM-DD` 或 RFC3339（截断到日）——`workbenchDateValue` L289–302；TIMESTAMPTZ 接受 RFC3339 或裸日期（当日 00:00，按请求自身 offset）——`workbenchTimestampValue` L306–319。非法统一 400 `invalid <field>`。
- **月份**：`/finance/months` 的 `month` 必须是**月初**（400 `month is required (YYYY-MM-DD, the first day of the month)`）；`/finance?month=`、`/affiliate/summary?month=` 接受 `YYYY-MM` 或月初 `YYYY-MM-DD`；`/ads/summary?from=&to=` 用 `adsDayRange`（L290–311），缺省 `from` = `to` 所在月 1 号。
- **窗口**：`/bd/performance` 的 `from`/`to` 是闭区间自然日，`to < from` → 400（`workbenchPerformanceWindow`）。

### 2.3 三态（`value:null` + `empty` vs 真 0）

形状：`{ "value": number|null, "sample_count": number, "empty": "zero"|"insufficient_data" }`。

- 两个 `empty` 值来自常量 `metricEmptyZero` / `metricEmptyInsufficientData`（`workbench_metrics.go` L19–20）。`dash` **不发**：客户端把未知值当 `insufficient_data`。
- **计数器**：`value` 永不为 null，0 就是真 0（`adsCountOf`，`workbench_ads.go` L268–271）。
- **金额/比率**：没有可加的行 → `value:null` + `insufficient_data`（`adsMoneyOf` L260–265）；有行且合计为 0 → `value:0` + `zero`。`/bd/pipeline` 的金额块用 `{amount, currency, sample_count, empty}`（字段名是 `amount` 不是 `value`）。
- 单字段空值**不走三态**：可空列就是 `null`（不是 0、不是 `""`）。

### 2.4 分页

| 规则 | 代码事实 |
| --- | --- |
| `limit` 默认 50、上限 200 | `workbenchLimit`（workbench_types.go L162–179）。**非正整数/不可解析静默回退 50，不 400** |
| `cursor` = 上一页最后一行的 id | `workbenchCursor` L182–188，非 UUID → 400 `invalid cursor` |
| 游标在本表解析不到 → 400 | `workbenchCursorKey` L194–208，消息 `cursor not found`（别的租户、已删、或不是这张台账的 id） |
| `next_cursor` 只由 4 个列表返回 | `creators`、`creators/health`、`bd/activities`、`bd/quotes`；值是本页最后一行 id，**只有满页才有** |
| 其余 15 个列表接受 `cursor` 却不回 `next_cursor` | 见 §3.5 第 1 条 |
| `total` = 本页条数 | 不是全量；权威计数只在 `/counts`（`WORKBENCH-API` §3.1 同口径） |
| 排序由服务端定 | creators 的 cursor 按当前 `sort` 重解析成 `(排序值, fans, id)`；bd 的 cursor 只在同一 `sort` + 同一过滤下有效 |

### 2.5 空值与 PATCH 清空语义

可空列在请求里有四种状态（实现：`workbench_types.go` L460–643 的 `apply*ClearPatch`）：

| 请求里怎么写 | 结果 |
| --- | --- |
| key 省略 | **保留**库里的值 |
| `null` | **清空** → SQL NULL |
| `""` | **清空** → SQL NULL（兼容旧客户端，不是文档推荐写法） |
| 有值 | 按类型解析后写入 |

- **NOT NULL 列不能清空**：`null` / `""` / 纯空白 → 400 `<field> is required`（`applyRequiredTextPatch` L623–643）。例如 `creator_activity.summary`、`crm_settlement.amount`、各表 `kind` / `currency`。
- **JSONB 数组**：`[]` 才叫清空；`null` 等同「没传」，不抹掉已存明细（`creator_quote.items`）。
- **"有没有动这个字段"看 key 是否出现，不看值**：`{"creator_fee": null}` 仍然是一次金额写，需要 `crm.amount`、agent 仍然 403（`patchTouches` L510–515）。**create 上不适用**：新建时 `null` 只是「没给值」。
- 清空会写审计（`details.before/after`）并 `revision + 1`。

### 2.6 并发（`expected_revision` / 409 / 404）

| 场景 | 形状 |
| --- | --- |
| PATCH 带 body `expected_revision`（int，可选） | 一致 → 正常；不一致 → **409** `{"error":"stale_write","current":{…完整当前行…}}`（`writeStaleWrite`，`workbench_audit.go` L283–290） |
| `expected_revision` ≤ 0 或非整数 | **400** `expected_revision must be a positive integer`（`workbenchExpectedRevision` L269–277；bd 的删除守卫另有 L2078） |
| 行已归档/不存在 | **404**（没有「当前行」可回，客户端动作同样是刷新而不是重放） |
| DELETE 的守卫走 query | **只有** `DELETE /crm/collabs/{collabId}` 与 `DELETE /bd/quotes/{quoteId}` 接受 `?expected_revision=`；其余 DELETE 没有守卫 |

会答 409 的写路径（代码核对）：`PATCH crm/collabs/{collabId}`、`DELETE crm/collabs/{collabId}`、`PATCH crm/settlements/{settlementId}`、`PATCH bd/activities/{activityId}`、`PATCH bd/quotes/{quoteId}`、`DELETE bd/quotes/{quoteId}`；另外 10 条写路径的 409 来自唯一约束（creator handle、campaign name、question、guide/round、product、pick、offboarding、employee profile、script version、interview slot、scorecard）。

### 2.7 错误码字典

所有 4xx/5xx body 都是 `{"error": "<消息或稳定码>"}`；带结构化字段的只有下表列出的几个。

| 状态 | `error` 值 / 消息 | 触发条件 | 出现位置 |
| --- | --- | --- | --- |
| 400 | `invalid request body` | body 不是合法 JSON | `decodeWorkbenchBody`（workbench_types.go L324–336） |
| 400 | `invalid <field>` | UUID / 日期 / 枚举 / 币种 / 金额格式错 | `parseUUIDOrBadRequest`、`workbenchDateValue` L300、`workbenchTimestampValue` L317、`workbenchCurrency`、`parseUUIDOrBadRequest(… "cursor")` |
| 400 | `cursor not found` | cursor 在本表/本工作区解析不到 | workbench_types.go L204；workbench_creator.go L294；workbench_creator_health.go L154；workbench_bd.go L1667 |
| 400 | `expected_revision must be a positive integer` | 守卫值非法 | workbench_audit.go L274；workbench_bd.go L2078 |
| 400 | `overwrite_reason_required` `{allowed}` | 人改 agent 最后动过的行但没给理由 | workbench_audit.go L230 |
| 400 | `invalid_overwrite_reason` `{allowed}` | 理由不在 `wrong_fact|wrong_judgement|stale|taste` | workbench_audit.go L238 |
| 400 | `<field> is required` / `<msg> are required` | 必填缺失或清空 NOT NULL 列 | 各 handler；`applyRequiredTextPatch` L623 |
| 403 | `forbidden_capability` `{capability}` | 缺所需 capability | `writeCapabilityError`，workbench_capability.go L250–255 |
| 403 | `forbidden_agent_money` `{fields, detail}` | agent 写金额/结算/佣金率 | `agentMoneyGate`，workbench_audit.go L174–184 |
| 403 | `cross_department` | `department` 可见性模式下跨部门写/按 id 读 | workbench_capability.go L343–349 |
| 403 | 归属句（`you can only change … you own` / `members can only create rows they own` / `members cannot reassign ownership` / `agents cannot delete workbench rows`） | 不是行主、不是 owner/admin、或 agent 删除 | workbench_types.go L128 / L150；`agentDeleteGate` workbench_audit.go L117；各域 loader |
| 403 | `a review must be decided by a person: …` | agent 试图 accept/reject | workbench_review.go L319–323 |
| 404 | 行不存在 / 已归档 / 别的工作区；`role template not found` | 按 id 读或写单条 | 各域 loader；workbench_capability.go L527 |
| 409 | `stale_write` `{current}` | `expected_revision` 不符 | `writeStaleWrite` workbench_audit.go L283 |
| 409 | 唯一冲突消息（`a creator with this platform handle already exists` 等 11 类） | 唯一索引命中 | 各 handler 的 `isUniqueViolation` 分支 |
| 409 | `this row is not pending: it was already reviewed` | 重复 accept/reject | workbench_review.go |
| 413 / 415 | 体积/行数超限、`Content-Type must be text/csv` | 只发生在 `POST /import` | workbench_import.go |
| 500 | 每个 handler 一条稳定消息（如 `failed to list creators`） | 内部错误；原始错误只进日志 | `workbenchInternalError`，workbench_types.go L340–343 |

### 2.8 capability 全表（13 个）

| capability | 含义 | 命中路由数 | 备注 |
| --- | --- | --- | --- |
| crm.read | 读 CRM 域台账 | 32 | crm、bd、creator 的读；`/hr/changes` 的列表也用它（见 §3.5） |
| crm.write | 写 CRM/BD/达人/内容台账 | 40 | 所有非金额、非结算字段的写 |
| crm.amount | 改金额字段 | 6 | 条件触发：collab 的 6 个金额字段、quote 的 `fee_amount|commission_rate`、CSV 导入的 quotes/collabs、`/finance/months` |
| crm.settle | 结算 | 5 | 条件触发：`crm_settlements` 三个写 + collab 的 `stage=settled` |
| media.read | 读内容/热点台账 | 12 |  |
| media.write | 写内容/热点台账 | 22 |  |
| media.publish | 「这条上线了」的写 | 0 | **没有任何路由检查它**（0 条）——见 §3.5 |
| hr.read | 读人事 | 18 |  |
| hr.write | 写人事 | 41 |  |
| boss.read | 读经营/目标聚合 | 20 | `/finance` 2 条 + `/goals`、`/signals` 全部 18 条——**包括写**，因为没有 `boss.write`（见 §3.5） |
| ads.read | 读千川 | 0 | **没有任何路由检查它**（0 条）——见 §3.5 |
| review.accept | 复核闸门 | 3 | `/review` 三条；另外 role-template 的 PUT/DELETE 复用它作为 403 的能力名 |
| agent.delegate | 允许 agent 代写 | 0 | 不在 HTTP 路由上；在 MCP 代写入口检查（workbench_agent_write.go L204） |

**解析顺序**（`workbenchCapabilities`，workbench_capability.go L198–236；`source` 字段由 `workbenchCapabilitiesWithSource` L406–438 给出）：

1. `member.role ∈ {owner, admin}` → 全部 13 个（`source:"role"`）。
2. 该成员的 `hr_employee_profile.job_title`（未归档）命中 `workbench_role_template` → 模板集合（`source:"template"`）。
3. `member.department_id` 的部门名按**子串**命中内置表（`source:"department"`）：`销售`/`商务`/`bd` → crm.read+crm.write+crm.amount+media.read+boss.read；`客户` → crm.read+crm.write+media.read；`内容` → media.read+media.write+media.publish+crm.read；`运营` → media.*+crm.read+boss.read；`投放`/`广告` → ads.read+media.read+boss.read；`人事`/`hr` → hr.read+hr.write；`财务` → crm.read+boss.read+crm.settle；`设计` → media.read+media.write（L83–99，最长片段优先）。
4. 兜底（`source:"fallback"`）：`crm.read crm.write crm.amount crm.settle media.read media.write media.publish hr.read ads.read boss.read`（L159–165）。**不是只读**：它等于 capability 出现之前的行为；`hr.write` / `review.accept` / `agent.delegate` 默认不给。

**三者的关系**：`role` 是平台角色（最高优先，且不可被模板收窄）；职位模板按**人**覆盖；部门默认按**部门名**兜底；三者都命不中才落到兜底集合。解析每次请求重算（无进程内缓存）。

### 2.9 第二层：归属、部门与 agent

- **归属**：`workbenchCanWrite`（L106–111）= owner/admin 全写，`member` 只能写 `owner_member_id = 自己` 的行；新建只能归自己（`workbenchOwnerForCreate` L117–138），改派仅 owner/admin（`workbenchOwnerForUpdate` L142–158）。派生归属：脚本沿 topic、拍摄沿 script→topic、关键结果/分包沿 goal、结算沿 collab、精选日事实沿 pick、IP 账号挂载沿 IP。
- **部门可见性**（`workspace.settings.workbench_visibility`，L270–285）：`department` 模式下读列表按 `department_id` 收窄，按 id 读跨部门 → 403 `cross_department`；调用者无部门 → 列表空、按 id 读 403。**只影响读，不影响已有写权限**。
- **agent 三条闸门**：金额 403 `forbidden_agent_money`（`agentMoneyGate`）；删除 403 `agents cannot delete workbench rows`（`agentDeleteGate`）；复核必须由人（`a review must be decided by a person`）。agent 的归属只能是自己或它的 delegator（`workbenchAgentRowGate`）。
- **角色闸门**：`PUT/DELETE role-templates`（403 复用 `capability:"review.accept"`）与 `/finance/months`（403 `only workspace owners and admins can record monthly finance entries`）只给 owner/admin。

## 3. 缺口清单

### 3.1 有路由、文档没写（3 条）

| 方法 | 路径 | handler | 代码位置 | 现有测试 |
| --- | --- | --- | --- | --- |
| GET | `/api/workbench/search` | `WorkbenchSearch` | search_workbench.go:110 | search_workbench_test.go |
| POST | `/api/workbench/crm/collabs/{collabId}/thread` | `CreateCrmCollabThread` | workbench_thread.go:195 | workbench_flow_test.go |
| POST | `/api/workbench/bd/quotes/{quoteId}/thread` | `CreateBdQuoteThread` | workbench_thread.go:228 | workbench_flow_test.go |

说明：

- `GET /api/workbench/search`：`router.go` L2412–2414 的注释指向「§26」，但 §26 全节只写复核与归因，没有 search 的参数/响应/超时语义。代码实际接受 `?q=&kinds=&limit=&device_id=`，`q` 缺失 400 `q parameter is required`，超时 503 `search timed out; please refine your query or try again`，响应 `{results, kinds}`。
- 两条 `/thread`：会**建 issue**（`openWorkbenchThread`，workbench_thread.go），同一 origin 幂等（200 已有 / 201 新建），并把 issue id 回写台账行的 `issue_id`。文档里连名字都没出现，真实数据接进来时没人知道这两个写会往 issue 表里落行。

### 3.2 文档写了、代码里不存在或已过时（0 条路由，6 处口径）

**不存在**：`WORKBENCH-API.md` 里出现的每一个 `/api/workbench/...` 端点都能在 router.go 找到（4 处只是「基址」写法：`/api/workbench/affiliate`、`/api/workbench/bd`、`/api/workbench/hr`、`/api/workbench/media`）。

**已过时/口径不一致**（接真实数据前应改文档）：

| 文档位置 | 文档原话 | 代码事实 |
| --- | --- | --- |
| §3.1 | 「只有 creators 分页，其余列表全量返回，服务端硬上限 500 行」 | 19 个列表接受 `?cursor=`（`workbenchCursor`/`workbenchCursorKey`），`limit` 上限 200，代码里没有 500 行上限 |
| §3.1、§3.5 | 路径参数写 `crm/collabs/{id}` | 代码段名是 `{collabId}`（`chi.URLParam(r,"collabId")`）；同类：`{quoteId}`、`{settlementId}` |
| §24.5 | 「`review.accept` 未接复核队列」「`agent.delegate` 未执行」 | 两者都已接：`workbench_review.go` L173/L315 检查 `review.accept`；`workbench_agent_write.go` L204 检查 `agent.delegate` |
| §24.5 | 「`ads.read` 千川接口落地时复用」 | §25 的 6 条 ads 路由**没有任何 capability 检查**，`ads.read` 至今 0 处使用 |
| §3.3 | PUT `/finance/months` 金额 0–1e12 | 已在代码：`financeAmountMax = 1e12`（workbench_finance.go L50、L420）——一致，保留作核对点 |
| §12.3 | `scripts` PATCH 用 `?inPlace=1` 覆盖当前行 | 一致：代码读 `inPlace`（workbench_media.go:1670，大小写敏感）；保留作回归核对点 |

### 3.3 zod 覆盖：哪些响应没有 schema

机制先说清楚，否则容易误判：

- 所有 workbench schema 以 `.loose()` 结尾（`packages/core/api/schemas.ts`），**服务端多出来的字段会被保留**（不会静默丢字段），只是 TS 类型里看不见。
- 真正的风险在另一侧：schema 里**没有 default 的必填键**一旦缺失或类型不符，`parseWithFallback` 会回退到 `EMPTY_*` → **整块页面变空**，而不是报错。目前几乎每个键都有 `.default()`/`.nullable()`，例外是各 schema 的 `id: z.string()` 与 `amount: z.number()` 一类"身份/金额"键。
- 金额一旦被服务端序列化成字符串，`z.number()` 解析失败 → 整页回退（这就是 §3.1 反复强调「金额一律 number」的原因）。

**没有被任何 zod schema 覆盖的端点（38 条）**。其中 37 条是 204 无 body（不需要 schema），剩下的是真正缺的：

| 方法 | 路径 | handler | 服务端响应 | 客户端现状 |
| --- | --- | --- | --- | --- |
| GET | `/api/workbench/search` | `WorkbenchSearch` | 200 WorkbenchSearchResponse | 客户端无方法、无 schema |

**双向字段漂移**（服务端发了客户端不认识的、或客户端类型里有服务端从不发的）：

| 端点 | 服务端（代码） | 客户端（zod） | 后果 |
| --- | --- | --- | --- |
| `GET /review` | `{items:[{domain,id,label,detail,review_state,updated_at,revision,assignee_type,assignee_id}], total}`（workbench_review.go L206/L29–39） | `{rows:[{domain,id,review_state,actor_type,actor_id,agent_name,actor_name,summary,changed_fields,amount,currency,revision,created_at,updated_at}], total}`（`ReviewQueueResponseSchema`） | **`rows` 永远是 `[]`**：复核队列在 UI 上恒为空，真实数据进来也一样 |
| `GET /counts` | 15 个计数：creators/clients/briefs/collabs_open/settlements_pending/jobs/candidates/interviews/employees/media_scripts/media_shoots/hot/bench/goals/signals（workbench_metrics.go） | 9 个：前 5 个必填 + jobs/candidates/interviews/employees 可选（`WorkbenchCountsResponseSchema`） | `media_scripts`/`media_shoots`/`hot`/`bench`/`goals`/`signals` 6 个数字**在客户端类型里不存在** → 侧栏画不出来 |
| 4 张核心台账（collab/settlement/quote/activity）的 PATCH/POST | 响应带 `review:{state, reviewed_by, reviewed_at}`（`WorkbenchReview`，workbench_types.go） | `CrmCollabSchema` / `CrmSettlementSchema` / `BdQuoteSchema` / `BdActivitySchema` 都没有 `review` 键 | 复核状态、驳回人、驳回时间在 UI 上不可读（`.loose()` 保住了数据，但没有类型） |
| 创作者的 mirror 字段 | `CreatorResponse` 有 27 个键，没有 `sec_uid/douyin_id/tags/source_*` 等 | `CreatorSchema` 额外声明 18 个 mirror 键（全部 `.nullable().default(null)`） | 类型里有的字段服务端从不发送 → 永远 `null`，「达人来源/标签」列画不出东西 |
| CRM/BD/affiliate 的 `archived_at` | `CrmClientResponse`、`CrmBriefResponse`、`CrmCollabResponse`、`BdQuoteResponse`、`AffiliateProductResponse` 等都不发 `archived_at`；media/goal/hr 的响应**有**这个键 | 以上 CRM/BD/affiliate schema 里都有 `archived_at` | 软删状态在这三域不可见：客户端无法区分「被删了」和「本来没有」 |

### 3.4 没有测试的写端点（13 条）

判定方式：`server/internal/handler/*_test.go` 里是否出现 `testHandler.<HandlerName>`（测试直接调 handler，不经路由）。

| 方法 | 路径 | handler | 代码位置 | capability |
| --- | --- | --- | --- | --- |
| DELETE | `/api/workbench/affiliate/picks/{pickId}` | `DeleteAffiliatePick` | workbench_affiliate.go:1100 | crm.write |
| DELETE | `/api/workbench/media/shoots/{shootId}` | `DeleteMediaShoot` | workbench_media.go:2077 | media.write |
| DELETE | `/api/workbench/goals/{goalId}/key-results/{keyResultId}` | `DeleteGoalKeyResult` | workbench_goal.go:1110 | boss.read |
| DELETE | `/api/workbench/signals/{signalId}` | `DeleteMarketSignal` | workbench_goal.go:1498 | boss.read |
| DELETE | `/api/workbench/hr/candidates/{candidateId}` | `DeleteHrCandidate` | workbench_hr.go:1471 | hr.write |
| DELETE | `/api/workbench/hr/interviews/{interviewId}` | `DeleteHrInterview` | workbench_hr.go:1946 | hr.write |
| DELETE | `/api/workbench/hr/scorecards/{scorecardId}` | `DeleteHrScorecard` | workbench_hr.go:2182 | hr.write |
| DELETE | `/api/workbench/hr/changes/{changeId}` | `DeleteHrEmployeeChange` | workbench_change.go:579 | — |
| DELETE | `/api/workbench/hr/guides/{guideId}` | `DeleteHrInterviewGuide` | workbench_guide.go:1127 | hr.write |
| DELETE | `/api/workbench/hr/guides/{guideId}/items/{index}` | `DeleteHrGuideItem` | workbench_guide.go:1272 | hr.write |
| DELETE | `/api/workbench/hr/offboardings/{offboardingId}` | `DeleteHrOffboarding` | workbench_offboard.go:686 | hr.write |
| DELETE | `/api/workbench/hr/offboardings/{offboardingId}/handover/{index}` | `DeleteHrOffboardingHandoverItem` | workbench_offboard.go:945 | hr.write |

补充：`workbench_clearing_test.go`、`workbench_collab_test.go` 等用**别的 handler 名**覆盖了一部分清空/并发语义；上表是「这个 handler 自身从未被调用」的严格口径。

### 3.5 契约含糊处

| 含糊点 | 具体表现 | 证据位置 |
| --- | --- | --- |
| 分页能力不对等 | 19 个列表接受 `?cursor=`，只有 4 个（creators、creators/health、bd/activities、bd/quotes）返回 `next_cursor`。其余 15 个的客户端只能靠「这页满了就再请求一次」猜下一页，或者干脆只读第一页 | workbench_types.go L182/L194；`ListCrmClients` L293 用了 `workbenchCursorKey` 却不回 `next_cursor` |
| `total` 一个词两种意思 | 列表里 `total` = 本页条数；`/bd/pipeline` 里 `creators.total` = 全量计数。同一个词在同一份 API 里两个语义 | workbench_types.go L371–375；workbench_bd.go pipeline |
| 金额字段命名不成体系 | 报价 `fee_amount`、合作 `quote_amount`/`final_amount`、结算 `amount`、活动 `budget_amount`、日事实 `gmv_amount`；CSV 导入列别名又把它们叫「坑位费/报价/金额」。单位一致（元、NUMERIC(14,2)），但「报价 vs 成交 vs 结算」三层语义只能靠字段名猜 | 各域 request struct；`workbench_import.go` 的 `importSpecs` |
| 日期精度不一致 | `settled_on`/`due_at`/`paid_at`/`schedule_from` 是 DATE（`YYYY-MM-DD`），`published_at`/`confirmed_at`/`accepted_at`/`scheduled_at` 是 TIMESTAMPTZ（RFC3339）；同一个「结算」概念在 collab 用 DATE、在 settlement 也用 DATE，但「发布」在 collab/post 是时间戳 | workbench_types.go L647–1056 的响应 struct |
| `boss.read` 是唯一管写的 `.read` capability | 没有 `boss.write`：`/goals` 与 `/signals` 的 18 条（含 POST/PATCH/DELETE）全部只检查 `boss.read`。名字说「读」，实际是「这一域的全部权限」——按 capability 名做文案/帮助时会对不上 | workbench_goal.go L537–L1561 的 18 处 `capBossRead` |
| HR 域的 capability 不一致 | `GET /hr/changes` 用 `crm.read`；`POST/PATCH/DELETE /hr/changes` **没有任何 capability**（只有归属校验）；其余 HR 路由用 `hr.read`/`hr.write` | workbench_change.go L399；L451/L532/L580 |
| `ads.read` 与 `media.publish` 是死能力 | 两个常量在目录里、可被模板发放、`GET /capabilities` 会回给客户端，但没有任何路由检查它们 | workbench_capability.go L52/L56；`grep capAdsRead` 仅 5 处，全在 capability.go |
| `department_id` 同名不同义 | 在 `/overview`、`/finance`、`/affiliate/summary` 是「聚合过滤」；在 `/crm/collabs` 等是「行主部门」；在 `/hr/employees` 是「员工所属部门」 | workbenchDepartmentFilter / bdDepartmentFilter / ListHrEmployees |
| 未文档化的过滤参数 | `review_state`（4 张台账列表）、`assignee=me|<uuid>`（collab/quote/activity/settlement）、`paid`（settlements，只接受 true/false）、`device_id`（搜索/诊断）在文档里都没写 | `grep r.URL.Query()` 全表；`workbenchAssigneeFilter`、`workbenchReviewStateFilter` |
| agent 场景的 `assignee=me` 会 400 | `assignee=me` 解析到 agent 且该 agent 没有 id 时回 400 `assignee=me resolved to an agent without an id` | workbench_queue.go |
| 软删不可观测（CRM/BD/affiliate） | DELETE 都是归档（`archived_at`），但这三域的响应不返回 `archived_at`（media/goal/hr 返回），zod 里却都有这个键 → 客户端只能看到 204，然后这条从列表里消失 | §3.3 第 5 行 |

### 3.6 最可能在真实生产数据上出事的 5 条

| # | 问题 | 为什么会在真实数据上出事 | 证据 |
| --- | --- | --- | --- |
| 1 | **复核队列永远空** | `GET /review` 服务端发 `items`，客户端 schema 只认 `rows` → 解析结果恒为 `EMPTY_REVIEW_QUEUE_RESPONSE`。复核是 §26 的整条链路（agent 写 → 人复核 → 覆写率指标），队列空了，指标也会跟着变成「无样本」 | `workbench_review.go` L206 vs `ReviewQueueResponseSchema` |
| 2 | **19 个列表只给了游标的一半** | 服务端接受 `?cursor=` 却不回 `next_cursor`（15 个端点）。真实数据一过 50 行，客户端翻不到第 2 页；测试数据（几行）永远暴露不了这个问题 | `ListCrmClients` L293–315、`ListHrJobs`、`ListAffiliateProducts` 等 |
| 3 | **混合币种被静默相加** | `/finance` 与 `/affiliate/summary` 的 SQL 没有币种维度：`crm_settlement.currency` 一旦出现 USD/HKD，`signed`/`collected`/`gmv` 就是跨币种求和，毛利率的分母分子还可能来自不同币种。BD 侧已按「主币种」隔离，这两处没有 | `workbench_crm.sql` 的 `OverviewCrmFinance`、`workbench_affiliate.sql` 的 `AffiliateSummary` |
| 4 | **两个 capability 名存实亡** | `ads.read`（0 条路由使用）与 `media.publish`（0 条）。模板/部门默认可以发放它们，`GET /capabilities` 会告诉客户端「你有投放读权限/发布权限」，但后端从不检查 → 权限界面与实际行为不一致；真实数据接入后谁都能读千川、谁都能发布 | `workbench_capability.go` L52/L56；`workbench_ads.go` 六个 handler 只有 `workbenchReadScope` |
| 5 | **HR 异动流的权限口径跑偏** | `GET /hr/changes` 检查的是 `crm.read`，写三条完全没有 capability（只有「档案是否归你」）。结果是：只有 `hr.read` 的人（如人事专员模板）**读不到**异动流，只有 `crm.read` 的销售**能读到全公司的人事变动**；写侧则绕过了 `hr.write` | `workbench_change.go` L399 / L451 / L532 / L580 |

次要但同样值得排期：`GET /counts` 缺 6 个计数（§3.3）、4 张台账的 `review` 字段没有 zod 类型、13 个写端点无测试（§3.4）。

## 附录 A：单条响应的顶层 key（按 struct）

表里写 `XxxResponse` / `对象` 的行，顶层 key 就是这里的字段名（顺序同 struct 声明）。

| struct | 字段数 | 顶层 key |
| --- | --- | --- |
| `WorkbenchOverviewResponse` | 2 | `metrics`, `agent_metrics` |
| `WorkbenchCountsResponse` | 15 | `creators`, `clients`, `briefs`, `collabs_open`, `settlements_pending`, `jobs`, `candidates`, `interviews`, `employees`, `media_scripts`, `media_shoots`, `hot`, `bench`, `goals`, `signals` |
| `WorkbenchSearchResponse` | 2 | `results`, `kinds` |
| `WorkbenchCapabilitiesResponse` | 4 | `capabilities`, `source`, `role`, `visibility` |
| `WorkbenchRoleTemplateResponse` | 6 | `id`, `workspace_id`, `job_title`, `capabilities`, `created_at`, `updated_at` |
| `WorkbenchReviewQueueResponse` | 2 | `items`, `total` |
| `adsSummaryResponse` | 8 | `from`, `to`, `basis`, `currency`, `empty`, `totals`, `previous`, `basis_options` |
| `adsAccountListResponse` | 2 | `accounts`, `total` |
| `adsPlanListResponse` | 2 | `plans`, `total` |
| `adsMaterialListResponse` | 2 | `materials`, `total` |
| `adsViolationListResponse` | 2 | `violations`, `total` |
| `adsReconListResponse` | 2 | `recon`, `total` |
| `ImportPreviewResponse` | 6 | `kind`, `parsed`, `accepted`, `committed`, `rows`, `errors` |
| `WorkbenchFinanceResponse` | 6 | `window`, `signed`, `collected`, `gross_margin`, `receivable_days`, `cash_floor` |
| `WorkbenchFinanceMonthListResponse` | 2 | `months`, `total` |
| `WorkbenchFinanceMonthResponse` | 10 | `id`, `workspace_id`, `month`, `cash_open`, `fixed_cost`, `variable_cost`, `note`, `created_by`, `created_at`, `updated_at` |
| `CreatorHealthListResponse` | 3 | `creators`, `total`, `next_cursor` |
| `CreatorResponse` | 27 | `id`, `workspace_id`, `kind`, `display_name`, `platform`, `handle`, `url`, `fans`, `fans_d7`, `avg_play`, `engagement_rate`, `category`, `audience_note`, `region`, `price_note`, `score`, `risk_flag`, `blacklist_reason`, `owner_member_id`, `media_ip_project_id`, `created_by`, `created_at`, `updated_at`, `hit_rate`, `posts_last_30d`, `videos_with_stats`, `metric_captured_on` |
| `CreatorHealthDetailResponse` | 3 | `creator_id`, `latest`, `recent` |
| `CreatorPostResponse` | 14 | `id`, `workspace_id`, `creator_id`, `collab_id`, `content_issue_id`, `media_script_id`, `platform`, `title`, `url`, `published_at`, `source`, `created_by`, `created_at`, `updated_at` |
| `CreatorPostMetricResponse` | 15 | `id`, `workspace_id`, `post_id`, `captured_on`, `play`, `likes`, `comments`, `shares`, `clicks`, `converts`, `gmv_amount`, `currency`, `source`, `created_at`, `updated_at` |
| `CrmClientResponse` | 14 | `id`, `workspace_id`, `name`, `brand`, `industry`, `contact_name`, `contact_channel`, `contract_entity`, `payment_terms`, `credit_note`, `owner_member_id`, `created_by`, `created_at`, `updated_at` |
| `CrmBriefResponse` | 19 | `id`, `workspace_id`, `client_id`, `title`, `category`, `budget_min_amount`, `budget_max_amount`, `target_audience`, `deliverable_type`, `platforms`, `schedule_from`, `schedule_to`, `kpi_play`, `kpi_gmv_amount`, `status`, `owner_member_id`, `created_by`, `created_at`, `updated_at` |
| `CrmCollabResponse` | 32 | `id`, `workspace_id`, `brief_id`, `creator_id`, `stage`, `quote_amount`, `final_amount`, `prob`, `creator_fee`, `sample_cost`, `platform_fee`, `currency`, `settlement_mode`, `commission_rate`, `sample_required`, `script_required`, `scheduled_at`, `confirmed_at`, `published_at`, `accepted_at`, `issue_id`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `publish_url`, `settled_on`, `assignee_type`, `assignee_id`, `revision`, `last_actor`, `review` |
| `CrmCollabWithThread` | 33 | `id`, `workspace_id`, `brief_id`, `creator_id`, `stage`, `quote_amount`, `final_amount`, `prob`, `creator_fee`, `sample_cost`, `platform_fee`, `currency`, `settlement_mode`, `commission_rate`, `sample_required`, `script_required`, `scheduled_at`, `confirmed_at`, `published_at`, `accepted_at`, `issue_id`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `publish_url`, `settled_on`, `assignee_type`, `assignee_id`, `revision`, `last_actor`, `review`, `thread` |
| `CrmSettlementResponse` | 18 | `id`, `workspace_id`, `collab_id`, `kind`, `amount`, `currency`, `due_at`, `paid_at`, `invoice_no`, `note`, `created_by`, `created_at`, `updated_at`, `assignee_type`, `assignee_id`, `revision`, `last_actor`, `review` |
| `BdPipelineResponse` | 4 | `creators`, `quotes`, `orders`, `followups` |
| `BdPerformanceResponse` | 12 | `from`, `to`, `currency`, `empty`, `signed`, `delivered`, `collected`, `quotes`, `followups`, `affiliate`, `by_member`, `by_month` |
| `BdActivityResponse` | 17 | `id`, `workspace_id`, `creator_id`, `kind`, `happened_at`, `summary`, `outcome`, `next_follow_at`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `assignee_type`, `assignee_id`, `revision`, `last_actor`, `review` |
| `BdQuoteResponse` | 21 | `id`, `workspace_id`, `creator_id`, `brief_id`, `status`, `quoted_at`, `valid_until`, `fee_amount`, `commission_rate`, `currency`, `items`, `note`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `assignee_type`, `assignee_id`, `revision`, `last_actor`, `review` |
| `BdQuoteWithThread` | 22 | `id`, `workspace_id`, `creator_id`, `brief_id`, `status`, `quoted_at`, `valid_until`, `fee_amount`, `commission_rate`, `currency`, `items`, `note`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `assignee_type`, `assignee_id`, `revision`, `last_actor`, `review`, `thread` |
| `BdCampaignResponse` | 15 | `id`, `workspace_id`, `name`, `kind`, `budget_amount`, `currency`, `started_on`, `ended_on`, `source_keyword`, `creator_count`, `note`, `owner_member_id`, `created_by`, `created_at`, `updated_at` |
| `AffiliateSummaryResponse` | 11 | `window`, `gmv`, `commission_est`, `commission_settled`, `commission_agency`, `commission_creator`, `agency_share_income`, `refund_rate`, `tech_fee`, `pick_count`, `active_creator_count` |
| `AffiliateProductResponse` | 17 | `id`, `workspace_id`, `client_id`, `ownership`, `platform`, `platform_product_id`, `title`, `category`, `price`, `currency`, `commission_rate`, `activity`, `status`, `owner_member_id`, `created_by`, `created_at`, `updated_at` |
| `AffiliatePickResponse` | 14 | `id`, `workspace_id`, `product_id`, `creator_id`, `commission_rate`, `agency_share_rate`, `service_fee_amount`, `bound_at`, `status`, `note`, `owner_member_id`, `created_by`, `created_at`, `updated_at` |
| `AffiliateDailyResponse` | 12 | `id`, `workspace_id`, `pick_id`, `stat_date`, `gmv_amount`, `order_count`, `refund_amount`, `est_commission`, `settled_commission`, `currency`, `created_at`, `updated_at` |
| `AffiliateSettlementResponse` | 17 | `id`, `workspace_id`, `period_start`, `period_end`, `gross_commission`, `tech_service_fee`, `refund_deduction`, `net_amount`, `currency`, `status`, `settled_to`, `paid_at`, `external_no`, `note`, `created_by`, `created_at`, `updated_at` |
| `MediaIPResponse` | 14 | `id`, `workspace_id`, `name`, `persona`, `track`, `audience`, `color`, `week_goal`, `status`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `archived_at` |
| `MediaIPDetailResponse` | 15 | `id`, `workspace_id`, `name`, `persona`, `track`, `audience`, `color`, `week_goal`, `status`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `archived_at`, `accounts` |
| `MediaIPAccountResponse` | 11 | `id`, `media_ip_id`, `kind`, `display_name`, `platform`, `handle`, `url`, `fans`, `avg_play`, `owner_member_id`, `created_at` |
| `MediaTopicResponse` | 14 | `id`, `workspace_id`, `ip_id`, `title`, `source`, `scores`, `status`, `hot_id`, `note`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `archived_at` |
| `MediaScriptResponse` | 17 | `id`, `workspace_id`, `topic_id`, `ip_id`, `version`, `hook`, `body`, `cta`, `cover_note`, `tags`, `status`, `publish_at`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `archived_at` |
| `MediaShootResponse` | 13 | `id`, `workspace_id`, `script_id`, `shoot_date`, `location`, `shots`, `checklist`, `status`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `archived_at` |
| `MediaHotResponse` | 16 | `id`, `workspace_id`, `title`, `platform`, `url`, `rank`, `heat_value`, `category`, `captured_on`, `source`, `note`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `archived_at` |
| `MediaBenchResponse` | 15 | `id`, `workspace_id`, `ip_id`, `platform`, `name`, `url`, `follower_count`, `metrics`, `captured_on`, `note`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `archived_at` |
| `GoalResponse` | 16 | `id`, `workspace_id`, `cycle`, `title`, `description`, `owner_member_id`, `department_id`, `status`, `due_date`, `priority`, `created_by`, `created_at`, `updated_at`, `archived_at`, `key_results`, `packages` |
| `GoalDetailResponse` | 17 | `id`, `workspace_id`, `cycle`, `title`, `description`, `owner_member_id`, `department_id`, `status`, `due_date`, `priority`, `created_by`, `created_at`, `updated_at`, `archived_at`, `key_results`, `packages`, `issues` |
| `GoalIssueResponse` | 5 | `id`, `number`, `title`, `status`, `goal_id` |
| `GoalKeyResultResponse` | 13 | `id`, `workspace_id`, `goal_id`, `title`, `target`, `current`, `unit`, `position`, `status`, `created_by`, `created_at`, `updated_at`, `archived_at` |
| `GoalPackageResponse` | 12 | `id`, `workspace_id`, `goal_id`, `department_id`, `title`, `owner_member_id`, `status`, `position`, `created_by`, `created_at`, `updated_at`, `archived_at` |
| `MarketSignalResponse` | 19 | `id`, `workspace_id`, `title`, `category`, `source`, `url`, `summary`, `cut`, `score`, `urgency`, `status`, `converted_goal_id`, `converted_issue_id`, `note`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `archived_at` |
| `MarketSignalConvertResponse` | 3 | `signal`, `goal`, `issue` |
| `HrJobResponse` | 21 | `id`, `workspace_id`, `title`, `department_id`, `level`, `headcount`, `status`, `salary_min`, `salary_max`, `currency`, `requirements`, `edu`, `years`, `city`, `jd`, `urgent`, `keywords`, `owner_member_id`, `created_by`, `created_at`, `updated_at` |
| `HrCandidateResponse` | 25 | `id`, `workspace_id`, `job_id`, `name`, `stage`, `source`, `phone`, `email`, `resume_attachment_id`, `match_score`, `score_resume`, `score_test`, `score_interview`, `expected_salary`, `offer_salary`, `currency`, `owner_member_id`, `hired_at`, `rejected_reason`, `created_by`, `edu`, `years_experience`, `resume_text`, `created_at`, `updated_at` |
| `HrHireResponse` | 2 | `candidate`, `employee_profile` |
| `HrInterviewResponse` | 15 | `id`, `workspace_id`, `candidate_id`, `round`, `scheduled_at`, `duration_minutes`, `interviewer_member_id`, `interviewer_name`, `mode`, `status`, `rescheduled_count`, `note`, `created_by`, `created_at`, `updated_at` |
| `HrScorecardResponse` | 15 | `id`, `workspace_id`, `interview_id`, `reviewer_member_id`, `score_skill`, `score_experience`, `score_culture`, `score_potential`, `weighted_score`, `dimensions`, `verdict`, `comment`, `created_by`, `created_at`, `updated_at` |
| `HrEmployeeProfileResponse` | 16 | `id`, `workspace_id`, `member_id`, `department_id`, `job_title`, `grade`, `hire_date`, `regular_date`, `contract_end`, `leave_date`, `ability`, `disc`, `owner_member_id`, `created_by`, `created_at`, `updated_at` |
| `HrDocTemplateResponse` | 12 | `id`, `workspace_id`, `name`, `kind`, `body`, `builtin`, `placeholders`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `archived_at` |
| `HrEmployeeChangeResponse` | 21 | `id`, `workspace_id`, `employee_id`, `kind`, `effective_on`, `from_department_id`, `to_department_id`, `from_job_title`, `to_job_title`, `from_grade`, `to_grade`, `from_contract_end`, `to_contract_end`, `from_amount`, `to_amount`, `currency`, `note`, `owner_member_id`, `created_by`, `created_at`, `archived_at` |
| `HrQuestionResponse` | 15 | `id`, `workspace_id`, `job_id`, `dimension`, `question`, `intent`, `signals`, `red_flags`, `source`, `tags`, `usage_count`, `owner_member_id`, `created_by`, `created_at`, `updated_at` |
| `HrGuideResponse` | 13 | `id`, `workspace_id`, `interview_id`, `candidate_id`, `job_id`, `round`, `status`, `items`, `note`, `owner_member_id`, `created_by`, `created_at`, `updated_at` |
| `HrGuideGenerateResponse` | 6 | `candidate_id`, `round`, `job_id`, `source`, `items`, `total` |
| `HrEmployeeRewardResponse` | 15 | `id`, `workspace_id`, `employee_id`, `kind`, `category`, `reason`, `amount`, `currency`, `decided_on`, `note`, `owner_member_id`, `created_by`, `created_at`, `updated_at`, `archived_at` |
| `HrOffboardingResponse` | 14 | `id`, `workspace_id`, `employee_id`, `status`, `last_day`, `reason`, `kind`, `handover`, `cert_done`, `note`, `owner_member_id`, `created_by`, `created_at`, `updated_at` |
| `HrOffboardingAdvanceResponse` | 2 | `offboarding`, `employee` |

## 附录 B：请求体 struct 的字段与类型

表里 `b:XxxRequest{...}` 的字段类型在这里；`*` 的必填标记只在具体端点上成立（create 与 PATCH 共用同一个 struct，必填集合不同）。

| struct | 字段（json 名:Go 类型） |
| --- | --- |
| `WorkbenchRoleTemplateRequest` | `capabilities:[]string` |
| `WorkbenchReviewDecisionRequest` | `reason:*string` |
| `UpsertWorkbenchFinanceMonthRequest` | `month:*string`, `cash_open:*float64`, `fixed_cost:*float64`, `variable_cost:*float64`, `note:*string` |
| `CreatorRequest` | `kind:*string`, `display_name:*string`, `platform:*string`, `handle:*string`, `url:*string`, `fans:*int64`, `fans_d7:*int64`, `avg_play:*int64`, `engagement_rate:*float64`, `category:*string`, `audience_note:*string`, `region:*string`, `price_note:*string`, `score:*int32`, `risk_flag:*bool`, `blacklist_reason:*string`, `owner_member_id:*string`, `media_ip_project_id:*string` |
| `CreatorPostRequest` | `creator_id:*string`, `collab_id:*string`, `content_issue_id:*string`, `product_id:*string`, `pick_id:*string`, `media_script_id:*string`, `platform:*string`, `title:*string`, `url:*string`, `published_at:*string`, `source:*string` |
| `CreatorPostMetricRequest` | `captured_on:*string`, `play:*int64`, `likes:*int64`, `comments:*int64`, `shares:*int64`, `clicks:*int64`, `converts:*int64`, `gmv_amount:*float64`, `currency:*string`, `source:*string` |
| `CrmClientRequest` | `name:*string`, `brand:*string`, `industry:*string`, `contact_name:*string`, `contact_channel:*string`, `contract_entity:*string`, `payment_terms:*string`, `credit_note:*string`, `owner_member_id:*string` |
| `CrmBriefRequest` | `client_id:*string`, `title:*string`, `category:*string`, `budget_min_amount:*float64`, `budget_max_amount:*float64`, `target_audience:*string`, `deliverable_type:*string`, `platforms:*[]string`, `schedule_from:*string`, `schedule_to:*string`, `kpi_play:*int64`, `kpi_gmv_amount:*float64`, `status:*string`, `owner_member_id:*string` |
| `CrmCollabRequest` | `brief_id:*string`, `creator_id:*string`, `stage:*string`, `quote_amount:json.RawMessage`, `final_amount:json.RawMessage`, `prob:*float64`, `creator_fee:json.RawMessage`, `sample_cost:json.RawMessage`, `platform_fee:json.RawMessage`, `currency:*string`, `settlement_mode:*string`, `commission_rate:*float64`, `sample_required:*bool`, `script_required:*bool`, `scheduled_at:*string`, `confirmed_at:*string`, `published_at:*string`, `accepted_at:*string`, `issue_id:*string`, `owner_member_id:*string`, `publish_url:json.RawMessage`, `settled_on:json.RawMessage`, `assignee_type:*string`, `assignee_id:*string`, `expected_revision:*int32`, `overwrite_reason:*string` |
| `CrmSettlementRequest` | `collab_id:*string`, `kind:*string`, `amount:*float64`, `currency:*string`, `due_at:*string`, `paid_at:json.RawMessage`, `invoice_no:json.RawMessage`, `note:json.RawMessage`, `assignee_type:*string`, `assignee_id:*string`, `expected_revision:*int32`, `overwrite_reason:*string` |
| `BdActivityRequest` | `creator_id:*string`, `kind:*string`, `happened_at:*string`, `summary:json.RawMessage`, `outcome:json.RawMessage`, `next_follow_at:json.RawMessage`, `owner_member_id:*string`, `assignee_type:*string`, `assignee_id:*string`, `expected_revision:*int32`, `overwrite_reason:*string` |
| `BdQuoteRequest` | `creator_id:*string`, `brief_id:*string`, `status:*string`, `quoted_at:*string`, `valid_until:json.RawMessage`, `fee_amount:*float64`, `commission_rate:*float64`, `currency:*string`, `items:json.RawMessage`, `note:json.RawMessage`, `owner_member_id:*string`, `assignee_type:*string`, `assignee_id:*string`, `expected_revision:*int32`, `overwrite_reason:*string` |
| `BdCampaignRequest` | `name:*string`, `kind:*string`, `budget_amount:*float64`, `currency:*string`, `started_on:*string`, `ended_on:*string`, `source_keyword:*string`, `creator_count:*int32`, `note:*string`, `owner_member_id:*string` |
| `AffiliateProductRequest` | `client_id:*string`, `ownership:*string`, `platform:*string`, `platform_product_id:*string`, `title:*string`, `category:*string`, `price:*float64`, `currency:*string`, `commission_rate:*float64`, `activity:*string`, `status:*string`, `owner_member_id:*string` |
| `AffiliatePickRequest` | `product_id:*string`, `creator_id:*string`, `commission_rate:*float64`, `agency_share_rate:*float64`, `service_fee_amount:*float64`, `bound_at:*string`, `status:*string`, `note:*string`, `owner_member_id:*string` |
| `AffiliateDailyRequest` | `pick_id:*string`, `stat_date:*string`, `gmv_amount:*float64`, `order_count:*int32`, `refund_amount:*float64`, `est_commission:*float64`, `settled_commission:*float64`, `currency:*string`, `owner_member_id:*string` |
| `AffiliateSettlementRequest` | `period_start:*string`, `period_end:*string`, `gross_commission:*float64`, `tech_service_fee:*float64`, `refund_deduction:*float64`, `net_amount:*float64`, `currency:*string`, `status:*string`, `settled_to:*string`, `paid_at:*string`, `external_no:*string`, `note:*string` |
| `MediaIPRequest` | `name:*string`, `persona:*string`, `track:*string`, `audience:*string`, `color:*string`, `week_goal:*int32`, `status:*string`, `owner_member_id:*string` |
| `MediaAccountRequest` | `creator_id:*string` |
| `MediaTopicRequest` | `ip_id:*string`, `title:*string`, `source:*string`, `scores:json.RawMessage`, `status:*string`, `hot_id:*string`, `note:*string`, `owner_member_id:*string` |
| `MediaScriptRequest` | `topic_id:*string`, `ip_id:*string`, `hook:*string`, `body:*string`, `cta:*string`, `cover_note:*string`, `tags:*[]string`, `status:*string`, `publish_at:*string`, `owner_member_id:*string` |
| `MediaShootRequest` | `script_id:*string`, `shoot_date:*string`, `location:*string`, `shots:json.RawMessage`, `checklist:map[string]bool`, `status:*string`, `owner_member_id:*string` |
| `MediaHotRequest` | `title:*string`, `platform:*string`, `url:json.RawMessage`, `rank:json.RawMessage`, `heat_value:json.RawMessage`, `category:*string`, `captured_on:*string`, `source:*string`, `note:*string`, `owner_member_id:*string` |
| `MediaAdoptRequest` | `ip_id:*string`, `title:*string` |
| `MediaBenchRequest` | `ip_id:*string`, `platform:*string`, `name:*string`, `url:json.RawMessage`, `follower_count:json.RawMessage`, `metrics:json.RawMessage`, `captured_on:*string`, `note:*string`, `owner_member_id:*string` |
| `GoalRequest` | `cycle:*string`, `title:*string`, `description:*string`, `owner_member_id:*string`, `department_id:*string`, `status:*string`, `due_date:*string`, `priority:*string` |
| `GoalIssueRequest` | `issue_id:*string` |
| `GoalKeyResultRequest` | `title:*string`, `target:*float64`, `current:*float64`, `unit:*string`, `position:*int32`, `status:*string` |
| `GoalPackageRequest` | `department_id:*string`, `title:*string`, `owner_member_id:*string`, `status:*string`, `position:*int32` |
| `MarketSignalRequest` | `title:*string`, `category:*string`, `source:*string`, `url:*string`, `summary:*string`, `cut:*string`, `score:*float64`, `urgency:*string`, `status:*string`, `note:*string`, `owner_member_id:*string` |
| `MarketSignalConvertRequest` | `target:*string`, `cycle:*string`, `department_id:*string`, `project_id:*string` |
| `HrJobRequest` | `title:*string`, `department_id:*string`, `level:*string`, `headcount:*int32`, `status:*string`, `salary_min:*float64`, `salary_max:*float64`, `currency:*string`, `requirements:*string`, `edu:*string`, `years:*string`, `city:*string`, `jd:*string`, `urgent:*bool`, `keywords:[]string`, `owner_member_id:*string` |
| `HrCandidateRequest` | `job_id:*string`, `name:*string`, `stage:*string`, `source:*string`, `phone:*string`, `email:*string`, `resume_attachment_id:*string`, `match_score:*int16`, `score_resume:*float64`, `score_test:*float64`, `score_interview:*float64`, `expected_salary:*float64`, `offer_salary:*float64`, `currency:*string`, `rejected_reason:*string`, `owner_member_id:*string`, `edu:*string`, `years_experience:*float64`, `resume_text:*string` |
| `HrHireRequest` | `member_id:*string`, `department_id:*string`, `job_title:*string`, `grade:*string`, `hire_date:*string`, `regular_date:*string`, `contract_end:*string`, `ability:*json.RawMessage`, `disc:*json.RawMessage`, `owner_member_id:*string` |
| `HrInterviewRequest` | `candidate_id:*string`, `round:*int16`, `scheduled_at:*string`, `duration_minutes:*int32`, `interviewer_member_id:*string`, `interviewer_name:*string`, `mode:*string`, `status:*string`, `note:*string` |
| `HrScorecardRequest` | `interview_id:*string`, `reviewer_member_id:*string`, `score_skill:*int16`, `score_experience:*int16`, `score_culture:*int16`, `score_potential:*int16`, `weighted_score:*float64`, `dimensions:map[string]float64`, `verdict:*string`, `comment:*string` |
| `HrEmployeeProfileRequest` | `member_id:*string`, `department_id:*string`, `job_title:*string`, `grade:*string`, `hire_date:*string`, `regular_date:*string`, `contract_end:*string`, `ability:*json.RawMessage`, `disc:*json.RawMessage`, `owner_member_id:*string` |
| `HrDocDocumentRequest` | `template_id:*string`, `format:*string`, `values:map[string]string` |
| `HrDocTemplateRequest` | `name:*string`, `kind:*string`, `body:*string`, `owner_member_id:*string` |
| `HrEmployeeChangeRequest` | `employee_id:*string`, `kind:*string`, `effective_on:*string`, `from_department_id:*string`, `to_department_id:*string`, `from_job_title:*string`, `to_job_title:*string`, `from_grade:*string`, `to_grade:*string`, `from_contract_end:*string`, `to_contract_end:*string`, `from_amount:*float64`, `to_amount:*float64`, `currency:*string`, `note:*string` |
| `HrQuestionRequest` | `job_id:*string`, `dimension:*string`, `question:*string`, `intent:*string`, `signals:*string`, `red_flags:*string`, `source:*string`, `tags:[]string`, `owner_member_id:*string` |
| `HrGuideRequest` | `interview_id:*string`, `candidate_id:*string`, `job_id:*string`, `round:*int16`, `status:*string`, `items:[]HrGuideItem`, `note:*string`, `owner_member_id:*string` |
| `HrGuideGenerateRequest` | `candidate_id:*string`, `round:*int16`, `job_id:*string`, `limit:*int32` |
| `HrGuideItem` | `question_id:*string`, `dimension:string`, `question:string`, `intent:string`, `signals:string`, `red_flags:string`, `asked:bool`, `note:string`, `score:*int16` |
| `HrGuideItemPatchRequest` | `asked:*bool`, `note:*string`, `score:json.RawMessage` |
| `HrEmployeeRewardRequest` | `employee_id:*string`, `kind:*string`, `category:*string`, `reason:*string`, `amount:*float64`, `currency:*string`, `decided_on:*string`, `note:*string` |
| `HrOffboardingRequest` | `employee_id:*string`, `last_day:*string`, `reason:*string`, `kind:*string`, `handover:[]HrHandoverItem`, `cert_done:*bool`, `note:*string`, `owner_member_id:*string`, `status:*string` |
| `HrHandoverItem` | `key:string`, `label:string`, `done:bool`, `note:string` |
| `HrHandoverItemPatchRequest` | `done:*bool`, `note:*string` |

## 附录 C：核对方法与可复现性

本文的每一条都可以用同一套只读步骤复核（不需要跑服务）：

1. 路由全集：`server/cmd/server/router.go` 里 `r.Route("/api/workbench", …)` 段（L2409–L2861），逐行抄 `method + path + handler`，与 `.routes.json` 的 203 条对齐。
2. handler 事实：按 handler 名在 `server/internal/handler/*.go` 定位 `func`，读它自己的 `requireWorkbenchCapability` / `r.URL.Query()` / `var req` / `writeJSON` / `writeError`，以及它调用的、带 `w` 参数的助手（`load*ForWrite`、`require*`、`workbenchCursorKey`、`agentMoneyGate` …）。
3. 信封：`map[string]any{…}` 取键名；单条响应取该 struct 的 `json` tag（附录 A）；204 走 `w.WriteHeader(http.StatusNoContent)`。
4. 测试：`server/internal/handler/*_test.go` 里出现 `testHandler.<HandlerName>` 即算覆盖。
5. zod：`packages/core/api/schemas.ts` 的 schema 键集合与 `client.ts` 的 `endpoint: "METHOD path"` 配对；字段漂移是两侧键集合的差集。

结论里所有「代码位置」都写成 `file:line` 或 `file Lx–Ly`，便于下一次改动后按行号回查；行号漂移时以 handler 名与消息文本为准。

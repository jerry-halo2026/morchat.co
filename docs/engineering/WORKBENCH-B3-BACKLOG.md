---
purpose: B3 之后还剩什么（按「会不会挡住真实使用」排序，不按谁先做的）
owner: lead
status: current
updated: 2026-11-18
related: [docs/engineering/WORKBENCH-B3-PLAN.md, docs/engineering/WORKBENCH-API.md, docs/engineering/DB.md]
---

# B3 之后：未完成事项

17 个部门页、4 个空间的路由与左栏、后端两表一聚合都已落地（见 `WORKBENCH-B3-PLAN.md` §6）。
下面是**还没做**的，按「挡不挡真实业务」分四档。每条都写了怎么算做完。

## P0：不改就用不起来

| # | 事项 | 现状 / 为什么是 P0 | 做完的标准 |
| --- | --- | --- | --- |
| 1 | ✅ 已完成：CSV 批量导入（POST /api/workbench/import，三种 kind，dry-run 预览 + 全或全不 + 幂等 skip） | 不再一条条点 | 已合入本批，见 §23 与 commit |
| 2 | ✅ 已完成：合作单撤销（同事务归档其结算）+ 结算行标记/撤销到账 | 不再有孤儿结算 | 已合入本批，见 commit 与 WORKBENCH-B3-PLAN §6 |
| 3 | ✅ 已完成：`GET /finance?month=` + 经营页月份切换 | 历史月真的出数字 | 已合入本批，见 commit 与 WORKBENCH-B3-PLAN §6 |
| 4 | ✅ 已完成：内容面板补「待发布 / 本周拍摄」两个队列徽标 | 徽标仍走列表，不新增请求口径 | 已合入本批，见 commit 与 WORKBENCH-B3-PLAN §6 |
| 5 | ✅ 已完成：发布页「关联脚本」列 + core `CreatorPost.media_script_id` 转正 | 列不再靠 unknown 收窄 | 已合入本批，见 commit 与 WORKBENCH-B3-PLAN §6 |

## P1：能绕，但绕得难看

| # | 事项 | 现状 | 做完的标准 |
| --- | --- | --- | --- |
| 6 | 列表都是 limit-only | 脚本/选题/拍摄/热点/对标全部 `limit ≤ 200` 一窗口，第 201 条就看不到；`/bd/activities` 无 `?due=1`、`/bd/quotes` 无 `q/sort/cursor` | keyset cursor（`(created_at,id)`）+ 需要的过滤器，前端接「加载更多」 |
| 7 | 对标 adopt 记不住 | `media_topic` 只有 `hot_id`，没有 `bench_id`：刷新后「已转成选题」的标记消失，能重复 adopt | 加 `bench_id` 列（迁移 + 索引）或改成 `source_ref uuid` 统一两源 |
| 8 | 缩表/解绑缺口 | `UpdateMediaBenchRequest.ip_id` 没有 null 形态，对标样本不能「解绑 IP」；`media_shoot` 不能把镜头清单清回 `{}` | 请求类型区分「省略」与「置空」，与 `scores` 的三态一致 |
| 9 | 混合币种只出主币种 | 报价/成交/结算/联盟都只汇总行数最多的那种币；页面无法提示「排除了多少行」 | 接口返回 `by_currency[]`，页面按币种分行（不是相加） |
| 10 | 没有 `affiliate_sku` | 契约 §4 的 SKU 级佣金率校验与区间约束没建表，当前只能写在 pick 上 | 建 `affiliate_sku` + 佣金率范围校验 |
| 11 | 事件缺口 | `media_topic:changed` 客户端仍未接（§12.7 老债）；`creator_activity` / `creator_quote` / `creator_campaign` 不发事件 | 两个 patcher + 三个事件，写入处广播 |
| 12 | MCP 只读工具没扩 | `/api/mcp/workbench` 的 `domain` 枚举仍是九个：agent 读不到媒体/目标/信号/联盟 | 扩枚举 + dispatcher，补一条工具用例 |
| 13 | `/overview` 没有新指标 | `packages/core/metrics/contracts.ts` 未加媒体/目标/联盟指标，工作台指标条看不到内容侧 | 加指标 id + source 白名单，`insufficient_data` → 有值 |
| 14 | `issue.goal_id` 不在响应里 | 任务页只能从目标侧反向读任务，任务多时是 N 次请求 | `IssueResponse` 加字段（新字段缺省 null，不破坏旧客户端）|

## P2：体验与一致性

| # | 事项 | 现状 |
| --- | --- | --- |
| 15 | 脚本版本只能切换阅读 | 没有并排 diff；「这个 v3 改了什么」还得人眼比 |
| 16 | 内容的 publish/data/scripts/shoots 与左栏 IP 切换的关系**未定义**（不是漏做） | ips/topics 读 `useIpScope()`；脚本与拍摄的归属是 `topic.ip_id`（脚本表上还有冗余 `ip_id`），publish/data 的归属是作品/达人，而一个达人可能跨 IP。**先定语义再动手**：①脚本与拍摄按 IP 收窄（需给 `/media/scripts`、`/media/shoots` 加 `ip_id` 过滤，客户端窗口筛会与 200 条上限打架）；②publish/data 明说「不按 IP 收窄」（它们是产出与复盘，不是某个 IP 的流水线）。建议 ①+②一起做，别只做一半 | 页面头部能看出当前 IP 作用域是否生效（生效则显示 IP 名，不生效显示「全部 IP」）|
| 17 | 拍摄页没有状态筛选 | 端点无 `status` 参数，客户端筛会和「本周」窗口语义打架 |
| 18 | 雷达/客户筛选全在客户端 | 窗口 200 条，超出的看不见，界面上也没说 |
| 19 | 业绩页「未回款」是派生值 | `签约额 − 回款额`，不是账龄；旁边已注明，但口径早晚要服务端给 |
| 20 | 团队页只读 | 没有部门管理、没有导入/导出入口（那些属人事空间写路径）|
| 21 | 客户抽屉不打单条接口 | 用列表行数据渲染，省一次请求，代价是抽屉里没有比列表更新鲜的数据 |

## P3：工程债（不影响业务，影响下一个人）

| # | 事项 | 说明 |
| --- | --- | --- |
| 22 | `apps/web` 17 条既有失败 | marketing proxy 的 `app/(landing)` 路由扫描用 `/` 分隔符（Windows 下 `\` 导致全 miss）3 类，另有 3 处 `text-foreground/80`、`opacity-60` 违规 |
| 23 | `server/internal/service` 4 条 builtin skill 失败 | 检出为 CRLF 时 frontmatter 判 `---\n` 失败；建议 `* text=auto eol=lf` 覆盖 `server/internal/skills/**` |
| 24 | plugin 示例测试依赖 `/examples` 绝对路径 | 纯容器挂载布局问题，CI 用仓库根作 cwd 时通过 |
| 25 | 全量 `pnpm test` 在高负载下会超时 | 9000+ 用例单进程跑，本机 300s 变换期；建议 CI 分片或提高 `testTimeout` |
| 26 | `server/cmd/dev-password-hash/` 未入库 | 开发辅助（打印 Argon2id PHC），要不要进仓库待定；现在仍是 untracked |
| 27 | 三个 `page-shell.tsx` 脚手架已删 | B3 收尾时清掉（17 页都成真页了），`ContentScopeProvider` 保留 |

## 产品层还没裁决的

- **脚本发布**：页面把「推进到发布中」落在 **topic** 上（`media_script.status` 没有 `publishing` 值）。要不要给脚本加一个发布态，还是维持「脚本=内容版本、topic=流水线位置」。
- **目标 vs 业绩**：业绩页刻意不做目标对比（避免和 `goal_okr` 两个真相源）。要不要在目标页反向链一组业绩数字。
- **合作单 stage 11 段**与驾驶舱 3 档折叠（open/delivered/settled）是否需要页面上能切两种视角。

## 附：批量导入的契约草案（P0 第 1 条，施工前先定死）

真实业务第一批就是几十条报价/跟进/合作单，一条一条点不成立。下面是给实现者的定稿草案，**实现时把它搬进 `WORKBENCH-API.md` §23 并逐条对齐**。

### 端点

```
POST /api/workbench/import        Content-Type: text/csv; charset=utf-8
  ?kind=quotes|activities|collabs    必填
  ?dry_run=1|0                       默认 1（只预览，不写库）
```

- 请求体就是 CSV 文本（首行为表头），上限 1 MiB / 2000 行，超限 413。
- 响应（dry_run 与正式导入同形，正式导入多出 `committed`）：

```json
{
  "kind": "quotes",
  "parsed": 42, "accepted": 40, "committed": 0,
  "rows":   [{ "line": 2, "action": "create", "preview": { "creator_id": "…", "fee_amount": 3000 } }],
  "errors": [{ "line": 7, "column": "creator_handle", "reason": "creator_not_found" }]
}
```

### 列定义（表头接受中英两套别名，大小写与空格不敏感）

| kind | 必填 | 可选 |
| --- | --- | --- |
| `quotes` | `creator_handle` \| `creator_id`、`fee_amount` | `brief_id`、`commission_rate`（0–1）、`valid_until`、`currency`、`note` |
| `activities` | `creator_handle` \| `creator_id`、`kind`（dm/call/meeting/email/note）、`happened_at`、`summary` | `outcome`、`next_follow_at`、`currency` |
| `collabs` | `creator_handle` \| `creator_id`、`brief_id` | `stage`、`quote_amount`、`final_amount`、`creator_fee`、`sample_cost`、`platform_fee`、`commission_rate`、`publish_url`、`settled_on`、`currency` |

### 三条硬规则

1. **不自动建达人。** `creator_handle` 按 `(platform, handle)` 在**本工作区未归档**的达人里匹配，匹配不到就是错误行（`creator_not_found`），绝不悄悄新建——达人档案是上游客体，界面不该成为它的第二个写入源。
2. **全或全不。** `dry_run=0` 时整批在一个事务里：任何一行有错就整批回滚，返回错误行清单 + `committed: 0`。半批导入没人能对账。
3. **`dry_run=1` 不写任何东西**（包括不分配 id、不发事件），但校验规则与正式导入**逐字相同**——预览说能过、正式导入却报错，是最坏的体验。

### 前端

`sales` 空间三页各一个「导入 CSV」入口 → 选文件 → 预览（表格式，错误行标红并给出原因）→「确认导入 N 条」。导入成功后失效对应列表；失败时保留预览，不吞错误。
### 2026-11-18 晚批新增的两条债（做 P0 时发现的）

| # | 事项 | 说明 |
| --- | --- | --- |
| 28 | **PATCH 清空字段的语义不统一** | `scores` 是「省略=保留、`null`=清空」（B3 §21 定的），但结算的 `paid_at` 走 `applyTimestampPatch`：JSON `null` 解码成 nil 指针 = 「没传」→ 静默保留，唯一能落成 SQL NULL 的是空串 `""`。前端因此发 `{"paid_at": ""}`。要统一成「显式 null 清空」需要 `json.RawMessage` 三态解码，涉及 4 个台账 handler + core schema + 三个页面的 model；**在统一之前，别把 `""` 当临时补丁删掉**。 |
| 29 | **经营页趋势是 6 次并发月读** | `/finance` 一次只答一个月，趋势块按 6 个月各读一次（首屏约 8 个请求）。后端若给 `/finance/months?from=&to=` 返回每月 `signed/collected/cash_floor`，前端把 `useQueries` 换成一次读即可。 |

### 2026-11-19 W3 之后新增（两条）

| # | 事项 | 说明 |
| --- | --- | --- |
| 30 | **REST 面 agent 仍可改金额** | agent 写通道（MCP）已封死金额/结算/归属/删除；但 REST PATCH 用的是 capability（`crm.amount`/`crm.settle`），而销售/商务部门默认带这些。要一刀切需在 `workbench_bd.go` / `workbench_crm.go` 加 `agentAmountGate`（actor=agent ⇒ 金额/结算字段 403）。 |
| 31 | **深链参数没有消费方** | inbox 与「我的队列」链到 `/sales/{quotes,collabs,followups}?quote=|collab=|followup=<id>`，三个列表页还不读这个参数（落进列表但不聚焦行）。 |
---
purpose: 工作台里每个数字唯一定义的登记处，以及从四套来源产品收敛口径时的裁决记录
owner: lead
status: current
updated: 2026-11-16
related: [docs/engineering/ORG-MODEL.md, packages/core/metrics/contracts.ts]
---

# 指标契约

工作台里出现的每个数字，都必须在这里有一行，并在
`packages/core/metrics/contracts.ts` 里有一份契约、在
`packages/views/blocks/metrics.ts` 里有一份实现、在测试里有一组边界用例。

## 1. 规则

1. **唯一真源**：`contracts.ts` 的 `WORKBENCH_METRICS`。id 是稳定的点分命名
   `<domain>.<measure>.<variant>`，一经发布不改名（改名等于新指标）。
2. **页面与板块禁止计算**：`packages/views` 里不允许出现求和、除法、比率、
   窗口切片。只能调 `metric(id, ctx)`。评审时用 `reduce(` 做检索。
3. **三态空值**：`emptyRule` 只有三个值。`zero` 是真零；`dash` 是不适用；
   `insufficient_data` 表示"缺数据"，必须渲染成缺口卡并给出补录入口 ——
   不允许用 0 冒充。
4. **来源白名单**：`source` 列出该指标被允许读取的全部表/视图，实现不得越过。
   需要部门维度就 join `project`，不把 `department_id` 冗余进事实表。
5. **窗口显式**：`calendar`（跟随查看者时区）与 `sliding`（按小时数）不能混用；
   原四套产品正是在这里分叉的（自然周 vs 滚动 7 天）。
6. **新增流程**：一次改动里同时加 契约 + 实现 + 单测 + 本文件一行，缺一不进。
7. **文案不在此处**：`labelKey` 指向 i18n（`blocks.metric.*`），8 个语言由 parity
   测试管；契约里不存中文/英文文案。

## 2. 当前契约

| id | 名称 | 单位 | 窗口 | 公式 | 来源 | 空值 |
| --- | --- | --- | --- | --- | --- | --- |
| `work.throughput.week` | 本周完成 | count | 自然周 | 本周 `closed_at` 落在区间内的 issue 数 | issue | zero |
| `work.cycle_time.median` | 交付周期中位数 | days | 滚动 30 天 | 近 30 天关闭 issue 的 `closed_at - created_at` 中位数 | issue | insufficient |
| `work.on_time.rate` | 准时率 | percent | 自然月 | 本月关闭 issue 中 `closed_at::date <= due_date` 的占比（按**日粒度**比较，`due_date` 是 DATE；分母仅统计设了 `due_date` 的） | issue | insufficient |
| `work.overdue.count` | 逾期 | count | 今天 | 未关闭且 `due_at < now` | issue | zero |
| `work.stalled.count` | 停滞 | count | 今天 | 未关闭且 7 天无更新 | issue | zero |
| `work.wip.count` | 在办 | count | 今天 | 未关闭 issue 数 | issue | zero |
| `work.wip.per_member` | 人均在办 | count | 今天 | 未关闭的成员任务数 / 在职成员数 | issue | insufficient |
| `work.followup_due.count` | 今日待跟进 | count | 今天 | 未关闭且 `due_at <= 今日结束` | issue | zero |
| `collab.cross_department.rate` | 跨部门协作比 | percent | 自然月 | 负责人部门 ≠ 项目部门的已关闭 issue 占比 | issue, project | insufficient |
| `agent.cost.month` | 智能体成本 | money（**USD**） | 自然月 | 本月运行成本求和；库内以 1e-10 USD 存储，返回 USD 数值（与 CRM 的 CNY 不同币种，展示必须带币种） | task_usage | zero |
| `agent.run.failure_rate` | 运行失败率 | percent | 滚动 7 天 | `agent_task_queue` 中 `status=failed` / `status ∈ (completed, failed)`；运行状态不在 `task_usage` 里 | agent_task_queue | insufficient |
| `knowledge.created.week` | 知识新增 | count | 自然周 | 本周新建知识条目数 | knowledge | zero |
| `crm.pipeline.weighted_amount` | 管道加权金额 | money | 今天 | Σ(合同额 × 概率)，概率优先取合作单，否则取阶段默认 | crm_collab | insufficient |
| `crm.contract.signed_month` | 本月签约 | money | 自然月 | 本月确认的合作单合同额求和 | crm_collab | insufficient |
| `crm.payment.collected_month` | 本月回款 | money | 自然月 | 本月实付的结算流水求和 | crm_settlement | insufficient |
| `crm.quote.margin_rate` | 合作毛利率 | percent | 自然月 | (合同额 − 达人费 − 样品费 − 平台费) / 合同额 | crm_collab | insufficient |
| `crm.collab.roi` | 单条合作 ROI | ratio | 滚动 30 天 | 近 30 天归因成交 / (达人费 + 样品费 + 平台费) | crm_collab, creator_post_metric | insufficient |
| `crm.creator.repeat_rate` | 达人复投率 | percent | 自然季 | 本季成交 ≥2 次的达人 / 本季成交 ≥1 次的达人 | crm_collab | insufficient |

前 12 个是**零录入**指标：它们只读 morechat 已经在写的数据，所以工作台第一
天就有真数字。后 6 个在达人商务的台账行存在之前一律是 `insufficient_data`，
渲染成缺口卡。

## 3. 口径裁决（四套来源产品的冲突 → 唯一口径）

| 编号 | 冲突 | 裁决 |
| --- | --- | --- |
| C1 | "近 7 天发布"：概览按内容计（1），复盘按发布记录计（3） | 两个指标两个 id，单位写清是"条内容"还是"条发布" |
| C2 | 管道概率：一套硬编码在阶段表，一套可按客户覆盖 | `crm.pipeline.weighted_amount` 固定为"行级优先、阶段兜底"；默认值进 `threshold`，只有一处 |
| C3 | 概率量纲 `0–1` vs `0–100` | 一律存 `0–1`，展示 ×100 |
| C4 | 三套都叫 `STAGES`：商机 4 段 / 商机 5 段 / 招聘 6 段 | 改名 `crm_stage` 与 `hr_stage`；禁止泛名 `stage` |
| C5 | 逾期判定有 4 个 predicate（任务含待验收、跟进含 7 天宽限、回填 24h、HR 只有预警） | 按对象分指标：`work.overdue` / 跟进逾期 / 回填到期；宽限期进配置 |
| C6 | "客户"一条记录在公司与个人之间语义相反 | `crm_client` 只存甲方；达人是 `creator`。两类主体不共用一张表 |
| C7 | 月份键 `YYYY-MM` vs `YYYY.MM` | 存 `date`（月初），禁止字符串拼月 |
| C8 | `addDays` 三种签名、`pct` 一/双参 | 只用仓库既有日期工具，不自造 |
| C9 | 金额格式三种 | 只用 `CurrencyNumberFlow` / `CompactNumberFlow` |
| C10 | 本月签约是否含续费 | 签约 = 全部 kind；续费单列 `renewal_amount` |
| C11 | "已发"按内容还是按记录 | 同 C1 |
| C12 | "近 7 天"自然日 vs 72h 滑动 | 契约必须写 `window.kind`，组件不得自己算 |

## 4. 实现注记（服务端落地时确定的锚点，契约未写死的部分）

| 项 | 实现 |
| --- | --- |
| 阶段默认概率（C2） | 唯一一处：`server/pkg/db/queries/workbench_metrics.sql` 的 `CASE`；`contracts.ts` 的 `threshold` 只用于展示，服务端不读 |
| `crm.quote.margin_rate` | 分母为 `confirmed_at` 落在本月的合作单 |
| `crm.collab.roi` 成本侧 | `confirmed_at >= now() - 30d`；GMV 侧 `captured_on >= current_date - 30d` |
| `crm.collab.roi` 作用域 | `scope: record`，但 `/overview` 给的是**工作区汇总 ROI**；单条 ROI 由前端用行内字段计算 |
| `crm.creator.repeat_rate` | `accepted_at` 落在本季且 `stage = settled` |
| `collab.cross_department.rate` 分母 | 只统计"负责人部门与项目部门都存在"的已关闭 issue；未知部门不计入，避免拉低比率 |
| 部门归属回退链 | issue → `project.department_id`；knowledge → `knowledge_spaces.department_id`；creator → `media_ip_project` 或 owner 的 `member.department_id`；其余 CRM → owner 的 `member.department_id`；`agent.*` 与 `collab.cross_department.rate`（workspace 级）忽略部门过滤 |

## 5. 已知缺口

| 缺口 | 影响 | 处理 |
| --- | --- | --- |
| `issue.closed_at` 在回填完成前只有新数据有值 | 周期、准时率、吞吐会偏低 | `658/659` 迁移 + `cmd/backfill_issue_closed_at` |
| 部门维度依赖 `project.department_id` | 部门口径全部指标 | 服务端已出参，前端 zod 补齐即可 |
| 达人商务的 6 个指标没有台账行 | 一律缺口卡 | B0 七张表落地后自动点亮 |
| 内容平台真实播放数据无来源 | 爆款率只能用回填值 | 先手工/CSV 回填，集成后置 |

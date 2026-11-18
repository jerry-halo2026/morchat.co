---
purpose: 多人 + 多 agent 协作在同一份台账上的身份、审计、并发、通知、锚点与验证规则
owner: lead
status: current
updated: 2026-11-19
related: [docs/engineering/PRODUCT-LAYER.md, docs/engineering/WORKBENCH-API.md, docs/ARCHITECTURE.md]
---

# 协作模型

morechat 的台账（达人、合作单、报价、跟进、选题、脚本、目标、千川广告）都是**多人与多个 agent 同时读写**的。本文件定义七件事，实现一律照此，不再各自发明。

## 1. 两个身份，别混

| 字段 | 含义 | 可以是 agent 吗 | 存在哪 |
| --- | --- | --- | --- |
| `owner_member_id` | **谁对这笔生意负责**（人的席位） | **不可以** | 台账原列，存 user id |
| `assignee_type` + `assignee_id` | **谁在做这件事** | 可以（`member` / `agent`） | 台账新增列，语义对齐 `issue.assignee_type` |

写权限只认 owner 与工作区角色；「被指派」不等于「有权改」。agent 作为 assignee 时，写入仍受 §6 约束。

## 2. 审计：复用 `activity_log`，不新建变更表

- 每次**改变业务状态**的写（创建、金额/阶段/日期/负责人的变更、删除）落一条 `activity_log`：
  `subject_type`（`crm_collab|creator_quote|creator_activity|crm_settlement|media_topic|goal_okr|qianchuan_plan`…）、
  `subject_id`、`action`（`crm_collab.stage_changed` 这类点分小写）、`actor_type`（`member|agent|system`）、
  `actor_id`、`details{before,after}`（只放变化的字段，≤4 KB）。
- 纯备注（note 字段）不记，避免流水淹没信号。
- 事务内失败时不得留下"幽灵审计"（同一事务）。

## 3. 并发：`revision` + `expected_revision` → 409

- 四张核心台账（`crm_collab`、`creator_quote`、`creator_activity`、`crm_settlement`）加 `revision INTEGER NOT NULL DEFAULT 1`；每次写 `revision + 1`。
- PATCH 可带 `expected_revision`：不匹配 → **409 `stale_write`**，响应带当前行；不带则不做乐观检查（旧客户端兼容，文档写明）。
- 前端收到 409：提示「别人刚改过，已为你刷新」并强制重读，**不得重放到覆盖**。

## 4. 通知：复用 `inbox_item`

- 到期类（跟进到期、报价临期、结算逾期）写入 `inbox_item`：
  `section='workbench'`、`type='workbench.<subject>.<event>'`、`severity='action_required'`、
  `recipient_type/recipient_id` = assignee（可以是 agent）、`details{subject_type,subject_id,route}`。
- 幂等键：`(subject_type, subject_id, type, 当日)`；同一件事一天只通知一次。
- 没有 assignee 的行**不通知**（没有收件人的提醒是噪音）。

## 5. 锚点：讨论一律走 issue

- 台账行的讨论、附件、@agent、autopilot 全部挂在 issue 上：幂等端点 `POST /api/workbench/{domain}/{id}/thread` 创建并回填，
  `issue.origin_type` 用**业务名**（`crm_collab` 等，需扩 CHECK 枚举）、`origin_id` = 台账行 id。
- 二次点击不产生第二条 issue；issue 归档后台账行显示「讨论已归档」，不 404。
- **不改 `comment` 表做多态**（那是平台核心表）。

## 6. agent 的身份与边界

- agent 的 actor 通过平台的 `resolveActor`（`X-Agent-ID` + task 绑定）获得，**HTTP 面不为 agent 单独开写**；agent 写一律走 MCP 工具。
- agent 可用的 capability **不得超过其委派人**：`agent.delegate` 缺失则不能代写。
- agent 写工具白名单起步三个：建报价、记跟进、推进合作单阶段；**不提供删除**；不写 `owner`。
- 每次 agent 写入的审计 `actor_type='agent'`，`details.delegated_by` 记委派人。

## 7. 可验证性（防"把错的也放大十倍"）

三样东西必须有，顺序不能反：

1. **断言层**：每类台账一组机器可判规则（金额>0、比率 0–1、日期先后、达人/需求单存在、币种白名单、不做隐式 ÷100）。CSV 导入与 agent 写**共用同一份 validator**。
2. **复核闸门**：`review_state ∈ pending|accepted|rejected`，高价值字段（金额、结算、佣金率、`stage→settled`）写入默认 `pending`，人在队列里批量通过；低价值字段直写。
3. **计量**：`agent.write.overwrite_rate`（人改 agent 写的比例，改时必须选理由 `wrong_fact|wrong_judgement|stale|taste`）、`agent.review.reject_rate`、`agent.action.rollback_rate`；外加"agent 参与组 vs 未参与组"的对照，不做单点分数。

熔断：某 (agent, 域) 的驳回率或覆写率超阈值 → 自动降级为"只能出草稿"，并发一条 owner 通知。

## 8. 口径铁律（沿用数据契约）

未知是 NULL 不是 0；比率存 0–1 显示乘 100；金额 `numeric(14,2)` + `currency`，**不同币种永不相加**；千川的五套结算窗口（1h/7d/14d/30d/90d）**永不相加**，每个金额指标必须带 `basis`。

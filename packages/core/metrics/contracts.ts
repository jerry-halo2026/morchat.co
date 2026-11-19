/**
 * Metric contracts: the single source of truth for every number a workbench
 * shows.
 *
 * A page never computes a ratio, a sum or a window itself. It asks
 * `metric(id, ctx)` in `packages/views/blocks/metrics.ts`, and that
 * implementation answers one contract each. `docs/METRICS.md` is the review
 * entry point: a new number means a new contract row, an implementation, a test,
 * and a doc line — all in the same change.
 *
 * Why this exists: the four workbenches this replaces each kept their own
 * definitions. Two of them counted "published this week" differently, so the
 * same day read 1 on one screen and 3 on another; a probability was stored 0–1
 * in one and 0–100 in the other. A number without a contract does not ship.
 *
 * React-free and dependency-free on purpose: safe inside `@morechat/core`, in
 * Node tests, and on the server.
 */

/** Who the number describes. `record` is a single row (one collaboration, one
 * post) rather than an aggregate. */
export type MetricScope = "workspace" | "department" | "member" | "record";

export type MetricUnit =
  | "count"
  | "days"
  | "hours"
  | "money"
  | "percent"
  | "tokens"
  | "ratio";

/**
 * How the window is measured. Both flavours exist in the sources and mixing them
 * silently is exactly how "this week" stopped meaning one thing.
 * `calendar` respects the viewer's timezone (see `useViewingTimezone`);
 * `sliding` is duration-based and timezone-free.
 */
export type MetricWindow =
  | { kind: "calendar"; span: "today" | "week" | "month" | "quarter" }
  | { kind: "sliding"; days: number };

/**
 * What to render when the rows the number needs are not there yet.
 *
 * `insufficient_data` is not an error state — it renders the gap card that asks
 * the viewer to fill the missing rows in, which is the whole point of a
 * workbench: the screen shows where the data is thin.
 */
export type MetricEmptyRule = "dash" | "zero" | "insufficient_data";

/**
 * Where the implementation may read from, in dependency order. A metric declares
 * every source it touches, and the implementation may not reach past them — that
 * rule is what keeps "connected" from turning into "coupled".
 */
export type MetricSource =
  | "issue"
  | "issue_activity"
  | "task_usage"
  | "agent_task_queue"
  | "project"
  | "creator"
  | "creator_post"
  | "creator_post_metric"
  | "crm_client"
  | "crm_brief"
  | "crm_collab"
  | "crm_settlement"
  | "hr_job"
  | "hr_candidate"
  | "hr_interview"
  | "hr_scorecard"
  | "hr_employee_profile"
  | "ops_finance_month"
  | "ops_attendance"
  | "knowledge"
  | "inbox"
  // The audit trail (§26): the review gate's three rates read it, and nothing
  // else in the workbench does — a metric that could read it without saying so
  // would make "where did this number come from" unanswerable.
  | "activity_log"
  // 千川投放（WORKBENCH-API §25）：十二张表都是平台数据的投影，只有一个 CLI 写入口，
  // 所以这些 source 永远只被读——一个指标声明它们，等于声明自己不写任何东西。
  | "qianchuan_account"
  | "qianchuan_balance"
  | "qianchuan_plan"
  | "qianchuan_daily_overall"
  | "qianchuan_material"
  | "qianchuan_violation"
  | "qianchuan_recon";

export interface MetricThreshold {
  /** Display default. A workspace may override it in settings; the override is
   * never duplicated as a second constant. */
  value: number;
  unit: "percent" | "days" | "count";
  labelKey: string;
}

export interface MetricContract {
  /** Stable, dotted and namespaced: `<domain>.<measure>.<variant>`. */
  id: MetricId;
  /** i18n key under the `blocks` namespace. Copy never lives here. */
  labelKey: string;
  scope: MetricScope;
  unit: MetricUnit;
  /** ISO currency for `unit: "money"`. Currency is data, not locale: a CNY
   * contract must read ¥ even for a viewer whose UI language is French. */
  currency?: "CNY" | "USD";
  window: MetricWindow;
  /** One-line definition, kept in step with the implementation. Written as an
   * expression rather than prose so a mismatch is easy to spot in review. */
  formula: string;
  source: readonly MetricSource[];
  emptyRule: MetricEmptyRule;
  threshold?: MetricThreshold;
  /** Which direction is good — drives the colour of a delta, nothing else. */
  direction: "up" | "down" | "neutral";
}

/**
 * The id list is the union's source, and the catalogue below is a
 * `Record<MetricId, …>`: a missing entry is a compile error, an extra entry is a
 * compile error, and a typo in either is caught by one or the other.
 */
export const METRIC_IDS = [
  // Delivery behaviour — reads data that already exists, so a workbench has real
  // numbers before anyone types a single business record in.
  "work.throughput.week",
  "work.cycle_time.median",
  "work.on_time.rate",
  "work.overdue.count",
  "work.stalled.count",
  "work.wip.count",
  "work.wip.per_member",
  "work.followup_due.count",
  "collab.cross_department.rate",
  "agent.cost.month",
  "agent.run.failure_rate",
  "knowledge.created.week",
  // Creator commerce — `insufficient_data` until ledger rows exist, so the first
  // day shows gap cards rather than zeros.
  "crm.pipeline.weighted_amount",
  "crm.contract.signed_month",
  "crm.payment.collected_month",
  "crm.quote.margin_rate",
  "crm.collab.roi",
  "crm.creator.repeat_rate",
  // Recruiting — same rule: `insufficient_data` until the HR ledgers have rows.
  "hr.candidates.active",
  "hr.time_to_hire.median",
  "hr.scorecard.backlog",
  "hr.interview.on_time_rate",
  // 千川投放（§25.4）。金额指标带 `basis`：1h / 7d / 14d / 30d / 90d 是五个结算窗口，
  // 不是五个精度；跨窗口求和没有业务含义，所以没有任何一个指标是「总花费」。
  "qianchuan.spend.day",
  "qianchuan.gmv.day",
  "qianchuan.roi",
  "qianchuan.violation.open",
  // 可验证性（WORKBENCH-API §26.4）。三条都是「agent 写得对不对」的比例，全部按
  // (agent_id, domain) 切片，**没有单一总分**：一个把金融字段写错的 agent 和一个
  // 只是语气被判「口味不对」的 agent，不该被平均成一个数。
  //
  // 三条的 emptyRule 都是 `insufficient_data`：没有 agent 写过、或被复核的样本
  // 少于 5，比例就没有意义，页面画缺口而不是 0%。
  "agent.write.overwrite_rate",
  "agent.review.reject_rate",
  "agent.action.rollback_rate",
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

export const WORKBENCH_METRICS: Record<MetricId, MetricContract> = {
  "work.throughput.week": {
    id: "work.throughput.week",
    labelKey: "blocks.metric.work_throughput_week",
    scope: "department",
    unit: "count",
    window: { kind: "calendar", span: "week" },
    formula: "count(issues where closed_at in this calendar week)",
    source: ["issue"],
    emptyRule: "zero",
    direction: "up",
  },
  "work.cycle_time.median": {
    id: "work.cycle_time.median",
    labelKey: "blocks.metric.work_cycle_time_median",
    scope: "department",
    unit: "days",
    window: { kind: "sliding", days: 30 },
    formula: "median(closed_at - created_at) over issues closed in the last 30 days",
    source: ["issue"],
    emptyRule: "insufficient_data",
    direction: "down",
  },
  "work.on_time.rate": {
    id: "work.on_time.rate",
    labelKey: "blocks.metric.work_on_time_rate",
    scope: "department",
    unit: "percent",
    window: { kind: "calendar", span: "month" },
    formula:
      "count(issues closed this month where closed_at::date <= due_date) / count(issues closed this month with due_date set) — day granularity, because due_date is a DATE",
    source: ["issue"],
    emptyRule: "insufficient_data",
    threshold: { value: 90, unit: "percent", labelKey: "blocks.threshold.on_time" },
    direction: "up",
  },
  "work.overdue.count": {
    id: "work.overdue.count",
    labelKey: "blocks.metric.work_overdue_count",
    scope: "department",
    unit: "count",
    window: { kind: "calendar", span: "today" },
    formula: "count(issues where closed_at is null and due_at < now)",
    source: ["issue"],
    emptyRule: "zero",
    direction: "down",
  },
  "work.stalled.count": {
    id: "work.stalled.count",
    labelKey: "blocks.metric.work_stalled_count",
    scope: "department",
    unit: "count",
    window: { kind: "calendar", span: "today" },
    formula: "count(issues where closed_at is null and updated_at < now - 7 days)",
    source: ["issue"],
    emptyRule: "zero",
    direction: "down",
  },
  "work.wip.count": {
    id: "work.wip.count",
    labelKey: "blocks.metric.work_wip_count",
    scope: "department",
    unit: "count",
    window: { kind: "calendar", span: "today" },
    formula: "count(issues where closed_at is null)",
    source: ["issue"],
    emptyRule: "zero",
    direction: "neutral",
  },
  "work.wip.per_member": {
    id: "work.wip.per_member",
    labelKey: "blocks.metric.work_wip_per_member",
    scope: "member",
    unit: "count",
    window: { kind: "calendar", span: "today" },
    formula: "count(open member-assigned issues) / count(active members)",
    source: ["issue"],
    emptyRule: "insufficient_data",
    direction: "down",
  },
  "work.followup_due.count": {
    id: "work.followup_due.count",
    labelKey: "blocks.metric.work_followup_due_count",
    scope: "department",
    unit: "count",
    window: { kind: "calendar", span: "today" },
    formula: "count(issues where due_at <= end of today and closed_at is null)",
    source: ["issue"],
    emptyRule: "zero",
    direction: "down",
  },
  "collab.cross_department.rate": {
    id: "collab.cross_department.rate",
    labelKey: "blocks.metric.collab_cross_department_rate",
    scope: "workspace",
    unit: "percent",
    window: { kind: "calendar", span: "month" },
    formula:
      "count(closed issues whose assignee department != project department) / count(closed issues this month)",
    source: ["issue", "project"],
    emptyRule: "insufficient_data",
    direction: "up",
  },
  "agent.cost.month": {
    id: "agent.cost.month",
    labelKey: "blocks.metric.agent_cost_month",
    scope: "workspace",
    unit: "money",
    currency: "USD",
    window: { kind: "calendar", span: "month" },
    formula:
      "sum(task_usage.cost) for runs in this calendar month, returned in USD (stored as 1e-10 USD)",
    source: ["task_usage"],
    emptyRule: "zero",
    direction: "down",
  },
  "agent.run.failure_rate": {
    id: "agent.run.failure_rate",
    labelKey: "blocks.metric.agent_run_failure_rate",
    scope: "workspace",
    unit: "percent",
    window: { kind: "sliding", days: 7 },
    formula:
      "count(agent_task_queue.status = failed) / count(status in (completed, failed)) over the last 7 days",
    source: ["agent_task_queue"],
    emptyRule: "insufficient_data",
    direction: "down",
  },
  "knowledge.created.week": {
    id: "knowledge.created.week",
    labelKey: "blocks.metric.knowledge_created_week",
    scope: "department",
    unit: "count",
    window: { kind: "calendar", span: "week" },
    formula: "count(knowledge items created this calendar week)",
    source: ["knowledge"],
    emptyRule: "zero",
    direction: "up",
  },
  "hr.candidates.active": {
    id: "hr.candidates.active",
    labelKey: "blocks.metric.hr_candidates_active",
    scope: "department",
    unit: "count",
    window: { kind: "calendar", span: "today" },
    formula: "count(candidates whose stage is not hired, rejected or withdrawn)",
    source: ["hr_candidate"],
    emptyRule: "zero",
    direction: "neutral",
  },
  "hr.time_to_hire.median": {
    id: "hr.time_to_hire.median",
    labelKey: "blocks.metric.hr_time_to_hire_median",
    scope: "department",
    unit: "days",
    window: { kind: "sliding", days: 90 },
    formula:
      "median(hired_at - created_at) over candidates hired in the last 90 days",
    source: ["hr_candidate"],
    emptyRule: "insufficient_data",
    direction: "down",
  },
  "hr.scorecard.backlog": {
    id: "hr.scorecard.backlog",
    labelKey: "blocks.metric.hr_scorecard_backlog",
    scope: "department",
    unit: "count",
    window: { kind: "calendar", span: "today" },
    formula:
      "count(interviews whose scheduled_at < now and that have no scorecard row)",
    source: ["hr_interview", "hr_scorecard"],
    emptyRule: "zero",
    direction: "down",
  },
  "hr.interview.on_time_rate": {
    id: "hr.interview.on_time_rate",
    labelKey: "blocks.metric.hr_interview_on_time_rate",
    scope: "department",
    unit: "percent",
    window: { kind: "calendar", span: "month" },
    formula:
      "count(interviews held this month with no reschedule event) / count(interviews held this month)",
    source: ["hr_interview"],
    emptyRule: "insufficient_data",
    threshold: { value: 90, unit: "percent", labelKey: "blocks.threshold.on_time" },
    direction: "up",
  },
  // 千川投放（WORKBENCH-API §25.4）。三条读法固定在公式里：
  //
  //   - 花费与成交是**元**，窗口是自然日，只读 `dim_kind='overall'` 那一层切片
  //     （`product` / `image` / `live_video` 是同一批钱的分解，加回来就重复了）。
  //   - ROI 的分子分母同属一次请求，`basis` 不参与除法：结算窗口只改变「结算额」，
  //     不改变花费和 GMV。把两个 basis 的 ROI 相加没有意义，所以这里没有那样的公式。
  //   - 违规只看**平台还没关掉的**状态：`TIMEOUT`（逾期未处理）与 `FAILAPPEAL`
  //     （申诉未通过）都还压在账上，`PASS` 之类不算。
  "qianchuan.spend.day": {
    id: "qianchuan.spend.day",
    labelKey: "blocks.metric.qianchuan_spend_day",
    scope: "workspace",
    unit: "money",
    currency: "CNY",
    window: { kind: "calendar", span: "today" },
    formula: "sum(qianchuan_daily_overall.spend) where dim_kind = 'overall' and stat_date = today",
    source: ["qianchuan_daily_overall"],
    emptyRule: "insufficient_data",
    direction: "neutral",
  },
  "qianchuan.gmv.day": {
    id: "qianchuan.gmv.day",
    labelKey: "blocks.metric.qianchuan_gmv_day",
    scope: "workspace",
    unit: "money",
    currency: "CNY",
    window: { kind: "calendar", span: "today" },
    formula: "sum(qianchuan_daily_overall.gmv) where dim_kind = 'overall' and stat_date = today",
    source: ["qianchuan_daily_overall"],
    emptyRule: "insufficient_data",
    direction: "up",
  },
  "qianchuan.roi": {
    id: "qianchuan.roi",
    labelKey: "blocks.metric.qianchuan_roi",
    scope: "workspace",
    unit: "ratio",
    window: { kind: "calendar", span: "week" },
    formula:
      "sum(gmv) / sum(spend) over the requested window — the settlement basis belongs to the settle figure beside it, never to this division (WORKBENCH-API §25.2)",
    source: ["qianchuan_daily_overall"],
    emptyRule: "insufficient_data",
    direction: "up",
  },
  "qianchuan.violation.open": {
    id: "qianchuan.violation.open",
    labelKey: "blocks.metric.qianchuan_violation_open",
    scope: "workspace",
    unit: "count",
    window: { kind: "calendar", span: "month" },
    formula: "count(qianchuan_violation where status in ('TIMEOUT', 'FAILAPPEAL'))",
    source: ["qianchuan_violation"],
    emptyRule: "zero",
    direction: "down",
  },
  // 可验证性（§26.4）。`scope: "workspace"` 而不是 `member`：比例本身就按
  // (agent_id, domain) 切片，页面读的是一条汇总；再按成员求一次比例会把
  // 「谁的 agent 写坏了」平均掉。三条都 `direction: "down"`：越低越好。
  "agent.write.overwrite_rate": {
    id: "agent.write.overwrite_rate",
    labelKey: "blocks.metric.agent_write_overwrite_rate",
    scope: "workspace",
    unit: "percent",
    window: { kind: "sliding", days: 30 },
    formula:
      "count(activity_log where action='<subject>.overwritten' and actor_type='member' and details.delegated_by is not null) / count(activity_log where actor_type='agent')",
    source: ["activity_log"],
    emptyRule: "insufficient_data",
    direction: "down",
  },
  "agent.review.reject_rate": {
    id: "agent.review.reject_rate",
    labelKey: "blocks.metric.agent_review_reject_rate",
    scope: "workspace",
    unit: "percent",
    window: { kind: "sliding", days: 30 },
    formula:
      "count(activity_log where action='<subject>.review_rejected') / count(activity_log where action in ('<subject>.review_accepted','<subject>.review_rejected'))",
    source: ["activity_log"],
    emptyRule: "insufficient_data",
    direction: "down",
  },
  "agent.action.rollback_rate": {
    id: "agent.action.rollback_rate",
    labelKey: "blocks.metric.agent_action_rollback_rate",
    scope: "workspace",
    unit: "percent",
    window: { kind: "sliding", days: 30 },
    formula:
      "count(activity_log where action='<subject>.deleted' and details.undoes_agent_write=true) / count(activity_log where actor_type='agent')",
    source: ["activity_log"],
    emptyRule: "insufficient_data",
    direction: "down",
  },
  "crm.pipeline.weighted_amount": {
    id: "crm.pipeline.weighted_amount",
    labelKey: "blocks.metric.crm_pipeline_weighted_amount",
    scope: "department",
    unit: "money",
    currency: "CNY",
    window: { kind: "calendar", span: "today" },
    formula:
      "sum(collab.final_amount * coalesce(collab.prob, stage default prob)) where stage not in (settled, cancelled)",
    source: ["crm_collab"],
    emptyRule: "insufficient_data",
    direction: "up",
  },
  "crm.contract.signed_month": {
    id: "crm.contract.signed_month",
    labelKey: "blocks.metric.crm_contract_signed_month",
    scope: "department",
    unit: "money",
    currency: "CNY",
    window: { kind: "calendar", span: "month" },
    formula: "sum(collab.final_amount) where confirmed_at in this calendar month",
    source: ["crm_collab"],
    emptyRule: "insufficient_data",
    direction: "up",
  },
  "crm.payment.collected_month": {
    id: "crm.payment.collected_month",
    labelKey: "blocks.metric.crm_payment_collected_month",
    scope: "department",
    unit: "money",
    currency: "CNY",
    window: { kind: "calendar", span: "month" },
    formula: "sum(settlement.amount) where paid_at in this calendar month",
    source: ["crm_settlement"],
    emptyRule: "insufficient_data",
    direction: "up",
  },
  "crm.quote.margin_rate": {
    id: "crm.quote.margin_rate",
    labelKey: "blocks.metric.crm_quote_margin_rate",
    scope: "department",
    unit: "percent",
    window: { kind: "calendar", span: "month" },
    formula:
      "(sum(collab.final_amount) - sum(collab.creator_fee + collab.sample_cost + collab.platform_fee)) / sum(collab.final_amount)",
    source: ["crm_collab"],
    emptyRule: "insufficient_data",
    direction: "up",
  },
  "crm.collab.roi": {
    id: "crm.collab.roi",
    labelKey: "blocks.metric.crm_collab_roi",
    scope: "record",
    unit: "ratio",
    window: { kind: "sliding", days: 30 },
    formula:
      "attributed_gmv_or_revenue(last 30 days) / (creator_fee + sample_cost + platform_fee)",
    source: ["crm_collab", "creator_post_metric"],
    emptyRule: "insufficient_data",
    direction: "up",
  },
  "crm.creator.repeat_rate": {
    id: "crm.creator.repeat_rate",
    labelKey: "blocks.metric.crm_creator_repeat_rate",
    scope: "department",
    unit: "percent",
    window: { kind: "calendar", span: "quarter" },
    formula:
      "count(creators with >= 2 settled collabs this quarter) / count(creators with >= 1 settled collab this quarter)",
    source: ["crm_collab"],
    emptyRule: "insufficient_data",
    direction: "up",
  },
};

/** The contract for `id`. Total: `MetricId` cannot name a missing row. */
export function metricContract(id: MetricId): MetricContract {
  return WORKBENCH_METRICS[id];
}

/** Contracts whose rows already exist, so a workbench can render them on a
 * workspace nobody has filled in yet. */
export const ZERO_ENTRY_METRIC_IDS: readonly MetricId[] = METRIC_IDS.filter(
  (id) => WORKBENCH_METRICS[id].source.includes("issue"),
);

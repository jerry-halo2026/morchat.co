-- Workbench aggregates (docs/METRICS.md §2, docs/engineering/WORKBENCH-API.md §3
-- `GET /overview` and `GET /counts`). One query per metric family; the handler
-- turns the raw counts into the contract's `{value, sample_count, empty}` shape
-- and never recomputes a ratio in the UI layer.
--
-- Rules these queries follow:
--   * `department_id` is an aggregate filter only (docs/engineering/ORG-MODEL.md):
--     it is applied to the metrics whose contract scope is `department`, and
--     ignored by the workspace-scope ones. Nothing here gates access.
--   * Department attribution never lives in the fact tables. Issues reach it
--     through `project.department_id`, knowledge through
--     `knowledge_spaces.department_id`, and the commerce ledgers through the
--     owning member (`member.department_id`) or, for a creator, its media-IP
--     project — docs/METRICS.md §1 rule 4.
--   * Windows are written exactly as the contract states them: `calendar` means
--     date_trunc against the server's clock, `sliding` means now() - interval.

-- name: WorkbenchCounts :one
-- Sidebar counts. Each count is its own scalar subquery so one empty table can
-- never mask the others.
SELECT
    (SELECT count(*) FROM creator c
        LEFT JOIN project cp ON cp.id = c.media_ip_project_id AND cp.workspace_id = c.workspace_id
        LEFT JOIN member cm ON cm.workspace_id = c.workspace_id AND cm.user_id = c.owner_member_id
        WHERE c.workspace_id = sqlc.arg('workspace_id')
          AND c.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR cp.department_id = sqlc.narg('department_id')::uuid
               OR cm.department_id = sqlc.narg('department_id')::uuid))::bigint AS creators,
    (SELECT count(*) FROM crm_client cl
        LEFT JOIN member clm ON clm.workspace_id = cl.workspace_id AND clm.user_id = cl.owner_member_id
        WHERE cl.workspace_id = sqlc.arg('workspace_id')
          AND cl.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR clm.department_id = sqlc.narg('department_id')::uuid))::bigint AS clients,
    (SELECT count(*) FROM crm_brief b
        LEFT JOIN member bm ON bm.workspace_id = b.workspace_id AND bm.user_id = b.owner_member_id
        WHERE b.workspace_id = sqlc.arg('workspace_id')
          AND b.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR bm.department_id = sqlc.narg('department_id')::uuid))::bigint AS briefs,
    (SELECT count(*) FROM crm_collab cb
        LEFT JOIN member cbm ON cbm.workspace_id = cb.workspace_id AND cbm.user_id = cb.owner_member_id
        WHERE cb.workspace_id = sqlc.arg('workspace_id')
          AND cb.archived_at IS NULL
          AND cb.stage NOT IN ('settled', 'cancelled')
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR cbm.department_id = sqlc.narg('department_id')::uuid))::bigint AS collabs_open,
    (SELECT count(*) FROM crm_settlement st
        JOIN crm_collab stc ON stc.id = st.collab_id AND stc.workspace_id = st.workspace_id
        LEFT JOIN member stm ON stm.workspace_id = stc.workspace_id AND stm.user_id = stc.owner_member_id
        WHERE st.workspace_id = sqlc.arg('workspace_id')
          AND st.archived_at IS NULL
          AND st.paid_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR stm.department_id = sqlc.narg('department_id')::uuid))::bigint AS settlements_pending;

-- name: OverviewWorkCounts :one
-- The eight `work.*` counts in one pass over the workspace's issues.
--
-- On-time compares day granularity (`closed_at::date <= due_date::date`): the
-- contract's `closed_at <= due_at` written against a DATE column would count
-- same-day closure as late, which is not what "按时交付" means to the team.
SELECT
    (count(*) FILTER (WHERE i.closed_at >= date_trunc('week', now())))::bigint AS throughput_week,
    (count(*) FILTER (WHERE i.closed_at IS NULL))::bigint AS wip_count,
    (count(*) FILTER (WHERE i.closed_at IS NULL AND i.due_date IS NOT NULL AND i.due_date < now()))::bigint AS overdue_count,
    (count(*) FILTER (WHERE i.closed_at IS NULL AND i.updated_at < now() - interval '7 days'))::bigint AS stalled_count,
    (count(*) FILTER (WHERE i.closed_at IS NULL AND i.due_date IS NOT NULL
        AND i.due_date < date_trunc('day', now()) + interval '1 day'))::bigint AS followup_due_count,
    (count(*) FILTER (WHERE i.closed_at IS NULL AND i.assignee_type = 'member'))::bigint AS open_member_assigned,
    (count(*) FILTER (WHERE i.closed_at >= date_trunc('month', now()) AND i.due_date IS NOT NULL))::bigint AS on_time_samples,
    (count(*) FILTER (WHERE i.closed_at >= date_trunc('month', now()) AND i.due_date IS NOT NULL
        AND i.closed_at::date <= i.due_date::date))::bigint AS on_time_hits,
    (SELECT count(*) FROM member m WHERE m.workspace_id = sqlc.arg('workspace_id'))::bigint AS active_members
FROM issue i
LEFT JOIN project p ON p.id = i.project_id AND p.workspace_id = i.workspace_id
WHERE i.workspace_id = sqlc.arg('workspace_id')
  AND (sqlc.narg('department_id')::uuid IS NULL OR p.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewCycleTime :one
-- Median days from creation to `closed_at` over issues closed in the last 30
-- days. `sample_count` is what decides `insufficient_data` — a median of 0 with
-- no samples is not a fast team, it is an empty ledger.
SELECT
    (count(*))::bigint AS sample_count,
    coalesce(percentile_cont(0.5) WITHIN GROUP (
        ORDER BY (EXTRACT(EPOCH FROM (i.closed_at - i.created_at))::float8 / 86400.0)
    ), 0)::float8 AS median_days
FROM issue i
LEFT JOIN project p ON p.id = i.project_id AND p.workspace_id = i.workspace_id
WHERE i.workspace_id = sqlc.arg('workspace_id')
  AND i.closed_at IS NOT NULL
  AND i.closed_at >= now() - interval '30 days'
  AND (sqlc.narg('department_id')::uuid IS NULL OR p.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewCrossDepartment :one
-- Workspace-scope metric: assignee department vs project department over issues
-- closed this calendar month. Only rows where both departments are known take
-- part — an unassigned issue or an issue outside any project cannot be called
-- cross-department collaboration, and counting it as "not cross" would quietly
-- deflate the rate.
SELECT
    (count(*) FILTER (
        WHERE pm.department_id IS NOT NULL
          AND p.department_id IS NOT NULL
          AND pm.department_id <> p.department_id
    ))::bigint AS cross_count,
    (count(*) FILTER (
        WHERE pm.department_id IS NOT NULL AND p.department_id IS NOT NULL
    ))::bigint AS resolved_count
FROM issue i
LEFT JOIN project p ON p.id = i.project_id AND p.workspace_id = i.workspace_id
LEFT JOIN member pm ON pm.workspace_id = i.workspace_id
                   AND pm.user_id = i.assignee_id
                   AND i.assignee_type = 'member'
WHERE i.workspace_id = sqlc.arg('workspace_id')
  AND i.closed_at >= date_trunc('month', now());

-- name: OverviewAgentCost :one
-- `agent.cost.month`. Stored as provider-reported 1e-10 USD ticks; the handler
-- converts to whole currency units. task_usage carries no workspace, so the run
-- is reached through its task and agent.
SELECT
    coalesce(sum(tu.cost_usd_ticks), 0)::bigint AS cost_ticks,
    (count(*))::bigint AS usage_rows
FROM task_usage tu
JOIN agent_task_queue t ON t.id = tu.task_id
JOIN agent a ON a.id = t.agent_id
WHERE a.workspace_id = sqlc.arg('workspace_id')
  AND tu.created_at >= date_trunc('month', now());

-- name: OverviewAgentRuns :one
-- `agent.run.failure_rate`. The denominator is finished runs: a queued or
-- running task has no outcome yet, and counting it as a success would make the
-- rate improve whenever the queue backs up.
SELECT
    (count(*) FILTER (WHERE t.status = 'failed'))::bigint AS failed_runs,
    (count(*) FILTER (WHERE t.status IN ('completed', 'failed')))::bigint AS finished_runs
FROM agent_task_queue t
JOIN agent a ON a.id = t.agent_id
WHERE a.workspace_id = sqlc.arg('workspace_id')
  AND t.created_at >= now() - interval '7 days';

-- name: OverviewKnowledgeWeek :one
-- `knowledge.created.week`; department comes from the item's space.
SELECT (count(*))::bigint AS created_week
FROM knowledge_items ki
LEFT JOIN knowledge_spaces ks ON ks.id = ki.space_id AND ks.workspace_id = ki.workspace_id
WHERE ki.workspace_id = sqlc.arg('workspace_id')
  AND ki.created_at >= date_trunc('week', now())
  AND (sqlc.narg('department_id')::uuid IS NULL OR ks.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewCrmPipeline :one
-- `crm.pipeline.weighted_amount`: Σ(合同额 × 概率) over open collaborations.
-- Row-level `prob` wins; the stage default is the fallback (docs/METRICS.md §3
-- C2). The defaults are the single place the server knows them — the UI must
-- read this number rather than re-deriving a probability.
SELECT
    coalesce(sum(c.final_amount * coalesce(c.prob, CASE c.stage
        WHEN 'inquiry' THEN 0.10
        WHEN 'quoted' THEN 0.30
        WHEN 'negotiating' THEN 0.50
        WHEN 'confirmed' THEN 0.70
        WHEN 'sampling' THEN 0.80
        WHEN 'script_review' THEN 0.85
        WHEN 'scheduled' THEN 0.90
        WHEN 'published' THEN 0.95
        WHEN 'accepted' THEN 1.00
        ELSE 1.00 END)), 0)::float8 AS weighted_amount,
    (count(*) FILTER (WHERE c.final_amount IS NOT NULL))::bigint AS sample_count
FROM crm_collab c
LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
WHERE c.workspace_id = sqlc.arg('workspace_id')
  AND c.archived_at IS NULL
  AND c.stage NOT IN ('settled', 'cancelled')
  AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewCrmSignedMonth :one
-- `crm.contract.signed_month`: contract value confirmed in this calendar month.
-- `confirmed_at` is written by the stage transition, so a row that was confirmed
-- last month never lands in this month's number.
SELECT
    coalesce(sum(c.final_amount), 0)::float8 AS signed_amount,
    (count(*))::bigint AS sample_count
FROM crm_collab c
LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
WHERE c.workspace_id = sqlc.arg('workspace_id')
  AND c.archived_at IS NULL
  AND c.confirmed_at >= date_trunc('month', now())
  AND c.confirmed_at < date_trunc('month', now()) + interval '1 month'
  AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewCrmCollectedMonth :one
-- `crm.payment.collected_month`: money that actually cleared this month.
SELECT
    coalesce(sum(s.amount), 0)::float8 AS collected_amount,
    (count(*))::bigint AS sample_count
FROM crm_settlement s
JOIN crm_collab c ON c.id = s.collab_id AND c.workspace_id = s.workspace_id
LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
WHERE s.workspace_id = sqlc.arg('workspace_id')
  AND s.archived_at IS NULL
  AND s.paid_at >= date_trunc('month', current_date)::date
  AND s.paid_at < (date_trunc('month', current_date) + interval '1 month')::date
  AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewCrmMargin :one
-- `crm.quote.margin_rate` inputs: (合同额 − 达人费 − 样品费 − 平台费) / 合同额 over
-- collaborations confirmed this month. The handler divides; the query keeps the
-- two sums so the ratio is computed once, in one place.
SELECT
    coalesce(sum(c.final_amount), 0)::float8 AS revenue,
    coalesce(sum(
        coalesce(c.creator_fee, 0) + coalesce(c.sample_cost, 0) + coalesce(c.platform_fee, 0)
    ), 0)::float8 AS cost,
    (count(*))::bigint AS sample_count
FROM crm_collab c
LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
WHERE c.workspace_id = sqlc.arg('workspace_id')
  AND c.archived_at IS NULL
  AND c.final_amount IS NOT NULL
  AND c.confirmed_at >= date_trunc('month', now())
  AND c.confirmed_at < date_trunc('month', now()) + interval '1 month'
  AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewCrmRoi :one
-- `crm.collab.roi` inputs over the last 30 days: attributed GMV from post
-- snapshots that belong to a collaboration, against the total creator/sample/
-- platform cost of the collaborations confirmed in the same window. The metric's
-- scope is `record`; this aggregate is what the overview strip can show, one
-- row's ratio is computed from its own columns by the UI.
SELECT
    coalesce((
        SELECT sum(pm.gmv_amount)
        FROM creator_post_metric pm
        JOIN creator_post cp ON cp.id = pm.post_id AND cp.workspace_id = pm.workspace_id
        WHERE pm.workspace_id = sqlc.arg('workspace_id')
          AND cp.collab_id IS NOT NULL
          AND cp.archived_at IS NULL
          AND pm.captured_on >= current_date - 30
    ), 0)::float8 AS attributed_gmv,
    coalesce(sum(
        coalesce(c.creator_fee, 0) + coalesce(c.sample_cost, 0) + coalesce(c.platform_fee, 0)
    ), 0)::float8 AS cost,
    (count(*))::bigint AS sample_count
FROM crm_collab c
LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
WHERE c.workspace_id = sqlc.arg('workspace_id')
  AND c.archived_at IS NULL
  AND c.confirmed_at >= now() - interval '30 days'
  AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewHrActiveCandidates :one
-- `hr.candidates.active` (docs/METRICS.md §2): candidates whose stage is still in
-- play. `hired` is not active — the funnel is finished for that person — and
-- neither are the two ways out (`rejected`, `withdrawn`).
--
-- Department attribution follows the B0 fallback chain: the candidate's
-- requisition carries `department_id`, and the owner's member department is the
-- fallback for a requisition created before departments were filled in.
SELECT (count(*))::bigint AS active_candidates
FROM hr_candidate c
LEFT JOIN hr_job j ON j.id = c.job_id AND j.workspace_id = c.workspace_id
LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
WHERE c.workspace_id = sqlc.arg('workspace_id')
  AND c.archived_at IS NULL
  AND c.stage NOT IN ('hired', 'rejected', 'withdrawn')
  AND (sqlc.narg('department_id')::uuid IS NULL
       OR j.department_id = sqlc.narg('department_id')::uuid
       OR m.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewHrTimeToHire :one
-- `hr.time_to_hire.median`: days from entering the funnel to `hired_at`, over the
-- candidates hired in the last 90 days. `sample_count` is what decides
-- `insufficient_data` — a median of 0 with no hires behind it is an empty funnel,
-- not a same-day hire.
SELECT
    (count(*))::bigint AS sample_count,
    coalesce(percentile_cont(0.5) WITHIN GROUP (
        ORDER BY (EXTRACT(EPOCH FROM (c.hired_at - c.created_at))::float8 / 86400.0)
    ), 0)::float8 AS median_days
FROM hr_candidate c
LEFT JOIN hr_job j ON j.id = c.job_id AND j.workspace_id = c.workspace_id
LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
WHERE c.workspace_id = sqlc.arg('workspace_id')
  AND c.archived_at IS NULL
  AND c.hired_at IS NOT NULL
  AND c.hired_at >= now() - interval '90 days'
  AND (sqlc.narg('department_id')::uuid IS NULL
       OR j.department_id = sqlc.narg('department_id')::uuid
       OR m.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewHrScorecardBacklog :one
-- `hr.scorecard.backlog`: slots whose time has passed and that still have no
-- scorecard. A cancelled interview is excluded — it was never held, so no
-- scorecard is owed for it and counting it would inflate the backlog forever.
SELECT (count(*))::bigint AS backlog_count
FROM hr_interview i
LEFT JOIN hr_scorecard s ON s.interview_id = i.id
                        AND s.workspace_id = i.workspace_id
                        AND s.archived_at IS NULL
LEFT JOIN hr_candidate c ON c.id = i.candidate_id AND c.workspace_id = i.workspace_id
LEFT JOIN hr_job j ON j.id = c.job_id AND j.workspace_id = c.workspace_id
LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
WHERE i.workspace_id = sqlc.arg('workspace_id')
  AND i.archived_at IS NULL
  AND i.status IN ('scheduled', 'done')
  AND i.scheduled_at < now()
  AND s.id IS NULL
  AND (sqlc.narg('department_id')::uuid IS NULL
       OR j.department_id = sqlc.narg('department_id')::uuid
       OR m.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewHrInterviewOnTime :one
-- `hr.interview.on_time_rate`: interviews held this calendar month that were never
-- rescheduled, over the interviews held this calendar month. "Held" means the
-- slot is inside the month and the interview actually reached the room
-- (`done`) or missed it (`no_show`) — a future slot of this month is not a data
-- point yet, and counting it as on time would make the rate improve by scheduling.
SELECT
    (count(*) FILTER (WHERE i.rescheduled_count = 0))::bigint AS on_time_count,
    (count(*))::bigint AS scheduled_count
FROM hr_interview i
LEFT JOIN hr_candidate c ON c.id = i.candidate_id AND c.workspace_id = i.workspace_id
LEFT JOIN hr_job j ON j.id = c.job_id AND j.workspace_id = c.workspace_id
LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
WHERE i.workspace_id = sqlc.arg('workspace_id')
  AND i.archived_at IS NULL
  AND i.status IN ('done', 'no_show')
  AND i.scheduled_at >= date_trunc('month', now())
  AND i.scheduled_at < date_trunc('month', now()) + interval '1 month'
  AND (sqlc.narg('department_id')::uuid IS NULL
       OR j.department_id = sqlc.narg('department_id')::uuid
       OR m.department_id = sqlc.narg('department_id')::uuid);

-- name: OverviewCrmRepeatRate :one
-- `crm.creator.repeat_rate`: creators with ≥2 settled collaborations this
-- calendar quarter over creators with ≥1. "Settled" is the settled stage
-- reached inside the quarter (`accepted_at`), so a collaboration carried over
-- from last quarter counts where it was actually delivered.
WITH settled AS (
    SELECT c.creator_id, (count(*))::bigint AS settled_count
    FROM crm_collab c
    LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
    WHERE c.workspace_id = sqlc.arg('workspace_id')
      AND c.archived_at IS NULL
      AND c.stage = 'settled'
      AND c.accepted_at >= date_trunc('quarter', now())
      AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid)
    GROUP BY c.creator_id
)
SELECT
    (count(*) FILTER (WHERE settled_count >= 2))::bigint AS repeat_creators,
    (count(*))::bigint AS active_creators
FROM settled;

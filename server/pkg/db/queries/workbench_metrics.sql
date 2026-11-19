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
               OR stm.department_id = sqlc.narg('department_id')::uuid))::bigint AS settlements_pending,
    -- Recruiting ledgers. Department attribution follows the same fallback the
    -- hr metrics use: the row's own department, else the owner's.
    (SELECT count(*) FROM hr_job hj
        LEFT JOIN member hjm ON hjm.workspace_id = hj.workspace_id AND hjm.user_id = hj.owner_member_id
        WHERE hj.workspace_id = sqlc.arg('workspace_id')
          AND hj.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR hj.department_id = sqlc.narg('department_id')::uuid
               OR hjm.department_id = sqlc.narg('department_id')::uuid))::bigint AS jobs,
    (SELECT count(*) FROM hr_candidate hc
        JOIN hr_job hcj ON hcj.id = hc.job_id AND hcj.workspace_id = hc.workspace_id
        LEFT JOIN member hcm ON hcm.workspace_id = hc.workspace_id AND hcm.user_id = hc.owner_member_id
        WHERE hc.workspace_id = sqlc.arg('workspace_id')
          AND hc.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR hcj.department_id = sqlc.narg('department_id')::uuid
               OR hcm.department_id = sqlc.narg('department_id')::uuid))::bigint AS candidates,
    (SELECT count(*) FROM hr_interview hi
        WHERE hi.workspace_id = sqlc.arg('workspace_id')
          AND hi.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR EXISTS (
                   SELECT 1 FROM hr_candidate hic
                   JOIN hr_job hij ON hij.id = hic.job_id AND hij.workspace_id = hic.workspace_id
                   WHERE hic.id = hi.candidate_id
                     AND hic.workspace_id = hi.workspace_id
                     AND hij.department_id = sqlc.narg('department_id')::uuid)))::bigint AS interviews,
    (SELECT count(*) FROM hr_employee_profile hep
        LEFT JOIN member hepm ON hepm.workspace_id = hep.workspace_id AND hepm.user_id = hep.member_id
        WHERE hep.workspace_id = sqlc.arg('workspace_id')
          AND hep.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR hep.department_id = sqlc.narg('department_id')::uuid
               OR hepm.department_id = sqlc.narg('department_id')::uuid))::bigint AS employees,
    -- Content production and discovery (WORKBENCH-API §12 / §21). One counter per
    -- ledger the left sidebar lists, so a rail badge is a number the server owns
    -- rather than a count the client derives from whatever page it happens to hold.
    -- Department attribution is the same fallback chain as above: the row's owning
    -- member. It is an aggregate filter, never an access boundary.
    (SELECT count(*) FROM media_script msc
        LEFT JOIN member mscm ON mscm.workspace_id = msc.workspace_id AND mscm.user_id = msc.owner_member_id
        WHERE msc.workspace_id = sqlc.arg('workspace_id')
          AND msc.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR mscm.department_id = sqlc.narg('department_id')::uuid))::bigint AS media_scripts,
    (SELECT count(*) FROM media_shoot msh
        LEFT JOIN member mshm ON mshm.workspace_id = msh.workspace_id AND mshm.user_id = msh.owner_member_id
        WHERE msh.workspace_id = sqlc.arg('workspace_id')
          AND msh.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR mshm.department_id = sqlc.narg('department_id')::uuid))::bigint AS media_shoots,
    (SELECT count(*) FROM media_hot mh
        LEFT JOIN member mhm ON mhm.workspace_id = mh.workspace_id AND mhm.user_id = mh.owner_member_id
        WHERE mh.workspace_id = sqlc.arg('workspace_id')
          AND mh.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR mhm.department_id = sqlc.narg('department_id')::uuid))::bigint AS hot,
    (SELECT count(*) FROM media_bench mb
        LEFT JOIN member mbm ON mbm.workspace_id = mb.workspace_id AND mbm.user_id = mb.owner_member_id
        WHERE mb.workspace_id = sqlc.arg('workspace_id')
          AND mb.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR mbm.department_id = sqlc.narg('department_id')::uuid))::bigint AS bench,
    -- General manager ledgers (WORKBENCH-API §13): goals and the radar's signals.
    -- A goal carries its own `department_id` (748) and falls back to its owner's,
    -- while a signal has no department column at all — only its owner's.
    (SELECT count(*) FROM goal_okr g
        LEFT JOIN member gom ON gom.workspace_id = g.workspace_id AND gom.user_id = g.owner_member_id
        WHERE g.workspace_id = sqlc.arg('workspace_id')
          AND g.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR g.department_id = sqlc.narg('department_id')::uuid
               OR gom.department_id = sqlc.narg('department_id')::uuid))::bigint AS goals,
    (SELECT count(*) FROM market_signal sg
        LEFT JOIN member sgm ON sgm.workspace_id = sg.workspace_id AND sgm.user_id = sg.owner_member_id
        WHERE sg.workspace_id = sqlc.arg('workspace_id')
          AND sg.archived_at IS NULL
          AND (sqlc.narg('department_id')::uuid IS NULL
               OR sgm.department_id = sqlc.narg('department_id')::uuid))::bigint AS signals;

-- name: OverviewAggregates :one
-- The overview strip's sixteen aggregates, in one statement.
--
-- They used to be sixteen queries awaited in a batch. The batch was already
-- concurrent, but every statement still costs a round trip, and against the
-- shared pooler one round trip is ~350 ms: eight in flight meant three waves and
-- ~2.4 s of waiting for numbers that share a workspace filter. One statement is
-- one wave. Each aggregate keeps its own plan — they are independent subqueries
-- joined with CROSS JOIN LATERAL, each of which returns exactly one row — so
-- merging them changed the number of round trips, not the numbers.
--
-- What this statement deliberately does not do is decide a metric's state. It
-- returns raw counts and sums; `workbench_metrics.go` turns them into
-- `{value, sample_count, empty}`, because `insufficient_data` versus a real zero
-- is a contract decision (docs/METRICS.md §1 rule 3) and belongs next to the
-- contract ids, not in SQL.
--
-- Cost of the merge, recorded here because it is not visible in the shape: a
-- failure can no longer be attributed to one metric. Sixteen statements named the
-- one that broke; one statement can only say the overview failed. That is the
-- accepted trade — these sixteen read the same workspace and fail together far
-- more often than one table alone does.
--
-- Windows and caliber are per aggregate and unchanged. Department attribution
-- follows docs/METRICS.md §1 rule 4: issues through `project.department_id`,
-- knowledge through `knowledge_spaces.department_id`, commerce through the owning
-- `member.department_id`, hiring through the requisition with the owner's member
-- department as fallback.
SELECT
    -- work.* — delivery behaviour (docs/METRICS.md §2). On-time compares day
    -- granularity (`closed_at::date <= due_date::date`): the contract's
    -- `closed_at <= due_at` written against a DATE column would count same-day
    -- closure as late, which is not what "按时交付" means to the team.
    w.throughput_week,
    w.wip_count,
    w.overdue_count,
    w.stalled_count,
    w.followup_due_count,
    w.on_time_samples,
    w.on_time_hits,
    w.active_members,
    w.open_member_assigned,

    -- work.cycle_time.median: median days from creation to `closed_at` over
    -- issues closed in the last 30 days. `sample_count` is what decides
    -- `insufficient_data` — a median of 0 with no samples is not a fast team.
    cy.sample_count AS cycle_sample_count,
    cy.median_days  AS cycle_median_days,

    -- collab.cross_department.rate: assignee department vs project department
    -- over issues closed this calendar month. Only rows where both departments
    -- are known take part — an unassigned issue cannot be called cross-department
    -- collaboration, and counting it as "not cross" would deflate the rate.
    xd.cross_count,
    xd.resolved_count AS cross_resolved_count,

    -- agent.cost.month: provider-reported cost in 1e-10 USD ticks. task_usage
    -- carries no workspace, so the run is reached through its task and agent.
    ac.cost_ticks,
    ac.usage_rows,

    -- agent.run.failure_rate: the denominator is finished runs; a queued or
    -- running task has no outcome yet.
    ar.failed_runs,
    ar.finished_runs,

    -- knowledge.created.week; department comes from the item's space.
    kw.created_week,

    -- crm.pipeline.weighted_amount: Σ(合同额 × 概率) over open collaborations.
    -- Row-level `prob` wins; the stage default is the fallback (docs/METRICS.md
    -- §3 C2). The defaults live here and nowhere else — the UI must read this
    -- number rather than re-deriving a probability.
    pl.weighted_amount,
    pl.sample_count AS pipeline_sample_count,

    -- crm.contract.signed_month: contract value confirmed in this calendar month.
    -- `confirmed_at` is written by the stage transition, so a row confirmed last
    -- month never lands in this month's number. The stage filter matches
    -- `/finance`'s `signed`: a deal confirmed and then cancelled, or rolled back
    -- to `negotiating`, is not a signed deal.
    sg.signed_amount,
    sg.sample_count AS signed_sample_count,

    -- crm.payment.collected_month: money that actually cleared this month.
    co.collected_amount,
    co.sample_count AS collected_sample_count,

    -- crm.quote.margin_rate inputs: (合同额 − 达人费 − 样品费 − 平台费) / 合同额
    -- over collaborations confirmed this month. The handler divides, so the ratio
    -- is computed in exactly one place.
    mg.revenue,
    mg.cost AS margin_cost,
    mg.sample_count AS margin_sample_count,

    -- crm.collab.roi inputs over the last 30 days: attributed GMV from post
    -- snapshots that belong to a collaboration, against the total creator/sample/
    -- platform cost of the collaborations confirmed in the same window.
    ro.attributed_gmv,
    ro.cost AS roi_cost,
    ro.sample_count AS roi_sample_count,

    -- crm.creator.repeat_rate: creators with ≥2 settled collaborations this
    -- calendar quarter over creators with ≥1. "Settled" is the settled stage
    -- reached inside the quarter (`accepted_at`).
    rp.repeat_creators,
    rp.active_creators,

    -- hr.candidates.active: candidates whose stage is still in play. `hired` is
    -- not active — the funnel is finished for that person — and neither are the
    -- two ways out (`rejected`, `withdrawn`).
    hc.active_candidates,

    -- hr.time_to_hire.median over the candidates hired in the last 90 days.
    tth.sample_count AS time_to_hire_sample_count,
    tth.median_days  AS time_to_hire_median_days,

    -- hr.scorecard.backlog: slots whose time has passed with no scorecard. A
    -- cancelled interview owes no scorecard and must not inflate the backlog.
    sb.backlog_count,

    -- hr.interview.on_time_rate: interviews held this month that were never
    -- rescheduled over the interviews held this month. "Held" is `done` or
    -- `no_show` — a future slot of this month is not a data point yet.
    io.on_time_count,
    io.scheduled_count
FROM (
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
      AND (sqlc.narg('department_id')::uuid IS NULL OR p.department_id = sqlc.narg('department_id')::uuid)
) w
CROSS JOIN LATERAL (
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
      AND (sqlc.narg('department_id')::uuid IS NULL OR p.department_id = sqlc.narg('department_id')::uuid)
) cy
CROSS JOIN LATERAL (
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
      AND i.closed_at >= date_trunc('month', now())
) xd
CROSS JOIN LATERAL (
    SELECT
        coalesce(sum(tu.cost_usd_ticks), 0)::bigint AS cost_ticks,
        (count(*))::bigint AS usage_rows
    FROM task_usage tu
    JOIN agent_task_queue t ON t.id = tu.task_id
    JOIN agent a ON a.id = t.agent_id
    WHERE a.workspace_id = sqlc.arg('workspace_id')
      AND tu.created_at >= date_trunc('month', now())
) ac
CROSS JOIN LATERAL (
    SELECT
        (count(*) FILTER (WHERE t.status = 'failed'))::bigint AS failed_runs,
        (count(*) FILTER (WHERE t.status IN ('completed', 'failed')))::bigint AS finished_runs
    FROM agent_task_queue t
    JOIN agent a ON a.id = t.agent_id
    WHERE a.workspace_id = sqlc.arg('workspace_id')
      AND t.created_at >= now() - interval '7 days'
) ar
CROSS JOIN LATERAL (
    SELECT (count(*))::bigint AS created_week
    FROM knowledge_items ki
    LEFT JOIN knowledge_spaces ks ON ks.id = ki.space_id AND ks.workspace_id = ki.workspace_id
    WHERE ki.workspace_id = sqlc.arg('workspace_id')
      AND ki.created_at >= date_trunc('week', now())
      AND (sqlc.narg('department_id')::uuid IS NULL OR ks.department_id = sqlc.narg('department_id')::uuid)
) kw
CROSS JOIN LATERAL (
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
      AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid)
) pl
CROSS JOIN LATERAL (
    SELECT
        coalesce(sum(c.final_amount), 0)::float8 AS signed_amount,
        (count(*))::bigint AS sample_count
    FROM crm_collab c
    LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
    WHERE c.workspace_id = sqlc.arg('workspace_id')
      AND c.archived_at IS NULL
      AND c.stage NOT IN ('inquiry', 'quoted', 'negotiating', 'cancelled')
      AND c.confirmed_at >= date_trunc('month', now())
      AND c.confirmed_at < date_trunc('month', now()) + interval '1 month'
      AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid)
) sg
CROSS JOIN LATERAL (
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
      AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid)
) co
CROSS JOIN LATERAL (
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
      AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid)
) mg
CROSS JOIN LATERAL (
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
      AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid)
) ro
CROSS JOIN LATERAL (
    SELECT
        (count(*) FILTER (WHERE settled.settled_count >= 2))::bigint AS repeat_creators,
        (count(*))::bigint AS active_creators
    FROM (
        SELECT c.creator_id, (count(*))::bigint AS settled_count
        FROM crm_collab c
        LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
        WHERE c.workspace_id = sqlc.arg('workspace_id')
          AND c.archived_at IS NULL
          AND c.stage = 'settled'
          AND c.accepted_at >= date_trunc('quarter', now())
          AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid)
        GROUP BY c.creator_id
    ) settled
) rp
CROSS JOIN LATERAL (
    SELECT (count(*))::bigint AS active_candidates
    FROM hr_candidate c
    LEFT JOIN hr_job j ON j.id = c.job_id AND j.workspace_id = c.workspace_id
    LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
    WHERE c.workspace_id = sqlc.arg('workspace_id')
      AND c.archived_at IS NULL
      AND c.stage NOT IN ('hired', 'rejected', 'withdrawn')
      AND (sqlc.narg('department_id')::uuid IS NULL
           OR j.department_id = sqlc.narg('department_id')::uuid
           OR m.department_id = sqlc.narg('department_id')::uuid)
) hc
CROSS JOIN LATERAL (
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
           OR m.department_id = sqlc.narg('department_id')::uuid)
) tth
CROSS JOIN LATERAL (
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
           OR m.department_id = sqlc.narg('department_id')::uuid)
) sb
CROSS JOIN LATERAL (
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
           OR m.department_id = sqlc.narg('department_id')::uuid)
) io;


-- name: OverviewCrmFinance :one
-- `GET /api/workbench/finance` — the read-only money block: signed, collected,
-- the cost side of gross margin, and receivable age, all for one calendar month.
-- The handler turns these raw sums into the same `{value, sample_count, empty}`
-- triple the metric strip uses, so a figure with no rows behind it is a gap card
-- on both surfaces and never a zero (docs/METRICS.md §1 rule 3).
--
-- Caliber, figure by figure:
--
--   * signed — contract value whose confirmation date (`confirmed_at`, stamped by
--     the stage transition) falls inside this calendar month, over every stage
--     reached after negotiating instead of only the `confirmed` stage: a
--     collaboration confirmed this month and since moved to `sampling` or
--     `published` is still this month's signature, and testing the stage by
--     equality would make the number shrink as the work progresses. Per C10 the
--     total counts every settlement kind, renewals included; a renewal is its
--     own `crm_settlement` row, so it is signed once here and collected once in
--     `collected` when it is paid — never twice inside one figure.
--
--   * collected — money that cleared this month: `crm_settlement.paid_at` inside
--     the month. An unpaid row is the receivable below, not revenue.
--
--   * cost — creator + sample + platform fees of the collaborations that reached
--     `settled` this month (`accepted_at`, the milestone that stage stamps).
--     This is the cost side of gross margin; the division happens in the handler
--     so a ratio is computed in exactly one place.
--
--   * receivable_days — mean age, in days, of the settlements still unpaid,
--     measured from `created_at`: how long the money has been owed. `samples` is
--     the denominator the handler needs to tell "0 days" from "nothing owed".
--
-- Department attribution follows the B0 fallback chain (docs/METRICS.md §4): the
-- collaboration owner's member department, reached from the settlement through
-- its collaboration. Nothing here is an access boundary.
--
-- One currency per window (`dominant`). `crm_collab` and `crm_settlement` both
-- carry a currency, and adding CNY to USD produces a number in neither: the same
-- rule `BdPerformanceCurrency` applies to its report. Every sum below filters on
-- the window's dominant currency and the response names it, so a workspace that
-- bills in two currencies reads "5000 CNY", never "9000".
WITH bounds AS (
    SELECT coalesce(sqlc.narg('month_start')::date, date_trunc('month', now())::date) AS month_start
),
dominant AS (
    SELECT coalesce(
        (
            SELECT currency
            FROM (
                SELECT c.currency::text AS currency
                FROM crm_collab c CROSS JOIN bounds b
                WHERE c.workspace_id = sqlc.arg('workspace_id')
                  AND c.archived_at IS NULL
                  AND c.stage NOT IN ('inquiry', 'quoted', 'negotiating', 'cancelled')
                  AND c.confirmed_at >= b.month_start::timestamptz
                  AND c.confirmed_at < (b.month_start + interval '1 month')::timestamptz
                UNION ALL
                SELECT s.currency::text
                FROM crm_settlement s CROSS JOIN bounds b
                WHERE s.workspace_id = sqlc.arg('workspace_id')
                  AND s.archived_at IS NULL
                  AND s.paid_at >= b.month_start
                  AND s.paid_at < (b.month_start + interval '1 month')::date
                UNION ALL
                SELECT c.currency::text
                FROM crm_collab c CROSS JOIN bounds b
                WHERE c.workspace_id = sqlc.arg('workspace_id')
                  AND c.archived_at IS NULL
                  AND c.stage = 'settled'
                  AND c.accepted_at >= b.month_start::timestamptz
                  AND c.accepted_at < (b.month_start + interval '1 month')::timestamptz
                UNION ALL
                SELECT s.currency::text
                FROM crm_settlement s CROSS JOIN bounds b
                WHERE s.workspace_id = sqlc.arg('workspace_id')
                  AND s.archived_at IS NULL
                  AND s.paid_at IS NULL
            ) money_rows
            GROUP BY currency
            ORDER BY count(*) DESC, currency
            LIMIT 1
        ),
        'CNY'
    )::text AS currency
),
signed AS (
    SELECT
        coalesce(sum(c.final_amount), 0)::float8 AS amount,
        (count(*) FILTER (WHERE c.final_amount IS NOT NULL))::bigint AS samples
    FROM crm_collab c
    LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id

    CROSS JOIN bounds b
    WHERE c.workspace_id = sqlc.arg('workspace_id')
      AND c.archived_at IS NULL
      AND c.stage NOT IN ('inquiry', 'quoted', 'negotiating', 'cancelled')
      AND c.currency = (SELECT currency FROM dominant)
      AND c.confirmed_at >= b.month_start::timestamptz
      AND c.confirmed_at < (b.month_start + interval '1 month')::timestamptz
      AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid)
),
collected AS (
    SELECT
        coalesce(sum(s.amount), 0)::float8 AS amount,
        (count(*))::bigint AS samples
    FROM crm_settlement s
    JOIN crm_collab c ON c.id = s.collab_id AND c.workspace_id = s.workspace_id
    LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id

    CROSS JOIN bounds b
    WHERE s.workspace_id = sqlc.arg('workspace_id')
      AND s.archived_at IS NULL
      AND s.currency = (SELECT currency FROM dominant)
      AND s.paid_at >= b.month_start
      AND s.paid_at < (b.month_start + interval '1 month')::date
      AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid)
),
cost AS (
    SELECT
        coalesce(sum(
            coalesce(c.creator_fee, 0) + coalesce(c.sample_cost, 0) + coalesce(c.platform_fee, 0)
        ), 0)::float8 AS amount,
        (count(*))::bigint AS samples
    FROM crm_collab c
    LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id

    CROSS JOIN bounds b
    WHERE c.workspace_id = sqlc.arg('workspace_id')
      AND c.archived_at IS NULL
      AND c.stage = 'settled'
      AND c.currency = (SELECT currency FROM dominant)
      AND c.accepted_at >= b.month_start::timestamptz
      AND c.accepted_at < (b.month_start + interval '1 month')::timestamptz
      AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid)
),
receivable AS (
    SELECT
        coalesce(avg(EXTRACT(EPOCH FROM (now() - s.created_at))::float8 / 86400.0), 0)::float8 AS avg_days,
        (count(*))::bigint AS samples
    FROM crm_settlement s
    JOIN crm_collab c ON c.id = s.collab_id AND c.workspace_id = s.workspace_id
    LEFT JOIN member m ON m.workspace_id = c.workspace_id AND m.user_id = c.owner_member_id
    WHERE s.workspace_id = sqlc.arg('workspace_id')
      AND s.archived_at IS NULL
      AND s.currency = (SELECT currency FROM dominant)
      AND s.paid_at IS NULL
      AND (sqlc.narg('department_id')::uuid IS NULL OR m.department_id = sqlc.narg('department_id')::uuid)
)
SELECT
    to_char(b.month_start, 'YYYY-MM') AS month,
    (SELECT currency FROM dominant) AS currency,
    signed.amount AS signed_amount,
    signed.samples AS signed_samples,
    collected.amount AS collected_amount,
    collected.samples AS collected_samples,
    cost.amount AS cost_amount,
    cost.samples AS cost_samples,
    receivable.avg_days AS receivable_days,
    receivable.samples AS receivable_samples
FROM signed, collected, cost, receivable

CROSS JOIN bounds b;

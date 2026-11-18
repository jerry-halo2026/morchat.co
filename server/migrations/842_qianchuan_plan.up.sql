-- 千川计划（WORKBENCH-API §25.1）。
--
-- 千川计划档案。只存档案字段，计划的当日表现不在本表（每日报表在 daily_* 里，维度是计划 id）。**不提供任何投放写操作**（§25.5）。
--
-- 每行带 `source_version` / `captured_at`：前者是拍平快照的版本号，后者是
-- 我们看到这行的时刻。两者一起才答得出「历史某天当时看到的是多少」——
-- 平台会改写已结算口径，覆盖写会把那个答案抹掉。
--
-- 自然键是 UNIQUE 约束（建表时随表建，不是单独的 CONCURRENT 索引）：这些
-- 表由 sync 幂等 upsert 写入，重复跑一次行数必须不变。
CREATE TABLE IF NOT EXISTS qianchuan_plan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    plan_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    account_name TEXT,
    name TEXT,
    marketing_goal TEXT,
    status TEXT,
    opt_status TEXT,
    budget NUMERIC(14,2),
    budget_mode TEXT,
    roi2_goal NUMERIC(10,4),
    smart_bid_type TEXT,
    create_time TIMESTAMPTZ,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    modify_time TIMESTAMPTZ,
    -- 其余平台列原样进这里（键名保持官方原样，不改写、不做单位换算）。
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Provenance: which flat snapshot this row came from and when we saw it, so
    -- "the number we saw that day" replays (WORKBENCH-API §25.1).
    source_version TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, plan_id)
);

COMMENT ON TABLE qianchuan_plan IS
    '千川计划档案。只存档案字段，计划的当日表现不在本表（每日报表在 daily_* 里，维度是计划 id）。**不提供任何投放写操作**（§25.5）。';
COMMENT ON COLUMN qianchuan_plan.plan_id IS
    '平台计划 id（TEXT，同上）';
COMMENT ON COLUMN qianchuan_plan.budget IS
    '计划预算，元，两位小数（平台以元下发）';
COMMENT ON COLUMN qianchuan_plan.roi2_goal IS
    '目标 ROI，0–1 以外的正数比值，不 clamp：平台给什么存什么';
COMMENT ON COLUMN qianchuan_plan.status IS
    '平台状态枚举原样（ENABLE / DISABLE / DELETE …），不做翻译';
COMMENT ON COLUMN qianchuan_plan.source_version IS
    '拍平快照的版本号（packages/qianchuan-sync 的不可变版本链）；同一天两次采集是两行不同版本。';
COMMENT ON COLUMN qianchuan_plan.captured_at IS
    '本次采集的时刻。与 stat_date 不同：stat_date 说的是数据属于哪天，captured_at 说的是我们哪一刻看到的。';
COMMENT ON COLUMN qianchuan_plan.metrics IS
    '平台返回的其余列，键名保持官方原样（snake_case）。读方只按名字取值，不做加总——跨结算窗口求和是 bug（§25.2）。';

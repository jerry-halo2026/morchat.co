-- 违规事件（WORKBENCH-API §25.1）。
--
-- 违规事件。只读：本批不做申诉，也不改平台状态。
--
-- 每行带 `source_version` / `captured_at`：前者是拍平快照的版本号，后者是
-- 我们看到这行的时刻。两者一起才答得出「历史某天当时看到的是多少」——
-- 平台会改写已结算口径，覆盖写会把那个答案抹掉。
--
-- 自然键是 UNIQUE 约束（建表时随表建，不是单独的 CONCURRENT 索引）：这些
-- 表由 sync 幂等 upsert 写入，重复跑一次行数必须不变。
CREATE TABLE IF NOT EXISTS qianchuan_violation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    event_id TEXT NOT NULL,
    account_id TEXT,
    account_name TEXT,
    ad_id TEXT,
    create_time TIMESTAMPTZ,
    illegal_type TEXT,
    score INT,
    status TEXT,
    reject_reason TEXT,
    -- 其余平台列原样进这里（键名保持官方原样，不改写、不做单位换算）。
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Provenance: which flat snapshot this row came from and when we saw it, so
    -- "the number we saw that day" replays (WORKBENCH-API §25.1).
    source_version TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, event_id)
);

COMMENT ON TABLE qianchuan_violation IS
    '违规事件。只读：本批不做申诉，也不改平台状态。';
COMMENT ON COLUMN qianchuan_violation.event_id IS
    '平台违规事件 id';
COMMENT ON COLUMN qianchuan_violation.status IS
    '平台状态枚举原样（TIMEOUT / FAILAPPEAL …）。**逾期未处理**是本批唯一一个『打开状态』的来源，指标 `qianchuan.violation.open` 读它';
COMMENT ON COLUMN qianchuan_violation.score IS
    '平台给的严重度分';
COMMENT ON COLUMN qianchuan_violation.reject_reason IS
    '平台原文（很长），不截断';
COMMENT ON COLUMN qianchuan_violation.source_version IS
    '拍平快照的版本号（packages/qianchuan-sync 的不可变版本链）；同一天两次采集是两行不同版本。';
COMMENT ON COLUMN qianchuan_violation.captured_at IS
    '本次采集的时刻。与 stat_date 不同：stat_date 说的是数据属于哪天，captured_at 说的是我们哪一刻看到的。';
COMMENT ON COLUMN qianchuan_violation.metrics IS
    '平台返回的其余列，键名保持官方原样（snake_case）。读方只按名字取值，不做加总——跨结算窗口求和是 bug（§25.2）。';

-- 全域推广 · 视频维度日数据（WORKBENCH-API §25.1）。
--
-- 全域推广视频维度的日数据（`uni_video`，源文件约 16 MB）。与 845 同构，拆开是因为维度的语义不同（直播间 vs
-- 短视频），且两张源表各自更新。
--
-- 每行带 `source_version` / `captured_at`：前者是拍平快照的版本号，后者是
-- 我们看到这行的时刻。两者一起才答得出「历史某天当时看到的是多少」——
-- 平台会改写已结算口径，覆盖写会把那个答案抹掉。
--
-- 自然键是 UNIQUE 约束（建表时随表建，不是单独的 CONCURRENT 索引）：这些
-- 表由 sync 幂等 upsert 写入，重复跑一次行数必须不变。
CREATE TABLE IF NOT EXISTS qianchuan_daily_uni_video (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    stat_date DATE NOT NULL,
    account_id TEXT NOT NULL,
    account_name TEXT,
    dim_id TEXT,
    dim_name TEXT,
    spend NUMERIC(14,2),
    gmv NUMERIC(14,2),
    order_count BIGINT,
    refund_amount NUMERIC(14,2),
    settle_amount_1h NUMERIC(14,2),
    settle_amount_7d NUMERIC(14,2),
    -- 其余平台列原样进这里（键名保持官方原样，不改写、不做单位换算）。
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Provenance: which flat snapshot this row came from and when we saw it, so
    -- "the number we saw that day" replays (WORKBENCH-API §25.1).
    source_version TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, stat_date, account_id, dim_id)
);

COMMENT ON TABLE qianchuan_daily_uni_video IS
    '全域推广视频维度的日数据（`uni_video`，源文件约 16 MB）。与 845 同构，拆开是因为维度的语义不同（直播间 vs 短视频），且两张源表各自更新。';
COMMENT ON COLUMN qianchuan_daily_uni_video.dim_id IS
    '视频（aweme item）id';
COMMENT ON COLUMN qianchuan_daily_uni_video.dim_name IS
    '视频标题，平台原样';
COMMENT ON COLUMN qianchuan_daily_uni_video.spend IS
    '花费，元（`stat_cost_for_roi2`）';
COMMENT ON COLUMN qianchuan_daily_uni_video.settle_amount_1h IS
    '1 小时结算口径的结算额。**不能和 7d 相加**（§25.2）';
COMMENT ON COLUMN qianchuan_daily_uni_video.settle_amount_7d IS
    '7 天结算口径的结算额';
COMMENT ON COLUMN qianchuan_daily_uni_video.source_version IS
    '拍平快照的版本号（packages/qianchuan-sync 的不可变版本链）；同一天两次采集是两行不同版本。';
COMMENT ON COLUMN qianchuan_daily_uni_video.captured_at IS
    '本次采集的时刻。与 stat_date 不同：stat_date 说的是数据属于哪天，captured_at 说的是我们哪一刻看到的。';
COMMENT ON COLUMN qianchuan_daily_uni_video.metrics IS
    '平台返回的其余列，键名保持官方原样（snake_case）。读方只按名字取值，不做加总——跨结算窗口求和是 bug（§25.2）。';

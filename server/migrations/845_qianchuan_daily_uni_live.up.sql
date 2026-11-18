-- 全域推广 · 直播维度日数据（WORKBENCH-API §25.1）。
--
-- 全域推广直播维度的日数据（`uni_live`，源文件约 25 MB）。核心列同 §25.1（花费/GMV/订单/退款/1h 与 7d
-- 结算额），**其余五十多列进 `metrics`**；这一族的花费列名带 `_fork` 后缀，映射在 sync 里显式写出。
--
-- 每行带 `source_version` / `captured_at`：前者是拍平快照的版本号，后者是
-- 我们看到这行的时刻。两者一起才答得出「历史某天当时看到的是多少」——
-- 平台会改写已结算口径，覆盖写会把那个答案抹掉。
--
-- 自然键是 UNIQUE 约束（建表时随表建，不是单独的 CONCURRENT 索引）：这些
-- 表由 sync 幂等 upsert 写入，重复跑一次行数必须不变。
CREATE TABLE IF NOT EXISTS qianchuan_daily_uni_live (
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

COMMENT ON TABLE qianchuan_daily_uni_live IS
    '全域推广直播维度的日数据（`uni_live`，源文件约 25 MB）。核心列同 §25.1（花费/GMV/订单/退款/1h 与 7d 结算额），**其余五十多列进 `metrics`**；这一族的花费列名带 `_fork` 后缀，映射在 sync 里显式写出。';
COMMENT ON COLUMN qianchuan_daily_uni_live.dim_id IS
    '直播间/达人维度 id（`uni_live` 的 dim）';
COMMENT ON COLUMN qianchuan_daily_uni_live.dim_name IS
    '维度名（直播间标题或达人名，平台原样，可能含 # 话题）';
COMMENT ON COLUMN qianchuan_daily_uni_live.spend IS
    '花费，元。这一族平台用 `stat_cost_for_roi2_fork` 命名，映射在 cmd/qianchuan-sync';
COMMENT ON COLUMN qianchuan_daily_uni_live.settle_amount_1h IS
    '1 小时结算口径的结算额。**不能和 7d 相加**（§25.2）';
COMMENT ON COLUMN qianchuan_daily_uni_live.settle_amount_7d IS
    '7 天结算口径的结算额';
COMMENT ON COLUMN qianchuan_daily_uni_live.source_version IS
    '拍平快照的版本号（packages/qianchuan-sync 的不可变版本链）；同一天两次采集是两行不同版本。';
COMMENT ON COLUMN qianchuan_daily_uni_live.captured_at IS
    '本次采集的时刻。与 stat_date 不同：stat_date 说的是数据属于哪天，captured_at 说的是我们哪一刻看到的。';
COMMENT ON COLUMN qianchuan_daily_uni_live.metrics IS
    '平台返回的其余列，键名保持官方原样（snake_case）。读方只按名字取值，不做加总——跨结算窗口求和是 bug（§25.2）。';

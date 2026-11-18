-- 对账快照（账面 vs 平台）（WORKBENCH-API §25.1）。
--
-- 对账快照。`acct_*` 是平台侧的口径；台账侧的数字由 `GET /ads/recon` 现算（Σ
-- daily_overall），两边差额就是这张表存在的理由。
--
-- 每行带 `source_version` / `captured_at`：前者是拍平快照的版本号，后者是
-- 我们看到这行的时刻。两者一起才答得出「历史某天当时看到的是多少」——
-- 平台会改写已结算口径，覆盖写会把那个答案抹掉。
--
-- 自然键是 UNIQUE 约束（建表时随表建，不是单独的 CONCURRENT 索引）：这些
-- 表由 sync 幂等 upsert 写入，重复跑一次行数必须不变。
CREATE TABLE IF NOT EXISTS qianchuan_recon (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    account_id TEXT NOT NULL,
    account_name TEXT,
    goal TEXT NOT NULL DEFAULT 'ALL',
    acct_cost NUMERIC(14,2),
    acct_gmv NUMERIC(14,2),
    acct_orders BIGINT,
    -- 其余平台列原样进这里（键名保持官方原样，不改写、不做单位换算）。
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Provenance: which flat snapshot this row came from and when we saw it, so
    -- "the number we saw that day" replays (WORKBENCH-API §25.1).
    source_version TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, account_id, goal, captured_at)
);

COMMENT ON TABLE qianchuan_recon IS
    '对账快照。`acct_*` 是平台侧的口径；台账侧的数字由 `GET /ads/recon` 现算（Σ daily_overall），两边差额就是这张表存在的理由。';
COMMENT ON COLUMN qianchuan_recon.goal IS
    '平台的推广目的分组（ALL / LIVE_PROM_GOODS …）';
COMMENT ON COLUMN qianchuan_recon.acct_cost IS
    '平台侧账户消耗合计，元';
COMMENT ON COLUMN qianchuan_recon.acct_gmv IS
    '平台侧成交合计，元';
COMMENT ON COLUMN qianchuan_recon.acct_orders IS
    '平台侧订单合计';
COMMENT ON COLUMN qianchuan_recon.captured_at IS
    '对账是快照：同一账户同一天可以对到不同的差额，所以自然键含它';
COMMENT ON COLUMN qianchuan_recon.source_version IS
    '拍平快照的版本号（packages/qianchuan-sync 的不可变版本链）；同一天两次采集是两行不同版本。';
COMMENT ON COLUMN qianchuan_recon.captured_at IS
    '本次采集的时刻。与 stat_date 不同：stat_date 说的是数据属于哪天，captured_at 说的是我们哪一刻看到的。';
COMMENT ON COLUMN qianchuan_recon.metrics IS
    '平台返回的其余列，键名保持官方原样（snake_case）。读方只按名字取值，不做加总——跨结算窗口求和是 bug（§25.2）。';

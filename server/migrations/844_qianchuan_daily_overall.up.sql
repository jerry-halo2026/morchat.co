-- 账户日汇总（含商品/图文/直播切片）（WORKBENCH-API §25.1）。
--
-- 账户日汇总。**一张表四种切片**：`overall` / `product` / `image` / `live_video` —— 四个 flat
-- 文件是同一组指标列的不同维度切法，拆成四张表会让『这一天花了多少』有四个读法。
--
-- 每行带 `source_version` / `captured_at`：前者是拍平快照的版本号，后者是
-- 我们看到这行的时刻。两者一起才答得出「历史某天当时看到的是多少」——
-- 平台会改写已结算口径，覆盖写会把那个答案抹掉。
--
-- 自然键是 UNIQUE 约束（建表时随表建，不是单独的 CONCURRENT 索引）：这些
-- 表由 sync 幂等 upsert 写入，重复跑一次行数必须不变。
CREATE TABLE IF NOT EXISTS qianchuan_daily_overall (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    stat_date DATE NOT NULL,
    account_id TEXT NOT NULL,
    account_name TEXT,
    -- Which slice of the same metric family this row is: the account total, the
    -- product slice, the image slice, or the live/video slice. The three extra
    -- flat files (prod_dim / uni_image / live_video) are dimension cuts of these
    -- same columns, so they live here rather than in three more tables.
    dim_kind TEXT NOT NULL DEFAULT 'overall'
        CHECK (dim_kind IN ('overall', 'product', 'image', 'live_video')),
    dim_id TEXT,
    dim_name TEXT,
    topic_tag TEXT,
    -- The five structured measures (WORKBENCH-API §25.1). Everything else the
    -- platform sent stays in the metrics column under its official name.
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
    UNIQUE (workspace_id, stat_date, account_id, dim_kind, dim_id)
);

COMMENT ON TABLE qianchuan_daily_overall IS
    '账户日汇总。**一张表四种切片**：`overall` / `product` / `image` / `live_video` —— 四个 flat 文件是同一组指标列的不同维度切法，拆成四张表会让『这一天花了多少』有四个读法。';
COMMENT ON COLUMN qianchuan_daily_overall.dim_kind IS
    'overall | product | image | live_video —— 同一组指标列的四种切片，来自四个 flat 文件；不拆表是为了让『某天某账户花了多少』只有一个读法';
COMMENT ON COLUMN qianchuan_daily_overall.dim_id IS
    '切片维度 id：overall 是计划 id，product 是商品 id，image 是图文素材 id，live_video 是视频 aweme id';
COMMENT ON COLUMN qianchuan_daily_overall.spend IS
    '花费，元（`stat_cost_for_roi2`；live_video 切片用 `stat_cost_for_roi2_fork`，映射在 cmd/qianchuan-sync）';
COMMENT ON COLUMN qianchuan_daily_overall.gmv IS
    '成交金额，元（`total_pay_order_gmv_for_roi2`）';
COMMENT ON COLUMN qianchuan_daily_overall.order_count IS
    '支付订单数（`total_pay_order_count_for_roi2`）';
COMMENT ON COLUMN qianchuan_daily_overall.refund_amount IS
    '退款金额，元（`total_refund_order_gmv_for_roi2_1h_all`）';
COMMENT ON COLUMN qianchuan_daily_overall.settle_amount_1h IS
    '1 小时结算口径的结算额（`total_order_settle_amount_for_roi2_1h`）。**不能和 7d/14d/30d/90d 相加**（§25.2）';
COMMENT ON COLUMN qianchuan_daily_overall.settle_amount_7d IS
    '7 天结算口径的结算额（`total_order_settle_amount_for_roi2_7d`）。默认展示口径';
COMMENT ON COLUMN qianchuan_daily_overall.source_version IS
    '拍平快照的版本号（packages/qianchuan-sync 的不可变版本链）；同一天两次采集是两行不同版本。';
COMMENT ON COLUMN qianchuan_daily_overall.captured_at IS
    '本次采集的时刻。与 stat_date 不同：stat_date 说的是数据属于哪天，captured_at 说的是我们哪一刻看到的。';
COMMENT ON COLUMN qianchuan_daily_overall.metrics IS
    '平台返回的其余列，键名保持官方原样（snake_case）。读方只按名字取值，不做加总——跨结算窗口求和是 bug（§25.2）。';

-- 账户余额快照（WORKBENCH-API §25.1）。
--
-- 账户余额快照。余额没有历史账本口径（平台只给当下值），所以每次 sync 追加一条快照而不是覆盖：**这是唯一一张按 captured_at
-- 做自然键的千川表**。
--
-- 每行带 `source_version` / `captured_at`：前者是拍平快照的版本号，后者是
-- 我们看到这行的时刻。两者一起才答得出「历史某天当时看到的是多少」——
-- 平台会改写已结算口径，覆盖写会把那个答案抹掉。
--
-- 自然键是 UNIQUE 约束（建表时随表建，不是单独的 CONCURRENT 索引）：这些
-- 表由 sync 幂等 upsert 写入，重复跑一次行数必须不变。
CREATE TABLE IF NOT EXISTS qianchuan_balance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    account_id TEXT NOT NULL,
    account_name TEXT,
    balance NUMERIC(14,2),
    cash NUMERIC(14,2),
    common_grant NUMERIC(14,2),
    valid_grant NUMERIC(14,2),
    -- 其余平台列原样进这里（键名保持官方原样，不改写、不做单位换算）。
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Provenance: which flat snapshot this row came from and when we saw it, so
    -- "the number we saw that day" replays (WORKBENCH-API §25.1).
    source_version TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, account_id, captured_at)
);

COMMENT ON TABLE qianchuan_balance IS
    '账户余额快照。余额没有历史账本口径（平台只给当下值），所以每次 sync 追加一条快照而不是覆盖：**这是唯一一张按 captured_at 做自然键的千川表**。';
COMMENT ON COLUMN qianchuan_balance.balance IS
    '账户总余额。**单位是分**（平台 `AccountBalanceGet` 的口径）：26234080 = 262,340.80 元。本表不做元/分换算，换算只发生在展示层';
COMMENT ON COLUMN qianchuan_balance.cash IS
    '现金余额，分';
COMMENT ON COLUMN qianchuan_balance.common_grant IS
    '普通赠款，分';
COMMENT ON COLUMN qianchuan_balance.valid_grant IS
    '有效赠款，分。cash + valid_grant 应等于 balance，导入时对不上只记 warning，不改数';
COMMENT ON COLUMN qianchuan_balance.captured_at IS
    '拉取余额的瞬间。余额是快照不是账本，所以自然键含它，同一天可以有多条';
COMMENT ON COLUMN qianchuan_balance.source_version IS
    '拍平快照的版本号（packages/qianchuan-sync 的不可变版本链）；同一天两次采集是两行不同版本。';
COMMENT ON COLUMN qianchuan_balance.captured_at IS
    '本次采集的时刻。与 stat_date 不同：stat_date 说的是数据属于哪天，captured_at 说的是我们哪一刻看到的。';
COMMENT ON COLUMN qianchuan_balance.metrics IS
    '平台返回的其余列，键名保持官方原样（snake_case）。读方只按名字取值，不做加总——跨结算窗口求和是 bug（§25.2）。';

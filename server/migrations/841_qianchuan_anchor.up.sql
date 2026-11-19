-- 达人（主播）授权（WORKBENCH-API §25.1）。
--
-- 投放账户下的达人授权关系（`aweme_auth_list`）。一个达人可以被多个账户投放，因此钱要按 (账户, 达人) 记。
--
-- 每行带 `source_version` / `captured_at`：前者是拍平快照的版本号，后者是
-- 我们看到这行的时刻。两者一起才答得出「历史某天当时看到的是多少」——
-- 平台会改写已结算口径，覆盖写会把那个答案抹掉。
--
-- 自然键是 UNIQUE 约束（建表时随表建，不是单独的 CONCURRENT 索引）：这些
-- 表由 sync 幂等 upsert 写入，重复跑一次行数必须不变。
CREATE TABLE IF NOT EXISTS qianchuan_anchor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    account_id TEXT NOT NULL,
    account_name TEXT,
    aweme_id TEXT NOT NULL,
    aweme_name TEXT,
    -- 其余平台列原样进这里（键名保持官方原样，不改写、不做单位换算）。
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Provenance: which flat snapshot this row came from and when we saw it, so
    -- "the number we saw that day" replays (WORKBENCH-API §25.1).
    source_version TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, account_id, aweme_id)
);

COMMENT ON TABLE qianchuan_anchor IS
    '投放账户下的达人授权关系（`aweme_auth_list`）。一个达人可以被多个账户投放，因此钱要按 (账户, 达人) 记。';
COMMENT ON COLUMN qianchuan_anchor.aweme_id IS
    '抖音号 id。同一个达人可以授权给多个投放账户，所以自然键是账户 × 达人';
COMMENT ON COLUMN qianchuan_anchor.aweme_name IS
    '达人昵称，平台原样';
COMMENT ON COLUMN qianchuan_anchor.source_version IS
    '拍平快照的版本号（packages/qianchuan-sync 的不可变版本链）；同一天两次采集是两行不同版本。';
COMMENT ON COLUMN qianchuan_anchor.captured_at IS
    '本次采集的时刻。与 stat_date 不同：stat_date 说的是数据属于哪天，captured_at 说的是我们哪一刻看到的。';
COMMENT ON COLUMN qianchuan_anchor.metrics IS
    '平台返回的其余列，键名保持官方原样（snake_case）。读方只按名字取值，不做加总——跨结算窗口求和是 bug（§25.2）。';

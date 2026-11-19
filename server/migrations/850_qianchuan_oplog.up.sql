-- 平台操作日志（WORKBENCH-API §25.1）。
--
-- 平台操作日志（`oplog`）。这是我们**没有**做过的改动的唯一记录：投放写操作不在本批，所以这张表是审计面而不是执行面。
--
-- 每行带 `source_version` / `captured_at`：前者是拍平快照的版本号，后者是
-- 我们看到这行的时刻。两者一起才答得出「历史某天当时看到的是多少」——
-- 平台会改写已结算口径，覆盖写会把那个答案抹掉。
--
-- 自然键是 UNIQUE 约束（建表时随表建，不是单独的 CONCURRENT 索引）：这些
-- 表由 sync 幂等 upsert 写入，重复跑一次行数必须不变。
CREATE TABLE IF NOT EXISTS qianchuan_oplog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    log_id TEXT NOT NULL,
    account_id TEXT,
    account_name TEXT,
    object_type TEXT,
    object_id TEXT,
    object_name TEXT,
    action TEXT,
    content TEXT,
    create_time TIMESTAMPTZ,
    -- 其余平台列原样进这里（键名保持官方原样，不改写、不做单位换算）。
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Provenance: which flat snapshot this row came from and when we saw it, so
    -- "the number we saw that day" replays (WORKBENCH-API §25.1).
    source_version TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, log_id)
);

COMMENT ON TABLE qianchuan_oplog IS
    '平台操作日志（`oplog`）。这是我们**没有**做过的改动的唯一记录：投放写操作不在本批，所以这张表是审计面而不是执行面。';
COMMENT ON COLUMN qianchuan_oplog.log_id IS
    '平台日志 id';
COMMENT ON COLUMN qianchuan_oplog.object_id IS
    '被操作对象 id（计划/素材…），TEXT：三种 id 混在一列';
COMMENT ON COLUMN qianchuan_oplog.action IS
    '平台动作枚举原样';
COMMENT ON COLUMN qianchuan_oplog.content IS
    '平台原文（含变更前后值），不解析';
COMMENT ON COLUMN qianchuan_oplog.source_version IS
    '拍平快照的版本号（packages/qianchuan-sync 的不可变版本链）；同一天两次采集是两行不同版本。';
COMMENT ON COLUMN qianchuan_oplog.captured_at IS
    '本次采集的时刻。与 stat_date 不同：stat_date 说的是数据属于哪天，captured_at 说的是我们哪一刻看到的。';
COMMENT ON COLUMN qianchuan_oplog.metrics IS
    '平台返回的其余列，键名保持官方原样（snake_case）。读方只按名字取值，不做加总——跨结算窗口求和是 bug（§25.2）。';

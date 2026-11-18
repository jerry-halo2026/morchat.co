-- 素材（WORKBENCH-API §25.1）。
--
-- 素材档案。视频 / 图片 / 图文三种形态共用一张表（`kind` 区分）：它们的档案字段高度重叠，低效/原创两个标记来自单独一个 flag
-- 文件，导入时按 (account_id, material_id) 合并。
--
-- 每行带 `source_version` / `captured_at`：前者是拍平快照的版本号，后者是
-- 我们看到这行的时刻。两者一起才答得出「历史某天当时看到的是多少」——
-- 平台会改写已结算口径，覆盖写会把那个答案抹掉。
--
-- 自然键是 UNIQUE 约束（建表时随表建，不是单独的 CONCURRENT 索引）：这些
-- 表由 sync 幂等 upsert 写入，重复跑一次行数必须不变。
CREATE TABLE IF NOT EXISTS qianchuan_material (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('video', 'image', 'carousel')),
    material_id TEXT NOT NULL,
    account_id TEXT,
    account_name TEXT,
    filename TEXT,
    -- 视频有 video_id，图片有 image_id，图文（carousel）两者都没有；分列存，
    -- 因为它们是平台的两套 id，混成一列会让『按素材下钻』少一半。
    video_id TEXT,
    image_id TEXT,
    width INT,
    height INT,
    size_bytes BIGINT,
    duration INT,
    format TEXT,
    image_mode TEXT,
    is_ai_create BOOLEAN,
    is_inefficient BOOLEAN,
    is_original BOOLEAN,
    source TEXT,
    signature TEXT,
    tag TEXT,
    create_time TIMESTAMPTZ,
    -- 内容侧桥：素材可以挂到一条 media_script 上（§25.3）。NULL = 还没挂。
    media_script_id UUID,
    -- 其余平台列原样进这里（键名保持官方原样，不改写、不做单位换算）。
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Provenance: which flat snapshot this row came from and when we saw it, so
    -- "the number we saw that day" replays (WORKBENCH-API §25.1).
    source_version TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, kind, account_id, material_id)
);

COMMENT ON TABLE qianchuan_material IS
    '素材档案。视频 / 图片 / 图文三种形态共用一张表（`kind` 区分）：它们的档案字段高度重叠，低效/原创两个标记来自单独一个 flag 文件，导入时按 (account_id, material_id) 合并。';
COMMENT ON COLUMN qianchuan_material.kind IS
    'video | image | carousel —— 三个 flat 文件（material_video / material_image / material_carousel）加上 material_flag 的两种布尔';
COMMENT ON COLUMN qianchuan_material.material_id IS
    '素材 id。图文没有 video_id/image_id，只有它';
COMMENT ON COLUMN qianchuan_material.is_inefficient IS
    '来自 material_flag.csv：平台判定的低效素材';
COMMENT ON COLUMN qianchuan_material.is_original IS
    '来自 material_flag.csv：是否原创';
COMMENT ON COLUMN qianchuan_material.media_script_id IS
    '挂到内容侧脚本（`media_script`）上的桥，NULL 表示未挂。仓库规则：不建外键，应用层校验同工作区';
COMMENT ON COLUMN qianchuan_material.source_version IS
    '拍平快照的版本号（packages/qianchuan-sync 的不可变版本链）；同一天两次采集是两行不同版本。';
COMMENT ON COLUMN qianchuan_material.captured_at IS
    '本次采集的时刻。与 stat_date 不同：stat_date 说的是数据属于哪天，captured_at 说的是我们哪一刻看到的。';
COMMENT ON COLUMN qianchuan_material.metrics IS
    '平台返回的其余列，键名保持官方原样（snake_case）。读方只按名字取值，不做加总——跨结算窗口求和是 bug（§25.2）。';

-- 对标拆解 (benchmark teardown): a peer account's numbers, captured on a day, for
-- one of our IPs to be measured against (docs/engineering/WORKBENCH-API.md §21).
--
-- Where `media_hot` is "what the platform said was trending", this is "how this
-- account performs" — the account we study, its follower count, and whatever
-- metrics the operator copied out of the platform (播放中位数、互动率、爆款率…).
--
-- `metrics` is JSONB rather than columns for the same reason `media_shoot.shots`
-- is: the metric set differs per platform and changes without a product decision.
-- It is an object (`CHECK jsonb_typeof = 'object'`), defaults to `{}` = "nothing
-- measured yet", and is written whole — a partial merge of a benchmark card would
-- produce a rectangle nobody collected.
--
-- `ip_id` says which of our personas this benchmark is read against. It is
-- nullable: an industry-wide benchmark belongs to no single IP. When present the
-- handler validates it against a live `media_ip` (no foreign key — repository
-- rule). `follower_count` is nullable and must not be 0-filled: "我们没有采到粉丝数"
-- and "0 粉丝" are different statements (contract §0 rule 2).
--
-- No foreign key, soft delete via `archived_at`, workspace-scoped.
CREATE TABLE IF NOT EXISTS media_bench (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    ip_id UUID,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    follower_count BIGINT CHECK (follower_count IS NULL OR follower_count >= 0),
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
    captured_on DATE NOT NULL,
    note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

COMMENT ON TABLE media_bench IS
    'One benchmarked peer account for one day (WORKBENCH-API §21). Soft-deleted, no foreign key.';
COMMENT ON COLUMN media_bench.ip_id IS
    'The own IP this benchmark is read against; NULL for an industry-wide benchmark. Validated in the handler.';
COMMENT ON COLUMN media_bench.follower_count IS
    'Followers at capture time. NULL when not collected — never 0, which would claim the account has no audience.';
COMMENT ON COLUMN media_bench.metrics IS
    'Platform metrics copied off the account, as a JSON object; {} means nothing measured yet. Written whole.';
COMMENT ON COLUMN media_bench.captured_on IS
    'The day these numbers were read. DATE: a leaderboard snapshot has no hour.';

-- Daily snapshot of a creator's content health
-- (docs/engineering/WORKBENCH-DATA-CONTRACT.md §2.2/§2.3). One row per creator
-- per day, so the numbers can be trended instead of only being current.
--
-- Every rate and average is nullable, and NULL is load-bearing. §2.3:
--
--   * no work with statistics at all          → every metric NULL  (not 0 %)
--   * fewer than 10 works with statistics     → hit_rate NULL
--   * follower count NULL or 0                → engagement_rate NULL
--
-- `sample_note` records which of those applied (`no_stats` / `sample_below_10` /
-- `no_followers`), so a NULL row explains itself instead of looking like a
-- collection bug.
--
-- `engagement_rate` is NUMERIC(10,5), not NUMERIC(6,5), on purpose: the upstream
-- data really does contain 4503 % (= 45.03021) because a creator's follower count
-- and their works' statistics disagree by orders of magnitude. The contract says
-- store it as it is — a clamp would erase the signal that this row is broken.
-- The extra integer digits are that headroom; the scale stays at 5 decimals.
--
-- `hit_rate` stays NUMERIC(6,5): it is a proportion of works, so it cannot leave
-- 0–1 by more than rounding.
CREATE TABLE IF NOT EXISTS creator_metric (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    creator_id UUID NOT NULL,
    captured_on DATE NOT NULL,
    video_count INTEGER,
    videos_with_stats INTEGER,
    posts_last_30d INTEGER,
    avg_digg NUMERIC(14, 2),
    avg_comment NUMERIC(14, 2),
    avg_share NUMERIC(14, 2),
    engagement_rate NUMERIC(10, 5),
    hit_rate NUMERIC(6, 5),
    sample_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE creator_metric IS
    'One day''s content health per creator (WORKBENCH-DATA-CONTRACT §2.2). NULL metrics mean "not computable", and sample_note says why.';
COMMENT ON COLUMN creator_metric.video_count IS
    'Works on record for this creator, with or without statistics.';
COMMENT ON COLUMN creator_metric.videos_with_stats IS
    'Works whose digg_count is non-NULL — the sample size behind every metric here.';
COMMENT ON COLUMN creator_metric.posts_last_30d IS
    'Works published in the 30 days before the capture; a work with no create_time cannot be counted.';
COMMENT ON COLUMN creator_metric.engagement_rate IS
    '(avg_digg + avg_comment + avg_share) / fans. Stored 0–1, unclamped: values above 1 are real upstream data (max 45.03021 = 4503 %) and mean the follower count disagrees with the works.';
COMMENT ON COLUMN creator_metric.hit_rate IS
    'Share of works whose likes exceed 2x the median of the creator''s works. NULL below 10 works with statistics.';
COMMENT ON COLUMN creator_metric.sample_note IS
    'Why a metric is NULL: no_stats | sample_below_10 | no_followers. NULL when every metric was computable.';

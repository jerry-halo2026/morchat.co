-- Mirror columns for the orange 达人 (creator lead) pool
-- (docs/engineering/ORANGE-SYNC.md). `creator` was written by hand only; these
-- columns carry what the upstream orange database knows and this one does not,
-- and they are only ever written by the mirror job.
--
-- Additive only: no column here changes the meaning of an existing one, and
-- every column is nullable (or defaulted) so the two rows already in the table,
-- and every hand-created creator, stay valid without a backfill.
--
-- Ownership split — the reason these columns exist at all:
--   * mirror-owned (upstream wins on every sync): sec_uid, douyin_id, dy_uid,
--     fans, fans_display, display_name, region, quote_min, quote_max,
--     cooperation_intent, lead_status, last_dm_at, likes_total,
--     following_count, verify_type, tags, source_*.
--   * human-owned (a sync never touches them): owner_member_id, score,
--     risk_flag, blacklist_reason, category, media_ip_id, media_ip_project_id.
--
-- `fans_display` keeps the upstream display string ("2.6万") next to the parsed
-- `fans`, because the parse is lossy in one direction only: 26,000 can never be
-- turned back into "2.6万", and 4 of every 5 upstream rows carry both forms.
--
-- `source_system` / `source_id` are the mirror identity, not a foreign key:
-- ('orange', sec_uid) names the upstream row this creator was mirrored from.
-- Both stay NULL for a creator a person created, which is what keeps the unique
-- index in 786 from constraining manual rows.
--
-- `tags` mirrors upstream's jsonb array of {id, name, color} verbatim instead of
-- normalizing it into a tag table: orange owns the tag vocabulary, renames it
-- there, and a local copy that drifted would be worse than a blob that is
-- rewritten on every sync.
ALTER TABLE creator
    ADD COLUMN IF NOT EXISTS sec_uid TEXT,
    ADD COLUMN IF NOT EXISTS douyin_id TEXT,
    ADD COLUMN IF NOT EXISTS dy_uid TEXT,
    ADD COLUMN IF NOT EXISTS fans_display TEXT,
    ADD COLUMN IF NOT EXISTS quote_min NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS quote_max NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS cooperation_intent TEXT,
    ADD COLUMN IF NOT EXISTS lead_status TEXT,
    ADD COLUMN IF NOT EXISTS last_dm_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS likes_total BIGINT,
    ADD COLUMN IF NOT EXISTS following_count INTEGER,
    ADD COLUMN IF NOT EXISTS verify_type TEXT,
    ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS source_type TEXT,
    ADD COLUMN IF NOT EXISTS source_keyword TEXT,
    ADD COLUMN IF NOT EXISTS source_rank INTEGER,
    ADD COLUMN IF NOT EXISTS source_system TEXT,
    ADD COLUMN IF NOT EXISTS source_id TEXT;

-- The quote pair is either absent or ordered. NULL in either half means "not
-- quoted yet"; the upstream table carries the same rule
-- (creator_quote_order on orange's creator), so a mirror row can never hold a
-- pair the source would have rejected.
ALTER TABLE creator
    ADD CONSTRAINT creator_quote_order
    CHECK (quote_min IS NULL OR quote_max IS NULL OR quote_max >= quote_min);

-- The outreach stage keeps upstream's Chinese values untranslated: they are
-- what a colleague typing a filter expects to see, and a translated enum would
-- have to be mapped back on every write. '已签约' is in the list because the
-- live upstream holds it (1 row) — an enum that rejects a value the source
-- actually produces is a bug, not a constraint.
ALTER TABLE creator
    ADD CONSTRAINT creator_cooperation_intent
    CHECK (
        cooperation_intent IS NULL
        OR cooperation_intent IN ('未接触', '待发送', '已发送', '已回复', '已报价', '寄样中', '已成单', '已签约', '排除')
    );

-- The lead funnel state is upstream's English crawl_status enum, also verbatim.
ALTER TABLE creator
    ADD CONSTRAINT creator_lead_status
    CHECK (lead_status IS NULL OR lead_status IN ('LEAD_NEW', 'LEAD_CONTACTED', 'LEAD_DEAL', 'LEAD_REJECT'));

COMMENT ON COLUMN creator.sec_uid IS
    'orange 抖音 sec_uid; mirror identity together with source_system (785). NULL for a hand-created creator.';
COMMENT ON COLUMN creator.fans_display IS
    'Upstream display follower count verbatim ("2.6万"), next to the parsed creator.fans.';
COMMENT ON COLUMN creator.cooperation_intent IS
    'orange outreach stage, verbatim Chinese: 未接触/待发送/已发送/已回复/已报价/寄样中/已成单/已签约/排除.';
COMMENT ON COLUMN creator.lead_status IS
    'orange crawl_status funnel state: LEAD_NEW/LEAD_CONTACTED/LEAD_DEAL/LEAD_REJECT.';
COMMENT ON COLUMN creator.last_dm_at IS
    'orange dm_time: when the outreach DM was sent.';
COMMENT ON COLUMN creator.tags IS
    'orange tags jsonb array verbatim ([{id, name, color}]), rewritten by every sync.';
COMMENT ON COLUMN creator.source_system IS
    'Mirror source system ("orange"); NULL for a hand-created creator.';
COMMENT ON COLUMN creator.source_id IS
    'Row identity inside source_system (orange: sec_uid).';
COMMENT ON COLUMN creator.source_type IS
    'orange source_type: search / comment / manual — how the lead was discovered.';
COMMENT ON COLUMN creator.source_keyword IS
    'orange source_keyword: the search keyword (or comment context) that produced the lead.';
COMMENT ON COLUMN creator.source_rank IS
    'orange source_rank: position in the discovery result the lead came from.';

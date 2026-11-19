-- Reverse of 785. The mirror identity columns and everything the sync writes go
-- away; `creator` returns to exactly the shape hand-written rows use.
ALTER TABLE creator DROP CONSTRAINT IF EXISTS creator_lead_status;
ALTER TABLE creator DROP CONSTRAINT IF EXISTS creator_cooperation_intent;
ALTER TABLE creator DROP CONSTRAINT IF EXISTS creator_quote_order;

ALTER TABLE creator
    DROP COLUMN IF EXISTS source_id,
    DROP COLUMN IF EXISTS source_system,
    DROP COLUMN IF EXISTS source_rank,
    DROP COLUMN IF EXISTS source_keyword,
    DROP COLUMN IF EXISTS source_type,
    DROP COLUMN IF EXISTS tags,
    DROP COLUMN IF EXISTS verify_type,
    DROP COLUMN IF EXISTS following_count,
    DROP COLUMN IF EXISTS likes_total,
    DROP COLUMN IF EXISTS last_dm_at,
    DROP COLUMN IF EXISTS lead_status,
    DROP COLUMN IF EXISTS cooperation_intent,
    DROP COLUMN IF EXISTS quote_max,
    DROP COLUMN IF EXISTS quote_min,
    DROP COLUMN IF EXISTS fans_display,
    DROP COLUMN IF EXISTS dy_uid,
    DROP COLUMN IF EXISTS douyin_id,
    DROP COLUMN IF EXISTS sec_uid;

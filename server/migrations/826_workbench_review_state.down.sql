ALTER TABLE crm_collab
    DROP COLUMN IF EXISTS review_state,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS reviewed_at;

ALTER TABLE creator_quote
    DROP COLUMN IF EXISTS review_state,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS reviewed_at;

ALTER TABLE creator_activity
    DROP COLUMN IF EXISTS review_state,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS reviewed_at;

ALTER TABLE crm_settlement
    DROP COLUMN IF EXISTS review_state,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS reviewed_at;

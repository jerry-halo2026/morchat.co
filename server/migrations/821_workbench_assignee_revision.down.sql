ALTER TABLE crm_settlement
    DROP COLUMN IF EXISTS revision,
    DROP COLUMN IF EXISTS assignee_id,
    DROP COLUMN IF EXISTS assignee_type;

ALTER TABLE creator_activity
    DROP COLUMN IF EXISTS revision,
    DROP COLUMN IF EXISTS assignee_id,
    DROP COLUMN IF EXISTS assignee_type;

ALTER TABLE creator_quote
    DROP COLUMN IF EXISTS revision,
    DROP COLUMN IF EXISTS assignee_id,
    DROP COLUMN IF EXISTS assignee_type;

ALTER TABLE crm_collab
    DROP COLUMN IF EXISTS revision,
    DROP COLUMN IF EXISTS assignee_id,
    DROP COLUMN IF EXISTS assignee_type;

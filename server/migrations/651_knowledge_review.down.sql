-- Rollback of 651: drop the review state. The item rows themselves are untouched,
-- so an item that was active stays active and simply loses its review record.
ALTER TABLE knowledge_items DROP COLUMN IF EXISTS review_issue_id;
ALTER TABLE knowledge_items DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE knowledge_items DROP COLUMN IF EXISTS reviewed_at;
ALTER TABLE knowledge_items DROP COLUMN IF EXISTS stale_after;

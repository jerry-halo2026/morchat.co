-- Review state for knowledge items (W1-A, the trust gate).
--
-- An item becomes `active` only through a recorded review, and the recording is
-- these four columns: who approved it, when, which issue carried the review, and
-- when the approval goes stale. All four are nullable with no foreign keys
-- (repository rule): the review issue is cleaned up in application code, and a
-- NULL simply means "never reviewed" — which is exactly the state every
-- historical row is in.
--
-- No backfill: existing active rows keep reviewed_at = NULL on purpose. They
-- predate the gate, and the audit command (`multica knowledge audit`) reports
-- them as `unreviewed_active` rather than inventing an approver for them.
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS review_issue_id UUID;
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS stale_after TIMESTAMPTZ;

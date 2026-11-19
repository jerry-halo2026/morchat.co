-- 复核闸门 (WORKBENCH-API §26.1, COLLAB-MODEL §7.2).
--
-- The four core ledgers gain the three columns that make "what an agent wrote"
-- reviewable without a second table:
--
--   * `review_state` — pending / accepted / rejected. DEFAULT 'accepted' so every
--     row that already exists (and every write that does not need a second look)
--     keeps the behaviour it had before this batch: nothing disappeared from a
--     list because a migration ran.
--   * `reviewed_by` / `reviewed_at` — who decided, and when. Both NULL while the
--     row is pending, and both cleared again when a later write sends a decided
--     row back to pending: the old decision no longer applies to what the row now
--     says.
--
-- Why a column and not an audit-only state: the review queue is a list read with
-- an index and a filter (`?review_state=pending`), and a state that only existed
-- inside `activity_log.details` would need a JSON scan per page. The audit trail
-- still records every decision as its own event (§26.2) — this column is the
-- current answer, the trail is the history.
ALTER TABLE crm_collab
    ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'accepted'
        CHECK (review_state IN ('pending', 'accepted', 'rejected')),
    ADD COLUMN IF NOT EXISTS reviewed_by UUID,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE creator_quote
    ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'accepted'
        CHECK (review_state IN ('pending', 'accepted', 'rejected')),
    ADD COLUMN IF NOT EXISTS reviewed_by UUID,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE creator_activity
    ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'accepted'
        CHECK (review_state IN ('pending', 'accepted', 'rejected')),
    ADD COLUMN IF NOT EXISTS reviewed_by UUID,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE crm_settlement
    ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'accepted'
        CHECK (review_state IN ('pending', 'accepted', 'rejected')),
    ADD COLUMN IF NOT EXISTS reviewed_by UUID,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

COMMENT ON COLUMN crm_collab.review_state IS
    'pending | accepted | rejected — a human must look at agent writes and at high-value fields (WORKBENCH-API §26.1).';
COMMENT ON COLUMN creator_quote.review_state IS
    'pending | accepted | rejected — see crm_collab.review_state.';
COMMENT ON COLUMN creator_activity.review_state IS
    'pending | accepted | rejected — agent writes only; a follow-up carries no high-value field.';
COMMENT ON COLUMN crm_settlement.review_state IS
    'pending | accepted | rejected — settlement rows are money, so every write that moves an amount is reviewed.';

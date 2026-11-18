-- The audit trail points at a workbench ledger row, not at an issue
-- (docs/engineering/COLLAB-MODEL.md §2).
--
-- `activity_log` was issue-shaped: `issue_id` is the only subject it could name,
-- so a change to a collaboration, a quote, a follow-up or a settlement had
-- nowhere to go and the workbench kept no trail at all. These two columns are the
-- polymorphic subject the contract names: `subject_type` is the **business**
-- name (`crm_collab`, `creator_quote`, …) — the same vocabulary
-- `issue.origin_type` widened to in 816, so an audit row and a discussion thread
-- that point at one ledger row say the same word.
--
-- Both nullable and both without a foreign key, for two reasons: an issue's
-- timeline never carries them (every existing row stays valid), and a ledger
-- row's deletion must not cascade its own audit trail away — the whole point of
-- the trail is to outlive the row it describes. `workspace_id` already scopes
-- every read; `subject_id` is resolved in the application like every other
-- workbench pointer.
ALTER TABLE activity_log
    ADD COLUMN IF NOT EXISTS subject_type TEXT,
    ADD COLUMN IF NOT EXISTS subject_id UUID;

COMMENT ON COLUMN activity_log.subject_type IS
    'Business name of the ledger row this event is about (crm_collab, creator_quote, creator_activity, crm_settlement, media_topic, goal_okr, qianchuan_plan). NULL for issue timeline events.';
COMMENT ON COLUMN activity_log.subject_id IS
    'Id of that ledger row. No foreign key: the audit trail outlives the row it describes.';

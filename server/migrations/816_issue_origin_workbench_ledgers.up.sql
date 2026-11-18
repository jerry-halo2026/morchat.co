-- Extend issue.origin_type with the four business names a workbench ledger row
-- can anchor a discussion on (COLLAB-MODEL §5): a thread started from a
-- collab, a quote, a follow-up or a topic stamps the issue with the ledger's
-- business name and origin_id = that row's id.
--
-- The value is the *business* name, not the table name's abbreviation and not a
-- channel: `crm_collab` and `creator_quote` are what COLLAB-MODEL §2 uses for
-- `activity_log.subject_type`, so an audit trail and an issue that point at the
-- same row say the same word.
--
-- Recreate the CHECK as NOT VALID, the same way migrations 060/111/366 widen it:
-- the ACCESS EXCLUSIVE lock is held briefly, and no table scan runs behind it.
-- Nothing to scan for yet either — every value added here is new, so no existing
-- row can violate the widened set. (Migration 367 is the precedent for a
-- separate VALIDATE pass; this batch does not need one.)
ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_origin_type_check;
ALTER TABLE issue ADD CONSTRAINT issue_origin_type_check
    CHECK (origin_type IN (
        'autopilot',
        'quick_create',
        'lark_chat',
        'slack_chat',
        'agent_create',
        'dingtalk_chat',
        'wecom_chat',
        'telegram_chat',
        'crm_collab',
        'creator_quote',
        'creator_activity',
        'media_topic'
    ))
    NOT VALID;

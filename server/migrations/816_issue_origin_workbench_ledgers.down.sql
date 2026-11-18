-- Back to the platform's channel origins only. The four workbench values are
-- new in this batch, so a workspace that rolls back has no row carrying them —
-- and if somebody anchored a thread first, this migration refuses rather than
-- silently rewriting an origin. That refusal is the point: an issue whose
-- origin_type no longer explains where it came from is worse than a failed
-- rollback.
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
        'telegram_chat'
    ))
    NOT VALID;

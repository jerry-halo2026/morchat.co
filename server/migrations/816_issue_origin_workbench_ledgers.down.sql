-- Back to the platform's channel origins only. The four workbench values are new in
-- this batch, so a workspace with no anchored thread has no row carrying them.
--
-- A row that DOES carry one cannot survive the narrower check: `ADD CONSTRAINT ...
-- NOT VALID` does not scan existing rows, so the rollback would succeed and leave
-- rows that every later UPDATE trips over. Refuse loudly instead — an issue whose
-- origin_type no longer explains where it came from is worse than a failed rollback.
DO $$
DECLARE
    anchored bigint;
BEGIN
    SELECT count(*) INTO anchored
    FROM issue
    WHERE origin_type IN ('crm_collab', 'creator_quote', 'creator_activity', 'media_topic');

    IF anchored > 0 THEN
        RAISE EXCEPTION
            'cannot roll back 816: % issue(s) still carry a workbench origin_type; archive or re-anchor them first',
            anchored;
    END IF;
END $$;

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

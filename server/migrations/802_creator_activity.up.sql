-- BD follow-up log (WORKBENCH-DATA-CONTRACT §3.1, WORKBENCH-API §20): who talked
-- to this creator, when, what came of it, and when to talk again.
--
-- No foreign key (repository rule): `creator_id` and `owner_member_id` are
-- resolved in the application, and the row is soft-deleted via `archived_at` — a
-- follow-up recorded against the wrong person stops being part of the answer
-- without erasing that somebody recorded it.
--
-- `outcome` is nullable and NULL is load-bearing: "记得问她要报价单" is a note with no
-- result, which is not the same statement as `no_reply`. The cockpit's `contacted`
-- counter counts creators with a non-NULL outcome for exactly that reason
-- (WORKBENCH-API §20.3).
--
-- `next_follow_at` is nullable too: most follow-ups schedule nothing. Only a row
-- that has one can make a creator overdue, so the partial index in 804 reads this
-- column and nothing else.
CREATE TABLE IF NOT EXISTS creator_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    creator_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('dm', 'call', 'meeting', 'email', 'note')),
    happened_at TIMESTAMPTZ NOT NULL,
    summary TEXT NOT NULL,
    outcome TEXT CHECK (outcome IN ('no_reply', 'replied', 'declined', 'advanced')),
    next_follow_at TIMESTAMPTZ,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

COMMENT ON TABLE creator_activity IS
    'One BD follow-up: a DM / call / meeting / email / note with a creator (WORKBENCH-DATA-CONTRACT §3.1). Soft-deleted, no foreign key.';
COMMENT ON COLUMN creator_activity.happened_at IS
    'When the conversation happened, not when the row was typed; the ledger reads happened_at DESC.';
COMMENT ON COLUMN creator_activity.outcome IS
    'no_reply | replied | declined | advanced. NULL means the row is a note with no result yet, which is not "no reply".';
COMMENT ON COLUMN creator_activity.next_follow_at IS
    'When to follow up again. NULL schedules nothing; only a non-NULL value can make a creator due or overdue.';
COMMENT ON COLUMN creator_activity.summary IS
    'What was said / what was learned. Never empty: the handler rejects a blank summary.';

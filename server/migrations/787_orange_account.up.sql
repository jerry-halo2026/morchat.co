-- orange account → workspace mapping. One upstream account is mirrored into
-- exactly one workspace: the upstream database has a single `account_id` for
-- everything (verified: 785 creator rows, 1 account), so "which workspace owns
-- this mirror" is a decision that has to be recorded once, not re-derived from
-- whatever -workspace flag the last run happened to pass.
--
-- `account_id` is a bare uuid, not a foreign key: it points into a database we
-- do not own. The two unique indexes are built in 788 and 789 — a concurrent
-- build cannot live in the same file as the CREATE TABLE.
CREATE TABLE orange_account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    account_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE orange_account IS
    'Which workspace mirrors which orange account (docs/engineering/ORANGE-SYNC.md). account_id is a uuid in the orange database, not a foreign key.';
COMMENT ON COLUMN orange_account.account_id IS
    'orange account.id. Unique: one upstream account is mirrored into one workspace only.';

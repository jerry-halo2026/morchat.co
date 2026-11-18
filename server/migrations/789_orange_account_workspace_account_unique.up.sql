-- (workspace_id, account_id) unique: the lookup teardown and the CLI both do
-- ("this workspace's mappings", "this account's workspace"), and stating the
-- pair keeps those reads index-only.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_orange_account_workspace_account
    ON orange_account (workspace_id, account_id);

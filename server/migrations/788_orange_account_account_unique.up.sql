-- One upstream account belongs to one workspace. This is the key the sync
-- resolves a workspace through, and the reason a second workspace cannot start
-- mirroring the same account: the insert conflicts instead of duplicating 623
-- rows into a second tenant.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_orange_account_account
    ON orange_account (account_id);

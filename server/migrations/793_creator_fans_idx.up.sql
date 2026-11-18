-- "Biggest accounts first" is the default ordering of the lead list, and it is
-- the only ordering that needs an index: the rest page on created_at, which 667
-- already covers.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_workspace_fans
    ON creator (workspace_id, fans DESC NULLS LAST);

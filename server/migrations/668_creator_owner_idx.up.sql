-- "Creators I own" and the member write scope both read `owner_member_id`
-- inside a workspace (a `member` role may only change rows it owns).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_workspace_owner
    ON creator (workspace_id, owner_member_id);

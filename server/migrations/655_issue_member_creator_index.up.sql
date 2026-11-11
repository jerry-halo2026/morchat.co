-- "Issues I created": only member-authored rows can answer the literal creator
-- half of the Created relation, so the partial index stops there and leaves the
-- agent-authored rows to the requester index (654).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issue_workspace_member_creator ON issue (workspace_id, creator_id) WHERE creator_type = 'member';

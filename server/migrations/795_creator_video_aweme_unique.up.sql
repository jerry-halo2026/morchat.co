-- One live row per aweme per workspace: the key the video mirror upserts on.
--
-- Partial on `archived_at IS NULL` for the same reason `creator` keys its mirror
-- identity that way (786): a soft-deleted work must stop reserving the platform
-- identity, so a work that comes back upstream is inserted again instead of
-- colliding with its own tombstone.
--
-- Workspace-scoped, not account-scoped: orange keys the same aweme under
-- (account_id, aweme_id), and one upstream account is mirrored into exactly one
-- workspace (orange_account, 787), so the two keys agree — while a second
-- workspace can mirror its own copy of a shared work without a conflict.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_video_workspace_aweme_live
    ON creator_video (workspace_id, aweme_id)
    WHERE archived_at IS NULL;

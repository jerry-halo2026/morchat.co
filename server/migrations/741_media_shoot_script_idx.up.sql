-- The shoot(s) of one script: read with the script in the 拍摄 screen, and the
-- write gate walks script → topic, so this is also the lookup that answers "is
-- this script already scheduled" (§12).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_shoot_workspace_script
    ON media_shoot (workspace_id, script_id)
    WHERE archived_at IS NULL;

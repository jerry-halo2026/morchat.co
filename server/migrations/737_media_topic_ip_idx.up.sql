-- Topic list of one IP: `GET /api/workbench/media/topics?ip_id=`, the board a
-- 人设 owner opens every morning (§12).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_topic_workspace_ip
    ON media_topic (workspace_id, ip_id)
    WHERE archived_at IS NULL;

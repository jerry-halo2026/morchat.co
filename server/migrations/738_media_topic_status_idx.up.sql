-- Topic list by pipeline stage: `GET /api/workbench/media/topics?status=pool`,
-- and the cross-IP "what is waiting to be scripted" view (§12).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_topic_workspace_status
    ON media_topic (workspace_id, status)
    WHERE archived_at IS NULL;

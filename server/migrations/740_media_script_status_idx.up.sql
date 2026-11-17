-- Script list by review stage: `GET /api/workbench/media/scripts?status=review`,
-- the 复审 queue (§12).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_script_workspace_status
    ON media_script (workspace_id, status)
    WHERE archived_at IS NULL;

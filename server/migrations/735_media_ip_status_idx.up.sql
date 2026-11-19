-- IP list by status: `GET /api/workbench/media/ips?status=active`, which is the
-- default view of the IP board (§12).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_ip_workspace_status
    ON media_ip (workspace_id, status)
    WHERE archived_at IS NULL;

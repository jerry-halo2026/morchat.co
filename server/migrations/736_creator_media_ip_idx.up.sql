-- The account list of one IP (`GET /api/workbench/media/ips/{id}` reads
-- `creator.media_ip_id = …`) and the duplicate check on
-- `POST …/ips/{id}/accounts` (729, §12). Partial because an unattached account is
-- not part of any IP's list.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_workspace_media_ip
    ON creator (workspace_id, media_ip_id)
    WHERE media_ip_id IS NOT NULL AND archived_at IS NULL;

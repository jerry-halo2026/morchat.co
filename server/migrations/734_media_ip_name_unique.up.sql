-- One live IP per (workspace, name, ignoring case) (728). Partial on purpose:
-- archiving an IP must free its name, because re-creating one that was deleted by
-- mistake is the normal repair. `lower(name)` because "小美" and "小美 " or
-- "Umi"/"umi" are the same persona to the operator, and two personas with one
-- name would make every 选题 ambiguous.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_media_ip_workspace_name_lower
    ON media_ip (workspace_id, lower(name))
    WHERE archived_at IS NULL;

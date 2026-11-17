-- Shoot calendar: `GET /api/workbench/media/shoots?from=&to=` filters on
-- `shoot_date` (732, §12). Ordered by date, so the index carries the sort
-- column; the id tiebreak keeps a same-day page stable.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_shoot_workspace_shoot_date
    ON media_shoot (workspace_id, shoot_date, id)
    WHERE archived_at IS NULL;

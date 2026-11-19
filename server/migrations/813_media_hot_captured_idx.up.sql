-- The radar list's read order: `GET /api/workbench/media/hot?captured_on=` walks
-- one day's list, and the unfiltered list shows the newest captures first.
--
-- `(workspace_id, captured_on DESC, id DESC)` serves both: the date filter is an
-- index range and the ordering needs no sort, with `id` keeping the order total so
-- a page boundary cannot repeat or skip a row.
--
-- Its own single-statement file, outside any transaction, per the concurrent-index
-- rule; registered in `concurrentIndexCleanups` (up) in server/cmd/migrate/main.go.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_hot_workspace_captured
    ON media_hot (workspace_id, captured_on DESC, id DESC);

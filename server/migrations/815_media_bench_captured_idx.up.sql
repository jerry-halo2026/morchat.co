-- The teardown list's read order: `GET /api/workbench/media/bench?ip_id=` narrows
-- to one persona (an equality the index leads on after `workspace_id`), and the
-- unfiltered list shows the newest captures first.
--
-- `(workspace_id, captured_on DESC, id DESC)` keeps the ordering index-only and
-- total (the id breaks ties), so a page boundary cannot repeat or skip a row.
--
-- Its own single-statement file, outside any transaction, per the concurrent-index
-- rule; registered in `concurrentIndexCleanups` (up) in server/cmd/migrate/main.go.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_bench_workspace_captured
    ON media_bench (workspace_id, captured_on DESC, id DESC);

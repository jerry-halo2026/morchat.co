-- The radar queue, hottest first: `GET /api/workbench/signals?cut=hot&status=new`
-- (747, §13). `cut` is the operator's first sort, `score` breaks the ties
-- inside one grade, so both are in the key and the list needs no sort of its own.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_market_signal_workspace_cut
    ON market_signal (workspace_id, cut, score DESC)
    WHERE archived_at IS NULL;
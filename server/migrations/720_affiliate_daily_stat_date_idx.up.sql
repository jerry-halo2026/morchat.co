-- Monthly summary reads `affiliate_daily` by calendar window
-- (`GET /api/workbench/affiliate/summary?month=`), and the daily list filters the
-- same way: (workspace, day range) is the only access shape. The
-- UNIQUE (workspace_id, pick_id, stat_date) from 711 leads with pick_id, so it
-- cannot serve this range scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_affiliate_daily_workspace_stat_date
    ON affiliate_daily (workspace_id, stat_date);

-- "This account's daily rows over a window", which is what GET /ads/summary and
-- the spend/gmv/roi metrics read (WORKBENCH-API §25.3). The unique key already
-- covers (workspace_id, stat_date, account_id, dim_kind, dim_id), so a range scan
-- needs stat_date before account_id — the natural key orders account first, which
-- makes the window a set of index skips instead of one range.
--
-- Its own single-statement file, outside any transaction, per the concurrent-index
-- rule; registered in `concurrentIndexCleanups` as 852 → idx_qianchuan_daily_overall_range.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qianchuan_daily_overall_range
    ON qianchuan_daily_overall (workspace_id, stat_date, account_id, dim_kind);

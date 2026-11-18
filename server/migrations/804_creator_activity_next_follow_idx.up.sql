-- The 今日待跟进 / 已逾期 read (WORKBENCH-API §20.3 `pipeline.followups`): rows that
-- have a `next_follow_at` and are still live. Partial on both conditions because a
-- follow-up with no next step can never be due, and an archived row is not part of
-- any answer — indexing them would make the index mostly dead weight.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_activity_workspace_next_follow
    ON creator_activity (workspace_id, next_follow_at)
    WHERE archived_at IS NULL AND next_follow_at IS NOT NULL;

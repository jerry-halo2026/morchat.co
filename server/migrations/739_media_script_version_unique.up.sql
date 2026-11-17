-- One live row per (workspace, topic, version) (731, §12). The handler computes
-- the next number as `MAX(version) + 1` over *every* row of the topic — archived
-- ones included — so a version number is never reused, and this index is the
-- backstop that turns two concurrent rewrites into one 409 instead of two v2
-- rows (a duplicate version would make "v1 is still readable" ambiguous).
--
-- `WHERE archived_at IS NULL` keeps the index to the rows the review flow reads,
-- and matches every other live index in this schema.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_media_script_workspace_topic_version
    ON media_script (workspace_id, topic_id, version)
    WHERE archived_at IS NULL;

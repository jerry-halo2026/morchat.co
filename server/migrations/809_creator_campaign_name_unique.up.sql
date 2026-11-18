-- "This workspace already has a batch with this name" (808): the constraint behind
-- the 409 on POST / PATCH. Case-insensitive because a person naming a batch does
-- not think about capitalisation ("乌龙茶 11 月" / "乌龙茶 11 月"), and `lower(name)` is
-- what the handler's conflict read compares against.
--
-- Partial on `archived_at IS NULL`: an archived batch must not hold its name
-- hostage — the normal case is a batch opened by mistake, archived, and then
-- re-opened under the same name with real rows.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_campaign_workspace_name_lower
    ON creator_campaign (workspace_id, lower(name))
    WHERE archived_at IS NULL;

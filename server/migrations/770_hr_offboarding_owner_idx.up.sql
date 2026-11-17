-- "My exits" (767): a `member` writes only the records it owns
-- (`workbenchCanWrite`), and the list a member sees first is that same slice.
-- `owner_member_id` is also the column the owner/admin hand-over path reassigns,
-- so this is an equality probe on one composite key.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_offboarding_workspace_owner
    ON hr_offboarding (workspace_id, owner_member_id);

-- "What happened to this ledger row", read newest-first (COLLAB-MODEL §2).
--
-- Partial on `subject_type IS NOT NULL`: every issue timeline row (the whole
-- existing table) is excluded from the index, and 068's
-- `idx_activity_log_issue_keyset` stays the one that serves those reads. Two
-- audiences, two indexes, no double-write into either.
--
-- `created_at DESC` is in the index because the only read is "the newest event
-- for this subject" — the detail response's `last_actor` and the row's own
-- history both start there and walk back.
--
-- Its own single-statement file, outside any transaction, per the concurrent-index
-- rule; registered in `concurrentIndexCleanups` in server/cmd/migrate/main.go
-- (version → index: 820_activity_log_subject_idx → idx_activity_log_subject).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_log_subject
    ON activity_log (workspace_id, subject_type, subject_id, created_at DESC)
    WHERE subject_type IS NOT NULL;

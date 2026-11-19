-- One live row per sentence (758): the bank is a reusable asset, and the same
-- question typed twice splits its `usage_count`, its tags and its history into
-- two rows an operator then has to merge by hand. Two applicants' screening
-- questions read identically to a human, so the identity is `lower(question)`.
--
-- Partial on purpose: archiving a question must free its text, because
-- re-creating a row that was deleted by mistake is the normal repair. The
-- handler trims the text before insert, so " 你会 Go 吗 " and "你会 go 吗" are one
-- sentence — the expression index cannot see whitespace, and it should not have
-- to.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_question_workspace_question_lower
    ON hr_question (workspace_id, lower(question))
    WHERE archived_at IS NULL;

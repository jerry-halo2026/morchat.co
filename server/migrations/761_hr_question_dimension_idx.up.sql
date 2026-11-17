-- "Show me the risk questions" (758): the picker groups the bank by dimension,
-- and a round is assembled one dimension at a time (`skill` → `experience` →
-- `culture` → `potential` → `risk`). Equality on the dimension is the only read
-- shape, so the composite ends there.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_question_workspace_dimension
    ON hr_question (workspace_id, dimension);

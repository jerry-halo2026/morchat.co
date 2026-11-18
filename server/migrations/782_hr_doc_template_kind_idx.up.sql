-- "Templates of this kind" (780): the template picker filters by `?kind=`
-- (employment / resignation / contract / offer / other), an equality probe on one
-- column beside the workspace, so nothing else belongs in the index.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_doc_template_workspace_kind
    ON hr_doc_template (workspace_id, kind);

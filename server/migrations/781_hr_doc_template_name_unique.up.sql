-- "This workspace already has a template with this name" (780): the constraint
-- behind the 409 on POST / PATCH. Case-insensitive because a person renaming a
-- template does not think about capitalisation, and `lower(name)` is what the
-- handler's conflict read compares against.
--
-- Partial on `archived_at IS NULL`: a soft-deleted template must not hold its name
-- hostage -- a workspace that archived "Employment certificate" and later wants a
-- better one under the same name is the normal case.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_doc_template_workspace_name_lower
    ON hr_doc_template (workspace_id, lower(name))
    WHERE archived_at IS NULL;

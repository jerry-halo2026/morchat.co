-- One template per (workspace, job title), compared case-insensitively: a person
-- typing 商务 and 商务 both mean the same job, and a template that only matched its own
-- capitalisation would silently fall through to the read-only fallback (§24.2).
--
-- Partial on `archived_at IS NULL`: an archived template must not block re-creating
-- the same job title, and the resolver only reads live rows.
--
-- Its own single-statement file, outside any transaction, per the concurrent-index
-- rule; registered in `concurrentIndexCleanups` in server/cmd/migrate/main.go
-- (version → index: 818_workbench_role_template_unique →
-- idx_workbench_role_template_workspace_title).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_workbench_role_template_workspace_title
    ON workbench_role_template (workspace_id, lower(job_title))
    WHERE archived_at IS NULL;

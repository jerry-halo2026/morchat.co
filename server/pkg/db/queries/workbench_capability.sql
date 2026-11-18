-- Product-layer capabilities (docs/engineering/WORKBENCH-API.md §24).
--
-- A template is one workspace's answer to "what may a 商务 do here". Resolution order
-- (§24.2) reads it by job title, so the lookup here is case-insensitive and only sees
-- live rows — an archived template must never grant anything.

-- name: ListWorkbenchRoleTemplates :many
SELECT * FROM workbench_role_template
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
ORDER BY lower(job_title) ASC;

-- name: GetWorkbenchRoleTemplateByJobTitle :one
-- `lower(job_title)` matches the unique index (818) exactly, so the resolver and the
-- constraint agree on what "the same job title" means.
SELECT * FROM workbench_role_template
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND lower(job_title) = lower(sqlc.arg('job_title')::text)
  AND archived_at IS NULL;

-- name: UpsertWorkbenchRoleTemplate :one
-- PUT semantics: the body is the whole capability set, replacing whatever was there.
-- The conflict target repeats the partial index's predicate — without it PostgreSQL
-- cannot infer which unique index the ON CONFLICT refers to.
INSERT INTO workbench_role_template (workspace_id, job_title, capabilities)
VALUES (sqlc.arg('workspace_id')::uuid, sqlc.arg('job_title')::text, sqlc.arg('capabilities')::text[])
ON CONFLICT (workspace_id, lower(job_title)) WHERE archived_at IS NULL
DO UPDATE SET capabilities = EXCLUDED.capabilities, updated_at = now()
RETURNING *;

-- name: ArchiveWorkbenchRoleTemplate :execrows
-- Removing a template puts its holders back on the next resolution step (department
-- default, then the read-only fallback) — it does not leave them with the last set.
UPDATE workbench_role_template
SET archived_at = now(), updated_at = now()
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND lower(job_title) = lower(sqlc.arg('job_title')::text)
  AND archived_at IS NULL;

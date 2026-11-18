-- HR documents: templates and the generation ledger
-- (docs/engineering/WORKBENCH-API.md section 18). Same conventions as
-- workbench_hr.sql -- workspace-scoped, archived rows hidden, DELETE is a soft
-- delete -- plus the rules this domain adds:
--
-- **Templates are seeded, then owned.** The three builtin rows are inserted on
-- first read with `SeedHrDocTemplate`; `ON CONFLICT ... DO NOTHING` makes that
-- idempotent and keeps a concurrent second read from failing the request. The
-- handler refuses to edit or delete a builtin, so seeding cannot fight the user.
--
-- **A generation row is a snapshot.** `template_name` and `values` are written once
-- and never updated: a document issued today must keep saying what it said after
-- the template is reworded or the person's title changes.
--
-- **The generated file is an ordinary attachment.** The list joins it for `url` and
-- `filename` rather than duplicating either in this table, so a deleted attachment
-- is simply a NULL column instead of two copies of a stale URL.

-- name: ListHrDocTemplates :many
-- The template list: builtin rows first (they are the ones a new workspace has),
-- then the workspace's own, alphabetically. `?kind=` narrows to one document type
-- and matches idx_hr_doc_template_workspace_kind (782).
SELECT *
FROM hr_doc_template
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('kind')::text IS NULL OR kind = sqlc.narg('kind')::text)
ORDER BY builtin DESC, lower(name) ASC, created_at DESC;

-- name: GetHrDocTemplate :one
SELECT * FROM hr_doc_template
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateHrDocTemplate :one
INSERT INTO hr_doc_template (workspace_id, name, kind, body, owner_member_id, created_by)
VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('name'), sqlc.arg('kind'), sqlc.arg('body'),
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateHrDocTemplate :one
-- The three editable columns. `builtin` is absent on purpose: a seeded row is
-- read-only, and the handler answers 400 before reaching this statement.
UPDATE hr_doc_template
SET name = sqlc.arg('name'),
    kind = sqlc.arg('kind'),
    body = sqlc.arg('body'),
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveHrDocTemplate :execrows
UPDATE hr_doc_template
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CountHrDocTemplateNameConflicts :one
-- "this workspace already has a template with this name" -- the read behind the 409.
-- It matches the partial unique index (781) exactly, case-insensitively and over
-- live rows only, so the read and the index cannot disagree.
SELECT count(*)
FROM hr_doc_template
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND lower(name) = lower(sqlc.arg('name')::text)
  AND (sqlc.narg('exclude_id')::uuid IS NULL OR id <> sqlc.narg('exclude_id')::uuid);

-- name: SeedHrDocTemplate :exec
-- Materialises one builtin template for a workspace. Idempotent twice over: the
-- partial unique index would reject a duplicate, and `DO NOTHING` turns that into a
-- no-op instead of failing the read that triggered the seed.
INSERT INTO hr_doc_template (workspace_id, name, kind, body, builtin)
VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('name'), sqlc.arg('kind'), sqlc.arg('body'), true
)
ON CONFLICT (workspace_id, lower(name)) WHERE archived_at IS NULL
DO NOTHING;

-- name: ListHrDocGenerations :many
-- The employee's documents, newest first, with the attachment joined for the
-- download URL and the filename the browser would save. Ordering matches
-- idx_hr_doc_generation_workspace_employee (784).
SELECT g.*, a.url AS attachment_url, a.filename AS attachment_filename
FROM hr_doc_generation g
LEFT JOIN attachment a ON a.id = g.attachment_id
WHERE g.workspace_id = sqlc.arg('workspace_id')
  AND (sqlc.narg('employee_id')::uuid IS NULL OR g.employee_id = sqlc.narg('employee_id')::uuid)
ORDER BY g.created_at DESC, g.id DESC
LIMIT sqlc.arg('limit');

-- name: CreateHrDocGeneration :one
-- Every column is written, `NULL` included: a generation row is a fact about one
-- moment and never inherits a previous row's values.
INSERT INTO hr_doc_generation (
    workspace_id, employee_id, template_id, template_name, format,
    attachment_id, values, generated_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('employee_id'), sqlc.narg('template_id')::uuid,
    sqlc.arg('template_name'), sqlc.arg('format'),
    sqlc.narg('attachment_id')::uuid, sqlc.arg('values')::jsonb,
    sqlc.narg('generated_by')::uuid
)
RETURNING *;

-- name: ListProjectResources :many
SELECT * FROM project_resource
WHERE project_id = $1
ORDER BY position ASC, created_at ASC;

-- name: ListProjectResourcesInWorkspace :many
-- Workspace-scoped read for the daemon claim path. project_resource carries its
-- own workspace_id, so a corrupt project reference cannot pull another tenant's
-- repository URLs or local paths into a claim response.
SELECT * FROM project_resource
WHERE project_id = $1 AND workspace_id = $2
ORDER BY position ASC, created_at ASC;

-- name: ListProjectResourcesForProjects :many
SELECT * FROM project_resource
WHERE project_id = ANY(sqlc.arg('project_ids')::uuid[])
ORDER BY project_id, position ASC, created_at ASC;

-- name: GetProjectResource :one
SELECT * FROM project_resource
WHERE id = $1;

-- name: GetProjectResourceInWorkspace :one
SELECT * FROM project_resource
WHERE id = $1 AND workspace_id = $2;

-- name: GetProjectResourceInWorkspaceForUpdate :one
-- Same row as GetProjectResourceInWorkspace, but takes a row lock held until
-- the caller's transaction ends, serializing the read-decide-write flow in
-- UpdateProjectResource against competing partial updates (#9238).
SELECT * FROM project_resource
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: CreateProjectResource :one
INSERT INTO project_resource (
    project_id, workspace_id, resource_type, resource_ref, label, position, created_by
) VALUES (
    $1, $2, $3, sqlc.arg('resource_ref')::text::jsonb, sqlc.narg('label'), sqlc.arg('position'), sqlc.narg('created_by')
) RETURNING *;

-- name: UpdateProjectResource :one
UPDATE project_resource
SET resource_ref = sqlc.arg('resource_ref')::text::jsonb,
    label        = sqlc.narg('label'),
    position     = sqlc.arg('position')
WHERE id = $1
RETURNING *;

-- name: DeleteProjectResource :exec
DELETE FROM project_resource WHERE id = $1;

-- name: CountProjectResources :one
SELECT count(*) FROM project_resource WHERE project_id = $1;

-- name: GetProjectResourceCounts :many
SELECT project_id, count(*)::bigint AS resource_count
FROM project_resource
WHERE project_id = ANY(sqlc.arg('project_ids')::uuid[])
GROUP BY project_id;

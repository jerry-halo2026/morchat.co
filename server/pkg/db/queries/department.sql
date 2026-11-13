-- name: ListDepartments :many
SELECT * FROM department
WHERE workspace_id = sqlc.arg('workspace_id')
ORDER BY name ASC;

-- name: GetDepartment :one
SELECT * FROM department
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id');

-- name: CreateDepartment :one
INSERT INTO department (workspace_id, name, lead_user_id, system_key)
VALUES (sqlc.arg('workspace_id'), sqlc.arg('name'), sqlc.narg('lead_user_id'), sqlc.narg('system_key'))
RETURNING *;

-- name: UpdateDepartment :one
-- The handler loads the row first and resends unchanged fields, so an omitted
-- column in the request never silently clears the stored value.
UPDATE department
SET name = sqlc.arg('name'),
    lead_user_id = sqlc.narg('lead_user_id'),
    system_key = sqlc.narg('system_key'),
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')
RETURNING *;

-- name: DeleteDepartment :execrows
DELETE FROM department
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id');

-- name: ClearProjectDepartment :execrows
-- Department deletion detaches its projects in the same transaction as the
-- delete. There is no foreign key to cascade this (repository rule).
UPDATE project SET department_id = NULL, updated_at = now()
WHERE workspace_id = sqlc.arg('workspace_id') AND department_id = sqlc.arg('department_id');

-- name: ClearMemberDepartment :execrows
-- Same for members: their department is attribution, so losing it must not
-- remove them from any project or workspace.
UPDATE member SET department_id = NULL
WHERE workspace_id = sqlc.arg('workspace_id') AND department_id = sqlc.arg('department_id');

-- name: GetDepartmentForMember :one
-- "Which department is this member in"; no row means no department.
SELECT d.* FROM department d
JOIN member m ON m.department_id = d.id
WHERE m.workspace_id = $1 AND m.user_id = $2 AND d.workspace_id = $1;

-- name: GetDepartmentForProject :one
-- "Which department owns this project"; no row means no department.
SELECT d.* FROM department d
JOIN project p ON p.department_id = d.id
WHERE p.workspace_id = $1 AND p.id = $2 AND d.workspace_id = $1;

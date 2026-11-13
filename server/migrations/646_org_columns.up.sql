-- Department references on the tables that already exist. Every column is
-- nullable and carries no default, so each ALTER is a catalog-only change on a
-- populated table; the supporting indexes are built concurrently by 647-650.
--
-- No foreign keys (repository rule): deleting a department clears these
-- references in application code, inside the same transaction as the delete.
ALTER TABLE member ADD COLUMN IF NOT EXISTS department_id UUID;
ALTER TABLE project ADD COLUMN IF NOT EXISTS department_id UUID;

-- Stable, human-readable key for the projects the server creates per department
-- (for example the department inbox project). NULL for every existing project:
-- nothing backfills, so no row changes meaning in this migration.
ALTER TABLE project ADD COLUMN IF NOT EXISTS system_key TEXT;

ALTER TABLE knowledge_spaces ADD COLUMN IF NOT EXISTS department_id UUID;

-- The department an invitation will land the invitee in. Read when the
-- invitation is accepted and written to member.department_id; NULL keeps the
-- current behaviour of joining with no department.
ALTER TABLE workspace_invitation ADD COLUMN IF NOT EXISTS department_id UUID;
